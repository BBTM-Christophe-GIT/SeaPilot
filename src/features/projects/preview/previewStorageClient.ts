import type { SupabaseClient } from '@supabase/supabase-js';

/** Minimal local adapter for the existing billing exporter; never contacts a server. */
export function createPreviewStorageClient(resolveLocalBlob: (path: string) => Promise<Blob>): SupabaseClient {
  const client = {
    from(table: string) {
      if (table !== 'project_drive_files') throw new Error(`Requête interdite dans la préversion : ${table}`);
      let selected = false;
      const filters = new Set<string>();
      const query = {
        select(columns: string) {
          if (columns !== 'path,bytes,sha256,mime_type,drive_file_id') throw new Error('Sélection inconnue dans la préversion.');
          selected = true;
          return query;
        },
        eq(column: string, value: unknown) {
          if (!['source_bucket', 'source_path'].includes(column) || typeof value !== 'string') {
            throw new Error('Filtre inconnu dans la préversion.');
          }
          if (column === 'source_bucket' && value !== 'local-demo') throw new Error('Stockage inconnu dans la préversion.');
          filters.add(column);
          return query;
        },
        async maybeSingle() {
          if (!selected || !filters.has('source_bucket') || !filters.has('source_path')) {
            throw new Error('Recherche documentaire incomplète dans la préversion.');
          }
          // No Drive receipt: the real projectDriveStorage takes its storage fallback.
          return { data: null, error: null };
        },
      };
      return query;
    },
    storage: {
      from(bucket: string) {
        if (bucket !== 'local-demo') throw new Error('Stockage inconnu dans la préversion.');
        return { async download(path: string) { return { data: await resolveLocalBlob(path), error: null }; } };
      },
    },
  };
  return client as unknown as SupabaseClient;
}
