import { emptySeaOperation, isSeaOperationPayload, seaOperationToday, type SeaOperationPayload } from './seaOperationModel';
import { GOURY_WEATHER_MATRIX, cloneVesselWeatherMatrix, parseVesselWeatherMatrix, type VesselWeatherMatrix } from '../fleet/vesselWeatherMatrix';

// Isolated demonstration data: no authenticated account or production RPC is used.
interface PreviewVessel { id: number; name: string; registration_imo: string; length_overall: string; draft_m: number | null; weather_matrix: VesselWeatherMatrix | null; can_sign: boolean }
const vessels: PreviewVessel[] = [
  { id: 9901, name: 'GOURY', registration_imo: 'DEMO-9901 / IMO 9900001', length_overall: '30.62', draft_m: 2.1, weather_matrix: cloneVesselWeatherMatrix(GOURY_WEATHER_MATRIX), can_sign: false },
  { id: 9902, name: 'LE ROZEL', registration_imo: 'DEMO-9902 / IMO 9900002', length_overall: '19.2', draft_m: 1.4, weather_matrix: null, can_sign: false },
];
const projectPorts = new Map([
  ['99101', { departurePort: 'Cherbourg', arrivalPort: 'Le Havre' }],
  ['99102', { departurePort: 'Caen', arrivalPort: 'Dieppe' }],
]);
function planningContext(date: string, references = vessels) {
  return { date, choices: [
    {
      operationId: '990101:9901', projectId: '99101', project: 'DEMO-01 - Inspection des balises',
      client: 'Port de démonstration de Cherbourg', clientContact: 'Léa DEMO · +33 2 00 00 00 01 · lea@example.test',
      description: 'Inspection et relevé des balises du chenal — opération fictive de démonstration.',
      vessel: { id: '9901', name: 'GOURY', registrationImo: vessels[0].registration_imo, ...projectPorts.get('99101')!, etd: `${date}T08:00`, eta: `${date}T16:00`, weatherMatrix: references[0].weather_matrix },
      captains: [{ personId: '99001', name: 'Camille DEMO', functionLabel: 'Capitaine', hasSignature: false, canSign: false }],
      canSign: false,
    },
    {
      operationId: '990102:9902', projectId: '99102', project: 'DEMO-02 - Mesures bathymétriques',
      client: 'Chantier de démonstration de Caen', clientContact: 'Hugo DEMO · +33 2 00 00 00 02 · hugo@example.test',
      description: 'Mesures bathymétriques avant travaux — seconde opération fictive le même jour.',
      vessel: { id: '9902', name: 'LE ROZEL', registrationImo: vessels[1].registration_imo, ...projectPorts.get('99102')!, etd: `${date}T09:30`, eta: `${date}T18:00`, weatherMatrix: references[1].weather_matrix },
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
const deletedProjectDocuments = new Map<string, { expected: Record<string, unknown>; deletedAt: string }>();
export function isSeaOperationPreviewProject(value: unknown): boolean {
  const id = typeof value === 'number' ? value : typeof value === 'string' && /^[1-9][0-9]*$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(id) && projectPorts.has(String(id));
}
export function seaOperationPreviewDocumentLocationVisible(bucket: string, path: string): boolean {
  if (bucket !== 'project-files') return true;
  const matches = projectDocuments.filter(document => document.path === path);
  return !matches.length || matches.some(document => !deletedProjectDocuments.has(document.id));
}
const records: PreviewRecord[] = [{
  id: '99000000-0000-4000-8000-000000000001', company_id: 9901, version: 1, status: 'draft', draft: sample,
  created_by: 'preview-user', created_by_name: 'Compte de démonstration', created_at: now(),
  updated_by: 'preview-user', updated_by_name: 'Compte de démonstration', updated_at: now(),
  signed_by: null, signed_by_name: null, signed_at: null, captain_name: null, signature_snapshot: null, can_edit: true, can_sign: false,
}];
function withProjectPorts(record: PreviewRecord) {
  const projectId = record.draft.planning?.projectId;
  const ports = projectId && !record.draft.transit ? projectPorts.get(projectId) : undefined;
  return { ...record, project_ports: ports ? { projectId, ...ports } : null };
}
export function seaOperationPreviewRpc(name: string, args: Record<string, unknown> = {}, vesselSource?: (id: number) => Record<string, unknown> | undefined): { data: unknown; error: { message: string; code?: string } | null } {
  const fail = (message: string, code?: string) => ({ data: null, error: { message, ...(code ? { code } : {}) } });
  const success = (data: unknown) => ({ data: structuredClone(data), error: null });
  let references = vessels;
  if (['sea_operations_overview', 'sea_operation_planning_context', 'sea_operation_save', 'sea_operation_save_with_project_ports'].includes(name)) {
    try {
      references = vessels.map((vessel) => {
        const source = vesselSource ? vesselSource(vessel.id) : vessel;
        if (!source) throw new Error('Configuration du navire de démonstration indisponible.');
        const matrix = parseVesselWeatherMatrix(source.weather_matrix);
        if (source.weather_matrix != null && !matrix) throw new Error('La matrice Hs × période du navire de démonstration est invalide.');
        return { ...vessel, draft_m: source.draft_m == null ? null : Number(source.draft_m), weather_matrix: matrix };
      });
    } catch (error) { return fail(error instanceof Error ? error.message : 'Configuration du navire indisponible.'); }
  }
  if (name === 'sea_operations_overview') return success({ company_id: 9901, actor_id: 'preview-user', actor_name: 'Compte de démonstration', records: records.map(withProjectPorts), vessels: references });
  if (name === 'sea_operation_planning_context') return success(planningContext(typeof args.p_date === 'string' ? args.p_date : seaOperationToday(), references));
  if (name === 'sea_operation_captain_signature') return success(null);
  if (name === 'projects_document_deletion_snapshot' || name === 'projects_delete_document') {
    if (!isSeaOperationPreviewProject(args.target_project_id)) return fail('Le document du projet est inaccessible.', '42501');
    const document = projectDocuments.find(item => item.id === args.target_document_id && item.project_id === Number(args.target_project_id));
    if (!document) return fail('Le document du projet est inaccessible.', '42501');
    const tombstone = deletedProjectDocuments.get(document.id);
    const expected = tombstone?.expected || { file_name: document.file_name, category_key: null, subcategory_key: null,
      storage_bucket: 'project-files', storage_path: document.path, source_url: null, file_size_bytes: null, modified_at: document.created_at };
    if (name === 'projects_document_deletion_snapshot') return tombstone ? fail('Ce document a déjà été supprimé.', '42501')
      : success({ project_id: String(document.project_id), document_id: document.id, expected_document: expected });
    const requested = args.target_expected_document;
    if (!requested || typeof requested !== 'object' || Array.isArray(requested) || Object.keys(requested).length !== Object.keys(expected).length
      || Object.keys(expected).some(key => (requested as Record<string, unknown>)[key] !== expected[key])) {
      return fail('Le document a changé. Actualisez la liste avant de le supprimer.', '40001');
    }
    const deletedAt = tombstone?.deletedAt || now();
    deletedProjectDocuments.set(document.id, { expected: { ...expected }, deletedAt });
    return success({ project_id: String(document.project_id), document_id: document.id, deleted_at: deletedAt });
  }
  if (name === 'sea_operation_project_documents') return success(projectDocuments.filter((document) => document.project_id === Number(args.p_project_id) && !deletedProjectDocuments.has(document.id)).map((document) => Object.fromEntries(Object.entries(document).filter(([key]) => key !== 'path'))));
  if (name === 'sea_operation_project_document_access') {
    const document = projectDocuments.find((item) => item.id === args.p_document_id && item.project_id === Number(args.p_project_id) && !deletedProjectDocuments.has(item.id));
    return document ? success({ bucket: 'project-files', path: document.path, file_name: document.file_name, mime_type: document.mime_type }) : fail('Document indisponible pour ce projet.');
  }
  const record = records.find((item) => item.id === args.p_id);
  if (name === 'sea_operation_detail') return record ? success(withProjectPorts(record)) : fail('Fiche introuvable.');
  if (name === 'sea_operation_save' || name === 'sea_operation_save_with_project_ports') {
    if (args.p_id && (!record || record.version !== args.p_version)) return fail('La fiche a été modifiée. Rechargez-la avant de réessayer.');
    const draft = structuredClone(args.p_draft) as SeaOperationPayload;
    if (!isSeaOperationPayload(draft)) return fail('Formulaire invalide.');
    if (record?.status === 'signed') return fail('Une opération signée est conservée sans modification.');
    const vessel = references.find((item) => String(item.id) === draft.vessel.id);
    if (draft.vessel.id && !vessel) return fail('Navire de démonstration inaccessible.');
    let nextPorts: { projectId: string; departurePort: string; arrivalPort: string } | undefined;
    if (name === 'sea_operation_save_with_project_ports') {
      const baseline = args.p_project_ports as Record<string, unknown> | null;
      const projectId = draft.planning?.projectId;
      const current = projectId ? projectPorts.get(projectId) : undefined;
      if (!baseline || !current || draft.transit || baseline.projectId !== projectId
        || typeof baseline.departurePort !== 'string' || typeof baseline.arrivalPort !== 'string') return fail('Les ports du projet reçus sont invalides.');
      const previous = record && record.draft.planning?.projectId === projectId ? record.draft.vessel : baseline;
      const changes = (['departurePort', 'arrivalPort'] as const).filter(key => draft.vessel[key] !== previous[key]);
      if (changes.some(key => current[key] !== baseline[key] && current[key] !== draft.vessel[key])) return fail('Les ports du projet ont été modifiés. Rechargez la fiche.');
      nextPorts = { projectId: projectId!, ...current };
      for (const key of changes) nextPorts[key] = draft.vessel[key];
    }
    if (vessel) draft.vessel.weatherMatrix = structuredClone(vessel.weather_matrix);
    else delete draft.vessel.weatherMatrix;
    if (nextPorts) projectPorts.set(nextPorts.projectId, { departurePort: nextPorts.departurePort, arrivalPort: nextPorts.arrivalPort });
    if (record) { record.draft = draft; record.version += 1; record.updated_at = now(); return success(withProjectPorts(record)); }
    const created: PreviewRecord = { ...structuredClone(records[0]), id: crypto.randomUUID(), version: 1, draft, created_at: now(), updated_at: now() };
    records.unshift(created); return success(withProjectPorts(created));
  }
  return fail('La signature nécessite le compte réel du Capitaine affecté au navire.');
}
