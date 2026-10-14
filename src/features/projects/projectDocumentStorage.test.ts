import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import {
  createProjectDocumentBundle,
  createProjectDocumentAccessUrl,
  PROJECT_ATTACHMENT_MAX_BYTES,
  storeGeneratedProjectDocument,
  storeOperationDocument,
  storeProjectAttachment,
} from './projectDocumentStorage';

vi.mock('./projectDriveStorage', () => ({ projectDriveStorage: (client: { storage: { from: (bucket: string) => unknown } }, bucket: string) => client.storage.from(bucket) }));

describe('projectDocumentStorage', () => {
  it('creates a ZIP containing the issued document and every private project attachment', async () => {
    const download = vi.fn()
      .mockResolvedValueOnce({ data: new Blob(['attestation']), error: null })
      .mockResolvedValueOnce({ data: new Blob(['procedure']), error: null });
    const client = { storage: { from: vi.fn(() => ({ download })) } };

    const bundle = await createProjectDocumentBundle(client as never, {
      attachments: [
        {
          fileName: 'Attestation Expert BV.pdf',
          storageBucket: 'project-files',
          storagePath: 'projects/144/attachments/attestation.pdf',
        },
        {
          fileName: 'Procédure travaux.pdf',
          storageBucket: 'project-files',
          storagePath: 'projects/144/attachments/procedure.pdf',
        },
      ],
      document: {
        blob: new Blob(['offre'], { type: 'application/pdf' }),
        fileName: 'P144 - Offre - R1.pdf',
        mimeType: 'application/pdf',
      },
    });

    const archive = await JSZip.loadAsync(await bundle.blob.arrayBuffer());
    expect(Object.keys(archive.files)).toEqual(expect.arrayContaining([
      'Document/P144 - Offre - R1.pdf',
      'Pièces jointes/01 - Attestation Expert BV.pdf',
      'Pièces jointes/02 - Procédure travaux.pdf',
    ]));
    expect(bundle).toMatchObject({
      fileName: 'P144 - Offre - R1 - avec pièces jointes.zip',
      mimeType: 'application/zip',
    });
    expect(download).toHaveBeenNthCalledWith(1, 'projects/144/attachments/attestation.pdf');
    expect(download).toHaveBeenNthCalledWith(2, 'projects/144/attachments/procedure.pdf');
  });

  it('keeps generated document registration and logical addresses stable through the storage adapter', async () => {
    const upload = vi.fn().mockResolvedValue({ data: { path: 'stored' }, error: null });
    const remove = vi.fn().mockResolvedValue({ data: [], error: null });
    const rpc = vi.fn().mockResolvedValue({ data: 91, error: null });
    const functionsInvoke = vi.fn();
    const client = {
      functions: { invoke: functionsInvoke },
      rpc,
      storage: { from: vi.fn(() => ({ remove, upload })) },
    };
    const blob = new Blob(['offre'], { type: 'application/pdf' });

    const stored = await storeGeneratedProjectDocument(client as never, {
      document: { blob, fileName: 'Offre P144.pdf', mimeType: 'application/pdf' },
      documentType: 'offer',
      projectId: 144,
      revision: 2,
    });

    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(/^projects\/144\/generated\/offer\/r2\/.+-Offre-P144\.pdf$/),
      blob,
      expect.objectContaining({ contentType: 'application/pdf', upsert: false }),
    );
    expect(rpc).toHaveBeenCalledWith('projects_register_generated_storage_document', expect.objectContaining({
      target_document_type: 'offer',
      target_project_id: 144,
      target_revision: 2,
    }));
    expect(functionsInvoke).not.toHaveBeenCalled();
    expect(stored).toMatchObject({ id: 91, storageBucket: 'project-files', webUrl: '' });
  });

  it('stores operation attachments in the project Storage tree', async () => {
    const upload = vi.fn().mockResolvedValue({ data: { path: 'stored' }, error: null });
    const remove = vi.fn().mockResolvedValue({ data: [], error: null });
    const rpc = vi.fn().mockResolvedValue({ data: 92, error: null });
    const client = { rpc, storage: { from: vi.fn(() => ({ remove, upload })) } };
    const file = new File(['rapport'], 'Rapport mer.pdf', { type: 'application/pdf' });

    const stored = await storeOperationDocument(client as never, {
      file,
      planningOccurrenceId: 88,
      projectId: 144,
    });

    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(/^projects\/144\/operations\/88\/.+-Rapport-mer\.pdf$/),
      file,
      expect.objectContaining({ contentType: 'application/pdf', upsert: false }),
    );
    expect(rpc).toHaveBeenCalledWith('projects_register_generated_storage_document', expect.objectContaining({
      target_document_type: 'operation_attachment',
      target_planning_occurrence_id: 88,
      target_project_id: 144,
    }));
    expect(stored).toMatchObject({ id: 92, storageBucket: 'project-files', webUrl: '' });
  });

  it('registers categorized attachments after the storage adapter confirms upload', async () => {
    const upload = vi.fn().mockResolvedValue({ data: { path: 'stored' }, error: null });
    const remove = vi.fn().mockResolvedValue({ data: [], error: null });
    const rpc = vi.fn().mockResolvedValue({ data: 73, error: null });
    const client = {
      rpc,
      storage: { from: vi.fn(() => ({ remove, upload })) },
    };
    const file = new File(['attestation'], 'Attestation Expert BV.pdf', { type: 'application/pdf' });

    const stored = await storeProjectAttachment(client as never, {
      draft: {
        categoryKey: 'toilette_de_mer',
        expiresOn: '2027-08-29',
        file,
        id: 'draft-1',
        subcategoryKey: 'toilette_de_mer_attestation_expert_bv',
      },
      projectId: 144,
    });

    expect(client.storage.from).toHaveBeenCalledWith('project-files');
    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(/^projects\/144\/attachments\/toilette_de_mer\/toilette_de_mer_attestation_expert_bv\/.+-Attestation-Expert-BV\.pdf$/),
      file,
      expect.objectContaining({ contentType: 'application/pdf', upsert: false }),
    );
    expect(rpc).toHaveBeenCalledWith('projects_register_storage_attachment', expect.objectContaining({
      target_bucket: 'project-files',
      target_category_key: 'toilette_de_mer',
      target_expires_on: '2027-08-29',
      target_file_name: 'Attestation Expert BV.pdf',
      target_project_id: 144,
      target_subcategory_key: 'toilette_de_mer_attestation_expert_bv',
    }));
    expect(stored).toMatchObject({
      id: 73,
      storageBucket: 'project-files',
      storagePath: expect.stringContaining('projects/144/attachments/'),
      webUrl: '',
    });
    expect(remove).not.toHaveBeenCalled();
  });

  it('creates a temporary signed URL for a private project attachment', async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({
      data: { signedUrl: 'https://storage.example/signed' },
      error: null,
    });
    const client = { storage: { from: vi.fn(() => ({ createSignedUrl })) } };

    await expect(createProjectDocumentAccessUrl(client as never, {
      storageBucket: 'project-files',
      storagePath: 'projects/144/attachments/file.pdf',
    })).resolves.toBe('https://storage.example/signed');
    expect(createSignedUrl).toHaveBeenCalledWith('projects/144/attachments/file.pdf', 300);
  });

  it('preserves PDF preview metadata when a mobile file has no MIME type', async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const rpc = vi.fn().mockResolvedValue({ data: 93, error: null });
    const client = { rpc, storage: { from: vi.fn(() => ({ upload })) } };
    await storeProjectAttachment(client as never, { projectId: 144,
      draft: { id: 'mobile', categoryKey: 'hse', subcategoryKey: null, expiresOn: '', file: new File(['%PDF'], 'Plan.PDF') } });
    expect(upload).toHaveBeenCalledWith(expect.any(String), expect.any(File), expect.objectContaining({ contentType: 'application/pdf' }));
    expect(rpc).toHaveBeenCalledWith('projects_register_storage_attachment', expect.objectContaining({ target_mime_type: 'application/pdf' }));
  });

  it('rejects files above the existing project limit before reading or sending their bytes', async () => {
    const file = new File(['%PDF'], 'Trop grand.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'size', { value: PROJECT_ATTACHMENT_MAX_BYTES + 1 });
    const read = vi.spyOn(file, 'arrayBuffer');
    const client = { rpc: vi.fn(), storage: { from: vi.fn() } };
    await expect(storeProjectAttachment(client as never, { projectId: 144,
      draft: { id: 'large', categoryKey: 'hse', subcategoryKey: null, expiresOn: '', file } })).rejects.toThrow('50 Mo maximum');
    expect(read).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalled();
    expect(client.storage.from).not.toHaveBeenCalled();
  });

  it('recovers a lost registration response by reading the exact immutable attachment', async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const remove = vi.fn();
    let registered: Record<string, unknown> | null = null;
    const rpc = vi.fn().mockImplementation(async (_name, args) => {
      registered = { id: 94, project_id: args.target_project_id, document_type: 'project_attachment',
        storage_bucket: args.target_bucket, storage_path: args.target_path, file_name: args.target_file_name,
        mime_type: args.target_mime_type, file_size_bytes: args.target_file_size_bytes, sha256: args.target_sha256,
        category_key: args.target_category_key, subcategory_key: args.target_subcategory_key, expires_on: args.target_expires_on };
      return { data: null, error: { message: 'Connection lost after commit' } };
    });
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn(async () => ({ data: registered, error: null })) };
    const from = vi.fn(() => query);
    const client = { rpc, from, storage: { from: vi.fn(() => ({ upload, remove })) } };
    const stored = await storeProjectAttachment(client as never, { projectId: 144,
      draft: { id: 'recover', categoryKey: 'hse', subcategoryKey: null, expiresOn: '', file: new File(['%PDF'], 'Plan.pdf', { type: 'application/pdf' }) } });
    expect(stored.id).toBe(94);
    expect(from).toHaveBeenCalledWith('project_generated_documents');
    expect(query.eq).toHaveBeenCalledWith('project_id', 144);
    expect(query.eq).toHaveBeenCalledWith('storage_path', stored.storagePath);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(remove).not.toHaveBeenCalled();
  });

  it('keeps the uploaded bytes when registration and its confirming read are unavailable', async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const remove = vi.fn();
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'Connection lost' } });
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: 'Read unavailable' } }) };
    const client = { rpc, from: vi.fn(() => query), storage: { from: vi.fn(() => ({ upload, remove })) } };
    await expect(storeProjectAttachment(client as never, { projectId: 144,
      draft: { id: 'unknown', categoryKey: 'hse', subcategoryKey: null, expiresOn: '', file: new File(['%PDF'], 'Plan.pdf', { type: 'application/pdf' }) } }))
      .rejects.toThrow('Vérifiez les documents du projet avant de relancer l’ajout.');
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(remove).not.toHaveBeenCalled();
  });
});
