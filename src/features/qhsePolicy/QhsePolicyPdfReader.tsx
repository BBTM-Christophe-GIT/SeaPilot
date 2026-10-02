import { useEffect, useId, useRef, useState } from 'react';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

export interface QhsePolicyPdfReaderProps { url: string; title: string; compact?: boolean; label?: string }
interface LoadedSource { url: string; document: PDFDocumentProxy | null; error: string }
interface RenderedPage { key: string; ready: boolean; error: string; text: string }

/** Read real PDF bytes without depending on the browser's native PDF viewer. */
export default function QhsePolicyPdfReader({ url, title, compact = false, label = 'Politique QHSE' }: QhsePolicyPdfReaderProps) {
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const textId = useId();
  const [source, setSource] = useState<LoadedSource>({ url: '', document: null, error: '' });
  const [page, setPage] = useState(1);
  const [width, setWidth] = useState(0);
  const [rendered, setRendered] = useState<RenderedPage>({ key: '', ready: false, error: '', text: '' });
  const document = source.url === url ? source.document : null;
  const currentPage = source.url === url ? page : 1;
  const renderKey = `${url}|${currentPage}|${width}`;
  const ready = rendered.key === renderKey && rendered.ready && !!document;
  const error = source.url === url && source.error || (rendered.key === renderKey ? rendered.error : '');

  useEffect(() => {
    let active = true;
    let loadingTask: PDFDocumentLoadingTask | undefined;
    const controller = new AbortController();
    setSource({ url, document: null, error: '' });
    setPage(1);
    function destroy() {
      const task = loadingTask;
      loadingTask = undefined;
      void task?.destroy().catch(() => undefined);
    }
    const bytes = fetch(url, { signal: controller.signal }).then((response) => {
      if (!response.ok) throw new Error(`PDF HTTP ${response.status}`);
      return response.arrayBuffer();
    });
    void Promise.all([import('pdfjs-dist'), bytes]).then(async ([pdfjs, buffer]) => {
      if (!active) return;
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
      loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });
      const loaded = await loadingTask.promise;
      if (active) setSource({ url, document: loaded, error: '' });
    }).catch(() => {
      destroy();
      if (active) setSource({ url, document: null, error: 'Le PDF ne peut pas être chargé. Utilisez « Ouvrir le PDF » pour le consulter.' });
    });
    return () => { active = false; controller.abort(); destroy(); };
  }, [url]);

  useEffect(() => {
    const target = container.current;
    if (!target) return;
    const measure = () => setWidth(Math.max(0, target.getBoundingClientRect().width));
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(0, entry.contentRect.width));
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!document || !width || !canvas.current) return;
    let active = true;
    let task: RenderTask | undefined;
    setRendered({ key: renderKey, ready: false, error: '', text: '' });
    void document.getPage(currentPage).then(async (pdfPage) => {
      if (!active || !canvas.current) return;
      const base = pdfPage.getViewport({ scale: 1 });
      const viewport = pdfPage.getViewport({ scale: Math.min(width / base.width, 2) });
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const target = canvas.current;
      target.width = Math.round(viewport.width * ratio);
      target.height = Math.round(viewport.height * ratio);
      target.style.width = `${viewport.width}px`;
      target.style.height = `${viewport.height}px`;
      task = pdfPage.render({ canvas: target, viewport, transform: [ratio, 0, 0, ratio, 0, 0] });
      await task.promise;
      if (!active) return;
      setRendered({ key: renderKey, ready: true, error: '', text: '' });
      // Text extraction is supplementary and must not prevent a readable canvas.
      void pdfPage.getTextContent().then((content) => {
        const text = content.items.map((item) => 'str' in item ? item.str : '').join(' ').replace(/\s+/g, ' ').trim();
        if (active) setRendered((value) => value.key === renderKey ? { ...value, text } : value);
      }).catch(() => undefined);
    }).catch((reason: unknown) => {
      if (active && (!(reason instanceof Error) || reason.name !== 'RenderingCancelledException')) {
        setRendered({ key: renderKey, ready: false, text: '', error: 'Cette page ne peut pas être affichée. Utilisez « Ouvrir le PDF » pour la consulter.' });
      }
    });
    return () => { active = false; task?.cancel(); };
  }, [document, width, currentPage, renderKey]);

  return <section className={`qhse-policy-pdf-reader${compact ? ' is-compact' : ''}`} aria-label={`Lecteur PDF · ${title}`}>
    {!compact ? <div className="qhse-policy-pdf-pagination">
      <button type="button" disabled={!document || currentPage <= 1} onClick={() => setPage((value) => value - 1)}>Précédente</button>
      <span aria-live="polite">Page {currentPage} sur {document?.numPages || '…'}</span>
      <button type="button" disabled={!document || currentPage >= document.numPages} onClick={() => setPage((value) => value + 1)}>Suivante</button>
    </div> : null}
    <div className="qhse-policy-pdf-canvas" ref={container} aria-busy={!ready && !error}>
      {error ? <p role="alert">{error}</p> : !ready && <p role="status">Chargement du PDF…</p>}
      <canvas ref={canvas} role="img" aria-label={`${label} · page ${currentPage}`} aria-describedby={ready && rendered.text && !compact ? textId : undefined}
        style={{ visibility: ready ? 'visible' : 'hidden', display: error ? 'none' : 'block', maxWidth: '100%' }} />
      {ready && rendered.text && !compact && <div id={textId} className="sr-only">{rendered.text}</div>}
    </div>
  </section>;
}
