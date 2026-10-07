import type { SupabaseClient } from '@supabase/supabase-js';
import { ArrowRight, FileText, RefreshCw, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { QhsePolicyAxisIcon, qhsePolicyAxisIconLabel, resolveQhsePolicyAxisIcon } from './qhsePolicyIcons';
import type { QhsePolicySnapshot } from './qhsePolicyModel';
import { fetchQhsePolicySnapshot } from './qhsePolicyQueries';
import { qhsePolicyPercent, summarizeQhsePolicyObjectives } from './qhsePolicyPresentation';
import './QhsePolicyHomeCard.css';

export function QhsePolicyHomeCard({ client }: { client: SupabaseClient }) {
  const [revision, setRevision] = useState(0);
  const [load, setLoad] = useState<{ client: SupabaseClient; revision: number; snapshot: QhsePolicySnapshot | null; failed: boolean } | null>(null);
  const current = load?.client === client && load.revision === revision ? load : null;
  useEffect(() => {
    let active = true;
    void fetchQhsePolicySnapshot(client).then((snapshot) => {
      if (active) setLoad({ client, revision, snapshot, failed: false });
    }).catch(() => {
      if (active) setLoad({ client, revision, snapshot: null, failed: true });
    });
    return () => { active = false; };
  }, [client, revision]);
  const snapshot = current?.snapshot;
  const summary = snapshot ? summarizeQhsePolicyObjectives(snapshot.objectives, snapshot.processes) : null;
  const axes = snapshot ? snapshot.processes
    .filter((process) => !process.archived)
    .sort((left, right) => left.position - right.position || left.name.localeCompare(right.name, 'fr'))
    .map((process) => ({
      process,
      summary: summarizeQhsePolicyObjectives(snapshot.objectives, [process]),
      iconKey: resolveQhsePolicyAxisIcon(process),
    })) : [];

  return <section className="qhse-policy-home-card" aria-label="Politique QHSE" aria-busy={!current}>
    <header className="qhse-policy-home__header">
      <div className="qhse-policy-home__identity"><span className="qhse-policy-home__icon"><ShieldCheck size={23} aria-hidden="true" /></span><div><h2>Objectifs de la politique</h2><p>Suivi de nos engagements par axe stratégique.</p></div></div>
      <div className="qhse-policy-home__links"><Link to="/modules/qhsePolicy#politique"><FileText size={16} aria-hidden="true" />Consulter la politique</Link><Link to="/modules/qhsePolicy">Voir les objectifs<ArrowRight size={16} aria-hidden="true" /></Link></div>
    </header>
    <div className="qhse-policy-home__summary">
      {!current ? <span role="status">Chargement des objectifs…</span> : current.failed ? <span className="qhse-policy-home__error" role="alert"><span>Le suivi des objectifs est indisponible.</span><button type="button" aria-label="Actualiser les objectifs QHSE" onClick={() => setRevision((value) => value + 1)}><RefreshCw size={15} aria-hidden="true" /></button></span> : summary?.total ? <><span><strong>{summary.completed}/{summary.total}</strong> objectifs réalisés</span><span><strong>{qhsePolicyPercent(summary.average ?? 0)}</strong> de progression moyenne</span></> : <span>Aucun objectif défini.</span>}
    </div>
    {axes.length > 0 ? <ul className="qhse-policy-home__axes" aria-label="Suivi par axe stratégique">
      {axes.map(({ process, summary: axisSummary, iconKey }) => <li className="qhse-policy-home__axis" key={process.id}>
        <span className="qhse-policy-home__axis-icon" role="img" aria-label={`Icône : ${qhsePolicyAxisIconLabel(iconKey)}`}><QhsePolicyAxisIcon iconKey={iconKey} size={21} aria-hidden="true" /></span>
        <div className="qhse-policy-home__axis-copy"><h3>{process.name}</h3><p>{axisSummary.total ? `${axisSummary.completed}/${axisSummary.total} objectifs réalisés` : 'Aucun objectif défini'}</p></div>
        <div className="qhse-policy-home__axis-progress">{axisSummary.average === null ? <span className="qhse-policy-home__axis-empty">Progression non renseignée</span> : <><span><strong>{qhsePolicyPercent(axisSummary.average)}</strong> de progression moyenne</span><progress max={100} value={axisSummary.average} aria-label={`Progression moyenne de ${process.name}`} /></>}</div>
      </li>)}
    </ul> : null}
  </section>;
}
