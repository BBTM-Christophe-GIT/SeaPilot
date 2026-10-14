import { localDriveRequest } from '../documents/localDriveLauncher';
import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDisciplinaryDocumentUrl, disciplinaryDesktopUri, documentDrivePath, validateDisciplinaryPath, validateDriveUrl, writeDisciplinaryBlobFile, writeDriveFile } from './disciplinaryDrive';
import type { DisciplinaryCase, DisciplinaryDocument } from './disciplinaryModel';
import { hasDocumentBlobFile } from '../documents/documentBlobStorage';

vi.mock('../documents/localDriveLauncher', async (original) => ({ ...await original<typeof import('../documents/localDriveLauncher')>(), localDriveRequest: vi.fn() }));
vi.mock('../documents/documentBlobStorage', async original => ({ ...await original<typeof import('../documents/documentBlobStorage')>(), hasDocumentBlobFile: vi.fn() }));
beforeEach(() => { vi.mocked(hasDocumentBlobFile).mockReset().mockResolvedValue(false); vi.mocked(localDriveRequest).mockClear(); });

describe('private disciplinary Drive documents', () => {
  it.each(['../secret.docx', 'C:/private.pdf', 'x/evil.exe', 'NUL.txt', 'x/macro.docm', 'a//b.pdf', 'a/b.pdf:evil.exe', 'a/b.pdf.'])('rejects unsafe path %s', (path) => expect(() => validateDisciplinaryPath(path)).toThrow());
  it('creates a dated folder with a disambiguated collaborator identity and preserves extensions', () => {
    const path = documentDrivePath({ company_id: 2, person_id: 41, data: { employeeName: 'Élodie DURAND' } } as DisciplinaryCase, '2026-09-15', `${'Courrier'.repeat(30)}.docx`, 'abcde123-1234');
    expect(path).toContain('Élodie DURAND - c2-p41/2026-09-15/abcde123 - '); expect(path).toMatch(/\.docx$/); expect(() => validateDisciplinaryPath(path)).not.toThrow();
    expect(disciplinaryDesktopUri(path)).toMatch(/^seapilot-drive:\/\/root\/open\/[A-Za-z0-9_-]+$/);
  });
  it.each(['javascript:alert(1)', 'https://drive.google.com.evil.test/file', 'https://user@drive.google.com/file', 'https://drive.google.com:444/file'])('rejects foreign or executable Drive links', (url) => expect(() => validateDriveUrl(url)).toThrow());
  it('verifies the native acknowledgement and propagates an existing-file refusal', async () => {
    const file = new Blob(['courrier']);
    const client = {} as SupabaseClient, connection = { url: 'http://127.0.0.1:50000/test', expiresAt: 123 };
    const record = { company_id: 2, person_id: 41 } as DisciplinaryCase;
    vi.mocked(localDriveRequest).mockResolvedValueOnce({ path: 'person/date/courrier.docx', bytes: file.size });
    await writeDriveFile(client, connection, record, 'person/date/courrier.docx', file);
    expect(localDriveRequest).toHaveBeenCalledWith(client, connection, expect.objectContaining({ action: 'write', companyId: 2, personId: 41, base64: btoa('courrier') }));
    vi.mocked(localDriveRequest).mockRejectedValueOnce(new Error('Ce fichier existe déjà.'));
    await expect(writeDriveFile(client, connection, record, 'person/date/courrier.docx', file)).rejects.toThrow('existe déjà');
  });
  it.each(['docx', 'pdf', 'xlsx', 'txt'])('uploads %s in the saved case scope without the native bridge', async extension => {
    const record = { id: '00000000-0000-4000-8000-000000000001' } as DisciplinaryCase;
    const id = '00000000-0000-4000-8000-000000000002';
    const upload = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ upload }));
    await writeDisciplinaryBlobFile({ storage: { from } } as never, record, id, `person/date/file.${extension}`, new Blob(['document']));
    expect(from).toHaveBeenCalledWith('disciplinary-drive');
    expect(upload).toHaveBeenCalledWith(id, expect.any(File), expect.objectContaining({ upsert: false, metadata: { case_id: record.id, file_name: `file.${extension}` } }));
    expect(upload.mock.calls[0][1].name).toBe(`file.${extension}`);
    expect(await upload.mock.calls[0][1].text()).toBe('document');
    expect(localDriveRequest).not.toHaveBeenCalled();
  });
  it('opens a migrated document with a fresh URL at every click', async () => {
    vi.mocked(hasDocumentBlobFile).mockResolvedValue(true);
    const createSignedUrl = vi.fn().mockResolvedValueOnce({ data: { signedUrl: 'https://example/fresh1' }, error: null })
      .mockResolvedValueOnce({ data: { signedUrl: 'https://example/fresh2' }, error: null });
    const document = { id: 'registered-id', drive_path: 'person/date/older.docx', drive_url: 'https://drive.google.com/older' } as DisciplinaryDocument;
    const client = { storage: { from: () => ({ createSignedUrl }) } };
    expect(await createDisciplinaryDocumentUrl(client as never, document)).toBe('https://example/fresh1');
    expect(await createDisciplinaryDocumentUrl(client as never, document)).toBe('https://example/fresh2');
    expect(createSignedUrl).toHaveBeenCalledTimes(2);
    expect(createSignedUrl).toHaveBeenLastCalledWith('registered-id', 120);
  });
  it('keeps an unmapped native or external document accessible through its retained reference', async () => {
    const document = { id: 'registered-id', drive_path: 'person/date/file.docx', drive_url: '' } as DisciplinaryDocument;
    const result = vi.fn().mockResolvedValueOnce({ data: document, error: null })
      .mockResolvedValueOnce({ data: { ...document, drive_url: 'https://drive.google.com/private-file' }, error: null });
    const client = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: result }) }) }) };
    expect(await createDisciplinaryDocumentUrl(client as never, document)).toMatch(/^seapilot-drive:/);
    expect(await createDisciplinaryDocumentUrl(client as never, document)).toBe('https://drive.google.com/private-file');
  });
  it('rechecks legacy row visibility before opening a retained desktop path', async () => {
    const client = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) };
    await expect(createDisciplinaryDocumentUrl(client as never, { id: 'old-visible-id', drive_path: 'person/date/file.docx' } as DisciplinaryDocument)).rejects.toThrow('inaccessible');
  });
  it('never substitutes a retained Drive link after a Blob refusal or failed URL', async () => {
    const denied = { code: '42501', message: 'Document inaccessible' };
    const document = { id: 'registered-id', drive_path: 'person/date/file.docx', drive_url: 'https://drive.google.com/older' } as DisciplinaryDocument;
    vi.mocked(hasDocumentBlobFile).mockRejectedValueOnce(denied);
    await expect(createDisciplinaryDocumentUrl({} as never, document)).rejects.toBe(denied);
    vi.mocked(hasDocumentBlobFile).mockResolvedValue(true);
    await expect(createDisciplinaryDocumentUrl({ storage: { from: () => ({ createSignedUrl: async () => ({ data: null, error: denied }) }) } } as never, document)).rejects.toBe(denied);
  });
});
