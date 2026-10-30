import type { SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useRef, useState } from 'react';
import { loadProjectDocumentBlob, type ProjectDocumentFileReference } from './projectDocumentAssets';
import { PROJECT_THUMBNAIL_FILE_LIMIT, renderProjectDocumentThumbnail } from './projectDocumentThumbnailRenderer';

interface Props {
  client: SupabaseClient;
  document: ProjectDocumentFileReference;
  /** Source revision/hash/date supplied by the owning document record. */
  revisionKey: string;
  /** Other role-gated modules can authorize and load bytes through their own RPC. */
  loadBlob?: (signal: AbortSignal) => Promise<Blob>;
}

interface CacheEntry {
  controller: AbortController;
  promise: Promise<Blob>;
  users: number;
}
// Private bytes live only while consumers are mounted. Different clients never share content.
const clientThumbnails = new WeakMap<SupabaseClient, Map<string, CacheEntry>>();
const loaderIdentities = new WeakMap<NonNullable<Props['loadBlob']>, number>();
let lastLoaderIdentity = 0;
function loaderKey(loader?: Props['loadBlob']) {
  if (!loader) return 'project-storage';
  let identity = loaderIdentities.get(loader);
  if (identity === undefined) { identity = ++lastLoaderIdentity; loaderIdentities.set(loader, identity); }
  return `authorized-loader:${identity}`;
}

function acquireThumbnail(client: SupabaseClient, file: ProjectDocumentFileReference, key: string, loader?: Props['loadBlob']) {
  let cache = clientThumbnails.get(client);
  if (!cache) { cache = new Map(); clientThumbnails.set(client, cache); }
  let entry = cache.get(key);
  if (!entry) {
    const controller = new AbortController();
    const promise = file.fileSizeBytes && file.fileSizeBytes > PROJECT_THUMBNAIL_FILE_LIMIT
      ? Promise.reject(new Error('Ce fichier dépasse la taille maximale de prévisualisation.'))
      : Promise.resolve().then(() => loader ? loader(controller.signal) : loadProjectDocumentBlob(client, file, controller.signal))
        .then(blob => renderProjectDocumentThumbnail(blob, file.fileName, file.mimeType || blob.type, controller.signal));
    entry = { controller, promise, users: 0 };
    cache.set(key, entry);
  }
  entry.users += 1;
  const current = entry;
  return { promise: current.promise, release: () => {
    current.users -= 1;
    if (!current.users) { current.controller.abort(); if (cache.get(key) === current) cache.delete(key); }
  } };
}

/** Passive content: the owning card supplies the button and its accessible name. */
export function ProjectDocumentThumbnail({ client, document, revisionKey, loadBlob }: Props) {
  const target = useRef<HTMLSpanElement>(null);
  const [visibility, setVisibility] = useState<{ client: SupabaseClient; key: string } | null>(null);
  const [preview, setPreview] = useState<{ client: SupabaseClient; key: string; url?: string; failed?: boolean } | null>(null);
  const key = JSON.stringify([loaderKey(loadBlob), revisionKey, document.fileName, document.mimeType, document.storageBucket, document.storagePath, document.sharePointWebUrl, document.fileSizeBytes]);
  const visible = visibility?.client === client && visibility.key === key;
  const current = preview?.client === client && preview.key === key ? preview : null;
  const extension = document.fileName.split('.').at(-1)?.toUpperCase() || 'FICHIER';

  useEffect(() => {
    const element = target.current;
    if (!element) return;
    if (typeof IntersectionObserver === 'undefined') { setVisibility({ client, key }); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisibility({ client, key }); observer.disconnect(); }
    }, { rootMargin: '100px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, [client, key]);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    let url = '';
    const acquired = acquireThumbnail(client, document, key, loadBlob);
    void acquired.promise.then(blob => {
      if (!active) return;
      url = URL.createObjectURL(blob);
      setPreview({ client, key, url });
    }).catch(() => { if (active) setPreview({ client, key, failed: true }); });
    return () => { active = false; acquired.release(); if (url) URL.revokeObjectURL(url); };
    // Key contains every source field; changes unrelated to the file do not restart a private read.
  }, [client, key, visible]);

  return <span ref={target} className={`project-document-thumbnail${current?.failed ? ' is-unavailable' : current?.url ? ' is-ready' : ' is-loading'}`} aria-hidden="true" data-preview-state={current?.failed ? 'unavailable' : current?.url ? 'ready' : 'loading'}>
    {current?.url && !current.failed ? <img alt="" src={current.url} decoding="async" onError={() => { if (current.url) URL.revokeObjectURL(current.url); setPreview({ client, key, failed: true }); }} />
      : current?.failed ? <><strong>{extension.length <= 8 ? extension : 'FICHIER'}</strong><small>Aperçu indisponible</small></>
        : <small>Chargement de l’aperçu…</small>}
  </span>;
}
