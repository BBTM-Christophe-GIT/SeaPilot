import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, PDFDocumentLoadingTask, RenderTask } from 'pdfjs-dist';

/** Render the real local export in browsers without a native PDF viewer. */
export default function PreviewPdf({ blob }: { blob: Blob }) {
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderTask = useRef<RenderTask | null>(null);
  const [loaded, setLoaded] = useState<{ blob: Blob; document: PDFDocumentProxy } | null>(null);
  const [page, setPage] = useState(1);
  const [width, setWidth] = useState(0);
  const [error, setError] = useState('');
  const [rendered, setRendered] = useState(false);
  const document = loaded?.blob === blob ? loaded.document : null;

  useEffect(() => {
    let active = true;
    let loading: PDFDocumentLoadingTask | undefined;
    setLoaded(null);
    setPage(1);
    setError('');
    setRendered(false);
    void Promise.all([import('pdfjs-dist'), blob.arrayBuffer()]).then(async ([pdfjs, buffer]) => {
      if (!active) return;
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
      loading = pdfjs.getDocument({ data: new Uint8Array(buffer) });
      const pdf = await loading.promise;
      if (active) setLoaded({ blob, document: pdf });
    }).catch(() => {
      if (active) setError('Impossible de lire ce PDF. Fermez puis actualisez l’aperçu.');
    });
    return () => {
      active = false;
      renderTask.current?.cancel();
      void loading?.destroy().catch(() => undefined);
    };
  }, [blob]);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    setWidth(element.clientWidth);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!document || !width || !canvas.current) return;
    let active = true;
    let task: RenderTask | undefined;
    const previous = renderTask.current;
    previous?.cancel();
    setRendered(false);
    setError('');
    void (async () => {
      // Wait for cancellation before rendering again into the same canvas.
      await previous?.promise.catch(() => undefined);
      const pdfPage = await document.getPage(page);
      if (!active || !canvas.current) return;
      const base = pdfPage.getViewport({ scale: 1 });
      const scale = Math.max(0.1, (width - 24) / base.width);
      const viewport = pdfPage.getViewport({ scale });
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const target = canvas.current;
      target.width = Math.round(viewport.width * ratio);
      target.height = Math.round(viewport.height * ratio);
      target.style.width = `${viewport.width}px`;
      target.style.height = `${viewport.height}px`;
      task = pdfPage.render({ canvas: target, viewport, transform: [ratio, 0, 0, ratio, 0, 0] });
      renderTask.current = task;
      await task.promise;
      if (active) setRendered(true);
    })().catch((reason: unknown) => {
      if (active && (!(reason instanceof Error) || reason.name !== 'RenderingCancelledException')) {
        setError('La page n’a pas pu être affichée. Fermez puis actualisez l’aperçu.');
      }
    });
    return () => {
      active = false;
      task?.cancel();
    };
  }, [document, page, width]);

  return <div className="pp-pdf" aria-busy={!rendered && !error}>
    <div className="pp-pdf-toolbar" aria-label="Navigation dans le PDF">
      <button type="button" className="pp-button" disabled={!document || page <= 1} onClick={() => setPage((current) => current - 1)}>Précédent</button>
      <span className="pp-pdf-page-count" aria-live="polite">Page {page} / {document?.numPages ?? '…'}</span>
      <button type="button" className="pp-button" disabled={!document || page >= document.numPages} onClick={() => setPage((current) => current + 1)}>Suivant</button>
    </div>
    <div ref={container} className="pp-pdf-canvas-wrap">
      {error ? <p role="alert" className="pp-pdf-error">{error}</p> : !rendered && <p role="status" className="pp-pdf-loading">{document ? 'Rendu de la page…' : 'Chargement du PDF…'}</p>}
      <canvas ref={canvas} className="pp-pdf-canvas" role="img" aria-label={`Aperçu des éléments de facturation, page ${page}`} style={{ visibility: rendered && !error ? 'visible' : 'hidden' }} />
    </div>
  </div>;
}
