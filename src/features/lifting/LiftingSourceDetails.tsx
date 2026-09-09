import { formatLiftingDate, type LiftingItem } from './liftingModel';

export function LiftingSourceDetails({ item }: { item: LiftingItem }) {
  const source = item.source_data;
  if (!source?.source_id) return null;
  const date = (value?: string | null) => value ? formatLiftingDate(value) : 'Non renseignée';
  return <details className="lifting-source-details"><summary>Données du registre source</summary><dl>
    <div><dt>Mise en service</dt><dd>{date(source.commissioned_on)}</dd></div>
    <div><dt>Dernière visite</dt><dd>{date(source.last_inspected_on)}</dd></div>
    <div><dt>Validité indiquée</dt><dd>{date(source.valid_until)}</dd></div>
    <div><dt>Périodicité indiquée</dt><dd>{source.inspection_frequency || 'Non renseignée'}</dd></div>
    <div><dt>Action dans le registre</dt><dd>{source.action || 'Non renseignée'}</dd></div>
    <div><dt>Accréditation de contrôle</dt><dd>{source.control_accredited == null ? 'Non renseignée' : source.control_accredited ? 'Oui' : 'Non'}</dd></div>
    <div><dt>Remorquage d’urgence</dt><dd>{source.emergency_towing == null ? 'Non renseigné' : source.emergency_towing ? 'Oui' : 'Non'}</dd></div>
  </dl><p>Informations historiques importées. Le nouveau contrôle reste à réaliser.</p></details>;
}
