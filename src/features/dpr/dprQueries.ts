import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CrewFunction,
  DprFileKind,
  DprFormPayload,
  DprStatus,
  IncidentCategory,
  IncidentLevel,
} from './dprFormModel.ts';

export interface DprProjectOption { id: number; code: string; title: string }
export interface DprVesselOption { id: number; name: string }
export interface DprPersonOption {
  id: number;
  name: string;
  functionLabel: string;
  crewFunction: CrewFunction;
}
export interface DprReferenceData {
  projects: DprProjectOption[];
  vessels: DprVesselOption[];
  people: DprPersonOption[];
  exerciseTypes: Array<{ key: string; label: string }>;
  portReasons: Array<{ key: string; label: string }>;
}
export interface DprFileRecord {
  id: number;
  dprId: number;
  kind: DprFileKind;
  bucket: string;
  path: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  isCurrent: boolean;
  status: string;
}
export interface DprReportRecord {
  id: number;
  number: number | null;
  status: DprStatus;
  reportDate: string;
  projectId: number | null;
  projectCode: string;
  projectTitle: string;
  unlistedProjectName: string;
  vesselId: number | null;
  vesselName: string;
  issuerName: string;
  description: string;
  qhseNote: string;
  createdBy: string | null;
  updatedAt: string;
  fuelConsumedLiters: number;
  files: DprFileRecord[];
}
export interface DprDashboardData { reports: DprReportRecord[]; references: DprReferenceData; currentUserId: string | null; currentUserName: string }
export interface DprDetail { report: DprReportRecord; payload: DprFormPayload; files: DprFileRecord[] }

function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function scalarText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}
function numberOrNull(value: unknown): number | null { const parsed = Number(value); return value === null || value === undefined || !Number.isFinite(parsed) ? null : parsed; }
function crewFunction(functionLabel: string, gradeLabel: string): CrewFunction {
  const label = `${functionLabel} ${gradeLabel}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (label.includes('chef mecanicien')) return 'chief-engineer';
  if (label.includes('second capitaine') || label.includes('2nd capitaine')) return 'second-captain';
  if (label.includes('capitaine')) return 'captain';
  return 'execution';
}

function mapFile(row: Record<string, unknown>): DprFileRecord {
  return {
    id: Number(row.id), dprId: Number(row.dpr_id), kind: row.file_kind as DprFileKind,
    bucket: text(row.bucket_name), path: text(row.object_path), filename: text(row.display_filename),
    mimeType: text(row.mime_type), sizeBytes: Number(row.size_bytes || 0), sha256: text(row.sha256),
    isCurrent: Boolean(row.is_current), status: text(row.status),
  };
}

async function loadCurrentProfile(client: SupabaseClient): Promise<{ id: string | null; name: string }> {
  const { data: authData } = await client.auth.getUser();
  const userId = authData.user?.id || null;
  if (!userId) return { id: null, name: 'Utilisateur SeaPilot' };
  const { data } = await client.from('profiles').select('display_name').eq('id', userId).maybeSingle();
  return { id: userId, name: text(data?.display_name) || authData.user?.email || 'Utilisateur SeaPilot' };
}

export async function fetchDprDashboard(client: SupabaseClient): Promise<DprDashboardData> {
  const [reportResult, metricResult, fileResult, projectResult, vesselResult, peopleResult, exerciseResult, reasonResult, profile] = await Promise.all([
    client.from('dpr_reports').select('id,dpr_number,status,report_date,project_id,unlisted_project_name,vessel_id,issuer_name_snapshot,description,qhse_note,created_by,updated_at').is('deleted_at', null).order('report_date', { ascending: false }).order('dpr_number', { ascending: false, nullsFirst: false }).limit(2000),
    client.from('dpr_daily_metrics').select('dpr_id,fuel_consumed_liters'),
    client.from('dpr_files').select('id,dpr_id,file_kind,bucket_name,object_path,display_filename,mime_type,size_bytes,sha256,is_current,status').eq('status', 'ready').is('deleted_at', null).limit(5000),
    client.from('projects').select('id,project_code,title').order('project_code'),
    client.from('vessels').select('id,name').order('name'),
    client.from('people').select('id,first_name,last_name,function_label,grade_label').eq('active', true).order('last_name').limit(5000),
    client.from('emergency_exercise_types').select('key,label').eq('active', true).order('display_order'),
    client.from('port_call_reason_types').select('key,label').eq('active', true).order('display_order'),
    loadCurrentProfile(client),
  ]);
  const firstError = [reportResult, metricResult, fileResult, projectResult, vesselResult, peopleResult, exerciseResult, reasonResult].find((result) => result.error)?.error;
  if (firstError) throw firstError;
  const projects = (projectResult.data || []).map((row) => ({ id: Number(row.id), code: text(row.project_code), title: text(row.title) }));
  const vessels = (vesselResult.data || []).map((row) => ({ id: Number(row.id), name: text(row.name) }));
  const metrics = new Map((metricResult.data || []).map((row) => [Number(row.dpr_id), Number(row.fuel_consumed_liters || 0)]));
  const filesByReport = new Map<number, DprFileRecord[]>();
  (fileResult.data || []).map((row) => mapFile(row as Record<string, unknown>)).forEach((file) => filesByReport.set(file.dprId, [...(filesByReport.get(file.dprId) || []), file]));
  const projectMap = new Map(projects.map((project) => [project.id, project]));
  const vesselMap = new Map(vessels.map((vessel) => [vessel.id, vessel]));
  const reports = (reportResult.data || []).map((row) => {
    const projectId = numberOrNull(row.project_id); const vesselId = numberOrNull(row.vessel_id);
    return {
      id: Number(row.id), number: numberOrNull(row.dpr_number), status: row.status as DprStatus,
      reportDate: text(row.report_date), projectId, projectCode: projectId ? projectMap.get(projectId)?.code || '' : '',
      projectTitle: projectId ? projectMap.get(projectId)?.title || '' : '', unlistedProjectName: text(row.unlisted_project_name),
      vesselId, vesselName: vesselId ? vesselMap.get(vesselId)?.name || '' : '', issuerName: text(row.issuer_name_snapshot),
      description: text(row.description), qhseNote: text(row.qhse_note), createdBy: row.created_by ? text(row.created_by) : null,
      updatedAt: text(row.updated_at), fuelConsumedLiters: metrics.get(Number(row.id)) || 0, files: filesByReport.get(Number(row.id)) || [],
    } satisfies DprReportRecord;
  });
  const people = (peopleResult.data || []).map((row) => {
    const functionLabel = text(row.function_label); const gradeLabel = text(row.grade_label);
    return { id: Number(row.id), name: `${text(row.first_name)} ${text(row.last_name)}`.trim(), functionLabel: functionLabel || gradeLabel, crewFunction: crewFunction(functionLabel, gradeLabel) };
  });
  return {
    reports, currentUserId: profile.id, currentUserName: profile.name,
    references: {
      projects, vessels, people,
      exerciseTypes: (exerciseResult.data || []).map((row) => ({ key: text(row.key), label: text(row.label) })),
      portReasons: (reasonResult.data || []).map((row) => ({ key: text(row.key), label: text(row.label) })),
    },
  };
}

export async function fetchDprDetail(client: SupabaseClient, baseReport: DprReportRecord): Promise<DprDetail> {
  const id = baseReport.id;
  const [metric, crew, others, incidents, hse, exercises, calls, supplies, waste, files] = await Promise.all([
    client.from('dpr_daily_metrics').select('*').eq('dpr_id', id).maybeSingle(),
    client.from('dpr_crew_members').select('*').eq('dpr_id', id).order('display_order'),
    client.from('dpr_other_people').select('*').eq('dpr_id', id).order('display_order'),
    client.from('dpr_incidents').select('*').eq('dpr_id', id),
    client.from('dpr_hse_actions').select('*').eq('dpr_id', id).maybeSingle(),
    client.from('dpr_emergency_exercises').select('*').eq('dpr_id', id),
    client.from('dpr_port_calls').select('*,dpr_port_call_reasons(reason_type_key)').eq('dpr_id', id).order('display_order'),
    client.from('dpr_supplies').select('*').eq('dpr_id', id).maybeSingle(),
    client.from('dpr_waste_records').select('*').eq('dpr_id', id),
    client.from('dpr_files').select('*').eq('dpr_id', id).is('deleted_at', null).order('display_order'),
  ]);
  const results = [metric, crew, others, incidents, hse, exercises, calls, supplies, waste, files];
  const error = results.find((result) => result.error)?.error;
  if (error) throw error;
  const incidentRows = (incidents.data || []) as Array<Record<string, unknown>>;
  const hseRow = (hse.data || {}) as Record<string, unknown>;
  const supplyRow = (supplies.data || {}) as Record<string, unknown>;
  const wasteRows = (waste.data || []) as Array<Record<string, unknown>>;
  const metricRow = (metric.data || {}) as Record<string, unknown>;
  const payload: DprFormPayload = {
    reportDate: baseReport.reportDate, projectId: baseReport.projectId, unlistedProjectName: baseReport.unlistedProjectName,
    vesselId: baseReport.vesselId, description: baseReport.description, qhseNote: baseReport.qhseNote,
    metrics: { fuelConsumedLiters: scalarText(metricRow.fuel_consumed_liters), fuelOnBoardLiters: scalarText(metricRow.fuel_on_board_liters) },
    crewMembers: ((crew.data || []) as Array<Record<string, unknown>>).map((row) => ({ personId: Number(row.person_id), crewFunction: row.crew_function as CrewFunction, rosterGroup: text(row.roster_group), displayName: text(row.display_name_snapshot), displayOrder: Number(row.display_order || 0) })),
    otherPeople: ((others.data || []) as Array<Record<string, unknown>>).map((row) => ({ personId: numberOrNull(row.person_id), displayName: text(row.display_name_snapshot), displayOrder: Number(row.display_order || 0) })),
    incidents: (['person', 'equipment', 'environment'] as IncidentCategory[]).map((category) => { const row = incidentRows.find((candidate) => candidate.category === category); return { category, level: (row?.level || 'T0') as IncidentLevel, notes: text(row?.notes) }; }),
    hseActions: { tbtPerformed: Boolean(hseRow.tbt_performed), tbtTheme: text(hseRow.tbt_theme), hseVisitPerformed: Boolean(hseRow.hse_visit_performed), hseAuditPerformed: Boolean(hseRow.hse_audit_performed), goodPracticesCount: scalarText(hseRow.good_practices_count ?? '0'), dangerousSituationsCount: scalarText(hseRow.dangerous_situations_count ?? '0'), stopWorkCount: scalarText(hseRow.stop_work_count ?? '0') },
    emergencyExercises: ((exercises.data || []) as Array<Record<string, unknown>>).map((row) => ({ key: text(row.exercise_type_key), notes: text(row.notes) })),
    portCalls: ((calls.data || []) as Array<Record<string, unknown>>).map((row) => ({ portName: text(row.port_name), arrivalAt: text(row.arrival_at).slice(0, 16), departureAt: text(row.departure_at).slice(0, 16), displayOrder: Number(row.display_order || 0), reasons: ((row.dpr_port_call_reasons || []) as Array<Record<string, unknown>>).map((reason) => text(reason.reason_type_key)) })),
    supplies: { fuelM3: scalarText(supplyRow.fuel_m3), oilLiters: scalarText(supplyRow.oil_liters), waterM3: scalarText(supplyRow.water_m3) },
    wasteRecords: [
      { key: 'black-bin', unit: 'kg' as const }, { key: 'recyclable', unit: 'kg' as const },
      { key: 'bilge-water-oil', unit: 'l' as const }, { key: 'wastewater', unit: 'l' as const },
    ].map((definition) => ({ ...definition, quantity: scalarText(wasteRows.find((row) => row.waste_type_key === definition.key)?.quantity) })),
  };
  if (!payload.portCalls.length) payload.portCalls = [{ portName: '', arrivalAt: '', departureAt: '', displayOrder: 0, reasons: [] }];
  return { report: baseReport, payload, files: ((files.data || []) as Array<Record<string, unknown>>).map(mapFile) };
}

export async function saveDprPayload(client: SupabaseClient, dprId: number | null, payload: DprFormPayload): Promise<number> {
  const { data, error } = await client.rpc('dpr_save_payload', { target_dpr_id: dprId, target_payload: payload });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  if (!row?.id) throw new Error("Supabase n'a retourné aucun DPR.");
  return Number(row.id);
}

export async function runDprTransition(client: SupabaseClient, transition: 'submit' | 'validate' | 'reopen' | 'delete', dprId: number, reason = ''): Promise<void> {
  const functions = { submit: 'dpr_submit', validate: 'dpr_validate', reopen: 'dpr_reopen', delete: 'dpr_soft_delete' } as const;
  const args = transition === 'reopen' || transition === 'delete' ? { target_dpr_id: dprId, target_reason: reason } : { target_dpr_id: dprId };
  const { error } = await client.rpc(functions[transition], args);
  if (error) throw error;
}

async function sha256(file: Blob): Promise<string> {
  const bytes = await file.arrayBuffer();
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export async function uploadDprFile(client: SupabaseClient, dprId: number, kind: DprFileKind, file: File | Blob, filename: string, displayOrder = 0): Promise<DprFileRecord> {
  const mimeType = file.type || 'application/octet-stream';
  const checksum = await sha256(file);
  const { data: prepared, error: prepareError } = await client.rpc('dpr_prepare_file_upload', {
    target_dpr_id: dprId, target_file_kind: kind, target_filename: filename,
    target_mime_type: mimeType, target_size_bytes: file.size, target_sha256: checksum, target_display_order: displayOrder,
  });
  if (prepareError) throw prepareError;
  const metadata = (Array.isArray(prepared) ? prepared[0] : prepared) as Record<string, unknown>;
  const bucket = text(metadata.bucket_name); const path = text(metadata.object_path);
  const { error: uploadError } = await client.storage.from(bucket).upload(path, file, { contentType: mimeType, upsert: false });
  if (uploadError) throw uploadError;
  const { data: completed, error: completeError } = await client.rpc('dpr_complete_file_upload', { target_file_id: Number(metadata.id) });
  if (completeError) throw completeError;
  return mapFile((Array.isArray(completed) ? completed[0] : completed) as Record<string, unknown>);
}

export async function removeDprFile(client: SupabaseClient, fileId: number): Promise<void> {
  const { error } = await client.rpc('dpr_remove_file', { target_file_id: fileId }); if (error) throw error;
}

export async function createDprSignedUrl(client: SupabaseClient, file: DprFileRecord): Promise<string> {
  const { error: auditError } = await client.rpc('dpr_record_signed_url', { target_file_id: file.id }); if (auditError) throw auditError;
  const { data, error } = await client.storage.from(file.bucket).createSignedUrl(file.path, 300); if (error) throw error;
  return data.signedUrl;
}

export async function fetchDprDiagnostic(client: SupabaseClient): Promise<Record<string, number>> {
  const { data, error } = await client.rpc('dpr_admin_diagnostic'); if (error) throw error;
  return (data || {}) as Record<string, number>;
}
