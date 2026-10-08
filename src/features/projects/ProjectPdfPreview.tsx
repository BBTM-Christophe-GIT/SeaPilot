import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";


/** Render actual exported bytes even in embedded browsers without a native PDF viewer. */
export function ProjectPdfPreview({ blob }: { blob: Blob }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let destroy: (() => Promise<void>) | undefined;
    void Promise.all([import("pdfjs-dist"), blob.arrayBuffer()])
      .then(async ([pdfjs, bytes]) => {
        if (!active) return;
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        const loading = pdfjs.getDocument({ data: new Uint8Array(bytes) });
        destroy = () => loading.destroy();
        const loaded = await loading.promise;
        if (active) setDocument(loaded);
      })
      .catch(() => {
        if (active)
          setError("L’aperçu est indisponible. Le PDF reste téléchargeable.");
      });
    return () => {
      active = false;
      void destroy?.();
    };
  }, [blob]);
  useEffect(() => {
    if (!document) return;
    let active = true;
    let task: RenderTask | undefined;
    void document
      .getPage(page)
      .then(async (pdfPage) => {
        if (!active || !canvas.current) return;
        const viewport = pdfPage.getViewport({ scale: 1.5 });
        canvas.current.width = viewport.width;
        canvas.current.height = viewport.height;
        task = pdfPage.render({ canvas: canvas.current, viewport });
        await task.promise;
        if (active) setReady(true);
      })
      .catch((reason: unknown) => {
        if (
          active &&
          (!(reason instanceof Error) ||
            reason.name !== "RenderingCancelledException")
        )
          setError(
            "Cette page ne peut pas être affichée. Télécharge le PDF pour la consulter.",
          );
      });
    return () => {
      active = false;
      task?.cancel();
    };
  }, [document, page]);
  function turnPage(next: number) {
    setReady(false);
    setPage(next);
  }
  return (
    <div className="project-pdf-document">
      <div className="project-pdf-pagination">
        <button type="button" disabled={page <= 1} onClick={() => turnPage(page - 1)}>
          Précédente
        </button>
        <span>
          Page {page} / {document?.numPages || "…"}
        </span>
        <button type="button"
          disabled={!document || page >= document.numPages}
          onClick={() => turnPage(page + 1)}
        >
          Suivante
        </button>
      </div>
      {error ? (
        <p role="alert">{error}</p>
      ) : (
        <div className="project-pdf-canvas" aria-busy={!ready}>
          {!ready && <p role="status">Rendu du PDF…</p>}
          <canvas
            ref={canvas}
            aria-label={`Relevé de facturation · page ${page}`}
            role="img"
            style={{ visibility: ready ? "visible" : "hidden" }}
          />
        </div>
      )}
    </div>
  );
}
