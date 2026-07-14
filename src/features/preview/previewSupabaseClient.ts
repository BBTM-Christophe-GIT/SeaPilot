import type { SupabaseClient } from '@supabase/supabase-js';

const PREVIEW_WRITE_ERROR = {
  message: 'Les données de cette préversion sont démonstratives et ne peuvent pas être enregistrées.',
};

type PreviewResult = { data: null; error: typeof PREVIEW_WRITE_ERROR };

function createPreviewQuery(): object {
  const result: PreviewResult = { data: null, error: PREVIEW_WRITE_ERROR };
  const query: object = new Proxy({}, {
    get(_target, property) {
      if (property === 'then') {
        return (resolve: (value: PreviewResult) => unknown, reject?: (reason: unknown) => unknown) =>
          Promise.resolve(result).then(resolve, reject);
      }

      return () => query;
    },
  });

  return query;
}

export const previewSupabaseClient = {
  from: () => createPreviewQuery(),
  rpc: () => createPreviewQuery(),
} as unknown as SupabaseClient;
