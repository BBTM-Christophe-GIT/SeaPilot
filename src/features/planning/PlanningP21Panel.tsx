import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AlertTriangle,
  Bot,
  Check,
  ChevronRight,
  ClipboardList,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UserCog,
  X,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatPlanningDate, formatPlanningDateTime } from './planningDates';
import { planningErrorMessage } from './planningErrors';
import type { PlanningOverview } from './planningQueries';
import {
  buildPlanningAssistantSuggestions,
  PLANNING_ASSISTANT_TYPE_LABELS,
  type PlanningAssistantAccess,
  type PlanningAssistantData,
  type PlanningAssistantDecision,
  type PlanningAssistantPilot,
  type PlanningAssistantSuggestion,
  type PlanningAssistantSuggestionType,
} from './planningP21';
import {
  fetchPlanningAssistantData,
  fetchPlanningAssistantPilots,
  fetchPlanningAssistantReviews,
  recordPlanningAssistantReview,
  setPlanningAssistantPilot,
} from './planningP21Queries';

type AssistantTab = 'suggestions' | 'journal' | 'pilots';

const EMPTY_DATA: PlanningAssistantData = {
  p13: { policies: [], notifications: [], dependencies: [], p12: { absences: [], conflictCases: [], conflictHistory: [], matrices: [] } },
  reviews: [],
  pilots: [],
};

const SUGGESTION_TYPES = Object.keys(PLANNING_ASSISTANT_TYPE_LABELS) as PlanningAssistantSuggestionType[];
const CONFIDENCE_LABELS = { high: 'Élevée', medium: 'Moyenne', low: 'Faible' } as const;

function EvidenceList({ title, values, emptyLabel = 'Aucun élément.' }: { title: string; values: string[]; emptyLabel?: string }) {
  return <section><h4>{title}</h4>{values.length ? <ul>{values.map((value) => <li key={value}>{value}</li>)}</ul> : <p>{emptyLabel}</p>}</section>;
}

function PilotRow({
  pilot,
  saving,
  onSave,
}: {
  pilot: PlanningAssistantPilot;
  saving: boolean;
  onSave: (pilot: PlanningAssistantPilot, enabled: boolean, validUntil: string, reason: string) => Promise<void>;
}) {
  const [validUntil, setValidUntil] = useState(pilot.validUntil);
  const [reason, setReason] = useState(pilot.reason);
  return (
    <article className="planning-assistant-pilot">
      <header>
        <div><strong>{pilot.displayName}</strong><small>{pilot.email} · {pilot.roleKeys.join(', ')}</small></div>
        <span className={pilot.enabled ? 'is-enabled' : 'is-disabled'}>{pilot.enabled ? 'Pilote actif' : 'Non autorisé'}</span>
      </header>
      <div className="planning-assistant-pilot-form">
        <label>Fin d’accès<input min={new Date().toISOString().slice(0, 10)} onChange={(event) => setValidUntil(event.target.value)} type="date" value={validUntil} /></label>
        <label>Motif<input minLength={10} onChange={(event) => setReason(event.target.value)} placeholder="Motif administratif (10 caractères min.)" value={reason} /></label>
        <button disabled={saving || reason.trim().length < 10} onClick={() => void onSave(pilot, !pilot.enabled, validUntil, reason)} type="button">
          {pilot.enabled ? <XCircle aria-hidden="true" size={16} /> : <ShieldCheck aria-hidden="true" size={16} />}
          {pilot.enabled ? 'Retirer l’accès' : 'Activer le pilote'}
        </button>
      </div>
    </article>
  );
}

export function PlanningP21Panel({
  client,
  overview,
  range,
  access,
  onClose,
  onAuditChange,
}: {
  client: SupabaseClient;
  overview: PlanningOverview;
  range: { start: string; end: string };
  access: PlanningAssistantAccess;
  onClose: () => void;
  onAuditChange: () => Promise<void>;
}) {
  const [tab, setTab] = useState<AssistantTab>('suggestions');
  const [data, setData] = useState<PlanningAssistantData>(EMPTY_DATA);
  const [isLoading, setIsLoading] = useState(true);
  const [savingKey, setSavingKey] = useState('');
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null);
  const [typeFilter, setTypeFilter] = useState<PlanningAssistantSuggestionType | ''>('');
  const [confidenceFilter, setConfidenceFilter] = useState<'high' | 'medium' | 'low' | ''>('');
  const [comments, setComments] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setData(await fetchPlanningAssistantData(client, access.canManagePilots));
      setFeedback(null);
    } catch (error) {
      setFeedback({ text: planningErrorMessage(error, 'Impossible de charger l’assistant Planning.'), error: true });
    } finally {
      setIsLoading(false);
    }
  }, [access.canManagePilots, client]);

  useEffect(() => {
    let active = true;
    void fetchPlanningAssistantData(client, access.canManagePilots)
      .then((result) => { if (active) setData(result); })
      .catch((error) => { if (active) setFeedback({ text: planningErrorMessage(error, 'Impossible de charger l’assistant Planning.'), error: true }); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [access.canManagePilots, client]);

  const suggestions = useMemo(
    () => buildPlanningAssistantSuggestions(overview, data.p13, range),
    [data.p13, overview, range],
  );
  const visibleSuggestions = useMemo(() => suggestions.filter((suggestion) =>
    (!typeFilter || suggestion.type === typeFilter)
    && (!confidenceFilter || suggestion.confidence.level === confidenceFilter)),
  [confidenceFilter, suggestions, typeFilter]);
  const latestReviewBySuggestion = useMemo(() => {
    const result = new Map<string, PlanningAssistantData['reviews'][number]>();
    for (const review of data.reviews) if (!result.has(review.suggestionKey)) result.set(review.suggestionKey, review);
    return result;
  }, [data.reviews]);

  const handleReview = async (suggestion: PlanningAssistantSuggestion, decision: PlanningAssistantDecision) => {
    const comment = comments[suggestion.key]?.trim() || '';
    setSavingKey(suggestion.key);
    try {
      await recordPlanningAssistantReview(client, { suggestion, decision, comment, range });
      const reviews = await fetchPlanningAssistantReviews(client);
      setData((current) => ({ ...current, reviews }));
      setComments((current) => ({ ...current, [suggestion.key]: '' }));
      setFeedback({ text: `Suggestion ${decision === 'accepted' ? 'acceptée' : 'refusée'} et journalisée. Aucun changement Planning n’a été appliqué.`, error: false });
      await onAuditChange();
    } catch (error) {
      setFeedback({ text: planningErrorMessage(error, 'Impossible d’enregistrer la décision.'), error: true });
    } finally {
      setSavingKey('');
    }
  };

  const handlePilot = async (pilot: PlanningAssistantPilot, enabled: boolean, validUntil: string, reason: string) => {
    setSavingKey(`pilot:${pilot.userId}`);
    try {
      await setPlanningAssistantPilot(client, { userId: pilot.userId, enabled, validUntil, reason });
      const pilots = await fetchPlanningAssistantPilots(client);
      setData((current) => ({ ...current, pilots }));
      setFeedback({ text: enabled ? 'Accès pilote activé.' : 'Accès pilote retiré.', error: false });
      await onAuditChange();
    } catch (error) {
      setFeedback({ text: planningErrorMessage(error, 'Impossible de modifier l’accès pilote.'), error: true });
    } finally {
      setSavingKey('');
    }
  };

  return (
    <div className="planning-dialog-backdrop is-side-panel" role="presentation">
      <section aria-label="Assistant de planification maritime" aria-modal="true" className="planning-dialog planning-p21-panel" role="dialog">
        <header className="planning-p21-header">
          <div><Sparkles aria-hidden="true" size={22} /><span><h2>Assistant Planning P2.1</h2><small>Mode conseil · validation humaine obligatoire</small></span></div>
          <button aria-label="Fermer l’assistant" onClick={onClose} type="button"><X aria-hidden="true" size={18} /></button>
        </header>

        <div className="planning-assistant-guardrail" role="note">
          <ShieldCheck aria-hidden="true" size={18} />
          <span><strong>Aucune décision automatique.</strong> Accepter une suggestion la journalise seulement : aucune affectation, publication ou dérogation n’est créée.</span>
          <small>{access.accessMode === 'administrator' ? 'Accès administrateur' : `Accès pilote${access.expiresOn ? ` jusqu’au ${formatPlanningDate(access.expiresOn)}` : ''}`}</small>
        </div>

        <nav aria-label="Sections de l’assistant" className="planning-p21-tabs">
          <button aria-current={tab === 'suggestions' ? 'page' : undefined} onClick={() => setTab('suggestions')} type="button"><Bot aria-hidden="true" size={16} />Suggestions <span>{suggestions.length}</span></button>
          <button aria-current={tab === 'journal' ? 'page' : undefined} onClick={() => setTab('journal')} type="button"><ClipboardList aria-hidden="true" size={16} />Journal <span>{data.reviews.length}</span></button>
          {access.canManagePilots ? <button aria-current={tab === 'pilots' ? 'page' : undefined} onClick={() => setTab('pilots')} type="button"><UserCog aria-hidden="true" size={16} />Accès pilote</button> : null}
          <button aria-label="Actualiser l’assistant" className="is-refresh" disabled={isLoading} onClick={() => void load()} type="button"><RefreshCw aria-hidden="true" size={16} /></button>
        </nav>

        {feedback ? <div className={feedback.error ? 'planning-feedback is-error' : 'planning-feedback'} role={feedback.error ? 'alert' : 'status'}>{feedback.text}</div> : null}
        {isLoading ? <div className="admin-state" role="status">Analyse des données Planning…</div> : null}

        {!isLoading && tab === 'suggestions' ? (
          <div className="planning-assistant-suggestions">
            <div className="planning-assistant-summary">
              <div><strong>{suggestions.length}</strong><span>suggestions explicables</span></div>
              <div><strong>{suggestions.filter((item) => item.confidence.level === 'high').length}</strong><span>confiance élevée</span></div>
              <div><strong>{suggestions.filter((item) => item.unavailableData.length).length}</strong><span>données incomplètes</span></div>
            </div>
            <div className="planning-assistant-filters">
              <label>Type<select onChange={(event) => setTypeFilter(event.target.value as PlanningAssistantSuggestionType | '')} value={typeFilter}><option value="">Tous</option>{SUGGESTION_TYPES.map((type) => <option key={type} value={type}>{PLANNING_ASSISTANT_TYPE_LABELS[type]}</option>)}</select></label>
              <label>Confiance<select onChange={(event) => setConfidenceFilter(event.target.value as typeof confidenceFilter)} value={confidenceFilter}><option value="">Toutes</option><option value="high">Élevée</option><option value="medium">Moyenne</option><option value="low">Faible</option></select></label>
              <span>{visibleSuggestions.length} résultat(s)</span>
            </div>
            {!visibleSuggestions.length ? <div className="admin-state">Aucune suggestion pour ces filtres.</div> : null}
            <div className="planning-assistant-card-list">
              {visibleSuggestions.map((suggestion) => {
                const review = latestReviewBySuggestion.get(suggestion.key);
                const comment = comments[suggestion.key] || '';
                return (
                  <article className={`planning-assistant-card is-${suggestion.confidence.level}`} key={suggestion.key}>
                    <header>
                      <div><span className="planning-assistant-type">{PLANNING_ASSISTANT_TYPE_LABELS[suggestion.type]}</span><h3>{suggestion.title}</h3></div>
                      <span className={`planning-assistant-confidence is-${suggestion.confidence.level}`}>Confiance {CONFIDENCE_LABELS[suggestion.confidence.level]} · {suggestion.confidence.score}%</span>
                    </header>
                    <p>{suggestion.summary}</p>
                    <div className="planning-assistant-justification"><ChevronRight aria-hidden="true" size={16} /><span><strong>Justification</strong>{suggestion.justification}</span></div>
                    <details>
                      <summary>Afficher les critères, données et règles</summary>
                      <div className="planning-assistant-evidence-grid">
                        <EvidenceList title="Critères utilisés" values={suggestion.criteriaUsed} />
                        <EvidenceList title="Données vérifiées" values={suggestion.dataChecked} />
                        <EvidenceList title="Règles appliquées" values={suggestion.rulesApplied} />
                        <EvidenceList title="Conflits détectés" emptyLabel="Aucun conflit supplémentaire." values={suggestion.conflictsDetected} />
                        <EvidenceList title="Données non disponibles" emptyLabel="Aucune donnée manquante identifiée." values={suggestion.unavailableData} />
                        <EvidenceList title="Étapes suggérées" values={suggestion.suggestedSteps} />
                      </div>
                    </details>
                    {suggestion.candidates.length ? <div className="planning-assistant-candidates"><h4>Marins examinés</h4>{suggestion.candidates.map((candidate) => <div className={`is-${candidate.compatibility}`} key={candidate.personId}><span><strong>{candidate.personName}</strong><small>{candidate.compatibility === 'compatible' ? 'Compatible' : candidate.compatibility === 'warning' ? 'À confirmer' : 'Incompatible'}</small></span><ul>{candidate.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></div>)}</div> : null}
                    {review ? <div className={`planning-assistant-review-state is-${review.decision}`}><Check aria-hidden="true" size={16} />Dernière décision : {review.decision === 'accepted' ? 'acceptée' : 'refusée'} par {review.reviewedByName} · {formatPlanningDateTime(review.reviewedAt)}</div> : null}
                    <div className="planning-assistant-decision">
                      <label>Commentaire humain<textarea minLength={3} onChange={(event) => setComments((current) => ({ ...current, [suggestion.key]: event.target.value }))} placeholder="Motiver la décision (3 caractères min.)" rows={2} value={comment} /></label>
                      <div><button disabled={savingKey === suggestion.key || comment.trim().length < 3} onClick={() => void handleReview(suggestion, 'accepted')} type="button"><Check aria-hidden="true" size={16} />Accepter sans appliquer</button><button className="is-secondary" disabled={savingKey === suggestion.key || comment.trim().length < 3} onClick={() => void handleReview(suggestion, 'refused')} type="button"><XCircle aria-hidden="true" size={16} />Refuser</button></div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ) : null}

        {!isLoading && tab === 'journal' ? <div className="planning-assistant-journal">{data.reviews.length ? data.reviews.map((review) => <article key={review.id}><span className={review.decision === 'accepted' ? 'is-accepted' : 'is-refused'}>{review.decision === 'accepted' ? <Check aria-hidden="true" size={16} /> : <XCircle aria-hidden="true" size={16} />}{review.decision === 'accepted' ? 'Acceptée' : 'Refusée'}</span><div><strong>{PLANNING_ASSISTANT_TYPE_LABELS[review.suggestionType]}</strong><p>{review.comment}</p><small>{review.reviewedByName} · {formatPlanningDateTime(review.reviewedAt)} · période {formatPlanningDate(review.generatedForStart)}–{formatPlanningDate(review.generatedForEnd)}</small></div></article>) : <div className="admin-state">Aucune décision enregistrée.</div>}</div> : null}

        {!isLoading && tab === 'pilots' && access.canManagePilots ? <div className="planning-assistant-pilots"><div className="planning-assistant-pilot-note"><AlertTriangle aria-hidden="true" size={18} /><span>Seuls les utilisateurs Direction ou Armement de l’entreprise peuvent être activés. Les administrateurs disposent déjà de l’accès par rôle.</span></div>{data.pilots.map((pilot) => <PilotRow key={pilot.userId} onSave={handlePilot} pilot={pilot} saving={savingKey === `pilot:${pilot.userId}`} />)}{!data.pilots.length ? <div className="admin-state">Aucun utilisateur du bureau éligible.</div> : null}</div> : null}
      </section>
    </div>
  );
}
