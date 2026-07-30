export const PROJECT_STATUSES = ['Non validé', 'Validé', 'Stand-by météo', 'Facturé'] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

const STATUS_ALIASES = new Map<string, ProjectStatus>([
  ['', 'Non validé'],
  ['a planifier', 'Non validé'],
  ['à planifier', 'Non validé'],
  ['offre transmise', 'Non validé'],
  ['contrat signe', 'Non validé'],
  ['contrat signé', 'Non validé'],
  ['annule', 'Non validé'],
  ['annulé', 'Non validé'],
  ['confirme', 'Validé'],
  ['confirmé', 'Validé'],
  ['en cours', 'Validé'],
  ['valide', 'Validé'],
  ['validé', 'Validé'],
  ['termine', 'Validé'],
  ['terminé', 'Validé'],
  ['stand-by meteo', 'Stand-by météo'],
  ['stand-by météo', 'Stand-by météo'],
  ['standby meteo', 'Stand-by météo'],
  ['standby météo', 'Stand-by météo'],
  ['facture', 'Facturé'],
  ['facturé', 'Facturé'],
  ['a facturer', 'Facturé'],
  ['à facturer', 'Facturé'],
]);

export function normalizeProjectStatus(value: unknown): ProjectStatus {
  const text = typeof value === 'string' ? value : '';
  return STATUS_ALIASES.get(text.trim().toLocaleLowerCase('fr-FR')) || 'Non validé';
}

export function projectStatusToneClass(status: string): 'neutral' | 'success' | 'warning' | 'billed' {
  const normalized = normalizeProjectStatus(status);
  if (normalized === 'Validé') return 'success';
  if (normalized === 'Stand-by météo') return 'warning';
  if (normalized === 'Facturé') return 'billed';
  return 'neutral';
}
