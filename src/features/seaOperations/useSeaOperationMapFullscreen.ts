import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';

type FullscreenMode = 'none' | 'fallback' | 'native';

function preserveStyles(element: HTMLElement, names: string[]) {
  const previous = names.map((name) => ({ name, value: element.style.getPropertyValue(name), priority: element.style.getPropertyPriority(name) }));
  return () => previous.forEach(({ name, value, priority }) => value ? element.style.setProperty(name, value, priority) : element.style.removeProperty(name));
}

function leaveOwnedFullscreen(document: Document, element: HTMLElement) {
  if (document.fullscreenElement !== element || typeof document.exitFullscreen !== 'function') return Promise.resolve();
  try { return Promise.resolve(document.exitFullscreen()).catch(() => undefined); }
  catch { return Promise.resolve(); }
}

/** Keeps one editor mounted, including when a browser refuses the native fullscreen request. */
export function useSeaOperationMapFullscreen(containerRef: RefObject<HTMLElement | null>, toggleRef: RefObject<HTMLButtonElement | null>, resetInteraction: () => void, fallbackFocusRef?: RefObject<HTMLButtonElement | null>) {
  const [mode, setMode] = useState<FullscreenMode>('none');
  const modeRef = useRef<FullscreenMode>('none');
  const desired = useRef(false);
  const mounted = useRef(true);
  const generation = useRef(0);
  const owned = useRef<HTMLElement | null>(null);
  const isFullscreen = mode !== 'none';
  const updateMode = useCallback((value: FullscreenMode) => { modeRef.current = value; if (mounted.current) setMode(value); }, []);

  const exitFullscreen = useCallback(() => {
    desired.current = false;
    generation.current += 1;
    resetInteraction();
    const element = containerRef.current || owned.current;
    if (!element) return;
    const document = element.ownerDocument;
    if (document.fullscreenElement === element) {
      void leaveOwnedFullscreen(document, element).then(() => { if (document.fullscreenElement !== element) updateMode('none'); });
    } else updateMode('none');
  }, [containerRef, resetInteraction, updateMode]);

  const enterFullscreen = useCallback(() => {
    const element = containerRef.current;
    if (!element || desired.current) return;
    const document = element.ownerDocument;
    if (document.fullscreenElement && document.fullscreenElement !== element) return;
    desired.current = true;
    owned.current = element;
    const requestGeneration = ++generation.current;
    resetInteraction();
    updateMode('fallback');
    if (document.fullscreenEnabled === false || typeof element.requestFullscreen !== 'function') return;
    try {
      // The request must run inside the original click/tap, before any await.
      const request = element.requestFullscreen();
      void Promise.resolve(request).then(() => {
        if (!mounted.current || requestGeneration !== generation.current || !desired.current) {
          if (!mounted.current || !desired.current) void leaveOwnedFullscreen(document, element);
          return;
        }
        if (document.fullscreenElement === element) updateMode('native');
      }).catch(() => { /* The usable viewport fallback is already open. */ });
    } catch { /* Some browsers throw synchronously; retain the viewport fallback. */ }
  }, [containerRef, resetInteraction, updateMode]);

  useEffect(() => {
    mounted.current = true;
    const document = containerRef.current?.ownerDocument || window.document;
    const change = () => {
      const element = containerRef.current || owned.current;
      if (!element) return;
      if (document.fullscreenElement === element) {
        if (desired.current) { resetInteraction(); updateMode('native'); }
        else void leaveOwnedFullscreen(document, element);
      } else if (modeRef.current === 'native') {
        desired.current = false;
        generation.current += 1;
        resetInteraction();
        updateMode('none');
      }
    };
    document.addEventListener('fullscreenchange', change);
    return () => {
      mounted.current = false;
      desired.current = false;
      generation.current += 1;
      document.removeEventListener('fullscreenchange', change);
      if (owned.current) void leaveOwnedFullscreen(document, owned.current);
    };
  }, [containerRef, resetInteraction, updateMode]);

  useLayoutEffect(() => {
    if (!isFullscreen || !containerRef.current) return;
    const element = containerRef.current;
    const document = element.ownerDocument;
    const view = document.defaultView;
    const restored: Array<() => void> = [];
    // Only siblings become inert. An ancestor containing the editor must stay active.
    for (let branch: HTMLElement | null = element; branch?.parentElement; branch = branch.parentElement) {
      for (const sibling of branch.parentElement.children) {
        if (sibling === branch || !(sibling instanceof HTMLElement)) continue;
        const inert = sibling.getAttribute('inert'), hidden = sibling.getAttribute('aria-hidden');
        sibling.setAttribute('inert', ''); sibling.setAttribute('aria-hidden', 'true');
        restored.push(() => {
          if (inert === null) sibling.removeAttribute('inert'); else sibling.setAttribute('inert', inert);
          if (hidden === null) sibling.removeAttribute('aria-hidden'); else sibling.setAttribute('aria-hidden', hidden);
        });
      }
      if (branch.parentElement === document.body) break;
    }
    const frame = view?.requestAnimationFrame(() => toggleRef.current?.focus({ preventScroll: true }));
    return () => {
      if (frame !== undefined) view?.cancelAnimationFrame(frame);
      restored.reverse().forEach((restore) => restore());
      if (mounted.current) view?.requestAnimationFrame(() => {
        const control = [toggleRef.current, fallbackFocusRef?.current].find((candidate) => candidate?.isConnected && !candidate.disabled);
        if (control) control.focus({ preventScroll: true });
        else if (containerRef.current?.isConnected) {
          const target = containerRef.current, previousTabIndex = target.getAttribute('tabindex');
          target.tabIndex = -1; target.focus({ preventScroll: true });
          if (previousTabIndex === null) target.removeAttribute('tabindex'); else target.setAttribute('tabindex', previousTabIndex);
        }
      });
    };
  }, [isFullscreen, containerRef, toggleRef, fallbackFocusRef]);

  useLayoutEffect(() => {
    if (mode !== 'fallback' || !containerRef.current) return;
    const element = containerRef.current, document = element.ownerDocument, view = document.defaultView;
    if (!view) return;
    const backdrop = element.closest<HTMLElement>('.app-dialog-backdrop');
    const hadClass = backdrop?.classList.contains('so-waypoint-map-fullscreen-host');
    backdrop?.classList.add('so-waypoint-map-fullscreen-host');
    const restoreBody = preserveStyles(document.body, ['overflow', 'position', 'top', 'left', 'width']);
    const restoreRoot = preserveStyles(document.documentElement, ['overflow']);
    const restoreElement = preserveStyles(element, ['--so-map-fullscreen-top', '--so-map-fullscreen-left', '--so-map-fullscreen-width', '--so-map-fullscreen-height']);
    const { scrollX, scrollY } = view;
    document.documentElement.style.setProperty('overflow', 'hidden');
    document.body.style.setProperty('overflow', 'hidden');
    document.body.style.setProperty('position', 'fixed');
    document.body.style.setProperty('top', `${-scrollY}px`);
    document.body.style.setProperty('left', `${-scrollX}px`);
    document.body.style.setProperty('width', '100%');
    const viewport = view.visualViewport;
    const resize = () => {
      resetInteraction();
      element.style.setProperty('--so-map-fullscreen-top', `${viewport?.offsetTop ?? 0}px`);
      element.style.setProperty('--so-map-fullscreen-left', `${viewport?.offsetLeft ?? 0}px`);
      element.style.setProperty('--so-map-fullscreen-width', `${viewport?.width ?? view.innerWidth}px`);
      element.style.setProperty('--so-map-fullscreen-height', `${viewport?.height ?? view.innerHeight}px`);
    };
    resize();
    viewport?.addEventListener('resize', resize); viewport?.addEventListener('scroll', resize);
    view.addEventListener('resize', resize); view.addEventListener('orientationchange', resize);
    return () => {
      viewport?.removeEventListener('resize', resize); viewport?.removeEventListener('scroll', resize);
      view.removeEventListener('resize', resize); view.removeEventListener('orientationchange', resize);
      if (!hadClass) backdrop?.classList.remove('so-waypoint-map-fullscreen-host');
      restoreElement(); restoreBody(); restoreRoot();
      if (view.scrollX !== scrollX || view.scrollY !== scrollY) view.scrollTo(scrollX, scrollY);
    };
  }, [mode, containerRef, resetInteraction]);

  function onKeyDownCapture(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape' && (modeRef.current !== 'none' || event.repeat)) {
      event.preventDefault(); event.stopPropagation();
      if (!event.repeat && modeRef.current !== 'none') exitFullscreen();
      return;
    }
    if (event.key !== 'Tab' || modeRef.current === 'none') return;
    const element = containerRef.current;
    if (!element) return;
    const controls = [...element.querySelectorAll<HTMLElement | SVGElement>('button:not(:disabled), [tabindex="0"]')].filter((control) => !control.closest('[hidden], [inert], [aria-hidden="true"]'));
    event.preventDefault(); event.stopPropagation();
    const index = controls.findIndex((control) => control === element.ownerDocument.activeElement);
    const next = event.shiftKey ? (index <= 0 ? controls.length - 1 : index - 1) : (index + 1) % controls.length;
    (controls[next] || element).focus({ preventScroll: true });
  }

  return { isFullscreen, isFallbackFullscreen: mode === 'fallback', enterFullscreen, exitFullscreen, onKeyDownCapture };
}
