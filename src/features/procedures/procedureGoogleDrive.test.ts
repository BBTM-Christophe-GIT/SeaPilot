import { describe, expect, it, vi } from 'vitest';
import { buildGoogleDriveDesktopUri, parseProcedureDriveLink, validateDriveRelativePath } from './procedureGoogleDrive';
import { getProcedureFileUrl, updateProcedure, type ProcedureInput, type ProcedureRecord } from './procedureQueries';

const id = '1abcdefghijklmnopqrstuv';
const url = `https://drive.google.com/file/d/${id}/view`;

describe('Google Drive source links', () => {
  it('accepts a private Drive link and normalizes the Windows relative path', () => {
    expect(parseProcedureDriveLink(`${url}?usp=sharing`, 'URG\\Procédure bord.docx'))
      .toEqual({ fileId: id, relativePath: 'URG/Procédure bord.docx' });
    expect(parseProcedureDriveLink(`https://drive.google.com/open?id=${id}`, 'registre.xlsx').fileId).toBe(id);
    expect(parseProcedureDriveLink(`https://docs.google.com/document/d/${id}/edit?rtpof=true`, 'procedure.docx').fileId).toBe(id);
    expect(parseProcedureDriveLink(`https://docs.google.com/spreadsheets/d/${id}/edit`, 'registre.xlsx').fileId).toBe(id);
  });

  it.each(['https://evil.test/file/d/1234567890/view', `https://drive.google.com.evil.test/file/d/${id}/view`,
    `http://drive.google.com/file/d/${id}/view`, `https://user@drive.google.com/file/d/${id}/view`,
    `https://drive.google.com:444/file/d/${id}/view`, `https://drive.google.com/drive/folders/${id}`])(
    'rejects an invalid file URL: %s', (value) => {
    expect(() => parseProcedureDriveLink(value, 'file.docx')).toThrow();
  });

  it.each(['../file.docx', 'URG/../../file.docx', 'C:\\file.docx', '\\\\server\\file.docx', '/file.docx',
    'file.docx:evil.exe', 'URG//file.docx', 'URG./file.docx', 'NUL.docx', 'file.exe', 'file.docm', 'x\n.docx'])(
    'rejects an unsafe native path: %s', (path) => {
    expect(() => validateDriveRelativePath(path)).toThrow();
  });

  it('encodes accents without putting executable shell text in the protocol', () => {
    const path = 'URG/Procédure été (1).docx';
    const uri = buildGoogleDriveDesktopUri(path);
    expect(uri).toMatch(/^seapilot-drive:\/\/open\/[A-Za-z0-9_-]+$/);
    const payload = uri.split('/').pop()!.replace(/-/g, '+').replace(/_/g, '/');
    expect(new TextDecoder().decode(Uint8Array.from(atob(payload), (ch) => ch.charCodeAt(0)))).toBe(path);
  });

  it('opens and downloads the current Drive source instead of its Supabase backup', async () => {
    const client = { storage: { from: vi.fn() } };
    const record = { googleDriveFileId: id, googleDrivePath: 'test.docx', storageBucket: 'procedure-documents',
      storagePath: 'sources/old.docx' } as ProcedureRecord;
    expect(await getProcedureFileUrl(client as never, record, 'open')).toBe(buildGoogleDriveDesktopUri('test.docx'));
    expect(await getProcedureFileUrl(client as never, record, 'download')).toBe(url);
    expect(client.storage.from).not.toHaveBeenCalled();
  });

  it('keeps published PDFs on protected Supabase storage even if a caller supplies a Drive link', async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: 'https://storage.test/published.pdf' }, error: null });
    const client = { storage: { from: vi.fn(() => ({ createSignedUrl })) } };
    const record = { procedureId: 1, status: 'published', fileName: 'published.pdf', mimeType: 'application/pdf',
      storageBucket: 'procedure-documents', storagePath: 'published/test.pdf', googleDriveFileId: id, googleDrivePath: 'source.docx' };
    expect(await getProcedureFileUrl(client as never, record as never, 'open')).toBe('https://storage.test/published.pdf');
  });

  it('refuses to overwrite a stale backup or switch away from Drive without a new source', async () => {
    const client = { from: vi.fn(), storage: { from: vi.fn() } };
    const record = { googleDriveFileId: id } as ProcedureRecord;
    await expect(updateProcedure(client as never, record, {} as ProcedureInput, new File(['x'], 'test.docx'))).rejects.toThrow('Google Drive');
    await expect(updateProcedure(client as never, record, { googleDriveUrl: '' } as ProcedureInput)).rejects.toThrow('Sélectionnez');
    expect(client.from).not.toHaveBeenCalled();
    expect(client.storage.from).not.toHaveBeenCalled();
  });
});
