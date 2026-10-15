import { createHash, webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isProcedureOfficeDocument,
  createProcedure,
  fetchProceduresData,
  fetchProcedureVessels,
  getProcedurePublicationDate,
  getProcedureFileUrl,
  isProcedureNumberTaken,
  suggestNextProcedureNumber,
  updateProcedure,
  updateProcedureTags,
  publishProcedure,
  type ProcedureInput,
  type ProcedureRecord,
} from './procedureQueries';
afterEach(() => vi.unstubAllGlobals());

describe('procedure tags persistence', () => {
  const row = {
    id: 12, title: 'Consigne', status: 'published', tags: [' Sécurité ', 'sécurité', 'Incendie'],
    file_name: 'consigne.pdf', mime_type: 'application/pdf', procedure_id: 12,
  };
  const input: ProcedureInput = {
    procedureCode: '', title: 'Consigne', status: 'draft', revisionLabel: '', diffusionOn: '',
    categoryLabel: '', description: '', regulatoryRequirement: '', ismChapter: '08', vesselName: '', projectName: '',
    documentNumber: '01', restrictions: '', annualReview: false, theme: 'URG', documentType: '', bridgeWatch: false,
    versionLabel: 'A', notes: '', googleDriveUrl: 'https://drive.google.com/file/d/drive-id-123/view',
    googleDrivePath: 'URG/consigne.docx', tags: [' Sécurité ', 'sécurité', '', 'Incendie'],
  };

  it('fetches tags with sources and published PDFs, including documents without tags', async () => {
    const select = vi.fn((fields: string) => {
      expect(fields).toContain('tags');
      const query = {
        order: vi.fn(() => query), eq: vi.fn(() => query),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [row, { ...row, id: 13, tags: null }], error: null }).then(resolve),
      };
      return query;
    });
    const result = await fetchProceduresData({ from: () => ({ select }) } as never);
    expect(select.mock.calls.every(([fields]) => String(fields).includes('tags'))).toBe(true);
    expect(result.procedures.map((record) => record.tags)).toEqual([['Sécurité', 'Incendie'], []]);
    expect(result.publications.map((record) => record.tags)).toEqual([['Sécurité', 'Incendie'], []]);
  });

  it('stores normalized tags when creating a Drive-linked source', async () => {
    const insert = vi.fn(() => ({ select: () => ({ single: async () => ({ data: row, error: null }) }) }));
    const created = await createProcedure({ from: () => ({ insert }) } as never, input, null);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ tags: ['Sécurité', 'Incendie'] }));
    expect(created.tags).toEqual(['Sécurité', 'Incendie']);
  });

  it.each([
    [{ id: 12 }, 'procedures', 12],
    [{ id: 32, procedureId: 12 }, 'procedures', 12],
    [{ id: 32, procedureId: null }, 'published_procedures', 32],
  ])('updates the owning document for %j', async (record, table, id) => {
    const single = vi.fn().mockResolvedValue({ data: { id }, error: null });
    const select = vi.fn(() => ({ single }));
    const eq = vi.fn(() => ({ select }));
    const update = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ update }));
    await updateProcedureTags({ from } as never, record as ProcedureRecord, [' Sécurité ', 'sécurité', '']);
    expect(from).toHaveBeenCalledWith(table);
    expect(update).toHaveBeenCalledWith({ tags: ['Sécurité'] });
    expect(eq).toHaveBeenCalledWith('id', id);
    expect(single).toHaveBeenCalledOnce();
  });

  it('clears all tags and propagates rejected or invisible row updates', async () => {
    const update = vi.fn(() => ({ eq: () => ({ select: () => ({ single: async () => ({ data: null, error: new Error('Denied') }) }) }) }));
    await expect(updateProcedureTags({ from: () => ({ update }) } as never, { id: 12 } as ProcedureRecord, [])).rejects.toThrow('Denied');
    expect(update).toHaveBeenCalledWith({ tags: [] });
  });

  it('reserves a draft, uploads the exact converted PDF, then publishes inherited tags', async () => {
    vi.stubGlobal('crypto', webcrypto);
    const events: string[] = [];
    const rpc = vi.fn().mockImplementation(async (name: string) => {
      events.push(name);
      return { data: name === 'document_blob_lookup' ? null : { ...row, status: name === 'prepare_procedure_blob_publication' ? 'draft' : 'published' }, error: null };
    });
    const upload = vi.fn().mockImplementation(async () => { events.push('upload'); return { error: null }; });
    const read = vi.fn().mockResolvedValue(new Blob(['fixture'], { type: 'application/pdf' }));
    const result = await publishProcedure({ rpc, storage: { from: () => ({ upload }) } } as never, { id: 12 } as ProcedureRecord,
      { path: 'consigne.pdf', bytes: 7, sha256: createHash('sha256').update('fixture').digest('hex') }, read);
    expect(result.tags).toEqual(['Sécurité', 'Incendie']);
    expect(events).toEqual(['prepare_procedure_blob_publication', 'document_blob_lookup', 'upload', 'publish_procedure_blob']);
    expect(read).toHaveBeenCalledWith(expect.objectContaining({ id: 12, status: 'draft' }));
    expect(upload).toHaveBeenCalledWith('12', expect.any(Blob), { contentType: 'application/pdf', upsert: false, metadata: { publication_id: 12, file_name: 'consigne.pdf' } });
    expect(upload.mock.calls[0][1]).toMatchObject({ name: 'consigne.pdf', type: 'application/pdf' });
  });
  it.each(['changed bytes', 'failed upload'])('keeps a PDF pending when the transfer has %s', async failure => {
    vi.stubGlobal('crypto', webcrypto);
    const rpc = vi.fn().mockImplementation(async (name: string) => ({ data: name === 'document_blob_lookup' ? null : { ...row, status: 'draft' }, error: null }));
    const upload = vi.fn().mockResolvedValue({ error: new Error('Transfert refusé') });
    const read = vi.fn().mockResolvedValue(new Blob([failure === 'changed bytes' ? 'changed' : 'fixture']));
    await expect(publishProcedure({ rpc, storage: { from: () => ({ upload }) } } as never, { id: 12 } as ProcedureRecord,
      { path: 'consigne.pdf', bytes: 7, sha256: createHash('sha256').update('fixture').digest('hex') }, read)).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalledWith('publish_procedure_blob', expect.anything());
    if (failure === 'changed bytes') expect(upload).not.toHaveBeenCalled();
  });
  it('retries activation of an already verified PDF without overwriting the Blob', async () => {
    const mapping = { blob_pathname: 'documents/pending.pdf', bytes: 7, sha256: 'a'.repeat(64), file_name: 'consigne.pdf', mime_type: 'application/pdf' };
    const rpc = vi.fn().mockImplementation(async (name: string) => ({ data: name === 'document_blob_lookup' ? mapping : { ...row, status: name === 'prepare_procedure_blob_publication' ? 'draft' : 'published' }, error: null }));
    const from = vi.fn();
    const read = vi.fn();
    expect((await publishProcedure({ rpc, storage: { from } } as never, { id: 12 } as ProcedureRecord,
      { path: 'consigne.pdf', bytes: 7, sha256: 'a'.repeat(64) }, read)).status).toBe('published');
    expect(rpc).toHaveBeenCalledWith('publish_procedure_blob', { target_publication: 12 });
    expect(from).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });
});

describe('procedure fleet options', () => {
  it('queries the active fleet, removes empty names and excludes office and quay entries', async () => {
    const order = vi.fn().mockResolvedValue({ data: [{ name: 'LANDEMER' }, { name: 'GOURY' }, { name: 'GOURY' }, { name: 'YARD LE HAVRE' }, { name: 'BUREAU' }, { name: 'Agence', asset_kind: 'office' }, { name: ' ' }], error: null });
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    expect(await fetchProcedureVessels({ from } as never)).toEqual(['GOURY', 'LANDEMER']);
    expect(from).toHaveBeenCalledWith('vessels');
    expect(select).toHaveBeenCalledWith('name,asset_kind');
    expect(eq).toHaveBeenCalledWith('active', true);
  });
  it('propagates a fleet loading error instead of presenting it as an empty fleet', async () => {
    const error = new Error('Unavailable');
    const client = { from: () => ({ select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: null, error }) }) }) }) };
    await expect(fetchProcedureVessels(client as never)).rejects.toThrow('Unavailable');
  });
});

function fileRecord(fileName: string, mimeType = ''): ProcedureRecord {
  return { fileName, mimeType } as ProcedureRecord;
}

describe('procedure Office sources', () => {
  it.each([
    ['procedure.docx', ''],
    ['modele.dotx', ''],
    ['registre.xlsx', ''],
    ['support.pptx', ''],
    ['document', 'application/vnd.openxmlformats-officedocument.wordprocessingml.template'],
    ['document', 'application/vnd.oasis.opendocument.text'],
    ['document', 'application/vnd.oasis.opendocument.spreadsheet'],
    ['document', 'application/vnd.oasis.opendocument.presentation'],
  ])('recognizes %s (%s) for a named Office download', (fileName, mimeType) => {
    expect(isProcedureOfficeDocument(fileRecord(fileName, mimeType))).toBe(true);
  });

  it('keeps PDFs on their existing browser opening path', () => {
    expect(isProcedureOfficeDocument(fileRecord('procedure.pdf', 'application/pdf'))).toBe(false);
  });

  it.each([
    `https://storage.test/Trame%20de%20base.dotx?token=${'signed-token'.repeat(80)}&download=Trame%20de%20base.dotx`,
    'blob:https://seapilot.test/temporary-document',
  ])('preserves an adapter URL without wrapping it in an Office command', async signedUrl => {
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl }, error: null });
    const client = { storage: { from: vi.fn(() => ({ createSignedUrl })) } };
    const record = { ...fileRecord('Trame de base BBTM.dotx'), storageBucket: 'procedure-documents', storagePath: 'sources/template.dotx' };
    expect(await getProcedureFileUrl(client as never, record, 'open')).toBe(signedUrl);
    expect(createSignedUrl).toHaveBeenCalledWith('sources/template.dotx', 300, undefined);
  });

  it('preserves an external source URL without rewriting its signed query', async () => {
    const fileUrl = 'https://documents.test/template.dotx?signature=a%2Fb%3D&version=2';
    const client = { storage: { from: vi.fn() } };
    expect(await getProcedureFileUrl(client as never, { ...fileRecord('template.dotx'), fileUrl }, 'open')).toBe(fileUrl);
    expect(client.storage.from).not.toHaveBeenCalled();
  });
});

describe('procedure numbering', () => {
  const procedures = [
    { id: 1, theme: 'OPE', documentNumber: '01' },
    { id: 2, theme: 'OPE', documentNumber: '07.1' },
    { id: 3, theme: 'OPE', documentNumber: '18' },
    { id: 4, theme: 'URG', documentNumber: '09' },
  ] as ProcedureRecord[];

  it('proposes the integer immediately above the highest number for the selected theme', () => {
    expect(suggestNextProcedureNumber(procedures, 'OPE')).toBe('19');
    expect(suggestNextProcedureNumber(procedures, 'URG')).toBe('10');
    expect(suggestNextProcedureNumber(procedures, 'DNC')).toBe('01');
  });

  it('treats a dotted number as part of the unique Theme and Number combination', () => {
    expect(isProcedureNumberTaken(procedures, 'ope', '07.1')).toBe(true);
    expect(isProcedureNumberTaken(procedures, 'OPE', '07.2')).toBe(false);
    expect(isProcedureNumberTaken(procedures, 'OPE', '07.1', 2)).toBe(false);
  });
});

describe('procedure source replacement', () => {
  it('overwrites the existing Supabase object without deleting it first', async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const remove = vi.fn().mockResolvedValue({ error: null });
    const updatedRow = {
      id: 12, procedure_code: 'OPE 19-A', title: 'Procédure mise à jour', status: 'review', revision_label: 'A',
      published_on: null, source_label: 'seapilot', file_url: null, notes: null, category_label: null,
      diffusion_on: null, description: null, regulatory_requirement: null, ism_chapter: '07', vessel_name: null,
      project_name: null, document_number: '19', restrictions: null, annual_review: false, theme: 'OPE',
      document_type: null, bridge_watch: false, version_label: 'A', source_storage_bucket: 'procedure-documents',
      source_storage_path: 'sources/existing.docx', source_file_name: 'procedure-v2.docx',
      source_mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', source_size_bytes: 8,
    };
    const single = vi.fn().mockResolvedValue({ data: updatedRow, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const eq = vi.fn().mockReturnValue({ select });
    const update = vi.fn().mockReturnValue({ eq });
    const client = {
      from: vi.fn().mockReturnValue({ update }),
      storage: { from: vi.fn().mockReturnValue({ upload, remove }) },
    };
    const procedure = {
      id: 12, title: 'Procédure', storageBucket: 'procedure-documents', storagePath: 'sources/existing.docx',
      fileName: 'procedure.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    } as ProcedureRecord;
    const input = {
      procedureCode: 'OPE 19-A', title: 'Procédure mise à jour', status: 'review', revisionLabel: 'A', diffusionOn: '',
      categoryLabel: '', description: '', regulatoryRequirement: '', ismChapter: '07', vesselName: '', projectName: '',
      documentNumber: '19', restrictions: '', annualReview: false, theme: 'OPE', documentType: '', bridgeWatch: false,
      versionLabel: 'A', notes: '',
    } satisfies ProcedureInput;
    const replacement = new File(['version2'], 'procedure-v2.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    await updateProcedure(client as never, procedure, input, replacement);

    expect(upload).toHaveBeenCalledWith('sources/existing.docx', replacement, expect.objectContaining({
      cacheControl: '0', upsert: true,
    }));
    expect(remove).not.toHaveBeenCalled();
  });
});

describe('getProcedurePublicationDate', () => {
  it('uses the calendar day in Paris instead of the UTC day', () => {
    expect(getProcedurePublicationDate(new Date('2026-09-07T22:30:00.000Z'))).toBe('2026-09-08');
  });
});
