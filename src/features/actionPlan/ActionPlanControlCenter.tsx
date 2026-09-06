import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Circle, Clock3,
  FileDown, FileImage, FileText, Filter, History, Info, LockKeyhole, MoreVertical, Pencil, Plus,
  RefreshCw, Search, ShieldCheck, Ship, Upload, UserRound, UsersRound, X,
} from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  fetchActionEvidenceUrls, isActionClosed, saveActionTypeAsAdmin, updateActionItemAsAdmin,
  type ActionFindingPhotoChanges, type ActionItemAdminUpdateInput, type ActionItemRecord,
  type ActionPlanData, type ActionPlanMetrics, type ActionTypeAdminInput, type ActionTypeCatalogRecord,
} from './actionPlanQueries';

export interface ActionPlanFilters {
  search: string;
  status: string;
  vessel: string;
  actionType: string;
  deviationType: string;
}

interface ControlCenterProps {
  client: SupabaseClient;
  data: ActionPlanData;
  actions: ActionItemRecord[];
  metrics: ActionPlanMetrics;
  filters: ActionPlanFilters;
  filterOptions: { vessels: string[]; actionTypes: string[]; deviationTypes: string[] };
  isAdmin: boolean;
  canCreate: boolean;
  previewMode: boolean;
  pdfActionId: number | null;
  onFilterChange(key: keyof ActionPlanFilters, value: string): void;
  onCreate(): void;
  onReload(): void;
  onApprove(action: ActionItemRecord): void;
  onTreat(action: ActionItemRecord): void;
  onActionSaved(action: ActionItemRecord): void;
  onTypeSaved(type: ActionTypeCatalogRecord): void;
  onExport(action: ActionItemRecord): void;
  canApprove(action: ActionItemRecord): boolean;
  canTreat(action: ActionItemRecord): boolean;
}

type ActionTone = 'pending' | 'overdue' | 'open' | 'closed';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function actionTone(action: ActionItemRecord): ActionTone {
  if (isActionClosed(action)) return 'closed';
  if (action.workflowStatus === 'pending_approval') return 'pending';
  if (action.dueOn && action.dueOn < todayIso()) return 'overdue';
  return 'open';
}

function actionStatus(action: ActionItemRecord): string {
  const tone = actionTone(action);
  if (tone === 'closed') return 'Soldé';
  if (tone === 'pending') return 'À approuver';
  if (tone === 'overdue') return 'En retard';
  return 'À traiter';
}

function formatDate(value: string, withTime = false): string {
  if (!value) return 'Non renseigné';
  if (withTime) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(date).replace(' à ', ' · ');
  }
  const [year, month, day] = value.slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function actionReference(action: ActionItemRecord): string {
  const year = (action.openedOn || action.occurredAt || todayIso()).slice(0, 4);
  return `PA-${year}-${String(action.id).padStart(5, '0')}`;
}

function display(value: string, fallback = 'Non renseigné'): string {
  return value || fallback;
}

function toLocalDateTime(value: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 16);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function Metric({ icon, label, value, detail, tone }: {
  icon: ReactNode; label: string; value: string | number; detail: string; tone: string;
}) {
  return <div className={`action-control-metric ${tone}`} aria-label={label}>
    <span>{icon}</span><div><small>{label}</small><strong>{value}</strong><em>{detail}</em></div>
  </div>;
}

function ActionQueueRow({ action, selected, onSelect }: {
  action: ActionItemRecord; selected: boolean; onSelect(): void;
}) {
  const tone = actionTone(action);
  return <button
    aria-pressed={selected}
    className={`action-control-queue-row is-${tone}${selected ? ' is-selected' : ''}`}
    onClick={onSelect}
    type="button"
  >
    <span className="action-control-row-icon">{tone === 'overdue' ? <AlertTriangle size={18} /> : tone === 'closed' ? <CheckCircle2 size={18} /> : <Clock3 size={18} />}</span>
    <span className="action-control-row-copy"><strong>{action.vesselName || 'Sans navire'}</strong><small>{action.actionType || action.auditType || 'Autre action'}</small><time dateTime={action.dueOn || undefined}>{formatDate(action.dueOn)}</time></span>
    <em>{actionStatus(action)}</em><ChevronRight size={17} />
  </button>;
}

function ActionQueue({ actions, selectedId, onSelect }: {
  actions: ActionItemRecord[]; selectedId: number | null; onSelect(id: number): void;
}) {
  const groups = useMemo(() => [
    { key: 'pending', label: 'À approuver', actions: actions.filter((action) => actionTone(action) === 'pending') },
    { key: 'overdue', label: 'En retard', actions: actions.filter((action) => actionTone(action) === 'overdue') },
    { key: 'open', label: 'À suivre', actions: actions.filter((action) => actionTone(action) === 'open') },
    { key: 'closed', label: 'Soldé', actions: actions.filter((action) => actionTone(action) === 'closed') },
  ].filter((group) => group.actions.length), [actions]);

  if (!actions.length) return <div className="action-control-empty">Aucun rapport ne correspond aux filtres.</div>;
  return <div className="action-control-queue-groups">
    {groups.map((group) => <details key={group.key} open>
      <summary><span>{group.label}</span><small>{group.actions.length}</small><ChevronDown size={16} /></summary>
      <div>{group.actions.map((action) => <ActionQueueRow action={action} key={action.id} onSelect={() => onSelect(action.id)} selected={selectedId === action.id} />)}</div>
    </details>)}
  </div>;
}

function WorkflowHistory({ action }: { action: ActionItemRecord }) {
  const closed = isActionClosed(action);
  return <section className="action-control-history" aria-labelledby="workflow-history-title">
    <h3 id="workflow-history-title"><History size={17} />Historique du workflow</h3>
    <ol>
      <li className="is-done"><span /><div><strong>Rapport créé</strong><time>{formatDate(action.approvalRequestedAt || action.occurredAt, true)}</time><small>{action.issuerName}</small></div></li>
      <li className={action.workflowStatus !== 'pending_approval' ? 'is-done' : 'is-current'}><span /><div><strong>{action.workflowStatus === 'pending_approval' ? 'À approuver' : 'Approuvé'}</strong><time>{action.approvedAt ? formatDate(action.approvedAt, true) : 'En attente'}</time><small>{action.workflowStatus === 'pending_approval' ? 'Soumis à Christophe MINASSIAN' : action.ownerName}</small></div></li>
      <li className={closed ? 'is-done' : action.workflowStatus === 'approved' ? 'is-current' : ''}><span /><div><strong>{closed ? 'Soldé' : 'Traitement'}</strong><time>{closed ? formatDate(action.closedOn) : action.workflowStatus === 'approved' ? 'En cours' : 'En attente'}</time><small>{action.realizedAction || action.comments || 'Aucune donnée de traitement enregistrée.'}</small></div></li>
    </ol>
  </section>;
}

function ActionDetail({ client, action, data, isAdmin, pdfActionId, onApprove, onTreat, onEdit, onExport, canApprove, canTreat }: {
  client: SupabaseClient; action: ActionItemRecord; data: ActionPlanData; isAdmin: boolean; pdfActionId: number | null;
  onApprove(): void; onTreat(): void; onEdit(): void; onExport(): void; canApprove: boolean; canTreat: boolean;
}) {
  const [evidence, setEvidence] = useState<string[]>(action.thumbnailUrl ? [action.thumbnailUrl] : []);
  useEffect(() => {
    let active = true;
    setEvidence(action.thumbnailUrl ? [action.thumbnailUrl] : []);
    void fetchActionEvidenceUrls(client, action).then((urls) => {
      if (active) setEvidence([urls.photo1Url, urls.photo2Url, urls.closurePhotoUrl].filter(Boolean));
    }).catch(() => undefined);
    return () => { active = false; };
  }, [action, client]);
  const assignees = data.assignees.filter((item) => item.actionItemId === action.id && item.displayName);
  const documents = data.documents.filter((document) => (
    document.actionItemId === action.id
    || (document.actionSharePointItemId && document.actionSharePointItemId === action.sourceItemId)
  ));
  const tone = actionTone(action);
  return <article className="action-control-detail">
    <header className="action-control-detail-header">
      <div><span className={`action-control-status is-${tone}`}>{actionStatus(action)}</span><small>Rapport #{actionReference(action)}</small></div>
      <time>Créé le {formatDate(action.openedOn || action.occurredAt)}</time>
      <div className="action-control-detail-title">
        {action.thumbnailUrl ? <img alt="Photo du constat" src={action.thumbnailUrl} /> : <span aria-hidden="true"><Ship size={24} /></span>}
        <div><strong>{action.vesselName || 'Sans navire'}</strong><h2>{action.title}</h2><p>{action.actionType || action.auditType}</p></div>
        <dl><dt>Échéance</dt><dd className={tone === 'overdue' ? 'is-overdue' : ''}>{formatDate(action.dueOn)}</dd><dt>Statut actuel</dt><dd><span className={`action-control-status is-${tone}`}>{actionStatus(action)}</span></dd></dl>
      </div>
    </header>

    <div className="action-control-detail-body">
      <div className="action-control-facts">
        <section>
          <header><h3><Info size={17} />Informations factuelles</h3>{isAdmin && <button className="is-secondary" onClick={onEdit} type="button"><Pencil size={15} />Modifier la fiche</button>}</header>
          <dl>
            <dt>Date et heure</dt><dd>{formatDate(action.occurredAt || action.openedOn, true)}</dd>
            <dt>Lieu</dt><dd>{display(action.locationDetail, action.vesselName)}</dd>
            <dt>Manœuvre</dt><dd>{display(action.vesselManeuver)}</dd>
            <dt>Météo</dt><dd>{display(action.weatherConditions)}</dd>
            <dt>Type d’évènement</dt><dd>{display(action.actionType)}</dd>
            {action.deviationType && <><dt>Type d’écart</dt><dd>{action.deviationType}</dd></>}
            <dt>Constat</dt><dd>{display(action.description, action.title)}</dd>
          </dl>
        </section>
        <section>
          <h3><ShieldCheck size={17} />Action corrective proposée</h3>
          <p>{display(action.correctiveAction, 'Aucune action proposée.')}</p>
          <dl><dt>Responsable</dt><dd>{display(action.ownerName, action.workflowStatus === 'pending_approval' ? 'À définir après approbation' : 'Non renseigné')}</dd><dt>Échéance</dt><dd>{formatDate(action.dueOn)}</dd><dt>Priorité</dt><dd>{display(action.priorityLabel, 'Normale')}</dd></dl>
        </section>
        <section>
          <h3><UsersRound size={17} />Personnes responsables</h3>
          <ul className="action-control-people">
            <li><UserRound size={17} /><span><small>Déclarant</small><strong>{display(action.issuerName)}</strong></span></li>
            {assignees.length ? assignees.map((assignee) => <li key={assignee.id}><UsersRound size={17} /><span><small>Responsable du traitement</small><strong>{assignee.displayName}</strong></span></li>) : <li><UsersRound size={17} /><span><small>Responsable du traitement</small><strong>{display(action.ownerName, 'À affecter')}</strong></span></li>}
            <li><ShieldCheck size={17} /><span><small>Approbateur</small><strong>Christophe MINASSIAN</strong></span></li>
          </ul>
        </section>
        <section>
          <h3><FileImage size={17} />Preuves et pièces jointes</h3>
          {evidence.length ? <div className="action-control-evidence">{evidence.map((url, index) => <a href={url} key={url} rel="noreferrer" target="_blank"><img alt={`Preuve ${index + 1}`} src={url} /></a>)}</div> : <p className="action-control-no-evidence">Aucune photo jointe.</p>}
          {documents.length > 0 && <div className="action-control-documents">{documents.map((document) => <a aria-label={`Ouvrir le fichier ${document.title}`} href={document.fileUrl} key={document.id} rel="noreferrer" target="_blank"><FileText size={18} /><span><strong>{document.title}</strong><small>Fiche de progrès</small></span><ChevronRight size={16} /></a>)}</div>}
        </section>
      </div>
      <WorkflowHistory action={action} />
    </div>

    <footer className="action-control-detail-actions">
      {canApprove && <button onClick={onApprove} type="button"><ShieldCheck size={16} />Approuver le rapport</button>}
      {canTreat && !isActionClosed(action) && <button onClick={onTreat} type="button"><CheckCircle2 size={16} />Traiter l’action</button>}
      <button className="is-secondary" disabled={pdfActionId === action.id} onClick={onExport} type="button"><FileDown size={16} />{pdfActionId === action.id ? 'Génération…' : 'Télécharger le PDF'}</button>
    </footer>
  </article>;
}

function TypeEditorDialog({ client, initial, onClose, onSaved }: {
  client: SupabaseClient; initial: ActionTypeCatalogRecord | null; onClose(): void; onSaved(type: ActionTypeCatalogRecord): void;
}) {
  const [form, setForm] = useState<ActionTypeAdminInput>(() => ({
    key: initial?.key, label: initial?.label || '', family: initial?.family || 'event',
    requiresDeviationType: initial?.requiresDeviationType || false, active: initial?.active ?? true,
    sortOrder: initial?.sortOrder ?? 1000,
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError('');
    try { onSaved(await saveActionTypeAsAdmin(client, form)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Impossible d’enregistrer ce type.'); }
    finally { setSaving(false); }
  }
  return <div className="action-plan-dialog-backdrop" role="presentation"><section className="action-plan-dialog action-control-editor" role="dialog" aria-modal="true" aria-labelledby="type-editor-title">
    <header><div><span>Administration</span><h2 id="type-editor-title">{initial ? 'Modifier le type d’évènement' : 'Ajouter un type d’évènement'}</h2></div><button aria-label="Fermer" onClick={onClose} type="button"><X size={21} /></button></header>
    <form onSubmit={submit}>
      <label>Libellé <b>*</b><input required maxLength={140} value={form.label} onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))} /></label>
      <div className="action-control-editor-grid">
        <label>Famille<select value={form.family} onChange={(event) => setForm((current) => ({ ...current, family: event.target.value as ActionTypeAdminInput['family'] }))}><option value="action">Action</option><option value="audit">Audit</option><option value="visit">Visite</option><option value="event">Évènement</option></select></label>
        <label>Ordre<input min="0" type="number" value={form.sortOrder} onChange={(event) => setForm((current) => ({ ...current, sortOrder: Number(event.target.value) }))} /></label>
      </div>
      <label className="action-control-check"><input checked={form.requiresDeviationType} onChange={(event) => setForm((current) => ({ ...current, requiresDeviationType: event.target.checked }))} type="checkbox" /><span><strong>Type d’écart obligatoire</strong><small>Le rapport ne pourra pas être créé sans qualification de l’écart.</small></span></label>
      <label className="action-control-check"><input checked={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} type="checkbox" /><span><strong>Type actif</strong><small>Un type désactivé reste visible dans l’historique mais n’est plus proposé à la création.</small></span></label>
      {initial?.hseClassification && <p className="action-control-impact"><AlertTriangle size={17} /><span><strong>Rattachement KPI protégé : {initial.hseClassification}</strong>Cette modification ne change pas sa classification KPI.</span></p>}
      {initial?.key === 'discrimination_human_rights' && <p className="action-control-impact is-confidential"><LockKeyhole size={17} /><span><strong>Accès restreint conservé</strong>Le workflow confidentiel ne peut pas être modifié depuis ce formulaire.</span></p>}
      {error && <p className="action-plan-message is-error">{error}</p>}
      <footer><button className="is-secondary" onClick={onClose} type="button">Annuler</button><button disabled={saving} type="submit">{saving ? 'Enregistrement…' : 'Enregistrer'}</button></footer>
    </form>
  </section></div>;
}

function TypeCatalogPanel({ client, types, onClose, onSaved }: {
  client: SupabaseClient; types: ActionTypeCatalogRecord[]; onClose(): void; onSaved(type: ActionTypeCatalogRecord): void;
}) {
  const [editing, setEditing] = useState<ActionTypeCatalogRecord | null | undefined>(undefined);
  const [error, setError] = useState('');
  const sortedTypes = useMemo(() => [...types].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'fr')), [types]);
  async function toggle(type: ActionTypeCatalogRecord) {
    setError('');
    try { onSaved(await saveActionTypeAsAdmin(client, { ...type, active: !type.active })); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Impossible de modifier ce type.'); }
  }
  return <aside className="action-control-types" aria-label="Gestion des types d’évènement">
    <header><div><span>Administration</span><h2>Gérer les types d’évènement</h2></div><button aria-label="Fermer la gestion des types" onClick={onClose} type="button"><X size={20} /></button></header>
    <p className="action-control-types-note"><Info size={18} />Le libellé, l’ordre et l’activation sont modifiables sans changer le KPI. Les rattachements KPI existants restent protégés.</p>
    {error && <p className="action-plan-message is-error">{error}</p>}
    <div className="action-control-types-head"><span>Libellé</span><span>Workflow</span><span>KPI</span><span>Actif</span><span /></div>
    <div className="action-control-types-list">{sortedTypes.map((type) => <div className={!type.active ? 'is-inactive' : ''} key={type.key}>
      <span><strong>{type.label}</strong>{type.key === 'discrimination_human_rights' && <small><LockKeyhole size={12} />Accès restreint</small>}{type.requiresDeviationType && <small>Écart obligatoire</small>}</span>
      <span>{type.key === 'discrimination_human_rights' ? 'Confidentiel' : 'Standard'}</span>
      <span>{type.hseClassification || (type.key === 'discrimination_human_rights' ? 'Social' : '—')}</span>
      <button aria-label={`${type.active ? 'Désactiver' : 'Activer'} ${type.label}`} className={`action-control-active${type.active ? ' is-active' : ''}`} onClick={() => void toggle(type)} type="button"><Circle size={16} fill="currentColor" /></button>
      <button aria-label={`Modifier ${type.label}`} className="action-control-more" onClick={() => setEditing(type)} type="button"><MoreVertical size={17} /></button>
    </div>)}</div>
    <footer><button onClick={() => setEditing(null)} type="button"><Plus size={16} />Ajouter un type d’évènement</button><small>Réservé au profil Administrateur.</small></footer>
    {editing !== undefined && <TypeEditorDialog client={client} initial={editing} onClose={() => setEditing(undefined)} onSaved={(type) => { onSaved(type); setEditing(undefined); }} />}
  </aside>;
}

function ActionEditDialog({ client, action, data, onClose, onSaved }: {
  client: SupabaseClient; action: ActionItemRecord; data: ActionPlanData; onClose(): void; onSaved(action: ActionItemRecord): void;
}) {
  const [form, setForm] = useState<ActionItemAdminUpdateInput>(() => ({
    title: action.title, issuerName: action.issuerName, vesselId: action.vesselId, vesselName: action.vesselName,
    actionTypeKey: action.actionTypeKey, actionType: action.actionType, deviationType: action.deviationType,
    occurredAt: toLocalDateTime(action.occurredAt || action.openedOn), dueOn: action.dueOn,
    vesselManeuver: action.vesselManeuver, weatherConditions: action.weatherConditions,
    description: action.description, correctiveAction: action.correctiveAction, lostDays: action.lostDays,
    correctionReason: '',
  }));
  const [photos, setPhotos] = useState<ActionFindingPhotoChanges>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const currentType = data.actionTypes.find((type) => type.key === action.actionTypeKey);
  const selectedType = data.actionTypes.find((type) => type.key === form.actionTypeKey);
  const kpiChanged = (currentType?.hseClassification || '') !== (selectedType?.hseClassification || '');
  const availableTypes = data.actionTypes.filter((type) => type.active || type.key === action.actionTypeKey);
  function update<K extends keyof ActionItemAdminUpdateInput>(key: K, value: ActionItemAdminUpdateInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError('');
    try { onSaved(await updateActionItemAsAdmin(client, action, form, photos)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Impossible de corriger cette fiche.'); }
    finally { setSaving(false); }
  }
  return <div className="action-plan-dialog-backdrop" role="presentation"><section className="action-plan-dialog action-control-edit-sheet" role="dialog" aria-modal="true" aria-labelledby="action-edit-title">
    <header><div><span>Correction administrateur</span><h2 id="action-edit-title">Modifier la fiche</h2><small>{actionReference(action)} · workflow inchangé : {actionStatus(action)}</small></div><button aria-label="Fermer" onClick={onClose} type="button"><X size={21} /></button></header>
    <form onSubmit={submit}>
      <section><h3><Info size={18} />Informations factuelles</h3><div className="action-control-form-grid">
        <label>Date et heure du constat <b>*</b><input required type="datetime-local" value={form.occurredAt} onChange={(event) => update('occurredAt', event.target.value)} /></label>
        <label>À traiter avant <b>*</b><input required type="date" value={form.dueOn} onChange={(event) => update('dueOn', event.target.value)} /></label>
        <label>Navire / lieu <b>*</b><select required value={form.vesselId || ''} onChange={(event) => { const vessel = data.vessels.find((item) => item.id === Number(event.target.value)); update('vesselId', vessel?.id || null); update('vesselName', vessel?.name || ''); }}><option value="">Sélectionner</option>{data.vessels.map((vessel) => <option key={vessel.id} value={vessel.id}>{vessel.name}</option>)}</select></label>
        <label>Type d’évènement <b>*</b><select required value={form.actionTypeKey} onChange={(event) => { const type = availableTypes.find((item) => item.key === event.target.value); update('actionTypeKey', type?.key || ''); update('actionType', type?.label || ''); if (!type?.requiresDeviationType) update('deviationType', ''); }}><option value="">Sélectionner</option>{availableTypes.map((type) => <option key={type.key} value={type.key}>{type.label}</option>)}</select></label>
        {selectedType?.requiresDeviationType && <label>Type d’écart <b>*</b><select required value={form.deviationType} onChange={(event) => update('deviationType', event.target.value)}><option value="">Sélectionner</option>{['Non Conformité Majeure', 'Non Conformité Mineure', 'Prescription', "Proposition d'Amélioration", 'Recommandation', 'Remarque', 'Remarque Positive'].map((value) => <option key={value}>{value}</option>)}</select></label>}
        <label>Jours d’arrêt<input min="0" step="0.5" type="number" value={form.lostDays} onChange={(event) => update('lostDays', Number(event.target.value))} /></label>
        <label className="is-wide">Manœuvre du navire<input value={form.vesselManeuver} onChange={(event) => update('vesselManeuver', event.target.value)} /></label>
        <label className="is-wide">Conditions météo<input value={form.weatherConditions} onChange={(event) => update('weatherConditions', event.target.value)} /></label>
      </div></section>
      <section><h3><ShieldCheck size={18} />Constat et action proposée</h3><label>Constat <b>*</b><textarea required value={form.title} onChange={(event) => update('title', event.target.value)} /></label><label>Description complémentaire<textarea value={form.description} onChange={(event) => update('description', event.target.value)} /></label><label>Action proposée <b>*</b><textarea required value={form.correctiveAction} onChange={(event) => update('correctiveAction', event.target.value)} /></label></section>
      <section><h3><Upload size={18} />Photos du constat</h3><div className="action-control-photo-editor">
        {[1, 2].map((index) => { const key = `photo${index}` as 'photo1' | 'photo2'; const removeKey = `removePhoto${index}` as 'removePhoto1' | 'removePhoto2'; const existing = index === 1 ? action.photo1Path : action.photo2Path; return <label key={index}><FileImage size={19} /><strong>Photo {index}</strong><small>{photos[key]?.name || (existing && !photos[removeKey] ? 'Photo actuelle conservée' : 'Aucune photo')}</small><input accept="image/*" type="file" onChange={(event) => setPhotos((current) => ({ ...current, [key]: event.target.files?.[0], [removeKey]: false }))} />{existing && <span><input checked={Boolean(photos[removeKey])} onChange={(event) => setPhotos((current) => ({ ...current, [removeKey]: event.target.checked, [key]: undefined }))} type="checkbox" />Retirer la photo actuelle</span>}</label>; })}
      </div></section>
      <section className="action-control-reason"><h3><History size={18} />Traçabilité</h3><label>Motif de la correction <b>*</b><textarea minLength={3} required value={form.correctionReason} onChange={(event) => update('correctionReason', event.target.value)} /></label><p><LockKeyhole size={16} />Le statut, les signatures, l’approbation, les responsables, le traitement et la clôture ne seront pas modifiés.</p>{kpiChanged && <p className="is-warning"><AlertTriangle size={16} />Ce changement de type modifiera le rattachement de cette fiche aux indicateurs KPI.</p>}</section>
      {error && <p className="action-plan-message is-error">{error}</p>}
      <footer><button className="is-secondary" onClick={onClose} type="button">Annuler</button><button disabled={saving} type="submit">{saving ? 'Enregistrement…' : 'Enregistrer la correction'}</button></footer>
    </form>
  </section></div>;
}

export function ActionPlanControlCenter(props: ControlCenterProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [typesOpen, setTypesOpen] = useState(props.previewMode && props.isAdmin);
  const [editAction, setEditAction] = useState<ActionItemRecord | null>(null);
  const selected = props.actions.find((action) => action.id === selectedId) || props.actions[0] || null;
  useEffect(() => {
    if (!props.actions.length) setSelectedId(null);
    else if (!props.actions.some((action) => action.id === selectedId)) setSelectedId(props.actions[0].id);
  }, [props.actions, selectedId]);
  const openCount = props.actions.filter((action) => !isActionClosed(action)).length;
  const pendingCount = props.actions.filter((action) => action.workflowStatus === 'pending_approval').length;
  return <>
    <header className="action-control-page-header"><div><h1>Plan d'action</h1><p>Centre de contrôle QHSE — priorisez ce qui compte aujourd’hui.</p></div>{props.canCreate && <button onClick={props.onCreate} type="button"><Plus size={18} />Nouveau rapport</button>}</header>
    <section className="action-control-metrics">
      <Metric detail={`${pendingCount} rapport(s)`} icon={<Clock3 size={22} />} label="À approuver" tone="is-orange" value={pendingCount} />
      <Metric detail="Échéance dépassée" icon={<AlertTriangle size={22} />} label="En retard" tone="is-red" value={props.metrics.overdueActionCount} />
      <Metric detail="Rapports à suivre" icon={<CheckCircle2 size={22} />} label="Actions ouvertes" tone="is-green" value={openCount} />
      <Metric detail={`Période ${new Date().getFullYear()}`} icon={<History size={22} />} label="Heures travaillées" tone="is-blue" value={`${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(props.metrics.exposureHours)} h`} />
    </section>
    <div className={`action-control-layout${typesOpen ? ' has-types' : ''}`}>
      <aside className="action-control-queue">
        <header><label><Search size={17} /><span className="sr-only">Rechercher</span><input aria-label="Rechercher une action" placeholder="Rechercher par titre, navire, type…" value={props.filters.search} onChange={(event) => props.onFilterChange('search', event.target.value)} /></label><button aria-label="Actualiser" onClick={props.onReload} type="button"><RefreshCw size={17} /></button></header>
        <details className="action-control-filters"><summary><Filter size={15} />Filtres actifs<ChevronDown size={15} /></summary><div><label>Navire<select aria-label="Navire / lieu" value={props.filters.vessel} onChange={(event) => props.onFilterChange('vessel', event.target.value)}><option value="">Tous</option>{props.filterOptions.vessels.map((value) => <option key={value}>{value}</option>)}</select></label><label>Type<select aria-label="Type d'évènement" value={props.filters.actionType} onChange={(event) => props.onFilterChange('actionType', event.target.value)}><option value="">Tous</option>{props.filterOptions.actionTypes.map((value) => <option key={value}>{value}</option>)}</select></label><label>Statut<select aria-label="Statut" value={props.filters.status} onChange={(event) => props.onFilterChange('status', event.target.value)}><option value="">Tous</option><option value="open">Non soldé</option><option value="closed">Soldé</option></select></label><label>Écart<select aria-label="Type d'écart" value={props.filters.deviationType} onChange={(event) => props.onFilterChange('deviationType', event.target.value)}><option value="">Tous</option>{props.filterOptions.deviationTypes.map((value) => <option key={value}>{value}</option>)}</select></label></div></details>
        <ActionQueue actions={props.actions} onSelect={setSelectedId} selectedId={selected?.id || null} />
        <footer><span>{props.actions.length} rapport(s)</span>{props.isAdmin && <button onClick={() => setTypesOpen(true)} type="button"><ShieldCheck size={15} />Gérer les types</button>}</footer>
      </aside>
      {selected ? <ActionDetail action={selected} canApprove={props.canApprove(selected)} canTreat={props.canTreat(selected)} client={props.client} data={props.data} isAdmin={props.isAdmin} onApprove={() => props.onApprove(selected)} onEdit={() => setEditAction(selected)} onExport={() => props.onExport(selected)} onTreat={() => props.onTreat(selected)} pdfActionId={props.pdfActionId} /> : <div className="action-control-detail action-control-empty"><FileImage size={30} />Sélectionnez un rapport pour afficher sa fiche.</div>}
      {typesOpen && props.isAdmin && <TypeCatalogPanel client={props.client} onClose={() => setTypesOpen(false)} onSaved={props.onTypeSaved} types={props.data.actionTypes} />}
    </div>
    {editAction && <ActionEditDialog action={editAction} client={props.client} data={props.data} onClose={() => setEditAction(null)} onSaved={(action) => { props.onActionSaved(action); setEditAction(null); setSelectedId(action.id); }} />}
  </>;
}
