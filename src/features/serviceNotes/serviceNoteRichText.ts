import DOMPurify from 'dompurify';

export const SERVICE_NOTE_FONT_STACK = 'Aptos, "Segoe UI", Arial, sans-serif';
export const SERVICE_NOTE_MAX_BODY_LENGTH = 20_000;

const ALLOWED_TAGS = ['p', 'div', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'h2', 'h3', 'blockquote', 'a', 'span', 'font'];
const ALLOWED_FONTS = new Map([
  ['aptos', 'Aptos'],
  ['segoe ui', 'Segoe UI'],
  ['arial', 'Arial'],
  ['times new roman', 'Times New Roman'],
]);

function escapeHtml(value: string): string {
  return value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/'/gu, '&#039;');
}

function plainTextToHtml(value: string): string {
  return value
    .split(/\n{2,}/gu)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/gu, '<br>')}</p>`)
    .join('');
}

function sanitizeStyle(element: HTMLElement): void {
  const alignment = element.style.textAlign.toLowerCase();
  const requestedFont = element.style.fontFamily.replace(/["']/gu, '').split(',')[0]?.trim().toLowerCase() || '';
  const font = ALLOWED_FONTS.get(requestedFont);
  element.removeAttribute('style');
  if (['left', 'center', 'right'].includes(alignment)) element.style.textAlign = alignment;
  if (font) element.style.fontFamily = font;
}

function isSafeLink(value: string): boolean {
  return /^(https?:|mailto:)/iu.test(value.trim());
}

export function sanitizeServiceNoteHtml(value: string): string {
  const source = /<\/?[a-z][\s\S]*>/iu.test(value) ? value : plainTextToHtml(value);
  const sanitized = DOMPurify.sanitize(source, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ['href', 'target', 'rel', 'style', 'face'],
  });
  const template = document.createElement('template');
  template.innerHTML = sanitized;
  template.content.querySelectorAll<HTMLElement>('font').forEach((fontElement) => {
    const requestedFont = (fontElement.getAttribute('face') || '').replace(/["']/gu, '').split(',')[0]?.trim().toLowerCase() || '';
    const span = document.createElement('span');
    const font = ALLOWED_FONTS.get(requestedFont);
    if (font) span.style.fontFamily = font;
    span.append(...Array.from(fontElement.childNodes));
    fontElement.replaceWith(span);
  });
  template.content.querySelectorAll<HTMLElement>('*').forEach((element) => {
    sanitizeStyle(element);
    if (element instanceof HTMLAnchorElement) {
      if (!isSafeLink(element.getAttribute('href') || '')) element.removeAttribute('href');
      element.target = '_blank';
      element.rel = 'noopener noreferrer';
    }
  });
  return template.innerHTML;
}

export function serviceNoteBodyToHtml(value: string): string {
  const sanitized = sanitizeServiceNoteHtml(value || '');
  return sanitized || '<p><br></p>';
}

export function serviceNoteBodyToPlainText(value: string): string {
  const template = document.createElement('template');
  template.innerHTML = sanitizeServiceNoteHtml(value || '');
  const blocks = template.content.querySelectorAll('p, div, h2, h3, blockquote, li');
  if (!blocks.length) return (template.content.textContent || '').trim();
  return Array.from(blocks, (block) => (block.textContent || '').trim()).filter(Boolean).join('\n');
}

export function serviceNoteBodyHasContent(value: string): boolean {
  return serviceNoteBodyToPlainText(value).length > 0;
}

export interface ServiceNoteRichTextRun {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  fontFamily: 'sans' | 'serif';
  href: string;
}

export interface ServiceNoteRichTextBlock {
  kind: 'paragraph' | 'heading' | 'subheading' | 'quote' | 'list';
  align: 'left' | 'center' | 'right';
  runs: ServiceNoteRichTextRun[];
}

interface InlineStyle {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  fontFamily: 'sans' | 'serif';
  href: string;
}

function inlineRuns(node: Node, inherited: InlineStyle): ServiceNoteRichTextRun[] {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ? [{ text: node.textContent, ...inherited }] : [];
  if (!(node instanceof HTMLElement)) return [];
  if (node.tagName === 'BR') return [{ text: '\n', ...inherited }];
  const tagName = node.tagName.toLowerCase();
  const style: InlineStyle = {
    bold: inherited.bold || tagName === 'strong' || tagName === 'b',
    italic: inherited.italic || tagName === 'em' || tagName === 'i',
    underline: inherited.underline || tagName === 'u',
    fontFamily: node.style.fontFamily.toLowerCase().includes('times') ? 'serif' : inherited.fontFamily,
    href: tagName === 'a' ? node.getAttribute('href') || '' : inherited.href,
  };
  return Array.from(node.childNodes).flatMap((child) => inlineRuns(child, style));
}

export function serviceNoteBodyToRichTextBlocks(value: string): ServiceNoteRichTextBlock[] {
  const template = document.createElement('template');
  template.innerHTML = sanitizeServiceNoteHtml(value || '');
  const blocks: ServiceNoteRichTextBlock[] = [];
  const baseStyle: InlineStyle = { bold: false, italic: false, underline: false, fontFamily: 'sans', href: '' };
  Array.from(template.content.childNodes).forEach((node) => {
    if (!(node instanceof HTMLElement)) {
      const text = node.textContent?.trim();
      if (text) blocks.push({ kind: 'paragraph', align: 'left', runs: [{ text, ...baseStyle }] });
      return;
    }
    const tagName = node.tagName.toLowerCase();
    if (tagName === 'ul' || tagName === 'ol') {
      Array.from(node.children).forEach((item, index) => {
        const prefix = tagName === 'ol' ? `${index + 1}. ` : '• ';
        blocks.push({
          kind: 'list',
          align: 'left',
          runs: [{ text: prefix, ...baseStyle, bold: true }, ...inlineRuns(item, baseStyle)],
        });
      });
      return;
    }
    const alignment = node.style.textAlign;
    blocks.push({
      kind: tagName === 'h2' ? 'heading' : tagName === 'h3' ? 'subheading' : tagName === 'blockquote' ? 'quote' : 'paragraph',
      align: alignment === 'center' || alignment === 'right' ? alignment : 'left',
      runs: inlineRuns(node, baseStyle),
    });
  });
  return blocks.filter((block) => block.runs.some((run) => run.text.trim()));
}
