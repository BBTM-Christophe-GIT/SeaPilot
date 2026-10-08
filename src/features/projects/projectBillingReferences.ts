import type { SupabaseClient } from '@supabase/supabase-js';

export interface BillingReference { id: number; scope: number; reference: string }
export interface BillingSelection { includeOperationsInPdf?: boolean; includeExpensesInPdf?: boolean; includeBbtmInPdf?: boolean; includeRawInPdf?: boolean }
export function billingReferenceScope(selection: BillingSelection): number {
  return (selection.includeOperationsInPdf !== false ? 1 : 0)
    + (selection.includeExpensesInPdf !== false ? 2 : 0)
    + (selection.includeBbtmInPdf !== false ? 4 : 0)
    + (selection.includeRawInPdf === true ? 8 : 0);
}
export function billingReferenceScopeLabel(scope: number): string {
  return [scope & 1 ? 'Loyers' : '', scope & 2 ? 'Frais fournisseurs' : '', scope & 4 ? 'Prestations BBTM' : '', scope & 8 ? 'Saisie brute' : ''].filter(Boolean).join(' + ') || 'Opérations seules';
}
export async function fetchBillingReferences(client: SupabaseClient, projectId: number): Promise<BillingReference[]> {
  const { data, error } = await client.from('project_billing_client_references').select('id,scope,reference').eq('project_id', projectId).order('scope');
  if (error) throw error;
  return data || [];
}
export async function saveBillingReference(client: SupabaseClient, projectId: number, scope: number, reference: string): Promise<void> {
  const { error } = await client.rpc('projects_save_billing_reference', { target_project: projectId, target_scope: scope, target_reference: reference.trim() });
  if (error) throw error;
}
