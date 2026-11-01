import type { SupabaseClient } from '@supabase/supabase-js';
import { createChemicalPreviewClient } from '../chemicals/chemicalPreview';
import { createExercisePreviewClient } from '../emergencyExercises/emergencyExercisesPreview';
import { createInternalAuditPreviewData } from '../internalAudits/internalAuditPreview';
import { createLiftingPreviewClient } from '../lifting/liftingPreview';
import { createLsaPreviewClient } from '../lsa/lsaPreview';
import { createPharmacyPreviewClient } from '../pharmacy/pharmacyPreview';
import { todayPlanningDate } from '../planning/planningDates';

type Row = Record<string, unknown>;
type ReadResult = { data: unknown; error: { message: string; code?: string } | null };
type Register = 'chemical' | 'exercise' | 'lifting' | 'lsa' | 'pharmacy';
const READ_ONLY = { message: 'Les données de démonstration du radar sont en lecture seule.' };
const registerClients = new Map<Register, SupabaseClient>();
const TABLE_CLIENTS: Record<string, Register> = {
  chemical_products: 'chemical', chemical_attachments: 'chemical', lsa_items: 'lsa',
  pharmacy_inventory: 'pharmacy', pharmacy_controls: 'pharmacy', lifting_inventory: 'lifting',
};
const RPC_CLIENTS: Record<string, Register> = {
  chemical_available_vessels: 'chemical', lsa_available_vessels: 'lsa', pharmacy_available_vessels: 'pharmacy',
  lifting_available_vessels: 'lifting', emergency_exercises_people: 'exercise', emergency_exercises_report: 'exercise',
};

function registerClient(kind: Register): SupabaseClient {
  const existing = registerClients.get(kind);
  if (existing) return existing;
  const created = kind === 'chemical' ? createChemicalPreviewClient() : kind === 'exercise' ? createExercisePreviewClient()
    : kind === 'lsa' ? createLsaPreviewClient() : kind === 'pharmacy' ? createPharmacyPreviewClient() : createLiftingPreviewClient({ fleet: true });
  registerClients.set(kind, created);
  return created;
}

let rowsByTable: Record<string, Row[]> | undefined;
function directRows(): Record<string, Row[]> {
  if (rowsByTable) return rowsByTable;
  const today = todayPlanningDate();
  const year = Number(today.slice(0, 4));
  const shifted = (days: number) => {
    const date = new Date(`${today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };
  const heldOn = shifted(-30) < `${year}-01-01` ? `${year}-01-01` : shifted(-30);
  const plannedOn = shifted(10) > `${year}-12-31` ? `${year}-12-31` : shifted(10);
  const audit = createInternalAuditPreviewData();
  // Existing synthetic people only. These are examples of evidence states, not live campaign statistics.
  rowsByTable = {
    annual_reviews: [
      { id: 9901, company_id: 1, employee_person_id: 9301, employee_name_snapshot: 'Arthur DEMO', review_year: year,
        status: 'awaiting_signature', starts_at: `${heldOn}T09:00:00Z`, manager_validated_at: `${heldOn}T11:00:00Z`,
        due_on: `${year}-12-31`, meeting_location: 'Bureau de démonstration', meeting_mode: 'in_person', video_url: null },
      ...[{ id: 9902, personId: 9303, name: 'Luc MARTIN', status: 'collaborator_submitted' }, { id: 9903, personId: 9304, name: 'Hugo BERNARD', status: 'scheduled' }].map((person, index) => ({
        id: person.id, company_id: 1, employee_person_id: person.personId, employee_name_snapshot: person.name, review_year: year,
        status: person.status, starts_at: `${plannedOn}T${index === 0 ? '09' : '11'}:00:00Z`, manager_validated_at: null,
        due_on: `${year}-12-31`, meeting_location: 'À bord du navire de démonstration', meeting_mode: 'in_person', video_url: null,
      })),
    ],
    hr_action_plans: [{ id: 9951, company_id: 1, person_id: 9303, document_id: null, kind: 'training',
      title: 'Formation sécurité — démonstration', status: 'planned', due_on: shifted(30), scheduled_on: shifted(10), completed_on: null,
      location: 'Centre de formation de démonstration', owner_name: 'Équipe RH de démonstration', notes: 'Réservation fictive pour illustrer le suivi partagé.' }],
    internal_audit_sites: audit.sites.map((site) => ({ id: site.id, name: site.name, anniversary_on: site.anniversaryOn, vessel_id: site.vesselId })),
    internal_audits: audit.audits.map((item) => ({ id: item.id, site_id: item.siteId, year: item.year, status: item.status, planned_on: item.plannedOn, performed_on: item.performedOn })),
    internal_audit_findings: audit.findings.map((finding) => ({ id: finding.id, audit_id: finding.auditId, description: finding.description, due_on: finding.dueOn, status: finding.status })),
  };
  return rowsByTable;
}

/** Only new radar read surfaces use this adapter; existing preview writes and queries keep their behavior. */
function readQuery(load: () => Promise<ReadResult>): object {
  const predicates: Array<(row: Row) => boolean> = [];
  const ordering: Array<{ key: string; ascending: boolean }> = [];
  let start = 0;
  let end = Infinity;
  let single = false;
  const query: object = new Proxy({}, {
    get(_target, property) {
      if (property === 'then') return (resolve: (result: ReadResult) => unknown, reject?: (reason: unknown) => unknown) => load().then((result) => {
        if (result.error || !Array.isArray(result.data)) return result;
        const rows = (result.data as Row[]).filter((row) => predicates.every((predicate) => predicate(row)));
        rows.sort((a, b) => {
          for (const order of ordering) {
            const left = a[order.key]; const right = b[order.key];
            if (left === right) continue;
            const difference = typeof left === 'number' && typeof right === 'number' ? left - right : String(left ?? '').localeCompare(String(right ?? ''));
            return order.ascending ? difference : -difference;
          }
          return 0;
        });
        const selected = structuredClone(rows.slice(start, end + 1));
        return { data: single ? selected[0] || null : selected, error: null };
      }).then(resolve, reject);
      if (['insert', 'update', 'delete', 'upsert'].includes(String(property))) return () => readQuery(async () => ({ data: null, error: READ_ONLY }));
      if (property === 'eq') return (key: string, value: unknown) => { predicates.push((row) => row[key] === value); return query; };
      if (property === 'in') return (key: string, values: unknown[]) => { predicates.push((row) => values.includes(row[key])); return query; };
      if (property === 'is') return (key: string, value: unknown) => { predicates.push((row) => value === null ? row[key] == null : row[key] === value); return query; };
      if (property === 'order') return (key: string, options?: { ascending?: boolean }) => { ordering.push({ key, ascending: options?.ascending !== false }); return query; };
      if (property === 'range') return (from: number, to: number) => { start = from; end = to; return query; };
      if (property === 'single' || property === 'maybeSingle') return () => { single = true; return query; };
      return () => query;
    },
  });
  return query;
}

export function performancePreviewTable(table: string): object | null {
  const client = TABLE_CLIENTS[table];
  if (client) return readQuery(async () => {
    const result = await registerClient(client).from(table).select('*');
    return { data: result.data, error: result.error };
  });
  if (!['annual_reviews', 'hr_action_plans', 'internal_audit_sites', 'internal_audits', 'internal_audit_findings'].includes(table)) return null;
  return readQuery(async () => ({ data: directRows()[table], error: null }));
}

export function performancePreviewRpc(name: string, args: Record<string, unknown>): object | null {
  const kind = RPC_CLIENTS[name];
  return kind ? registerClient(kind).rpc(name, args) : null;
}
