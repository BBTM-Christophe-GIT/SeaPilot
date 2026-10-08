// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { projectDriveStorage } from '../projectDriveStorage';
import { createPreviewStorageClient } from './previewStorageClient';

describe('preview attachment exporter storage', () => {
  it('satisfies the real Drive receipt lookup and resolves its attachment entirely locally', async () => {
    const blob = new Blob(['local proof'], { type: 'application/pdf' });
    const resolve = vi.fn(async () => blob);
    const client = createPreviewStorageClient(resolve);
    const result = await projectDriveStorage(client, 'local-demo').download('26401');
    expect(result.error).toBeNull();
    expect(result.data).toBe(blob);
    expect(resolve).toHaveBeenCalledExactlyOnceWith('26401');
  });

  it('rejects unrelated database queries and non-demo storage addresses', () => {
    const client = createPreviewStorageClient(async () => new Blob());
    expect(() => client.from('projects')).toThrow('Requête interdite dans la préversion');
    expect(() => client.from('project_drive_files').select('*')).toThrow('Sélection inconnue');
    expect(() => client.from('project_drive_files').select('path,bytes,sha256,mime_type,drive_file_id').eq('project_id', 264)).toThrow('Filtre inconnu');
    expect(() => client.storage.from('project-files')).toThrow('Stockage inconnu');
  });

  it('propagates a missing local attachment instead of reaching another storage source', async () => {
    const resolve = vi.fn(async () => { throw new Error('Pièce locale absente'); });
    const client = createPreviewStorageClient(resolve);
    await expect(projectDriveStorage(client, 'local-demo').download('missing')).rejects.toThrow('Pièce locale absente');
    expect(resolve).toHaveBeenCalledExactlyOnceWith('missing');
  });
});
