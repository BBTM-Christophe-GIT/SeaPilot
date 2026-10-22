import { emptySeaOperation, seaOperationToday, type SeaOperationPayload } from './seaOperationModel';

// Isolated demonstration data: no authenticated account or production RPC is used.
const vessels = [
  { id: 9901, name: 'GOURY', registration_imo: 'DEMO-9901 / IMO 9900001', length_overall: '30.62', can_sign: false },
  { id: 9902, name: 'LE ROZEL', registration_imo: 'DEMO-9902 / IMO 9900002', length_overall: '19.2', can_sign: false },
];
function planningContext(date: string) {
  return { date, choices: [
    {
      operationId: '990101:9901', projectId: '99101', project: 'DEMO-01 - Inspection des balises',
      client: 'Port de démonstration de Cherbourg', clientContact: 'Léa DEMO · +33 2 00 00 00 01 · lea@example.test',
      description: 'Inspection et relevé des balises du chenal — opération fictive de démonstration.',
      vessel: { id: '9901', name: 'GOURY', registrationImo: vessels[0].registration_imo, departurePort: 'Cherbourg', arrivalPort: 'Le Havre', etd: `${date}T08:00`, eta: `${date}T16:00` },
      captains: [{ personId: '99001', name: 'Camille DEMO', functionLabel: 'Capitaine', hasSignature: false, canSign: false }],
      canSign: false,
    },
    {
      operationId: '990102:9902', projectId: '99102', project: 'DEMO-02 - Mesures bathymétriques',
      client: 'Chantier de démonstration de Caen', clientContact: 'Hugo DEMO · +33 2 00 00 00 02 · hugo@example.test',
      description: 'Mesures bathymétriques avant travaux — seconde opération fictive le même jour.',
      vessel: { id: '9902', name: 'LE ROZEL', registrationImo: vessels[1].registration_imo, departurePort: 'Caen', arrivalPort: 'Dieppe', etd: `${date}T09:30`, eta: `${date}T18:00` },
      // This is an isolated example of a temporary Planning captain, never a real account permission.
      captains: [{ personId: '99002', name: 'Alex DEMO', functionLabel: 'Capitaine temporaire', hasSignature: false, canSign: false }],
      canSign: false,
    },
  ] };
}
const sample = emptySeaOperation();
const initialPlanning = planningContext(seaOperationToday()).choices[0];
sample.project = initialPlanning.project; sample.client = initialPlanning.client; sample.clientContact = initialPlanning.clientContact;
sample.description = initialPlanning.description;
sample.vessel = { ...sample.vessel, ...initialPlanning.vessel, captainName: initialPlanning.captains[0].name };
sample.planning = { date: seaOperationToday(), operationId: initialPlanning.operationId, projectId: initialPlanning.projectId, captainPersonId: initialPlanning.captains[0].personId };
sample.signature = { ...sample.signature, captainName: initialPlanning.captains[0].name, place: initialPlanning.vessel.departurePort };
type PreviewRecord = Record<string, unknown> & { id: string; version: number; draft: SeaOperationPayload };
const now = () => new Date().toISOString();
const projectDocuments = [
  { id: 'project:991011', project_id: 99101, title: 'Exemple PDF de démonstration', file_name: 'exemple-document-projet.pdf', mime_type: 'application/pdf', category_label: 'Préparation', subcategory_label: 'Exemple', created_at: '2026-10-22T08:00:00Z', expires_on: null, path: 'projects/99101/attachments/sea-operation-demo.pdf' },
  { id: 'project:991012', project_id: 99101, title: 'Exemple photo de démonstration', file_name: 'exemple-photo-projet.webp', mime_type: 'image/webp', category_label: 'Préparation', subcategory_label: 'Exemple', created_at: '2026-10-22T08:00:00Z', expires_on: null, path: 'projects/99101/attachments/sea-operation-demo.webp' },
  { id: 'project:991021', project_id: 99102, title: 'Exemple PDF du second projet', file_name: 'exemple-second-projet.pdf', mime_type: 'application/pdf', category_label: 'Préparation', subcategory_label: 'Exemple', created_at: '2026-10-22T09:00:00Z', expires_on: null, path: 'projects/99102/attachments/sea-operation-demo.pdf' },
];
const records: PreviewRecord[] = [{
  id: '99000000-0000-4000-8000-000000000001', company_id: 9901, version: 1, status: 'draft', draft: sample,
  created_by: 'preview-user', created_by_name: 'Compte de démonstration', created_at: now(),
  updated_by: 'preview-user', updated_by_name: 'Compte de démonstration', updated_at: now(),
  signed_by: null, signed_by_name: null, signed_at: null, captain_name: null, signature_snapshot: null, can_edit: true, can_sign: false,
}];
export function seaOperationPreviewRpc(name: string, args: Record<string, unknown> = {}): { data: unknown; error: { message: string } | null } {
  const fail = (message: string) => ({ data: null, error: { message } });
  const success = (data: unknown) => ({ data: structuredClone(data), error: null });
  if (name === 'sea_operations_overview') return success({ company_id: 9901, actor_id: 'preview-user', actor_name: 'Compte de démonstration', records, vessels });
  if (name === 'sea_operation_planning_context') return success(planningContext(typeof args.p_date === 'string' ? args.p_date : seaOperationToday()));
  if (name === 'sea_operation_captain_signature') return success(null);
  if (name === 'sea_operation_project_documents') return success(projectDocuments.filter((document) => document.project_id === Number(args.p_project_id)).map((document) => Object.fromEntries(Object.entries(document).filter(([key]) => key !== 'path'))));
  if (name === 'sea_operation_project_document_access') {
    const document = projectDocuments.find((item) => item.id === args.p_document_id && item.project_id === Number(args.p_project_id));
    return document ? success({ bucket: 'project-files', path: document.path, file_name: document.file_name, mime_type: document.mime_type }) : fail('Document indisponible pour ce projet.');
  }
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
