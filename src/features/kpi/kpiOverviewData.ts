import type { QhseReportOptions, QhseReportSnapshot, QhseReportChart } from './qhseReportData';
import { buildQhseReportContent } from './qhseReportData';
import { QHSE_REPORT_CATALOG } from './qhseReportCatalog';
import { maritimeAnnualSafety, maritimeYearSnapshot, REPORT_MONTHS, scopeMaritimeSnapshot } from './qhseMaritimeReports';
import { consumptionCutoff } from './qhseConsumption';
import { isPersonEmployedOn } from '../humanResources/peopleQueries';

export const KPI_DOMAINS = ['Sécurité', 'Prévention', 'Environnement', 'RH'] as const;
export type KpiDomain = typeof KPI_DOMAINS[number];
export type KpiSafetyMetric = 'tf' | 'tg' | 'trir' | 'far';
const TRAINING_CATEGORIES = ['safety_training', 'deck', 'engine', 'lifting', 'safety_induction'];

/** Same scoped registry and official historical denominators as the PDF, never averaged rates. */
export function buildKpiOverview(input: QhseReportSnapshot, options: QhseReportOptions = {}) {
  const snapshot = scopeMaritimeSnapshot(input, options);
  const annual = maritimeAnnualSafety(snapshot, options);
  const completeHours = annual.length > 0 && annual.every((row) => row.hours !== null);
  const hours = completeHours ? annual.reduce((sum, row) => sum + row.hours!, 0) : null;
  const ratesAvailable = completeHours && hours! > 0 && annual.every((row) => row.available);
  const rate = (key: 'lti' | 'lostDays' | 'tri', factor: number) => ratesAvailable
    ? annual.reduce((sum, row) => sum + row[key], 0) * factor / hours! : null;
  const cutoff = consumptionCutoff(options);
  const people = new Set(snapshot.people.filter((p) => isPersonEmployedOn(p, cutoff)).map((p) => p.id));
  const scopedPeopleMissing = Boolean((snapshot.scope.projectIds?.length || snapshot.scope.vesselIds?.length || snapshot.scope.vesselId || snapshot.scope.projectId) && !snapshot.exposureRecords?.length);
  const hrUnavailable = scopedPeopleMissing || snapshot.warnings.some((warning) => /^(Documents RH|Ressources humaines)/.test(warning));
  const renewals = hrUnavailable ? null : (snapshot.hrDocuments || []).filter((d) => d.personId !== null && people.has(d.personId)
    && TRAINING_CATEGORIES.includes(d.categoryKey) && d.expiresOn.startsWith(cutoff.slice(0, 7))).length;
  const closed = (status: string) => ['closed', 'solde', 'cloture'].includes(status.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase());
  const open = snapshot.actions.filter((action) => !(action.closedOn && action.closedOn <= cutoff) && !closed(action.status));
  const overdue = open.filter((action) => action.dueOn && action.dueOn < cutoff).length;
  const warnings = [...snapshot.warnings];
  if (annual.some((row) => !row.available || !row.hours)) warnings.push('Sécurité : heures absentes ou déclaration historique non exhaustive. Les taux du périmètre incomplet restent indisponibles.');
  if (annual.some((row) => !row.reference && row.exposure.some((exposure) => exposure.actualHours == null))) warnings.push('Exposition mixte : le registre combine heures réelles et repli planifié. Comparabilité IMCA à valider.');
  if (snapshot.scope.projectIds?.length || snapshot.scope.projectId) {
    if (!snapshot.exposureRecords?.length) warnings.push('Exposition non ventilée sur les projets sélectionnés : les heures flotte ne sont pas utilisées en remplacement.');
  }
  if (scopedPeopleMissing) warnings.push('Population RH non identifiable sur ce périmètre sans affectations d’exposition.');
  return { snapshot, annual, hours, tf: rate('lti', 1_000_000), tg: rate('lostDays', 1_000), trir: rate('tri', 1_000_000),
    overdue, open: open.length, renewals, cutoff, warnings: [...new Set(warnings)] };
}

/** Monthly cumulative comparison: one line per selected year, with no invented historical split. */
export function buildKpiSafetyChart(input: QhseReportSnapshot, key: KpiSafetyMetric, options: QhseReportOptions): QhseReportChart {
  const { annual, cutoff } = buildKpiOverview(input, options);
  const names = { tf: 'Évolution de la fréquence / LTIFR', tg: 'Évolution du taux de gravité', trir: 'Évolution des accidents enregistrables', far: 'Fréquence des accidents mortels' };
  const colors: [number, number, number][] = [[22, 101, 148], [153, 94, 39], [100, 87, 153], [17, 132, 104]];
  return { title: names[key], kind: 'line', labels: REPORT_MONTHS, unit: key === 'tg' ? 'jours / 1 000 h' : key === 'far' ? '/ 100 millions h' : '/ million h',
    subtitle: 'Cumul depuis janvier · chaque année conserve son dénominateur', series: annual.map((row, index) => {
      const splitAvailable = !row.reference || Math.abs(row.exposure.reduce((sum, e) => sum + e.hours, 0) - row.reference.workedHours) < .01;
      return { label: String(row.year), color: colors[index % colors.length], values: REPORT_MONTHS.map((_, month) => {
        const period = `${row.year}-${String(month + 1).padStart(2, '0')}`;
        if (period > cutoff.slice(0, 7) || !row.available || !splitAvailable) return null;
        // No flat continuation through undocumented months.
        if (!row.exposure.some((e) => e.date.startsWith(period))) return null;
        const hours = row.exposure.filter((e) => e.date.slice(0, 7) <= period).reduce((sum, e) => sum + e.hours, 0);
        const events = row.events.filter((e) => e.date.slice(0, 7) <= period);
        const classifications = key === 'trir' ? ['FAT', 'LWDC', 'RWC', 'MTC'] : key === 'far' ? ['FAT'] : ['FAT', 'LWDC'];
        const selected = events.filter((e) => classifications.includes(e.classification));
        const numerator = key === 'tg' ? selected.reduce((sum, e) => sum + e.lostDays, 0) : selected.length;
        return hours > 0 ? numerator * (key === 'tg' ? 1_000 : key === 'far' ? 100_000_000 : 1_000_000) / hours : null;
      }) };
    }) };
}

export function buildKpiDomainContent(snapshot: QhseReportSnapshot, domain: Exclude<KpiDomain, 'Sécurité'>, year: number, options: QhseReportOptions) {
  const id = domain === 'Prévention' ? 'social-safety-vessel' : domain === 'Environnement' ? 'consumption' : 'training-plan';
  return buildQhseReportContent(QHSE_REPORT_CATALOG.find((r) => r.id === id)!, maritimeYearSnapshot(snapshot, year, options), options);
}
