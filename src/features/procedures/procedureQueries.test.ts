import { describe, expect, it } from 'vitest';
import { buildProcedureDesktopUri, type ProcedureRecord } from './procedureQueries';

function fileRecord(fileName: string, mimeType = ''): ProcedureRecord {
  return { fileName, mimeType } as ProcedureRecord;
}

describe('buildProcedureDesktopUri', () => {
  it.each([
    ['procedure.docx', '', 'ms-word'],
    ['modele.dotx', '', 'ms-word'],
    ['registre.xlsx', '', 'ms-excel'],
    ['support.pptx', '', 'ms-powerpoint'],
    ['document', 'application/vnd.oasis.opendocument.text', 'ms-word'],
    ['document', 'application/vnd.oasis.opendocument.spreadsheet', 'ms-excel'],
    ['document', 'application/vnd.oasis.opendocument.presentation', 'ms-powerpoint'],
  ])('opens %s with the installed %s application', (fileName, mimeType, scheme) => {
    expect(buildProcedureDesktopUri(fileRecord(fileName, mimeType), 'https://storage.test/file?token=signed'))
      .toBe(`${scheme}:ofv|u|https://storage.test/file?token=signed`);
  });

  it('keeps non-Office files on their signed URL', () => {
    expect(buildProcedureDesktopUri(fileRecord('procedure.pdf', 'application/pdf'), 'https://storage.test/file.pdf'))
      .toBe('https://storage.test/file.pdf');
  });
});
