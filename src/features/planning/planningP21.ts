import { formatPlanningPerson, normalizePlanningText } from './planningModel';
import type { PlanningOverview } from './planningQueries';
import {
  buildPlanningP12Conflicts,
  buildPlanningReplacementCandidates,
  type PlanningDetectedConflict,
} from './planningP12';
import {
  buildPlanningDependencyViolations,
  buildPlanningWorkRestChecks,
  type PlanningDateRange,
  type PlanningP13Data,
} from './planningP13';

export type PlanningAssistantSuggestionType =
  | 'vacant_position'
  | 'compatible_sailor'
  | 'handover'
  | 'inconsistency'
  | 'change_summary'
  | 'missing_document'
  | 'reorganization';

export type PlanningAssistantConfidenceLevel = 'low' | 'medium' | 'high';
export type PlanningAssistantDecision = 'accepted' | 'refused';

export interface PlanningAssistantConfidence {
  level: PlanningAssistantConfidenceLevel;
  score: number;
}

export interface PlanningAssistantCandidate {
  personId: number;
  personName: string;
  compatibility: 'compatible' | 'warning' | 'incompatible';
  reasons: string[];
}

export interface PlanningAssistantSuggestion {
  key: string;
  type: PlanningAssistantSuggestionType;
  title: string;
  summary: string;
  criteriaUsed: string[];
  dataChecked: string[];
  rulesApplied: string[];
  conflictsDetected: string[];
  unavailableData: string[];
  confidence: PlanningAssistantConfidence;
  justification: string;
  suggestedSteps: string[];
  candidates: PlanningAssistantCandidate[];
  vesselId: number | null;
  personId: number | null;
  humanValidationRequired: true;
}

export interface PlanningAssistantAccess {
  hasAccess: boolean;
  accessMode: 'administrator' | 'pilot' | 'none';
  expiresOn: string;
  canManagePilots: boolean;
}

export interface PlanningAssistantReview {
  id: number;
  suggestionKey: string;
  suggestionType: PlanningAssistantSuggestionType;
  decision: PlanningAssistantDecision;
  comment: string;
  vesselId: number | null;
  personId: number | null;
  generatedForStart: string;
  generatedForEnd: string;
  reviewedBy: string;
  reviewedByName: string;
  reviewedAt: string;
}

export interface PlanningAssistantPilot {
  pilotId: number | null;
  userId: string;
  displayName: string;
  email: string;
  roleKeys: string[];
  enabled: boolean;
  validUntil: string;
  reason: string;
  updatedAt: string;
}

export interface PlanningAssistantData {
  p13: PlanningP13Data;
  reviews: PlanningAssistantReview[];
  pilots: PlanningAssistantPilot[];
}

export const PLANNING_ASSISTANT_TYPE_LABELS: Record<PlanningAssistantSuggestionType, string> = {
  vacant_position: 'Poste vacant',
  compatible_sailor: 'Marins compatibles',
  handover: 'Relève suggérée',
  inconsistency: 'Incohérence',
  change_summary: 'Résumé des modifications',
  missing_document: 'Document manquant',
  reorganization: 'Réorganisation',
};

const DAY_MS = 86_400_000;
const MAX_SUGGESTIONS_PER_CATEGORY = 50;

function confidence(score: number): PlanningAssistantConfidence {
  const bounded = Math.max(0, Math.min(100, Math.round(score)));
  return { score: bounded, level: bounded >= 80 ? 'high' : bounded >= 55 ? 'medium' : 'low' };
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function vesselName(overview: PlanningOverview, vesselId: number | null): string {
  return overview.vessels.find((vessel) => vessel.id === vesselId)?.name || (vesselId ? `Navire #${vesselId}` : 'Navire non renseigné');
}

function candidateRows(overview: PlanningOverview, candidates: ReturnType<typeof buildPlanningReplacementCandidates>): PlanningAssistantCandidate[] {
  const recommended = candidates.filter((candidate) => candidate.compatibility !== 'incompatible').slice(0, 6);
  const explainedIncompatible = candidates.filter((candidate) => candidate.compatibility === 'incompatible').slice(0, 4);
  return [...recommended, ...explainedIncompatible].map((candidate) => ({
    personId: candidate.person.id,
    personName: formatPlanningPerson(overview.people.find((person) => person.id === candidate.person.id) || candidate.person),
    compatibility: candidate.compatibility,
    reasons: candidate.reasons,
  }));
}

function vacancyUnavailableData(overview: PlanningOverview, data: PlanningP13Data, conflict: PlanningDetectedConflict): string[] {
  const activeMatrix = data.p12.matrices.find((matrix) => matrix.vesselId === conflict.vesselId
    && matrix.status === 'active'
    && matrix.effectiveFrom <= conflict.endsOn
    && (!matrix.effectiveTo || matrix.effectiveTo >= conflict.startsOn));
  return unique([
    !conflict.functionLabel ? 'Fonction du poste non renseignée.' : '',
    !activeMatrix ? 'Matrice d’armement active non disponible pour ce navire et cette période.' : '',
    !overview.hrDocuments.length ? 'Aucun document RH exploitable dans le périmètre chargé.' : '',
  ]);
}

function vacancySuggestions(
  overview: PlanningOverview,
  data: PlanningP13Data,
  conflicts: PlanningDetectedConflict[],
): PlanningAssistantSuggestion[] {
  return conflicts.filter((item) => item.type === 'vacant_position').slice(0, MAX_SUGGESTIONS_PER_CATEGORY).flatMap((item) => {
    const unavailableData = vacancyUnavailableData(overview, data, item);
    const candidates = buildPlanningReplacementCandidates(overview, data.p12, item);
    const candidateDetails = candidateRows(overview, candidates);
    const compatibleCount = candidates.filter((candidate) => candidate.compatibility === 'compatible').length;
    const warningCount = candidates.filter((candidate) => candidate.compatibility === 'warning').length;
    const common = {
      vesselId: item.vesselId,
      personId: item.personId,
      criteriaUsed: [
        `Période ${item.startsOn} → ${item.endsOn}`,
        `Fonction recherchée : ${item.functionLabel || 'non renseignée'}`,
        `Navire : ${vesselName(overview, item.vesselId)}`,
      ],
      dataChecked: [
        `${overview.assignments.length} affectation(s)`,
        `${data.p12.absences.length} absence(s)`,
        `${overview.people.length} marin(s)`,
        `${overview.hrDocuments.length} document(s) RH`,
        `${data.p12.matrices.length} matrice(s) d’armement`,
      ],
      rulesApplied: [
        'Matrice d’armement P1.1 : effectif minimum et cible',
        'Contrôles P1.2 : disponibilité, double affectation, fonction, certificats et qualifications',
        'Décision humaine obligatoire : aucune affectation créée',
      ],
      conflictsDetected: [item.detail],
      unavailableData,
      humanValidationRequired: true as const,
    };
    const vacancy: PlanningAssistantSuggestion = {
      ...common,
      key: `vacancy:${item.key}`,
      type: 'vacant_position',
      title: item.title,
      summary: `${item.detail} Le poste doit être arbitré manuellement.`,
      confidence: confidence(unavailableData.length ? 68 : 94),
      justification: 'Le poste est signalé par les contrôles d’effectif ou l’impact d’une absence validée.',
      suggestedSteps: ['Confirmer le besoin opérationnel.', 'Examiner les marins compatibles.', 'Créer manuellement une affectation provisoire si la proposition est retenue.'],
      candidates: [],
    };
    const candidateSuggestion: PlanningAssistantSuggestion = {
      ...common,
      key: `candidates:${item.key}`,
      type: 'compatible_sailor',
      title: `Candidats pour ${item.functionLabel || item.title}`,
      summary: `${compatibleCount} compatible(s), ${warningCount} à confirmer et ${candidates.length - compatibleCount - warningCount} incompatible(s) analysé(s).`,
      confidence: confidence(compatibleCount > 0 ? 90 - unavailableData.length * 12 : candidateDetails.length ? 58 - unavailableData.length * 8 : 30),
      justification: compatibleCount
        ? 'Les premiers candidats n’ont pas de conflit bloquant connu sur la période et satisfont les données disponibles.'
        : 'Aucun candidat totalement compatible n’est démontré avec les données disponibles ; les incompatibilités restent visibles.',
      suggestedSteps: ['Comparer les candidats et leurs motifs.', 'Vérifier les données manquantes.', 'Choisir explicitement un marin avant toute saisie dans le Planning.'],
      candidates: candidateDetails,
    };
    return [vacancy, candidateSuggestion];
  });
}

function missingDocumentSuggestions(conflicts: PlanningDetectedConflict[]): PlanningAssistantSuggestion[] {
  return conflicts.filter((item) => ['invalid_certificate', 'missing_qualification'].includes(item.type))
    .slice(0, MAX_SUGGESTIONS_PER_CATEGORY)
    .map((item) => ({
      key: `document:${item.key}`,
      type: 'missing_document',
      title: item.title,
      summary: item.detail,
      criteriaUsed: [`Marin #${item.personId || 'inconnu'}`, `Période ${item.startsOn} → ${item.endsOn}`, `Fonction : ${item.functionLabel || 'non renseignée'}`],
      dataChecked: ['Profil RH du marin', 'Documents, statuts et dates d’expiration', 'Exigences de la matrice d’armement'],
      rulesApplied: ['Validité requise pendant toute l’affectation', 'Certificats et qualifications P1.1/P1.2'],
      conflictsDetected: [item.detail],
      unavailableData: item.personId ? [] : ['Marin concerné non identifié.'],
      confidence: confidence(item.personId ? 90 : 52),
      justification: 'Le document requis est absent, invalide ou ne couvre pas toute la période planifiée.',
      suggestedSteps: ['Vérifier le dossier RH source.', 'Mettre à jour le document si une preuve existe.', 'Choisir un autre marin si la conformité ne peut pas être démontrée.'],
      candidates: [],
      vesselId: item.vesselId,
      personId: item.personId,
      humanValidationRequired: true,
    }));
}

function dateGapDays(leftEnd: string, rightStart: string): number {
  return Math.round((Date.parse(`${rightStart}T00:00:00Z`) - Date.parse(`${leftEnd}T00:00:00Z`)) / DAY_MS);
}

function handoverSuggestions(overview: PlanningOverview, range: PlanningDateRange): PlanningAssistantSuggestion[] {
  const assignmentsByRole = new Map<string, typeof overview.assignments>();
  for (const assignment of overview.assignments) {
    if (assignment.confirmationStatus === 'cancelled') continue;
    if (assignment.endsOn < range.start || assignment.startsOn > range.end) continue;
    const key = `${assignment.vesselId}:${normalizePlanningText(assignment.assignmentRole)}`;
    const assignments = assignmentsByRole.get(key) || [];
    assignments.push(assignment);
    assignmentsByRole.set(key, assignments);
  }
  const existing = new Set(overview.handovers.filter((handover) => handover.status !== 'cancelled')
    .map((handover) => `${handover.vesselId}:${handover.handoverAt.slice(0, 10)}`));
  const suggestions: PlanningAssistantSuggestion[] = [];
  for (const assignments of assignmentsByRole.values()) {
    const sorted = assignments.slice().sort((left, right) => left.startsOn.localeCompare(right.startsOn) || left.id - right.id);
    for (let index = 1; index < sorted.length; index += 1) {
      const outgoing = sorted[index - 1];
      const incoming = sorted[index];
      const gap = dateGapDays(outgoing.endsOn, incoming.startsOn);
      if (outgoing.crewPersonId === incoming.crewPersonId || gap < 0 || gap > 2
        || existing.has(`${incoming.vesselId}:${incoming.startsOn}`)) continue;
      suggestions.push({
        key: `handover:${outgoing.id}:${incoming.id}`,
        type: 'handover',
        title: `Relève suggérée · ${incoming.assignmentRole}`,
        summary: `${outgoing.crewName || `Marin #${outgoing.crewPersonId}`} termine le ${outgoing.endsOn} et ${incoming.crewName || `Marin #${incoming.crewPersonId}`} commence le ${incoming.startsOn}.`,
        criteriaUsed: ['Même navire', 'Même fonction normalisée', 'Écart maximal de deux jours', 'Aucune relève existante à la date d’arrivée'],
        dataChecked: [`Affectations #${outgoing.id} et #${incoming.id}`, `${overview.handovers.length} relève(s) existante(s)`],
        rulesApplied: ['Passation P0.3', 'Aucune création automatique de relève'],
        conflictsDetected: gap > 1 ? [`Écart de ${gap} jours entre les affectations.`] : [],
        unavailableData: [],
        confidence: confidence(gap <= 1 ? 92 : 78),
        justification: 'Deux affectations successives sur le même poste forment une opportunité de passation explicite.',
        suggestedSteps: ['Confirmer la date, l’heure et le lieu.', 'Vérifier les bordées entrante et sortante.', 'Créer manuellement la relève si elle est nécessaire.'],
        candidates: [],
        vesselId: incoming.vesselId,
        personId: incoming.crewPersonId,
        humanValidationRequired: true,
      });
      if (suggestions.length >= MAX_SUGGESTIONS_PER_CATEGORY) return suggestions;
    }
  }
  return suggestions;
}

function inconsistencySuggestions(
  overview: PlanningOverview,
  data: PlanningP13Data,
  conflicts: PlanningDetectedConflict[],
  range: PlanningDateRange,
): PlanningAssistantSuggestion[] {
  const excluded = new Set(['vacant_position', 'invalid_certificate', 'missing_qualification', 'incomplete_handover']);
  const suggestions = conflicts.filter((item) => !excluded.has(item.type)).slice(0, 30).map<PlanningAssistantSuggestion>((item) => ({
    key: `inconsistency:${item.key}`,
    type: 'inconsistency',
    title: item.title,
    summary: item.detail,
    criteriaUsed: [`Période ${item.startsOn} → ${item.endsOn}`, `Type de contrôle : ${item.type}`, `Sévérité : ${item.severity}`],
    dataChecked: ['Affectations actives', 'Absences et indisponibilités', 'Opérations et maintenances'],
    rulesApplied: ['Détection de conflits P1.2', 'Conflits bloquants conservés pour arbitrage humain'],
    conflictsDetected: [item.detail],
    unavailableData: [],
    confidence: confidence(94),
    justification: 'Les intervalles et états Planning satisfont les conditions explicites de ce contrôle.',
    suggestedSteps: ['Ouvrir les éléments concernés.', 'Choisir une correction manuelle.', 'Traiter le conflit dans le workflow P1 existant.'],
    candidates: [],
    vesselId: item.vesselId,
    personId: item.personId,
    humanValidationRequired: true,
  }));

  const dependencySuggestions = buildPlanningDependencyViolations(overview, data.p12.absences, data.dependencies)
    .filter((violation) => violation.violated).slice(0, 10).map<PlanningAssistantSuggestion>((violation) => ({
      key: `dependency:${violation.dependency.id}`,
      type: 'inconsistency',
      title: `Dépendance non respectée · ${violation.successorLabel}`,
      summary: violation.detail,
      criteriaUsed: [`Source : ${violation.predecessorLabel}`, `Cible : ${violation.successorLabel}`, `Délai : ${violation.dependency.lagMinutes} minutes`],
      dataChecked: ['Dates de fin de la source', 'Date de début de la cible', 'Délai configuré'],
      rulesApplied: ['Dépendance fin-début P1.3'],
      conflictsDetected: [violation.detail],
      unavailableData: violation.requiredStartsAt ? [] : ['Un élément de la dépendance est supprimé ou non visible.'],
      confidence: confidence(violation.requiredStartsAt ? 95 : 45),
      justification: 'La cible débute avant l’instant minimal calculé à partir de la source.',
      suggestedSteps: ['Vérifier la dépendance.', 'Décaler manuellement la cible ou corriger le lien.', 'Recontrôler les impacts en aval.'],
      candidates: [],
      vesselId: violation.dependency.vesselId,
      personId: violation.dependency.personId,
      humanValidationRequired: true,
    }));

  const workRestChecks = buildPlanningWorkRestChecks(overview, data.policies, range);
  const workRestSuggestions = workRestChecks.filter((check) => check.status === 'non_compliant').slice(0, 10)
    .map<PlanningAssistantSuggestion>((check) => ({
      key: `work-rest:${check.id}`,
      type: 'inconsistency',
      title: `${check.ruleLabel} · ${check.personName}`,
      summary: `${check.value ?? 'Valeur absente'} face au seuil ${check.threshold ?? 'non configuré'} (${check.unit}).`,
      criteriaUsed: [`Date : ${check.date}`, `Politique : ${check.policyName}`, `Règle : ${check.ruleLabel}`],
      dataChecked: [`Valeur : ${check.value ?? 'absente'}`, `Seuil : ${check.threshold ?? 'absent'}`, `Source : ${check.dataSource}`],
      rulesApplied: ['Politique travail/repos P1.3', 'Seuils actifs pris en compte'],
      conflictsDetected: [check.detail],
      unavailableData: [],
      confidence: confidence(93),
      justification: 'La valeur disponible dépasse ou ne satisfait pas le seuil administré applicable.',
      suggestedSteps: ['Vérifier les heures sources.', 'Réorganiser manuellement le service si nécessaire.', 'Documenter le traitement retenu dans le centre de conflits.'],
      candidates: [],
      vesselId: check.vesselId,
      personId: check.personId,
      humanValidationRequired: true,
    }));

  const missingWorkRest = workRestChecks.filter((check) => check.status === 'not_evaluable').length;
  if (missingWorkRest) {
    suggestions.push({
      key: `work-rest-missing:${range.start}:${range.end}`,
      type: 'inconsistency',
      title: 'Contrôles travail/repos incomplets',
      summary: `${missingWorkRest} contrôle(s) ne peuvent pas être évalués sur la période.`,
      criteriaUsed: [`Période ${range.start} → ${range.end}`, 'Toutes les règles travail/repos configurables'],
      dataChecked: [`${workRestChecks.length} contrôle(s) généré(s)`, `${data.policies.length} politique(s)`],
      rulesApplied: ['Une donnée absente ne doit jamais être considérée conforme'],
      conflictsDetected: [],
      unavailableData: ['Seuils ou métriques détaillées manquants pour certains jours.'],
      confidence: confidence(98),
      justification: 'Le moteur P1.3 classe explicitement les contrôles sans preuve comme non évaluables.',
      suggestedSteps: ['Compléter les métriques ou politiques manquantes.', 'Relancer l’analyse.', 'Ne pas conclure à la conformité avant complétude.'],
      candidates: [],
      vesselId: null,
      personId: null,
      humanValidationRequired: true,
    });
  }
  return [...suggestions, ...dependencySuggestions, ...workRestSuggestions].slice(0, MAX_SUGGESTIONS_PER_CATEGORY);
}

function reorganizationSuggestions(
  overview: PlanningOverview,
  data: PlanningP13Data,
  conflicts: PlanningDetectedConflict[],
): PlanningAssistantSuggestion[] {
  const reorganizable = new Set(['double_assignment', 'absence', 'unavailability', 'maintenance_incompatible']);
  return conflicts.filter((item) => reorganizable.has(item.type) && item.vesselId).slice(0, 12).map((item) => {
    const pool = buildPlanningReplacementCandidates(overview, data.p12, item);
    const candidates = candidateRows(overview, pool);
    const compatible = candidates.find((candidate) => candidate.compatibility === 'compatible');
    const unavailableData = vacancyUnavailableData(overview, data, item);
    return {
      key: `reorganization:${item.key}`,
      type: 'reorganization' as const,
      title: `Réorganisation proposée · ${item.title}`,
      summary: compatible
        ? `${compatible.personName} peut être étudié pour libérer ou remplacer la ressource en conflit.`
        : 'Aucun remplacement sans conflit bloquant n’est démontré ; un décalage ou un arbitrage manuel est nécessaire.',
      criteriaUsed: [`Conflit : ${item.type}`, `Période ${item.startsOn} → ${item.endsOn}`, `Navire : ${vesselName(overview, item.vesselId)}`],
      dataChecked: [`${pool.length} marin(s) évalué(s)`, 'Affectations, absences, documents et matrice'],
      rulesApplied: ['Compatibilité P1.2', 'Aucune désaffectation ni réaffectation automatique'],
      conflictsDetected: [item.detail],
      unavailableData,
      confidence: confidence(compatible ? 84 - unavailableData.length * 10 : 42 - unavailableData.length * 6),
      justification: compatible
        ? 'Un candidat sans blocage connu permet d’envisager une réorganisation, sous réserve de validation opérationnelle.'
        : 'Les données actuelles ne permettent pas de recommander un mouvement de marin sans risque identifié.',
      suggestedSteps: compatible
        ? ['Comparer la charge du candidat.', 'Valider la décision avec le responsable.', 'Saisir manuellement les changements provisoires.']
        : ['Étudier un décalage de dates.', 'Revoir le besoin de fonction.', 'Escalader le conflit pour une décision manuelle.'],
      candidates,
      vesselId: item.vesselId,
      personId: compatible?.personId || item.personId,
      humanValidationRequired: true as const,
    };
  });
}

function changeSummarySuggestion(overview: PlanningOverview, range: PlanningDateRange): PlanningAssistantSuggestion {
  const history = overview.history.filter((entry) => {
    const changedOn = entry.changedAt.slice(0, 10);
    return changedOn >= range.start && changedOn <= range.end;
  });
  const counts = new Map<string, number>();
  for (const entry of history) counts.set(entry.action, (counts.get(entry.action) || 0) + 1);
  const actionSummary = [...counts.entries()].sort((left, right) => right[1] - left[1])
    .map(([action, count]) => `${action} : ${count}`).join(' · ');
  const actors = unique(history.map((entry) => entry.changedByName));
  return {
    key: `change-summary:${range.start}:${range.end}`,
    type: 'change_summary',
    title: 'Résumé des modifications',
    summary: history.length ? `${history.length} modification(s) journalisée(s). ${actionSummary}` : 'Aucune modification journalisée sur la période.',
    criteriaUsed: [`Période ${range.start} → ${range.end}`, 'Historique audité du Planning'],
    dataChecked: [`${history.length} entrée(s)`, `${actors.length} auteur(s)`],
    rulesApplied: ['Historique P0.4 immuable', 'Aucune déduction en l’absence de journal'],
    conflictsDetected: [],
    unavailableData: [],
    confidence: confidence(99),
    justification: 'Le résumé agrège uniquement les actions déjà enregistrées dans le journal du Planning.',
    suggestedSteps: history.length ? ['Relire les changements sensibles.', 'Comparer avec la dernière publication.', 'Valider manuellement les impacts.'] : ['Aucune action suggérée.'],
    candidates: [],
    vesselId: null,
    personId: null,
    humanValidationRequired: true,
  };
}

export function buildPlanningAssistantSuggestions(
  overview: PlanningOverview,
  data: PlanningP13Data,
  range: PlanningDateRange,
): PlanningAssistantSuggestion[] {
  const conflicts = buildPlanningP12Conflicts(overview, data.p12, range);
  const suggestions = [
    ...vacancySuggestions(overview, data, conflicts),
    ...missingDocumentSuggestions(conflicts),
    ...handoverSuggestions(overview, range),
    ...inconsistencySuggestions(overview, data, conflicts, range),
    ...reorganizationSuggestions(overview, data, conflicts),
    changeSummarySuggestion(overview, range),
  ];
  const rank: Record<PlanningAssistantSuggestionType, number> = {
    vacant_position: 0,
    compatible_sailor: 1,
    missing_document: 2,
    inconsistency: 3,
    handover: 4,
    reorganization: 5,
    change_summary: 6,
  };
  return suggestions.sort((left, right) => rank[left.type] - rank[right.type]
    || right.confidence.score - left.confidence.score
    || left.title.localeCompare(right.title, 'fr'));
}

export function planningAssistantSuggestionSnapshot(suggestion: PlanningAssistantSuggestion): Record<string, unknown> {
  return {
    title: suggestion.title,
    summary: suggestion.summary,
    criteria_used: suggestion.criteriaUsed,
    data_checked: suggestion.dataChecked,
    rules_applied: suggestion.rulesApplied,
    conflicts_detected: suggestion.conflictsDetected,
    unavailable_data: suggestion.unavailableData,
    confidence: suggestion.confidence,
    justification: suggestion.justification,
    suggested_steps: suggestion.suggestedSteps,
    candidates: suggestion.candidates,
    human_validation_required: true,
  };
}
