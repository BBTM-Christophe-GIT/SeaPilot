import { describe, expect, it } from 'vitest';
import { buildOfficeDesktopUrl, formatServiceNoteDate, removeFileExtension } from './serviceNoteQueries';

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
});
