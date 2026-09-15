import type { SupabaseClient } from '@supabase/supabase-js';
import type { DisciplinaryCase, DisciplinaryDocument, DisciplinaryPerson } from './disciplinaryModel';

export async function fetchDisciplinaryData(client: SupabaseClient) {
  const { data: companyId, error: companyError } = await client.rpc('current_planning_company_id');
  if (companyError || !companyId) throw new Error('Entreprise active introuvable.');
  const { data: permitted, error: accessError } = await client.rpc('disciplinary_has_access', { target_company_id: companyId });
  if (accessError || !permitted) throw new Error('Accès réservé aux profils Administration et Direction autorisés.');
  const [people, cases] = await Promise.all([
    client.from('people').select('id,company_id,first_name,last_name,function_label,postal_address,hired_on,departed_on,contract_type')
      .eq('company_id', companyId).order('last_name'),
    client.from('disciplinary_cases').select('id,company_id,person_id,case_date,data,letter,updated_at')
      .eq('company_id', companyId).order('case_date', { ascending: false }).order('updated_at', { ascending: false }),
  ]);
  if (people.error) throw people.error;
  if (cases.error) throw cases.error;
  return { people: (people.data || []).map((p): DisciplinaryPerson => ({
    id: Number(p.id), companyId: Number(p.company_id), firstName: p.first_name, lastName: p.last_name,
    functionLabel: p.function_label || '', postalAddress: p.postal_address || '', hiredOn: p.hired_on || '',
    departedOn: p.departed_on || '', contractType: p.contract_type || '',
  })), cases: (cases.data || []) as DisciplinaryCase[] };
}
export async function saveDisciplinaryCase(client: SupabaseClient, record: DisciplinaryCase): Promise<DisciplinaryCase> {
  const { id, company_id, person_id, case_date, data, letter, updated_at } = record;
  const query = updated_at
    ? client.from('disciplinary_cases').update({ data, letter }).eq('id', id).eq('updated_at', updated_at)
    : client.from('disciplinary_cases').insert({ id, company_id, person_id, case_date, data, letter });
  const result = await query.select('id,company_id,person_id,case_date,data,letter,updated_at').maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new Error('Ce dossier a été modifié par un autre utilisateur. Rechargez-le avant de poursuivre.');
  return result.data as DisciplinaryCase;
}
export async function fetchDisciplinaryDocuments(client: SupabaseClient, caseIds: string[]): Promise<DisciplinaryDocument[]> {
  if (!caseIds.length) return [];
  const { data, error } = await client.from('disciplinary_documents')
    .select('id,case_id,file_name,drive_path,drive_url,document_date,kind,created_at,letter_snapshot')
    .in('case_id', caseIds).order('document_date', { ascending: false }).order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as DisciplinaryDocument[];
}
export async function registerDisciplinaryDocument(client: SupabaseClient, document: Omit<DisciplinaryDocument, 'created_at'>) {
  const { data, error } = await client.from('disciplinary_documents').insert(document)
    .select('id,case_id,file_name,drive_path,drive_url,document_date,kind,created_at,letter_snapshot').single();
  if (error) throw error;
  return data as DisciplinaryDocument;
}
