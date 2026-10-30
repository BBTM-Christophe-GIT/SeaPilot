import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectDocumentThumbnail } from './ProjectDocumentThumbnail';

const mocks = vi.hoisted(() => ({ load: vi.fn(), render: vi.fn(), createUrl: vi.fn(), revokeUrl: vi.fn() }));
vi.mock('./projectDocumentAssets', () => ({ loadProjectDocumentBlob: mocks.load }));
vi.mock('./projectDocumentThumbnailRenderer', () => ({ PROJECT_THUMBNAIL_FILE_LIMIT: 50 * 1024 * 1024, renderProjectDocumentThumbnail: mocks.render }));
const client = {} as never;
const source = { fileName: 'Plan du pont.pdf', mimeType: 'application/pdf', storageBucket: 'project-files', storagePath: 'projects/1/plan.pdf' };
const props = { client, document: source, revisionKey: 'account-a:1:sha256-v1' };
const observers: { callback: IntersectionObserverCallback; disconnect: ReturnType<typeof vi.fn> }[] = [];
function intersect(index = observers.length - 1) {
  act(() => observers[index].callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
}

beforeEach(() => {
  vi.clearAllMocks(); observers.length = 0;
  mocks.load.mockResolvedValue(new Blob(['private PDF bytes']));
  mocks.render.mockResolvedValue(new Blob(['actual rendered pixels'], { type: 'image/png' }));
  let urlId = 0;
  mocks.createUrl.mockImplementation(() => `blob:private-preview-${++urlId}`);
  const NativeUrl = URL;
  vi.stubGlobal('URL', class extends NativeUrl { static createObjectURL = mocks.createUrl; static revokeObjectURL = mocks.revokeUrl; });
  vi.stubGlobal('IntersectionObserver', class {
    disconnect = vi.fn();
    observe = vi.fn();
    constructor(callback: IntersectionObserverCallback) { observers.push({ callback, disconnect: this.disconnect }); }
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('ProjectDocumentThumbnail', () => {
  it('avoids downloading a file already known to exceed the preview byte limit', async () => {
    const view = render(<ProjectDocumentThumbnail {...props} document={{ ...source, fileSizeBytes: 51 * 1024 * 1024 }} />);
    intersect();
    await waitFor(() => expect(view.container).toHaveTextContent('Aperçu indisponible'));
    expect(mocks.load).not.toHaveBeenCalled();
    view.unmount();
  });

  it('loads only an intersecting file and releases its object URL and private read on unmount', async () => {
    const view = render(<ProjectDocumentThumbnail {...props} />);
    expect(mocks.load).not.toHaveBeenCalled();
    expect(view.container).toHaveTextContent('Chargement de l’aperçu…');
    intersect();
    await waitFor(() => expect(view.container.querySelector('img')).toHaveAttribute('src', 'blob:private-preview-1'));
    expect(mocks.load).toHaveBeenCalledWith(client, source, expect.any(AbortSignal));
    expect(mocks.render).toHaveBeenCalledWith(expect.any(Blob), source.fileName, source.mimeType, expect.any(AbortSignal));
    expect(observers[0].disconnect).toHaveBeenCalled();
    const signal = mocks.load.mock.calls[0][2] as AbortSignal;
    view.unmount();
    expect(signal.aborted).toBe(true);
    expect(mocks.revokeUrl).toHaveBeenCalledWith('blob:private-preview-1');
  });

  it('shares bytes only between mounted consumers of the same client and exact source revision', async () => {
    const first = render(<ProjectDocumentThumbnail {...props} />);
    const second = render(<ProjectDocumentThumbnail {...props} />);
    intersect(0); intersect(1);
    await waitFor(() => expect(second.container.querySelector('img')).toBeInTheDocument());
    expect(mocks.load).toHaveBeenCalledOnce();
    expect(mocks.render).toHaveBeenCalledOnce();
    const signal = mocks.load.mock.calls[0][2] as AbortSignal;
    first.unmount();
    expect(signal.aborted).toBe(false);
    second.unmount();
    expect(signal.aborted).toBe(true);
    const next = render(<ProjectDocumentThumbnail {...props} />);
    intersect();
    await waitFor(() => expect(next.container.querySelector('img')).toBeInTheDocument());
    expect(mocks.load).toHaveBeenCalledTimes(2);
    next.unmount();
  });

  it('invalidates old pixels on source/access changes and waits for that source to intersect again', async () => {
    const view = render(<ProjectDocumentThumbnail {...props} />);
    intersect();
    await waitFor(() => expect(view.container.querySelector('img')).toBeInTheDocument());
    const initialSignal = mocks.load.mock.calls[0][2] as AbortSignal;
    view.rerender(<ProjectDocumentThumbnail {...props} revisionKey="account-b:1:sha256-v2" />);
    expect(view.container.querySelector('img')).toBeNull();
    expect(initialSignal.aborted).toBe(true);
    expect(mocks.load).toHaveBeenCalledOnce();
    intersect();
    await waitFor(() => expect(view.container.querySelector('img')).toHaveAttribute('src', 'blob:private-preview-2'));
    expect(mocks.load).toHaveBeenCalledTimes(2);
    view.rerender(<ProjectDocumentThumbnail {...props} client={{} as never} />);
    expect(view.container.querySelector('img')).toBeNull();
    intersect();
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(3));
    view.unmount();
  });

  it('does not publish an old asynchronous result after the file changes', async () => {
    let finish: (blob: Blob) => void = () => undefined;
    mocks.load.mockImplementationOnce(() => new Promise<Blob>(resolve => { finish = resolve; }));
    const view = render(<ProjectDocumentThumbnail {...props} />);
    intersect();
    view.rerender(<ProjectDocumentThumbnail {...props} document={{ ...source, storagePath: 'projects/1/revised.pdf' }} />);
    await act(async () => finish(new Blob(['late bytes'])));
    expect(view.container.querySelector('img')).toBeNull();
    expect(mocks.createUrl).not.toHaveBeenCalled();
    intersect();
    await waitFor(() => expect(view.container.querySelector('img')).toBeInTheDocument());
    view.unmount();
  });

  it('shows an honest extension fallback for denied/unsupported files and image decoding errors', async () => {
    mocks.load.mockRejectedValueOnce(new Error('Access denied'));
    const view = render(<ProjectDocumentThumbnail {...props} />);
    intersect();
    await waitFor(() => expect(view.container).toHaveTextContent('Aperçu indisponible'));
    expect(view.container).toHaveTextContent('PDF');
    expect(view.container.querySelector('svg')).toBeNull();
    view.rerender(<ProjectDocumentThumbnail {...props} revisionKey="retry-after-new-revision" />);
    intersect();
    await waitFor(() => expect(view.container.querySelector('img')).toBeInTheDocument());
    fireEvent.error(view.container.querySelector('img')!);
    expect(view.container).toHaveTextContent('Aperçu indisponible');
    expect(mocks.revokeUrl).toHaveBeenCalledWith('blob:private-preview-1');
    view.unmount();
  });
});
