import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import QhsePolicyPdfReader from './QhsePolicyPdfReader';

const pdfjs = vi.hoisted(() => ({ getDocument: vi.fn(), GlobalWorkerOptions: { workerSrc: '' } }));
vi.mock('pdfjs-dist', () => pdfjs);
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
function fakeDocument(numPages = 3) {
  const cancel = vi.fn();
  const renderPage = vi.fn().mockReturnValue({ promise: Promise.resolve(), cancel });
  const pdfPage = { getViewport: vi.fn(({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale })), render: renderPage, getTextContent: vi.fn().mockResolvedValue({ items: [{ str: 'Politique Santé Sécurité Environnement' }] }) };
  const getPage = vi.fn().mockResolvedValue(pdfPage);
  const destroy = vi.fn().mockResolvedValue(undefined);
  const document = { numPages, getPage };
  return { document, loading: { promise: Promise.resolve(document), destroy }, destroy, getPage, renderPage, cancel, pdfPage };
}
let fetchPdf: ReturnType<typeof vi.fn>;
let disconnect = vi.fn<() => void>();
const originalRatio = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');
beforeEach(() => {
  pdfjs.getDocument.mockReset();
  fetchPdf = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(20) });
  vi.stubGlobal('fetch', fetchPdf);
  disconnect = vi.fn<() => void>();
  vi.stubGlobal('ResizeObserver', class {
    private callback: (entries: Array<{ contentRect: { width: number } }>) => void;
    constructor(callback: (entries: Array<{ contentRect: { width: number } }>) => void) { this.callback = callback; }
    observe() { this.callback([{ contentRect: { width: 500 } }]); }
    disconnect() { disconnect(); }
  });
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 3 });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  if (originalRatio) Object.defineProperty(window, 'devicePixelRatio', originalRatio);
});

describe('QHSE policy PDF reader', () => {
  it('renders a compact first-page preview without pagination or nested buttons', async () => {
    const pdf = fakeDocument(); pdfjs.getDocument.mockReturnValue(pdf.loading);
    render(<QhsePolicyPdfReader url="https://example.invalid/preview.pdf" title="Politique" compact label="Aperçu" />);
    await waitFor(() => expect(screen.getByRole('img', { name: 'Aperçu · page 1' })).toBeVisible());
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(pdf.getPage).toHaveBeenCalledWith(1);
  });
  it('renders actual bytes responsively, exposes accessible text and changes pages', async () => {
    const pdf = fakeDocument();
    pdfjs.getDocument.mockReturnValue(pdf.loading);
    const view = render(<QhsePolicyPdfReader url="https://example.invalid/policy.pdf" title="Politique QHSE" />);
    const canvas = await screen.findByRole('img', { name: 'Politique QHSE · page 1' });
    await waitFor(() => expect(canvas).toBeVisible());
    expect(pdfjs.getDocument).toHaveBeenCalledWith({ data: expect.any(Uint8Array) });
    expect(canvas).toHaveAttribute('width', '1000');
    expect(canvas).toHaveStyle({ width: '500px' });
    expect(pdf.renderPage).toHaveBeenCalledWith(expect.objectContaining({ transform: [2, 0, 0, 2, 0, 0] }));
    await screen.findByText('Politique Santé Sécurité Environnement');
    expect(screen.getByRole('button', { name: 'Précédente' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Suivante' }));
    await waitFor(() => expect(pdf.getPage).toHaveBeenCalledWith(2));
    expect(screen.getByText('Page 2 sur 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Suivante' }));
    await waitFor(() => expect(pdf.getPage).toHaveBeenCalledWith(3));
    expect(screen.getByRole('button', { name: 'Suivante' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Précédente' }));
    expect(screen.getByText('Page 2 sur 3')).toBeInTheDocument();
    view.unmount();
    expect(pdf.destroy).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
  it('shows a readable loading failure and leaves pagination disabled', async () => {
    fetchPdf.mockResolvedValue({ ok: false, status: 403 });
    render(<QhsePolicyPdfReader url="https://example.invalid/expired.pdf" title="Politique QHSE" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Le PDF ne peut pas être chargé');
    expect(screen.getByRole('button', { name: 'Suivante' })).toBeDisabled();
    expect(pdfjs.getDocument).not.toHaveBeenCalled();
  });
  it('reports page rendering failures without a native PDF viewer', async () => {
    const pdf = fakeDocument();
    pdf.renderPage.mockImplementation(() => ({ promise: Promise.reject(new Error('Canvas failed')), cancel: pdf.cancel }));
    pdfjs.getDocument.mockReturnValue(pdf.loading);
    render(<QhsePolicyPdfReader url="https://example.invalid/policy.pdf" title="Politique QHSE" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Cette page ne peut pas être affichée');
  });
  it('destroys the previous worker and ignores a document finishing after its URL changes', async () => {
    const old = fakeDocument(9);
    const next = fakeDocument(2);
    const oldLoaded = deferred<typeof old.document>();
    pdfjs.getDocument.mockReturnValueOnce({ promise: oldLoaded.promise, destroy: old.destroy }).mockReturnValueOnce(next.loading);
    const view = render(<QhsePolicyPdfReader url="https://example.invalid/old.pdf" title="Ancienne politique" />);
    await waitFor(() => expect(pdfjs.getDocument).toHaveBeenCalledTimes(1));
    view.rerender(<QhsePolicyPdfReader url="https://example.invalid/new.pdf" title="Nouvelle politique" />);
    await screen.findByText('Page 1 sur 2');
    expect(old.destroy).toHaveBeenCalledTimes(1);
    expect(fetchPdf.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => oldLoaded.resolve(old.document));
    expect(old.getPage).not.toHaveBeenCalled();
    expect(screen.getByText('Page 1 sur 2')).toBeInTheDocument();
  });
  it('cancels an unfinished canvas render when another page is selected', async () => {
    const pdf = fakeDocument();
    const oldRender = deferred<void>();
    pdf.renderPage.mockReturnValueOnce({ promise: oldRender.promise, cancel: pdf.cancel });
    pdfjs.getDocument.mockReturnValue(pdf.loading);
    render(<QhsePolicyPdfReader url="https://example.invalid/policy.pdf" title="Politique QHSE" />);
    await waitFor(() => expect(pdf.renderPage).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Suivante' }));
    await waitFor(() => expect(screen.getByRole('img', { name: 'Politique QHSE · page 2' })).toBeVisible());
    expect(pdf.cancel).toHaveBeenCalled();
    await act(async () => oldRender.resolve());
    expect(screen.getByRole('img', { name: 'Politique QHSE · page 2' })).toBeVisible();
  });
});
