import { describe, expect, it, vi } from 'vitest';
import { buildOfficeDesktopUrl, createServiceNoteAttachmentUrl, formatServiceNoteDate, removeFileExtension, type ServiceNoteAttachment } from './serviceNoteQueries';

describe('service note helpers', () => {
  it('inventories attachments without their file extension', () => {
    expect(removeFileExtension('NS 07-26 - Mise à jour du DUP.pdf')).toBe('NS 07-26 - Mise à jour du DUP');
    expect(removeFileExtension('photo.intervention.JPEG')).toBe('photo.intervention');
    expect(removeFileExtension('Procédure liée')).toBe('Procédure liée');
  });

  it('builds the Microsoft Word desktop protocol URL for SharePoint archives', () => {
    expect(buildOfficeDesktopUrl('https://bbtm668.sharepoint.com/note.docx?web=1'))
      .toBe('ms-word:ofe|u|https://bbtm668.sharepoint.com/note.docx');
  });

  it('formats the server signing date for the shared register', () => {
    expect(formatServiceNoteDate('2026-09-02T08:30:00Z')).toMatch(/^02\/09\/2026$/);
  });

  it('opens the published procedure file instead of routing to the Procedures module', async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: 'https://storage.test/vpc-07-e.pdf' }, error: null });
    const limit = vi.fn().mockResolvedValue({ data: [{
      storage_bucket: 'procedure-documents', storage_path: 'published/24/vpc-07-e.pdf',
      file_name: 'VPC 07-E - DUP KROKDUR.pdf', file_url: null, mime_type: 'application/pdf',
    }], error: null });
    const client = {
      from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ limit })) })) })),
      storage: { from: vi.fn(() => ({ createSignedUrl })) },
    } as never;
    const attachment: ServiceNoteAttachment = {
      id: 3, noteId: 24, kind: 'procedure', displayName: 'VPC 07-E - DUP KROKDUR',
      storageBucket: '', storagePath: '', externalUrl: '/modules/procedures?document=65', linkedRecordId: 65,
      mimeType: '', fileSizeBytes: null, sortOrder: 0,
    };

    await expect(createServiceNoteAttachmentUrl(client, attachment)).resolves.toBe('https://storage.test/vpc-07-e.pdf');
    expect(createSignedUrl).toHaveBeenCalledWith('published/24/vpc-07-e.pdf', 900, undefined);
  });

  it('creates a forced-download URL with the original document filename', async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: 'https://storage.test/download' }, error: null });
    const client = { storage: { from: vi.fn(() => ({ createSignedUrl })) } } as never;
    const attachment: ServiceNoteAttachment = {
      id: 4, noteId: 24, kind: 'file', displayName: 'Annexe sécurité', storageBucket: 'service-note-files',
      storagePath: '1/24/uuid-annexe-securite.pdf', externalUrl: '', linkedRecordId: null,
      mimeType: 'application/pdf', fileSizeBytes: 1234, sortOrder: 0,
    };

    await createServiceNoteAttachmentUrl(client, attachment, true);
    expect(createSignedUrl).toHaveBeenCalledWith('1/24/uuid-annexe-securite.pdf', 900, { download: 'Annexe sécurité.pdf' });
  });
});
