import type { SupabaseClient } from '@supabase/supabase-js';
import type { RoleKey } from '../permissions/roles';

export const EMPLOYMENT_CONTRACT_BUCKET = 'hr-employment-contracts';
export const EMPLOYMENT_CONTRACT_MIME = 'application/pdf';
const CONTRACT_SELECT = 'id,company_id,person_id,contract_type,title,file_name,storage_path,file_size_bytes,input_data,created_at';

export interface EmploymentContractRecord {
  id: number;
  companyId: number;
  personId: number;
  contractType: 'CDI' | 'CDD';
  title: string;
  fileName: string;
  storagePath: string;
  fileSizeBytes: number;
  inputData: Record<string, unknown>;
  createdAt: string;
}

interface EmploymentContractRow {
  id: number; company_id: number; person_id: number; contract_type: 'CDI' | 'CDD'; title: string;
  file_name: string; storage_path: string; file_size_bytes: number; input_data: Record<string, unknown>; created_at: string;
}

function mapContract(row: EmploymentContractRow): EmploymentContractRecord {
  return { id: Number(row.id), companyId: Number(row.company_id), personId: Number(row.person_id),
    contractType: row.contract_type, title: row.title, fileName: row.file_name, storagePath: row.storage_path,
    fileSizeBytes: Number(row.file_size_bytes), inputData: row.input_data, createdAt: row.created_at };
}

export function canManageEmploymentContracts(roles: readonly RoleKey[]): boolean {
  return roles.includes('admin') || roles.includes('direction');
}

export async function loadEmploymentContractDetails(client: SupabaseClient, personId: number): Promise<Record<string, unknown> | null> {
  const { data, error } = await client.from('hr_employment_contract_details').select('input_data').eq('person_id', personId).maybeSingle();
  if (error) throw error;
  return data ? data.input_data as Record<string, unknown> : null;
}

export async function saveEmploymentContractDetails(client: SupabaseClient, personId: number, inputData: Record<string, unknown>): Promise<void> {
  await patchEmploymentContractDetails(client, personId, inputData);
}

export async function patchEmploymentContractDetails(client: SupabaseClient, personId: number, inputData: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!Number.isSafeInteger(personId) || personId <= 0) throw new Error('Profil invalide.');
  const { data, error } = await client.rpc('patch_hr_employment_contract_details', {
    p_person_id: personId, p_patch: inputData,
  });
  if (error) throw error;
  return data as Record<string, unknown>;
}

export async function loadEmploymentContracts(client: SupabaseClient, personId?: number): Promise<EmploymentContractRecord[]> {
  let query = client.from('hr_employment_contracts').select(CONTRACT_SELECT).order('created_at', { ascending: false });
  if (personId !== undefined) query = query.eq('person_id', personId);
  const { data, error } = await query;
  if (error) throw error;
  return ((data || []) as EmploymentContractRow[]).map(mapContract);
}

export interface SaveEmploymentContractInput {
  personId: number;
  contractType: 'CDI' | 'CDD';
  title?: string;
  fileName: string;
  file: Blob;
  inputData: Record<string, unknown>;
}

export async function saveEmploymentContract(client: SupabaseClient, input: SaveEmploymentContractInput): Promise<EmploymentContractRecord> {
  if (!Number.isSafeInteger(input.personId) || input.personId <= 0 || !['CDI', 'CDD'].includes(input.contractType)) {
    throw new Error('Profil ou type de contrat invalide.');
  }
  if (!input.file.size || input.file.size > 10 * 1024 * 1024 || input.file.type !== EMPLOYMENT_CONTRACT_MIME || !/\.pdf$/.test(input.fileName) || /[/\\]/.test(input.fileName)) {
    throw new Error('Le contrat doit être un document PDF de moins de 10 Mo.');
  }
  const { data: companyId, error: companyError } = await client.rpc('current_planning_company_id');
  if (companyError) throw companyError;
  if (!companyId) throw new Error('Entreprise active introuvable.');
  const storagePath = `${companyId}/people/${input.personId}/${crypto.randomUUID()}.pdf`;
  const bucket = client.storage.from(EMPLOYMENT_CONTRACT_BUCKET);
  const { error: uploadError } = await bucket.upload(storagePath, input.file, { contentType: EMPLOYMENT_CONTRACT_MIME, upsert: false });
  if (uploadError) throw uploadError;
  let registered: EmploymentContractRow | null = null;
  let registrationError: unknown;
  try {
    const { data, error } = await client.from('hr_employment_contracts').insert({
      company_id: companyId, person_id: input.personId, contract_type: input.contractType,
      title: input.title?.trim() || `Contrat de travail ${input.contractType}`, file_name: input.fileName,
      storage_path: storagePath, file_size_bytes: input.file.size, input_data: input.inputData,
    }).select(CONTRACT_SELECT).single();
    if (error) registrationError = error;
    else registered = data as EmploymentContractRow;
  } catch (cause) { registrationError = cause; }
  if (registered) return mapContract(registered);

  // A lost response can follow a committed insert. Confirm durable metadata
  // before deleting an upload, so a saved contract never loses its PDF.
  let proof: EmploymentContractRow | null;
  try {
    const { data, error } = await client.from('hr_employment_contracts').select(CONTRACT_SELECT).eq('storage_path', storagePath).maybeSingle();
    if (error) throw error;
    proof = data as EmploymentContractRow | null;
  } catch (cause) {
    throw new Error('Le classement n’a pas pu être confirmé. Le fichier a été conservé ; consultez Documents avant de réessayer.', { cause });
  }
  if (proof) return mapContract(proof);
  const { error: cleanupError } = await bucket.remove([storagePath]);
  if (cleanupError) throw new Error('Le classement du contrat a échoué et son fichier temporaire n’a pas pu être supprimé. Réessayez après actualisation.', { cause: registrationError });
  throw registrationError || new Error('Impossible de classer le contrat.');
}

export async function downloadEmploymentContract(client: SupabaseClient, contract: EmploymentContractRecord): Promise<Blob> {
  const { data, error } = await client.storage.from(EMPLOYMENT_CONTRACT_BUCKET).download(contract.storagePath);
  if (error) throw error;
  return data;
}

export async function createEmploymentContractSignedUrl(client: SupabaseClient, contract: EmploymentContractRecord): Promise<string> {
  const { data, error } = await client.storage.from(EMPLOYMENT_CONTRACT_BUCKET).createSignedUrl(contract.storagePath, 60);
  if (error) throw error;
  return data.signedUrl;
}

export interface EmploymentContractSigner {
  id: number;
  personId: number;
  signerName: string;
  storageBucket: string;
  storagePath: string;
  mimeType: 'image/png' | 'image/jpeg';
  fileSizeBytes: number;
  sha256: string;
}

export async function loadEmploymentContractSigner(client: SupabaseClient): Promise<EmploymentContractSigner> {
  const { data, error } = await client.rpc('hr_employment_contract_signer');
  if (error) throw error;
  if (!data || data.signer_name !== 'Benjamin BON' || data.storage_bucket !== 'working-time-signatures'
    || !['image/png', 'image/jpeg'].includes(data.mime_type) || !data.storage_path) {
    throw new Error('La signature privée de Benjamin BON est indisponible.');
  }
  return { id: Number(data.id), personId: Number(data.person_id), signerName: data.signer_name,
    storageBucket: data.storage_bucket, storagePath: data.storage_path, mimeType: data.mime_type,
    fileSizeBytes: Number(data.file_size_bytes), sha256: data.sha256 };
}

export async function downloadEmploymentContractSigner(client: SupabaseClient): Promise<{ signature: EmploymentContractSigner; blob: Blob }> {
  const signature = await loadEmploymentContractSigner(client);
  const { data, error } = await client.storage.from(signature.storageBucket).download(signature.storagePath);
  if (error) throw error;
  return { signature, blob: data };
}
