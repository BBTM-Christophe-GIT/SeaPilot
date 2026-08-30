import { describe, expect, it, vi } from 'vitest';
import {
  createProjectDocumentAccessUrl,
  storeGeneratedProjectDocument,
  storeOperationDocument,
  storeProjectAttachment,
} from './projectDocumentStorage';

describe('projectDocumentStorage', () => {
  it('stores generated documents in private Supabase Storage without invoking SharePoint', async () => {
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

  it('uploads categorized attachments to private Supabase Storage and registers their metadata', async () => {
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
});
