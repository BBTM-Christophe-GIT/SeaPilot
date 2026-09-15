import { sanitizeServiceNoteHtml, serviceNoteBodyHasContent, serviceNoteBodyToPlainText } from '../serviceNotes/serviceNoteRichText';

/** Explicit text conversion keeps names, places and legacy text from becoming HTML. */
export function disciplinaryTextToHtml(value: string): string {
  return value.split(/\n{2,}/).map((part) => `<p>${part.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '<br>')}</p>`).join('');
}

export function disciplinaryBodyToHtml(value: string): string {
  const isRichText = /<\/?(?:p|div|br|strong|b|em|i|u|ul|ol|li|h2|h3|blockquote|a|span|font)(?:\s|\/?>)/i.test(value);
  return sanitizeServiceNoteHtml(isRichText ? value : disciplinaryTextToHtml(value));
}

export function disciplinaryBodyHasContent(value: string): boolean {
  return serviceNoteBodyHasContent(disciplinaryBodyToHtml(value));
}

export function disciplinaryBodyToPlainText(value: string): string {
  return serviceNoteBodyToPlainText(disciplinaryBodyToHtml(value));
}
