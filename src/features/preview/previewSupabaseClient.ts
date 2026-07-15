import type { SupabaseClient } from '@supabase/supabase-js';

const PREVIEW_WRITE_ERROR = {
  message: 'Les données de cette préversion sont démonstratives et ne peuvent pas être enregistrées.',
};

type PreviewResult = { data: unknown[] | null; error: typeof PREVIEW_WRITE_ERROR | null };

const PLANNING_P11_PREVIEW_ROWS: Record<string, unknown[]> = {
  planning_rotation_series: [],
  planning_rotation_occurrences: [],
  planning_templates: [],
  planning_manning_matrices: [],
  planning_manning_requirements: [],
  stcw_certificates: [
    { id: 1, source_item_id: 1, name: 'Capitaine 500', category: 'Pont', stcw_rules: ['II/3'] },
    { id: 2, source_item_id: 2, name: 'Chef de quart 500', category: 'Pont', stcw_rules: ['II/3'] },
    { id: 3, source_item_id: 3, name: 'Chef mécanicien 750 kW', category: 'Machine', stcw_rules: ['III/3'] },
    { id: 4, source_item_id: 4, name: 'Mécanicien 250 kW', category: 'Machine', stcw_rules: ['III/4'] },
    { id: 5, source_item_id: 5, name: 'Formation de base à la sécurité', category: 'Formation de Sécurité', stcw_rules: ['VI/1'] },
    { id: 6, source_item_id: 6, name: 'Sensibilisation à la sûreté', category: 'Formation de Sécurité', stcw_rules: ['VI/6'] },
    { id: 7, source_item_id: 7, name: 'Qualification navires-citernes', category: 'Navires-citernes', stcw_rules: ['V/1'] },
    { id: 8, source_item_id: 8, name: 'Opérateur SMDSM', category: 'Radiocommunications', stcw_rules: ['IV/2'] },
  ],
};

function createPreviewQuery(result: PreviewResult): object {
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
  from: (table: string) => table in PLANNING_P11_PREVIEW_ROWS
    ? createPreviewQuery({ data: PLANNING_P11_PREVIEW_ROWS[table], error: null })
    : createPreviewQuery({ data: null, error: PREVIEW_WRITE_ERROR }),
  rpc: () => createPreviewQuery({ data: null, error: PREVIEW_WRITE_ERROR }),
} as unknown as SupabaseClient;
