import { useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Download, Layers3, RefreshCw, Ship, ShieldCheck } from 'lucide-react';
import type { AppShellOutletContext } from '../shell/AppShell';
import { supabase } from '../../lib/supabaseClient';
import { EXERCISE_MONTHS, type ExerciseReport, type ExerciseRoster } from './emergencyExercisesModel';
import { fetchExerciseReport, fetchExerciseRoster } from './emergencyExercisesQueries';
import { createExercisePreviewClient } from './emergencyExercisesPreview';
import './emergencyExercises.css';

const messageOf = (error: unknown) => error instanceof Error ? error.message : 'Impossible de charger le registre des exercices.';
export function EmergencyExercisesPage({ client }: { client?: SupabaseClient }) {
  const context = useOutletContext<AppShellOutletContext | undefined>();
  const [preview] = useState(createExercisePreviewClient);
  const db = client || (context?.previewMode ? preview : context?.client) || supabase;
  const [roster, setRoster] = useState<ExerciseRoster | null>(null);
  const [personId, setPersonId] = useState<number | null>(null);
  const [vesselId, setVesselId] = useState<number | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [population, setPopulation] = useState('current');
  const [revision, setRevision] = useState(0);
  const [report, setReport] = useState<ExerciseReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const exportLock = useRef(false);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let active = true;
    setRoster(null); setReport(null); setPersonId(null); setVesselId(null); setLoading(true); setError('');
    void fetchExerciseRoster(db).then((next) => {
      if (!active) return;
      setRoster(next);
      if (next.scope === 'self') setPersonId(next.people[0]?.id ?? null);
    }).catch((e) => { if (active) { setError(messageOf(e)); setLoading(false); } });
    return () => { active = false; };
  }, [db, revision]);
  useEffect(() => {
    if (!roster) return;
    let active = true;
    setReport(null); setLoading(true); setError(''); setNotice('');
    void fetchExerciseReport(db, personId, year, vesselId, population).then((next) => {
      if (active) setReport(next);
    }).catch((e) => { if (active) setError(messageOf(e)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [db, roster, personId, year, vesselId, population]);
  const people = useMemo(() => roster?.people.filter((p) => roster.scope !== 'fleet' || population === 'all'
    || (population === 'current' ? p.current : p.former)) || [], [roster, population]);
  // Compare the complete selection during render, so an old report can never be
  // exported between a filter change and the following effect.
  const selectionMatches = report && report.year === year && (report.person?.id ?? null) === personId && (report.vessel?.id ?? null) === vesselId;
  async function exportPdf() {
    if (!selectionMatches || !report.person || loading || exportLock.current) return;
    exportLock.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const { downloadExercisePdf } = await import('./emergencyExercisesPdf');
      await downloadExercisePdf(report); setNotice('Le carnet PDF a été téléchargé.');
    } catch (e) { setError(messageOf(e)); }
    finally { exportLock.current = false; setBusy(false); }
  }
  const years = Array.from({ length: Math.max(1, new Date().getFullYear() - 2000 + 1) }, (_, i) => new Date().getFullYear() - i);
  return <section className="exercise-page">
    <header className="exercise-header"><div><h1>Registre des Exercices</h1><p>Carnet individuel des exercices d’urgence et des TBT déclarés dans les DPR.</p></div>
      <button type="button" className="exercise-refresh" aria-label="Actualiser le registre" disabled={busy || loading} onClick={() => setRevision((n) => n + 1)}><RefreshCw size={18}/></button></header>
    {context?.previewMode && !client ? <p className="exercise-notice">Démonstration · données fictives.</p> : null}
    <nav className="exercise-vessels" aria-label="Filtrer les exercices par navire">
      <button type="button" disabled={busy} aria-pressed={vesselId === null} onClick={() => setVesselId(null)}><span><Layers3 size={31}/></span><strong>Flotte</strong></button>
      {roster?.vessels.map((v) => <button type="button" key={v.id} disabled={busy} aria-pressed={vesselId === v.id} onClick={() => setVesselId(v.id)}>
        <span><VesselIcon url={v.iconUrl}/></span><strong>{v.name}</strong>
      </button>)}
    </nav>
    <div className="exercise-filters">
      {roster?.scope === 'fleet' ? <label>Personnel<select aria-label="Filtrer les marins" value={population} disabled={busy} onChange={(e) => { setPopulation(e.target.value); setPersonId(null); setReport(null); }}><option value="current">En poste</option><option value="former">Anciens marins</option><option value="all">Tous les marins</option></select></label> : null}
      <label className="exercise-person">Collaborateur<select value={personId ?? ''} disabled={busy || !roster || roster.scope === 'self'} onChange={(e) => setPersonId(e.target.value ? Number(e.target.value) : null)}>
        {roster?.scope !== 'self' ? <option value="">{roster?.scope === 'watch' ? 'Toute ma bordée' : 'Tous les marins du filtre'}</option> : null}
        {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select></label>
      <label>Année<select value={year} disabled={busy} onChange={(e) => setYear(Number(e.target.value))}>{years.map((y) => <option key={y}>{y}</option>)}</select></label>
      <button className="exercise-export" disabled={busy || loading || !selectionMatches || !report?.person} type="button" onClick={() => void exportPdf()}><Download size={18}/>{busy ? 'Génération…' : 'Exporter le PDF'}</button>
    </div>
    <p className="exercise-scope"><ShieldCheck size={15}/>{roster?.scope === 'self' ? 'Votre carnet personnel.' : roster?.scope === 'watch' ? 'Marins de votre bordée.' : 'Marins de la société.'} {!personId ? 'Sélectionnez un marin pour exporter son carnet.' : 'Le PDF reprend le marin, l’année et le navire sélectionnés.'}</p>
    {error ? <p className="exercise-error" role="alert">{error} <button type="button" disabled={busy} onClick={() => setRevision((n) => n + 1)}>Réessayer</button></p> : null}
    {notice ? <p className="exercise-notice" role="status">{notice}</p> : null}
    {loading ? <p className="exercise-empty" role="status">Chargement des exercices…</p> : !error && selectionMatches ? <article className="exercise-report">
      <header><div><h2>{report.person?.name || report.vessel?.name || (roster?.scope === 'watch' ? 'Ma bordée' : 'Toute la flotte')} · {report.year}</h2><p>{report.vessel?.name || 'Tous les navires'} · DPR soumis et validés</p></div><strong>{report.total} exercice{report.total > 1 ? 's' : ''}</strong></header>
      <h3>Répartition mensuelle</h3><ExerciseChart report={report}/>
      <h3>Détail par type d’exercice</h3>
      <div className="exercise-table-scroll" role="region" aria-label="Tableau mensuel des exercices" tabIndex={0}><table><thead><tr><th scope="col">Type d’exercice</th>{EXERCISE_MONTHS.map((m) => <th scope="col" key={m}>{m}</th>)}<th scope="col">Total</th></tr></thead><tbody>
        {report.rows.map((row) => <tr className={row.priority ? 'exercise-priority' : ''} key={row.key}><th scope="row">{row.name}</th>{row.months.map((n, i) => <td key={i}>{n || '—'}</td>)}<td><strong>{row.total}</strong></td></tr>)}
        {!report.rows.length ? <tr><td colSpan={14} className="exercise-empty">{roster?.scope === 'self' && !roster.people.length ? 'Aucune fiche marin n’est liée à votre compte. Contactez l’armement.' : 'Aucun exercice déclaré pour cette sélection.'}</td></tr> : null}
      </tbody><tfoot><tr><th scope="row">Total</th>{report.months.map((n, i) => <td key={i}>{n}</td>)}<td>{report.total}</td></tr></tfoot></table></div>
      <p className="exercise-source">Chaque exercice, y compris un TBT, est compté une fois par DPR, pour les marins présents dans la bordée. Les TBT sont regroupés sous « TBT — thème libre » ; leur thème est saisi librement dans le DPR. La vue collective ne cumule pas les participations individuelles.</p>
    </article> : null}
  </section>;
}
function VesselIcon({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false);
  return url && !failed ? <img src={url} alt="" onError={() => setFailed(true)}/> : <Ship size={31}/>;
}
function ExerciseChart({ report }: { report: ExerciseReport }) {
  const max = Math.max(1, ...report.months), width = 1080, plot = 170, base = 195;
  return <div className="exercise-chart"><svg viewBox={`0 0 ${width} 232`} role="img" aria-label={`Répartition mensuelle : ${report.months.map((n, i) => `${EXERCISE_MONTHS[i]} ${n}`).join(', ')}`}>
    {[0, 1, 2, 3, 4].map((tick) => <line key={tick} x1="15" x2="1065" y1={base - tick * plot / 4} y2={base - tick * plot / 4} stroke="#e3eaf2"/>)}
    {report.months.map((n, i) => { const x = 20 + i * 87, h = n / max * plot; return <g key={i}><title>{EXERCISE_MONTHS[i]} : {n} exercices</title><rect x={x + 16} y={base - h} width="40" height={h} rx="2" fill="#156082"/><text x={x + 36} y={base - h - 8} textAnchor="middle" className="exercise-chart-count">{n}</text><text x={x + 36} y="220" textAnchor="middle">{EXERCISE_MONTHS[i]}</text></g>; })}
  </svg></div>;
}
