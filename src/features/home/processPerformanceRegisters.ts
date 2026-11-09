import type { SupabaseClient } from '@supabase/supabase-js';
import type { ModuleKey } from '../permissions/moduleAccess';
import type { ProcessPerformance, ProcessPerformanceCriterion, ProcessPerformanceTask } from './processPerformance';
import type { ProcessPerformanceScope } from './processPerformanceScope';
import { PHARMACY_ALERT_DAYS, pharmacyExpiryStatus, pharmacyItemExpiryStatus, pharmacyStockStatus, type PharmacyItem } from '../pharmacy/pharmacyModel';
import { countVesselExpiries, VESSEL_EXPIRY_ALERT_DAYS } from '../fleet/vesselExpiryAlerts';
import { fleetAssetKind } from '../fleet/fleetDisplay';
import { buildExercisePerformance, validateExerciseSnapshot } from './exercisePerformance';
export { buildExercisePerformance, type ExercisePerformanceSnapshot } from './exercisePerformance';

interface Vessel { id: number; name: string; asset_kind?: 'vessel' | 'quay' | 'office'; active?: boolean }
interface DeadlineItem { id: number; vessel_id: number; title: string; expires_on: string | null; planned_on?: string | null; visit_location?: string | null }
interface ChemicalRow { id: string; vessel_id: number; brand: string; product_type: string; storage_location: string }
type PharmacyRow = Pick<PharmacyItem, 'id' | 'vessel_id' | 'designation' | 'expires_on' | 'no_expiry' | 'outside_dotation'
  | 'quantity' | 'stock_quantity' | 'stock_unit' | 'strength'
  | 'required_quantity' | 'required_stock_quantity' | 'required_stock_unit' | 'required_strength' | 'required_package_size'>;
interface ControlRow { id: number; vessel_id: number; expires_on: string; is_current: boolean }
interface LiftingRow { id: number; vessel_id: number; reference: string; kind: 'lifting' | 'towing'; inspection_due_on: string | null }

export interface RegisterPerformanceCache { data: Map<string, Promise<unknown>> }
export function createRegisterPerformanceCache(): RegisterPerformanceCache { return { data: new Map() }; }
function cached<T>(cache: RegisterPerformanceCache | undefined, key: string, load: () => Promise<T>): Promise<T> {
  if (!cache) return load();
  let value = cache.data.get(key);
  if (!value) { value = load(); cache.data.set(key, value); }
  return value as Promise<T>;
}

type RegisterKey = 'chemicals' | 'emergencyExercises' | 'lsa' | 'pharmacy' | 'lifting' | 'towing';
const NAMES: Record<RegisterKey, string> = {
  chemicals: 'Produits chimiques', emergencyExercises: 'Exercices d’urgence', lsa: 'Registre LSA',
  pharmacy: 'Pharmacie', lifting: 'Apparaux de levage', towing: 'Registre des remorques',
};
const PAGE = 500;
const pct = (ok: number, total: number): number | null => total ? Math.round(100 * ok / total) : null;
const dateValid = (date: string | null): date is string => Boolean(date && /^\d{4}-\d{2}-\d{2}$/.test(date)
  && Number.isFinite(Date.parse(`${date}T12:00:00Z`)) && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date);
const vesselName = (vessels: Vessel[], id: number) => vessels.find((vessel) => vessel.id === id)?.name || 'Navire autorisé';

function result(key: RegisterKey, summary: string, criteria: ProcessPerformanceCriterion[] = [], tasks: ProcessPerformanceTask[] = [], unavailableSources: string[] = []): ProcessPerformance {
  const valid = criteria.filter((criterion) => criterion.score !== null);
  const totalWeight = valid.reduce((sum, criterion) => sum + criterion.weight, 0);
  const stateOrder = { overdue: 0, unplanned: 1, in_progress: 2, planned: 3 };
  return { key, label: NAMES[key], shortLabel: key === 'emergencyExercises' ? 'Exercices' : key === 'lifting' ? 'Levage' : key === 'towing' ? 'Remorques' : NAMES[key],
    to: key === 'towing' ? '/modules/lifting/remorques' : `/modules/${key}`, summary, criteria,
    score: unavailableSources.length || !totalWeight ? null : Math.round(valid.reduce((sum, criterion) => sum + criterion.score! * criterion.weight, 0) / totalWeight),
    tasks: unavailableSources.length ? [] : tasks.sort((a, b) => stateOrder[a.state] - stateOrder[b.state] || (a.dueOn || '9999').localeCompare(b.dueOn || '9999')),
    unavailableSources };
}

function noVessels(key: RegisterKey): ProcessPerformance {
  return result(key, 'Aucun navire accessible dans votre périmètre. Aucun score calculé.');
}

async function availableVessels(client: SupabaseClient, rpc: string, scope: ProcessPerformanceScope, cache?: RegisterPerformanceCache): Promise<Vessel[]> {
  if (scope.kind !== 'company' && !scope.vesselIds.length) return [];
  const data = await cached(cache, `vessels:${rpc}`, async () => {
    const { data, error } = await client.rpc(rpc);
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error('Périmètre des navires indisponible.');
    return data as Vessel[];
  });
  const allowed = new Set(scope.vesselIds);
  return (data as Vessel[]).filter((vessel) => Number.isSafeInteger(vessel.id) && vessel.id > 0 && vessel.active !== false && (scope.kind === 'company' || allowed.has(vessel.id)));
}

// Every page carries the resolved vessel restriction; RLS remains authoritative.
async function rows<T>(client: SupabaseClient, table: string, select: string, vesselIds: number[], filters: { eq?: [string, unknown][]; is?: [string, null][] } = {}, cache?: RegisterPerformanceCache): Promise<T[]> {
  if (!vesselIds.length) return [];
  const data = await cached(cache, `rows:${table}:${select}:${JSON.stringify(filters)}`, async () => {
    const all: T[] = [];
    for (let offset = 0; ; offset += PAGE) {
      let query = client.from(table).select(select).in('vessel_id', vesselIds).order('id').range(offset, offset + PAGE - 1);
      for (const [key, value] of filters.eq || []) query = query.eq(key, value);
      for (const [key, value] of filters.is || []) query = query.is(key, value);
      const { data, error } = await query;
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error('Registre indisponible.');
      all.push(...data as T[]);
      if (data.length < PAGE) return all;
    }
  });
  // The company/watch snapshot is populated first; each comparison only reads its subset.
  return data.filter((row) => vesselIds.includes((row as { vessel_id: number }).vessel_id));
}

function deadlineValue(item: DeadlineItem, today: string): number | null {
  if (!dateValid(item.expires_on)) return null;
  const counts = countVesselExpiries([item], today)[item.vessel_id];
  return counts?.expired ? 0 : counts?.due ? 50 : 100;
}

function deadlineTasks(key: 'lsa', items: DeadlineItem[], vessels: Vessel[], today: string): ProcessPerformanceTask[] {
  return items.flatMap((item) => {
    const health = deadlineValue(item, today);
    if (health === 100) return [];
    const expired = health === 0;
    const booked = dateValid(item.planned_on || null) && item.planned_on! >= today && Boolean(item.visit_location?.trim())
      && (!item.expires_on || item.planned_on! <= item.expires_on);
    return [{ id: `${key}-${item.id}`, title: health === null ? `Échéance à vérifier · ${item.title}` : item.title,
      context: vesselName(vessels, item.vessel_id), state: expired ? 'overdue' : booked ? 'planned' : 'unplanned',
      dueOn: dateValid(item.expires_on) ? item.expires_on : '', scheduledOn: dateValid(item.planned_on || null) ? item.planned_on! : '', location: item.visit_location || '',
      to: `/modules/${key}?vessel=${item.vessel_id}&item=${item.id}` }];
  });
}

async function chemicals(client: SupabaseClient, scope: ProcessPerformanceScope, cache?: RegisterPerformanceCache): Promise<ProcessPerformance> {
  const vessels = await availableVessels(client, 'chemical_available_vessels', scope, cache);
  if (!vessels.length) return noVessels('chemicals');
  const products = await rows<ChemicalRow>(client, 'chemical_products', 'id,vessel_id,brand,product_type,storage_location', vessels.map((vessel) => vessel.id), { is: [['deleted_at', null]] }, cache);
  const fds = await cached(cache, 'chemical-fds', async () => {
    const fds = new Set<string>();
    // Attachment metadata only, never original files, Drive paths or hazardous content.
    for (let start = 0; start < products.length; start += 150) {
      const ids = products.slice(start, start + 150).map((product) => product.id);
      for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await client.from('chemical_attachments').select('id,product_id,kind')
          .in('product_id', ids).eq('kind', 'fds').order('id').range(offset, offset + PAGE - 1);
        if (error) throw error;
        if (!Array.isArray(data)) throw new Error('Pièces jointes indisponibles.');
        (data as { product_id: string }[]).forEach((attachment) => fds.add(attachment.product_id));
        if (data.length < PAGE) break;
      }
    }
    return fds;
  });
  const missing = products.filter((product) => !fds.has(product.id));
  const noLocation = products.filter((product) => !product.storage_location?.trim());
  const tasks: ProcessPerformanceTask[] = products.filter((product) => !fds.has(product.id) || !product.storage_location?.trim()).map((product) => ({
    id: `chemical-${product.id}`, title: [product.brand, product.product_type].filter(Boolean).join(' ') || 'Produit à compléter',
    context: `${vesselName(vessels, product.vessel_id)} · ${[!fds.has(product.id) ? 'FDS absente' : '', !product.storage_location?.trim() ? 'stockage à préciser' : ''].filter(Boolean).join(' · ')}`,
    state: 'unplanned', dueOn: '', scheduledOn: '', location: product.storage_location || '', to: `/modules/chemicals?vessel=${product.vessel_id}&product=${encodeURIComponent(product.id)}`,
  }));
  return result('chemicals', products.length ? `${missing.length} FDS absente(s) · ${noLocation.length} emplacement(s) à préciser` : 'Aucun produit inventorié. Périmètre et inventaire à confirmer.', [
    { id: 'fds', label: 'FDS référencées', weight: 70, score: pct(products.length - missing.length, products.length), detail: `${products.length - missing.length}/${products.length} produits avec une FDS. La présence ne certifie pas la conformité du contenu.` },
    { id: 'storage', label: 'Stockage renseigné', weight: 30, score: pct(products.length - noLocation.length, products.length), detail: `${products.length - noLocation.length}/${products.length} emplacements renseignés.` },
  ], tasks);
}

async function lsa(client: SupabaseClient, scope: ProcessPerformanceScope, today: string, cache?: RegisterPerformanceCache): Promise<ProcessPerformance> {
  const vessels = await availableVessels(client, 'lsa_available_vessels', scope, cache);
  if (!vessels.length) return noVessels('lsa');
  const data = await rows<DeadlineItem & { document_title: string }>(client, 'lsa_items', 'id,vessel_id,title,document_title,expires_on,planned_on,visit_location', vessels.map((vessel) => vessel.id), { is: [['deleted_at', null]] }, cache);
  const items = data.map((item) => ({ ...item, title: item.document_title || item.title || 'Équipement LSA' }));
  const values = items.map((item) => deadlineValue(item, today));
  const known = values.filter((value): value is number => value !== null);
  const expired = values.filter((value) => value === 0).length;
  const upcoming = values.filter((value) => value === 50).length;
  const requiredVessels = vessels.filter((vessel) => fleetAssetKind(vessel) === 'vessel');
  const missing = requiredVessels.filter((vessel) => !items.some((item) => item.vessel_id === vessel.id));
  const average = (data: number[]) => data.length ? Math.round(data.reduce((sum, value) => sum + value, 0) / data.length) : null;
  const validity = requiredVessels.flatMap((vessel) => {
    const subset = items.filter((item) => item.vessel_id === vessel.id);
    const dated = subset.map((item) => deadlineValue(item, today)).filter((value): value is number => value !== null);
    return !subset.length ? [0] : dated.length ? [average(dated)!] : [];
  });
  const tasks = deadlineTasks('lsa', items, vessels, today);
  for (const vessel of missing) tasks.push({ id: `lsa-register-missing-${vessel.id}`, title: 'Registre LSA à renseigner', context: vessel.name,
    state: 'unplanned', dueOn: '', scheduledOn: '', location: '', to: `/modules/lsa?vessel=${vessel.id}` });
  return result('lsa', `${missing.length} registre(s) absent(s) · ${expired} périmé(s) · ${upcoming} échéance(s) à ${VESSEL_EXPIRY_ALERT_DAYS} jours · ${items.length - known.length} date(s) à vérifier`, [
    { id: 'validity', label: 'Validité et présence des registres', weight: 80, score: average(validity),
      detail: `${known.length}/${items.length} échéances exploitables. Moyenne par navire : à jour = 100, échéance à 30 jours = 50, périmé ou registre absent = 0. Un bureau ou quai sans obligation est non applicable.` },
    { id: 'dates', label: 'Traçabilité des échéances', weight: 20, score: average(requiredVessels.map((vessel) => {
      const subset = items.filter((item) => item.vessel_id === vessel.id);
      return subset.length ? pct(subset.filter((item) => deadlineValue(item, today) !== null).length, subset.length)! : 0;
    })), detail: 'Les dates absentes sont à vérifier (0 point de traçabilité), sans affirmer que l’équipement est périmé. Registre absent : 0.' },
  ], tasks);
}

async function lifting(client: SupabaseClient, scope: ProcessPerformanceScope, today: string, cache?: RegisterPerformanceCache): Promise<ProcessPerformance[]> {
  const vessels = await availableVessels(client, 'lifting_available_vessels', scope, cache);
  if (!vessels.length) return [noVessels('lifting'), noVessels('towing')];
  const items = await rows<LiftingRow>(client, 'lifting_inventory', 'id,vessel_id,reference,kind,inspection_due_on', vessels.map((vessel) => vessel.id), { eq: [['active', true]] }, cache);
  const values = items.map((item) => deadlineValue({ ...item, title: item.reference, expires_on: item.inspection_due_on }, today));
  const tasks: ProcessPerformanceTask[] = items.flatMap((item, index) => values[index] === 100 ? [] : [{
    id: `lifting-${item.id}`, title: `${item.reference || 'Équipement'}${values[index] === null ? ' · contrôle à dater' : ''}`,
    context: `${vesselName(vessels, item.vessel_id)} · ${item.kind === 'towing' ? 'Remorques' : 'Apparaux de levage'}`,
    state: values[index] === 0 ? 'overdue' : 'unplanned', dueOn: dateValid(item.inspection_due_on) ? item.inspection_due_on : '', scheduledOn: '', location: '',
    to: `/modules/lifting/${item.kind === 'towing' ? 'remorques' : 'apparaux'}?vessel=${item.vessel_id}&item=${item.id}`,
  }]);
  const missingTowing = vessels.filter((vessel) => fleetAssetKind(vessel) === 'vessel'
    && !items.some((item) => item.vessel_id === vessel.id && item.kind === 'towing'));
  for (const vessel of missingTowing) tasks.push({ id: `lifting-register-towing-${vessel.id}`, title: 'Registre des remorques à renseigner',
    context: vessel.name, state: 'unplanned', dueOn: '', scheduledOn: '', location: '', to: `/modules/lifting/remorques?vessel=${vessel.id}` });
  return (['lifting', 'towing'] as const).map((kind) => {
      const perVessel = vessels.flatMap((vessel) => {
        const subset = items.filter((item) => item.vessel_id === vessel.id && item.kind === kind);
        if (!subset.length) return kind === 'towing' && fleetAssetKind(vessel) === 'vessel' ? [0] : [];
        return [subset.reduce((sum, item) => sum + (deadlineValue({ ...item, title: item.reference, expires_on: item.inspection_due_on }, today) ?? 0), 0) / subset.length];
      });
      const criterion = { id: kind === 'towing' ? 'towing-controls' : 'lifting-controls', label: kind === 'towing' ? 'Registre et contrôles des remorques' : 'Contrôles des apparaux de levage', weight: 100,
        score: perVessel.length ? Math.round(perVessel.reduce((sum, value) => sum + value, 0) / perVessel.length) : null,
        detail: 'Moyenne par unité et catégorie. À jour = 100, à 30 jours = 50, contrôle échu ou non daté = 0. '
          + (kind === 'towing' ? 'Registre absent sur un navire autorisé = 0 ; il ne disparaît pas derrière les apparaux présents.' : 'Aucun apparau identifié : non applicable. Un brouillon ne renouvelle pas le contrôle.') };
      const categoryValues = items.filter((item) => item.kind === kind).map((item) => deadlineValue({ ...item, title: item.reference, expires_on: item.inspection_due_on }, today));
      const summary = `${kind === 'towing' ? `${missingTowing.length} registre(s) absent(s) · ` : ''}${categoryValues.filter((value) => value === 0).length} contrôle(s) échu(s) · ${categoryValues.filter((value) => value === 50).length} à prévoir · ${categoryValues.filter((value) => value === null).length} non daté(s)`;
      return result(kind, summary, [criterion], tasks.filter((task) => task.to.startsWith(`/modules/lifting/${kind === 'towing' ? 'remorques' : 'apparaux'}`)));
    });
}

async function pharmacy(client: SupabaseClient, scope: ProcessPerformanceScope, today: string, cache?: RegisterPerformanceCache): Promise<ProcessPerformance> {
  const vessels = await availableVessels(client, 'pharmacy_available_vessels', scope, cache);
  if (!vessels.length) return noVessels('pharmacy');
  const ids = vessels.map((vessel) => vessel.id);
  const [items, controls] = await Promise.all([
    rows<PharmacyRow>(client, 'pharmacy_inventory',
      'id,vessel_id,designation,expires_on,no_expiry,outside_dotation,quantity,stock_quantity,stock_unit,strength,required_quantity,required_stock_quantity,required_stock_unit,required_strength,required_package_size',
      ids, { eq: [['active', true]] }, cache),
    rows<ControlRow>(client, 'pharmacy_controls', 'id,vessel_id,expires_on,is_current', ids, { eq: [['is_current', true]] }, cache),
  ]);
  if (!items.length) return result('pharmacy', controls.length
    ? 'Un justificatif de contrôle est disponible, mais l’inventaire est vide. Aucun score calculé.'
    : 'Aucun inventaire ni justificatif de contrôle disponible. Aucun score calculé.');
  const expiry = items.map((item) => pharmacyItemExpiryStatus(item, today));
  const stock = items.map(pharmacyStockStatus);
  const expiryApplicable = expiry.filter((status) => status !== 'none').length;
  const stockApplicable = stock.filter((status) => status !== 'none').length;
  const dated = expiryApplicable - expiry.filter((status) => status === 'unknown').length;
  const stockUnknown = stock.filter((status) => status === 'unknown').length;
  const quantified = stockApplicable - stockUnknown;
  const low = stock.filter((status) => status === 'low').length;
  const expired = expiry.filter((status) => status === 'expired').length;
  const tasks: ProcessPerformanceTask[] = items.flatMap((item, i) => {
    const alerts = [expiry[i] === 'expired' ? 'Périmé' : expiry[i] === 'due' ? 'Péremption proche' : '', stock[i] === 'low' ? 'Stock insuffisant' : '', stock[i] === 'unknown' ? 'Stock à vérifier' : ''].filter(Boolean);
    if (!alerts.length) return [];
    return [{ id: `pharmacy-${item.id}`, title: item.designation || 'Article de pharmacie', context: `${vesselName(vessels, item.vessel_id)} · ${alerts.join(' · ')}`,
      state: expiry[i] === 'expired' || stock[i] === 'low' ? 'overdue' : 'unplanned', dueOn: dateValid(item.expires_on) ? item.expires_on : '', scheduledOn: '', location: '',
      to: `/modules/pharmacy?vessel=${item.vessel_id}&item=${item.id}${expiry[i] === 'expired' || expiry[i] === 'due' ? '&filter=expiry' : ''}` }];
  });
  let controlsGood = 0;
  for (const vessel of vessels) {
    const control = controls.find((item) => item.vessel_id === vessel.id);
    const state = control ? pharmacyExpiryStatus(control.expires_on, today) : 'unknown';
    if (state === 'valid' || state === 'due') controlsGood += 1;
    if (state !== 'valid') tasks.push({ id: `pharmacy-control-${vessel.id}`, title: control ? 'Contrôle de la dotation médicale' : 'Justificatif de contrôle à renseigner',
      context: vessel.name, state: state === 'expired' ? 'overdue' : 'unplanned', dueOn: dateValid(control?.expires_on || null) ? control!.expires_on : '', scheduledOn: '', location: '', to: `/modules/pharmacy?vessel=${vessel.id}` });
  }
  return result('pharmacy', `${expired} article(s) périmé(s) · ${low} stock(s) insuffisant(s) · ${stockUnknown} quantité(s) à vérifier`, [
    { id: 'expiry', label: 'Péremption des articles datés', weight: 30, score: dated ? Math.round(expiry.reduce((sum, status) => sum + (status === 'valid' ? 100 : status === 'due' ? 50 : 0), 0) / dated) : null,
      detail: `${dated}/${expiryApplicable} échéances exploitables. Échéance à ${PHARMACY_ALERT_DAYS} jours = 50 points. Une date dépassée vaut 0 point.` },
    { id: 'stock', label: 'Stocks au-dessus du seuil', weight: 30, score: quantified ? pct(stock.filter((status) => status === 'ok').length, quantified) : null,
      detail: `${quantified}/${stockApplicable} quantités comparables pour la dotation. ${low} sous le seuil.` },
    { id: 'data', label: 'Données vérifiables', weight: 20, score: pct(quantified + dated, stockApplicable + expiryApplicable),
      detail: `${quantified}/${stockApplicable} quantités comparables et ${dated}/${expiryApplicable} échéances exploitables parmi les champs applicables.` },
    { id: 'controls', label: 'Justificatifs de contrôle valides', weight: 20, score: pct(controlsGood, vessels.length),
      detail: `${controlsGood}/${vessels.length} navires avec un contrôle courant non échu. Les justificatifs absents restent à renseigner.` },
  ], tasks);
}

async function exercises(client: SupabaseClient, scope: ProcessPerformanceScope, today: string, cache?: RegisterPerformanceCache): Promise<ProcessPerformance> {
  if (scope.kind !== 'company' && !scope.vesselIds.length) return noVessels('emergencyExercises');
  const year = Number(today.slice(0, 4));
  const snapshot = await cached(cache, 'exercise-performance:' + year, async () => {
    const { data, error } = await client.rpc('emergency_exercises_performance', { target_year: year });
    if (error) throw error;
    return validateExerciseSnapshot(data, year);
  });
  return buildExercisePerformance(snapshot, scope, today);
}

/** Read permission is checked before resolving any register's vessels or rows. */
export async function loadRegisterPerformance(client: SupabaseClient, moduleKeys: ModuleKey[], scope: ProcessPerformanceScope, today: string, cache?: RegisterPerformanceCache): Promise<ProcessPerformance[]> {
  const keys: Array<Exclude<RegisterKey, 'towing'>> = ['chemicals', 'emergencyExercises', 'lsa', 'pharmacy', 'lifting'];
  return Promise.all(keys.filter((key) => moduleKeys.includes(key)).map(async (key) => {
    try {
      if (key === 'chemicals') return await chemicals(client, scope, cache);
      if (key === 'emergencyExercises') return await exercises(client, scope, today, cache);
      if (key === 'lsa') return await lsa(client, scope, today, cache);
      if (key === 'pharmacy') return await pharmacy(client, scope, today, cache);
      return await lifting(client, scope, today, cache);
    } catch {
      const unavailable = (kind: RegisterKey) => result(kind, 'Les données du registre n’ont pas pu être chargées. Actualisez pour réessayer.', [], [], [NAMES[kind]]);
      return key === 'lifting' ? [unavailable('lifting'), unavailable('towing')] : unavailable(key);
    }
  })).then((processes) => processes.flat());
}

/** Load authorized register data once, then reuse the same snapshot for every comparison. */
export async function loadRegisterPerformanceDashboard(client: SupabaseClient, moduleKeys: ModuleKey[], scope: ProcessPerformanceScope, today: string, entityScopes: ProcessPerformanceScope[]) {
  const cache = createRegisterPerformanceCache();
  const processes = await loadRegisterPerformance(client, moduleKeys, scope, today, cache);
  const entities = await Promise.all(entityScopes.map((entity) => loadRegisterPerformance(client, moduleKeys, entity, today, cache)));
  return { processes, entities };
}
