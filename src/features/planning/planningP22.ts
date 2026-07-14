import { addPlanningDays, daysBetween, formatPlanningPerson, rangesOverlap } from './planningModel';
import {
  buildPlanningP12Conflicts,
  buildPlanningReplacementCandidates,
  type PlanningAbsenceRecord,
  type PlanningDetectedConflict,
} from './planningP12';
import type { PlanningDateRange, PlanningP13Data } from './planningP13';
import type { PlanningOverview, PlanningProjectRecord } from './planningQueries';

export type PlanningP22Readiness = 'ready' | 'limited' | 'blocked';
export type PlanningP22EvidenceKind = 'fact' | 'rule' | 'estimate';
export type PlanningP22ScenarioKind = 'absence' | 'vessel_unavailability';

export interface PlanningP22QualityCheck {
  key: string;
  label: string;
  status: PlanningP22Readiness;
  observed: string;
  completeness: number | null;
  finding: string;
  impact: string;
}

export interface PlanningP22FeatureReadiness {
  key: string;
  label: string;
  status: PlanningP22Readiness;
  reason: string;
}

export interface PlanningP22DataQualityReport {
  overallStatus: PlanningP22Readiness;
  overallFinding: string;
  sourceCounts: Array<{ label: string; count: number; source: string }>;
  checks: PlanningP22QualityCheck[];
  features: PlanningP22FeatureReadiness[];
  facts: string[];
  limits: string[];
}

export interface PlanningP22VesselLoad {
  vesselId: number;
  vesselName: string;
  scheduledDays: number;
  operationDays: number;
  transitDays: number;
  maintenanceDays: number;
  unavailableDays: number;
  assignmentDays: number;
  plannedLoadPercent: number;
  sourceEvents: number;
}

export interface PlanningP22SailorLoad {
  personId: number;
  personName: string;
  assignedDays: number;
  absenceDays: number;
  recordedWorkDays: number;
  plannedLoadPercent: number;
  assignmentCount: number;
  overlapCount: number;
}

export interface PlanningP22TensionWindow {
  startsOn: string;
  endsOn: string;
  peakScore: number;
  operationalEvents: number;
  unavailableVessels: number;
  crewMovements: number;
  conflicts: number;
  confidence: 'medium' | 'low';
  facts: string[];
  assumptions: string[];
  limits: string[];
}

export interface PlanningP22ScenarioInput {
  kind: PlanningP22ScenarioKind;
  personId: number | null;
  vesselId: number | null;
  startsOn: string;
  endsOn: string;
}

export interface PlanningP22ScenarioMetric {
  key: string;
  label: string;
  baseline: number;
  scenario: number;
  delta: number;
  unit: string;
  evidenceKind: PlanningP22EvidenceKind;
}

export interface PlanningP22AlternativePlan {
  key: string;
  label: string;
  description: string;
  benefits: string[];
  risks: string[];
}

export interface PlanningP22ScenarioResult {
  title: string;
  confidence: { level: 'medium' | 'low'; score: number };
  metrics: PlanningP22ScenarioMetric[];
  facts: string[];
  rules: string[];
  estimates: string[];
  dataUsed: string[];
  assumptions: string[];
  limits: string[];
  conflicts: PlanningDetectedConflict[];
  alternatives: PlanningP22AlternativePlan[];
  humanValidationRequired: true;
}

const MAX_ANALYSIS_DAYS = 400;

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

function percent(part: number, total: number): number | null {
  return total ? rounded((part / total) * 100) : null;
}

function rangeDays(range: PlanningDateRange): number {
  return Math.max(0, Math.min(MAX_ANALYSIS_DAYS, daysBetween(range.start, range.end) + 1));
}

function datesInRange(range: PlanningDateRange): string[] {
  const count = rangeDays(range);
  return Array.from({ length: count }, (_, index) => addPlanningDays(range.start, index));
}

function clippedDates(startsOn: string, endsOn: string, range: PlanningDateRange): string[] {
  if (!startsOn || !endsOn || !rangesOverlap(startsOn, endsOn, range.start, range.end)) return [];
  const start = startsOn > range.start ? startsOn : range.start;
  const end = endsOn < range.end ? endsOn : range.end;
  const count = Math.min(MAX_ANALYSIS_DAYS, daysBetween(start, end) + 1);
  return Array.from({ length: Math.max(0, count) }, (_, index) => addPlanningDays(start, index));
}

function statusForRows(rows: number, readyThreshold: number): PlanningP22Readiness {
  if (!rows) return 'blocked';
  return rows >= readyThreshold ? 'ready' : 'limited';
}

function qualityCheck(input: PlanningP22QualityCheck): PlanningP22QualityCheck {
  return input;
}

export function analyzePlanningP22DataQuality(
  overview: PlanningOverview,
  data: PlanningP13Data,
  range: PlanningDateRange,
): PlanningP22DataQualityReport {
  const activeVessels = overview.vessels.filter((vessel) => vessel.active);
  const activePeople = overview.people.filter((person) => person.active);
  const validAssignments = overview.assignments.filter((assignment) => assignment.startsOn
    && assignment.endsOn >= assignment.startsOn
    && assignment.crewPersonId
    && assignment.vesselId
    && assignment.assignmentRole.trim());
  const validProjects = overview.projects.filter((project) => project.startsOn
    && (project.endsOn || project.startsOn) >= project.startsOn
    && (project.primaryVesselId || project.secondaryVesselId));
  const peopleWithDocuments = new Set(overview.hrDocuments.map((document) => document.personId).filter(Boolean));
  const daysWithWorkMetrics = overview.days.filter((day) => day.workedHours !== null
    || day.rest24h !== null || day.cumulative7d !== null);
  const activeMatrices = data.p12.matrices.filter((matrix) => matrix.status === 'active' && matrix.requirements.length);
  const maintenanceEvents = overview.projects.filter((project) => project.eventType === 'maintenance');
  const approvedAbsences = data.p12.absences.filter((absence) => absence.status === 'approved');
  const relevantProjects = validProjects.filter((project) => rangesOverlap(project.startsOn, project.endsOn || project.startsOn, range.start, range.end));
  const relevantAssignments = validAssignments.filter((assignment) => rangesOverlap(assignment.startsOn, assignment.endsOn, range.start, range.end));

  const assignmentCompleteness = percent(validAssignments.length, overview.assignments.length);
  const projectCompleteness = percent(validProjects.length, overview.projects.length);
  const hrCoverage = percent(activePeople.filter((person) => peopleWithDocuments.has(person.id)).length, activePeople.length);
  const checks: PlanningP22QualityCheck[] = [
    qualityCheck({
      key: 'dimensions', label: 'Navires et marins',
      status: activeVessels.length && activePeople.length ? 'ready' : 'blocked',
      observed: `${activeVessels.length} navire(s) actif(s), ${activePeople.length} marin(s) actif(s)`,
      completeness: null,
      finding: activeVessels.length && activePeople.length ? 'Les dimensions nécessaires aux analyses de charge sont présentes.' : 'Une dimension opérationnelle est vide.',
      impact: 'Conditionne toutes les analyses par navire et par marin.',
    }),
    qualityCheck({
      key: 'projects', label: 'Programme navires',
      status: statusForRows(relevantProjects.length, 12),
      observed: `${relevantProjects.length} événement(s) dans la période, ${projectCompleteness ?? 0}% de lignes structurellement complètes`,
      completeness: projectCompleteness,
      finding: relevantProjects.length ? 'Le programme connu permet une projection descriptive de charge.' : 'Aucun événement exploitable dans la période.',
      impact: 'Autorise la charge navire et la tension planifiée, sans prédire une demande non saisie.',
    }),
    qualityCheck({
      key: 'assignments', label: 'Affectations marins',
      status: statusForRows(relevantAssignments.length, 30),
      observed: `${relevantAssignments.length} affectation(s) dans la période, ${assignmentCompleteness ?? 0}% de lignes structurellement complètes`,
      completeness: assignmentCompleteness,
      finding: relevantAssignments.length >= 30 ? 'Le volume permet une analyse descriptive stable.' : 'Le volume est trop faible pour apprendre une tendance statistique.',
      impact: 'La charge marin et les simulations restent factuelles ; aucune extrapolation historique fiable.',
    }),
    qualityCheck({
      key: 'manning', label: 'Matrices d’armement',
      status: activeMatrices.length ? 'ready' : 'blocked',
      observed: `${activeMatrices.length} matrice(s) active(s) avec exigences`,
      completeness: percent(new Set(activeMatrices.map((matrix) => matrix.vesselId)).size, activeVessels.length),
      finding: activeMatrices.length ? 'Des besoins cibles explicites peuvent être comparés au plan.' : 'Aucun besoin d’effectif cible n’est disponible.',
      impact: 'Sans matrice, une prévision de sous-effectif serait spéculative et reste désactivée.',
    }),
    qualityCheck({
      key: 'work_rest', label: 'Travail et repos',
      status: data.policies.length && daysWithWorkMetrics.length ? 'ready' : 'blocked',
      observed: `${data.policies.length} politique(s), ${daysWithWorkMetrics.length}/${overview.days.length} journée(s) avec métriques`,
      completeness: percent(daysWithWorkMetrics.length, overview.days.length),
      finding: data.policies.length && daysWithWorkMetrics.length ? 'Les règles administrées et métriques sont exploitables.' : 'Seuils administrés ou métriques détaillées absents.',
      impact: 'Aucune prévision de fatigue ou non-conformité future n’est produite.',
    }),
    qualityCheck({
      key: 'absence_history', label: 'Historique des absences',
      status: statusForRows(approvedAbsences.length, 20),
      observed: `${approvedAbsences.length} absence(s) validée(s)`,
      completeness: null,
      finding: approvedAbsences.length >= 20 ? 'Un historique descriptif existe.' : 'L’historique est insuffisant pour estimer une fréquence future.',
      impact: 'La simulation d’absence reste un scénario manuel, jamais une probabilité.',
    }),
    qualityCheck({
      key: 'hr_documents', label: 'Documents RH',
      status: hrCoverage === null ? 'blocked' : hrCoverage >= 80 ? 'ready' : 'limited',
      observed: `${overview.hrDocuments.length} document(s), couverture de ${hrCoverage ?? 0}% des marins actifs`,
      completeness: hrCoverage,
      finding: hrCoverage !== null && hrCoverage >= 80 ? 'La couverture permet d’expliquer des compatibilités documentaires.' : 'La couverture documentaire reste partielle.',
      impact: 'Les alternatives signalent les données manquantes au lieu de conclure à la conformité.',
    }),
    qualityCheck({
      key: 'maintenance_history', label: 'Maintenance planifiée',
      status: statusForRows(maintenanceEvents.length, 12),
      observed: `${maintenanceEvents.length} événement(s) de maintenance`,
      completeness: projectCompleteness,
      finding: maintenanceEvents.length >= 12 ? 'Un historique descriptif est disponible.' : 'Le volume ne permet pas de prédire des immobilisations futures.',
      impact: 'Seule la simulation manuelle d’une immobilisation est activée.',
    }),
  ];

  const checkByKey = new Map(checks.map((check) => [check.key, check]));
  const features: PlanningP22FeatureReadiness[] = [
    { key: 'vessel_load', label: 'Analyse de charge par navire', status: checkByKey.get('projects')!.status, reason: 'Calculée sur les événements saisis et les jours calendaires uniques.' },
    { key: 'sailor_load', label: 'Analyse de charge par marin', status: checkByKey.get('assignments')!.status, reason: 'Calculée sur les affectations saisies, sans extrapolation.' },
    { key: 'tension', label: 'Périodes de forte tension', status: relevantProjects.length ? 'limited' : 'blocked', reason: 'Score explicite fondé sur opérations, indisponibilités, mouvements et conflits connus.' },
    { key: 'absence_scenario', label: 'Simulation d’une absence', status: relevantAssignments.length ? 'limited' : 'blocked', reason: 'Mesure les affectations et conflits impactés ; ne prédit pas la probabilité d’absence.' },
    { key: 'vessel_scenario', label: 'Simulation d’une immobilisation navire', status: relevantProjects.length || relevantAssignments.length ? 'limited' : 'blocked', reason: 'Mesure les chevauchements avec le programme connu.' },
    { key: 'understaffing', label: 'Prévision des sous-effectifs', status: activeMatrices.length ? 'limited' : 'blocked', reason: activeMatrices.length ? 'Comparaison possible aux besoins configurés, sans modèle statistique.' : 'Aucune matrice active : besoin cible inconnu.' },
    { key: 'external_integrations', label: 'Intégrations externes calendrier/RH/maintenance', status: 'blocked', reason: 'Aucun contrat API, identifiant externe, webhook ou règle de synchronisation disponible.' },
    { key: 'offline', label: 'Hors connexion persistant', status: 'blocked', reason: 'Aucune politique de cache, chiffrement local ou résolution de conflits disponible.' },
  ];

  const blocked = features.filter((feature) => feature.status === 'blocked').length;
  return {
    overallStatus: blocked ? 'limited' : 'ready',
    overallFinding: blocked
      ? 'Données adaptées aux projections déterministes du plan connu et aux simulations locales, mais insuffisantes pour un modèle statistique ou des intégrations bidirectionnelles.'
      : 'Les sources couvrent les analyses déterministes prévues ; toute estimation reste explicitement bornée.',
    sourceCounts: [
      { label: 'Navires', count: overview.vessels.length, source: 'public.vessels' },
      { label: 'Marins', count: overview.people.length, source: 'public.people' },
      { label: 'Affectations', count: overview.assignments.length, source: 'public.planning_assignments' },
      { label: 'Journées', count: overview.days.length, source: 'public.planning_days' },
      { label: 'Périodes', count: overview.periods.length, source: 'public.planning_periods' },
      { label: 'Événements navires', count: overview.projects.length, source: 'public.planning_projects' },
      { label: 'Documents RH', count: overview.hrDocuments.length, source: 'public.hr_documents' },
      { label: 'Absences', count: data.p12.absences.length, source: 'public.planning_absences' },
      { label: 'Matrices', count: data.p12.matrices.length, source: 'public.planning_manning_matrices' },
      { label: 'Politiques repos', count: data.policies.length, source: 'public.planning_work_rest_policies' },
      { label: 'Dépendances', count: data.dependencies.length, source: 'public.planning_dependencies' },
    ],
    checks,
    features,
    facts: [
      `La période analysée contient ${rangeDays(range)} jour(s).`,
      `${relevantProjects.length} événement(s) navire et ${relevantAssignments.length} affectation(s) chevauchent la période.`,
      `${activeMatrices.length} matrice(s) active(s) et ${data.policies.length} politique(s) travail/repos sont disponibles.`,
    ],
    limits: [
      'Les données non chargées par les RLS ne sont pas assimilées à des valeurs nulles métier.',
      'Les volumes décrivent le plan saisi ; ils ne prouvent ni la demande future ni la qualité d’une source externe.',
      'Aucun apprentissage statistique n’est exécuté avec un échantillon insuffisant.',
    ],
  };
}

function vesselProjectIds(project: PlanningProjectRecord): number[] {
  return [project.primaryVesselId, project.secondaryVesselId].filter((value): value is number => value !== null);
}

export function buildPlanningP22VesselLoads(overview: PlanningOverview, range: PlanningDateRange): PlanningP22VesselLoad[] {
  const totalDays = rangeDays(range);
  return overview.vessels.filter((vessel) => vessel.active).map((vessel) => {
    const projects = overview.projects.filter((project) => vesselProjectIds(project).includes(vessel.id)
      && rangesOverlap(project.startsOn, project.endsOn || project.startsOn, range.start, range.end));
    const daysByType = new Map<string, Set<string>>();
    const scheduled = new Set<string>();
    for (const project of projects) {
      const dates = clippedDates(project.startsOn, project.endsOn || project.startsOn, range);
      const typed = daysByType.get(project.eventType) || new Set<string>();
      for (const date of dates) { typed.add(date); scheduled.add(date); }
      daysByType.set(project.eventType, typed);
    }
    const assignmentDates = new Set<string>();
    for (const assignment of overview.assignments.filter((item) => item.vesselId === vessel.id && item.confirmationStatus !== 'cancelled')) {
      for (const date of clippedDates(assignment.startsOn, assignment.endsOn, range)) assignmentDates.add(date);
    }
    return {
      vesselId: vessel.id,
      vesselName: vessel.name,
      scheduledDays: scheduled.size,
      operationDays: daysByType.get('operation')?.size || 0,
      transitDays: daysByType.get('transit')?.size || 0,
      maintenanceDays: daysByType.get('maintenance')?.size || 0,
      unavailableDays: daysByType.get('unavailability')?.size || 0,
      assignmentDays: assignmentDates.size,
      plannedLoadPercent: totalDays ? rounded((scheduled.size / totalDays) * 100) : 0,
      sourceEvents: projects.length,
    };
  }).sort((left, right) => right.plannedLoadPercent - left.plannedLoadPercent || left.vesselName.localeCompare(right.vesselName, 'fr'));
}

export function buildPlanningP22SailorLoads(
  overview: PlanningOverview,
  data: PlanningP13Data,
  range: PlanningDateRange,
): PlanningP22SailorLoad[] {
  const totalDays = rangeDays(range);
  return overview.people.filter((person) => person.active).map((person) => {
    const assignments = overview.assignments.filter((assignment) => assignment.crewPersonId === person.id
      && assignment.confirmationStatus !== 'cancelled'
      && rangesOverlap(assignment.startsOn, assignment.endsOn, range.start, range.end));
    const assignedDates = new Set<string>();
    for (const assignment of assignments) for (const date of clippedDates(assignment.startsOn, assignment.endsOn, range)) assignedDates.add(date);
    const absenceDates = new Set<string>();
    for (const absence of data.p12.absences.filter((item) => item.personId === person.id && item.status === 'approved')) {
      for (const date of clippedDates(absence.startsOn, absence.endsOn, range)) absenceDates.add(date);
    }
    const recordedWorkDays = new Set(overview.days.filter((day) => day.personId === person.id
      && day.workDate >= range.start && day.workDate <= range.end).map((day) => day.workDate)).size;
    let overlapCount = 0;
    for (let left = 0; left < assignments.length; left += 1) {
      for (let right = left + 1; right < assignments.length; right += 1) {
        if (rangesOverlap(assignments[left].startsOn, assignments[left].endsOn, assignments[right].startsOn, assignments[right].endsOn)) overlapCount += 1;
      }
    }
    return {
      personId: person.id,
      personName: formatPlanningPerson(person),
      assignedDays: assignedDates.size,
      absenceDays: absenceDates.size,
      recordedWorkDays,
      plannedLoadPercent: totalDays ? rounded((assignedDates.size / totalDays) * 100) : 0,
      assignmentCount: assignments.length,
      overlapCount,
    };
  }).filter((person) => person.assignedDays || person.absenceDays || person.recordedWorkDays)
    .sort((left, right) => right.plannedLoadPercent - left.plannedLoadPercent || left.personName.localeCompare(right.personName, 'fr'));
}

function percentile75(values: number[]): number {
  if (!values.length) return 0;
  const sorted = values.slice().sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * .75))];
}

export function buildPlanningP22TensionWindows(
  overview: PlanningOverview,
  data: PlanningP13Data,
  range: PlanningDateRange,
): PlanningP22TensionWindow[] {
  const dates = datesInRange(range);
  const conflicts = buildPlanningP12Conflicts(overview, data.p12, range);
  const daily = dates.map((date) => {
    const projects = overview.projects.filter((project) => rangesOverlap(project.startsOn, project.endsOn || project.startsOn, date, date));
    const operationalEvents = projects.filter((project) => ['operation', 'transit'].includes(project.eventType)).length;
    const unavailableVessels = new Set(projects.filter((project) => ['maintenance', 'unavailability'].includes(project.eventType)).flatMap(vesselProjectIds)).size;
    const crewMovements = overview.assignments.filter((assignment) => assignment.confirmationStatus !== 'cancelled'
      && (assignment.startsOn === date || assignment.endsOn === date)).length;
    const conflictCount = conflicts.filter((conflict) => rangesOverlap(conflict.startsOn, conflict.endsOn, date, date)).length;
    const score = operationalEvents * 3 + unavailableVessels * 3 + crewMovements * 2 + conflictCount * 2;
    return { date, operationalEvents, unavailableVessels, crewMovements, conflicts: conflictCount, score };
  });
  const threshold = Math.max(6, percentile75(daily.map((item) => item.score).filter(Boolean)));
  const highDays = daily.filter((item) => item.score >= threshold);
  const windows: PlanningP22TensionWindow[] = [];
  for (const day of highDays) {
    const previous = windows[windows.length - 1];
    if (previous && addPlanningDays(previous.endsOn, 1) === day.date) {
      previous.endsOn = day.date;
      previous.peakScore = Math.max(previous.peakScore, day.score);
      previous.operationalEvents = Math.max(previous.operationalEvents, day.operationalEvents);
      previous.unavailableVessels = Math.max(previous.unavailableVessels, day.unavailableVessels);
      previous.crewMovements = Math.max(previous.crewMovements, day.crewMovements);
      previous.conflicts = Math.max(previous.conflicts, day.conflicts);
      continue;
    }
    windows.push({
      startsOn: day.date,
      endsOn: day.date,
      peakScore: day.score,
      operationalEvents: day.operationalEvents,
      unavailableVessels: day.unavailableVessels,
      crewMovements: day.crewMovements,
      conflicts: day.conflicts,
      confidence: overview.projects.length >= 30 ? 'medium' : 'low',
      facts: [
        `${day.operationalEvents} opération(s) ou transit(s) planifié(s).`,
        `${day.unavailableVessels} navire(s) en maintenance ou indisponible(s).`,
        `${day.crewMovements} mouvement(s) d’équipage et ${day.conflicts} conflit(s) connu(s).`,
      ],
      assumptions: [`Score = opérations × 3 + indisponibilités × 3 + mouvements × 2 + conflits × 2.`, `Seuil de tension = maximum entre 6 et le 75e percentile observé (${threshold}).`],
      limits: ['Le score classe le programme saisi ; il ne prédit pas les opérations non encore enregistrées.', 'Les facteurs ont un poids métier explicite, sans apprentissage statistique.'],
    });
  }
  return windows.sort((left, right) => right.peakScore - left.peakScore || left.startsOn.localeCompare(right.startsOn)).slice(0, 12);
}

function activeConflictCounts(conflicts: PlanningDetectedConflict[]) {
  return {
    total: conflicts.length,
    blocking: conflicts.filter((conflict) => conflict.severity === 'blocking').length,
  };
}

function scenarioMetric(key: string, label: string, baseline: number, scenario: number, unit: string, evidenceKind: PlanningP22EvidenceKind): PlanningP22ScenarioMetric {
  return { key, label, baseline, scenario, delta: scenario - baseline, unit, evidenceKind };
}

function scenarioAbsence(
  overview: PlanningOverview,
  data: PlanningP13Data,
  range: PlanningDateRange,
  input: PlanningP22ScenarioInput,
): PlanningP22ScenarioResult {
  const person = overview.people.find((item) => item.id === input.personId);
  const impacted = overview.assignments.filter((assignment) => assignment.crewPersonId === input.personId
    && assignment.confirmationStatus !== 'cancelled'
    && rangesOverlap(assignment.startsOn, assignment.endsOn, input.startsOn, input.endsOn));
  const simulatedAbsence: PlanningAbsenceRecord = {
    id: -220_001, personId: input.personId!, absenceType: 'unavailability',
    startsAt: `${input.startsOn}T00:00:00.000Z`, endsAt: `${addPlanningDays(input.endsOn, 1)}T00:00:00.000Z`,
    startsOn: input.startsOn, endsOn: input.endsOn, reason: 'Absence simulée P2.2', status: 'approved',
    requestedBy: 'simulation', reviewedBy: 'simulation', reviewedAt: '', reviewComment: '', createdAt: '', updatedAt: '',
  };
  const baselineConflicts = buildPlanningP12Conflicts(overview, data.p12, range);
  const scenarioData = { ...data.p12, absences: [...data.p12.absences, simulatedAbsence] };
  const scenarioConflicts = buildPlanningP12Conflicts(overview, scenarioData, range);
  const baselineCounts = activeConflictCounts(baselineConflicts);
  const scenarioCounts = activeConflictCounts(scenarioConflicts);
  const vacancies = scenarioConflicts.filter((conflict) => conflict.type === 'vacant_position' && conflict.personId === input.personId);
  const candidateNames = new Set<string>();
  for (const vacancy of vacancies) {
    const candidates = buildPlanningReplacementCandidates(overview, scenarioData, vacancy)
      .filter((candidate) => candidate.compatibility !== 'incompatible').slice(0, 3);
    for (const candidate of candidates) candidateNames.add(formatPlanningPerson(candidate.person));
  }
  const alternatives: PlanningP22AlternativePlan[] = [
    {
      key: 'manual-replacement', label: 'Plan A · remplacement manuel',
      description: candidateNames.size ? `Examiner ${[...candidateNames].join(', ')} sans créer d’affectation automatique.` : 'Aucun candidat sans blocage connu n’est démontré avec les données chargées.',
      benefits: ['Conserve les dates du programme connu.', 'Réutilise les contrôles de disponibilité et de documents P1.2.'],
      risks: ['La décision de fonction et de conformité reste humaine.', 'Les données documentaires absentes peuvent masquer une incompatibilité.'],
    },
    {
      key: 'manual-reschedule', label: 'Plan B · décalage manuel',
      description: `Étudier le décalage des ${impacted.length} affectation(s) après le ${input.endsOn}.`,
      benefits: ['N’ajoute pas de marin à la charge existante.'],
      risks: ['Peut déplacer un conflit vers les opérations suivantes.', 'Les dépendances sont incomplètes si elles ne sont pas configurées.'],
    },
  ];
  return {
    title: `Simulation d’absence · ${person ? formatPlanningPerson(person) : `Marin #${input.personId}`}`,
    confidence: { level: data.p12.matrices.length && overview.hrDocuments.length ? 'medium' : 'low', score: data.p12.matrices.length ? 76 : 58 },
    metrics: [
      scenarioMetric('impacted_assignments', 'Affectations directement impactées', 0, impacted.length, 'affectation(s)', 'fact'),
      scenarioMetric('conflicts', 'Conflits détectés', baselineCounts.total, scenarioCounts.total, 'conflit(s)', 'rule'),
      scenarioMetric('blocking', 'Conflits bloquants', baselineCounts.blocking, scenarioCounts.blocking, 'conflit(s)', 'rule'),
      scenarioMetric('candidates', 'Candidats sans blocage connu', 0, candidateNames.size, 'marin(s)', 'estimate'),
    ],
    facts: [`${impacted.length} affectation(s) chevauchent l’absence simulée.`, `${scenarioCounts.total} conflit(s) seraient détectés avec les règles actuelles.`],
    rules: ['Chevauchement de dates inclusif.', 'Contrôles P1.2 de double affectation, absence, documents et matrice.', 'Aucune ligne Planning n’est créée ou modifiée.'],
    estimates: [`${candidateNames.size} candidat(s) ne présentent pas de blocage connu dans les données chargées.`],
    dataUsed: ['Affectations', 'Marins', 'Documents RH', 'Absences validées', 'Matrices d’armement disponibles'],
    assumptions: ['L’absence est traitée comme validée sur toute la période simulée.', 'Le programme opérationnel reste inchangé dans les deux plans.'],
    limits: [data.p12.matrices.length ? 'Les matrices disponibles sont appliquées uniquement sur leur période de validité.' : 'Aucune matrice active : l’effectif requis n’est pas démontrable.', 'Aucune probabilité d’absence n’est estimée.', 'Les alternatives ne sont ni affectées ni publiées automatiquement.'],
    conflicts: scenarioConflicts,
    alternatives,
    humanValidationRequired: true,
  };
}

function scenarioVesselUnavailability(
  overview: PlanningOverview,
  data: PlanningP13Data,
  range: PlanningDateRange,
  input: PlanningP22ScenarioInput,
): PlanningP22ScenarioResult {
  const vessel = overview.vessels.find((item) => item.id === input.vesselId);
  const impactedAssignments = overview.assignments.filter((assignment) => assignment.vesselId === input.vesselId
    && assignment.confirmationStatus !== 'cancelled'
    && rangesOverlap(assignment.startsOn, assignment.endsOn, input.startsOn, input.endsOn));
  const impactedProjects = overview.projects.filter((project) => vesselProjectIds(project).includes(input.vesselId!)
    && rangesOverlap(project.startsOn, project.endsOn || project.startsOn, input.startsOn, input.endsOn));
  const simulatedProject: PlanningProjectRecord = {
    id: -220_002, title: 'Immobilisation simulée P2.2', startsOn: input.startsOn, endsOn: input.endsOn,
    description: 'Scénario local sans écriture', clientName: '', primaryVesselId: input.vesselId,
    primaryVesselName: vessel?.name || '', secondaryVesselId: null, secondaryVesselName: '',
    eventType: 'maintenance', responsibleName: '', status: 'Simulé', sourceLabel: 'scenario-p2.2',
  };
  const baselineConflicts = buildPlanningP12Conflicts(overview, data.p12, range);
  const scenarioOverview = { ...overview, projects: [...overview.projects, simulatedProject] };
  const scenarioConflicts = buildPlanningP12Conflicts(scenarioOverview, data.p12, range);
  const baselineCounts = activeConflictCounts(baselineConflicts);
  const scenarioCounts = activeConflictCounts(scenarioConflicts);
  const vesselLoads = buildPlanningP22VesselLoads(overview, range).filter((item) => item.vesselId !== input.vesselId);
  const alternatives = vesselLoads.slice().sort((left, right) => left.plannedLoadPercent - right.plannedLoadPercent).slice(0, 3);
  return {
    title: `Simulation d’immobilisation · ${vessel?.name || `Navire #${input.vesselId}`}`,
    confidence: { level: overview.projects.length >= 12 ? 'medium' : 'low', score: overview.projects.length >= 12 ? 74 : 52 },
    metrics: [
      scenarioMetric('impacted_projects', 'Événements navire impactés', 0, impactedProjects.length, 'événement(s)', 'fact'),
      scenarioMetric('impacted_assignments', 'Affectations sur le navire', 0, impactedAssignments.length, 'affectation(s)', 'fact'),
      scenarioMetric('conflicts', 'Conflits détectés', baselineCounts.total, scenarioCounts.total, 'conflit(s)', 'rule'),
      scenarioMetric('blocking', 'Conflits bloquants', baselineCounts.blocking, scenarioCounts.blocking, 'conflit(s)', 'rule'),
    ],
    facts: [`${impactedProjects.length} événement(s) et ${impactedAssignments.length} affectation(s) chevauchent l’immobilisation.`, `${alternatives.length} autre(s) navire(s) actif(s) peuvent être comparés par charge planifiée.`],
    rules: ['Chevauchement de dates inclusif.', 'Une immobilisation simulée est évaluée comme une maintenance pour les conflits P1.2.', 'Aucune opération, affectation ou maintenance n’est modifiée.'],
    estimates: alternatives.map((item) => `${item.vesselName} : charge planifiée ${item.plannedLoadPercent}% sur la période.`),
    dataUsed: ['Navires actifs', 'Programme opérations/transits/maintenance', 'Affectations', 'Conflits P1.2'],
    assumptions: ['L’immobilisation couvre le navire pendant toute la période simulée.', 'Les autres navires conservent leur programme actuel.'],
    limits: ['La compatibilité technique entre navires n’est pas modélisée.', 'Aucune donnée d’équipement, de capacité ou de contrat maintenance n’est disponible dans le Planning.', 'Les alternatives doivent être validées par les responsables opérationnels.'],
    conflicts: scenarioConflicts,
    alternatives: [
      {
        key: 'manual-vessel-substitution', label: 'Plan A · substitution de navire à étudier',
        description: alternatives.length ? `Comparer ${alternatives.map((item) => item.vesselName).join(', ')} selon leurs capacités réelles.` : 'Aucun navire alternatif actif n’est disponible dans les données chargées.',
        benefits: ['Préserve potentiellement les dates des opérations.'],
        risks: ['La charge faible ne prouve pas la compatibilité technique.', 'Les contraintes contractuelles et équipements ne sont pas disponibles.'],
      },
      {
        key: 'manual-operation-reschedule', label: 'Plan B · replanification manuelle',
        description: `Étudier le décalage des ${impactedProjects.length} événement(s) après le ${input.endsOn}.`,
        benefits: ['Ne suppose aucune interchangeabilité de navire.'],
        risks: ['Peut violer une dépendance non configurée.', 'Peut concentrer la charge sur une période ultérieure.'],
      },
    ],
    humanValidationRequired: true,
  };
}

export function simulatePlanningP22Scenario(
  overview: PlanningOverview,
  data: PlanningP13Data,
  range: PlanningDateRange,
  input: PlanningP22ScenarioInput,
): PlanningP22ScenarioResult | null {
  if (!input.startsOn || !input.endsOn || input.endsOn < input.startsOn) return null;
  if (input.kind === 'absence') return input.personId ? scenarioAbsence(overview, data, range, input) : null;
  return input.vesselId ? scenarioVesselUnavailability(overview, data, range, input) : null;
}
