import { useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useOutletContext } from 'react-router-dom';
import { Archive, Download, FileText, HeartPulse, History, Pencil, RefreshCw, RotateCcw, Search } from 'lucide-react';
import { AppDialog } from '../../components/AppDialog';
import { ModuleRibbon, ModuleRibbonCommand, ModuleRibbonGroup } from '../../components/ModuleRibbon';
import { supabase } from '../../lib/supabaseClient';
import { compareFleetAssets } from '../fleet/fleetDisplay';
import { LiftingVesselFilter } from '../lifting/LiftingVesselFilter';
import type { RoleKey } from '../permissions/roles';
import type { AppShellOutletContext } from '../shell/AppShell';
import { MedicalInlineEntryRow } from './MedicalInlineEntryRow';
import { MedicalSignaturePreview } from './MedicalSignaturePreview';
import { blankMedicalDraft, canAccessMedicalLogbook, formatMedicalDate, medicalEntryMatches, type MedicalDraft, type MedicalEntry, type MedicalHistory, type MedicalSigner, type MedicalVessel } from './medicalLogbookModel';
import { createMedicalSignatureUrl, fetchMedicalEntries, fetchMedicalHistory, fetchMedicalSignatureImages, fetchMedicalSigner, fetchMedicalVessels, saveMedicalEntry, setMedicalEntryArchived } from './medicalLogbookQueries';
import { createMedicalPreviewClient } from './medicalLogbookPreview';
import '../lifting/liftingNavigation.css';
import './medicalLogbook.css';

function messageOf(cause: unknown) {
  return cause instanceof Error ? cause.message : 'Impossible de réaliser cette opération. Réessayez.';
}

const HISTORY_ACTIONS: Record<MedicalHistory['action'], string> = {
  created: 'Création', updated: 'Correction', archived: 'Archivage', restored: 'Restauration',
};
const EMPTY_ENTRIES: MedicalEntry[] = [];
const EMPTY_VESSELS: MedicalVessel[] = [];

function changedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function MedicalEntryDetails({ entry, signatureUrl, signatureLoading, signatureUnavailable }: { entry: MedicalEntry; signatureUrl?: string; signatureLoading: boolean; signatureUnavailable: boolean }) {
  return <dl className="medical-history-details">
    <div><dt>Date et heure</dt><dd>{formatMedicalDate(entry.occurred_on)} · {entry.occurred_time.slice(0, 5)}</dd></div>
    <div><dt>Nom du patient</dt><dd>{entry.patient_name}</dd></div>
    <div><dt>Blessure / Maladie</dt><dd>{entry.injury_illness}</dd></div>
    <div><dt>Traitement / Médicaments administrés</dt><dd>{entry.treatment_medicines}</dd></div>
    <div><dt>Secouriste</dt><dd>{entry.first_aider_name}</dd></div>
    <div><dt>Signature</dt><dd><MedicalSignaturePreview signature={entry.signature_snapshot} url={signatureUrl} loading={signatureLoading} unavailable={signatureUnavailable} /></dd></div>
  </dl>;
}

export function MedicalLogbookPage({ client, roles, previewMode }: { client?: SupabaseClient; roles?: RoleKey[]; previewMode?: boolean }) {
  const context = useOutletContext<AppShellOutletContext | undefined>();
  const preview = previewMode ?? context?.previewMode ?? false;
  const [previewClient] = useState(() => createMedicalPreviewClient());
  const db = preview ? previewClient : client || context?.client || supabase;
  const currentRoles = roles || context?.roles || [];
  const allowed = canAccessMedicalLogbook(currentRoles);
  const accessScope = `${context?.userId || ''}:${currentRoles.join('|')}:${context?.currentPerson?.id || ''}`;
  const [fleetState, setFleetState] = useState<{ accessScope: string; vessels: MedicalVessel[] }>({ accessScope, vessels: [] });
  const vessels = fleetState.accessScope === accessScope ? fleetState.vessels : EMPTY_VESSELS;
  const [vesselId, setVesselId] = useState(context?.liftingVesselId || 0);
  const [register, setRegister] = useState<{ vesselId: number; accessScope: string; entries: MedicalEntry[] }>({ vesselId: 0, accessScope, entries: [] });
  const [fleetLoading, setFleetLoading] = useState(true);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [fleetReload, setFleetReload] = useState(0);
  const [entriesReload, setEntriesReload] = useState(0);
  const [query, setQuery] = useState('');
  const [year, setYear] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [entryError, setEntryError] = useState('');
  const [notice, setNotice] = useState('');
  const [creationEpoch, setCreationEpoch] = useState(0);
  const [creationFocus, setCreationFocus] = useState(false);
  const [creationState, setCreationState] = useState<{ accessScope: string; vesselId: number; dirty: boolean } | null>(null);
  const creationDirty = creationState?.accessScope === accessScope && creationState.vesselId === vesselId && creationState.dirty;
  const [editorState, setEditor] = useState<{ entry?: MedicalEntry; draft: MedicalDraft; vesselId: number; accessScope: string } | null>(null);
  const editor = editorState?.accessScope === accessScope ? editorState : null;
  const interactionBlocked = busy || !!editor || !!creationDirty;
  const [archiveState, setArchiveTarget] = useState<{ entry: MedicalEntry; archived: boolean; accessScope: string } | null>(null);
  const archiveTarget = archiveState?.accessScope === accessScope ? archiveState : null;
  const [historyState, setHistory] = useState<{ entry: MedicalEntry; rows: MedicalHistory[]; loading: boolean; error: string; accessScope: string } | null>(null);
  const history = historyState?.accessScope === accessScope ? historyState : null;
  const [signerState, setSignerState] = useState<{ accessScope: string; value: MedicalSigner | null }>({ accessScope, value: null });
  const signer = signerState.accessScope === accessScope ? signerState.value : null;
  const [signerLoading, setSignerLoading] = useState(false);
  const [signerError, setSignerError] = useState('');
  const [signerReload, setSignerReload] = useState(0);
  const [signatureUrls, setSignatureUrls] = useState<Map<number, string>>(new Map());
  const [signatureFailures, setSignatureFailures] = useState<Set<number>>(new Set());
  const [signaturesLoading, setSignaturesLoading] = useState(false);
  const signatureCache = useRef<Map<number, { url: string; expiresAt: number }>>(new Map());
  const session = useRef(0);
  const mounted = useRef(false);
  const mutation = useRef(false);
  const historyRequest = useRef(0);
  const selectedVessel = useRef(vesselId);
  const rowActionRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  selectedVessel.current = vesselId;
  const vessel = vessels.find((item) => item.id === vesselId);
  const authorizedVessel = !!vessel;
  const entries = register.vesselId === vesselId && register.accessScope === accessScope ? register.entries : EMPTY_ENTRIES;
  const loaded = !!vessel && !fleetLoading && !entriesLoading && register.vesselId === vesselId && register.accessScope === accessScope && !loadError;
  const canWrite = allowed && vessel?.can_write === true;
  const filtered = useMemo(() => entries.filter((entry) => (includeArchived || !entry.archived) && medicalEntryMatches(entry, query, year)), [entries, includeArchived, query, year]);
  const years = useMemo(() => [...new Set(entries.map((entry) => entry.occurred_on.slice(0, 4)))].sort().reverse(), [entries]);
  const signatures = useMemo(() => {
    const distinct = new Map(filtered.map((entry) => [entry.signature_snapshot.signature_id, entry.signature_snapshot]));
    for (const row of history?.rows || []) distinct.set(row.entry.signature_snapshot.signature_id, row.entry.signature_snapshot);
    if (signer?.signature) distinct.set(signer.signature.signature_id, signer.signature);
    return [...distinct.values()];
  }, [filtered, history?.rows, signer]);

  useEffect(() => {
    mounted.current = true;
    session.current += 1;
    mutation.current = false;
    setBusy(false);
    signatureCache.current.clear();
    return () => { mounted.current = false; session.current += 1; historyRequest.current += 1; };
  }, [db, allowed, accessScope]);

  useEffect(() => {
    let active = true;
    setSignerState({ accessScope, value: null });
    setSignerError('');
    if (!allowed) { setSignerLoading(false); return; }
    setSignerLoading(true);
    void fetchMedicalSigner(db).then((value) => { if (active) setSignerState({ accessScope, value }); }).catch((cause: unknown) => {
      if (active) setSignerError(messageOf(cause));
    }).finally(() => { if (active) setSignerLoading(false); });
    return () => { active = false; };
  }, [db, allowed, accessScope, signerReload]);

  useEffect(() => {
    let active = true;
    if (!allowed) { setSignatureUrls(new Map()); setSignatureFailures(new Set()); return; }
    setSignaturesLoading(signatures.length > 0);
    void Promise.all(signatures.map(async (signature) => {
      const cached = signatureCache.current.get(signature.signature_id);
      if (cached && cached.expiresAt > Date.now()) return [signature.signature_id, cached.url] as const;
      try {
        const url = await createMedicalSignatureUrl(db, signature);
        if (!url) return [signature.signature_id, ''] as const;
        if (active) signatureCache.current.set(signature.signature_id, { url, expiresAt: Date.now() + 9 * 60 * 1000 });
        return [signature.signature_id, url] as const;
      } catch { return [signature.signature_id, ''] as const; }
    })).then((rows) => {
      if (!active) return;
      setSignatureUrls(new Map(rows.filter(([, url]) => !!url)));
      setSignatureFailures(new Set(rows.filter(([, url]) => !url).map(([id]) => id)));
      setSignaturesLoading(false);
    });
    return () => { active = false; };
  }, [db, allowed, accessScope, signatures, signerReload]);

  useEffect(() => {
    let active = true;
    if (!allowed) { setFleetLoading(false); return; }
    setFleetLoading(true);
    setLoadError('');
    void fetchMedicalVessels(db).then((loadedVessels) => {
      if (!active) return;
      const sorted = [...loadedVessels].sort(compareFleetAssets);
      setFleetState({ accessScope, vessels: sorted });
      setVesselId((current) => sorted.some((item) => item.id === current) ? current : sorted[0]?.id || 0);
    }).catch((cause: unknown) => {
      if (!active) return;
      setFleetState({ accessScope, vessels: [] });
      setVesselId(0);
      setLoadError(messageOf(cause));
    }).finally(() => { if (active) setFleetLoading(false); });
    return () => { active = false; };
  }, [db, allowed, accessScope, fleetReload]);

  useEffect(() => {
    let active = true;
    setEditor(null);
    setCreationState(null);
    setCreationFocus(false);
    setCreationEpoch((value) => value + 1);
    setEntryError('');
    setArchiveTarget(null);
    setHistory(null);
    historyRequest.current += 1;
    setActionError('');
    setNotice('');
    setQuery('');
    setYear('');
    if (!allowed || !vesselId || !authorizedVessel) { setEntriesLoading(false); return; }
    setEntriesLoading(true);
    setLoadError('');
    void fetchMedicalEntries(db, vesselId).then((rows) => {
      if (active) setRegister({ vesselId, accessScope, entries: rows });
    }).catch((cause: unknown) => {
      if (active) { setRegister({ vesselId: 0, accessScope, entries: [] }); setLoadError(messageOf(cause)); }
    }).finally(() => { if (active) setEntriesLoading(false); });
    return () => { active = false; };
  }, [db, allowed, accessScope, vesselId, authorizedVessel, entriesReload]);

  const rememberVessel = context?.setLiftingVesselId;
  useEffect(() => { if (vesselId) rememberVessel?.(vesselId); }, [vesselId, rememberVessel]);

  function stillCurrent(startedSession: number, targetVessel: number) {
    return mounted.current && session.current === startedSession && selectedVessel.current === targetVessel;
  }

  function replaceEntry(entry: MedicalEntry) {
    setRegister((current) => current.vesselId !== entry.vessel_id ? current : {
      ...current,
      entries: [entry, ...current.entries.filter((row) => row.id !== entry.id)].sort((left, right) => `${right.occurred_on} ${right.occurred_time}`.localeCompare(`${left.occurred_on} ${left.occurred_time}`) || right.id - left.id),
    });
  }

  function refresh() {
    if (interactionBlocked) return;
    setActionError('');
    setFleetReload((value) => value + 1);
    setEntriesReload((value) => value + 1);
    setSignerReload((value) => value + 1);
  }

  function startEntry(entry?: MedicalEntry) {
    if (!entry || !canWrite || !loaded || interactionBlocked || entry.archived) return;
    const draft = entry ? { ...entry } : blankMedicalDraft();
    draft.first_aider_name = signer?.signer_name || '';
    setActionError('');
    setEntryError('');
    setEditor({ entry, draft, vesselId, accessScope });
  }

  function resetCreation(focus = false) {
    setCreationState(null);
    setCreationEpoch((value) => value + 1);
    setCreationFocus(focus);
    setEntryError('');
  }

  async function save(draft: MedicalDraft, previous?: MedicalEntry) {
    if (!canWrite || !loaded || mutation.current || signerLoading || !signer?.signature
      || (previous ? !editor || editor.entry?.id !== previous.id || editor.vesselId !== vesselId : !!editor)) return;
    const startedSession = session.current;
    const targetVessel = vesselId;
    mutation.current = true;
    setBusy(true);
    setEntryError('');
    setNotice('');
    try {
      const saved = await saveMedicalEntry(db, targetVessel, draft, previous);
      if (!stillCurrent(startedSession, targetVessel)) return;
      replaceEntry(saved);
      setEditor(null);
      resetCreation(!previous);
      if (!previous) { setQuery(''); setYear(''); }
      if (previous) window.requestAnimationFrame(() => { if (stillCurrent(startedSession, targetVessel)) rowActionRefs.current.get(saved.id)?.focus({ preventScroll: true }); });
      setNotice(previous ? 'Correction enregistrée. La version précédente est conservée dans l’historique.' : 'Entrée médicale enregistrée.');
    } catch (cause) {
      if (stillCurrent(startedSession, targetVessel)) setEntryError(messageOf(cause));
    } finally {
      if (mounted.current && session.current === startedSession) { mutation.current = false; setBusy(false); }
    }
  }

  async function archiveEntry() {
    if (!archiveTarget || !canWrite || mutation.current || archiveTarget.entry.vessel_id !== vesselId) return;
    const startedSession = session.current;
    const targetVessel = vesselId;
    const target = archiveTarget;
    mutation.current = true;
    setBusy(true);
    setActionError('');
    setNotice('');
    try {
      const saved = await setMedicalEntryArchived(db, target.entry, target.archived);
      if (!stillCurrent(startedSession, targetVessel)) return;
      replaceEntry(saved);
      setArchiveTarget(null);
      setNotice(target.archived ? 'Entrée archivée. Elle reste disponible avec son historique.' : 'Entrée restaurée dans le registre.');
    } catch (cause) {
      if (stillCurrent(startedSession, targetVessel)) setActionError(messageOf(cause));
    } finally {
      if (mounted.current && session.current === startedSession) { mutation.current = false; setBusy(false); }
    }
  }

  async function openHistory(entry: MedicalEntry) {
    const sequence = ++historyRequest.current;
    const startedSession = session.current;
    const targetVessel = vesselId;
    setHistory({ entry, rows: [], loading: true, error: '', accessScope });
    try {
      const rows = await fetchMedicalHistory(db, entry.id);
      if (stillCurrent(startedSession, targetVessel) && sequence === historyRequest.current) setHistory({ entry, rows, loading: false, error: '', accessScope });
    } catch (cause) {
      if (stillCurrent(startedSession, targetVessel) && sequence === historyRequest.current) setHistory({ entry, rows: [], loading: false, error: messageOf(cause), accessScope });
    }
  }

  async function exportPdf(blank: boolean) {
    if (!vessel || mutation.current || (!blank && !loaded)) return;
    const startedSession = session.current;
    const targetVessel = vesselId;
    mutation.current = true;
    setBusy(true);
    setActionError('');
    setNotice('');
    try {
      const { createMedicalLogbookPdf, downloadMedicalLogbookPdf } = await import('./medicalLogbookPdf');
      if (!stillCurrent(startedSession, targetVessel)) return;
      const signatureImages = blank ? new Map<number, Uint8Array>() : await fetchMedicalSignatureImages(db, filtered);
      if (!stillCurrent(startedSession, targetVessel)) return;
      const blob = await createMedicalLogbookPdf(vessel, blank ? [] : filtered, { blank, year, signatureImages });
      if (!stillCurrent(startedSession, targetVessel)) return;
      const name = vessel.acronym || String(vessel.id);
      downloadMedicalLogbookPdf(blob, `registre-medical-${name.replace(/[^a-zA-Z0-9_-]/g, '-')}${year ? `-${year}` : ''}${blank ? '-vierge' : ''}.pdf`);
      setNotice(blank ? 'Registre vierge téléchargé.' : 'Registre médical téléchargé.');
    } catch (cause) {
      if (stillCurrent(startedSession, targetVessel)) setActionError(messageOf(cause));
    } finally {
      if (mounted.current && session.current === startedSession) { mutation.current = false; setBusy(false); }
    }
  }

  const signatureProps = {
    signer, signerLoading, signerError,
    signerUrl: signer?.signature ? signatureUrls.get(signer.signature.signature_id) : undefined,
    signatureLoading: signaturesLoading,
    signatureUnavailable: signer?.signature ? signatureFailures.has(signer.signature.signature_id) : false,
    onReloadSigner: () => { signatureCache.current.clear(); setSignerReload((value) => value + 1); },
  };
  const readyRow = loaded && canWrite ? <MedicalInlineEntryRow key={`${accessScope}:${vesselId}:new-${creationEpoch}`} initial={blankMedicalDraft()} editing={false} busy={busy} locked={!!editor} error={editor ? '' : entryError}
    {...signatureProps} autoFocus={creationFocus && !editor}
    onDirtyChange={(dirty) => setCreationState({ accessScope, vesselId, dirty })}
    onSave={(draft) => void save(draft)} onCancel={() => { if (!busy && !editor) resetCreation(); }} /> : null;
  const inlineEditor = editor && loaded && canWrite ? <MedicalInlineEntryRow key={`${accessScope}:${vesselId}:${editor.entry?.id}`} initial={editor.draft} editing busy={busy} error={entryError}
    {...signatureProps}
    autoFocus
    onSave={(draft) => void save(draft, editor.entry)} onCancel={() => { if (!busy) { setEditor(null); setActionError(''); resetCreation(); } }} /> : null;

  if (!allowed) return <section className="medical-logbook-page"><header className="sp-module-header"><h1>Registre médical</h1></header><div className="sp-panel medical-empty"><HeartPulse aria-hidden="true" size={28} /><h2>Accès réservé</h2><p>Le registre médical est réservé aux administrateurs et aux capitaines de leurs navires autorisés.</p></div></section>;

  return <section className="medical-logbook-page">
    <header className="sp-module-header"><div><h1>Registre médical</h1><p>Journal des soins et interventions à bord, avec la signature du compte connecté.</p></div></header>
    <ModuleRibbon ariaLabel="Commandes du registre médical" singleRow>
      <ModuleRibbonGroup label="Registre">
        <ModuleRibbonCommand icon={<RefreshCw size={22} aria-hidden="true" />} label="Actualiser" disabled={fleetLoading || entriesLoading || interactionBlocked} onClick={refresh} />
      </ModuleRibbonGroup>
      <ModuleRibbonGroup label="Documents">
        <ModuleRibbonCommand icon={<Download size={22} aria-hidden="true" />} label="Exporter PDF" disabled={!loaded || !filtered.length || interactionBlocked} onClick={() => void exportPdf(false)} />
        <ModuleRibbonCommand icon={<FileText size={22} aria-hidden="true" />} label="Registre vierge PDF" disabled={!vessel || fleetLoading || interactionBlocked} onClick={() => void exportPdf(true)} />
      </ModuleRibbonGroup>
    </ModuleRibbon>
    {preview ? <p className="medical-preview-note">Démonstration : les exemples et modifications restent dans cette prévisualisation.</p> : null}
    <LiftingVesselFilter vessels={vessels} value={vesselId} disabled={interactionBlocked || !!history || !!archiveTarget} includeYard={false} contextLabel="Registre médical du navire" onChange={setVesselId} />
    {loadError || (actionError && !editor && !archiveTarget) ? <div className="medical-feedback"><p className="medical-error" role="alert">{loadError || actionError}</p><button className="sp-button sp-button--secondary" disabled={busy || fleetLoading || entriesLoading} type="button" onClick={refresh}>Réessayer</button></div> : null}
    {notice ? <p className="medical-notice" role="status">{notice}</p> : null}
    <section className="sp-panel medical-register" aria-label="Registre des soins">
      <header className="medical-register-heading"><div><h2>{vessel ? vessel.name : 'Registre médical'}</h2><p>{vessel ? 'Journal des soins et premiers secours à bord' : 'Sélectionnez un navire pour consulter son registre.'}</p></div><span>{filtered.length} entrée{filtered.length > 1 ? 's' : ''}{includeArchived ? ' · archives incluses' : ''}</span></header>
      <div className="sp-filters medical-filters">
        <label className="medical-search"><span><Search size={16} aria-hidden="true" />Rechercher</span><input type="search" placeholder="Patient, soin, secouriste…" value={query} onChange={(event) => setQuery(event.target.value)} disabled={!loaded || interactionBlocked} /></label>
        <label>Année<select value={year} onChange={(event) => setYear(event.target.value)} disabled={!loaded || interactionBlocked}><option value="">Toutes les années</option>{years.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label className="medical-archive-filter"><input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} disabled={!loaded || interactionBlocked} />Inclure les archives</label>
      </div>
      {fleetLoading || entriesLoading ? <p className="medical-empty" role="status">Chargement du registre médical…</p>
        : !vessels.length && !loadError ? <div className="medical-empty"><h3>Aucun navire accessible</h3><p>Aucun navire n’est autorisé pour votre compte.</p></div>
          : loadError ? <p className="medical-empty">Le registre n’a pas pu être chargé.</p>
            : <>
              {!filtered.length && !editor && (query || year || !canWrite) ? <div className="medical-empty"><HeartPulse size={28} aria-hidden="true" /><h3>{query || year ? 'Aucune entrée ne correspond aux filtres.' : 'Aucune entrée médicale'}</h3><p>{query || year ? 'Modifiez la recherche ou l’année pour retrouver une entrée.' : 'Aucune entrée enregistrée pour ce navire.'}</p></div> : null}
              <div className="medical-table-scroll" role="region" aria-label="Tableau du registre médical" tabIndex={0}>
                <table className="medical-table">
                  <caption className="medical-sr-only">Soins enregistrés pour {vessel?.name}. Les corrections précédentes restent dans l’historique.</caption>
                  <thead><tr><th scope="col">Date</th><th scope="col">Heure</th><th scope="col">Nom du patient</th><th scope="col">Blessure / Maladie</th><th scope="col">Traitement / Médicaments administrés</th><th scope="col">Secouriste</th><th scope="col">Signature</th><th scope="col">Actions</th></tr></thead>
                  <tbody>
                    {readyRow}
                    {filtered.map((entry) => editor?.entry?.id === entry.id ? inlineEditor : <tr key={entry.id} className={entry.archived ? 'is-archived' : ''}>
                    <td>{formatMedicalDate(entry.occurred_on)}</td><td>{entry.occurred_time.slice(0, 5)}</td>
                    <td><strong>{entry.patient_name}</strong>{entry.archived ? <span className="medical-archived-label">Archivée</span> : null}</td>
                    <td className="medical-narrative">{entry.injury_illness}</td><td className="medical-narrative">{entry.treatment_medicines}</td><td>{entry.first_aider_name}</td>
                    <td><MedicalSignaturePreview signature={entry.signature_snapshot} url={signatureUrls.get(entry.signature_snapshot.signature_id)} loading={signaturesLoading} unavailable={signatureFailures.has(entry.signature_snapshot.signature_id)} /></td>
                    <td><div className="medical-row-actions">
                      {canWrite && !entry.archived ? <button ref={(node) => { if (node) rowActionRefs.current.set(entry.id, node); else rowActionRefs.current.delete(entry.id); }} className="sp-button sp-button--secondary" disabled={interactionBlocked} type="button" aria-label={`Modifier l’entrée de ${entry.patient_name}`} onClick={() => startEntry(entry)}><Pencil size={15} aria-hidden="true" />Modifier</button> : null}
                      <button className="sp-button sp-button--secondary" disabled={interactionBlocked} type="button" aria-label={`Historique de l’entrée de ${entry.patient_name}`} onClick={() => void openHistory(entry)}><History size={15} aria-hidden="true" />Historique</button>
                      {canWrite ? <button className="sp-button sp-button--secondary" disabled={interactionBlocked} type="button" aria-label={`${entry.archived ? 'Restaurer' : 'Archiver'} l’entrée de ${entry.patient_name}`} onClick={() => { setActionError(''); setArchiveTarget({ entry, archived: !entry.archived, accessScope }); }}>{entry.archived ? <RotateCcw size={15} aria-hidden="true" /> : <Archive size={15} aria-hidden="true" />}{entry.archived ? 'Restaurer' : 'Archiver'}</button> : null}
                    </div></td>
                  </tr>)}</tbody>
                </table>
              </div>
            </>}
      {loaded && !canWrite ? <p className="medical-readonly-note">Vous pouvez consulter le registre de ce navire.</p> : null}
    </section>
    {archiveTarget ? <AppDialog title={archiveTarget.archived ? 'Archiver cette entrée ?' : 'Restaurer cette entrée ?'} size="sm" isBusy={busy} onClose={() => { if (!busy) { setArchiveTarget(null); setActionError(''); } }}
      description={archiveTarget.archived ? 'L’entrée sera retirée du registre actif. Elle restera accessible dans les archives avec toutes ses versions.' : 'L’entrée réapparaîtra dans le registre actif. Son historique sera conservé.'}
      footer={<div className="app-dialog__actions"><button className="sp-button sp-button--secondary" disabled={busy} type="button" onClick={() => { setArchiveTarget(null); setActionError(''); }}>Annuler</button><button className="sp-button sp-button--primary" disabled={busy} type="button" onClick={() => void archiveEntry()}>{busy ? 'Enregistrement…' : archiveTarget.archived ? 'Archiver l’entrée' : 'Restaurer l’entrée'}</button></div>}>
      <p><strong>{archiveTarget.entry.patient_name}</strong> · {formatMedicalDate(archiveTarget.entry.occurred_on)} · {archiveTarget.entry.occurred_time.slice(0, 5)}</p>
      {actionError ? <p className="medical-error" role="alert">{actionError}</p> : null}
    </AppDialog> : null}
    {history ? <AppDialog title="Historique de l’entrée médicale" eyebrow={history.entry.patient_name} size="lg" onClose={() => { historyRequest.current += 1; setHistory(null); }}
      description="Chaque création, correction, archivage et restauration conserve une version du registre.">
      {history.loading ? <p role="status">Chargement de l’historique…</p> : history.error ? <div className="medical-feedback"><p className="medical-error" role="alert">{history.error}</p><button className="sp-button sp-button--secondary" type="button" onClick={() => void openHistory(history.entry)}>Réessayer l’historique</button></div> : !history.rows.length ? <p>Aucune version disponible.</p> : <ol className="medical-history-list">{history.rows.map((row) => <li key={row.id}><header><strong>{HISTORY_ACTIONS[row.action]} · Version {row.revision}</strong><span>{changedAt(row.changed_at)} · {row.actor_name || 'Utilisateur autorisé'}</span></header><MedicalEntryDetails entry={row.entry} signatureUrl={signatureUrls.get(row.entry.signature_snapshot.signature_id)} signatureLoading={signaturesLoading} signatureUnavailable={signatureFailures.has(row.entry.signature_snapshot.signature_id)} /></li>)}</ol>}
    </AppDialog> : null}
  </section>;
}
