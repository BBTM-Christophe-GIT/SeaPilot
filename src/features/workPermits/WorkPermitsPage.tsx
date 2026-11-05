import { Archive, CheckCircle2, FilePenLine, FileText, Pause, Play, Plus, RefreshCw, Signature, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { AppDialog } from '../../components/AppDialog';
import { ModuleRibbon, ModuleRibbonCommand, ModuleRibbonGroup } from '../../components/ModuleRibbon';
import { compareFleetAssets, fleetDisplayName, fleetIllustration } from '../fleet/fleetDisplay';
import { LiftingVesselFilter } from '../lifting/LiftingVesselFilter';
import type { AppShellOutletContext } from '../shell/AppShell';
import '../lifting/liftingNavigation.css';
import { WorkPermitEditor } from './WorkPermitEditor';
import { WorkPermitMap } from './WorkPermitMap';
import { WorkPermitsTimeline } from './WorkPermitsTimeline';
import { workPermitChecklistById } from './workPermitChecklists';
import { workPermitPlansForAsset } from './workPermitPlans';
import { deleteWorkPermit, loadWorkPermits, saveWorkPermit, transitionWorkPermit, type PermitValues, type WorkPermit, type PermitAction } from './workPermitQueries';
import './workPermits.css';
import './workPermitsNavigation.css';

const dateTime = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' });
const statusLabel = { draft: 'En attente de signature', open: 'Ouvert', paused: 'En pause', closed: 'Clôturé' };

function message(cause: unknown) {
  return cause instanceof Error ? cause.message : 'Le registre est momentanément indisponible.';
}

export function WorkPermitsPage() {
  const { client, roles, previewMode } = useOutletContext<AppShellOutletContext>();
  const canDelete = !previewMode && roles?.includes('admin');
  const archivesRef = useRef<HTMLDetailsElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const confirmationRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<Awaited<ReturnType<typeof loadWorkPermits>>>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [siteId, setSiteId] = useState<number>();
  const [planId, setPlanId] = useState('');
  const [selectedId, setSelectedId] = useState<string>();
  const [editing, setEditing] = useState<string | 'new'>();
  const [confirmAction, setConfirmAction] = useState<'sign' | 'close'>();
  const [deleteTarget, setDeleteTarget] = useState<WorkPermit>();
  const [deleteError, setDeleteError] = useState('');
  useEffect(() => {
    let active = true;
    void loadWorkPermits(client).then((snapshot) => {
      if (active) setData(snapshot);
    }).catch((cause: unknown) => {
      if (active) setError(message(cause));
    });
    return () => { active = false; };
  }, [client, refresh]);

  useEffect(() => {
    if (editing) editorRef.current?.scrollIntoView?.({ block: 'start' });
    if (confirmAction) confirmationRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [editing, confirmAction]);

  const locations = [...(data?.locations ?? [])].sort(compareFleetAssets);
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

  function chooseSite(id: number) {
    if (id === site?.id) return;
    setSiteId(id);
    setPlanId('');
    setSelectedId(undefined);
    setConfirmAction(undefined);
  }

  function showArchives() {
    const details = archivesRef.current;
    if (!details) return;
    details.open = true;
    details.scrollIntoView?.({ block: 'nearest' });
    details.querySelector('summary')?.focus({ preventScroll: true });
  }

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

  async function removePermit() {
    if (!canDelete || !deleteTarget || busy) return;
    setBusy(true);
    setDeleteError('');
    try {
      await deleteWorkPermit(client, deleteTarget);
      setData((current) => current && {
        ...current,
        permits: current.permits.filter(({ id }) => id !== deleteTarget.id),
      });
      setSelectedId(undefined);
      setConfirmAction(undefined);
      setDeleteTarget(undefined);
      setRefresh((value) => value + 1);
    } catch (cause) {
      setDeleteError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  function cancelRemoval() {
    if (busy) return;
    setDeleteTarget(undefined);
    setDeleteError('');
  }

  return (
    <section className="work-permits-module">
      <header className="sp-module-header">
        <div><p className="work-permits-eyebrow">QHSE · Travaux à bord et à quai</p><h1>Permis de Travaux</h1></div>
      </header>
      <ModuleRibbon ariaLabel="Commandes des permis de travaux" singleRow>
        <ModuleRibbonGroup label="Registre">
          <ModuleRibbonCommand icon={<Plus size={22} aria-hidden="true" />} label="Nouveau permis" disabled={busy || !site || !!editing}
            onClick={() => { setEditing('new'); setConfirmAction(undefined); }} />
          <ModuleRibbonCommand icon={<RefreshCw size={22} aria-hidden="true" />} label="Actualiser" disabled={busy}
            onClick={() => { setError(''); setRefresh((value) => value + 1); }} />
          <ModuleRibbonCommand icon={<Archive size={22} aria-hidden="true" />} label="Archives" count={archives.length} disabled={busy || !site} onClick={showArchives} />
        </ModuleRibbonGroup>
        {selected && !editing && <ModuleRibbonGroup label="Permis sélectionné">
          <ModuleRibbonCommand icon={selected.status === 'closed' ? <FileText size={22} aria-hidden="true" /> : <FilePenLine size={22} aria-hidden="true" />}
            label={selected.status === 'closed' ? 'Consulter la fiche' : 'Modifier la fiche et le plan'} disabled={busy}
            onClick={() => { setConfirmAction(undefined); setEditing(selected.id); }} />
          {selected.status === 'draft' && canSign && <ModuleRibbonCommand icon={<Signature size={22} aria-hidden="true" />} label="Signer et ouvrir" disabled={busy} onClick={() => setConfirmAction('sign')} />}
          {selected.status === 'open' && <ModuleRibbonCommand icon={<Pause size={22} aria-hidden="true" />} label="Mettre en pause" disabled={busy} onClick={() => void transition(selected, 'pause')} />}
          {selected.status === 'paused' && <ModuleRibbonCommand icon={<Play size={22} aria-hidden="true" />} label="Reprendre les travaux" disabled={busy} onClick={() => void transition(selected, 'resume')} />}
          {(selected.status === 'open' || selected.status === 'paused') && <ModuleRibbonCommand icon={<CheckCircle2 size={22} aria-hidden="true" />} label="Clôturer le permis" disabled={busy} onClick={() => setConfirmAction('close')} />}
          {canDelete && <ModuleRibbonCommand className="work-permits-delete-command" icon={<Trash2 size={22} aria-hidden="true" />} label="Supprimer le permis" disabled={busy}
            onClick={() => { setConfirmAction(undefined); setDeleteTarget(selected); }} />}
        </ModuleRibbonGroup>}
      </ModuleRibbon>
      {site && <LiftingVesselFilter
        vessels={locations.map((location) => ({ ...location, name: fleetDisplayName(location), illustration_thumbnail_url: fleetIllustration(location) }))}
        value={site.id} disabled={busy || !!editing} includeYard={locations.some(({ asset_kind }) => asset_kind === 'quay')}
        contextLabel="Plan des travaux" onChange={chooseSite}
      />}
      <div className="work-permits-page">
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
          <section className="sp-panel work-permits-panel" aria-label="Plan des travaux">
            <div className="work-permits-heading">
              <h2>Plan des travaux</h2>
              <div className="work-permits-actions">
                <strong>{fleetDisplayName(site)}</strong>
                {plans.length > 1 && <label>Plan
                  <select value={plan?.id ?? ''} onChange={(event) => setPlanId(event.target.value)}>
                    {plans.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
                  </select>
                </label>}
              </div>
            </div>
            {plan ? <WorkPermitMap key={`${site.id}:${plan.id}`} plan={plan}
              pins={mappedPermits.flatMap((permit) => permit.plan_key === plan.id && permit.point_x !== null && permit.point_y !== null
                ? [{ id: permit.id, label: permit.title, point: { x: permit.point_x, y: permit.point_y }, selected: selectedId === permit.id }]
                : [])}
              zones={mappedPermits.flatMap(({ exclusion_zones }) => exclusion_zones)}
              onSelect={(id) => {
                const permit = mappedPermits.find((item) => item.id === id);
                if (permit) select(permit);
              }} /> : <p>Plan à venir. Le lieu des travaux est renseigné dans la fiche du permis.</p>}
          </section>
          {selected && !editing && <section className="sp-panel work-permits-panel" aria-label="Permis sélectionné">
            <div className="work-permits-heading"><h2>{selected.title}</h2><strong>{statusLabel[selected.status]}</strong></div>
            <p>{locationName(selected.vessel_id)} · {selected.zone} · {workPermitChecklistById[selected.permit_type]?.title}</p>
            <p>Début le {dateTime.format(new Date(selected.starts_at))}{selected.ends_at && ` · Fin le ${dateTime.format(new Date(selected.ends_at))}`}</p>
            {selected.captain_signed_at && <p>Signé par {selected.captain_signer_name} le {dateTime.format(new Date(selected.captain_signed_at))}</p>}
            {selected.status === 'draft' && <p>La signature du Capitaine affecté est requise pour ouvrir ce permis.</p>}
            {confirmAction && <div className="work-permits-confirm" ref={confirmationRef}>
              <p>{confirmAction === 'sign' ? 'Confirmez l’ouverture avec votre signature enregistrée.' : 'Confirmez la fin des travaux. L’heure sera enregistrée et le permis sera archivé.'}</p>
              <div className="work-permits-actions">
                <button type="button" disabled={busy} onClick={() => setConfirmAction(undefined)}>Annuler</button>
                <button type="button" disabled={busy} className="work-permits-primary" onClick={() => void transition(selected, confirmAction)}>Confirmer</button>
              </div>
            </div>}
          </section>}
          {editing && (editing === 'new' || edited) && <div ref={editorRef}>
            <WorkPermitEditor key={editing} locations={locations} initialLocation={site.id} permit={edited} busy={busy} onSave={save}
              onCancel={() => setEditing(undefined)} />
          </div>}
          <section className="sp-panel work-permits-panel">
            <h2>En attente de signature ({drafts.length})</h2>
            {drafts.length ? <ul className="work-permits-records">{drafts.map((permit) => <li key={permit.id}>
              <button type="button" onClick={() => select(permit)}>{permit.title}</button><span>{locationName(permit.vessel_id)} · {dateTime.format(new Date(permit.starts_at))}</span>
            </li>)}</ul> : <p>Aucun permis en attente.</p>}
          </section>
          <details className="sp-panel work-permits-panel" ref={archivesRef}>
            <summary>Archives · {archives.length} permis clôturé(s)</summary>
            {archives.length ? <ul className="work-permits-records">{archives.map((permit) => <li key={permit.id}>
              <button type="button" onClick={() => select(permit)}>{permit.title}</button><span>{locationName(permit.vessel_id)} · {permit.closed_at && dateTime.format(new Date(permit.closed_at))}</span>
            </li>)}</ul> : <p>Aucun permis clôturé.</p>}
          </details>
        </>}
      </div>
      {canDelete && deleteTarget && <AppDialog title="Supprimer le permis ?" eyebrow={deleteTarget.title} size="sm" isBusy={busy} onClose={cancelRemoval}
        icon={<Trash2 size={20} aria-hidden="true" />}
        footer={<div className="app-dialog__actions">
          <button type="button" className="sp-button sp-button--secondary" disabled={busy} onClick={cancelRemoval}>Annuler</button>
          <button type="button" className="sp-button sp-button--danger" disabled={busy} onClick={() => void removePermit()}>Supprimer définitivement</button>
        </div>}>
        <p>Le permis, ses repères et ses zones d’exclusion seront supprimés définitivement du registre.</p>
        {deleteError && <p className="work-permits-error" role="alert">{deleteError}</p>}
      </AppDialog>}
    </section>
  );
}
