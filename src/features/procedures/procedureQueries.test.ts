import { describe, expect, it, vi } from 'vitest';
import {
  buildProcedureDesktopUri,
  getProcedurePublicationDate,
  isProcedureNumberTaken,
  suggestNextProcedureNumber,
  updateProcedure,
  type ProcedureInput,
  type ProcedureRecord,
} from './procedureQueries';

function fileRecord(fileName: string, mimeType = ''): ProcedureRecord {
  return { fileName, mimeType } as ProcedureRecord;
}

describe('buildProcedureDesktopUri', () => {
  it.each([
    ['procedure.docx', '', 'ms-word'],
    ['modele.dotx', '', 'ms-word'],
    ['registre.xlsx', '', 'ms-excel'],
    ['support.pptx', '', 'ms-powerpoint'],
    ['document', 'application/vnd.oasis.opendocument.text', 'ms-word'],
    ['document', 'application/vnd.oasis.opendocument.spreadsheet', 'ms-excel'],
    ['document', 'application/vnd.oasis.opendocument.presentation', 'ms-powerpoint'],
  ])('opens %s with the installed %s application', (fileName, mimeType, scheme) => {
    expect(buildProcedureDesktopUri(fileRecord(fileName, mimeType), 'https://storage.test/file?token=signed'))
      .toBe(`${scheme}:ofv|u|https://storage.test/file?token=signed`);
  });

  it('keeps non-Office files on their signed URL', () => {
    expect(buildProcedureDesktopUri(fileRecord('procedure.pdf', 'application/pdf'), 'https://storage.test/file.pdf'))
      .toBe('https://storage.test/file.pdf');
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
