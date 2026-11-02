import type { SupabaseClient } from '@supabase/supabase-js';
import { createChemicalPreviewClient } from '../chemicals/chemicalPreview';
import { createExercisePreviewClient } from '../emergencyExercises/emergencyExercisesPreview';
import { createInternalAuditPreviewData } from '../internalAudits/internalAuditPreview';
import { createLiftingPreviewClient } from '../lifting/liftingPreview';
import { createLsaPreviewClient } from '../lsa/lsaPreview';
import { createPharmacyPreviewClient } from '../pharmacy/pharmacyPreview';
import { todayPlanningDate } from '../planning/planningDates';
import { normalizeFleetName } from '../fleet/fleetDisplay';

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
  lifting_available_vessels: 'lifting', emergency_exercises_people: 'exercise', emergency_exercises_report: 'exercise', emergency_exercises_performance: 'exercise',
};
const VESSEL_RPC: Record<Register, string> = {
  chemical: 'chemical_available_vessels', exercise: 'emergency_exercises_people',
  lifting: 'lifting_available_vessels', lsa: 'lsa_available_vessels', pharmacy: 'pharmacy_available_vessels',
};
let dashboardAssets: () => Row[] = () => [];

/** Bind to existing public preview units; never rewrite a module's own fixtures. */
export function configurePerformancePreviewAssets(readAssets: () => Row[]): void {
  dashboardAssets = readAssets;
  rowsByTable = undefined;
}

function dashboardAsset(name: unknown): Row | undefined {
  const normalized = normalizeFleetName(String(name || ''));
  const aliases: Record<string, string> = {
    'NAVIRE DEMONSTRATION': 'M/V DEMONSTRATION',
    'NAVIRE EXEMPLE': 'SUPPORT DEMONSTRATION',
  };
  const canonical = aliases[normalized] || normalized;
  return dashboardAssets().find((asset) => normalizeFleetName(String(asset.name || '')) === canonical);
}

async function registerVesselMapping(kind: Register): Promise<Map<number, Row>> {
  const { data, error } = await registerClient(kind).rpc(VESSEL_RPC[kind]);
  if (error) throw error;
  const raw = kind === 'exercise' ? (data as { vessels?: Row[] } | null)?.vessels : data;
  if (!Array.isArray(raw)) throw new Error('Navires de démonstration indisponibles.');
  const mapping = new Map<number, Row>();
  for (const vessel of raw as Row[]) {
    const target = dashboardAsset(vessel.name);
    if (target) mapping.set(Number(vessel.id), { ...vessel, id: target.id, name: target.name });
  }
  return mapping;
}

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
    internal_audit_sites: audit.sites.flatMap((site) => {
      const asset = dashboardAsset(site.name);
      return asset ? [{ id: site.id, name: String(asset.name), anniversary_on: site.anniversaryOn, vessel_id: Number(asset.id) }] : [];
    }),
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
    const [result, mapping] = await Promise.all([registerClient(client).from(table).select('*'), registerVesselMapping(client)]);
    if (result.error || !Array.isArray(result.data)) return { data: result.data, error: result.error };
    const data = (result.data as Row[]).flatMap((row) => {
      // Attachment references use stable product IDs and do not carry vessel IDs.
      if (row.vessel_id == null) return [row];
      const vessel = mapping.get(Number(row.vessel_id));
      return vessel ? [{ ...row, vessel_id: vessel.id, ...(row.vessel_name != null ? { vessel_name: vessel.name } : {}) }] : [];
    });
    return { data, error: null };
  });
  if (!['annual_reviews', 'hr_action_plans', 'internal_audit_sites', 'internal_audits', 'internal_audit_findings'].includes(table)) return null;
  return readQuery(async () => ({ data: directRows()[table], error: null }));
}

export function performancePreviewRpc(name: string, args: Record<string, unknown>): object | null {
  const kind = RPC_CLIENTS[name];
  if (!kind) return null;
  return readQuery(async () => {
    const mapping = await registerVesselMapping(kind);
    if (name.endsWith('_available_vessels')) return { data: [...mapping.values()], error: null };
    if (name === 'emergency_exercises_performance') {
      const { data, error } = await registerClient('exercise').rpc('emergency_exercises_people');
      if (error || !data) return { data, error };
      const today = todayPlanningDate();
      const year = Number(args.target_year);
      const currentYear = Number(today.slice(0, 4));
      const months = year < currentYear ? 12 : year === currentYear ? Number(today.slice(5, 7)) : 0;
      const vessels = [...mapping.values()];
      const exerciseTypes = [
        ['fire-protection', 'Protection contre l’incendie'], ['abandon-ship', 'Évacuation et abandon du navire'],
        ['onboard-evacuation', 'Évacuation à bord'], ['sea-rescue', 'Sauvetage en mer'],
        ['loss-of-propulsion', 'Perte de propulsion – manœuvrabilité'], ['loss-of-power', 'Perte d’énergie'],
        ['injured-person', 'Évacuation et prise en charge d’un blessé'], ['flooding-control', 'Lutte contre l’envahissement'],
        ['anti-pollution', 'Exercice Antipollution'],
      ].map(([key, label], index) => ({ key, label, cadenceMonths: index < 2 ? 1 : 2 }));
      const people: Row[] = Array.isArray(data.people) ? data.people.filter((person: Row) => person.current) : [];
      const personMonths = people.flatMap((person: Row, index: number) => {
        const vessel = vessels[index % Math.max(1, vessels.length)];
        if (!vessel) return [];
        return Array.from({ length: months }, (_, offset) => {
          const month = offset + 1;
          const current = year === currentYear && month === Number(today.slice(5, 7));
          const fireCount = !current && (month + index) % 4 ? 1 : 0;
          const abandonCount = !current && (month + index) % 3 ? 1 : 0;
          const counts = Object.fromEntries(exerciseTypes.map((type, typeIndex) => [type.key,
            typeIndex === 0 ? fireCount : typeIndex === 1 ? abandonCount : !current && month % 2 === 0 && (index + typeIndex + month) % 3 ? 1 : 0]));
          const tbtCount = !current && month % 2 ? 1 : 0;
          const presenceDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
          return { personId: Number(person.id), personName: String(person.name), month, fireCount, abandonCount,
            counts, tbtCount, presenceDays,
            units: [{ vesselId: Number(vessel.id), fireCount, abandonCount, counts, tbtCount, presenceDays }] };
        });
      });
      const crewDays = vessels.flatMap((vessel) => Array.from({ length: months }, (_, offset) => {
        const month = offset + 1;
        const count = personMonths.filter((person) => person.month === month && person.units.some((unit) => unit.vesselId === Number(vessel.id))).length;
        return Array.from({ length: new Date(Date.UTC(year, month, 0)).getUTCDate() }, (_, day) => ({
          vesselId: Number(vessel.id), on: `${year}-${String(month).padStart(2, '0')}-${String(day + 1).padStart(2, '0')}`, count,
        }));
      }).flat());
      return { data: { schemaVersion: 2, scope: data.scope, year, asOf: today, vessels, exerciseTypes, personMonths, crewDays }, error: null };
    }
    if (name === 'emergency_exercises_people') {
      const { data, error } = await registerClient(kind).rpc(name, args);
      if (error || !data) return { data, error };
      return { data: { ...data, vessels: [...mapping.values()],
        ...(Array.isArray(data.vesselReadIds) ? { vesselReadIds: data.vesselReadIds.flatMap((id: number) => mapping.has(id) ? [mapping.get(id)!.id] : []) } : {}),
      }, error: null };
    }
    // Translate the selected public unit back to the independent exercise fixture,
    // then translate only the report identity forward for canonical validation.
    const nativeId = args.target_vessel_id == null ? null : [...mapping].find(([, vessel]) => vessel.id === args.target_vessel_id)?.[0];
    if (args.target_vessel_id != null && nativeId === undefined) return { data: null, error: { message: 'Navire absent de la démonstration.' } };
    const { data, error } = await registerClient(kind).rpc(name, { ...args, target_vessel_id: nativeId });
    if (error || !data) return { data, error };
    return { data: { ...data, vessel: nativeId == null ? null : mapping.get(nativeId) || null }, error: null };
  });
}

interface PreviewLinkedProcess {
  key: string;
  tasks: Array<{ to: string }>;
}
interface PreviewLinkedDashboard {
  processes: PreviewLinkedProcess[];
  entities: Array<{ processes: PreviewLinkedProcess[] }>;
}

/** Independent register pages keep their native fictional IDs; only their links need translating back. */
export async function resolvePerformancePreviewDashboardLinks<T extends PreviewLinkedDashboard>(dashboard: T): Promise<T> {
  const registerKeys: Record<string, Register> = {
    chemicals: 'chemical', emergencyExercises: 'exercise', lifting: 'lifting', towing: 'lifting', lsa: 'lsa', pharmacy: 'pharmacy',
  };
  const mappings = new Map<Register, Promise<Map<number, Row>>>();
  async function processLinks<P extends PreviewLinkedProcess>(process: P): Promise<P> {
    const kind = registerKeys[process.key];
    const modulePath = `/modules/${process.key === 'towing' ? 'lifting' : process.key}`;
    if (!kind || !process.tasks.some((task) => task.to.startsWith(modulePath) && task.to.includes('vessel='))) return process;
    let mapping = mappings.get(kind);
    if (!mapping) { mapping = registerVesselMapping(kind); mappings.set(kind, mapping); }
    const nativeByCanonical = new Map([...(await mapping)].map(([nativeId, asset]) => [Number(asset.id), nativeId]));
    return { ...process, tasks: process.tasks.map((task) => {
      if (!task.to.startsWith(modulePath)) return task;
      const url = new URL(task.to, 'https://seapilot-preview.invalid');
      const nativeId = nativeByCanonical.get(Number(url.searchParams.get('vessel')));
      if (nativeId === undefined) return task;
      url.searchParams.set('vessel', String(nativeId));
      return { ...task, to: `${url.pathname}${url.search}${url.hash}` };
    }) };
  }
  return { ...dashboard, processes: await Promise.all(dashboard.processes.map(processLinks)),
    entities: await Promise.all(dashboard.entities.map(async (entity) => ({ ...entity, processes: await Promise.all(entity.processes.map(processLinks)) }))),
  };
}
