import { emptySeaOperation, type SeaOperationPayload } from './seaOperationModel';

// Isolated demonstration data: no authenticated account or production RPC is used.
const vessels = [
  { id: 9901, name: 'GOURY', registration_imo: 'Démonstration', length_overall: '30', can_sign: false },
  { id: 9902, name: 'LE ROZEL', registration_imo: 'Démonstration', length_overall: '25', can_sign: false },
];
const sample = emptySeaOperation();
sample.project = 'Préparation d’une opération'; sample.client = 'Client de démonstration';
sample.vessel = { ...sample.vessel, id: '9901', name: 'GOURY', registrationImo: 'Démonstration', departurePort: 'Cherbourg' };
type PreviewRecord = Record<string, unknown> & { id: string; version: number; draft: SeaOperationPayload };
const now = () => new Date().toISOString();
const records: PreviewRecord[] = [{
  id: '99000000-0000-4000-8000-000000000001', company_id: 9901, version: 1, status: 'draft', draft: sample,
  created_by: 'preview-user', created_by_name: 'Compte de démonstration', created_at: now(),
  updated_by: 'preview-user', updated_by_name: 'Compte de démonstration', updated_at: now(),
  signed_by: null, signed_by_name: null, signed_at: null, captain_name: null, can_edit: true, can_sign: false,
}];
export function seaOperationPreviewRpc(name: string, args: Record<string, unknown> = {}): { data: unknown; error: { message: string } | null } {
  const fail = (message: string) => ({ data: null, error: { message } });
  const success = (data: unknown) => ({ data: structuredClone(data), error: null });
  if (name === 'sea_operations_overview') return success({ company_id: 9901, actor_id: 'preview-user', actor_name: 'Compte de démonstration', records, vessels });
  const record = records.find((item) => item.id === args.p_id);
  if (name === 'sea_operation_detail') return record ? success(record) : fail('Fiche introuvable.');
  if (name === 'sea_operation_save') {
    if (args.p_id && (!record || record.version !== args.p_version)) return fail('La fiche a été modifiée. Rechargez-la avant de réessayer.');
    const draft = structuredClone(args.p_draft) as SeaOperationPayload;
    if (!draft || draft.version !== 1) return fail('Formulaire invalide.');
    if (record) { record.draft = draft; record.version += 1; record.updated_at = now(); return success(record); }
    const created: PreviewRecord = { ...structuredClone(records[0]), id: crypto.randomUUID(), version: 1, draft, created_at: now(), updated_at: now() };
    records.unshift(created); return success(created);
  }
  return fail('La signature nécessite le compte réel du Capitaine affecté au navire.');
}
