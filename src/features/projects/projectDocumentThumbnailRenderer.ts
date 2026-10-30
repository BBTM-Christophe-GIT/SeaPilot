import type { PDFDocumentLoadingTask, PDFPageProxy, RenderTask } from 'pdfjs-dist';

const WORD_NAMESPACE = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const PREVIEW_WIDTH = 320;
const PREVIEW_HEIGHT = 420;
const TEXT_LIMIT = 12_000;
export const PROJECT_THUMBNAIL_FILE_LIMIT = 50 * 1024 * 1024;
const WORD_XML_LIMIT = 8 * 1024 * 1024;

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Aperçu annulé.', 'AbortError');
}

function canvasBlob(canvas: HTMLCanvasElement, signal?: AbortSignal): Promise<Blob> {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => canvas.toBlob(blob => {
    if (signal?.aborted) reject(new DOMException('Aperçu annulé.', 'AbortError'));
    else if (blob) resolve(blob);
    else reject(new Error('Impossible de créer la miniature.'));
  }, 'image/png'));
}

/** Read only text nodes from the actual document; never insert document HTML. */
export function projectDocxPreviewText(xml: string): string[] {
  const parsed = new DOMParser().parseFromString(xml, 'application/xml');
  if (parsed.getElementsByTagName('parsererror').length) throw new Error('Le document Word est illisible.');
  const paragraphs = Array.from(parsed.getElementsByTagNameNS(WORD_NAMESPACE, 'p'));
  const result: string[] = [];
  let length = 0;
  for (const paragraph of paragraphs) {
    const runs = Array.from(paragraph.getElementsByTagNameNS(WORD_NAMESPACE, 't'));
    const text = runs.map(run => run.textContent || '').join('').replace(/\s+/g, ' ').trim();
    if (text) { result.push(text.slice(0, TEXT_LIMIT - length)); length += text.length; }
    const pageBreak = Array.from(paragraph.getElementsByTagNameNS(WORD_NAMESPACE, 'br'))
      .some(node => node.getAttributeNS(WORD_NAMESPACE, 'type') === 'page');
    if (pageBreak || length >= TEXT_LIMIT || result.length >= 80) break;
  }
  if (!result.length) throw new Error('Ce document Word ne contient pas de texte prévisualisable.');
  return result;
}

async function renderTextPage(paragraphs: string[], signal?: AbortSignal): Promise<Blob> {
  throwIfAborted(signal);
  const canvas = document.createElement('canvas');
  canvas.width = PREVIEW_WIDTH; canvas.height = PREVIEW_HEIGHT;
  try {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Le rendu de la miniature est indisponible.');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#182132'; context.font = '12px Arial, sans-serif'; context.textBaseline = 'top';
    const margin = 26; const lineHeight = 17; const maxWidth = PREVIEW_WIDTH - margin * 2;
    let y = margin;
    for (const paragraph of paragraphs) {
      let line = '';
      for (const word of paragraph.split(/\s+/)) {
        // Split unbroken file paths/identifiers too, so text stays on the page.
        for (const letter of `${word} `) {
          if (line && context.measureText(line + letter).width > maxWidth) {
            context.fillText(line.trimEnd(), margin, y); y += lineHeight; line = '';
            if (y > PREVIEW_HEIGHT - margin - lineHeight) return await canvasBlob(canvas, signal);
          }
          line += letter;
        }
      }
      if (line.trim()) { context.fillText(line.trimEnd(), margin, y); y += lineHeight; }
      y += 7;
      if (y > PREVIEW_HEIGHT - margin - lineHeight) break;
    }
    return await canvasBlob(canvas, signal);
  } finally { canvas.width = 0; canvas.height = 0; }
}

async function renderPdfPage(blob: Blob, signal?: AbortSignal): Promise<Blob> {
  const [pdfjs, bytes] = await Promise.all([import('pdfjs-dist'), blob.arrayBuffer()]);
  throwIfAborted(signal);
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  let loading: PDFDocumentLoadingTask | undefined;
  let page: PDFPageProxy | undefined;
  let rendering: RenderTask | undefined;
  const canvas = document.createElement('canvas');
  const abort = () => { rendering?.cancel(); void loading?.destroy().catch(() => undefined); };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    loading = pdfjs.getDocument({ data: new Uint8Array(bytes) });
    const pdf = await loading.promise;
    throwIfAborted(signal);
    page = await pdf.getPage(1);
    throwIfAborted(signal);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(PREVIEW_WIDTH / base.width, PREVIEW_HEIGHT / base.height) });
    canvas.width = Math.max(1, Math.round(viewport.width)); canvas.height = Math.max(1, Math.round(viewport.height));
    rendering = page.render({ canvas, viewport, background: '#ffffff' });
    await rendering.promise;
    return await canvasBlob(canvas, signal);
  } finally {
    signal?.removeEventListener('abort', abort);
    rendering?.cancel(); page?.cleanup();
    await loading?.destroy().catch(() => undefined);
    canvas.width = 0; canvas.height = 0;
  }
}

/** Produce pixels from private file bytes; no filename-based placeholder is a preview. */
export async function renderProjectDocumentThumbnail(
  blob: Blob, fileName: string, mimeType = blob.type, signal?: AbortSignal,
): Promise<Blob> {
  throwIfAborted(signal);
  if (blob.size > PROJECT_THUMBNAIL_FILE_LIMIT) throw new Error('Ce fichier dépasse la taille maximale de prévisualisation.');
  const extension = fileName.split('.').at(-1)?.toLowerCase() || '';
  const mime = mimeType.toLowerCase().split(';')[0];
  if (mime.startsWith('image/') || /^(png|jpe?g|gif|webp|bmp|svg|avif|heic)$/.test(extension)) return blob;
  if (mime === 'application/pdf' || extension === 'pdf') return renderPdfPage(blob, signal);
  if (extension === 'docx' || mime.includes('wordprocessingml.document')) {
    const [zipModule, bytes] = await Promise.all([import('jszip'), blob.arrayBuffer()]);
    throwIfAborted(signal);
    const archive = await zipModule.default.loadAsync(bytes);
    const source = archive.file('word/document.xml');
    if (!source) throw new Error('Le contenu du document Word est absent.');
    const uncompressedBytes = (source as typeof source & { _data?: { uncompressedSize?: number } })._data?.uncompressedSize;
    if (typeof uncompressedBytes === 'number' && uncompressedBytes > WORD_XML_LIMIT) throw new Error('Le contenu du document Word est trop volumineux.');
    const xml = await source.async('string');
    throwIfAborted(signal);
    if (xml.length > WORD_XML_LIMIT) throw new Error('Le contenu du document Word est trop volumineux.');
    return renderTextPage(projectDocxPreviewText(xml), signal);
  }
  if (mime.startsWith('text/') || /^(txt|csv|json|log|md)$/.test(extension)) {
    const bytes = await blob.slice(0, 64 * 1024).arrayBuffer();
    throwIfAborted(signal);
    const text = new TextDecoder().decode(bytes).slice(0, TEXT_LIMIT).trim();
    if (!text) throw new Error('Ce fichier ne contient pas de texte prévisualisable.');
    return renderTextPage(text.split(/\r?\n/).filter(Boolean), signal);
  }
  throw new Error('Aperçu indisponible pour ce format.');
}
