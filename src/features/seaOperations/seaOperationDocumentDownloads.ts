import type { SupabaseClient } from '@supabase/supabase-js';
import { loadSeaOperationProjectDocumentBlob, type SeaOperationProjectDocument } from './seaOperationDocumentQueries';

function safeName(value: string, fallback: string): string {
  const clean = value.replace(/[<>:"/\\|?*]/g, '-').split('').filter(character => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
    .join('').trim().replace(/[. ]+$/g, '') || fallback;
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(clean) ? `_${clean}` : clean;
}

function saveFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = name; link.hidden = true;
  document.body.append(link);
  try { link.click(); }
  finally { link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
}

/** Sea access is checked for every file; no partial archive is offered on denial. */
export async function downloadSeaOperationDocuments(
  client: SupabaseClient, projectId: string, documents: readonly SeaOperationProjectDocument[], archiveName: string, signal?: AbortSignal,
): Promise<{ count: number; fileName: string }> {
  signal?.throwIfAborted();
  if (!documents.length) throw new Error('Sélectionnez au moins un document à télécharger.');
  const blobs: Blob[] = new Array(documents.length);
  const errors: string[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(3, documents.length) }, async () => {
    while (next < documents.length) {
      const index = next++;
      signal?.throwIfAborted();
      try { blobs[index] = await loadSeaOperationProjectDocumentBlob(client, projectId, documents[index], signal, { allowLocalDrive: true }); }
      catch (error) { signal?.throwIfAborted(); errors.push(`${documents[index].fileName} : ${error instanceof Error ? error.message : 'Document indisponible.'}`); }
    }
  }));
  signal?.throwIfAborted();
  if (errors.length) throw new Error(`Téléchargement annulé. ${errors.join(' ; ')}`);
  if (documents.length === 1) {
    const fileName = safeName(documents[0].fileName, 'document');
    saveFile(blobs[0], fileName); return { count: 1, fileName };
  }
  const { default: JSZip } = await import('jszip');
  signal?.throwIfAborted();
  const archive = new JSZip(); const used = new Set<string>();
  for (const [index, document] of documents.entries()) {
    const base = safeName(document.fileName, `document-${index + 1}`);
    const dot = base.lastIndexOf('.'); const stem = dot > 0 ? base.slice(0, dot) : base; const extension = dot > 0 ? base.slice(dot) : '';
    let name = base;
    for (let suffix = 2; used.has(name.normalize('NFKC').toLocaleLowerCase('fr')); suffix += 1) name = `${stem} (${suffix})${extension}`;
    used.add(name.normalize('NFKC').toLocaleLowerCase('fr'));
    archive.file(name, new Uint8Array(await blobs[index].arrayBuffer()));
    signal?.throwIfAborted();
  }
  const blob = await archive.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  signal?.throwIfAborted();
  const fileName = `${safeName(archiveName.replace(/\.zip$/i, ''), 'Documents opération')}.zip`;
  saveFile(blob, fileName); return { count: documents.length, fileName };
}
