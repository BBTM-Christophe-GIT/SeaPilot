import { act, cleanup, fireEvent, renderHook } from '@testing-library/react';
import { StrictMode, type RefObject } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePlanningFullscreen } from './usePlanningFullscreen';

const restoreProperties: (() => void)[] = [];
const workspaces: HTMLElement[] = [];

function property(object: object, key: string, value: unknown) {
  const original = Object.getOwnPropertyDescriptor(object, key);
  Object.defineProperty(object, key, { configurable: true, writable: true, value });
  restoreProperties.push(() => {
    if (original) Object.defineProperty(object, key, original);
    else Reflect.deleteProperty(object, key);
  });
}

function workspace() {
  const element = document.createElement('section');
  document.body.append(element);
  workspaces.push(element);
  return element;
}

function setup(element = workspace()) {
  const ref: RefObject<HTMLElement | null> = { current: element };
  const hook = renderHook(() => usePlanningFullscreen(ref));
  return { ...hook, element, ref };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((finish) => { resolve = finish; });
  return { promise, resolve };
}

function nativeState(key = 'fullscreenElement', event = 'fullscreenchange') {
  let current: Element | null = null;
  const original = Object.getOwnPropertyDescriptor(document, key);
  Object.defineProperty(document, key, { configurable: true, get: () => current });
  restoreProperties.push(() => {
    if (original) Object.defineProperty(document, key, original);
    else Reflect.deleteProperty(document, key);
  });
  return (element: Element | null) => {
    current = element;
    document.dispatchEvent(new Event(event));
  };
}

afterEach(() => {
  cleanup();
  for (const restore of restoreProperties.splice(0).reverse()) restore();
  for (const element of workspaces.splice(0)) element.remove();
  vi.restoreAllMocks();
});

describe('Planning fullscreen across browser capabilities', () => {
  it('uses viewport fullscreen without a native API and exits with the same button', () => {
    const { result } = setup();
    act(() => result.current.toggleFullscreen());
    expect(result.current).toMatchObject({ isFullscreen: true, isFallbackFullscreen: true });
    expect(document.body).toHaveClass('planning-fullscreen-fallback-active');
    act(() => result.current.toggleFullscreen());
    expect(result.current).toMatchObject({ isFullscreen: false, isFallbackFullscreen: false });
    expect(document.body).not.toHaveClass('planning-fullscreen-fallback-active');
    expect(document.body.style.position).toBe('');
  });

  it.each(['throw', 'reject'] as const)('keeps the viewport mode when a native request fails with %s', async (failure) => {
    const { result, element } = setup();
    property(element, 'requestFullscreen', vi.fn(() => {
      if (failure === 'throw') throw new Error('Unavailable');
      return Promise.reject(new Error('Unavailable'));
    }));
    await act(async () => result.current.toggleFullscreen());
    expect(result.current).toMatchObject({ isFullscreen: true, isFallbackFullscreen: true });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(result.current.isFullscreen).toBe(false);
  });

  it('requests standard fullscreen synchronously in the gesture and follows native entry and exit', async () => {
    const { result, element } = setup();
    const setNative = nativeState();
    const request = vi.fn(function (this: HTMLElement) { expect(this).toBe(element); setNative(element); return Promise.resolve(); });
    property(element, 'requestFullscreen', request);
    const exit = vi.fn(() => { setNative(null); return Promise.resolve(); });
    property(document, 'exitFullscreen', exit);
    act(() => {
      result.current.toggleFullscreen();
      expect(request).toHaveBeenCalledOnce();
    });
    expect(result.current).toMatchObject({ isFullscreen: true, isFallbackFullscreen: false });
    expect(document.body).not.toHaveClass('planning-fullscreen-fallback-active');
    await act(async () => result.current.toggleFullscreen());
    expect(exit).toHaveBeenCalledOnce();
    expect(result.current.isFullscreen).toBe(false);
  });

  it.each([
    ['webkitRequestFullscreen', 'webkitFullscreenElement', 'webkitExitFullscreen'],
    ['webkitRequestFullScreen', 'webkitCurrentFullScreenElement', 'webkitCancelFullScreen'],
  ])('supports the older iPad %s API and native exit controls', async (requestKey, elementKey, exitKey) => {
    const { result, element } = setup();
    const setNative = nativeState(elementKey, 'webkitfullscreenchange');
    const request = vi.fn(() => setNative(element));
    const exit = vi.fn(() => setNative(null));
    property(element, requestKey, request);
    property(document, exitKey, exit);
    await act(async () => result.current.toggleFullscreen());
    expect(request).toHaveBeenCalledOnce();
    expect(result.current).toMatchObject({ isFullscreen: true, isFallbackFullscreen: false });
    await act(async () => result.current.toggleFullscreen());
    expect(exit).toHaveBeenCalledOnce();
    expect(result.current.isFullscreen).toBe(false);
  });

  it('uses WebKit when the standard API explicitly reports that it is disabled', async () => {
    const { result, element } = setup();
    const standard = vi.fn();
    const webkit = vi.fn();
    property(document, 'fullscreenEnabled', false);
    property(element, 'requestFullscreen', standard);
    property(element, 'webkitRequestFullscreen', webkit);
    await act(async () => result.current.toggleFullscreen());
    expect(standard).not.toHaveBeenCalled();
    expect(webkit).toHaveBeenCalledOnce();
    expect(result.current.isFallbackFullscreen).toBe(true);
  });

  it('synchronizes browser-controlled native exit without calling exit again', async () => {
    const { result, element } = setup();
    const setNative = nativeState();
    property(element, 'requestFullscreen', vi.fn(() => { setNative(element); return Promise.resolve(); }));
    const exit = vi.fn();
    property(document, 'exitFullscreen', exit);
    await act(async () => result.current.toggleFullscreen());
    act(() => setNative(null));
    expect(result.current.isFullscreen).toBe(false);
    expect(exit).not.toHaveBeenCalled();
  });

  it('subscribes before the workspace exists during asynchronous page loading', async () => {
    const ref: RefObject<HTMLElement | null> = { current: null };
    const { result, unmount } = renderHook(() => usePlanningFullscreen(ref));
    const element = workspace();
    ref.current = element;
    const setNative = nativeState();
    property(element, 'requestFullscreen', vi.fn(() => { setNative(element); return Promise.resolve(); }));
    const exit = vi.fn(() => { setNative(null); return Promise.resolve(); });
    property(document, 'exitFullscreen', exit);
    await act(async () => result.current.toggleFullscreen());
    expect(result.current.isFallbackFullscreen).toBe(false);
    act(() => setNative(null));
    expect(result.current.isFullscreen).toBe(false);
    property(element, 'requestFullscreen', undefined);
    act(() => result.current.toggleFullscreen());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(result.current.isFullscreen).toBe(false);
    await act(async () => result.current.toggleFullscreen());
    act(() => setNative(element));
    unmount();
    expect(exit).toHaveBeenCalledOnce();
  });

  it('leaves other components native fullscreen untouched on toggle and unmount', () => {
    const { result, element, unmount } = setup();
    const other = workspace();
    const setNative = nativeState();
    const request = vi.fn();
    const exit = vi.fn();
    property(element, 'requestFullscreen', request);
    property(document, 'exitFullscreen', exit);
    act(() => setNative(other));
    act(() => result.current.toggleFullscreen());
    expect(result.current.isFullscreen).toBe(false);
    unmount();
    expect(request).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });

  it.each(['button', 'unmount'] as const)('dismisses late native success after leaving by %s', async (leave) => {
    const { result, element, unmount } = setup();
    const pending = deferred();
    const setNative = nativeState();
    property(element, 'requestFullscreen', vi.fn(() => pending.promise));
    const exit = vi.fn(() => { setNative(null); return Promise.resolve(); });
    property(document, 'exitFullscreen', exit);
    act(() => result.current.toggleFullscreen());
    if (leave === 'button') act(() => result.current.toggleFullscreen());
    else unmount();
    await act(async () => { setNative(element); pending.resolve(); });
    expect(exit).toHaveBeenCalledOnce();
    expect(document.fullscreenElement).toBeNull();
    expect(document.body).not.toHaveClass('planning-fullscreen-fallback-active');
  });

  it.each(['dialog', 'menu'] as const)('preserves Escape for an open %s before exiting the viewport', (role) => {
    const { result, element } = setup();
    act(() => result.current.toggleFullscreen());
    const overlay = document.createElement('div');
    overlay.setAttribute('role', role);
    element.append(overlay);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(result.current.isFullscreen).toBe(true);
    overlay.remove();
    const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    event.preventDefault();
    fireEvent(document, event);
    expect(result.current.isFullscreen).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(result.current.isFullscreen).toBe(false);
  });

  it('restores exact inline styles, priorities and scroll position when the viewport closes', () => {
    const oldBodyStyle = document.body.getAttribute('style');
    const oldRootStyle = document.documentElement.getAttribute('style');
    restoreProperties.push(() => {
      if (oldBodyStyle === null) document.body.removeAttribute('style'); else document.body.setAttribute('style', oldBodyStyle);
      if (oldRootStyle === null) document.documentElement.removeAttribute('style'); else document.documentElement.setAttribute('style', oldRootStyle);
    });
    document.body.style.setProperty('position', 'relative', 'important');
    document.body.style.setProperty('overflow', 'clip');
    document.documentElement.style.setProperty('overflow', 'auto', 'important');
    property(window, 'scrollX', 10);
    property(window, 'scrollY', 240);
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    const { result, unmount } = setup();
    act(() => result.current.toggleFullscreen());
    expect(document.body.style.top).toBe('-240px');
    expect(document.body.style.left).toBe('-10px');
    property(window, 'scrollY', 0);
    unmount();
    expect(document.body.style.position).toBe('relative');
    expect(document.body.style.getPropertyPriority('position')).toBe('important');
    expect(document.body.style.overflow).toBe('clip');
    expect(document.documentElement.style.overflow).toBe('auto');
    expect(document.documentElement.style.getPropertyPriority('overflow')).toBe('important');
    expect(scroll).toHaveBeenCalledExactlyOnceWith(10, 240);
  });

  it('fits the visual viewport during keyboard/orientation changes and removes all listeners and variables', () => {
    const viewport = Object.assign(new EventTarget(), { offsetTop: 2, offsetLeft: 3, width: 1024, height: 740 });
    property(window, 'visualViewport', viewport);
    const add = vi.spyOn(viewport, 'addEventListener');
    const remove = vi.spyOn(viewport, 'removeEventListener');
    const { result, element, unmount } = setup();
    element.style.setProperty('--planning-fullscreen-top', '9px');
    act(() => result.current.toggleFullscreen());
    expect(element.style.getPropertyValue('--planning-fullscreen-width')).toBe('1024px');
    viewport.height = 340;
    viewport.offsetTop = 15;
    viewport.dispatchEvent(new Event('resize'));
    expect(element.style.getPropertyValue('--planning-fullscreen-height')).toBe('340px');
    expect(element.style.getPropertyValue('--planning-fullscreen-top')).toBe('15px');
    viewport.offsetLeft = 18;
    viewport.dispatchEvent(new Event('scroll'));
    expect(element.style.getPropertyValue('--planning-fullscreen-left')).toBe('18px');
    unmount();
    expect(element.style.getPropertyValue('--planning-fullscreen-top')).toBe('9px');
    expect(element.style.getPropertyValue('--planning-fullscreen-width')).toBe('');
    expect(add.mock.calls.map(([event]) => event)).toEqual(['resize', 'scroll']);
    expect(remove.mock.calls.map(([event]) => event)).toEqual(['resize', 'scroll']);
  });

  it('keeps viewport entry usable after React Strict Mode effect replay', () => {
    const element = workspace();
    const ref = { current: element };
    const { result } = renderHook(() => usePlanningFullscreen(ref), { wrapper: StrictMode });
    act(() => result.current.toggleFullscreen());
    expect(result.current.isFullscreen).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(result.current.isFullscreen).toBe(false);
  });
});
