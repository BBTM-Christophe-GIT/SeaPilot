import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AlertTriangle, Check, CheckCircle2, ChevronDown, ChevronRight, Circle,
  ClipboardList, Clock3, CloudSun, FileDown, FileImage, FileText, History, ImagePlus, Info, Plus, RefreshCw, Search,
  ShieldCheck, Ship, Upload, UserRound, UsersRound, X,
} from 'lucide-react';
import { Fragment, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import type { RoleKey } from '../permissions/roles';
import type { AppShellOutletContext } from '../shell/AppShell';
import {
  approveActionItem, buildActionPlanMetrics, createActionItem, fetchActionEvidenceUrls, fetchActionPlanData, isActionClosed, normalizeActionLabel,
  updateActionItemTreatment, type ActionItemRecord, type ActionPlanData, type ActionTreatmentInput,
  type CreateActionItemInput,
} from './actionPlanQueries';
import {
  actionSheetCompletion, actionSheetCompletionPercent, actionSheetDataFromForm, actionSheetDataFromRecord,
  actionSheetFileName, actionSheetReference, buildActionSheetPdf, downloadActionSheetPdf,
  type ActionSheetData,
} from './actionPlanPdf';
import './actionPlan.css';

interface ActionPlanPageProps { client?: SupabaseClient; roles?: RoleKey[] }

interface Filters { search: string; status: string; vessel: string; actionType: string; deviationType: string }

const EMPTY_DATA: ActionPlanData = {
  actions: [], documents: [], actionTypes: [], vessels: [], people: [], assignees: [],
  exposureHours: 0, hseKpis: null, hseDashboard: null,
};

const EMPTY_FILTERS: Filters = { search: '', status: '', vessel: '', actionType: '', deviationType: '' };
const DEVIATION_TYPES = [
  'Non Conformité Majeure', 'Non Conformité Mineure', 'Prescription', "Proposition d'Amélioration",
  'Recommandation', 'Remarque', 'Remarque Positive',
];
const DEVIATION_TYPE_ACTION_KEYS = new Set([
  'audit_client', 'audit_ecmid', 'audit_internal', 'visit_davit',
  'visit_crane', 'visit_hse', 'visit_radio', 'visit_classification',
]);
const ANOMALY_CAUSES = [
  'Avarie Moteur de Propulsion', 'Matériel/Equipement défectueux /Inadapté',
  'Non Respect des Procédures/Consignes', 'Opération de Levage', 'Panne Equipement',
  'Propreté Rangement', 'Respect de la Reglementation Applicable', 'Travaux Spéciaux',
];

function currentLocalDateTime(): string {
  const date = new Date();
  const local = new Date(date.getTime() - (date.getTimezoneOffset() * 60_000));
  return local.toISOString().slice(0, 16);
}

function newActionForm(issuerName = '', previewMode = false): CreateActionItemInput {
  const emptyForm: CreateActionItemInput = {
    title: '', issuerName, vesselId: null, vesselName: '', actionTypeKey: '', actionType: '',
    deviationType: '', occurredAt: currentLocalDateTime(), dueOn: '', vesselManeuver: '', weatherConditions: '',
    description: '', correctiveAction: '', lostDays: 0,
  };
  if (!previewMode) return emptyForm;
  return {
    ...emptyForm,
    title: "Plusieurs panneaux de signalisation sont endommagés ou manquants dans la zone de la grue bâbord.",
    vesselId: 9201,
    vesselName: 'M/V Démonstration',
    actionTypeKey: 'action_progress',
    actionType: 'Action de Progrès - BBTM',
    dueOn: '2026-09-10',
    vesselManeuver: 'Navire à quai, manutention suspendue.',
    weatherConditions: 'Vent d’ouest 12 nœuds, mer belle, bonne visibilité.',
    description: "Absence de l'indication « Zone de levage - Accès interdit » et pictogramme de port du casque fortement dégradé.",
    correctiveAction: "Remplacer les panneaux et vérifier l'ensemble de la signalisation sur les accès à la zone de la grue.",
  };
}

function canManage(roles: RoleKey[]): boolean {
  return roles.some((role) => role === 'admin' || role === 'direction' || role === 'armement');
}

function display(value: string, fallback = 'Non renseigné'): string { return value || fallback }

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, 'fr'));
}

function formatDate(value: string): string {
  if (!value) return 'Sans échéance';
  const [year, month, day] = value.slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function formatHours(value: number): string {
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(value)} h`;
}

function actionTypeLabel(action: ActionItemRecord): string {
  return action.actionType || action.auditType || 'Autre action';
}

function actionMatches(action: ActionItemRecord, filters: Filters): boolean {
  if (filters.status === 'open' && isActionClosed(action)) return false;
  if (filters.status === 'closed' && !isActionClosed(action)) return false;
  if (filters.vessel && action.vesselName !== filters.vessel) return false;
  if (filters.actionType && actionTypeLabel(action) !== filters.actionType) return false;
  if (filters.deviationType && action.deviationType !== filters.deviationType) return false;
  if (!filters.search) return true;
  const haystack = normalizeActionLabel([
    action.title, action.vesselName, actionTypeLabel(action), action.deviationType, action.ownerName,
    action.issuerName, action.correctiveAction, action.comments, action.description,
  ].join(' '));
  return haystack.includes(normalizeActionLabel(filters.search));
}

function severityClass(value: string): string {
  const normalized = normalizeActionLabel(value);
  if (normalized.includes('majeure') || normalized.includes('deces') || normalized.includes('fatal')) return 'is-critical';
  if (normalized.includes('mineure') || normalized.includes('prescription')) return 'is-warning';
  if (normalized.includes('positive')) return 'is-positive';
  return 'is-neutral';
}

function MetricCard({ icon, label, value, tone, detail }: {
  icon: ReactNode; label: string; value: string | number; tone: string; detail: string;
}) {
  return (
    <article className={`action-plan-metric ${tone}`} aria-label={label}>
      <span className="action-plan-metric-icon">{icon}</span>
      <span><small>{label}</small><strong>{value}</strong><em>{detail}</em></span>
    </article>
  );
}

function formatActionSheetDate(value: string, withTime = false): string {
  if (!value) return '—';
  if (withTime) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(date).replace(' à ', ' · ');
  }
  const [year, month, day] = value.slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function ActionSheetLivePreview({ data, photoUrls }: { data: ActionSheetData; photoUrls: string[] }) {
  return <div className="action-sheet-paper" aria-label="Aperçu de la fiche A4">
    <header>
      <img alt="BBTM" src="/bbtm-report-logo.png" />
      <strong>RAPPORT D&apos;EVENEMENT</strong>
      <dl><dt>Réf.</dt><dd>{actionSheetReference(data)}</dd><dt>Date</dt><dd>{formatActionSheetDate(data.occurredAt, true)}</dd><dt>Statut</dt><dd>{data.status || 'Brouillon'}</dd></dl>
    </header>
    <table><tbody>
      <tr><th>Date du constat</th><td>{formatActionSheetDate(data.occurredAt, true)}</td></tr>
      <tr><th>Émetteur</th><td>{data.issuerName || 'Non renseigné'}</td></tr>
      <tr className="action-sheet-signature-row"><th>Signature de l&apos;émetteur</th><td>{data.issuerSignature ? <img alt="Signature de l’émetteur" src={String(data.issuerSignature.source)} /> : <em>Figée lors de la création</em>}</td></tr>
      <tr><th>Responsable</th><td>{data.ownerName || 'À définir après approbation'}</td></tr>
      <tr><th>À traiter avant</th><td>{formatActionSheetDate(data.dueOn)}</td></tr>
      <tr><th>Type d&apos;Evènement</th><td>{data.actionType || 'Non renseigné'}</td></tr>
      {data.deviationType && <tr><th>Type d&apos;écart</th><td>{data.deviationType}</td></tr>}
    </tbody></table>
    <section><h4>Navire et conditions météo</h4><h5>Navire / lieu</h5><p>{data.vesselName || 'Non renseigné'}</p><h5>Manœuvre au moment de l&apos;évènement</h5><p>{data.vesselManeuver || 'Non renseignée'}</p><h5>Conditions météo</h5><p>{data.weatherConditions || 'Non renseignées'}</p></section>
    <section><h4>Constat</h4><p>{data.title || 'Décrivez le constat observé.'}</p>
      {data.description && <><h5>Description complémentaire</h5><p>{data.description}</p></>}</section>
    {data.anomalyCause && <section><h4>Cause de l&apos;anomalie</h4><p>{data.anomalyCause}</p></section>}
    <section><h4>Action proposée</h4><p>{data.correctiveAction || 'Renseignez la proposition d’action.'}</p></section>
    {photoUrls.length > 0 && <section><h4>Photos du constat</h4><div className="action-sheet-paper-photos">{photoUrls.slice(0, 2).map((url, index) => <img alt={`Constat ${index + 1}`} key={url} src={url} />)}</div></section>}
    <aside><Info size={13} />Le traitement, la preuve et la validation compléteront la fiche après sa création.</aside>
  </div>;
}

function CreateActionDialog({
  open, issuerName, data, previewMode, onClose, onCreated, client,
}: {
  open: boolean; issuerName: string; data: ActionPlanData; previewMode: boolean; onClose(): void;
  onCreated(action: ActionItemRecord): void; client: SupabaseClient;
}) {
  const [form, setForm] = useState<CreateActionItemInput>(() => newActionForm(issuerName, previewMode));
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoUrls, setPhotoUrls] = useState<string[]>(previewMode
    ? ['/demo/action-plan-finding-lifting-zone.png', '/demo/action-plan-finding-ppe.png']
    : []);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isPreparingPdf, setIsPreparingPdf] = useState(false);
  const [pdfPreview, setPdfPreview] = useState<{ fileName: string; url: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(newActionForm(issuerName, previewMode));
    setPhotos([]);
    setPhotoUrls(previewMode ? ['/demo/action-plan-finding-lifting-zone.png', '/demo/action-plan-finding-ppe.png'] : []);
    setPdfPreview(null);
    setError('');
  }, [issuerName, open, previewMode]);

  useEffect(() => () => {
    if (pdfPreview) URL.revokeObjectURL(pdfPreview.url);
  }, [pdfPreview]);

  useEffect(() => {
    if (!photos.length) return undefined;
    const nextUrls = photos.map((photo) => URL.createObjectURL(photo));
    setPhotoUrls(nextUrls);
    return () => nextUrls.forEach((url) => URL.revokeObjectURL(url));
  }, [photos]);

  const sheetData = useMemo<ActionSheetData>(() => {
    const base = actionSheetDataFromForm(form, photos);
    return photos.length ? base : {
      ...base,
      findingPhotos: photoUrls.map((source, index) => ({ label: `Photo du constat ${index + 1}`, source })),
    };
  }, [form, photoUrls, photos]);
  const completion = actionSheetCompletion(sheetData);
  const completionPercent = actionSheetCompletionPercent(sheetData);
  const completeCount = completion.filter((item) => item.complete).length;
  const selectedType = data.actionTypes.find((item) => item.key === form.actionTypeKey);
  const deviationRequired = DEVIATION_TYPE_ACTION_KEYS.has(form.actionTypeKey);

  if (!open) return null;

  function update<K extends keyof CreateActionItemInput>(key: K, value: CreateActionItemInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function choosePhotos(files: File[]) {
    const accepted = files.filter((file) => file.size <= 10 * 1024 * 1024).slice(0, 2);
    if (accepted.length !== files.slice(0, 2).length) setError('Chaque photo doit peser 10 Mo maximum.');
    else setError('');
    setPhotos(accepted);
    if (!accepted.length) setPhotoUrls([]);
  }

  function removePhoto(index: number) {
    if (photos.length) {
      setPhotos((current) => current.filter((_, itemIndex) => itemIndex !== index));
      setPhotoUrls((current) => current.filter((_, itemIndex) => itemIndex !== index));
    } else {
      setPhotoUrls((current) => current.filter((_, itemIndex) => itemIndex !== index));
    }
  }

  async function save() {
    setError(''); setIsSaving(true);
    try { onCreated(await createActionItem(client, form, photos)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Impossible d'enregistrer cette action."); }
    finally { setIsSaving(false); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    await save();
  }

  async function previewPdf() {
    setError(''); setIsPreparingPdf(true);
    try {
      const blob = await buildActionSheetPdf(sheetData);
      const nextPreview = { fileName: actionSheetFileName(sheetData), url: URL.createObjectURL(blob) };
      setPdfPreview(nextPreview);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Impossible de générer l'aperçu PDF.");
    } finally {
      setIsPreparingPdf(false);
    }
  }

  return (
    <div className="action-plan-dialog-backdrop" role="presentation">
      <section className="action-plan-dialog action-sheet-dialog" role="dialog" aria-modal="true" aria-labelledby="new-action-title">
        <header><span>Création</span><div><h2 id="new-action-title">Nouveau rapport d&apos;évènement</h2><em>Soumis à approbation</em></div>
          <small><FileText size={14} />{actionSheetReference(sheetData)}</small>
          <button aria-label="Fermer" onClick={onClose} type="button"><X size={22} /></button></header>
        <form onSubmit={submit}>
          <div className="action-sheet-workspace">
            <div className="action-sheet-form">
              <section aria-labelledby="action-identification"><h3 id="action-identification"><UserRound size={20} />1 · Identification</h3>
                <div className="action-plan-form-grid is-identification">
                  <label>Date et heure du constat <b>*</b><input required type="datetime-local" value={form.occurredAt} onChange={(event) => update('occurredAt', event.target.value)} /></label>
                  <label>Émetteur <b>*</b><input readOnly required value={form.issuerName} /></label>
                  <label>À traiter avant <b>*</b><input required type="date" value={form.dueOn} onChange={(event) => update('dueOn', event.target.value)} /></label>
                </div>
              </section>
              <section aria-labelledby="action-vessel-weather"><h3 id="action-vessel-weather"><Ship size={20} />2 · Navire et Conditions météo</h3>
                <div className="action-plan-form-grid">
                  <label>Navire / lieu <b>*</b><select required value={form.vesselId || ''} onChange={(event) => { const vessel = data.vessels.find((item) => item.id === Number(event.target.value)); update('vesselId', vessel?.id || null); update('vesselName', vessel?.name || ''); }}>
                    <option value="">Sélectionner un navire</option>{data.vessels.map((vessel) => <option key={vessel.id} value={vessel.id}>{vessel.name}</option>)}</select></label>
                  <label>Manœuvre du navire au moment de l&apos;évènement <b>*</b><input required value={form.vesselManeuver} onChange={(event) => update('vesselManeuver', event.target.value)} /></label>
                  <label className="is-wide">Conditions météo <b>*</b><input required value={form.weatherConditions} onChange={(event) => update('weatherConditions', event.target.value)} /></label>
                </div>
                <p className="action-plan-link-note"><CloudSun size={16} />Décrivez la situation réelle au moment exact du constat.</p>
              </section>
              <section aria-labelledby="action-qualification"><h3 id="action-qualification"><ShieldCheck size={20} />3 · Qualification</h3>
                <div className="action-plan-form-grid">
                  <label>Type d&apos;évènement <b>*</b><select required value={form.actionTypeKey} onChange={(event) => { const type = data.actionTypes.find((item) => item.key === event.target.value); update('actionTypeKey', type?.key || ''); update('actionType', type?.label || ''); if (!DEVIATION_TYPE_ACTION_KEYS.has(type?.key || '')) update('deviationType', ''); }}>
                    <option value="">Sélectionner un type</option>
                    <optgroup label="Actions, audits et visites">{data.actionTypes.filter((type) => type.family !== 'event').map((type) => <option key={type.key} value={type.key}>{type.label}</option>)}</optgroup>
                    <optgroup label="Événements liés aux indicateurs HSE">{data.actionTypes.filter((type) => type.family === 'event').map((type) => <option key={type.key} value={type.key}>{type.label}</option>)}</optgroup>
                  </select></label>
                  {deviationRequired && <label>Type d&apos;écart <b>*</b><select required value={form.deviationType} onChange={(event) => update('deviationType', event.target.value)}><option value="">Sélectionner un type d&apos;écart</option>{DEVIATION_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>}
                  {selectedType?.tracksExposureRate && <label>Jours d&apos;arrêt<input min="0" step="0.5" type="number" value={form.lostDays} onChange={(event) => update('lostDays', Number(event.target.value))} /></label>}
                </div>
                <p className="action-plan-link-note"><Clock3 size={16} />Les champs HSE s&apos;adaptent automatiquement au type d&apos;événement sélectionné.</p>
              </section>
              <section aria-labelledby="action-finding"><h3 id="action-finding"><FileText size={20} />4 · Constat</h3>
                <label>Constat <b>*</b><textarea required value={form.title} onChange={(event) => update('title', event.target.value)} /></label>
                <label>Description complémentaire<textarea value={form.description} onChange={(event) => update('description', event.target.value)} /></label>
              </section>
              <section aria-labelledby="action-cause"><h3 id="action-cause"><ClipboardList size={20} />5 · Cause de l&apos;anomalie</h3>
                <label>Cause retenue<select disabled value=""><option value="">À définir par Christophe MINASSIAN après la création</option>{ANOMALY_CAUSES.map((cause) => <option key={cause}>{cause}</option>)}</select></label>
                <p className="action-plan-link-note"><UsersRound size={16} />Christophe définit également le ou les responsables du traitement lors de l&apos;approbation.</p>
              </section>
              <section aria-labelledby="action-proposal"><h3 id="action-proposal"><CheckCircle2 size={20} />6 · Action proposée</h3>
                <label>Action proposée <b>*</b><textarea required value={form.correctiveAction} onChange={(event) => update('correctiveAction', event.target.value)} /></label>
              </section>
              <section aria-labelledby="action-photos"><h3 id="action-photos"><ImagePlus size={20} />7 · Photos du constat</h3>
                <div className="action-sheet-photo-grid">
                  {photoUrls.map((url, index) => <figure key={url}><img alt={`Photo du constat ${index + 1}`} src={url} /><figcaption>{photos[index]?.name || (index === 0 ? 'Vue générale' : 'Pictogramme dégradé')}</figcaption><button aria-label={`Retirer la photo ${index + 1}`} onClick={() => removePhoto(index)} type="button"><X size={15} /></button></figure>)}
                  {photoUrls.length < 2 && <label className="action-plan-file-drop is-photo-tile"><Upload size={24} /><strong>Ajouter une photo</strong><span>PNG, JPEG, WebP ou HEIC · 10 Mo maximum</span><input accept="image/png,image/jpeg,image/webp,image/heic,image/heif" multiple type="file" onChange={(event) => choosePhotos(Array.from(event.target.files || []))} /></label>}
                </div>
              </section>
              {error && <p className="action-plan-message is-error" role="alert">{error}</p>}
            </div>

            <aside className="action-sheet-preview-column">
              <header><strong>Aperçu de la fiche A4</strong><div><select aria-label="Zoom de l’aperçu" defaultValue="100"><option value="100">100 %</option></select><button aria-label="Actualiser l’aperçu" type="button"><RefreshCw size={16} />Actualiser</button></div></header>
              <ActionSheetLivePreview data={sheetData} photoUrls={photoUrls} />
            </aside>

            <aside className="action-sheet-progress" aria-label="Suivi de complétude">
              <h3>Complétude</h3>
              <div aria-label={`${completionPercent} % complété`} className="action-sheet-progress-ring" style={{ background: `conic-gradient(#2663eb ${completionPercent * 3.6}deg, #edf1f7 0deg)` }}><span>{completionPercent} %</span></div>
              <strong>Champs obligatoires</strong><p>{completeCount} / {completion.length} complétés</p>
              <ul>{completion.map((item) => <li className={item.complete ? 'is-complete' : item.future ? 'is-future' : ''} key={item.key}>{item.complete ? <Check size={12} /> : <Circle size={12} />}<span>{item.label}</span></li>)}</ul>
              <section><strong>Aperçu</strong><p>Générez un aperçu PDF de la fiche avant création.</p><button disabled={isPreparingPdf} onClick={() => void previewPdf()} type="button"><FileDown size={16} />{isPreparingPdf ? 'Préparation…' : 'Aperçu PDF'}</button></section>
            </aside>
          </div>
          <footer><span><FileText size={18} />Le rapport sera soumis à Christophe MINASSIAN</span><div><button className="is-secondary" onClick={onClose} type="button">Annuler</button><button disabled={isSaving} type="submit">{isSaving ? 'Création…' : 'Créer et soumettre'}<Plus size={17} /></button></div></footer>
        </form>
      </section>
      {pdfPreview && <section aria-labelledby="action-sheet-pdf-title" aria-modal="true" className="action-sheet-pdf-dialog" role="dialog">
        <header><div><span>Aperçu avant création</span><h2 id="action-sheet-pdf-title">Rapport d&apos;évènement · PDF A4</h2></div><div>
          <a download={pdfPreview.fileName} href={pdfPreview.url}><FileDown size={17} />Télécharger</a>
          <button aria-label="Fermer l’aperçu PDF" onClick={() => setPdfPreview(null)} type="button"><X size={20} /></button>
        </div></header>
        <div className="action-sheet-pdf-canvas" role="img" aria-label="Aperçu PDF du rapport d'évènement">
          <ActionSheetLivePreview data={sheetData} photoUrls={photoUrls} />
        </div>
      </section>}
    </div>
  );
}

function ApprovalDialog({ action, data, client, onClose, onSaved }: {
  action: ActionItemRecord | null; data: ActionPlanData; client: SupabaseClient;
  onClose(): void; onSaved(action: ActionItemRecord): void;
}) {
  const [anomalyCause, setAnomalyCause] = useState('');
  const [personIds, setPersonIds] = useState<number[]>([]);
  const [vesselIds, setVesselIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!action) return;
    setAnomalyCause(action.anomalyCause || '');
    setPersonIds([]); setVesselIds([]); setError('');
  }, [action]);
  if (!action) return null;

  function toggle(list: number[], id: number, setter: (ids: number[]) => void) {
    setter(list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError('');
    try {
      onSaved(await approveActionItem(client, action!.id, { anomalyCause, personIds, vesselIds }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Impossible d'approuver ce rapport.");
    } finally { setSaving(false); }
  }

  return <div className="action-plan-dialog-backdrop" role="presentation"><section className="action-plan-approval" role="dialog" aria-modal="true" aria-labelledby="approval-title">
    <header><span>Approbation QHSE</span><h2 id="approval-title">{action.title}</h2><p>Définissez la cause puis affectez une ou plusieurs personnes, ou l&apos;équipage complet d&apos;un navire.</p><button aria-label="Fermer" onClick={onClose} type="button"><X size={22} /></button></header>
    <form onSubmit={submit}>
      <label>Cause de l&apos;anomalie <b>*</b><select required value={anomalyCause} onChange={(event) => setAnomalyCause(event.target.value)}><option value="">Sélectionner une cause</option>{ANOMALY_CAUSES.map((cause) => <option key={cause}>{cause}</option>)}</select></label>
      <fieldset><legend>Personnes responsables</legend><div className="action-plan-assignee-grid">{data.people.map((person) => <label key={person.id}><input checked={personIds.includes(person.id)} onChange={() => toggle(personIds, person.id, setPersonIds)} type="checkbox" /><span><strong>{person.name}</strong><small>{person.functionLabel || 'Personnel BBTM'}</small></span></label>)}</div></fieldset>
      <fieldset><legend>Équipage d&apos;un navire</legend><div className="action-plan-assignee-grid is-vessels">{data.vessels.map((vessel) => <label key={vessel.id}><input checked={vesselIds.includes(vessel.id)} onChange={() => toggle(vesselIds, vessel.id, setVesselIds)} type="checkbox" /><span><strong>Équipage — {vessel.name}</strong><small>Les marins planifiés sur ce navire verront l&apos;action.</small></span></label>)}</div></fieldset>
      <p className="action-plan-approval-selection"><UsersRound size={16} />{personIds.length + vesselIds.length} responsable(s) sélectionné(s)</p>
      {error && <p className="action-plan-message is-error" role="alert">{error}</p>}
      <footer><button className="is-secondary" disabled={saving} onClick={onClose} type="button">Annuler</button><button disabled={saving || !anomalyCause || personIds.length + vesselIds.length === 0} type="submit">{saving ? 'Approbation…' : 'Approuver et affecter'}</button></footer>
    </form>
  </section></div>;
}

function TreatmentDialog({ action, client, onClose, onSaved }: {
  action: ActionItemRecord | null; client: SupabaseClient; onClose(): void; onSaved(action: ActionItemRecord): void;
}) {
  const [input, setInput] = useState<ActionTreatmentInput>({ comments: '', realizedAction: '', closeAction: false });
  const [photo, setPhoto] = useState<File>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (action) setInput({ comments: action.comments, realizedAction: action.realizedAction, closeAction: false }); }, [action]);
  if (!action) return null;

  async function save(closeAction: boolean) {
    setSaving(true); setError('');
    try { onSaved(await updateActionItemTreatment(client, action!, { ...input, closeAction }, photo)); }
    catch { setError("Impossible d'enregistrer le traitement."); }
    finally { setSaving(false); }
  }

  return <div className="action-plan-dialog-backdrop" role="presentation"><section className="action-plan-treatment" role="dialog" aria-modal="true" aria-labelledby="treatment-title">
    <header><span>Traitement</span><h2 id="treatment-title">{action.title}</h2><button aria-label="Fermer" onClick={onClose}><X size={22} /></button></header>
    <div className="action-plan-treatment-type">{actionTypeLabel(action)}</div>
    <label>Action réalisée<textarea value={input.realizedAction} onChange={(e) => setInput((current) => ({ ...current, realizedAction: e.target.value }))} /></label>
    <label>Commentaire<textarea value={input.comments} onChange={(e) => setInput((current) => ({ ...current, comments: e.target.value }))} /></label>
    <label className="action-plan-file-drop is-compact"><Upload size={20} /><strong>Photo de clôture</strong><span>{photo?.name || 'Choisir un fichier'}</span><input accept="image/*" type="file" onChange={(e) => setPhoto(e.target.files?.[0])} /></label>
    {error && <p className="action-plan-message is-error">{error}</p>}
    <footer><button className="is-secondary" disabled={saving} onClick={onClose}>Annuler</button><button className="is-secondary" disabled={saving} onClick={() => void save(false)}>Enregistrer</button><button disabled={saving} onClick={() => void save(true)}>Clôturer l'Action</button></footer>
  </section></div>;
}

export function ActionPlanPage({ client, roles }: ActionPlanPageProps) {
  const context = useOutletContext<AppShellOutletContext | undefined>();
  const effectiveClient = client || context?.client || supabase;
  const effectiveRoles = roles || context?.roles || [];
  const profileName = context?.currentPerson ? `${context.currentPerson.firstName} ${context.currentPerson.lastName}`.trim() : '';
  const previewMode = Boolean(context?.previewMode);
  const isManager = canManage(effectiveRoles);
  const [data, setData] = useState<ActionPlanData>(EMPTY_DATA);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [expandedActionId, setExpandedActionId] = useState<number | null>(() => Number(new URLSearchParams(window.location.search).get('action')) || null);
  const [createOpen, setCreateOpen] = useState(false);
  const [approvalAction, setApprovalAction] = useState<ActionItemRecord | null>(null);
  const [treatmentAction, setTreatmentAction] = useState<ActionItemRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pdfActionId, setPdfActionId] = useState<number | null>(null);

  async function load() {
    setLoading(true); setError('');
    try { setData(await fetchActionPlanData(effectiveClient)); }
    catch { setError("Impossible de charger le plan d'action."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [effectiveClient]);

  const filtered = useMemo(() => data.actions.filter((action) => actionMatches(action, filters)), [data.actions, filters]);
  const metrics = useMemo(() => buildActionPlanMetrics(filtered, data.exposureHours), [filtered, data.exposureHours]);
  const vesselOptions = useMemo(() => unique(data.actions.map((a) => a.vesselName)), [data.actions]);
  const typeOptions = useMemo(() => unique(data.actions.map(actionTypeLabel)), [data.actions]);
  const deviationOptions = useMemo(() => unique([...DEVIATION_TYPES, ...data.actions.map((a) => a.deviationType)]), [data.actions]);
  const vesselCount = unique(filtered.map((a) => a.vesselName)).length;

  function updateFilter(key: keyof Filters, value: string) { setFilters((current) => ({ ...current, [key]: value })); }
  function replaceAction(updated: ActionItemRecord) {
    setData((current) => ({ ...current, actions: current.actions.map((action) => action.id === updated.id ? updated : action) }));
    setTreatmentAction(null); setMessage('Action mise à jour.');
  }
  function actionCanBeTreated(action: ActionItemRecord): boolean {
    if (action.workflowStatus !== 'approved') return false;
    if (isManager) return true;
    if (action.sourceLabel !== 'seapilot') return effectiveRoles.includes('capitaine');
    return effectiveRoles.includes('capitaine') || effectiveRoles.includes('marin');
  }
  function actionCanBeApproved(action: ActionItemRecord): boolean {
    return action.workflowStatus === 'pending_approval'
      && Boolean(context?.currentPerson?.id)
      && action.approverPersonId === context?.currentPerson?.id;
  }

  async function exportActionSheet(action: ActionItemRecord) {
    setError(''); setMessage(''); setPdfActionId(action.id);
    try {
      const evidenceUrls = await fetchActionEvidenceUrls(effectiveClient, action);
      const sheetData = actionSheetDataFromRecord(action, evidenceUrls);
      const blob = await buildActionSheetPdf(sheetData);
      downloadActionSheetPdf(blob, actionSheetFileName(sheetData));
      setMessage('Fiche PDF générée.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Impossible de générer la fiche PDF.');
    } finally {
      setPdfActionId(null);
    }
  }

  const groupedStatuses = [
    { key: 'open', label: 'Écarts non soldés', actions: filtered.filter((a) => !isActionClosed(a)) },
    { key: 'closed', label: 'Actions soldées', actions: filtered.filter(isActionClosed) },
  ];

  if (loading) return <div className="admin-state" role="status">Chargement du plan d'action…</div>;

  return <section className="action-plan-page">
    <header className="action-plan-header"><div><h1>Plan d'action</h1><p>Suivi des écarts, événements QHSE, actions correctives, responsables et échéances.</p></div></header>
    <nav className="action-plan-toolbar" aria-label="Fonctionnalités du plan d'action">
      <div><button aria-current="page" className="is-active"><ShieldCheck size={16} />Actions</button></div>
      <span><button className="is-secondary" onClick={() => void load()}><RefreshCw size={16} />Actualiser</button>{isManager && <button onClick={() => setCreateOpen(true)}><Plus size={17} />Nouveau rapport</button>}</span>
    </nav>

    {(message || error) && <p className={`action-plan-message${error ? ' is-error' : ' is-success'}`}>{error || message}</p>}

    <div className="action-plan-metrics">
      <MetricCard detail={`${vesselCount} navire(s) / lieu(x)`} icon={<Clock3 size={20} />} label="Actions non soldées" tone="is-orange" value={metrics.openActionCount} />
      <MetricCard detail={`${metrics.overdueActionCount} action(s) en retard`} icon={<AlertTriangle size={20} />} label="Non-conformités majeures" tone="is-red" value={metrics.majorNonConformityCount} />
      <MetricCard detail={`${filtered.length} action(s) affichée(s)`} icon={<CheckCircle2 size={20} />} label="Actions soldées" tone="is-green" value={metrics.closedActionCount} />
      <MetricCard detail={`Période ${new Date().getFullYear()}`} icon={<History size={20} />} label="Heures travaillées" tone="is-teal" value={formatHours(metrics.exposureHours)} />
    </div>

    <>
      <div className="action-plan-filters">
        <label>Navire / lieu<select value={filters.vessel} onChange={(e) => updateFilter('vessel', e.target.value)}><option value="">Tous les navires</option>{vesselOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Type d&apos;évènement<select value={filters.actionType} onChange={(e) => updateFilter('actionType', e.target.value)}><option value="">Tous les types</option>{typeOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Statut<select value={filters.status} onChange={(e) => updateFilter('status', e.target.value)}><option value="">Tous les statuts</option><option value="open">Non soldé</option><option value="closed">Soldé</option></select></label>
        <label>Type d'écart<select value={filters.deviationType} onChange={(e) => updateFilter('deviationType', e.target.value)}><option value="">Tous les types d'écart</option>{deviationOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="action-plan-search"><span className="sr-only">Rechercher</span><Search size={17} /><input aria-label="Rechercher une action" placeholder="Rechercher par titre, navire, responsable…" value={filters.search} onChange={(e) => updateFilter('search', e.target.value)} /></label>
      </div>
      <div className="action-plan-list" aria-label="Actions groupées">
        {groupedStatuses.map((statusGroup) => statusGroup.actions.length > 0 && <details key={statusGroup.key} open>
          <summary><span className={`action-plan-count ${statusGroup.key}`}>{statusGroup.actions.length}</span>{statusGroup.label}</summary>
          {unique(statusGroup.actions.map((a) => a.vesselName || 'Sans navire')).map((vessel) => {
            const vesselActions = statusGroup.actions.filter((a) => (a.vesselName || 'Sans navire') === vessel);
            return <details key={`${statusGroup.key}-${vessel}`} open><summary><span className="action-plan-count vessel">{vesselActions.length}</span>{vessel}</summary>
              {unique(vesselActions.map(actionTypeLabel)).map((type) => { const typeActions = vesselActions.filter((a) => actionTypeLabel(a) === type);
                return <details key={`${statusGroup.key}-${vessel}-${type}`} open><summary><span className="action-plan-count type">{typeActions.length}</span>{type}</summary>
                  {typeActions.map((action) => <article className={`action-plan-row ${severityClass(action.deviationType)}`} key={action.id}>
                    {actionCanBeApproved(action)
                      ? <button className="action-plan-treat is-approval" onClick={() => setApprovalAction(action)}>Approuver</button>
                      : actionCanBeTreated(action) && !isActionClosed(action)
                        ? <button className="action-plan-treat" onClick={() => setTreatmentAction(action)}>Traiter</button>
                        : <span aria-hidden="true" className="action-plan-treat-spacer" />}
                    {action.thumbnailUrl
                      ? <a aria-label={isActionClosed(action) ? `Ouvrir la preuve de traitement de ${action.title}` : `Ouvrir la photo jointe de ${action.title}`} className="action-plan-thumbnail" href={action.thumbnailUrl} rel="noreferrer" target="_blank"><img alt={isActionClosed(action) ? `Preuve de traitement — ${action.title}` : `Photo jointe — ${action.title}`} src={action.thumbnailUrl} /></a>
                      : <span aria-hidden="true" className="action-plan-thumbnail is-empty"><FileImage size={18} /></span>}
                    <button aria-expanded={expandedActionId === action.id} className="action-plan-row-main" onClick={() => setExpandedActionId(expandedActionId === action.id ? null : action.id)}>
                      <span>{expandedActionId === action.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}<strong><time className={action.dueOn && action.dueOn < new Date().toISOString().slice(0, 10) && !isActionClosed(action) ? 'is-overdue' : ''} dateTime={action.dueOn || undefined}>{formatDate(action.dueOn)}</time><span> - </span><span className="action-plan-row-title-text">{action.title}</span></strong></span>
                      <span><strong>{display(action.ownerName, action.workflowStatus === 'pending_approval' ? 'À définir par Christophe' : 'Non renseigné')}</strong><small>Responsable du traitement</small></span>
                      <span>{display(action.deviationType, 'Remarque')}</span>
                      <span><em className={isActionClosed(action) ? 'is-closed' : action.workflowStatus === 'pending_approval' ? 'is-pending' : 'is-open'}>{isActionClosed(action) ? 'Soldé' : action.workflowStatus === 'pending_approval' ? 'À approuver' : 'À traiter'}</em></span>
                    </button>
                    {expandedActionId === action.id && <div className="action-plan-row-details"><dl>
                      <dt>Constat</dt><dd>{display(action.description, action.title)}</dd>
                      <dt>Date et heure du constat</dt><dd>{formatActionSheetDate(action.occurredAt || action.openedOn, true)}</dd>
                      <dt>Manœuvre du navire</dt><dd>{display(action.vesselManeuver)}</dd>
                      <dt>Conditions météo</dt><dd>{display(action.weatherConditions)}</dd>
                      <dt>Cause de l&apos;anomalie</dt><dd>{display(action.anomalyCause, 'À définir lors de l’approbation.')}</dd>
                      <dt>Proposition d'action</dt><dd>{display(action.correctiveAction, 'Aucune proposition renseignée.')}</dd>
                      <dt>Commentaire</dt><dd>{display(action.comments, 'Aucun commentaire renseigné.')}</dd>
                      {action.realizedAction && <><dt>Action réalisée</dt><dd>{action.realizedAction}</dd></>}
                      <dt>Émetteur</dt><dd>{display(action.issuerName)}</dd>
                      {(action.projectCode || action.projectTitle) && <><dt>Projet</dt><dd>{[action.projectCode, action.projectTitle].filter(Boolean).join(' · ')}</dd></>}
                      {data.documents.filter((document) => document.actionItemId === action.id || (document.actionSharePointItemId && document.actionSharePointItemId === action.sourceItemId)).map((document) => <Fragment key={document.id}><dt>Fiche de progrès</dt><dd><a aria-label={`Ouvrir le fichier ${document.title}`} href={document.fileUrl} rel="noreferrer" target="_blank">{document.title}</a></dd></Fragment>)}
                    </dl><button className="action-plan-pdf-button is-secondary" disabled={pdfActionId === action.id} onClick={() => void exportActionSheet(action)}><FileDown size={16} />{pdfActionId === action.id ? 'Génération…' : 'Télécharger la fiche PDF'}</button></div>}
                  </article>)}
                </details>; })}
            </details>; })}
        </details>)}
        {filtered.length === 0 && <div className="action-plan-empty">Aucune action ne correspond aux filtres.</div>}
      </div>
    </>

    <CreateActionDialog client={effectiveClient} data={data} issuerName={profileName} onClose={() => setCreateOpen(false)} onCreated={(action) => { setData((current) => ({ ...current, actions: [action, ...current.actions] })); setCreateOpen(false); setMessage('Rapport créé et soumis à Christophe MINASSIAN.'); }} open={createOpen} previewMode={previewMode} />
    <ApprovalDialog action={approvalAction} client={effectiveClient} data={data} onClose={() => setApprovalAction(null)} onSaved={(action) => { setApprovalAction(null); replaceAction(action); setMessage('Rapport approuvé et responsables affectés.'); void load(); }} />
    <TreatmentDialog action={treatmentAction} client={effectiveClient} onClose={() => setTreatmentAction(null)} onSaved={replaceAction} />
  </section>;
}
