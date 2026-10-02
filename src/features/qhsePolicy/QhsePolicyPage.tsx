import type { SupabaseClient } from '@supabase/supabase-js';
import { Archive, ArchiveRestore, CalendarDays, ChevronDown, Download, History, Pencil, Plus, RefreshCw, Target, UserRound } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useOutletContext } from 'react-router-dom';
import { AppDialog } from '../../components/AppDialog';
import type { AppShellOutletContext } from '../shell/AppShell';
import { QhsePolicyDocument } from './QhsePolicyDocument';
import type { QhsePolicyAttachment, QhsePolicyObjective, QhsePolicyObjectiveDraft, QhsePolicyObjectiveUpdate, QhsePolicyProcess, QhsePolicySnapshot } from './qhsePolicyModel';
import { fetchQhsePolicyOwnerOptions, fetchQhsePolicySnapshot, saveQhsePolicyObjective, saveQhsePolicyProcess, setQhsePolicyObjectiveArchived, setQhsePolicyProcessArchived } from './qhsePolicyQueries';
import { saveQhsePolicyObjectiveUpdateWithAttachments } from './qhsePolicyAttachments';
import { downloadQhsePolicyFile, QhsePolicyAttachmentList, QhsePolicyFilePicker } from './QhsePolicyAttachmentControls';
import { orderQhsePolicyUpdates, qhsePolicyDate, qhsePolicyError, qhsePolicyPercent, qhsePolicyTimestamp, qhsePolicyToday, summarizeQhsePolicyObjectives } from './qhsePolicyPresentation';
import './qhsePolicy.css';

type Editor = { kind: 'process'; process?: QhsePolicyProcess } | { kind: 'processArchive'; process: QhsePolicyProcess } | { kind: 'objective'; objective?: QhsePolicyObjective; processId: string } | { kind: 'update'; objective: QhsePolicyObjective } | { kind: 'archive'; objective: QhsePolicyObjective };
interface PolicyScope { client: SupabaseClient; roleKey: string }
type Feedback = { scope: PolicyScope; error: boolean; message: string } | null;

function ObjectiveRow({ client, scopeKey, objective, updates, attachmentsByUpdate, canEdit, busy, onEdit, onUpdate, onArchive }: {
  client: SupabaseClient; scopeKey: string; attachmentsByUpdate: Map<string, QhsePolicyAttachment[]>;
  objective: QhsePolicyObjective; updates: QhsePolicyObjectiveUpdate[]; canEdit: boolean; busy: boolean;
  onEdit: () => void; onUpdate: () => void; onArchive: () => void;
}) {
  const history = orderQhsePolicyUpdates(updates);
  return <article className={`qhse-policy-objective${objective.archived ? ' is-archived' : ''}`} aria-label={`Objectif ${objective.title}`}>
    <div className="qhse-policy-objective__row"><div className="qhse-policy-objective__copy"><h3>{objective.title}{objective.archived ? <span className="qhse-policy-badge">Archivé</span> : null}</h3><p><span><UserRound size={14} aria-hidden="true" />{objective.ownerLabel || 'Responsable à préciser'}</span><span><CalendarDays size={14} aria-hidden="true" />{objective.dueOn ? `Échéance : ${qhsePolicyDate(objective.dueOn)}` : 'Sans échéance'}</span></p></div><div className="qhse-policy-objective__progress"><strong>{qhsePolicyPercent(objective.progress)}</strong><progress max={100} value={objective.progress} aria-label={`Progression de ${objective.title}`} /></div></div>
    <details className="qhse-policy-objective__details"><summary><History size={15} aria-hidden="true" />Détails et suivi<ChevronDown size={15} aria-hidden="true" /></summary><div className="qhse-policy-objective__body">
      {objective.description ? <p className="qhse-policy-objective__description">{objective.description}</p> : null}
      {canEdit ? <div className="qhse-policy-objective__actions">{!objective.archived ? <><button type="button" disabled={busy} onClick={onEdit}><Pencil size={14} aria-hidden="true" />Modifier l’objectif</button><button type="button" disabled={busy} onClick={onUpdate}><Plus size={14} aria-hidden="true" />Ajouter un suivi</button></> : null}<button type="button" disabled={busy} onClick={onArchive}>{objective.archived ? <ArchiveRestore size={14} aria-hidden="true" /> : <Archive size={14} aria-hidden="true" />}{objective.archived ? 'Réactiver l’objectif' : 'Archiver l’objectif'}</button></div> : null}
      <h4>Historique de progression</h4>
      {history.length ? <ol className="qhse-policy-history">{history.map((update) => <li key={update.id}><div><time dateTime={update.occurredOn}>{qhsePolicyDate(update.occurredOn)}</time><strong>{qhsePolicyPercent(update.progress)}</strong><span>{update.kind === 'initial' ? 'Initialisation' : 'Suivi'}</span></div>{update.note ? <p>{update.note}</p> : null}<small>Ajouté le {qhsePolicyTimestamp(update.createdAt)} par {update.actorName || 'Utilisateur'}</small>{update.ownerLabel ? <small>Responsable au moment du suivi : {update.ownerLabel}</small> : null}<QhsePolicyAttachmentList client={client} scopeKey={scopeKey} attachments={attachmentsByUpdate.get(update.id) ?? []} /></li>)}</ol> : <p className="qhse-policy-muted">Aucun suivi enregistré.</p>}
      {canEdit && !objective.archived ? <p className="qhse-policy-history__hint">Pour corriger une progression, ajoutez un suivi. Les entrées précédentes restent dans l’historique.</p> : null}
    </div></details>
  </article>;
}

function DialogActions({ saving, disabled = false, onClose, label = 'Enregistrer' }: { saving: boolean; disabled?: boolean; onClose: () => void; label?: string }) {
  return <div className="app-dialog__actions"><button type="button" className="is-secondary" disabled={saving} onClick={onClose}>Annuler</button><button type="submit" className="is-primary" disabled={saving || disabled}>{saving ? 'Enregistrement…' : label}</button></div>;
}

function ProcessEditor({ process, saving, error, onClose, onSave }: {
  process?: QhsePolicyProcess; saving: boolean; error: string; onClose: () => void;
  onSave: (draft: { name: string; description: string }) => void;
}) {
  const [name, setName] = useState(process?.name ?? '');
  const [description, setDescription] = useState(process?.description ?? '');
  return <div className="qhse-policy-dialog"><AppDialog title={process ? 'Modifier le processus' : 'Ajouter un processus'} icon={<Target size={20} aria-hidden="true" />} isBusy={saving} onClose={onClose} onSubmit={(event) => { event.preventDefault(); onSave({ name, description }); }} footer={<DialogActions saving={saving} onClose={onClose} />} size="md">
    {error ? <p className="qhse-policy-feedback is-error" role="alert">{error}</p> : null}<fieldset disabled={saving} className="qhse-policy-fields"><label>Nom du processus<input required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} /></label><label>Description (facultatif)<textarea rows={3} maxLength={5000} value={description} onChange={(event) => setDescription(event.target.value)} /></label></fieldset>
  </AppDialog></div>;
}

function ObjectiveEditor({ client, objective, processId, processes, saving, error, onClose, onSave }: {
  client: SupabaseClient; objective?: QhsePolicyObjective; processId: string; processes: QhsePolicyProcess[]; saving: boolean; error: string; onClose: () => void;
  onSave: (draft: QhsePolicyObjectiveDraft) => void;
}) {
  const [draft, setDraft] = useState(() => ({
    processId: objective?.processId ?? processId, title: objective?.title ?? '', description: objective?.description ?? '',
    ownerKind: objective ? objective.ownerKind ?? 'legacy' : 'person', ownerLabel: objective?.ownerLabel ?? '',
    ownerPersonId: objective?.ownerPersonId ? String(objective.ownerPersonId) : '', ownerVesselId: objective?.ownerVesselId ? String(objective.ownerVesselId) : '',
    dueOn: objective?.dueOn ?? '', initialProgress: '0',
  }));
  const [options, setOptions] = useState<Awaited<ReturnType<typeof fetchQhsePolicyOwnerOptions>> | null>(null);
  const [optionsError, setOptionsError] = useState('');
  const [optionsRevision, setOptionsRevision] = useState(0);
  useEffect(() => {
    let active = true;
    void fetchQhsePolicyOwnerOptions(client).then((value) => { if (active) { setOptions(value); setOptionsError(''); } })
      .catch((reason: unknown) => { if (active) setOptionsError(qhsePolicyError(reason, 'Impossible de charger les responsables.')); });
    return () => { active = false; };
  }, [client, optionsRevision]);
  const change = (key: keyof typeof draft, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!options || saving) return;
    const ownerKind = draft.ownerKind === 'legacy' ? null : draft.ownerKind as 'person' | 'vessel' | 'office';
    onSave({
      processId: draft.processId, title: draft.title, description: draft.description, dueOn: draft.dueOn || null,
      ownerKind, ownerPersonId: ownerKind === 'person' ? Number(draft.ownerPersonId) : null, ownerVesselId: ownerKind === 'vessel' ? Number(draft.ownerVesselId) : null,
      ownerLabel: ownerKind === 'office' || !ownerKind ? draft.ownerLabel : '',
      ...(!objective ? { initialProgress: Number(draft.initialProgress) } : {}),
    });
  }
  return <div className="qhse-policy-dialog"><AppDialog title={objective ? 'Modifier l’objectif' : 'Ajouter un objectif'} icon={<Target size={20} aria-hidden="true" />} isBusy={saving} onClose={onClose} onSubmit={submit} footer={<div className="app-dialog__actions"><button type="button" className="is-secondary" disabled={saving} onClick={onClose}>Annuler</button><button type="submit" className="is-primary" disabled={saving || !options}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button></div>} size="lg">
    {error ? <p className="qhse-policy-feedback is-error" role="alert">{error}</p> : null}
    {optionsError ? <p className="qhse-policy-feedback is-error" role="alert">{optionsError} <button type="button" onClick={() => { setOptionsError(''); setOptionsRevision((value) => value + 1); }}>Réessayer</button></p> : !options ? <p role="status" className="qhse-policy-muted">Chargement des responsables…</p> : null}
    <fieldset disabled={saving} className="qhse-policy-fields">
      <label>Processus<select required value={draft.processId} onChange={(event) => change('processId', event.target.value)}><option value="">Choisir un processus</option>{processes.filter((process) => !process.archived).map((process) => <option key={process.id} value={process.id}>{process.name}</option>)}</select></label>
      <label>Intitulé de l’objectif<input required maxLength={250} value={draft.title} onChange={(event) => change('title', event.target.value)} /></label>
      <label>Description (facultatif)<textarea rows={3} maxLength={10000} value={draft.description} onChange={(event) => change('description', event.target.value)} /></label>
      <div className="qhse-policy-fields__pair">
        <label>Type de responsable<select value={draft.ownerKind} onChange={(event) => change('ownerKind', event.target.value)}>{objective && !objective.ownerKind ? <option value="legacy">Responsable actuel</option> : null}<option value="person">Personnel en poste</option><option value="vessel">Équipage d’un navire</option><option value="office">Bureau</option></select></label>
        {draft.ownerKind === 'person' ? <label>Collaborateur responsable<select required disabled={!options} value={draft.ownerPersonId} onChange={(event) => change('ownerPersonId', event.target.value)}><option value="">Choisir un collaborateur</option>{objective?.ownerKind === 'person' && objective.ownerPersonId && !options?.people.some((person) => person.id === objective.ownerPersonId) ? <option value={objective.ownerPersonId}>{objective.ownerLabel} (responsable actuel)</option> : null}{options?.people.map((person) => <option key={person.id} value={person.id}>{person.label}</option>)}</select></label>
          : draft.ownerKind === 'vessel' ? <label>Navire responsable<select required disabled={!options} value={draft.ownerVesselId} onChange={(event) => change('ownerVesselId', event.target.value)}><option value="">Choisir un navire</option>{objective?.ownerKind === 'vessel' && objective.ownerVesselId && !options?.vessels.some((vessel) => vessel.id === objective.ownerVesselId) ? <option value={objective.ownerVesselId}>{objective.ownerLabel} (responsable actuel)</option> : null}{options?.vessels.map((vessel) => <option key={vessel.id} value={vessel.id}>{vessel.label}</option>)}</select></label>
            : draft.ownerKind === 'office' ? <label>Bureau responsable<input required maxLength={200} placeholder="Armement - Cherbourg" value={draft.ownerLabel} onChange={(event) => change('ownerLabel', event.target.value)} /></label>
              : <div className="qhse-policy-owner-current"><strong>Responsable actuel</strong><span>{draft.ownerLabel || 'Responsable à préciser'}</span></div>}
      </div>
      <div className="qhse-policy-fields__pair"><label>Échéance (facultatif)<input type="date" min="1900-01-01" max="2100-12-31" value={draft.dueOn} onChange={(event) => change('dueOn', event.target.value)} /></label>{!objective ? <label>Progression initiale (%)<input required type="number" min={0} max={100} step="0.01" value={draft.initialProgress} onChange={(event) => change('initialProgress', event.target.value)} /></label> : null}</div>
      {objective ? <p className="qhse-policy-muted">La progression se met à jour en ajoutant un suivi.</p> : null}
    </fieldset>
  </AppDialog></div>;
}

function UpdateEditor({ objective, saving, error, onClose, onSave }: {
  objective: QhsePolicyObjective; saving: boolean; error: string; onClose: () => void;
  onSave: (draft: { progress: number; occurredOn: string; note: string }, files: File[]) => void;
}) {
  const [progress, setProgress] = useState(String(objective.progress));
  const [occurredOn, setOccurredOn] = useState(qhsePolicyToday);
  const [note, setNote] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState('');
  return <div className="qhse-policy-dialog"><AppDialog title="Ajouter un suivi" description={objective.title} icon={<History size={20} aria-hidden="true" />} isBusy={saving} onClose={onClose} onSubmit={(event) => { event.preventDefault(); if (!saving && !fileError) onSave({ progress: Number(progress), occurredOn, note }, files); }} footer={<DialogActions saving={saving} disabled={Boolean(fileError)} onClose={onClose} label="Enregistrer le suivi" />} size="lg">
    {error || fileError ? <p className="qhse-policy-feedback is-error" role="alert">{error || fileError}</p> : null}<fieldset disabled={saving} className="qhse-policy-fields"><div className="qhse-policy-fields__pair"><label>Date du suivi<input required type="date" min="1900-01-01" max={qhsePolicyToday()} value={occurredOn} onChange={(event) => setOccurredOn(event.target.value)} /></label><label>Progression (%)<input required type="number" min={0} max={100} step="0.01" value={progress} onChange={(event) => setProgress(event.target.value)} /></label></div><label>Note de suivi<textarea required rows={4} maxLength={10000} value={note} onChange={(event) => setNote(event.target.value)} /></label><QhsePolicyFilePicker files={files} onChange={setFiles} onError={setFileError} busy={saving} /><p className="qhse-policy-muted">Le suivi conserve sa date, son auteur et ses pièces jointes dans l’historique.</p></fieldset>
  </AppDialog></div>;
}

export function QhsePolicyPage() {
  const { client, roles } = useOutletContext<AppShellOutletContext>();
  const roleKey = [...roles].sort().join('|');
  const scope = useMemo<PolicyScope>(() => ({ client, roleKey }), [client, roleKey]);
  const scopeRef = useRef(scope);
  useEffect(() => { scopeRef.current = scope; }, [scope]);
  const [revision, setRevision] = useState(0);
  const [load, setLoad] = useState<{ scope: PolicyScope; revision: number; snapshot: QhsePolicySnapshot | null; error: string } | null>(null);
  const [editor, setEditor] = useState<(Editor & { scope: PolicyScope }) | null>(null);
  const [savingScope, setSavingScope] = useState<PolicyScope | null>(null);
  const savingRef = useRef<PolicyScope | null>(null);
  const saving = savingScope === scope;
  const [exportScope, setExportScope] = useState<PolicyScope | null>(null);
  const exportRef = useRef<PolicyScope | null>(null);
  const exporting = exportScope === scope;
  const [storedFeedback, setFeedback] = useState<Feedback>(null);
  const feedback = storedFeedback?.scope === scope ? storedFeedback : null;
  const [processFilter, setProcessFilter] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const current = load?.scope === scope && load.revision === revision ? load : null;
  const snapshot = load?.scope === scope ? load.snapshot : null;
  const canEdit = Boolean(snapshot?.canEdit && roles.some((role) => role === 'admin' || role === 'direction'));
  const busy = saving || exporting || !current || Boolean(current.error);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    let active = true;
    void fetchQhsePolicySnapshot(client).then((value) => { if (active) setLoad({ scope, revision, snapshot: value, error: '' }); })
      .catch((error: unknown) => { if (active) setLoad((previous) => ({ scope, revision, snapshot: previous?.scope === scope ? previous.snapshot : null, error: qhsePolicyError(error, 'Impossible de charger les objectifs QHSE.') })); });
    return () => { active = false; };
  }, [client, scope, revision]);
  const processes = [...(snapshot?.processes ?? [])].sort((left, right) => left.position - right.position || left.name.localeCompare(right.name, 'fr'));
  const effectiveProcessFilter = processes.some((process) => process.id === processFilter && (!process.archived || showArchived)) ? processFilter : '';
  const visibleProcesses = processes.filter((process) => (!process.archived || showArchived) && (!effectiveProcessFilter || process.id === effectiveProcessFilter));
  const activeProcessIds = new Set(processes.filter((process) => !process.archived).map((process) => process.id));
  const summary = summarizeQhsePolicyObjectives(snapshot?.objectives ?? [], processes);
  const objectiveUpdates = new Map<string, QhsePolicyObjectiveUpdate[]>();
  const attachmentsByUpdate = new Map<string, QhsePolicyAttachment[]>();
  snapshot?.updates.forEach((update) => {
    const values = objectiveUpdates.get(update.objectiveId) ?? [];
    values.push(update); objectiveUpdates.set(update.objectiveId, values);
  });
  snapshot?.attachments.forEach((attachment) => {
    const values = attachmentsByUpdate.get(attachment.updateId) ?? [];
    values.push(attachment); attachmentsByUpdate.set(attachment.updateId, values);
  });

  function openEditor(value: Editor) { if (!canEdit || busy) return; setFeedback(null); setEditor({ ...value, scope }); }
  function closeEditor() { if (!saving) { setEditor(null); setFeedback(null); } }
  async function mutate(work: () => Promise<unknown>, message: string) {
    if (!canEdit || busy || savingRef.current === scope) return;
    savingRef.current = scope; setSavingScope(scope); setFeedback(null);
    try {
      await work();
      if (scopeRef.current !== scope) return;
      setEditor(null); setFeedback({ scope, error: false, message }); reload();
    } catch (error) {
      if (scopeRef.current === scope) setFeedback({ scope, error: true, message: qhsePolicyError(error, 'Impossible d’enregistrer cette modification.') });
    } finally { if (savingRef.current === scope) savingRef.current = null; setSavingScope((value) => value === scope ? null : value); }
  }
  async function exportPdf() {
    if (!snapshot || busy || exportRef.current === scope || editor?.scope === scope) return;
    exportRef.current = scope; setExportScope(scope); setFeedback(null);
    try {
      const [{ buildQhsePolicyExport }, { readQhsePolicyDocument }, { readQhsePolicyAttachment }] = await Promise.all([
        import('./qhsePolicyExport'), import('./qhsePolicyFiles'), import('./qhsePolicyAttachments'),
      ]);
      if (scopeRef.current !== scope) return;
      const policy = await readQhsePolicyDocument(client, snapshot.settings);
      if (scopeRef.current !== scope) return;
      const generated = await buildQhsePolicyExport({
        snapshot, policy,
        readAttachment: async (attachment) => {
          if (scopeRef.current !== scope) throw new Error('Export annulé après le changement de profil.');
          const blob = await readQhsePolicyAttachment(client, attachment);
          if (scopeRef.current !== scope) throw new Error('Export annulé après le changement de profil.');
          return blob;
        },
      });
      if (scopeRef.current !== scope) return;
      downloadQhsePolicyFile(generated.blob, generated.fileName);
      setFeedback({ scope, error: false, message: 'PDF préparé. Le téléchargement a démarré.' });
    } catch (reason: unknown) {
      if (scopeRef.current === scope) setFeedback({ scope, error: true, message: qhsePolicyError(reason, 'Impossible de préparer le PDF complet.') });
    } finally {
      if (exportRef.current === scope) exportRef.current = null;
      setExportScope((value) => value === scope ? null : value);
    }
  }
  const error = feedback?.error ? feedback.message : '';
  const activeEditor = canEdit && editor?.scope === scope ? editor : null;
  return <main className="qhse-policy-page">
    <header className="qhse-policy-page__header"><div><h1>Politique QHSE</h1><p>Consultez la politique et suivez la réalisation des objectifs par processus.</p></div><div className="qhse-policy-page__actions"><button type="button" className="qhse-policy-button is-secondary" disabled={busy || !snapshot || Boolean(activeEditor)} onClick={() => void exportPdf()}><Download size={16} aria-hidden="true" />Exporter le PDF</button><button type="button" className="qhse-policy-button is-secondary" disabled={saving || exporting || !current} onClick={reload}><RefreshCw size={16} aria-hidden="true" />Actualiser</button></div></header>
    {exporting ? <p role="status" className="qhse-policy-loading">Préparation du PDF complet : politique, objectifs, suivis et pièces jointes…</p> : null}
    {!current ? <p className="qhse-policy-loading" role="status">Chargement de la politique et des objectifs…</p> : current.error ? <p className="qhse-policy-feedback is-error" role="alert">{current.error} <button type="button" onClick={reload}>Réessayer</button></p> : null}
    {feedback && !activeEditor ? <p className={`qhse-policy-feedback${feedback.error ? ' is-error' : ' is-success'}`} role={feedback.error ? 'alert' : 'status'}>{feedback.message}</p> : null}
    {snapshot ? <>
      <section id="politique" className="qhse-policy-document-section"><QhsePolicyDocument client={client} canEdit={canEdit && !busy} settings={snapshot.settings} onSaved={reload} /></section>
      <section className="qhse-policy-objectives" aria-label="Objectifs QHSE"><div className="qhse-policy-objectives__heading"><div><h2>Objectifs par processus</h2><p className="qhse-policy-summary">{summary.total ? <><strong>{summary.completed}/{summary.total}</strong> objectifs réalisés<span aria-hidden="true"> · </span>Progression moyenne : <strong>{qhsePolicyPercent(summary.average ?? 0)}</strong></> : 'Aucun objectif actif.'}</p></div>{canEdit ? <div className="qhse-policy-page__actions"><button className="qhse-policy-button is-secondary" type="button" disabled={busy} onClick={() => openEditor({ kind: 'process' })}><Plus size={16} aria-hidden="true" />Ajouter un processus</button><button className="qhse-policy-button" type="button" disabled={busy || !activeProcessIds.size} onClick={() => openEditor({ kind: 'objective', processId: activeProcessIds.has(effectiveProcessFilter) ? effectiveProcessFilter : processes.find((process) => !process.archived)?.id ?? '' })}><Plus size={16} aria-hidden="true" />Ajouter un objectif</button></div> : null}</div>
        <div className="qhse-policy-filters"><label>Processus<select value={effectiveProcessFilter} onChange={(event) => setProcessFilter(event.target.value)}><option value="">Tous les processus</option>{processes.filter((process) => !process.archived || showArchived).map((process) => <option key={process.id} value={process.id}>{process.name}{process.archived ? ' (archivé)' : ''}</option>)}</select></label><label className="qhse-policy-checkbox"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />Afficher les archives</label></div>
        {!processes.length ? <p className="qhse-policy-empty">Aucun processus défini.{canEdit ? ' Ajoutez un processus pour y rattacher vos objectifs.' : ''}</p> : !visibleProcesses.length ? <p className="qhse-policy-empty">Aucun processus ne correspond à ce filtre.</p> : visibleProcesses.map((process) => {
          const objectives = snapshot.objectives.filter((objective) => objective.processId === process.id && (!objective.archived || showArchived));
          return <section className="qhse-policy-process" key={process.id} aria-label={`Processus ${process.name}`}><header><div><h3>{process.name}{process.archived ? <span className="qhse-policy-badge">Archivé</span> : null}</h3>{process.description ? <p>{process.description}</p> : null}</div>{canEdit ? <div>{!process.archived ? <><button type="button" className="qhse-policy-icon-button" disabled={busy} aria-label={`Modifier le processus ${process.name}`} onClick={() => openEditor({ kind: 'process', process })}><Pencil size={16} aria-hidden="true" /></button><button type="button" className="qhse-policy-button is-secondary" disabled={busy} onClick={() => openEditor({ kind: 'objective', processId: process.id })}><Plus size={15} aria-hidden="true" />Ajouter un objectif</button></> : null}<button type="button" className="qhse-policy-icon-button" disabled={busy} aria-label={`${process.archived ? 'Réactiver' : 'Archiver'} le processus ${process.name}`} onClick={() => openEditor({ kind: 'processArchive', process })}>{process.archived ? <ArchiveRestore size={16} aria-hidden="true" /> : <Archive size={16} aria-hidden="true" />}</button></div> : null}</header>{objectives.length ? <div className="qhse-policy-process__objectives">{objectives.map((objective) => <ObjectiveRow key={objective.id} client={client} scopeKey={roleKey} attachmentsByUpdate={attachmentsByUpdate} objective={objective} updates={objectiveUpdates.get(objective.id) ?? []} canEdit={canEdit && !process.archived} busy={busy} onEdit={() => openEditor({ kind: 'objective', objective, processId: process.id })} onUpdate={() => openEditor({ kind: 'update', objective })} onArchive={() => openEditor({ kind: 'archive', objective })} />)}</div> : <p className="qhse-policy-process__empty">Aucun objectif {showArchived ? '' : 'actif '}dans ce processus.</p>}</section>;
        })}
      </section>
    </> : null}
    {activeEditor?.kind === 'process' ? <ProcessEditor key={activeEditor.process?.id ?? 'new-process'} process={activeEditor.process} saving={saving} error={error} onClose={closeEditor} onSave={(draft) => void mutate(() => saveQhsePolicyProcess(client, { ...draft, ...(activeEditor.process ? { id: activeEditor.process.id, position: activeEditor.process.position, expectedRevision: activeEditor.process.revision } : { position: Math.min(100000, Math.max(-1, ...processes.map((process) => process.position)) + 1) }) }), 'Processus enregistré.')} /> : null}
    {activeEditor?.kind === 'objective' ? <ObjectiveEditor key={activeEditor.objective?.id ?? `new-objective-${activeEditor.processId}`} client={client} objective={activeEditor.objective} processId={activeEditor.processId} processes={processes} saving={saving} error={error} onClose={closeEditor} onSave={(draft) => void mutate(() => saveQhsePolicyObjective(client, { ...draft, ...(activeEditor.objective ? { id: activeEditor.objective.id, expectedRevision: activeEditor.objective.revision } : {}) }), 'Objectif enregistré.')} /> : null}
    {activeEditor?.kind === 'update' ? <UpdateEditor key={activeEditor.objective.id} objective={activeEditor.objective} saving={saving} error={error} onClose={closeEditor} onSave={(draft, files) => void mutate(() => saveQhsePolicyObjectiveUpdateWithAttachments(client, { ...draft, objectiveId: activeEditor.objective.id, expectedRevision: activeEditor.objective.revision }, files), 'Suivi enregistré. L’historique est actualisé.')} /> : null}
    {activeEditor?.kind === 'archive' ? <div className="qhse-policy-dialog"><AppDialog title={activeEditor.objective.archived ? 'Réactiver cet objectif ?' : 'Archiver cet objectif ?'} description={activeEditor.objective.title} isBusy={saving} onClose={closeEditor} size="sm" footer={<div className="app-dialog__actions"><button type="button" className="is-secondary" disabled={saving} onClick={closeEditor}>Annuler</button><button type="button" className="is-primary" disabled={saving} onClick={() => void mutate(() => setQhsePolicyObjectiveArchived(client, activeEditor.objective.id, !activeEditor.objective.archived, activeEditor.objective.revision), activeEditor.objective.archived ? 'Objectif réactivé.' : 'Objectif archivé.')}>{activeEditor.objective.archived ? 'Réactiver l’objectif' : 'Archiver l’objectif'}</button></div>}>{error ? <p className="qhse-policy-feedback is-error" role="alert">{error}</p> : null}<p className="qhse-policy-muted">{activeEditor.objective.archived ? 'Cet objectif réapparaîtra dans les objectifs actifs.' : 'Son historique sera conservé et restera consultable parmi les objectifs archivés.'}</p></AppDialog></div> : null}
    {activeEditor?.kind === 'processArchive' ? <div className="qhse-policy-dialog"><AppDialog title={activeEditor.process.archived ? 'Réactiver ce processus ?' : 'Archiver ce processus ?'} description={activeEditor.process.name} isBusy={saving} onClose={closeEditor} size="sm" footer={<div className="app-dialog__actions"><button type="button" className="is-secondary" disabled={saving} onClick={closeEditor}>Annuler</button><button type="button" className="is-primary" disabled={saving} onClick={() => void mutate(() => setQhsePolicyProcessArchived(client, activeEditor.process.id, !activeEditor.process.archived, activeEditor.process.revision), activeEditor.process.archived ? 'Processus réactivé.' : 'Processus archivé.')}>{activeEditor.process.archived ? 'Réactiver le processus' : 'Archiver le processus'}</button></div>}>{error ? <p className="qhse-policy-feedback is-error" role="alert">{error}</p> : null}<p className="qhse-policy-muted">{activeEditor.process.archived ? 'Ce processus et ses objectifs actifs réapparaîtront dans le suivi.' : 'Ses objectifs et leur historique seront conservés. Le processus pourra être réactivé.'}</p></AppDialog></div> : null}
  </main>;
}
