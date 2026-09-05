import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

/** Render the exported bytes locally; works even where native iframe PDF viewers are unavailable. */
export default function KpiPdfPreview({ blob, page, zoom, fitHeight = 560 }: { blob: Blob; page: number; zoom: string; fitHeight?: number }) {
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [width, setWidth] = useState(0);
  const [error, setError] = useState(false);
  const [rendered, setRendered] = useState(false);
  useEffect(() => {
    let active = true;
    let destroy: (() => Promise<void>) | undefined;
    void Promise.all([import('pdfjs-dist'), blob.arrayBuffer()]).then(async ([pdfjs, buffer]) => {
      if (!active) return;
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
      const loading = pdfjs.getDocument({ data: new Uint8Array(buffer) });
      destroy = () => loading.destroy();
      const loaded = await loading.promise;
      if (active) setDocument(loaded);
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; void destroy?.(); };
  }, [blob]);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(container.current); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!document || !width || !canvas.current) return;
    let active = true;
    let task: RenderTask | undefined;
    setRendered(false); setError(false);
    void document.getPage(page).then(async (pdfPage) => {
      if (!active || !canvas.current) return;
      const base = pdfPage.getViewport({ scale: 1 });
      const scale = zoom === 'page-fit' ? Math.min((width - 36) / base.width, fitHeight / base.height) : Number(zoom) / 100;
      const viewport = pdfPage.getViewport({ scale: Math.max(.2, scale) });
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const target = canvas.current;
      target.width = Math.round(viewport.width * ratio); target.height = Math.round(viewport.height * ratio);
      target.style.width = `${viewport.width}px`; target.style.height = `${viewport.height}px`;
      task = pdfPage.render({ canvas: target, viewport, transform: [ratio, 0, 0, ratio, 0, 0] });
      await task.promise;
      if (active) setRendered(true);
    }).catch((reason: unknown) => { if (active && (!(reason instanceof Error) || reason.name !== 'RenderingCancelledException')) setError(true); });
    return () => { active = false; task?.cancel(); };
  }, [document, width, page, zoom, fitHeight]);
  return <div className="kpi-pdf-render" ref={container} aria-busy={!rendered && !error}>
    {error ? <p role="alert">Le rendu n’a pas abouti. Utilisez « Ouvrir le PDF » ou actualisez l’aperçu.</p> : <>
      {!rendered && <span className="kpi-pdf-loading" role="status">Rendu de la page…</span>}
      <canvas ref={canvas} role="img" aria-label={`Aperçu du rapport QHSE · page ${page}`} style={{ visibility: rendered ? 'visible' : 'hidden' }} />
    </>}
  </div>;
}
