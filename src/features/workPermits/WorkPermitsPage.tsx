import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { AppShellOutletContext } from '../shell/AppShell';
import { WorkPermitEditor } from './WorkPermitEditor';
import { WorkPermitMap } from './WorkPermitMap';
import { WorkPermitsTimeline } from './WorkPermitsTimeline';
import { workPermitChecklistById } from './workPermitChecklists';
import { workPermitPlansForAsset } from './workPermitPlans';
import { loadWorkPermits, saveWorkPermit, transitionWorkPermit, type PermitValues, type WorkPermit, type PermitAction } from './workPermitQueries';
import './workPermits.css';

const dateTime = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' });
const statusLabel = { draft: 'En attente de signature', open: 'Ouvert', paused: 'En pause', closed: 'Clôturé' };

function message(cause: unknown) {
  return cause instanceof Error ? cause.message : 'Le registre est momentanément indisponible.';
}

export function WorkPermitsPage() {
  const { client } = useOutletContext<AppShellOutletContext>();
  const [data, setData] = useState<Awaited<ReturnType<typeof loadWorkPermits>>>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [siteId, setSiteId] = useState<number>();
  const [planId, setPlanId] = useState('');
  const [selectedId, setSelectedId] = useState<string>();
  const [editing, setEditing] = useState<string | 'new'>();
  const [confirmAction, setConfirmAction] = useState<'sign' | 'close'>();
  useEffect(() => {
    let active = true;
    void loadWorkPermits(client).then((snapshot) => {
      if (active) setData(snapshot);
    }).catch((cause: unknown) => {
      if (active) setError(message(cause));
    });
    return () => { active = false; };
  }, [client, refresh]);

  const locations = data?.locations ?? [];
  const permits = data?.permits ?? [];
  const activePermits = permits.filter(({ status }) => status === 'open' || status === 'paused');
  const drafts = permits.filter(({ status }) => status === 'draft');
  const archives = permits.filter(({ status }) => status === 'closed')
    .sort((a, b) => (b.closed_at ?? '').localeCompare(a.closed_at ?? ''));
  const selected = permits.find(({ id }) => id === selectedId);
  const edited = permits.find(({ id }) => id === editing);
  const site = locations.find(({ id }) => id === siteId) ?? locations[0];
  const plans = workPermitPlansForAsset(site?.name ?? '');
  const plan = plans.find(({ id }) => id === planId) ?? plans[0];
  const mappedPermits = activePermits.filter(({ vessel_id }) => vessel_id === site?.id);
  const locationName = (id: number) => locations.find((item) => item.id === id)?.name ?? 'Navire ou site';
  const canSign = !!locations.find(({ id }) => id === selected?.vessel_id)?.can_sign;

  function select(permit: WorkPermit) {
    setSelectedId(permit.id);
    setSiteId(permit.vessel_id);
    setPlanId(permit.plan_key ?? '');
    setEditing(undefined);
    setConfirmAction(undefined);
  }

  async function save(locationId: number, fields: PermitValues) {
    setBusy(true);
    setError('');
    try {
      const permit = await saveWorkPermit(client, locationId, fields, edited);
      setData((current) => current && {
        ...current,
        permits: [...current.permits.filter(({ id }) => id !== permit.id), permit],
      });
      select(permit);
    } finally {
      setBusy(false);
    }
  }

  async function transition(permit: WorkPermit, action: PermitAction) {
    setBusy(true);
    setError('');
    try {
      await transitionWorkPermit(client, permit, action);
      setConfirmAction(undefined);
      setData(await loadWorkPermits(client));
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="work-permits-page">
      <header className="work-permits-heading">
        <div><p className="work-permits-eyebrow">QHSE · Travaux à bord et à quai</p><h1>Permis de Travaux</h1></div>
        <div className="work-permits-actions">
          <button type="button" disabled={busy} onClick={() => { setError(''); setRefresh((value) => value + 1); }}>Actualiser</button>
          <button type="button" className="work-permits-primary" disabled={busy || !site} onClick={() => { setEditing('new'); setConfirmAction(undefined); }}>Nouveau permis</button>
        </div>
      </header>
      {error && <p className="work-permits-error" role="alert">{error}</p>}
      {!data && !error && <p role="status">Chargement du registre…</p>}
      {data && !locations.length && <p>Aucun navire ni site accessible pour votre affectation.</p>}
      {data && site && <>
        <WorkPermitsTimeline
          permits={activePermits.map((permit) => ({
            id: permit.id, title: permit.title, startsAt: permit.starts_at, endsAt: permit.ends_at,
            pausedAt: permit.paused_at, pausedSeconds: permit.paused_seconds,
            location: `${locationName(permit.vessel_id)} · ${permit.zone}`,
          }))}
          selectedId={selectedId}
          onSelect={(id) => {
            const permit = activePermits.find((item) => item.id === id);
            if (permit) select(permit);
          }}
        />
        <section className="work-permits-panel" aria-label="Plan des travaux">
          <div className="work-permits-heading">
            <h2>Plan des travaux</h2>
            <div className="work-permits-actions">
              {locations.length > 1 ? <label>Navire ou site
                <select value={site.id} onChange={(event) => { setSiteId(Number(event.target.value)); setPlanId(''); }}>
                  {locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label> : <strong>{site.name}</strong>}
              {plans.length > 1 && <label>Plan
                <select value={plan?.id ?? ''} onChange={(event) => setPlanId(event.target.value)}>
                  {plans.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
                </select>
              </label>}
            </div>
          </div>
          {plan ? <WorkPermitMap key={plan.id} plan={plan}
            pins={mappedPermits.flatMap((permit) => permit.plan_key === plan.id && permit.point_x !== null && permit.point_y !== null
              ? [{ id: permit.id, label: permit.title, point: { x: permit.point_x, y: permit.point_y }, selected: selectedId === permit.id }]
              : [])}
            zones={mappedPermits.flatMap(({ exclusion_zones }) => exclusion_zones)}
            onSelect={(id) => {
              const permit = mappedPermits.find((item) => item.id === id);
              if (permit) select(permit);
            }} /> : <p>Plan à venir. Le lieu des travaux est renseigné dans la fiche du permis.</p>}
        </section>
        {selected && !editing && <section className="work-permits-panel" aria-label="Permis sélectionné">
          <div className="work-permits-heading"><h2>{selected.title}</h2><strong>{statusLabel[selected.status]}</strong></div>
          <p>{locationName(selected.vessel_id)} · {selected.zone} · {workPermitChecklistById[selected.permit_type]?.title}</p>
          <p>Début le {dateTime.format(new Date(selected.starts_at))}{selected.ends_at && ` · Fin le ${dateTime.format(new Date(selected.ends_at))}`}</p>
          {selected.captain_signed_at && <p>Signé par {selected.captain_signer_name} le {dateTime.format(new Date(selected.captain_signed_at))}</p>}
          {selected.status === 'draft' && <p>La signature du Capitaine affecté est requise pour ouvrir ce permis.</p>}
          <div className="work-permits-actions">
            <button type="button" disabled={busy} onClick={() => setEditing(selected.id)}>{selected.status === 'closed' ? 'Consulter la fiche' : 'Modifier la fiche et le plan'}</button>
            {selected.status === 'draft' && canSign && <button type="button" disabled={busy} className="work-permits-primary" onClick={() => setConfirmAction('sign')}>Signer et ouvrir</button>}
            {selected.status === 'open' && <button type="button" disabled={busy} onClick={() => void transition(selected, 'pause')}>Mettre en pause</button>}
            {selected.status === 'paused' && <button type="button" disabled={busy} onClick={() => void transition(selected, 'resume')}>Reprendre les travaux</button>}
            {(selected.status === 'open' || selected.status === 'paused') && <button type="button" disabled={busy} onClick={() => setConfirmAction('close')}>Clôturer le permis</button>}
          </div>
          {confirmAction && <div className="work-permits-confirm">
            <p>{confirmAction === 'sign' ? 'Confirmez l’ouverture avec votre signature enregistrée.' : 'Confirmez la fin des travaux. L’heure sera enregistrée et le permis sera archivé.'}</p>
            <div className="work-permits-actions">
              <button type="button" disabled={busy} onClick={() => setConfirmAction(undefined)}>Annuler</button>
              <button type="button" disabled={busy} className="work-permits-primary" onClick={() => void transition(selected, confirmAction)}>Confirmer</button>
            </div>
          </div>}
        </section>}
        {editing && (editing === 'new' || edited) && <WorkPermitEditor
          key={editing} locations={locations} initialLocation={site.id} permit={edited} busy={busy} onSave={save}
          onCancel={() => setEditing(undefined)} />}
        <section className="work-permits-panel">
          <h2>En attente de signature ({drafts.length})</h2>
          {drafts.length ? <ul className="work-permits-records">{drafts.map((permit) => <li key={permit.id}>
            <button type="button" onClick={() => select(permit)}>{permit.title}</button><span>{locationName(permit.vessel_id)} · {dateTime.format(new Date(permit.starts_at))}</span>
          </li>)}</ul> : <p>Aucun permis en attente.</p>}
        </section>
        <details className="work-permits-panel">
          <summary>Archives · {archives.length} permis clôturé(s)</summary>
          {archives.length ? <ul className="work-permits-records">{archives.map((permit) => <li key={permit.id}>
            <button type="button" onClick={() => select(permit)}>{permit.title}</button><span>{locationName(permit.vessel_id)} · {permit.closed_at && dateTime.format(new Date(permit.closed_at))}</span>
          </li>)}</ul> : <p>Aucun permis clôturé.</p>}
        </details>
      </>}
    </section>
  );
}
