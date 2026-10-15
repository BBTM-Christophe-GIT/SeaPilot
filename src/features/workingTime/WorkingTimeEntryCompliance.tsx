import { AlertTriangle, CheckCircle2, Clock3 } from 'lucide-react';
import { entryBounds } from './workingTimeEntryAnalysis';
import type { WorkingTimeAssignmentCoverage, WorkingTimePolicyThresholds } from './workingTimeQueries';

export function WorkingTimeEntryCompliance({ policy, coverages, availableSlots, loading = false, error, canManagePolicy, onOpenPolicy }: {
  policy: WorkingTimePolicyThresholds | null;
  coverages?: WorkingTimeAssignmentCoverage[];
  availableSlots?: { startsAt: string; endsAt: string }[];
  loading?: boolean;
  error?: string | null;
  canManagePolicy: boolean;
  onOpenPolicy?: () => void;
}) {
  const known = Boolean(coverages?.length && !loading && !error);
  const uncovered = coverages?.some((coverage) => coverage.status === 'uncovered');
  const uncertain = coverages?.some((coverage) => coverage.status === 'unknown' || coverage.status === 'projected');
  const status = known && uncovered ? 'deviation' : known && !uncertain ? 'ok' : 'unknown';
  const Icon = status === 'deviation' ? AlertTriangle : status === 'ok' ? CheckCircle2 : Clock3;
  const rules = policy ? [
    { label: 'Travail maximal sur 24 h', limit: policy.maxWork24h, maximum: true },
    { label: 'Repos total sur 24 h', limit: policy.minRest24h, maximum: false },
    { label: 'Repos consécutif', limit: policy.minConsecutiveRestHours, maximum: false },
    { label: 'Travail sur 7 jours', limit: policy.maxWork7d, maximum: true },
    { label: 'Repos sur 7 jours', limit: policy.minRest7d, maximum: false },
    { label: 'Périodes de repos sur 24 h', limit: policy.maxRestPeriods24h, maximum: true, periods: true },
    { label: 'Intervalle entre repos', limit: policy.maxIntervalBetweenRestsHours, maximum: true },
    { label: 'Amplitude', limit: policy.maxAmplitudeHours, maximum: true },
    { label: 'Travail de nuit sur 24 h', limit: policy.maxNightWork24h, maximum: true },
  ] : [];
  return <section className="working-time-live-compliance" aria-label="Couverture des affectations">
    <p className={`working-time-live-status is-${status}`} role="status">
      <Icon aria-hidden="true" size={17} />
      {error ? 'Analyse indisponible'
        : loading ? 'Recherche des combinaisons compatibles…'
          : known && uncovered ? 'Affectation non couverte intégralement'
            : known && uncertain ? 'Couverture à confirmer'
              : known ? 'Affectation couverte sans interruption'
                : policy ? 'Affectation à analyser' : 'Politique requise'}
    </p>
    {known ? coverages?.map((coverage) => <div className="working-time-compatible-window" key={`${coverage.assignmentId}:${coverage.scopeStartsAt}:${coverage.scopeEndsAt}`}>
      <strong>{entryBounds({ startsAt: coverage.scopeStartsAt, endsAt: coverage.scopeEndsAt })}</strong>
      {coverage.windows.length ? <details><summary>{coverage.windows.length} fenêtre{coverage.windows.length > 1 ? 's' : ''} de 24 h compatible{coverage.windows.length > 1 ? 's' : ''}</summary>
        <ol>{coverage.windows.map((window) => <li key={`${window.startsAt}:${window.endsAt}`}>{entryBounds(window)}</li>)}</ol>
      </details> : null}
      {coverage.status === 'uncovered' ? <><span>Intervalle sans couverture compatible :</span>
        <ul>{coverage.uncoveredRanges.map((range) => <li key={`${range.startsAt}:${range.endsAt}`}>{entryBounds(range)}</li>)}</ul>
      </> : null}
      {coverage.status === 'projected' || coverage.status === 'unknown' ? <small>Les périodes futures ou l’historique doivent encore être confirmés.</small> : null}
    </div>) : null}
    {known && availableSlots?.length ? <details className="working-time-compatible-window"><summary>Créneaux de travail disponibles</summary>
      <ul>{availableSlots.map((slot) => <li key={`${slot.startsAt}:${slot.endsAt}`}>{entryBounds(slot)}</li>)}</ul>
      <small>Chaque créneau conserve une couverture compatible avec les autres heures saisies.</small>
    </details> : null}
    <div className="working-time-live-policy"><strong>{policy?.name || 'Seuils de conformité'}</strong>
      {onOpenPolicy ? <button type="button" className="sp-button sp-button--secondary" onClick={onOpenPolicy}>{canManagePolicy ? 'Modifier les seuils' : 'Consulter les seuils'}</button> : null}
    </div>
    {rules.map((rule) => <article key={rule.label} className="working-time-live-rule is-threshold">
      <div><h5>{rule.label}</h5><strong>{rule.limit == null ? 'Non paramétré' : `${rule.limit}${rule.periods ? ' périodes' : ' h'}`}</strong>
        <small>{rule.maximum ? 'maximum' : 'minimum'}</small>
      </div>
    </article>)}
    <small>Les fenêtres compatibles se chevauchent ou se touchent et couvrent toute l’affectation. Toutes les heures avant et après restent prises en compte.</small>
  </section>;
}
