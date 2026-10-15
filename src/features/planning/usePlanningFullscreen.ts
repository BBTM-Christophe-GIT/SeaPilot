import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

type FullscreenMode = 'none' | 'native' | 'fallback';
type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
  webkitRequestFullScreen?: () => Promise<void> | void;
};
type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitCurrentFullScreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => Promise<void> | void;
  webkitCancelFullScreen?: () => Promise<void> | void;
};

function fullscreenElement(document: FullscreenDocument): Element | null {
  return document.fullscreenElement || document.webkitFullscreenElement || document.webkitCurrentFullScreenElement || null;
}

function exitWorkspaceFullscreen(document: FullscreenDocument, workspace: HTMLElement): Promise<void> {
  if (fullscreenElement(document) !== workspace) return Promise.resolve();
  const exit = document.fullscreenElement === workspace && typeof document.exitFullscreen === 'function'
    ? document.exitFullscreen
    : document.webkitExitFullscreen || document.webkitCancelFullScreen || document.exitFullscreen;
  try {
    return Promise.resolve(exit?.call(document)).catch(() => undefined);
  } catch {
    return Promise.resolve();
  }
}

function preserveStyles(element: HTMLElement, properties: string[]): () => void {
  const original = properties.map((property) => ({
    property,
    value: element.style.getPropertyValue(property),
    priority: element.style.getPropertyPriority(property),
  }));
  return () => {
    for (const { property, value, priority } of original) {
      if (value) element.style.setProperty(property, value, priority);
      else element.style.removeProperty(property);
    }
  };
}

/** Native fullscreen when available, with an in-page viewport mode for iPad browsers. */
export function usePlanningFullscreen(workspaceRef: RefObject<HTMLElement | null>) {
  const [mode, setMode] = useState<FullscreenMode>('none');
  const modeRef = useRef<FullscreenMode>('none');
  const desiredRef = useRef(false);
  const cancelledEntryRef = useRef(false);
  const ownedWorkspaceRef = useRef<HTMLElement | null>(null);
  const mountedRef = useRef(true);
  const generationRef = useRef(0);

  const updateMode = useCallback((next: FullscreenMode) => {
    modeRef.current = next;
    if (mountedRef.current) setMode(next);
  }, []);

  const leaveFullscreen = useCallback(() => {
    desiredRef.current = false;
    cancelledEntryRef.current = true;
    generationRef.current += 1;
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const document = workspace.ownerDocument as FullscreenDocument;
    if (fullscreenElement(document) === workspace) {
      void exitWorkspaceFullscreen(document, workspace).then(() => {
        if (fullscreenElement(document) !== workspace) updateMode('none');
      });
    } else {
      updateMode('none');
    }
  }, [updateMode, workspaceRef]);

  const toggleFullscreen = useCallback(() => {
    if (desiredRef.current || modeRef.current !== 'none') {
      leaveFullscreen();
      return;
    }
    const workspace = workspaceRef.current as FullscreenElement | null;
    if (!workspace) return;
    const document = workspace.ownerDocument as FullscreenDocument;
    // Never dismiss or replace another component's native fullscreen session.
    if (fullscreenElement(document) && fullscreenElement(document) !== workspace) return;

    desiredRef.current = true;
    cancelledEntryRef.current = false;
    ownedWorkspaceRef.current = workspace;
    const generation = ++generationRef.current;
    updateMode('fallback');
    const request = document.fullscreenEnabled !== false && typeof workspace.requestFullscreen === 'function'
      ? workspace.requestFullscreen
      : document.webkitFullscreenEnabled !== false
        ? workspace.webkitRequestFullscreen || workspace.webkitRequestFullScreen
        : undefined;
    if (!request) return;

    try {
      // Keep this call synchronous with the user's tap: Safari requires activation.
      const requested = request.call(workspace);
      void Promise.resolve(requested).then(() => {
        if (!mountedRef.current || generation !== generationRef.current || !desiredRef.current) {
          // A delayed browser response must not reopen fullscreen after leaving.
          if (!desiredRef.current) void exitWorkspaceFullscreen(document, workspace);
          return;
        }
        if (fullscreenElement(document) === workspace) updateMode('native');
      }).catch(() => {
        // The viewport mode is already active, including when the API is refused.
      });
    } catch {
      // Older WebKit can throw synchronously instead of returning a rejection.
    }
  }, [leaveFullscreen, updateMode, workspaceRef]);

  useEffect(() => {
    mountedRef.current = true;
    // The workspace appears after the Planning loading screen. Subscribe now and
    // resolve the ref in each handler instead of missing that later DOM node.
    const document = (workspaceRef.current?.ownerDocument || window.document) as FullscreenDocument;
    const handleChange = () => {
      const workspace = workspaceRef.current || ownedWorkspaceRef.current;
      if (!workspace) return;
      if (fullscreenElement(document) === workspace) {
        if (!cancelledEntryRef.current) {
          desiredRef.current = true;
          ownedWorkspaceRef.current = workspace;
          updateMode('native');
        }
        else void exitWorkspaceFullscreen(document, workspace);
      } else if (modeRef.current === 'native') {
        desiredRef.current = false;
        cancelledEntryRef.current = true;
        generationRef.current += 1;
        updateMode('none');
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || modeRef.current !== 'fallback') return;
      // A dialog/menu owns its first Escape; preserve edits and normal dismissal.
      if (workspaceRef.current?.querySelector('[role="dialog"], [role="menu"], [aria-modal="true"]')) return;
      event.preventDefault();
      leaveFullscreen();
    };
    document.addEventListener('fullscreenchange', handleChange);
    document.addEventListener('webkitfullscreenchange', handleChange);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      mountedRef.current = false;
      desiredRef.current = false;
      cancelledEntryRef.current = true;
      generationRef.current += 1;
      document.removeEventListener('fullscreenchange', handleChange);
      document.removeEventListener('webkitfullscreenchange', handleChange);
      document.removeEventListener('keydown', handleKeyDown);
      const workspace = ownedWorkspaceRef.current;
      if (workspace) void exitWorkspaceFullscreen(document, workspace);
    };
  }, [leaveFullscreen, updateMode, workspaceRef]);

  useLayoutEffect(() => {
    if (mode !== 'fallback') return;
    const document = workspaceRef.current?.ownerDocument;
    const view = document?.defaultView;
    if (!document || !view) return;
    const { body, documentElement } = document;
    const { scrollX, scrollY } = view;
    const restoreBody = preserveStyles(body, ['overflow', 'position', 'top', 'left', 'width']);
    const restoreRoot = preserveStyles(documentElement, ['overflow']);
    const workspace = workspaceRef.current;
    const restoreViewport = workspace ? preserveStyles(workspace, [
      '--planning-fullscreen-top', '--planning-fullscreen-left',
      '--planning-fullscreen-width', '--planning-fullscreen-height',
    ]) : () => undefined;
    const hadFallbackClass = body.classList.contains('planning-fullscreen-fallback-active');
    body.classList.add('planning-fullscreen-fallback-active');
    documentElement.style.setProperty('overflow', 'hidden');
    body.style.setProperty('overflow', 'hidden');
    body.style.setProperty('position', 'fixed');
    body.style.setProperty('top', `${-scrollY}px`);
    body.style.setProperty('left', `${-scrollX}px`);
    body.style.setProperty('width', '100%');
    const viewport = view.visualViewport;
    const fitViewport = () => {
      if (!workspace) return;
      workspace.style.setProperty('--planning-fullscreen-top', `${viewport?.offsetTop ?? 0}px`);
      workspace.style.setProperty('--planning-fullscreen-left', `${viewport?.offsetLeft ?? 0}px`);
      workspace.style.setProperty('--planning-fullscreen-width', `${viewport?.width ?? view.innerWidth}px`);
      workspace.style.setProperty('--planning-fullscreen-height', `${viewport?.height ?? view.innerHeight}px`);
    };
    fitViewport();
    viewport?.addEventListener('resize', fitViewport);
    viewport?.addEventListener('scroll', fitViewport);
    view.addEventListener('resize', fitViewport);
    view.addEventListener('orientationchange', fitViewport);
    return () => {
      viewport?.removeEventListener('resize', fitViewport);
      viewport?.removeEventListener('scroll', fitViewport);
      view.removeEventListener('resize', fitViewport);
      view.removeEventListener('orientationchange', fitViewport);
      if (!hadFallbackClass) body.classList.remove('planning-fullscreen-fallback-active');
      restoreViewport();
      restoreBody();
      restoreRoot();
      if (view.scrollX !== scrollX || view.scrollY !== scrollY) view.scrollTo(scrollX, scrollY);
    };
  }, [mode, workspaceRef]);

  return { isFullscreen: mode !== 'none', isFallbackFullscreen: mode === 'fallback', toggleFullscreen };
}
