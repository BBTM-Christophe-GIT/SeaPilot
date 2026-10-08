import {
  sanitizeServiceNoteHtml,
  serviceNoteBodyHasContent,
  serviceNoteBodyToPlainText,
} from '../serviceNotes/serviceNoteRichText';

export function sanitizeProjectDescriptionHtml(value: string | null | undefined): string {
  const sanitized = sanitizeServiceNoteHtml(value || '');
  return serviceNoteBodyHasContent(sanitized) ? sanitized : '';
}

export function projectDescriptionHasContent(value: string | null | undefined): boolean {
  return serviceNoteBodyHasContent(value || '');
}

export function projectDescriptionToPlainText(value: string | null | undefined): string {
  return serviceNoteBodyToPlainText(value || '');
}
