import { localDriveRequest } from '../documents/localDriveLauncher';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { disciplinaryDesktopUri, documentDrivePath, validateDisciplinaryPath, validateDriveUrl, writeDriveFile } from './disciplinaryDrive';
import type { DisciplinaryCase } from './disciplinaryModel';

vi.mock('../documents/localDriveLauncher', async (original) => ({ ...await original<typeof import('../documents/localDriveLauncher')>(), localDriveRequest: vi.fn() }));

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
});
