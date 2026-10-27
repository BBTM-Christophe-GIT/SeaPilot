import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppDialog } from '../../components/AppDialog';
import { SeaOperationWaypointMapEditor } from './SeaOperationWaypointMapEditor';

const restorations: Array<() => void> = [];
function property(object: object, name: string, descriptor: PropertyDescriptor) {
  const original = Object.getOwnPropertyDescriptor(object, name);
  Object.defineProperty(object, name, { configurable: true, ...descriptor });
  restorations.push(() => { if (original) Object.defineProperty(object, name, original); else Reflect.deleteProperty(object, name); });
}
afterEach(() => { restorations.splice(0).reverse().forEach((restore) => restore()); vi.restoreAllMocks(); });

function setup(onClose = vi.fn(), disabled = false) {
  const add = vi.fn();
  const view = render(<AppDialog title="Fiche Opération en mer" onClose={onClose} footer={<button type="button">Commande extérieure</button>}>
    <p data-testid="outside-map" aria-hidden="false">Contenu de la fiche</p>
    <SeaOperationWaypointMapEditor waypoints={[]} onAddWaypoint={add} disabled={disabled} />
  </AppDialog>);
  if (!disabled) fireEvent.click(screen.getByRole('button', { name: 'Placer les waypoints' }));
  const editor = screen.getByRole('region', { name: 'Placement des waypoints' });
  return { ...view, editor, add, onClose };
}

function nativeApi() {
  let element: Element | null = null;
  property(document, 'fullscreenElement', { get: () => element });
  property(document, 'fullscreenEnabled', { value: true });
  const change = (next: Element | null) => { element = next; document.dispatchEvent(new Event('fullscreenchange')); };
  const exit = vi.fn(() => { change(null); return Promise.resolve(); });
  property(document, 'exitFullscreen', { value: exit });
  return { change, exit, get element() { return element; } };
}

describe('Sea operation map fullscreen lifecycle', () => {
  it('falls back inside AppDialog, isolates focus and restores styles/inert exactly after Escape', async () => {
    property(HTMLElement.prototype, 'requestFullscreen', { value: undefined });
    document.body.style.setProperty('overflow', 'auto', 'important');
    document.documentElement.style.setProperty('overflow', 'clip');
    const { editor, onClose } = setup();
    const outside = screen.getByTestId('outside-map');
    outside.setAttribute('inert', 'preexisting');
    const backdrop = editor.closest('.app-dialog-backdrop')!;
    fireEvent.click(screen.getByRole('button', { name: 'Afficher la carte en plein écran' }));
    expect(editor).toHaveClass('is-fullscreen', 'is-fallback-fullscreen', 'is-placing');
    expect(backdrop).toHaveClass('so-waypoint-map-fullscreen-host');
    expect(outside).toHaveAttribute('aria-hidden', 'true');
    expect(document.body.style.overflow).toBe('hidden');
    const exit = screen.getByRole('button', { name: 'Quitter le plein écran' });
    fireEvent.click(screen.getByText(/^Ports dans cette région/));
    expect(screen.getByText(/^Ports dans cette région/).closest('details')).toHaveAttribute('open');
    // JSDOM concatenates HTML and SVG selector-list results by namespace. A single
    // :is() selector restores the browser's document order for this focus-trap test.
    const browserQuery = editor.querySelectorAll.bind(editor);
    vi.spyOn(editor, 'querySelectorAll').mockImplementation(((selector: string) => browserQuery(`:is(${selector})`)) as typeof editor.querySelectorAll);
    const lastPort = within(editor).getAllByRole('button', { name: /^Ajouter le port |^Choisir un port parmi / }).at(-1)!;
    lastPort.focus();
    expect(lastPort).toHaveFocus();
    fireEvent.keyDown(lastPort, { key: 'Tab' });
    expect(screen.getByRole('button', { name: 'Terminer le placement' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Terminer le placement' }), { key: 'Tab', shiftKey: true });
    expect(lastPort).toHaveFocus();
    fireEvent.keyDown(exit, { key: 'Escape' });
    expect(editor).not.toHaveClass('is-fullscreen');
    expect(editor).toHaveClass('is-placing');
    expect(onClose).not.toHaveBeenCalled();
    expect(outside).toHaveAttribute('inert', 'preexisting');
    expect(outside).toHaveAttribute('aria-hidden', 'false');
    expect(backdrop).not.toHaveClass('so-waypoint-map-fullscreen-host');
    expect(document.body.style.getPropertyValue('overflow')).toBe('auto');
    expect(document.body.style.getPropertyPriority('overflow')).toBe('important');
    expect(document.documentElement.style.overflow).toBe('clip');
    fireEvent.keyDown(editor, { key: 'Escape', repeat: true });
    expect(editor).toHaveClass('is-placing');
    await act(async () => { await new Promise((resolve) => requestAnimationFrame(resolve)); });
    expect(screen.getByRole('button', { name: 'Afficher la carte en plein écran' })).toHaveFocus();
    fireEvent.keyUp(document, { key: 'Escape' });
    fireEvent.keyDown(editor, { key: 'Escape' });
    expect(editor).not.toHaveClass('is-placing');
    expect(onClose).not.toHaveBeenCalled();
    document.body.style.removeProperty('overflow'); document.documentElement.style.removeProperty('overflow');
  });

  it('uses the native request in the click and synchronizes a browser fullscreen exit without ending placement', async () => {
    const api = nativeApi();
    const request = vi.fn(function (this: HTMLElement) { api.change(this); return Promise.resolve(); });
    property(HTMLElement.prototype, 'requestFullscreen', { value: request });
    const { editor, onClose, add } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Zoomer sur la carte' }));
    fireEvent.click(screen.getByRole('button', { name: 'Déplacer la carte vers l’est' }));
    const target = screen.getByText(/Centre :/).textContent;
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Afficher la carte en plein écran' })); expect(request).toHaveBeenCalledOnce(); });
    expect(api.element).toBe(editor);
    expect(editor).toHaveClass('is-fullscreen');
    expect(editor).not.toHaveClass('is-fallback-fullscreen');
    expect(screen.getByText(/Centre :/).textContent).toBe(target);
    act(() => api.change(null));
    expect(editor).not.toHaveClass('is-fullscreen');
    expect(editor).toHaveClass('is-placing');
    expect(screen.getByText(/Centre :/).textContent).toBe(target);
    expect(onClose).not.toHaveBeenCalled(); expect(add).not.toHaveBeenCalled();
  });

  it.each(['reject', 'throw'] as const)('keeps the usable fallback when the native API will %s', async (outcome) => {
    nativeApi();
    const request = vi.fn(() => { if (outcome === 'throw') throw new Error('Not supported'); return Promise.reject(new Error('Not allowed')); });
    property(HTMLElement.prototype, 'requestFullscreen', { value: request });
    const { editor } = setup();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Afficher la carte en plein écran' })); });
    expect(editor).toHaveClass('is-fallback-fullscreen');
    fireEvent.click(screen.getByRole('button', { name: 'Quitter le plein écran' }));
    expect(editor).not.toHaveClass('is-fullscreen');
    expect(editor).toHaveClass('is-placing');
  });

  it('keeps the return command available while busy and restores the surrounding dialog on unmount', () => {
    property(HTMLElement.prototype, 'requestFullscreen', { value: undefined });
    const { editor, rerender, unmount } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Afficher la carte en plein écran' }));
    const backdrop = editor.closest('.app-dialog-backdrop')!;
    rerender(<AppDialog title="Fiche Opération en mer" onClose={vi.fn()}><p data-testid="outside-map">Contenu de la fiche</p><SeaOperationWaypointMapEditor waypoints={[]} onAddWaypoint={vi.fn()} disabled /></AppDialog>);
    expect(screen.getByRole('button', { name: 'Quitter le plein écran' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Ajouter au centre' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Zone de placement des waypoints' })).not.toBeInTheDocument();
    unmount();
    expect(backdrop).not.toHaveClass('so-waypoint-map-fullscreen-host');
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('exits an owned native fullscreen session when unmounted and never exits another element', async () => {
    const api = nativeApi();
    property(HTMLElement.prototype, 'requestFullscreen', { value: function (this: HTMLElement) { api.change(this); return Promise.resolve(); } });
    const { unmount } = setup();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Afficher la carte en plein écran' })); });
    unmount();
    expect(api.exit).toHaveBeenCalledOnce();
    const other = document.createElement('div');
    act(() => api.change(other));
    const second = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Afficher la carte en plein écran' }));
    expect(second.editor).not.toHaveClass('is-fullscreen');
    second.unmount();
    expect(api.exit).toHaveBeenCalledOnce();
  });

  it('closes a native request that resolves after unmount instead of reopening the removed editor', async () => {
    const api = nativeApi();
    let resolve!: () => void;
    property(HTMLElement.prototype, 'requestFullscreen', { value: () => new Promise<void>((finish) => { resolve = finish; }) });
    const { editor, unmount } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Afficher la carte en plein écran' }));
    unmount();
    await act(async () => { api.change(editor); resolve(); await Promise.resolve(); });
    expect(api.exit).toHaveBeenCalledOnce();
    expect(api.element).toBeNull();
  });

  it('keeps a cancelled pending request closed when the browser later accepts it', async () => {
    const api = nativeApi();
    let resolve!: () => void;
    property(HTMLElement.prototype, 'requestFullscreen', { value: () => new Promise<void>((finish) => { resolve = finish; }) });
    const { editor } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Afficher la carte en plein écran' }));
    fireEvent.click(screen.getByRole('button', { name: 'Quitter le plein écran' }));
    await act(async () => { api.change(editor); resolve(); await Promise.resolve(); });
    expect(api.element).toBeNull();
    expect(editor).not.toHaveClass('is-fullscreen');
    expect(editor).toHaveClass('is-placing');
  });

  it('accepts a fresh Escape after focus leaves the window without delivering the previous keyup', () => {
    property(HTMLElement.prototype, 'requestFullscreen', { value: undefined });
    const { editor, onClose } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Afficher la carte en plein écran' }));
    fireEvent.keyDown(editor, { key: 'Escape' });
    expect(editor).toHaveClass('is-placing');
    fireEvent.blur(window);
    // The first Escape keyup happened outside the browser and is never delivered.
    fireEvent.keyDown(editor, { key: 'Escape', repeat: false });
    expect(editor).not.toHaveClass('is-placing');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('returns focus to Placer les waypoints when finishing placement removes the fullscreen toggle', async () => {
    property(HTMLElement.prototype, 'requestFullscreen', { value: undefined });
    const { editor, onClose } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Afficher la carte en plein écran' }));
    fireEvent.click(screen.getByRole('button', { name: 'Terminer le placement' }));
    expect(editor).not.toHaveClass('is-fullscreen', 'is-placing');
    await act(async () => { await new Promise((resolve) => requestAnimationFrame(resolve)); });
    expect(screen.getByRole('button', { name: 'Placer les waypoints' })).toHaveFocus();
    expect(onClose).not.toHaveBeenCalled();
  });
});
