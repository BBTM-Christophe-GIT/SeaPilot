import { describe, expect, it, vi } from 'vitest';
import { disciplinaryDesktopUri, documentDrivePath, validateDisciplinaryPath, validateDriveUrl, writeDriveFile, type DriveDirectory } from './disciplinaryDrive';
import type { DisciplinaryCase } from './disciplinaryModel';

describe('private disciplinary Drive documents', () => {
  it.each(['../secret.docx', 'C:/private.pdf', 'x/evil.exe', 'NUL.txt', 'x/macro.docm', 'a//b.pdf', 'a/b.pdf:evil.exe', 'a/b.pdf.'])('rejects unsafe path %s', (path) => expect(() => validateDisciplinaryPath(path)).toThrow());
  it('creates a dated folder with a disambiguated collaborator identity and preserves extensions', () => {
    const path = documentDrivePath({ company_id: 2, person_id: 41, data: { employeeName: 'Élodie DURAND' } } as DisciplinaryCase, '2026-09-15', `${'Courrier'.repeat(30)}.docx`, 'abcde123-1234');
    expect(path).toContain('2/Élodie DURAND - 41/2026-09-15/abcde123 - '); expect(path).toMatch(/\.docx$/); expect(() => validateDisciplinaryPath(path)).not.toThrow();
    expect(disciplinaryDesktopUri(path)).toMatch(/^seapilot-drive:\/\/disciplinary\/open\/[A-Za-z0-9_-]+$/);
  });
  it.each(['javascript:alert(1)', 'https://drive.google.com.evil.test/file', 'https://user@drive.google.com/file', 'https://drive.google.com:444/file'])('rejects foreign or executable Drive links', (url) => expect(() => validateDriveUrl(url)).toThrow());
  it('writes and closes before verifying the local file, without replacing existing Office edits', async () => {
    const stream = { write: vi.fn(), close: vi.fn(), abort: vi.fn() };
    const file = new Blob(['courrier']);
    const handle = { createWritable: vi.fn().mockResolvedValue(stream), getFile: vi.fn().mockResolvedValue({ size: file.size }) };
    const getFileHandle = vi.fn().mockRejectedValueOnce(new DOMException('missing', 'NotFoundError')).mockResolvedValue(handle);
    const root = { name: 'Drive privé', getDirectoryHandle: vi.fn(), getFileHandle } as unknown as DriveDirectory;
    await writeDriveFile(root, 'courrier.docx', file);
    expect(stream.write).toHaveBeenCalledWith(file); expect(stream.close).toHaveBeenCalled(); expect(handle.getFile).toHaveBeenCalled();
    await expect(writeDriveFile(root, 'courrier.docx', file)).rejects.toThrow('existe déjà');
    expect(stream.write).toHaveBeenCalledTimes(1);
  });
});
