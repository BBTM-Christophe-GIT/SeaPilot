import JSZip from 'jszip';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PROJECT_THUMBNAIL_FILE_LIMIT, projectDocxPreviewText, renderProjectDocumentThumbnail } from './projectDocumentThumbnailRenderer';

const pdfMocks = vi.hoisted(() => ({ getDocument: vi.fn() }));
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: { workerSrc: '' }, getDocument: pdfMocks.getDocument }));

function canvasRenderer() {
  const drawn: string[] = [];
  const context = { fillStyle: '', font: '', textBaseline: '', fillRect: vi.fn(), fillText: vi.fn((text: string) => drawn.push(text)),
    measureText: (text: string) => ({ width: text.length * 6 }) };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(new Blob(['rendered pixels'], { type: 'image/png' })));
  return { drawn, context };
}

afterEach(() => vi.restoreAllMocks());

describe('project document content thumbnails', () => {
  it('bounds private source bytes and rejects oversized DOCX XML before decoding it', async () => {
    const oversized = new Blob(['small allocation']);
    Object.defineProperty(oversized, 'size', { value: PROJECT_THUMBNAIL_FILE_LIMIT + 1 });
    await expect(renderProjectDocumentThumbnail(oversized, 'Grand.pdf')).rejects.toThrow('taille maximale');
    const archive = new JSZip(); archive.file('word/document.xml', ' '.repeat(8 * 1024 * 1024 + 1));
    const compressed = await archive.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
    expect(compressed.byteLength).toBeLessThan(20_000);
    await expect(renderProjectDocumentThumbnail(new Blob([compressed]), 'Compresse.docx')).rejects.toThrow('trop volumineux');
  });

  it('uses the actual image bytes and honestly refuses unsupported files', async () => {
    const image = new Blob(['private image bytes'], { type: 'image/png' });
    expect(await renderProjectDocumentThumbnail(image, 'Pont.png')).toBe(image);
    await expect(renderProjectDocumentThumbnail(new Blob(['archive']), 'Archives.zip')).rejects.toThrow('Aperçu indisponible');
  });

  it('reads real DOCX paragraphs only up to a page break without interpreting markup', async () => {
    const { drawn } = canvasRenderer();
    const xml = '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
      + '<w:p><w:r><w:t>Consignes de sécurité du pont</w:t></w:r></w:p>'
      + '<w:p><w:r><w:t>&lt;script&gt;contenu littéral&lt;/script&gt;</w:t><w:br w:type="page"/></w:r></w:p>'
      + '<w:p><w:r><w:t>Deuxième page exclue</w:t></w:r></w:p></w:body></w:document>';
    const archive = new JSZip(); archive.file('word/document.xml', xml);
    const blob = new Blob([await archive.generateAsync({ type: 'arraybuffer' })]);
    const preview = await renderProjectDocumentThumbnail(blob, 'Consignes.docx');
    expect(preview.type).toBe('image/png');
    expect(drawn.join(' ')).toContain('Consignes de sécurité du pont');
    expect(drawn.join(' ')).toContain('<script>contenu');
    expect(drawn.join(' ')).not.toContain('Deuxième page');
    expect(document.querySelector('script')).toBeNull();
  });

  it('rejects malformed or empty Word content and missing document XML', async () => {
    expect(() => projectDocxPreviewText('<w:document>')).toThrow('illisible');
    expect(() => projectDocxPreviewText('<root/>')).toThrow('ne contient pas de texte');
    const archive = new JSZip(); archive.file('readme.txt', 'not a Word document');
    await expect(renderProjectDocumentThumbnail(new Blob([await archive.generateAsync({ type: 'arraybuffer' })]), 'Invalide.docx')).rejects.toThrow('contenu du document Word est absent');
  });

  it('wraps actual text into a bounded image, including unbroken identifiers', async () => {
    const { drawn } = canvasRenderer();
    const canvas = document.createElement('canvas');
    const createElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((name: string) => name === 'canvas' ? canvas : createElement(name)) as typeof document.createElement);
    const source = 'Ordre de mission\n' + 'A'.repeat(140);
    await renderProjectDocumentThumbnail(new Blob([source], { type: 'text/plain' }), 'mission.txt');
    expect(drawn[0]).toBe('Ordre de mission');
    expect(drawn.slice(1).join('').replaceAll(' ', '')).toBe('A'.repeat(140));
    expect(drawn.every(line => line.length <= 45)).toBe(true);
    expect([canvas.width, canvas.height]).toEqual([0, 0]);
  });

  it('renders the first actual PDF page at bounded size and releases the renderer', async () => {
    canvasRenderer();
    const cleanup = vi.fn(); const cancel = vi.fn(); const destroy = vi.fn().mockResolvedValue(undefined);
    const render = vi.fn().mockReturnValue({ promise: Promise.resolve(), cancel });
    const page = { cleanup, getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }), render };
    const getPage = vi.fn().mockResolvedValue(page);
    pdfMocks.getDocument.mockReturnValue({ promise: Promise.resolve({ getPage }), destroy });
    await renderProjectDocumentThumbnail(new Blob(['pdf'], { type: 'application/pdf' }), 'Plan.pdf');
    expect(getPage).toHaveBeenCalledWith(1);
    expect(render.mock.calls[0][0].viewport).toEqual({ width: 315, height: 420 });
    expect(cleanup).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
    expect(destroy).toHaveBeenCalledOnce();
    expect(pdfMocks.getDocument.mock.calls.at(-1)?.[0].data).toBeInstanceOf(Uint8Array);
  });

  it('aborts PDF rendering and destroys its loading task without producing pixels', async () => {
    canvasRenderer();
    const controller = new AbortController();
    let rejectRender: (reason: Error) => void = () => undefined;
    const cancel = vi.fn(() => rejectRender(new DOMException('Cancelled', 'AbortError')));
    const destroy = vi.fn().mockResolvedValue(undefined);
    const render = vi.fn().mockReturnValue({ promise: new Promise((_resolve, reject) => { rejectRender = reject; }), cancel });
    pdfMocks.getDocument.mockReturnValue({ promise: Promise.resolve({ getPage: async () => ({ cleanup: vi.fn(),
      getViewport: () => ({ width: 200, height: 300 }), render }) }), destroy });
    const result = renderProjectDocumentThumbnail(new Blob(['pdf']), 'Plan.pdf', 'application/pdf', controller.signal);
    const assertion = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(render).toHaveBeenCalledOnce());
    controller.abort();
    await assertion;
    expect(cancel).toHaveBeenCalled();
    expect(destroy).toHaveBeenCalled();
  });
});
