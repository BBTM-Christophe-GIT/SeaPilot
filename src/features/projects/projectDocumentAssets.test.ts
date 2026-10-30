import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadProjectFiles, loadProjectDocumentBlob, ProjectDocumentDownloadError, type ProjectDownloadItem } from './projectDocumentAssets';

const mocks = vi.hoisted(() => ({ storage: vi.fn(), download: vi.fn() }));
vi.mock('./projectDriveStorage', () => ({ projectDriveStorage: mocks.storage }));
const client = {} as never;
const file = { fileName: 'Rapport signé.pdf', storageBucket: 'project-files', storagePath: 'projects/880/attachments/report.pdf' };
const legacyUrl = 'https://bbtm668.sharepoint.com/sites/QHSE/Documents%20Projets/rapport.pdf';
const created = vi.fn<(blob: Blob) => string>(() => 'blob:https://seapilot.example/download');
const revoked = vi.fn();
const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL;
let clicked: Array<{ fileName: string; href: string }>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  mocks.storage.mockReturnValue({ download: mocks.download });
  mocks.download.mockResolvedValue({ data: new Blob(['document'], { type: 'application/pdf' }), error: null });
  URL.createObjectURL = created; URL.revokeObjectURL = revoked;
  clicked = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push({ fileName: this.download, href: this.href });
  });
});
afterEach(() => {
  vi.runOnlyPendingTimers(); vi.useRealTimers(); vi.restoreAllMocks();
  URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke;
});

describe('private project file reads', () => {
  it('reuses the authorized storage adapter and passes cancellation without launching the desktop connector', async () => {
    const controller = new AbortController();
    const blob = await loadProjectDocumentBlob(client, file, controller.signal);
    expect(await blob.text()).toBe('document');
    expect(mocks.storage).toHaveBeenCalledExactlyOnceWith(client, 'project-files');
    expect(mocks.download).toHaveBeenCalledExactlyOnceWith(file.storagePath, controller.signal, { allowLocalDrive: false });
  });

  it('resolves a valid historical URL only through its private mapping route', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    await loadProjectDocumentBlob(client, { fileName: 'Historique.pdf', sharePointWebUrl: legacyUrl });
    expect(mocks.storage).toHaveBeenCalledWith(client, 'sharepoint');
    expect(mocks.download).toHaveBeenCalledWith(legacyUrl, undefined, { allowLocalDrive: false });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['javascript:alert(1)', 'https://evil.example/file.pdf', 'https://bbtm668.sharepoint.com/other/file.pdf'])('rejects an untrusted legacy URL %s before any private read', async sharePointWebUrl => {
    await expect(loadProjectDocumentBlob(client, { fileName: 'fichier.pdf', sharePointWebUrl })).rejects.toThrow('non autorisée');
    expect(mocks.storage).not.toHaveBeenCalled();
  });

  it('reports missing locations and never replaces an access refusal with a historical source', async () => {
    await expect(loadProjectDocumentBlob(client, { fileName: 'absent.pdf' })).rejects.toThrow('aucune copie privée');
    mocks.download.mockResolvedValue({ data: null, error: { code: '42501', message: 'Ce document est interdit pour ce compte.' } });
    await expect(loadProjectDocumentBlob(client, { ...file, sharePointWebUrl: legacyUrl })).rejects.toThrow('interdit pour ce compte');
    expect(mocks.storage).toHaveBeenCalledExactlyOnceWith(client, 'project-files');
    expect(mocks.download).toHaveBeenCalledTimes(1);
  });

  it('rejects empty payloads and infers the MIME only when the returned private blob has none', async () => {
    mocks.download.mockResolvedValueOnce({ data: new Blob(), error: null });
    await expect(loadProjectDocumentBlob(client, file)).rejects.toThrow('vide ou incomplet');
    mocks.download.mockResolvedValueOnce({ data: new Blob(['pdf']), error: null });
    expect((await loadProjectDocumentBlob(client, file)).type).toBe('application/pdf');
  });

  it('does not read after cancellation and rejects promptly when a pending provider ignores cancellation', async () => {
    const aborted = new AbortController(); aborted.abort();
    await expect(loadProjectDocumentBlob(client, file, aborted.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(mocks.download).not.toHaveBeenCalled();
    const controller = new AbortController();
    let resolve!: (result: { data: Blob; error: null }) => void;
    mocks.download.mockReturnValue(new Promise(value => { resolve = value; }));
    const pending = loadProjectDocumentBlob(client, file, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    resolve({ data: new Blob(['late']), error: null });
    expect(created).not.toHaveBeenCalled();
  });
});

describe('project document downloads', () => {
  it('saves one original file and releases the temporary browser URL and anchor', async () => {
    const blob = new Blob(['original'], { type: 'application/pdf' });
    mocks.download.mockResolvedValue({ data: blob, error: null });
    await expect(downloadProjectFiles(client, [{ id: 'generated:7', file }], 'Sélection')).resolves.toEqual({ fileName: file.fileName, count: 1 });
    expect(created).toHaveBeenCalledExactlyOnceWith(blob);
    expect(clicked).toEqual([{ fileName: file.fileName, href: 'blob:https://seapilot.example/download' }]);
    expect(document.querySelector('a[download]')).toBeNull();
    expect(mocks.download).toHaveBeenCalledWith(file.storagePath, undefined, { allowLocalDrive: true });
    vi.advanceTimersByTime(1000);
    expect(revoked).toHaveBeenCalledExactlyOnceWith('blob:https://seapilot.example/download');
  });

  it('creates a complete ZIP with distinct names and original bytes when filenames collide across sources', async () => {
    const names = ['rapport.pdf', 'rapport.pdf', 'Rapport.pdf', '../pièce?.pdf'];
    const items: ProjectDownloadItem[] = names.map((fileName, index) => ({ id: `${index}:7`, file: { ...file, fileName, storagePath: `document-${index}` } }));
    mocks.download.mockImplementation(async (path: string) => ({ data: new Blob([path], { type: 'application/pdf' }), error: null }));
    await expect(downloadProjectFiles(client, items, 'Projet/P144.zip')).resolves.toEqual({ fileName: 'Projet-P144.zip', count: 4 });
    const zip = await JSZip.loadAsync(await created.mock.calls[0][0].arrayBuffer());
    expect(Object.keys(zip.files)).toEqual(['rapport.pdf', 'rapport (2).pdf', 'Rapport (3).pdf', '..-pièce-.pdf']);
    for (const [index, name] of Object.keys(zip.files).entries()) expect(await zip.file(name)!.async('string')).toBe(`document-${index}`);
    expect(clicked[0].fileName).toBe('Projet-P144.zip');
  });

  it('reports every unreadable file and never downloads a misleading partial archive', async () => {
    const items = ['ok.pdf', 'interdit.pdf', 'absent.pdf'].map((fileName, index) => ({ id: `generated:${index}`, file: { ...file, fileName, storagePath: fileName } }));
    mocks.download.mockImplementation(async (path: string) => path === 'ok.pdf'
      ? { data: new Blob(['ok']), error: null } : { data: null, error: new Error(path === 'interdit.pdf' ? 'Accès refusé' : 'Copie indisponible') });
    const failure = await downloadProjectFiles(client, items, 'Documents').catch(error => error);
    expect(failure).toBeInstanceOf(ProjectDocumentDownloadError);
    expect(failure.failures).toEqual([
      { id: 'generated:1', fileName: 'interdit.pdf', message: 'Accès refusé' },
      { id: 'generated:2', fileName: 'absent.pdf', message: 'Copie indisponible' },
    ]);
    expect(failure.message).toContain('Téléchargement annulé : 2 documents indisponibles');
    expect(mocks.download).toHaveBeenCalledTimes(3);
    expect(created).not.toHaveBeenCalled();
    expect(clicked).toEqual([]);
  });

  it('limits simultaneous private reads while still including every selected file', async () => {
    let active = 0, peak = 0;
    mocks.download.mockImplementation(async () => {
      peak = Math.max(peak, ++active);
      await Promise.resolve(); active -= 1;
      return { data: new Blob(['ok']), error: null };
    });
    const items = Array.from({ length: 8 }, (_, index) => ({ id: String(index), file: { ...file, fileName: `Pièce ${index}.pdf` } }));
    expect((await downloadProjectFiles(client, items, 'Pièces')).count).toBe(8);
    expect(peak).toBe(3);
    expect(mocks.download).toHaveBeenCalledTimes(8);
  });

  it('does not create downloads for an empty selection or a cancelled batch', async () => {
    await expect(downloadProjectFiles(client, [], 'Documents')).rejects.toThrow('Sélectionnez');
    const controller = new AbortController();
    mocks.download.mockImplementation(async () => { controller.abort(); return { data: new Blob(['late']), error: null }; });
    await expect(downloadProjectFiles(client, [{ id: '7', file }], 'Documents', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(created).not.toHaveBeenCalled();
  });

  it('cleans up its object URL even if the browser rejects initiating the download', async () => {
    vi.mocked(HTMLAnchorElement.prototype.click).mockImplementation(() => { throw new Error('Téléchargement bloqué'); });
    await expect(downloadProjectFiles(client, [{ id: '7', file }], 'Documents')).rejects.toThrow('Téléchargement bloqué');
    expect(document.querySelector('a[download]')).toBeNull();
    vi.advanceTimersByTime(1000);
    expect(revoked).toHaveBeenCalledOnce();
  });
});
