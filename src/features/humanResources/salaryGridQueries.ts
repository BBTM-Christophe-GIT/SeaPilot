import type { SupabaseClient } from '@supabase/supabase-js';

export interface HrSalaryGridRow {
  id: string;
  positionLabel: string;
  ccn: string;
  enimCategory: string;
  conventionalAnnualBase: number;
  indexationPercent: number;
  annualGross: number;
  annualPremium: number;
  totalAnnualBase: number;
  active: boolean;
}

export interface HrSalaryGrid {
  companyId: number;
  rows: HrSalaryGridRow[];
  revision: number;
  updatedAt: string;
}

interface SalaryGridResponse {
  company_id: number;
  rows: HrSalaryGridRow[];
  revision: number;
  updated_at: string | null;
}

function mapSalaryGrid(response: SalaryGridResponse): HrSalaryGrid {
  return { companyId: Number(response.company_id), rows: response.rows, revision: Number(response.revision), updatedAt: response.updated_at || '' };
}

export async function loadHrSalaryGrid(client: SupabaseClient): Promise<HrSalaryGrid> {
  const { data, error } = await client.rpc('get_hr_salary_grid');
  if (error) throw error;
  if (!data || !Array.isArray(data.rows)) throw new Error('La grille salariale est indisponible.');
  return mapSalaryGrid(data as SalaryGridResponse);
}

export async function saveHrSalaryGrid(client: SupabaseClient, rows: HrSalaryGridRow[], expectedRevision: number): Promise<HrSalaryGrid> {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error('Révision de grille invalide.');
  const { data, error } = await client.rpc('save_hr_salary_grid', { p_rows: rows, p_expected_revision: expectedRevision });
  if (error) {
    if (error.code === '40001') throw new Error('La grille a changé. Rechargez-la avant de l’enregistrer.', { cause: error });
    throw error;
  }
  if (!data || !Array.isArray(data.rows)) throw new Error('La grille enregistrée est indisponible.');
  return mapSalaryGrid(data as SalaryGridResponse);
}
