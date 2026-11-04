import type { HrSalaryGridRow } from './salaryGridQueries';

export const SALARY_GRID_COLUMNS = [
  { key: 'positionLabel', label: 'Poste', numeric: false },
  { key: 'ccn', label: 'CCN', numeric: false },
  { key: 'enimCategory', label: 'Catégorie ENIM', numeric: false },
  { key: 'conventionalAnnualBase', label: 'Salaire de base conventionnel', numeric: true },
  { key: 'indexationPercent', label: 'Taux indexation (%)', numeric: true },
  { key: 'annualGross', label: 'Annuel brut', numeric: true },
  { key: 'annualPremium', label: 'Prime annuelle conventionnelle', numeric: true },
  { key: 'totalAnnualBase', label: 'Total annuel de base', numeric: true },
] as const;

type NumericSalaryKey = Extract<typeof SALARY_GRID_COLUMNS[number], { numeric: true }>['key'];
export type SalaryGridDraftRow = Omit<HrSalaryGridRow, NumericSalaryKey> & Record<NumericSalaryKey, string>;
const numericColumns = SALARY_GRID_COLUMNS.filter(column => column.numeric);

/** The final annual column is authoritative, independently of the other source amounts. */
export function salaryGridMonthlyAmount(row: Pick<HrSalaryGridRow, 'totalAnnualBase'>): string {
  if (!Number.isFinite(row.totalAnnualBase) || row.totalAnnualBase < 0) return '';
  return (Math.round(Math.round(row.totalAnnualBase * 100) / 12) / 100).toFixed(2);
}

export function salaryGridConventionLabel(row: Pick<HrSalaryGridRow, 'ccn'>): string {
  if (row.ccn.trim().toLocaleLowerCase('fr') === 'officier') return 'CONVENTION COLLECTIVE DES OFFICIERS DE LA MARINE MARCHANDE';
  if (row.ccn.trim().toLocaleUpperCase('fr') === 'PEX') return 'CONVENTION COLLECTIVE PERSONNELS EXECUTION';
  return row.ccn.trim();
}

export function parseSalaryGridAmount(value: string): number {
  const normalized = value.replace(/[\s\u00a0\u202f€%]/g, '').replace(',', '.');
  return /^\d+(?:\.\d{1,2})?$/.test(normalized) ? Number(normalized) : Number.NaN;
}

export function salaryGridDraftRows(rows: HrSalaryGridRow[]): SalaryGridDraftRow[] {
  return rows.map(row => ({ ...row, conventionalAnnualBase: String(row.conventionalAnnualBase),
    indexationPercent: String(row.indexationPercent), annualGross: String(row.annualGross),
    annualPremium: String(row.annualPremium), totalAnnualBase: String(row.totalAnnualBase) }));
}

export function newSalaryGridDraftRow(): SalaryGridDraftRow {
  return { id: crypto.randomUUID(), positionLabel: '', ccn: '', enimCategory: '', active: true,
    conventionalAnnualBase: '', indexationPercent: '', annualGross: '', annualPremium: '', totalAnnualBase: '' };
}

export function salaryGridRowsFromDraft(drafts: SalaryGridDraftRow[]): { rows: HrSalaryGridRow[]; errors: string[] } {
  const errors: string[] = [];
  const rows: HrSalaryGridRow[] = drafts.map((draft, index) => {
    const label = draft.positionLabel.trim() || `Ligne ${index + 1}`;
    for (const column of numericColumns) {
      const value = parseSalaryGridAmount(draft[column.key]);
      const maximum = column.key === 'indexationPercent' ? 1000 : 100_000_000;
      if (!Number.isFinite(value) || value < 0 || value > maximum) errors.push(`${label} · ${column.label} : montant positif ou nul, avec deux décimales au maximum.`);
    }
    return { ...draft, positionLabel: draft.positionLabel.trim(), ccn: draft.ccn.trim(), enimCategory: draft.enimCategory.trim(),
      conventionalAnnualBase: parseSalaryGridAmount(draft.conventionalAnnualBase),
      indexationPercent: parseSalaryGridAmount(draft.indexationPercent), annualGross: parseSalaryGridAmount(draft.annualGross),
      annualPremium: parseSalaryGridAmount(draft.annualPremium), totalAnnualBase: parseSalaryGridAmount(draft.totalAnnualBase),
    };
  });
  if (rows.length < 1 || rows.length > 100) errors.push('La grille doit contenir entre 1 et 100 postes.');
  const positions = new Set<string>();
  const ids = new Set<string>();
  rows.forEach((row, index) => {
    if (!row.positionLabel || !row.ccn || !row.enimCategory) errors.push(`Ligne ${index + 1} : renseignez le poste, la CCN et la catégorie ENIM.`);
    if (row.positionLabel.length > 500 || row.ccn.length > 120 || row.enimCategory.length > 120) errors.push(`Ligne ${index + 1} : libellé trop long.`);
    const position = row.positionLabel.toLocaleLowerCase('fr').replace(/\s+/g, ' ');
    if (position && positions.has(position)) errors.push(`Le poste « ${row.positionLabel} » existe plusieurs fois.`);
    positions.add(position);
    if (ids.has(row.id)) errors.push(`Ligne ${index + 1} : identifiant de poste en double.`);
    ids.add(row.id);
  });
  return { rows, errors };
}
