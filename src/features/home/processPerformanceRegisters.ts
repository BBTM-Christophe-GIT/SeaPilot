import type { SupabaseClient } from '@supabase/supabase-js';
import type { ModuleKey } from '../permissions/moduleAccess';
import type { ProcessPerformance, ProcessPerformanceCriterion, ProcessPerformanceTask } from './processPerformance';
import type { ProcessPerformanceScope } from './processPerformanceScope';
import { pharmacyExpiryStatus, pharmacyStockStatus } from '../pharmacy/pharmacyModel';
import { countVesselExpiries, VESSEL_EXPIRY_ALERT_DAYS } from '../fleet/vesselExpiryAlerts';
import { fetchExerciseReport, fetchExerciseRoster } from '../emergencyExercises/emergencyExercisesQueries';

interface Vessel { id: number; name: string }
interface DeadlineItem { id: number; vessel_id: number; title: string; expires_on: string | null; planned_on?: string | null; visit_location?: string | null }
interface ChemicalRow { id: string; vessel_id: number; brand: string; product_type: string; storage_location: string }
interface PharmacyRow { id: number; vessel_id: number; designation: string; expires_on: string | null; quantity: string; required_quantity: string }
interface ControlRow { id: number; vessel_id: number; expires_on: string; is_current: boolean }
interface LiftingRow { id: number; vessel_id: number; reference: string; kind: 'lifting' | 'towing'; inspection_due_on: string | null }

type RegisterKey = 'chemicals' | 'emergencyExercises' | 'lsa' | 'pharmacy' | 'lifting' | 'medicalLogbook';
const NAMES: Record<RegisterKey, string> = {
  chemicals: 'Produits chimiques', emergencyExercises: 'Exercices d’urgence', lsa: 'Registre LSA',
  pharmacy: 'Pharmacie', lifting: 'Levage et remorques', medicalLogbook: 'Registre médical',
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
  return { key, label: NAMES[key], shortLabel: key === 'emergencyExercises' ? 'Exercices' : key === 'lifting' ? 'Levage' : NAMES[key],
    to: `/modules/${key}`, summary, criteria,
    score: unavailableSources.length || !totalWeight ? null : Math.round(valid.reduce((sum, criterion) => sum + criterion.score! * criterion.weight, 0) / totalWeight),
    tasks: unavailableSources.length ? [] : tasks.sort((a, b) => stateOrder[a.state] - stateOrder[b.state] || (a.dueOn || '9999').localeCompare(b.dueOn || '9999')),
    unavailableSources };
}

function noVessels(key: RegisterKey): ProcessPerformance {
  return result(key, 'Aucun navire accessible dans votre périmètre. Aucun score calculé.');
}

async function availableVessels(client: SupabaseClient, rpc: string, scope: ProcessPerformanceScope): Promise<Vessel[]> {
  if (scope.kind !== 'company' && !scope.vesselIds.length) return [];
  const { data, error } = await client.rpc(rpc);
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Périmètre des navires indisponible.');
  const allowed = new Set(scope.vesselIds);
  return (data as Vessel[]).filter((vessel) => Number.isSafeInteger(vessel.id) && vessel.id > 0 && (scope.kind === 'company' || allowed.has(vessel.id)));
}

// Every page carries the resolved vessel restriction; RLS remains authoritative.
async function rows<T>(client: SupabaseClient, table: string, select: string, vesselIds: number[], filters: { eq?: [string, unknown][]; is?: [string, null][] } = {}): Promise<T[]> {
  if (!vesselIds.length) return [];
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

async function chemicals(client: SupabaseClient, scope: ProcessPerformanceScope): Promise<ProcessPerformance> {
  const vessels = await availableVessels(client, 'chemical_available_vessels', scope);
  if (!vessels.length) return noVessels('chemicals');
  const products = await rows<ChemicalRow>(client, 'chemical_products', 'id,vessel_id,brand,product_type,storage_location', vessels.map((vessel) => vessel.id), { is: [['deleted_at', null]] });
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

async function lsa(client: SupabaseClient, scope: ProcessPerformanceScope, today: string): Promise<ProcessPerformance> {
  const vessels = await availableVessels(client, 'lsa_available_vessels', scope);
  if (!vessels.length) return noVessels('lsa');
  const data = await rows<DeadlineItem & { document_title: string }>(client, 'lsa_items', 'id,vessel_id,title,document_title,expires_on,planned_on,visit_location', vessels.map((vessel) => vessel.id), { is: [['deleted_at', null]] });
  const items = data.map((item) => ({ ...item, title: item.document_title || item.title || 'Équipement LSA' }));
  const values = items.map((item) => deadlineValue(item, today));
  const known = values.filter((value): value is number => value !== null);
  const expired = values.filter((value) => value === 0).length;
  const upcoming = values.filter((value) => value === 50).length;
  return result('lsa', items.length ? `${expired} périmé(s) · ${upcoming} échéance(s) à ${VESSEL_EXPIRY_ALERT_DAYS} jours · ${items.length - known.length} date(s) à vérifier` : 'Aucun équipement inventorié. Aucun score calculé.', [
    { id: 'validity', label: 'Validité des équipements datés', weight: 80, score: known.length ? Math.round(known.reduce((sum, value) => sum + value, 0) / known.length) : null,
      detail: `${known.length}/${items.length} échéances exploitables. À jour : 100 points ; échéance à 30 jours : 50 ; périmé : 0.` },
    { id: 'dates', label: 'Traçabilité des échéances', weight: 20, score: known.length ? pct(known.length, items.length) : null,
      detail: 'Les dates absentes sont à vérifier, sans présumer que l’équipement est périmé ou conforme.' },
  ], deadlineTasks('lsa', items, vessels, today));
}

async function lifting(client: SupabaseClient, scope: ProcessPerformanceScope, today: string): Promise<ProcessPerformance> {
  const vessels = await availableVessels(client, 'lifting_available_vessels', scope);
  if (!vessels.length) return noVessels('lifting');
  const items = await rows<LiftingRow>(client, 'lifting_inventory', 'id,vessel_id,reference,kind,inspection_due_on', vessels.map((vessel) => vessel.id), { eq: [['active', true]] });
  const values = items.map((item) => deadlineValue({ ...item, title: item.reference, expires_on: item.inspection_due_on }, today));
  const counts = { expired: values.filter((value) => value === 0).length, due: values.filter((value) => value === 50).length, missing: values.filter((value) => value === null).length };
  const tasks: ProcessPerformanceTask[] = items.flatMap((item, index) => values[index] === 100 ? [] : [{
    id: `lifting-${item.id}`, title: `${item.reference || 'Équipement'}${values[index] === null ? ' · contrôle à dater' : ''}`,
    context: `${vesselName(vessels, item.vessel_id)} · ${item.kind === 'towing' ? 'Remorques' : 'Apparaux de levage'}`,
    state: values[index] === 0 ? 'overdue' : 'unplanned', dueOn: dateValid(item.inspection_due_on) ? item.inspection_due_on : '', scheduledOn: '', location: '',
    to: `/modules/lifting/${item.kind === 'towing' ? 'remorques' : 'apparaux'}?vessel=${item.vessel_id}&item=${item.id}`,
  }]);
  return result('lifting', items.length ? `${counts.expired} contrôle(s) échu(s) · ${counts.due} à prévoir · ${counts.missing} non daté(s)` : 'Aucun équipement actif inventorié. Aucun score calculé.', [
    { id: 'controls', label: 'Contrôles des matériels actifs', weight: 100, score: items.length ? Math.round(values.reduce<number>((sum, value) => sum + (value ?? 0), 0) / items.length) : null,
      detail: 'Échéance officielle de l’équipement actuel uniquement : à jour = 100, à 30 jours = 50, échue ou absente = 0. Un brouillon ne renouvelle pas le contrôle.' },
  ], tasks);
}

async function pharmacy(client: SupabaseClient, scope: ProcessPerformanceScope, today: string): Promise<ProcessPerformance> {
  const vessels = await availableVessels(client, 'pharmacy_available_vessels', scope);
  if (!vessels.length) return noVessels('pharmacy');
  const ids = vessels.map((vessel) => vessel.id);
  const [items, controls] = await Promise.all([
    rows<PharmacyRow>(client, 'pharmacy_inventory', 'id,vessel_id,designation,expires_on,quantity,required_quantity', ids, { eq: [['active', true]] }),
    rows<ControlRow>(client, 'pharmacy_controls', 'id,vessel_id,expires_on,is_current', ids, { eq: [['is_current', true]] }),
  ]);
  if (!items.length) return result('pharmacy', controls.length
    ? 'Un justificatif de contrôle est disponible, mais l’inventaire est vide. Aucun score calculé.'
    : 'Aucun inventaire ni justificatif de contrôle disponible. Aucun score calculé.');
  const expiry = items.map((item) => pharmacyExpiryStatus(item.expires_on, today));
  const stock = items.map(pharmacyStockStatus);
  const dated = expiry.filter((status) => status !== 'unknown').length;
  const quantified = stock.filter((status) => status !== 'unknown').length;
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
  return result('pharmacy', `${expired} article(s) périmé(s) · ${low} stock(s) insuffisant(s) · ${items.length - quantified} quantité(s) à vérifier`, [
    { id: 'expiry', label: 'Péremption des articles datés', weight: 30, score: dated ? Math.round(expiry.reduce((sum, status) => sum + (status === 'valid' ? 100 : status === 'due' ? 50 : 0), 0) / dated) : null,
      detail: `${dated}/${items.length} articles datés. Échéance à ${30} jours = 50 points ; périmé = 0. Les articles sans date ne sont pas présumés périmés.` },
    { id: 'stock', label: 'Stocks au-dessus du seuil', weight: 30, score: quantified ? pct(stock.filter((status) => status === 'ok').length, quantified) : null,
      detail: `${quantified}/${items.length} quantités comparables ; ${low} sous le seuil. Les formats non numériques restent à vérifier, sans conversion d’unité inventée.` },
    { id: 'data', label: 'Données vérifiables', weight: 20, score: pct(quantified + dated, items.length * 2),
      detail: `${quantified}/${items.length} quantités numériques comparables et ${dated}/${items.length} échéances exploitables. Les champs inconnus restent à vérifier, sans présumer de la péremption.` },
    { id: 'controls', label: 'Justificatifs de contrôle valides', weight: 20, score: pct(controlsGood, vessels.length),
      detail: `${controlsGood}/${vessels.length} navires avec un contrôle courant non échu. Les justificatifs absents restent à renseigner.` },
  ], tasks);
}

async function exercises(client: SupabaseClient, scope: ProcessPerformanceScope, today: string): Promise<ProcessPerformance> {
  if (scope.kind !== 'company' && !scope.vesselIds.length) return noVessels('emergencyExercises');
  const roster = await fetchExerciseRoster(client);
  const allowed = new Set(scope.vesselIds);
  const vessels = roster.vessels.filter((vessel) => scope.kind === 'company' || allowed.has(vessel.id));
  if (!vessels.length) return noVessels('emergencyExercises');
  const year = Number(today.slice(0, 4));
  const person = scope.kind === 'self' ? scope.personId : null;
  if (scope.kind === 'self' && !person) return result('emergencyExercises', 'Aucune fiche personnelle accessible. Aucun score calculé.');
  const reports = await Promise.all(vessels.map((vessel) => fetchExerciseReport(client, person, year, vessel.id, 'current')));
  const total = reports.reduce((sum, report) => sum + report.total, 0);
  return result('emergencyExercises', `${total} exercice(s) et TBT déclaré(s) en ${year} · objectifs de fréquence non définis`, [
    { id: 'exercise-target', label: 'Réalisation du programme d’exercices', weight: 100, score: null,
      detail: `${total} déclarations issues des DPR dans votre périmètre. Aucun objectif annuel ou mensuel n’est configuré : aucun pourcentage de conformité n’est inventé.` },
  ], reports.flatMap((report, i) => report.total ? [] : [{ id: `exercise-empty-${vessels[i].id}`, title: `Aucun exercice déclaré en ${year}`,
    context: vessels[i].name, state: 'unplanned', dueOn: '', scheduledOn: '', location: '',
    to: `/modules/emergencyExercises?vessel=${vessels[i].id}&year=${year}${person ? `&person=${person}` : ''}` }]));
}

/** Read permission is checked before resolving any register's vessels or rows. */
export async function loadRegisterPerformance(client: SupabaseClient, moduleKeys: ModuleKey[], scope: ProcessPerformanceScope, today: string): Promise<ProcessPerformance[]> {
  const keys: RegisterKey[] = ['chemicals', 'emergencyExercises', 'lsa', 'pharmacy', 'lifting', 'medicalLogbook'];
  return Promise.all(keys.filter((key) => moduleKeys.includes(key)).map(async (key) => {
    if (key === 'medicalLogbook') return result(key, 'Registre confidentiel. Aucun objectif non clinique collectif configuré.', [
      { id: 'confidential', label: 'Indicateur collectif non clinique', weight: 100, score: null, detail: 'Aucune consultation, pathologie, identité de patient ou donnée médicale n’est interrogée pour le radar.' },
    ]);
    try {
      if (key === 'chemicals') return await chemicals(client, scope);
      if (key === 'emergencyExercises') return await exercises(client, scope, today);
      if (key === 'lsa') return await lsa(client, scope, today);
      if (key === 'pharmacy') return await pharmacy(client, scope, today);
      return await lifting(client, scope, today);
    } catch {
      return result(key, 'Les données du registre n’ont pas pu être chargées. Actualisez pour réessayer.', [], [], [NAMES[key]]);
    }
  }));
}
