import {
  sanitizeServiceNoteHtml,
  serviceNoteBodyHasContent,
} from '../serviceNotes/serviceNoteRichText';

export interface ProjectPdfRichTextRow {
  html: string;
  label?: string;
}

const PROJECT_PDF_APTOS_FONT_FAMILY = 'Aptos, "Segoe UI", Arial, sans-serif';
export const PROJECT_PDF_FALLBACK_FONT_FAMILY = '"Segoe UI", Arial, sans-serif';

export function isAptosFontAvailable(): boolean {
  if (typeof document === 'undefined') return false;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return false;
  const sample = 'WWWWWWWWWWiiiiiiiiii0123456789';
  context.font = '72px Aptos, monospace';
  const aptosWidth = context.measureText(sample).width;
  context.font = '72px monospace';
  const fallbackWidth = context.measureText(sample).width;
  return Math.abs(aptosWidth - fallbackWidth) > 0.5;
}

export async function resolveProjectPdfFontFamily(): Promise<string> {
  if (typeof document === 'undefined') return PROJECT_PDF_FALLBACK_FONT_FAMILY;

  try {
    await Promise.all([
      document.fonts?.load('400 16px Aptos'),
      document.fonts?.load('700 16px Aptos'),
    ]);
  } catch {
    // Firefox rejects FontFaceSet.load with a NetworkError when a local font is
    // unavailable. The commercial offer must remain generatable with a safe
    // system fallback on devices that do not include Microsoft Aptos.
    return PROJECT_PDF_FALLBACK_FONT_FAMILY;
  }

  return isAptosFontAvailable()
    ? PROJECT_PDF_APTOS_FONT_FAMILY
    : PROJECT_PDF_FALLBACK_FONT_FAMILY;
}

export async function renderProjectPdfRichText(rows: ProjectPdfRichTextRow[]): Promise<HTMLCanvasElement> {
  const populatedRows = rows.filter((row) => serviceNoteBodyHasContent(row.html));
  if (populatedRows.length === 0) throw new Error('Aucun contenu enrichi à générer.');
  if (typeof document === 'undefined') {
    throw new Error('Le rendu enrichi de l’offre doit être généré depuis un navigateur.');
  }

  const fontFamily = await resolveProjectPdfFontFamily();

  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  Object.assign(host.style, {
    background: '#ffffff',
    color: '#233b57',
    fontFamily,
    fontSize: '16px',
    fontWeight: '400',
    left: '-100000px',
    lineHeight: '1.45',
    padding: '0',
    position: 'fixed',
    top: '0',
    width: '960px',
    zIndex: '-1',
  });

  populatedRows.forEach((row, index) => {
    const container = document.createElement('section');
    Object.assign(container.style, {
      border: '1px solid #d8e2ed',
      borderBottom: index === populatedRows.length - 1 ? '1px solid #d8e2ed' : '0',
      display: 'grid',
      gap: '10px',
      padding: '18px 20px',
    });
    if (row.label) {
      const label = document.createElement('strong');
      label.textContent = row.label;
      Object.assign(label.style, {
        color: '#173b65',
        fontFamily,
        fontSize: '15px',
        fontWeight: '700',
        letterSpacing: '.02em',
      });
      container.append(label);
    }
    const content = document.createElement('div');
    content.innerHTML = sanitizeServiceNoteHtml(row.html);
    content.style.fontFamily = fontFamily;
    content.querySelectorAll<HTMLElement>('*').forEach((element) => {
      element.style.fontFamily = fontFamily;
    });
    content.querySelectorAll<HTMLElement>('p, div, h2, h3, blockquote, ul, ol').forEach((element) => {
      element.style.marginTop = '0';
      element.style.marginBottom = '9px';
    });
    content.querySelectorAll<HTMLElement>('ul, ol').forEach((element) => {
      element.style.paddingLeft = '28px';
    });
    content.querySelectorAll<HTMLElement>('h2').forEach((element) => {
      element.style.fontSize = '22px';
    });
    content.querySelectorAll<HTMLElement>('h3').forEach((element) => {
      element.style.fontSize = '18px';
    });
    container.append(content);
    host.append(container);
  });

  document.body.append(host);
  try {
    const { default: html2canvas } = await import('html2canvas');
    return await html2canvas(host, {
      backgroundColor: '#ffffff',
      logging: false,
      scale: 2,
      useCORS: false,
    });
  } finally {
    host.remove();
  }
}
