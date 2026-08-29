import { describe, expect, it, vi } from 'vitest';
import {
  createProjectDocumentAccessUrl,
  storeProjectAttachment,
} from './projectDocumentStorage';

describe('projectDocumentStorage', () => {
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
