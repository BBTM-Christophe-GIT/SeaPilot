import { AlertTriangle, CheckCircle2, Clock3 } from 'lucide-react';
import { entryBounds, entryDuration } from './workingTimeEntryAnalysis';
import type { WorkingTimePreviewProjection } from './preview/workingTimePreviewProjection';

export function WorkingTimeEntryCompliance({ projection, policyName, canManagePolicy, onOpenPolicy }: {
  projection: WorkingTimePreviewProjection | null;
  policyName?: string;
  canManagePolicy: boolean;
  onOpenPolicy?: () => void;
}) {
  const deviations = projection?.rules.filter((rule) => rule.status === 'deviation') ?? [];
  const confirmed = projection?.rules.every((rule) => rule.status === 'ok');
  return <section className="working-time-live-compliance" aria-label="Conformité de la saisie">
    <p className={`working-time-live-status${deviations.length ? ' is-deviation' : ''}`}>
      {deviations.length ? `${deviations.length} écart${deviations.length > 1 ? 's' : ''} dans les plages analysées`
        : !projection ? 'Politique requise' : confirmed ? 'Aucun écart projeté pour les contrôles affichés' : 'Historique incomplet — analyse à confirmer'}
    </p>
    <div className="working-time-live-policy"><strong>{policyName || 'Seuils de conformité'}</strong>
      {onOpenPolicy ? <button type="button" className="sp-button sp-button--secondary" onClick={onOpenPolicy}>{canManagePolicy ? 'Modifier les seuils' : 'Consulter les seuils'}</button> : null}
    </div>
    {projection?.rules.map((rule) => {
      const Icon = rule.status === 'deviation' ? AlertTriangle : rule.status === 'ok' ? CheckCircle2 : Clock3;
      const bounds = rule.key === 'max_work_24h' ? projection.maximumCalculationDay
        : rule.key === 'max_amplitude' ? projection.maximumAmplitudeSequence : null;
      return <article key={rule.key} className={`working-time-live-rule is-${rule.status}`}>
        <Icon aria-hidden="true" size={17} /><div><h5>{rule.label}</h5><strong>{rule.unit === 'periods' ? rule.actual : entryDuration(rule.actual)}</strong>
          {bounds ? <small>{entryBounds(bounds)}</small> : null}
          <small>{rule.direction === 'maximum' ? 'maximum' : 'minimum'} {rule.limit}{rule.unit === 'hours' ? ' h' : ' périodes'}</small>
          {rule.status === 'deviation' ? <b>{rule.direction === 'maximum' ? '+' : 'Manque '}{rule.unit === 'periods' ? rule.deviation : entryDuration(rule.deviation)}</b> : null}
        </div>
      </article>;
    })}
    <small>Les seuils de la politique sont enregistrés par l’administrateur. Les contrôles serveur et le travail de nuit restent appliqués à la validation.</small>
  </section>;
}
