import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { savePersonPhoto, removePersonPhoto } from './personPhotos';
import { createHrDocument, type PersonRecord } from './peopleQueries';
import { connectHrDrive } from './hrDocumentDrive';
import { preparePortrait, loadPeoplePortraits, validatePortrait } from './portraitMedia';

vi.mock('./hrDocumentDrive', () => ({ connectHrDrive: vi.fn().mockResolvedValue({}), writeHrDriveFile: vi.fn(), readHrDriveFile: vi.fn() }));
vi.mock('./peopleQueries', () => ({ createHrDocument: vi.fn().mockResolvedValue({ id: 44, drivePath: 'Alex MARTIN/photo.jpg' }) }));
vi.mock('./portraitMedia', async () => ({ ...await vi.importActual<typeof import('./portraitMedia')>('./portraitMedia'), preparePortrait: vi.fn().mockResolvedValue(new Blob(['thumbnail'], { type: 'image/jpeg' })) }));
const person = { id: 17, firstName: 'Alex', lastName: 'MARTIN', photoPath: '17/old.jpg' } as PersonRecord;
const file = new File(['original'], 'portrait.jpg', { type: 'image/jpeg' });
function setup(error: unknown = null) {
  const single = vi.fn().mockResolvedValue({ data: { id: 17 }, error });
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) }) });
  const upload = vi.fn().mockResolvedValue({ error: null });
  const remove = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn().mockReturnValue({ update });
  const storage = vi.fn().mockReturnValue({ upload, remove });
  return { client: { from, storage: { from: storage } } as unknown as SupabaseClient, single, update, upload, remove, storage };
}
afterEach(() => vi.clearAllMocks());
describe('person portraits', () => {
  it('stores the original in the collaborator Drive folder before registering a private thumbnail', async () => {
    const { client, update, upload, remove, storage } = setup();
    const result = await savePersonPhoto(client, person, file);
    expect(connectHrDrive).toHaveBeenCalled();
    expect(createHrDocument).toHaveBeenCalledWith(client, expect.objectContaining({ person, file, documentType: expect.objectContaining({ categoryKey: 'administrative', fileName: 'Photo' }) }));
    expect(vi.mocked(createHrDocument).mock.invocationCallOrder[0]).toBeLessThan(upload.mock.invocationCallOrder[0]);
    expect(upload.mock.invocationCallOrder[0]).toBeLessThan(update.mock.invocationCallOrder[0]);
    expect(storage).toHaveBeenCalledWith('hr-portraits');
    expect(result.photoPath).toMatch(/^17\/[a-f0-9-]+\.jpg$/);
    expect(update).toHaveBeenCalledWith({ photo_document_id: 44, photo_storage_path: result.photoPath });
    expect(result.photoUrl).toMatch(/^data:image\/jpeg;base64,/);
    expect(remove).toHaveBeenCalledWith(['17/old.jpg']);
  });
  it('keeps the previous portrait on metadata failure and only cleans up the newly uploaded thumbnail', async () => {
    const { client, upload, remove } = setup({ message: 'denied' });
    await expect(savePersonPhoto(client, person, file)).rejects.toThrow('conservée dans le dossier RH');
    expect(remove).toHaveBeenCalledWith([upload.mock.calls[0][0]]);
    expect(remove).not.toHaveBeenCalledWith(['17/old.jpg']);
  });
  it('does not upload a thumbnail when the original cannot be archived', async () => {
    vi.mocked(createHrDocument).mockRejectedValueOnce(new Error('Drive indisponible'));
    const { client, upload, update } = setup();
    await expect(savePersonPhoto(client, person, file)).rejects.toThrow('Drive indisponible');
    expect(upload).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
  });
  it('rejects unsupported formats and oversized originals before opening the launcher', async () => {
    const { client } = setup();
    await expect(savePersonPhoto(client, person, new File(['bad'], 'photo.svg', { type: 'image/svg+xml' }))).rejects.toThrow('JPEG ou PNG');
    expect(connectHrDrive).not.toHaveBeenCalled(); expect(preparePortrait).not.toHaveBeenCalled();
    const big = new File(['x'], 'big.png', { type: 'image/png' }); Object.defineProperty(big, 'size', { value: 6 * 1024 * 1024 });
    expect(() => validatePortrait(big)).toThrow('5 Mo');
  });
  it('removes the profile reference before deleting its thumbnail, preserving its Drive document', async () => {
    const { client, update, remove } = setup(); await removePersonPhoto(client, person);
    expect(update).toHaveBeenCalledWith({ photo_document_id: null, photo_storage_path: null });
    expect(remove).toHaveBeenCalledWith(['17/old.jpg']);
    expect(update.mock.invocationCallOrder[0]).toBeLessThan(remove.mock.invocationCallOrder[0]);
  });
  it('loads authorized private photos and reports unavailable photos without hiding people', async () => {
    const download = vi.fn().mockResolvedValueOnce({ data: new Blob(['image'], { type: 'image/jpeg' }), error: null }).mockResolvedValueOnce({ data: null, error: {} });
    const client = { storage: { from: () => ({ download }) } } as unknown as SupabaseClient;
    const people = await loadPeoplePortraits(client, [{ photoPath: '1/a.jpg' }, { photoPath: '2/b.jpg' }, {}]);
    expect(people).toEqual([expect.objectContaining({ photoUrl: expect.stringMatching(/^data:image\/jpeg/) }), expect.objectContaining({ photoUnavailable: true }), {}]);
    expect(download).toHaveBeenCalledTimes(2);
  });
});
