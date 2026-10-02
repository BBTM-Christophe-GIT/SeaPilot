import type { SupabaseClient } from '@supabase/supabase-js';
import { ArrowRight, FileText, RefreshCw, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { QhsePolicySnapshot } from './qhsePolicyModel';
import { fetchQhsePolicySnapshot } from './qhsePolicyQueries';
import { qhsePolicyPercent, summarizeQhsePolicyObjectives } from './qhsePolicyPresentation';
import './qhsePolicy.css';

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
  const summary = current?.snapshot ? summarizeQhsePolicyObjectives(current.snapshot.objectives, current.snapshot.processes) : null;
  return <section className="qhse-policy-home" aria-label="Politique QHSE">
    <div className="qhse-policy-home__identity"><span className="qhse-policy-home__icon"><ShieldCheck size={25} aria-hidden="true" /></span><div><h2>Politique QHSE</h2><p>Notre politique et le suivi de nos objectifs par processus.</p></div></div>
    <div className="qhse-policy-home__summary">
      {!current ? <span role="status">Chargement des objectifs…</span> : current.failed ? <span className="qhse-policy-home__error"><span>Le suivi des objectifs est indisponible.</span><button type="button" aria-label="Actualiser les objectifs QHSE" onClick={() => setRevision((value) => value + 1)}><RefreshCw size={15} aria-hidden="true" /></button></span> : summary?.total ? <><span><strong>{summary.completed}/{summary.total}</strong> objectifs réalisés</span><span><strong>{qhsePolicyPercent(summary.average ?? 0)}</strong> de progression moyenne</span></> : <span>Aucun objectif défini.</span>}
    </div>
    <div className="qhse-policy-home__links"><Link to="/modules/qhsePolicy#politique"><FileText size={17} aria-hidden="true" />Consulter la politique</Link><Link to="/modules/qhsePolicy">Voir les objectifs<ArrowRight size={16} aria-hidden="true" /></Link></div>
  </section>;
}
