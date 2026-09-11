import type { SupabaseClient } from '@supabase/supabase-js';
import { Download, RefreshCw, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { formatPlanningDate, todayPlanningDate } from './planningDates';
import { planningErrorMessage } from './planningErrors';
import { buildSilaeEmployee, isSilaeEligible, silaePersonName, type SilaeData } from './planningSilae';
import { fetchPlanningSilaeData } from './planningSilaeQueries';
import type { PlanningOverview } from './planningQueries';
import './planningSilae.css';

export function PlanningSilaeExportDialog({ client, onClose, previewOverview }: { client: SupabaseClient; onClose: () => void; previewOverview?: PlanningOverview }) {
  const [month, setMonth] = useState(() => todayPlanningDate().slice(0, 7));
  const [response, setResponse] = useState<{ client: SupabaseClient; month: string; retry: number; data: SilaeData | null; error: string } | null>(null);
  const [selected, setSelected] = useState<number[] | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const [success, setSuccess] = useState('');
  const [retry, setRetry] = useState(0);
  const closeButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const currentResponse = response?.client === client && response.month === month && response.retry === retry ? response : null;
  const loaded = currentResponse?.data ? currentResponse as typeof currentResponse & { data: SilaeData } : null;
  const loading = Boolean(month && !currentResponse);
  const error = actionError || currentResponse?.error || '';

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    return () => previous?.focus();
  }, []);

  useEffect(() => {
    let active = true;
    if (!month) return;
    const request = previewOverview
      ? import('./planningSilaePreview').then(({ buildPlanningSilaePreviewData }) => buildPlanningSilaePreviewData(previewOverview))
      : fetchPlanningSilaeData(client, month);
    void request.then((data) => {
      if (!active) return;
      setResponse({ client, month, retry, data, error: '' });
      setConfirmed(false);
      setSelected((previous) => {
        const ids = data.people.filter((person) => isSilaeEligible(person)).map((person) => person.id);
        return previous === null ? ids : previous.filter((id) => ids.includes(id));
      });
    }).catch((cause) => {
      if (active) { setResponse({ client, month, retry, data: null, error: planningErrorMessage(cause, 'Impossible de préparer l’export SILAE.') }); setConfirmed(false); }
    });
    return () => { active = false; };
  }, [client, month, retry, previewOverview]);

  const employees = useMemo(() => loaded?.month === month ? loaded.data.people
    .filter((person) => isSilaeEligible(person))
    .sort((a, b) => silaePersonName(a).localeCompare(silaePersonName(b), 'fr'))
    .map((person) => buildSilaeEmployee(loaded.data, person, month)) : [], [loaded, month]);
  const chosen = employees.filter(({ person }) => selected?.includes(person.id));
  const issueCount = chosen.filter((employee) => employee.issues.length).length;
  const duplicateNumbers = new Set(chosen.map(({ person }) => person.employeeNumber)).size !== chosen.length;
  const ready = !loading && !saving && loaded?.month === month && chosen.length > 0 && !issueCount && !duplicateNumbers && confirmed;

  function changeSelection(ids: number[]) {
    setSelected(ids);
    setConfirmed(false);
    setSuccess('');
  }

  async function download(event: FormEvent) {
    event.preventDefault();
    if (!ready) return;
    setSaving(true);
    setActionError('');
    try {
      const { generateSilaeWorkbook } = await import('./planningSilaeWorkbook');
      const bytes = await generateSilaeWorkbook(chosen);
      const blob = new Blob([new Uint8Array(bytes)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `SILAE_LIGNES_SERVICES_${month}.xlsx`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setSuccess(`Export SILAE généré pour ${chosen.length} marin${chosen.length > 1 ? 's' : ''}.`);
    } catch (cause) {
      setActionError(planningErrorMessage(cause, 'Impossible de générer l’export SILAE.'));
    } finally { setSaving(false); }
  }

  return <div className="planning-dialog-backdrop" role="presentation">
    <section aria-labelledby="silae-title" aria-modal="true" className="planning-dialog planning-export-dialog planning-silae-dialog" ref={dialog} role="dialog" onKeyDown={(event) => {
      if (event.key === 'Escape' && !saving) onClose();
      if (event.key !== 'Tab') return;
      const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, a[href]') || []).filter((node) => node.getClientRects().length > 0);
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
      <button aria-label="Fermer" className="planning-export-close" disabled={saving} onClick={onClose} ref={closeButton} type="button"><X aria-hidden="true" size={18} /></button>
      <form onSubmit={(event) => void download(event)}>
        <div className="planning-export-intro"><Download aria-hidden="true" size={30} /><div><h2 id="silae-title">Export SILAE</h2><p>Lignes de services mensuelles · Excel au format texte</p></div></div>
        {previewOverview ? <p className="planning-silae-note">Démonstration : les matricules DEMO sont fictifs. Ce fichier ne doit pas être importé dans SILAE.</p> : null}
        <label className="planning-silae-month">Mois et année de l’export<input disabled={saving} onChange={(event) => { setMonth(event.target.value); setConfirmed(false); setSuccess(''); setActionError(''); }} required type="month" value={month} /></label>
        <p className="planning-silae-note">Marins actuellement en poste uniquement. Les anciens et les sédentaires, dont Adam DEBORDEAUX, sont exclus. La sélection est indépendante des filtres du planning.</p>
        <p className="planning-silae-note">Les jours sans affectation sont comptés en repos. Vérifiez les périodes avant de confirmer.</p>
        <p className="planning-silae-note">Les périodes commencent à la date d’embauche et s’arrêtent à la date de départ, dates incluses. JrsMer reste vide au repos.</p>
        <p className="planning-silae-note">Une fonction temporaire se renseigne dans le champ Fonction de la période du planning. Son code ENIM s’applique sur ces dates ; la fonction RH est utilisée en l’absence de fonction planifiée.</p>
        <p className="planning-silae-note">NbjPos15 et ValPos15 restent vides dans l’attente de vos règles de calcul.</p>
        {loading ? <p role="status"><RefreshCw aria-hidden="true" className="is-spinning" size={16} /> Chargement des fiches RH et du planning…</p> : null}
        {error ? <div className="planning-export-feedback is-error" role="alert">{error} <button disabled={saving || loading} onClick={() => { setRetry((value) => value + 1); setConfirmed(false); setSuccess(''); setActionError(''); }} type="button">Réessayer</button></div> : null}
        {!loading && loaded?.month === month ? <>
          <div className="planning-silae-selection-heading"><h3>Confirmez la liste des marins</h3><span>{chosen.length} / {employees.length} sélectionnés</span></div>
          <label className="planning-silae-check"><input checked={employees.length > 0 && chosen.length === employees.length} disabled={saving || !employees.length} onChange={(event) => changeSelection(event.target.checked ? employees.map(({ person }) => person.id) : [])} type="checkbox" />Tous les marins éligibles</label>
          <div className="planning-silae-people">
            {employees.map((employee) => <div className="planning-silae-person" key={employee.person.id}>
              <label className="planning-silae-check"><input checked={selected?.includes(employee.person.id) || false} disabled={saving} onChange={(event) => changeSelection(event.target.checked ? [...(selected || []), employee.person.id] : (selected || []).filter((id) => id !== employee.person.id))} type="checkbox" /><span><strong>{silaePersonName(employee.person)}</strong><small>Matricule {employee.person.employeeNumber || 'à renseigner'} · {employee.periods.length} période{employee.periods.length > 1 ? 's' : ''}</small></span></label>
              <details><summary>{employee.issues.length ? `${employee.issues.length} point${employee.issues.length > 1 ? 's' : ''} à résoudre` : 'Vérifier les périodes'}</summary>
                <p className="planning-silae-note">Fonction RH : {employee.person.functionLabel || 'À renseigner'} · Embauche : {employee.person.hiredOn ? formatPlanningDate(employee.person.hiredOn) : 'Non renseignée'}{employee.person.departedOn ? ` · Départ : ${formatPlanningDate(employee.person.departedOn)}` : ''}</p>
                {employee.issues.length ? <ul className="planning-silae-issues">{employee.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul> : null}
                <div className="planning-silae-periods"><table><caption>Périodes de {silaePersonName(employee.person)}</caption><thead><tr><th>Du</th><th>Au</th><th>État</th><th>Navire</th><th>Fonction</th><th>Code ENIM</th><th>Catégorie</th><th>JrsMer</th><th>JrsEmbarque</th></tr></thead><tbody>{employee.periods.map((period) => <tr key={period.startsOn}><td>{formatPlanningDate(period.startsOn)}</td><td>{formatPlanningDate(period.endsOn)}</td><td>{period.state === 'sea' ? 'En mer' : 'En repos'}</td><td>{period.registrationNumber || 'À renseigner'}</td><td>{period.functionLabel || 'À renseigner'}</td><td>{period.enimFunctionCode || 'À renseigner'}</td><td>{period.enimCategory || 'À renseigner'}</td><td>{period.state === 'rest' ? '' : period.seaDays}</td><td>{period.embarkedDays}</td></tr>)}</tbody></table></div>
              </details>
            </div>)}
            {!employees.length ? <p>Aucun marin éligible à l’export.</p> : null}
          </div>
          {issueCount ? <p className="planning-export-feedback is-error" role="alert">{issueCount} marin{issueCount > 1 ? 's sélectionnés nécessitent' : ' sélectionné nécessite'} une vérification. Corrigez les points signalés ou modifiez votre sélection.</p> : null}
          {duplicateNumbers ? <p className="planning-export-feedback is-error" role="alert">Des marins sélectionnés partagent le même matricule RH.</p> : null}
          <label className="planning-silae-check planning-silae-confirm"><input checked={confirmed} disabled={saving || !chosen.length || issueCount > 0 || duplicateNumbers} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" />Je confirme cette liste de {chosen.length} marin{chosen.length > 1 ? 's' : ''} pour l’export de {month.split('-').reverse().join('/')}.</label>
        </> : null}
        {success ? <p className="planning-export-feedback" role="status">{success}</p> : null}
        <footer><button className="is-secondary" disabled={saving} onClick={onClose} type="button">Annuler</button><button disabled={!ready} type="submit">{saving ? 'Génération…' : 'Télécharger l’export SILAE'}</button></footer>
      </form>
    </section>
  </div>;
}
