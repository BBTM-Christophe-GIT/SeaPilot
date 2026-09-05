import type { QhseReportContent, QhseReportSnapshot, QhseReportOptions, QhseReportChart, QhseSafetyEvent } from './qhseReportData';
import { QHSE_REPORT_CATALOG, type QhseReportDefinition } from './qhseReportCatalog';
import { consumptionCutoff, consumptionYearSnapshot, consumptionYears } from './qhseConsumption';
import { isPersonEmployedOn } from '../humanResources/peopleQueries';

const BLUE: [number, number, number] = [24, 96, 174];
const GREEN: [number, number, number] = [11, 153, 73];
const ORANGE: [number, number, number] = [170, 94, 22];
const GREY: [number, number, number] = [105, 116, 131];
export const REPORT_MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const n = (value: number | null, digits = 2) => value === null ? '—' : new Intl.NumberFormat('fr-FR', { maximumFractionDigits: digits }).format(value);
const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const metric = (label: string, value: string, detail = '') => ({ label, value, detail });
const note = (title: string, text: string) => ({ title, text, tone: 'warning' as const });
const base = (summary: string, sources: string[]): QhseReportContent => ({ summary, metrics: [], charts: [], tables: [], notes: [], sources });
const ids = (multiple: number[] | undefined, single: number | null | undefined) => multiple?.length ? multiple : single ? [single] : [];
const within = (value: number | null | undefined, selected: number[]) => !selected.length || (value != null && selected.includes(value));
const dateOf = (action: QhseReportSnapshot['actions'][number]) => (action.occurredAt || action.openedOn).slice(0, 10);
const closed = (action: QhseReportSnapshot['actions'][number], at: string) => action.closedOn ? action.closedOn <= at : ['closed', 'solde', 'cloture'].includes(normalized(action.status));

/** Apply all three scope dimensions and the same cut-off before any report computes values. */
export function scopeMaritimeSnapshot(input: QhseReportSnapshot, options: QhseReportOptions): QhseReportSnapshot {
  const cutoff = consumptionCutoff(options);
  const years = consumptionYears(input);
  const vessels = ids(input.scope.vesselIds, input.scope.vesselId);
  const projects = ids(input.scope.projectIds, input.scope.projectId);
  const inPeriod = (date: string) => years.includes(Number(date.slice(0, 4))) && date.slice(0, 10) <= cutoff;
  const reports = input.reports.filter((r) => inPeriod(r.reportDate) && within(r.vesselId, vessels) && within(r.projectId, projects));
  const dprIds = new Set(reports.map((r) => r.id));
  const exposureRecords = input.exposureRecords?.filter((r) => inPeriod(r.date) && within(r.vesselId, vessels) && within(r.projectId, projects));
  const assignedPeople = new Set(exposureRecords?.map((r) => r.personId));
  const people = vessels.length || projects.length ? input.people.filter((p) => assignedPeople.has(p.id)) : input.people;
  const personIds = new Set(people.map((p) => p.id));
  return { ...input, scope: { ...input.scope, cutoffDate: cutoff }, reports, exposureRecords, people,
    safetyEvents: input.safetyEvents?.filter((r) => inPeriod(r.date) && within(r.vesselId, vessels) && within(r.projectId, projects)),
    actions: input.actions.filter((a) => within(a.vesselId, vessels) && within(a.projectId, projects) && dateOf(a) <= cutoff),
    hrDocuments: input.hrDocuments?.filter((d) => d.personId !== null && personIds.has(d.personId)),
    metrics: input.metrics.filter((r) => dprIds.has(r.dprId)), supplies: input.supplies.filter((r) => dprIds.has(r.dprId)),
    hseActions: input.hseActions.filter((r) => dprIds.has(r.dprId)), exercises: input.exercises.filter((r) => dprIds.has(r.dprId)),
    portCalls: input.portCalls.filter((r) => dprIds.has(r.dprId)), waste: input.waste.filter((r) => dprIds.has(r.dprId)), incidents: input.incidents.filter((r) => dprIds.has(r.dprId)),
  };
}

/** The registry is canonical. A linked action is never counted a second time. */
export function maritimeSafetyEvents(snapshot: QhseReportSnapshot): QhseSafetyEvent[] {
  const events = [...(snapshot.safetyEvents || [])];
  const linked = new Set(events.flatMap((event) => event.actionId === null ? [] : [event.actionId]));
  snapshot.actions.forEach((action) => {
    if (!consumptionYears(snapshot).includes(Number(dateOf(action).slice(0, 4)))) return;
    if (linked.has(action.id)) return;
    const classification = snapshot.actionTypes.find((type) => type.key === action.actionTypeKey)?.hseClassification
      || (normalized(action.actionTypeKey).includes('commuting') ? 'COMMUTING' : '');
    if (!classification) return;
    events.push({ id: -action.id, actionId: action.id, date: dateOf(action), classification: classification.toUpperCase(), lostDays: action.lostDays,
      vesselId: action.vesselId, projectId: action.projectId });
  });
  return events;
}

export function maritimeAnnualSafety(snapshot: QhseReportSnapshot, options: QhseReportOptions = {}) {
  const cutoff = consumptionCutoff(options);
  const scoped = ids(snapshot.scope.vesselIds, snapshot.scope.vesselId).length || ids(snapshot.scope.projectIds, snapshot.scope.projectId).length;
  const events = maritimeSafetyEvents(snapshot);
  return consumptionYears(snapshot).map((year) => {
    const yearEvents = events.filter((e) => e.date.startsWith(String(year)) && e.date <= cutoff);
    const exposure = (snapshot.exposureRecords || []).filter((e) => e.date.startsWith(String(year)) && e.date <= cutoff);
    const reference = !scoped && `${year}-12-31` <= cutoff ? snapshot.annualReferences?.find((r) => r.year === year && r.vesselId === null) : undefined;
    const hours = reference?.workedHours ?? (exposure.length ? exposure.reduce((sum, e) => sum + e.hours, 0) : null);
    const personDays = reference?.personDays ?? (exposure.length ? new Set(exposure.filter((e) => e.personId !== null).map((e) => `${e.personId}:${e.date}`)).size : null);
    const count = (classification: string) => yearEvents.filter((e) => e.classification === classification).length;
    const fat = count('FAT'); const lwdc = count('LWDC'); const lti = fat + lwdc;
    const rwc = count('RWC'); const mtc = count('MTC'); const tri = lti + rwc + mtc;
    const lostDays = yearEvents.filter((e) => ['FAT', 'LWDC'].includes(e.classification)).reduce((sum, e) => sum + e.lostDays, 0);
    const available = !snapshot.warnings.some((w) => w.startsWith('Événements HSE')) && (yearEvents.length > 0 || (year === Number(cutoff.slice(0, 4)) && exposure.length > 0));
    const rate = (numerator: number, multiplier: number) => available && hours !== null && hours > 0 ? numerator * multiplier / hours : null;
    return { year, hours, personDays, exposure, reference, events: yearEvents, available, fat, lwdc, lti, rwc, mtc, tri, fac: count('FAC'), nearMiss: count('NEAR_MISS'), observations: count('SAFETY_OBSERVATION'), commuting: count('COMMUTING'), lostDays,
      tf: rate(lti, 1_000_000), tg: rate(lostDays, 1_000), trir: rate(tri, 1_000_000), far: rate(fat, 100_000_000) };
  });
}

function monthly(snapshot: QhseReportSnapshot, id: string, title: string, values: Array<number | null>, unit: string, color = BLUE, forecastAllowed = true): QhseReportChart {
  const year = snapshot.scope.year;
  const periods = REPORT_MONTHS.map((_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  const eligibleIndices = periods.flatMap((period, index) => {
    const vessels = [...new Set(snapshot.reports.map((r) => r.vesselId))];
    const complete = vessels.length > 0 && vessels.every((vessel) => new Set(snapshot.reports.filter((r) => r.vesselId === vessel && r.reportDate.startsWith(period)).map((r) => r.reportDate)).size / new Date(year, index + 1, 0).getDate() >= .8);
    return complete ? [index] : [];
  });
  return { id, title, periods, eligibleIndices, forecastAllowed, kind: 'bar', labels: REPORT_MONTHS, unit,
    series: [{ label: unit, values, color }], subtitle: 'Totaux mensuels enregistrés · année sélectionnée' };
}

function sums(snapshot: QhseReportSnapshot, items: Array<{ dprId: number }>, value: (item: { dprId: number }) => number, options: QhseReportOptions): Array<number | null> {
  const cutoff = consumptionCutoff(options).slice(0, 7);
  return REPORT_MONTHS.map((_, index) => {
    const period = `${snapshot.scope.year}-${String(index + 1).padStart(2, '0')}`;
    const reportIds = new Set(snapshot.reports.filter((r) => r.reportDate.startsWith(period)).map((r) => r.id));
    return period > cutoff || !reportIds.size ? null : items.filter((item) => reportIds.has(item.dprId)).reduce((sum, item) => sum + value(item), 0);
  });
}

function grouped(title: string, id: string, entries: Array<[string, number]>, colors = [BLUE]): QhseReportChart {
  const sorted = [...entries].sort((a, b) => b[1] - a[1]);
  const kept = sorted.slice(0, 7);
  if (sorted.length > 7) kept.push(['Autres', sorted.slice(7).reduce((sum, [, count]) => sum + count, 0)]);
  return { id, title, kind: 'bar', horizontal: true, labels: kept.map(([key]) => key), unit: 'nombre', series: [{ label: 'Nombre', color: colors[0], values: kept.map(([, count]) => count) }], subtitle: 'Enregistrements du périmètre · aucune extrapolation' };
}
function counts(values: string[]): Array<[string, number]> {
  const result = new Map<string, number>();
  values.forEach((value) => result.set(value || 'Non renseigné', (result.get(value || 'Non renseigné') || 0) + 1));
  return [...result];
}

function safety(snapshot: QhseReportSnapshot, options: QhseReportOptions): QhseReportContent {
  const rows = maritimeAnnualSafety(snapshot, options);
  const row = rows.at(-1)!;
  const content = base('Performance sécurité · accidents du travail hors trajet · résultats enregistrés, non certifiés exhaustifs.', ['Supabase · hse_safety_events / action_items (liens dédoublonnés)', 'hse_exposure_hours : exposure_seconds / 3 600 ; historiques annuels officiels', 'Définitions : IMCA Safety Statistics ; INRS ED 6012']);
  content.metrics = [metric('Heures d’exposition', `${n(row.hours)}${row.hours === null ? '' : ' h'}`, row.reference ? 'Historique annuel officiel' : 'Heures réelles / repli planifié'), metric('TF / LTIFR', n(row.tf), '(FAT + LWDC) / million h'), metric('TG', n(row.tg, 3), 'Jours perdus / millier h'), metric('TRIR · IMCA', n(row.trir), '(FAT + LWDC + RWC + MTC) / million h')];
  const monthlyHours = REPORT_MONTHS.map((_, index) => row.exposure.filter((e) => Number(e.date.slice(5, 7)) === index + 1).reduce((sum, e) => sum + e.hours, 0));
  const monthlyComplete = !row.reference || Math.abs(row.exposure.reduce((sum, e) => sum + e.hours, 0) - row.reference.workedHours) < 0.01;
  content.charts = ['tf', 'tg'].map((key) => {
    const chart = monthly(snapshot, `safety-${key}`, key === 'tf' ? 'Taux de fréquence / LTIFR mensuel' : 'Taux de gravité mensuel', monthlyHours.map((hours, index) => {
      if (!row.available || !monthlyComplete || !hours) return null;
      const events = row.events.filter((e) => Number(e.date.slice(5, 7)) === index + 1 && ['FAT', 'LWDC'].includes(e.classification));
      return (key === 'tf' ? events.length * 1_000_000 : events.reduce((sum, e) => sum + e.lostDays, 0) * 1_000) / hours;
    }), key === 'tf' ? '/ million h' : 'jours / millier h', BLUE, false);
    chart.kind = 'line';
    chart.subtitle = 'Taux du mois · les taux ne sont jamais additionnés ni moyennés';
    chart.eligibleIndices = chart.periods!.flatMap((period, index) => new Set(row.exposure.filter((e) => e.date.startsWith(period)).map((e) => e.date)).size / new Date(row.year, index + 1, 0).getDate() >= .8 ? [index] : []);
    return chart;
  });
  content.tables = [
    { title: 'Accidentologie annuelle · nombres enregistrés', columns: ['Année', 'FAT', 'LWDC', 'RWC', 'MTC', 'FAC', 'Near miss', 'Trajet', 'Jours perdus'], rows: rows.map((r) => [String(r.year), ...[r.fat, r.lwdc, r.rwc, r.mtc, r.fac, r.nearMiss, r.commuting, r.lostDays].map((v) => r.available ? n(v) : '—')]) },
    { title: 'Référentiel sécurité · taux annuels recalculés', columns: ['Année', 'Heures', 'Hommes-jours', 'TF / LTIFR', 'TG', 'TRIR', 'FAR'], rows: rows.map((r) => [String(r.year), n(r.hours), n(r.personDays), n(r.tf), n(r.tg, 3), n(r.trir), n(r.far)]) },
  ];
  content.notes.push({ title: 'Lecture des taux', text: 'LTI = FAT + LWDC. TRIR exclut FAC, near miss et trajet. FAR = décès × 100 000 000 / heures. TF = LTI × 1 000 000 / heures ; TG = jours perdus × 1 000 / heures. Une faible exposition rend les taux très sensibles à un seul événement.' });
  if (!monthlyComplete) content.notes.push(note('Ventilation mensuelle indisponible', 'Les heures annuelles officielles ne sont pas ventilées par mois. Les courbes mensuelles restent vides ; aucun prorata n’est inventé.'));
  if (row.exposure.some((e) => e.actualHours == null) && !row.reference) content.notes.push(note('Base d’exposition mixte', 'Le registre combine heures réellement saisies et repli planifié configuré dans Supabase. Ces taux sont des indicateurs internes ; leur comparabilité IMCA dépend de la validation du périmètre d’heures.'));
  if (rows.some((r) => !r.available || !r.hours)) content.notes.push(note('Données à compléter', '— = heures absentes ou absence d’événements non certifiée. Les historiques entreprise ne sont jamais affectés arbitrairement à un navire ou un projet.'));
  return content;
}

function safetyAnalysis(snapshot: QhseReportSnapshot, options: QhseReportOptions): QhseReportContent {
  const annual = maritimeAnnualSafety(snapshot, options); const rows = annual.flatMap((r) => r.events);
  const content = base('Analyse des événements déclarés · hiérarchie de gravité sans ratio théorique de Bird.', ['Supabase · hse_safety_events et action_items liés']);
  const totals = (field: 'tri' | 'lti' | 'fac' | 'nearMiss') => annual.reduce((sum, r) => sum + r[field], 0);
  const recorded = (field: 'tri' | 'lti' | 'fac' | 'nearMiss') => annual.some((r) => r.available) ? n(totals(field)) : '—';
  content.metrics = [metric('Accidents enregistrables', recorded('tri'), 'FAT + LWDC + RWC + MTC'), metric('LTI', recorded('lti'), 'Décès inclus une seule fois'), metric('Premiers soins', recorded('fac'), 'FAC'), metric('Presqu’accidents', recorded('nearMiss'), 'Near miss')];
  const actions = snapshot.actions.filter((a) => rows.some((e) => e.actionId === a.id));
  content.charts = [grouped('Typologie des événements', 'safety-types', counts(rows.map((e) => e.classification))), grouped('Causes documentées', 'safety-causes', counts(actions.map((a) => a.anomalyCause || 'Non renseignée')), [ORANGE])];
  content.tables = [{ title: 'Registre des événements · sans données personnelles de santé', columns: ['Date', 'Classe', 'Navire', 'Jours perdus'], rows: rows.sort((a, b) => a.date.localeCompare(b.date)).map((e) => [e.date.split('-').reverse().join('/'), e.classification, snapshot.actions.find((a) => a.id === e.actionId)?.vesselName || (e.vesselId ? `Navire ${e.vesselId}` : 'Non renseigné'), n(e.lostDays)]) }];
  content.notes = [note('Prudence d’interprétation', 'Le nombre de déclarations ne prouve ni l’exhaustivité du registre ni le niveau réel de risque. Aucun lien statistique de causalité n’est déduit entre near miss et accidents graves.')];
  return content;
}

function prevention(snapshot: QhseReportSnapshot, options: QhseReportOptions): QhseReportContent {
  const cutoff = consumptionCutoff(options); const hseIds = new Set(snapshot.hseActions.map((h) => h.dprId));
  const talks = snapshot.hseActions.filter((h) => h.tbtPerformed).length;
  const open = snapshot.actions.filter((a) => dateOf(a) <= cutoff && !closed(a, cutoff));
  const content = base('Prévention opérationnelle · exercices, toolbox talks et suivi des actions.', ['Supabase · DPR soumis/validés, dpr_emergency_exercises, dpr_hse_actions', 'action_items · statut et échéance à la date d’édition']);
  content.metrics = [metric('Exercices déclarés', n(snapshot.exercises.length)), metric('TBT / DPR renseignés', hseIds.size ? `${n(talks / hseIds.size * 100, 1)} %` : '—', `${talks} / ${hseIds.size} DPR avec rubrique HSE`), metric('Actions ouvertes', n(open.length)), metric('Actions en retard', n(open.filter((a) => a.dueOn && a.dueOn < cutoff).length), 'Échéance dépassée à la date d’édition')];
  const exercises = sums(snapshot, snapshot.exercises, () => 1, options);
  const tbt = REPORT_MONTHS.map((_, index) => {
    const reportIds = new Set(snapshot.reports.filter((r) => Number(r.reportDate.slice(5, 7)) === index + 1).map((r) => r.id));
    const hse = snapshot.hseActions.filter((r) => reportIds.has(r.dprId));
    return hse.length ? 100 * hse.filter((h) => h.tbtPerformed).length / hse.length : null;
  });
  content.charts = [monthly(snapshot, 'prevention-exercises', 'Exercices d’urgence mensuels', exercises, 'nombre'), monthly(snapshot, 'prevention-tbt', 'Couverture mensuelle des toolbox talks', tbt, '%', GREEN, false)];
  content.tables = [{ title: 'Exercices par type', columns: ['Type déclaré', 'Nombre'], rows: counts(snapshot.exercises.map((e) => e.type)).map(([type, count]) => [type, n(count)]) }];
  content.notes = [{ title: 'Périmètre des indicateurs', text: `Couverture de saisie HSE : ${hseIds.size} / ${snapshot.reports.length} DPR. Le taux TBT porte sur les DPR renseignés, pas sur le nombre de salariés formés. Le stock d’actions est observé à la date d’édition, pas reconstitué historiquement.` }];
  return content;
}

function environment(snapshot: QhseReportSnapshot, options: QhseReportOptions): QhseReportContent {
  const content = base('Bilan environnemental · volumes déclarés et déchets collectés, sans confondre avitaillement et consommation.', ['Supabase · dpr_daily_metrics, dpr_supplies, dpr_waste_records', 'qhse_environment_parameters · facteur MDO et hypothèse XBEE']);
  let baseline = 0; let emitted = 0; let missingFactor = false;
  const fuelRows = snapshot.metrics.filter((m) => m.fuelReported !== false);
  const waterRows = snapshot.supplies.filter((s) => s.waterReported !== false);
  fuelRows.forEach((m) => {
    const date = snapshot.reports.find((r) => r.id === m.dprId)?.reportDate || '';
    const parameter = snapshot.environmentParameters?.filter((p) => p.effectiveFrom <= date && (!p.effectiveTo || p.effectiveTo >= date)).at(-1);
    if (!parameter?.directCombustionFactor || parameter.xbeeReductionRate < 0 || parameter.xbeeReductionRate > 1) { missingFactor = true; return; }
    const co2 = m.fuelConsumedLiters / 1000 * parameter.directCombustionFactor;
    baseline += co2; emitted += co2 * (1 - parameter.xbeeReductionRate);
  });
  const fuel = fuelRows.reduce((sum, m) => sum + m.fuelConsumedLiters, 0) / 1000;
  const water = waterRows.reduce((sum, s) => sum + s.waterM3, 0);
  const solids = snapshot.waste.filter((w) => w.unit.toLowerCase() === 'kg'); const liquids = snapshot.waste.filter((w) => w.unit.toLowerCase() === 'l');
  const solidMap = new Map(solids.map((w) => [w, w.quantity])); const liquidMap = new Map(liquids.map((w) => [w, w.quantity]));
  content.metrics = [metric('Eau avitaillée', waterRows.length ? `${n(water)} m³` : '—'), metric('Fuel consommé', fuelRows.length ? `${n(fuel)} m³` : '—', 'DPR : litres / 1 000'), metric('GES avec XBEE · estimés', missingFactor || !fuelRows.length ? '—' : `${n(emitted)} tCO₂e`), metric('Réduction estimée', missingFactor || !fuelRows.length ? '—' : `${n(baseline - emitted)} tCO₂e`)];
  content.charts = [monthly(snapshot, 'environment-solid', 'Déchets solides collectés par mois', sums(snapshot, solids, (w) => solidMap.get(w as typeof solids[number]) || 0, options), 'kg'), monthly(snapshot, 'environment-liquid', 'Déchets liquides collectés par mois', sums(snapshot, liquids, (w) => liquidMap.get(w as typeof liquids[number]) || 0, options), 'litres')];
  // Waste declarations are sporadic; no daily zero declaration proves monthly completeness.
  content.charts.forEach((c) => { c.eligibleIndices = []; });
  const wasteTypes = [...new Set(snapshot.waste.map((w) => `${w.type}|${w.unit}`))];
  content.tables = [{ title: 'Déchets par filière · unités conservées', columns: ['Type', 'Quantité', 'Unité'], rows: wasteTypes.map((key) => { const [type, unit] = key.split('|'); return [type, n(snapshot.waste.filter((w) => w.type === type && w.unit === unit).reduce((sum, w) => sum + w.quantity, 0)), unit]; }) }];
  content.notes = [{ title: 'Périmètre carbone', text: 'Combustion directe du MDO : litres consommés / 1 000 × facteur Supabase (tCO₂e/m³). La réduction XBEE est une hypothèse de calcul configurée, non une mesure d’émissions. Eau : quantité avitaillée, non consommation mesurée. Le détail des courbes eau/fuel/GES figure dans « Consommations par projet ».' }, note('Complétude déchets', 'Aucune validation de complétude mensuelle des déchets n’est disponible. Les valeurs sont les quantités déclarées ; les tendances et prévisions restent indisponibles.')];
  if (missingFactor) content.notes.push(note('Facteur absent', 'Une période de consommation n’a pas de facteur d’émission Supabase applicable ; aucun total carbone partiel n’est présenté comme complet.'));
  if (fuelRows.length < snapshot.reports.length || waterRows.length < snapshot.reports.length) content.notes.push(note('Couverture de saisie', `Fuel renseigné : ${fuelRows.length} / ${snapshot.reports.length} DPR ; eau renseignée : ${waterRows.length} / ${snapshot.reports.length}. Les totaux portent uniquement sur les valeurs déclarées ; une rubrique absente n’est pas un zéro certifié.`));
  return content;
}

function training(snapshot: QhseReportSnapshot, options: QhseReportOptions): QhseReportContent {
  const cutoff = consumptionCutoff(options); const year = snapshot.scope.year;
  const at = `${year}-12-31` < cutoff ? `${year}-12-31` : cutoff;
  const people = snapshot.people.filter((p) => isPersonEmployedOn(p, at)); const personIds = new Set(people.map((p) => p.id));
  const documents = (snapshot.hrDocuments || []).filter((d) => d.personId !== null && personIds.has(d.personId) && ['safety_training', 'deck', 'engine', 'lifting', 'safety_induction'].includes(d.categoryKey));
  const due = documents.filter((d) => d.expiresOn.startsWith(String(year)));
  const medical = (snapshot.hrDocuments || []).filter((d) => d.personId !== null && personIds.has(d.personId) && d.categoryKey === 'medical_visit' && d.expiresOn.startsWith(String(year)));
  const content = base('Plan de formation · besoins de renouvellement issus des échéances RH. Il ne s’agit pas de formations réalisées.', ['Supabase · people et hr_documents · titres, catégories et dates d’échéance']);
  content.metrics = [metric('Renouvellements à anticiper', n(due.length), `Échéances ${year} · documents connus`), metric('Collaborateurs concernés', n(new Set(due.map((d) => d.personId)).size)), metric('Visites médicales à échéance', n(medical.length), 'Dénombrement uniquement'), metric('Sans date d’échéance', n(documents.filter((d) => !d.expiresOn).length), 'Pas forcément soumis à renouvellement')];
  content.charts = [{ id: 'training-expiries', title: 'Calendrier des échéances connues', kind: 'bar', labels: REPORT_MONTHS, unit: 'documents', subtitle: 'Dates enregistrées · y compris les échéances futures connues', series: [{ label: 'Formations / titres', color: BLUE, values: REPORT_MONTHS.map((_, i) => due.filter((d) => Number(d.expiresOn.slice(5, 7)) === i + 1).length) }, { label: 'Visites médicales', color: GREY, values: REPORT_MONTHS.map((_, i) => medical.filter((d) => Number(d.expiresOn.slice(5, 7)) === i + 1).length) }] }];
  content.tables = [{ title: 'Plan de renouvellement · détail intégral', columns: ['Collaborateur', 'Formation / titre', 'Échéance', 'Situation à l’édition'], rows: due.sort((a, b) => a.expiresOn.localeCompare(b.expiresOn)).map((d) => {
    const p = people.find((person) => person.id === d.personId);
    return [[p?.firstName, p?.lastName].filter(Boolean).join(' ') || 'Non renseigné', d.title, d.expiresOn.split('-').reverse().join('/'), d.expiresOn < cutoff ? 'Échéance passée · vérifier' : 'À planifier'];
  }) }];
  content.notes = [note('Données de formation à compléter', 'Les tarifs du rapport RH historique sont codés dans l’application, pas enregistrés dans Supabase : ils ne sont pas repris. Budget, heures de formation réalisées et taux de réalisation restent non disponibles. Le statut de renouvellement doit être vérifié dans la fiche RH.'), { title: 'Lecture historique', text: 'Le rapport utilise les documents RH actuellement accessibles : il ne reconstitue pas les versions des titres ou leur validité historique. Aucune aptitude médicale individuelle n’est publiée.' }];
  return content;
}

function portCalls(snapshot: QhseReportSnapshot, options: QhseReportOptions): QhseReportContent {
  const cutoff = consumptionCutoff(options);
  // DPR drafts create an empty port-call row even when no stop took place.
  const calls = snapshot.portCalls.filter((c) => c.arrivalAt || c.departureAt || c.portName || c.reasons.length).map((c) => {
    const start = Date.parse(c.arrivalAt); const end = Date.parse(c.departureAt);
    const duration = Number.isFinite(start) && Number.isFinite(end) && end >= start && c.departureAt.slice(0, 10) <= cutoff ? (end - start) / 3_600_000 : null;
    return { ...c, duration };
  });
  const completed = calls.filter((c) => c.duration !== null);
  const total = completed.reduce((sum, c) => sum + c.duration!, 0);
  const content = base('Escales opérationnelles · durée entre accostage et appareillage, sans majoration de 1 h 30.', ['Supabase · dpr_port_calls et dpr_port_call_reasons', 'qhse_contract_targets · objectifs par navire/projet/année']);
  content.metrics = [metric('Escales renseignées', n(calls.length), `${completed.length} durées complètes`), metric('Durée cumulée', `${n(total)} h`), metric('Durée moyenne', completed.length ? `${n(total / completed.length)} h` : '—'), metric('Escales incomplètes', n(calls.length - completed.length))];
  const periods = REPORT_MONTHS.map((_, i) => `${snapshot.scope.year}-${String(i + 1).padStart(2, '0')}`);
  const chart = monthly(snapshot, 'port-hours', 'Durée totale des escales par mois', periods.map((period) => {
    if (period > cutoff.slice(0, 7) || !snapshot.reports.some((r) => r.reportDate.startsWith(period))) return null;
    return completed.filter((c) => c.arrivalAt.startsWith(period)).reduce((sum, c) => sum + c.duration!, 0);
  }), 'heures');
  chart.eligibleIndices = chart.eligibleIndices?.filter((i) => !calls.some((c) => c.arrivalAt.startsWith(periods[i]) && c.duration === null));
  const label = (value: string) => ({ 'crew-change': 'Crew change', 'port-call-14h': '14h Port Call', 'port-call-24h': '24h Port Call', 'weather-standby': 'Stand-by météo', breakdown: 'Avarie', standby: 'Stand-by', 'off-hire': 'Off-hire' })[value] || value;
  content.charts = [chart, grouped('Motifs des escales', 'port-reasons', counts(calls.flatMap((c) => c.reasons.length ? c.reasons.map(label) : ['Non renseigné'])))];
  const targets = (snapshot.contractTargets || []).filter((t) => t.year === snapshot.scope.year && within(t.vesselId, ids(snapshot.scope.vesselIds, snapshot.scope.vesselId)) && within(t.projectId, ids(snapshot.scope.projectIds, snapshot.scope.projectId)));
  if (targets.length) content.tables.push({ title: 'Suivi contractuel · objectifs Supabase', columns: ['Projet / navire', 'Avarie (j)', 'Objectif (j)', '24h Port Call', 'Objectif'], rows: targets.map((target) => {
    const reportIds = new Set(snapshot.reports.filter((r) => r.projectId === target.projectId && r.vesselId === target.vesselId).map((r) => r.id));
    const scoped = completed.filter((c) => reportIds.has(c.dprId));
    const report = snapshot.reports.find((r) => reportIds.has(r.id));
    return [[report?.projectLabel, report?.vesselName].filter(Boolean).join(' / ') || `${target.projectId} / ${target.vesselId}`, n(scoped.filter((c) => c.reasons.includes('breakdown')).reduce((sum, c) => sum + c.duration!, 0) / 24), n(target.maintenanceDaysLimit), n(scoped.filter((c) => c.reasons.includes('port-call-24h')).length), n(target.portCall24hLimit)];
  }) });
  content.tables.push({ title: 'Durées par catégorie opérationnelle', columns: ['Catégorie déclarée', 'Escales', 'Durées complètes', 'Moyenne (h)'], rows: ['port-call-14h', 'port-call-24h', 'weather-standby'].map((key) => {
    const declared = calls.filter((c) => c.reasons.includes(key)); const timed = declared.filter((c) => c.duration !== null);
    return [label(key), n(declared.length), n(timed.length), timed.length ? n(timed.reduce((sum, c) => sum + c.duration!, 0) / timed.length) : '—'];
  }) });
  content.tables.push({ title: 'Détail intégral des escales', columns: ['Accostage', 'Navire / port', 'Durée (h)', 'Motifs'], rows: calls.map((c) => [c.arrivalAt ? c.arrivalAt.slice(0, 10).split('-').reverse().join('/') : '—', [snapshot.reports.find((r) => r.id === c.dprId)?.vesselName, c.portName].filter(Boolean).join(' / '), n(c.duration), c.reasons.map(label).join(', ') || 'Non renseigné']) });
  content.notes = [{ title: 'Règles de lecture', text: 'Les rubriques escale entièrement vides sont exclues. Escales classées au mois de l’accostage ; seules les durées complètes sont totalisées. Les motifs peuvent se cumuler : leur somme n’est pas le nombre d’escales. Maintenance Avarie = heures complètes / 24 ; cette durée n’est pas un nombre de dates calendaires.' }];
  const unqualified = calls.filter((c) => c.reasons.includes('crew-change') && !c.reasons.some((r) => ['port-call-14h', 'port-call-24h'].includes(r))).length;
  if (unqualified) content.notes.push(note('Qualification des Crew change', `${unqualified} escale(s) Crew change sans qualification 14h / 24h. Leur durée ne permet pas de déduire la catégorie contractuelle : les comptes 14h / 24h portent uniquement sur les cases explicitement renseignées.`));
  return content;
}

export function buildMaritimeContent(report: QhseReportDefinition, snapshot: QhseReportSnapshot, options: QhseReportOptions, fallback: () => QhseReportContent): QhseReportContent {
  switch (report.id) {
    case 'menu': {
      const content = base(options.contents ? 'Sommaire du PDF composé · seules les pages retenues sont incluses.' : 'Catalogue des modèles disponibles · les numéros ci-dessous identifient les modèles, pas les pages du PDF final.', ['Données Supabase accessibles au profil connecté ; aucune valeur importée du fichier Power BI']);
      content.tables = [{ title: options.contents ? 'Rapports sélectionnés' : 'Modèles de rapports', columns: [options.contents ? 'Page' : 'Modèle', 'Rapport'], rows: options.contents ? options.contents.map((item) => [String(item.page), item.title]) : QHSE_REPORT_CATALOG.filter((r) => r.id !== 'menu').map((r) => [String(r.pageNumber), r.title]) }];
      content.notes = [{ title: 'Lecture', text: 'Traits pleins : données observées. Losanges : tendance des mois documentés. Pointillés : prévision, exclue des totaux. — signale une donnée absente ou un calcul non justifié. Les tableaux de détail sont paginés sans suppression de lignes.' }];
      return content;
    }
    case 'social-safety-1': return safety(snapshot, options);
    case 'social-safety-2': return safetyAnalysis(snapshot, options);
    case 'social-safety-vessel': return prevention(snapshot, options);
    case 'environment': return environment(snapshot, options);
    case 'training-plan': return training(snapshot, options);
    case 'port-call-tracking-v2': return portCalls(snapshot, options);
    default: return fallback();
  }
}

export function maritimeYearSnapshot(snapshot: QhseReportSnapshot, year: number, options: QhseReportOptions) {
  return scopeMaritimeSnapshot({ ...snapshot, ...consumptionYearSnapshot(snapshot, year, consumptionCutoff(options)), scope: { ...snapshot.scope, year, years: [year] } }, options);
}
