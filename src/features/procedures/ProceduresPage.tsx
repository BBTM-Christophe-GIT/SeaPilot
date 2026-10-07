import { compareFleetNames } from '../fleet/fleetDisplay';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  BadgeCheck,
  BellRing,
  BookOpenCheck,
  Building2,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  ClipboardList,
  Download,
  Edit3,
  FileCheck2,
  FilePlus2,
  FileText,
  FileWarning,
  FileX,
  Info,
  List,
  ListChecks,
  Search,
  Send,
  Tags,
  ShipWheel,
  ShieldCheck,
  TriangleAlert,
  Trash2,
  Upload,
  UserRoundCheck,
  UsersRound,
  Wrench,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { AppDialog } from '../../components/AppDialog';
import type { RoleKey } from '../permissions/roles';
import type { AppShellOutletContext } from '../shell/AppShell';
import {
  buildProcedureMetrics,
  createProcedure,
  deleteProcedure,
  deletePublishedProcedure,
  fetchProcedureProjects,
  fetchProcedureVessels,
  fetchProceduresData,
  getProcedurePublicationDate,
  getProcedureFileUrl,
  getProcedureStatusLabel,
  isProcedureNumberConflict,
  isProcedureNumberTaken,
  publishProcedure,
  suggestNextProcedureNumber,
  updateProcedure,
  updateProcedureTags,
  type ProcedureInput,
  type ProcedureProjectOption,
  type ProcedureRecord,
  type ProcedureStatus,
  type PublishedProcedureRecord,
} from './procedureQueries';
import { buildProcedureCode, getAnnualReviewAlert, getAnnualReviewDueDate } from './procedureReview';
import './procedureGoogleDrive.css';
import './procedureTags.css';
import { normalizeProcedureSearch, normalizeProcedureTags, parseProcedureTags } from './procedureTags';
import { createProcedureTag, fetchProcedureTagCatalogue, removeProcedureTag } from './procedureTagCatalogue';
import { ProcedureTagCatalogueDialog } from './ProcedureTagCatalogueDialog';
import { ProcedureListDialog } from './ProcedureListDialog';
import { procedureAppliesToVessel } from './procedureList';
import { CHAPTERS, ISM_CHAPTER_THEMES, chapterKey, type ProcedureChapterKey } from './procedureChapters';
import { createProcedureTemplateFile } from './procedureTemplate';
import { createProcedureFileStore, procedureDriveFilename, PROCEDURE_IMPORT_TYPES, showProcedureBlob, type ProcedureFileStore } from './procedureDriveFiles';

interface ProceduresPageProps {
  client?: SupabaseClient;
  roles?: RoleKey[];
  fileStore?: ProcedureFileStore;
}

interface ProcedureFilterState {
  search: string;
  project: string;
  vessel: string;
}

type LibraryView = 'sources' | 'published';

type ProcedureChapterTone = 'blue' | 'teal' | 'orange' | 'amber';

const CHAPTER_VISUALS: Record<ProcedureChapterKey, { Icon: LucideIcon; tone: ProcedureChapterTone }> = {
  '01': { Icon: Info, tone: 'blue' },
  '02': { Icon: ShieldCheck, tone: 'teal' },
  '03': { Icon: Building2, tone: 'blue' },
  '04': { Icon: UserRoundCheck, tone: 'blue' },
  '05': { Icon: ShipWheel, tone: 'blue' },
  '06': { Icon: UsersRound, tone: 'blue' },
  '07': { Icon: ClipboardList, tone: 'blue' },
  '08': { Icon: TriangleAlert, tone: 'orange' },
  '09': { Icon: FileWarning, tone: 'orange' },
  '10': { Icon: Wrench, tone: 'blue' },
  '11': { Icon: FileText, tone: 'blue' },
  '12': { Icon: ClipboardCheck, tone: 'teal' },
  '13': { Icon: BadgeCheck, tone: 'teal' },
  uncontrolled: { Icon: FileX, tone: 'orange' },
  unassigned: { Icon: CircleHelp, tone: 'amber' },
};

const THEMES = ['ADM', 'AUT', 'DNC', 'DPA', 'GEN', 'OPE', 'POL', 'RAC', 'REP', 'SEC', 'SMS', 'TEC', 'URG', 'VPC'];

const EMPTY_FILTERS: ProcedureFilterState = { search: '', project: '', vessel: '' };
const EMPTY_FORM: ProcedureInput = {
  procedureCode: '', title: '', status: 'draft', revisionLabel: '', diffusionOn: '', categoryLabel: '',
  description: '', regulatoryRequirement: '', ismChapter: '01', vesselName: '', projectName: '', documentNumber: '',
  restrictions: '', annualReview: false, theme: ISM_CHAPTER_THEMES['01']!, documentType: '',
  bridgeWatch: false, versionLabel: '', notes: '', tags: [],
};

function canManageProcedures(roles: RoleKey[]): boolean {
  return roles.some((role) => role === 'admin' || role === 'direction');
}

function ProcedureChapterIcon({ chapter }: { chapter: ProcedureChapterKey }) {
  const { Icon, tone } = CHAPTER_VISUALS[chapter];
  return <span aria-hidden="true" className={`procedure-chapter-icon is-${tone}`} data-chapter-icon={chapter}><Icon size={16} /></span>;
}

function projectNames(value: string): string[] {
  return [...new Set(value.split(';').map((name) => name.trim()).filter(Boolean))];
}

function matchesFilters(record: ProcedureRecord, filters: ProcedureFilterState): boolean {
  if (filters.project && !projectNames(record.projectName).includes(filters.project)) return false;
  if (!procedureAppliesToVessel(record, filters.vessel)) return false;
  if (!filters.search) return true;
  const searchable = normalizeProcedureSearch([
    record.title, record.procedureCode, record.documentNumber, record.theme, record.ismChapter, record.description,
    record.projectName, record.vesselName, ...record.tags,
  ].join(' '));
  return searchable.includes(normalizeProcedureSearch(filters.search));
}

function sortRecords<T extends ProcedureRecord>(records: T[]): T[] {
  return [...records].sort((left, right) =>
    chapterKey(left.ismChapter).localeCompare(chapterKey(right.ismChapter), 'fr')
    || left.procedureCode.localeCompare(right.procedureCode, 'fr')
    || left.title.localeCompare(right.title, 'fr'));
}

function formatDate(value: string): string {
  if (!value) return 'Date non renseignée';
  return new Intl.DateTimeFormat('fr-FR').format(new Date(`${value}T12:00:00`));
}

function humanFileSize(value: number | null): string {
  if (!value) return '';
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} Ko`;
  return `${(value / (1024 * 1024)).toFixed(1)} Mo`;
}

function formFromProcedure(procedure: ProcedureRecord): ProcedureInput {
  return {
    procedureCode: procedure.procedureCode,
    title: procedure.title,
    status: procedure.status,
    revisionLabel: procedure.revisionLabel,
    diffusionOn: procedure.diffusionOn,
    categoryLabel: procedure.categoryLabel,
    description: procedure.description,
    regulatoryRequirement: procedure.regulatoryRequirement,
    ismChapter: chapterKey(procedure.ismChapter),
    vesselName: procedure.vesselName,
    projectName: procedure.projectName,
    documentNumber: procedure.documentNumber,
    restrictions: procedure.restrictions,
    annualReview: procedure.annualReview,
    theme: procedure.theme,
    documentType: procedure.documentType,
    bridgeWatch: procedure.bridgeWatch,
    versionLabel: procedure.versionLabel,
    notes: procedure.notes,
    tags: procedure.tags,
  };
}

interface ProcedureTagCatalogueState {
  names: string[];
  loading: boolean;
  error: string;
  onRetry: () => void;
}

function ProcedureTagsField({ value, onChange, disabled, catalogue }: { value: string; onChange: (value: string) => void; disabled: boolean; catalogue: ProcedureTagCatalogueState }) {
  const fieldId = useId();
  const tags = parseProcedureTags(value);
  const selectedKeys = new Set(tags.map(normalizeProcedureSearch));
  const availableTags = normalizeProcedureTags(catalogue.names).filter(tag => !selectedKeys.has(normalizeProcedureSearch(tag)));
  return <div className="procedure-tags-field">
    <label htmlFor={fieldId}>Tags</label>
    <input id={fieldId} aria-describedby={`${fieldId}-help`} disabled={disabled} placeholder="Ex. Rôle, MARPOL, Pollution" value={value} onChange={event => onChange(event.target.value)} />
    <small id={`${fieldId}-help`}>Séparez les tags par une virgule ou un point-virgule. La recherche retrouve les documents grâce à ces tags. Les nouveaux tags enregistrés seront réutilisables pour les autres documents.</small>
    <label htmlFor={`${fieldId}-catalogue`}>Ajouter un tag pré-enregistré</label>
    <select id={`${fieldId}-catalogue`} disabled={disabled || catalogue.loading || !availableTags.length} value="" onChange={event => { if (event.target.value) onChange([...tags, event.target.value].join(', ')); }}>
      <option value="">Choisir un tag…</option>
      {availableTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
    </select>
    {catalogue.loading ? <small role="status">Chargement des tags pré-enregistrés… La saisie libre reste disponible.</small> : catalogue.error ? <div className="procedure-tag-catalogue-error"><p role="alert">{catalogue.error} La saisie libre reste disponible.</p><button className="sp-button sp-button--secondary" disabled={disabled} onClick={catalogue.onRetry} type="button">Réessayer le chargement des tags</button></div> : !catalogue.names.length ? <small>Aucun tag pré-enregistré pour le moment.</small> : !availableTags.length ? <small>Tous les tags pré-enregistrés sont déjà sélectionnés.</small> : null}
    {tags.length ? <ul aria-label="Tags du document" className="procedure-tag-list">{tags.map(tag => <li className="procedure-tag" key={tag}><span>{tag}</span><button aria-label={`Retirer le tag ${tag}`} disabled={disabled} onClick={() => onChange(tags.filter(value => value !== tag).join(', '))} type="button"><X aria-hidden="true" size={14} /></button></li>)}</ul> : null}
  </div>;
}

function ProcedureTagsDialog({ record, onClose, onSave, saving, catalogue }: { record: ProcedureRecord; onClose: () => void; onSave: (tags: string[]) => Promise<void>; saving: boolean; catalogue: ProcedureTagCatalogueState }) {
  const [value, setValue] = useState(record.tags.join(', '));
  const [error, setError] = useState('');
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setError('');
    try { await onSave(parseProcedureTags(value)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'L’enregistrement des tags a échoué.'); }
  }
  return <AppDialog title="Modifier les tags" description={record.title} icon={<Tags aria-hidden="true" size={20} />} size="sm" isBusy={saving} onClose={onClose} onSubmit={handleSubmit}
    footer={<div className="app-dialog__actions"><button className="sp-button sp-button--secondary" disabled={saving} onClick={onClose} type="button">Annuler</button><button className="sp-button sp-button--primary" disabled={saving} type="submit">{saving ? 'Enregistrement…' : 'Enregistrer'}</button></div>}>
    <ProcedureTagsField value={value} onChange={setValue} disabled={saving} catalogue={catalogue} />
    {error ? <p className="form-error" role="alert">{error}</p> : null}
  </AppDialog>;
}

interface ProcedureEditorProps {
  procedure: ProcedureRecord | null;
  procedures: ProcedureRecord[];
  projectOptions: ProcedureProjectOption[];
  vesselOptions: string[];
  vesselsLoading: boolean;
  vesselsError: string;
  tagCatalogue: ProcedureTagCatalogueState;
  onClose: () => void;
  onSave: (input: ProcedureInput, file: File | null, fromTemplate: boolean) => Promise<void>;
  saving: boolean;
}

function ProcedureEditor({ procedure, procedures, projectOptions, vesselOptions, vesselsLoading, vesselsError, tagCatalogue, onClose, onSave, saving }: ProcedureEditorProps) {
  const [form, setForm] = useState(() => procedure ? formFromProcedure(procedure) : {
    ...EMPTY_FORM, documentNumber: suggestNextProcedureNumber(procedures, EMPTY_FORM.theme), versionLabel: 'A',
  });
  const [file, setFile] = useState<File | null>(null);
  const [fromTemplate, setFromTemplate] = useState(false);
  const [fileError, setFileError] = useState('');
  const [tagsValue, setTagsValue] = useState(() => procedure?.tags.join(', ') || '');
  const generatedProcedureCode = buildProcedureCode(form.theme, form.documentNumber, form.versionLabel);
  const annualReviewDueOn = form.annualReview ? getAnnualReviewDueDate(form.diffusionOn) : '';
  const numberTaken = isProcedureNumberTaken(procedures, form.theme, form.documentNumber, procedure?.id);
  const suggestedNumber = suggestNextProcedureNumber(procedures, form.theme);
  const availableProjectOptions = useMemo(() => {
    return form.projectName && !projectOptions.some(option => option.label === form.projectName)
      ? [...projectOptions, { id: -1, label: form.projectName }]
      : projectOptions;
  }, [form.projectName, projectOptions]);

  function setValue<K extends keyof ProcedureInput>(key: K, value: ProcedureInput[K]) {
    setForm(current => ({ ...current, [key]: value }));
  }
  function setCreationMode(template: boolean) {
    if (template === fromTemplate) return;
    setFromTemplate(template);
    setFile(null);
    setFileError('');
  }
  function setTheme(theme: string) {
    setForm(current => ({ ...current, theme, documentNumber: theme ? suggestNextProcedureNumber(procedures, theme) : '' }));
  }
  function setChapter(ismChapter: ProcedureChapterKey) {
    const theme = ISM_CHAPTER_THEMES[ismChapter] || '';
    setForm(current => ({ ...current, ismChapter, theme,
      documentNumber: theme === current.theme ? current.documentNumber : theme ? suggestNextProcedureNumber(procedures, theme) : '',
    }));
  }
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || numberTaken) return;
    setFileError('');
    const versionLabel = form.versionLabel.trim().toUpperCase();
    try {
      await onSave({ ...form, tags: parseProcedureTags(tagsValue), versionLabel, revisionLabel: versionLabel, procedureCode: buildProcedureCode(form.theme, form.documentNumber, versionLabel) }, file, fromTemplate);
    } catch (error) {
      setFileError(error instanceof Error ? error.message : 'L’enregistrement du document a échoué.');
    }
  }

  return <div className="procedure-dialog-backdrop" role="presentation">
    <section aria-labelledby="procedure-editor-title" aria-modal="true" className="procedure-dialog procedure-editor-compact" role="dialog">
      <header><div className="procedure-dialog-identity"><span>QSMS · {procedure ? 'Modifier la fiche information' : 'Nouveau document'}</span>
        <h2 id="procedure-editor-title">{generatedProcedureCode || 'Référence à compléter'} - {form.title.trim() || 'Titre du document'}</h2>
      </div><button aria-label="Fermer" disabled={saving} onClick={onClose} type="button"><X size={19} /></button></header>
      <form onSubmit={handleSubmit}>
        <div className="procedure-form-body">
          <section className="procedure-form-section" aria-labelledby="procedure-identification-title">
            <header><FileText aria-hidden="true" size={18} /><h3 id="procedure-identification-title">Identification du document</h3></header>
            {!procedure ? <div className="procedure-creation-mode" role="group" aria-labelledby="procedure-document-type">
              <span id="procedure-document-type">Type de document</span>
              <div className="procedure-creation-options">
                <button type="button" aria-pressed={!fromTemplate} disabled={saving} onClick={() => setCreationMode(false)}><Upload aria-hidden="true" size={18} />Importer un fichier existant</button>
                <button type="button" aria-pressed={fromTemplate} disabled={saving} onClick={() => setCreationMode(true)}><FilePlus2 aria-hidden="true" size={18} />Nouvelle Procédure</button>
              </div>
              {fromTemplate ? <small>Modèle Procédure.docx · le nouveau document sera créé puis ouvert dans Word.</small> : null}
            </div> : null}
            <div className="procedure-form-grid procedure-chapter-field">
              <label className="procedure-form-wide">ISM Chapitre<select aria-label="ISM Chapitre" value={form.ismChapter} onChange={event => setChapter(event.target.value as ProcedureChapterKey)}>{CHAPTERS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            </div>
            <div className="procedure-form-grid procedure-identity-fields">
              <label>Thème<select aria-label="Thème" required value={form.theme} onChange={event => setTheme(event.target.value)}><option value="">Choisir</option>{THEMES.map(theme => <option key={theme}>{theme}</option>)}</select></label>
              <label>Numéro<input aria-label="Numéro" aria-describedby="procedure-number-help" aria-invalid={numberTaken || undefined} required inputMode="decimal" pattern="[0-9]+(?:\.[0-9]+)*" value={form.documentNumber} onChange={event => setValue('documentNumber', event.target.value)} /></label>
              <label>Version<input required maxLength={20} value={form.versionLabel} onChange={event => setValue('versionLabel', event.target.value.toUpperCase())} /></label>
              <label className="procedure-title-field">Titre<input required value={form.title} onChange={event => setValue('title', event.target.value)} /></label>
            </div>
            <small className={numberTaken ? 'procedure-field-error' : ''} id="procedure-number-help">{numberTaken ? `La combinaison ${form.theme} ${form.documentNumber.trim()} existe déjà.` : `Proposition pour ${form.theme || 'le thème'} : ${suggestedNumber || '—'}. Le numéro reste modifiable.`}</small>
            <div className="procedure-form-grid procedure-context-fields">
              <label>Navire<select aria-label="Navire" disabled={vesselsLoading} value={form.vesselName} onChange={event => setValue('vesselName', event.target.value)}>
                <option value="">Tous les navires (champ vide)</option>
                {form.vesselName && form.vesselName !== 'Armement' && !vesselOptions.includes(form.vesselName) ? <option value={form.vesselName}>{form.vesselName} (valeur actuelle)</option> : null}
                {vesselOptions.filter(name => name !== 'Armement').map(name => <option key={name}>{name}</option>)}
                <option value="Armement">Armement</option>
              </select>{vesselsError ? <small className="procedure-field-error" role="alert">{vesselsError}</small> : null}</label>
              <label>Projet<select aria-label="Projet" value={form.projectName} onChange={event => setValue('projectName', event.target.value)}><option value="">Aucun projet</option>{availableProjectOptions.map(option => <option key={option.id} value={option.label}>{option.label}</option>)}</select></label>
            </div>
          </section>
          <section className="procedure-form-section" aria-labelledby="procedure-lifecycle-title">
            <header><CalendarClock aria-hidden="true" size={18} /><h3 id="procedure-lifecycle-title">Validation et cycle de vie</h3></header>
            <div className="procedure-form-grid procedure-lifecycle-fields">
              <label>Statut<select value={form.status} onChange={event => setValue('status', event.target.value as ProcedureStatus)}><option value="draft">Brouillon</option><option value="review">En revue</option><option value="approved">Approuvée</option><option value="published">Publié</option><option value="archived">Archivée</option></select></label>
              <label>Date diffusion<input type="date" value={form.diffusionOn} onChange={event => setValue('diffusionOn', event.target.value)} /></label>
              <label className="procedure-review-toggle"><input checked={form.annualReview} type="checkbox" onChange={event => setValue('annualReview', event.target.checked)} /><span>Revue annuelle</span></label>
              {form.annualReview ? <div className="procedure-review-inline" role="status"><BellRing aria-hidden="true" size={16} /><span>{annualReviewDueOn ? `Échéance le ${formatDate(annualReviewDueOn)}` : 'Date de diffusion requise'}</span></div> : null}
            </div>
          </section>
          <section className="procedure-form-section" aria-labelledby="procedure-details-title">
            <header><BookOpenCheck aria-hidden="true" size={18} /><h3 id="procedure-details-title">Informations complémentaires</h3></header>
            <div className="procedure-form-grid"><label>Description<textarea rows={2} value={form.description} onChange={event => setValue('description', event.target.value)} /></label><label>Exigence réglementaire<textarea rows={2} value={form.regulatoryRequirement} onChange={event => setValue('regulatoryRequirement', event.target.value)} /></label></div>
            <ProcedureTagsField value={tagsValue} onChange={setTagsValue} disabled={saving} catalogue={tagCatalogue} />
          </section>
          {!fromTemplate ? <section className="procedure-form-section procedure-file-section" aria-labelledby="procedure-file-title">
            <header><Upload aria-hidden="true" size={18} /><div><h3 id="procedure-file-title">Importer un fichier</h3><p>Google Drive synchronisé · dossier Procedures</p></div></header>
            <label className="procedure-file-field"><span>{procedure ? 'Nouveau fichier (facultatif)' : 'Fichier à importer'}</span><input aria-label={procedure ? 'Nouveau fichier (facultatif)' : 'Fichier à importer'} accept={PROCEDURE_IMPORT_TYPES} required={!procedure} type="file" onChange={event => setFile(event.target.files?.[0] || null)} /><small>{file?.name || procedure?.fileName || 'Word, Excel, PowerPoint, OpenDocument, texte ou PDF · 25 Mo max.'}</small></label>
          </section> : null}
          {fileError ? <p className="form-error" role="alert">{fileError}</p> : null}
        </div>
        <footer><button className="procedure-button-secondary" disabled={saving} onClick={onClose} type="button">Annuler</button><button className="procedure-button-primary" disabled={saving || numberTaken} type="submit">{saving ? 'Enregistrement…' : fromTemplate ? 'Ouvrir' : 'Enregistrer'}</button></footer>
      </form>
    </section>
  </div>;
}

interface PublishDialogProps {
  procedure: ProcedureRecord;
  onClose: () => void;
  onPublish: () => Promise<void>;
  saving: boolean;
}

function PublishDialog({ procedure, onClose, onPublish, saving }: PublishDialogProps) {
  const diffusionOn = getProcedurePublicationDate();
  return (
    <div className="procedure-dialog-backdrop" role="presentation">
      <section aria-labelledby="procedure-publish-title" aria-modal="true" className="procedure-dialog procedure-publish-dialog" role="dialog">
        <header><div><span>Diffusion contrôlée</span><h2 id="procedure-publish-title">Confirmer la publication</h2></div><button aria-label="Fermer" onClick={onClose} type="button"><X size={19} /></button></header>
        <div className="procedure-publish-body">
          <ShieldCheck size={30} />
          <div><strong>Êtes-vous sûr de vouloir publier ce document ?</strong><p>{procedure.procedureCode || procedure.documentNumber} · {procedure.title}<br />Son statut deviendra « Publié » et sa date de diffusion sera fixée au {formatDate(diffusionOn)}. Seul le PDF sera accessible aux profils Armement, Capitaine et Marin.</p></div>
          <p>Enregistrez vos dernières modifications dans Office. Le fichier sera converti automatiquement en PDF dans SeaPilot\Procedures PDF.</p>
        </div>
        <footer><button className="procedure-button-secondary" disabled={saving} onClick={onClose} type="button">Non</button><button className="procedure-button-primary" disabled={saving} onClick={() => void onPublish()} type="button"><Send size={16} />{saving ? 'Conversion et publication…' : 'Oui, publier'}</button></footer>
      </section>
    </div>
  );
}

export function ProceduresPage({ client, roles, fileStore }: ProceduresPageProps) {
  const outletContext = useOutletContext<AppShellOutletContext | undefined>();
  const linkedPublicationId = Number(new URLSearchParams(window.location.search).get('document')) || null;
  const effectiveClient = client || outletContext?.client || supabase;
  const drive = useMemo(() => fileStore || createProcedureFileStore(effectiveClient), [effectiveClient, fileStore]);
  const effectiveRoles = roles || outletContext?.roles || [];
  const isManager = canManageProcedures(effectiveRoles);
  const [procedures, setProcedures] = useState<ProcedureRecord[]>([]);
  const [publications, setPublications] = useState<PublishedProcedureRecord[]>([]);
  const [procedureProjects, setProcedureProjects] = useState<ProcedureProjectOption[]>([]);
  const [catalogueTags, setCatalogueTags] = useState<string[]>([]);
  const [catalogueLoading, setCatalogueLoading] = useState(isManager);
  const [catalogueError, setCatalogueError] = useState('');
  const [catalogueRetry, setCatalogueRetry] = useState(0);
  const [isTagManagerOpen, setIsTagManagerOpen] = useState(false);
  const [fleetVessels, setFleetVessels] = useState<string[]>([]);
  const [vesselsLoading, setVesselsLoading] = useState(true);
  const [vesselsError, setVesselsError] = useState('');
  const [isListOpen, setIsListOpen] = useState(false);
  const [filters, setFilters] = useState<ProcedureFilterState>(EMPTY_FILTERS);
  const [view, setView] = useState<LibraryView>(linkedPublicationId ? 'published' : isManager ? 'sources' : 'published');
  const [selectedId, setSelectedId] = useState<number | null>(linkedPublicationId);
  const [collapsedChapters, setCollapsedChapters] = useState<Set<string>>(new Set());
  const [editorProcedure, setEditorProcedure] = useState<ProcedureRecord | 'new' | null>(null);
  const [publishTarget, setPublishTarget] = useState<ProcedureRecord | null>(null);
  const [tagsTarget, setTagsTarget] = useState<ProcedureRecord | PublishedProcedureRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isManager) {
      setView('published');
      setSelectedId(null);
      setEditorProcedure(null);
      setTagsTarget(null);
      setIsTagManagerOpen(false);
    }
  }, [isManager]);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    fetchProceduresData(effectiveClient, isManager)
      .then((data) => { if (mounted) { setProcedures(sortRecords(data.procedures)); setPublications(sortRecords(data.publications)); } })
      .catch(() => { if (mounted) setErrorMessage('Impossible de charger la bibliothèque QSMS.'); })
      .finally(() => { if (mounted) setIsLoading(false); });
    return () => { mounted = false; };
  }, [effectiveClient, isManager]);

  useEffect(() => {
    if (!isManager) {
      setCatalogueTags([]);
      setCatalogueLoading(false);
      setCatalogueError('');
      return undefined;
    }
    let mounted = true;
    setCatalogueLoading(true);
    setCatalogueError('');
    fetchProcedureTagCatalogue(effectiveClient)
      .then(names => { if (mounted) setCatalogueTags(names); })
      .catch(() => { if (mounted) setCatalogueError('Impossible de charger les tags pré-enregistrés.'); })
      .finally(() => { if (mounted) setCatalogueLoading(false); });
    return () => { mounted = false; };
  }, [effectiveClient, isManager, catalogueRetry]);

  useEffect(() => {
    if (!isManager) {
      setProcedureProjects([]);
      return undefined;
    }
    let mounted = true;
    fetchProcedureProjects(effectiveClient)
      .then((projects) => { if (mounted) setProcedureProjects(projects); })
      .catch(() => { if (mounted) setProcedureProjects([]); });
    return () => { mounted = false; };
  }, [effectiveClient, isManager]);

  useEffect(() => {
    let mounted = true;
    setVesselsLoading(true);
    setVesselsError('');
    setFleetVessels([]);
    fetchProcedureVessels(effectiveClient)
      .then((names) => { if (mounted) setFleetVessels(names); })
      .catch(() => { if (mounted) setVesselsError('Impossible de charger les navires de la flotte. Rechargez la page pour réessayer.'); })
      .finally(() => { if (mounted) setVesselsLoading(false); });
    return () => { mounted = false; };
  }, [effectiveClient]);

  const activeRecords = isManager && view === 'sources' ? procedures : publications;
  const filteredRecords = useMemo(() => activeRecords.filter((record) => matchesFilters(record, filters)), [activeRecords, filters]);
  const projects = useMemo(() => [...new Set(activeRecords.flatMap((record) => projectNames(record.projectName)))].sort(), [activeRecords]);
  const vessels = useMemo(() => [...new Set([...fleetVessels, ...activeRecords.map((record) => record.vesselName.trim()).filter(Boolean)])].sort(compareFleetNames), [activeRecords, fleetVessels]);
  const selectedProcedure = procedures.find((procedure) => procedure.id === selectedId) || null;
  const metrics = useMemo(() => buildProcedureMetrics({ procedures, publications }), [procedures, publications]);
  const tagCatalogue: ProcedureTagCatalogueState = { names: catalogueTags, loading: catalogueLoading, error: catalogueError, onRetry: () => setCatalogueRetry(current => current + 1) };

  function updateFilter(key: keyof ProcedureFilterState, value: string) { setFilters((current) => ({ ...current, [key]: value })); }
  function toggleChapter(key: string) { setCollapsedChapters((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; }); }
  function flash(message: string) { setStatusMessage(message); setErrorMessage(null); }
  function fail(message: string) { setErrorMessage(message); setStatusMessage(null); }
  async function refreshCatalogueAfterSave() {
    if (!isManager) return;
    setCatalogueLoading(true);
    setCatalogueError('');
    try { setCatalogueTags(await fetchProcedureTagCatalogue(effectiveClient)); }
    catch { setCatalogueError('Le document est enregistré, mais le rechargement des tags pré-enregistrés a échoué.'); }
    finally { setCatalogueLoading(false); }
  }

  async function handleCreateCatalogueTag(name: string): Promise<string> {
    if (!isManager) throw new Error('La gestion des tags est réservée à l’Administration et à la Direction.');
    const created = await createProcedureTag(effectiveClient, name);
    setCatalogueTags(current => normalizeProcedureTags([...current, created]).sort((left, right) => left.localeCompare(right, 'fr')));
    return created;
  }

  async function handleRemoveCatalogueTag(name: string) {
    if (!isManager) throw new Error('La gestion des tags est réservée à l’Administration et à la Direction.');
    await removeProcedureTag(effectiveClient, name);
    const key = normalizeProcedureSearch(name);
    setCatalogueTags(current => current.filter(tag => normalizeProcedureSearch(tag) !== key));
  }

  async function handleSave(input: ProcedureInput, file: File | null, fromTemplate: boolean) {
    setIsSaving(true);
    let createdFilePath = '';
    try {
      if (fromTemplate || file) {
        const connection = drive.connect();
        // Attach rejection immediately while the model/file is being prepared.
        const [session, sourceFile] = await Promise.all([connection, fromTemplate ? createProcedureTemplateFile('', procedureDriveFilename(input).replace(/\.docx$/, '')) : Promise.resolve(file!)]);
        input = { ...input, driveSource: await drive.write(input, sourceFile, session) };
        createdFilePath = input.driveSource!.path;
      }
      if (editorProcedure === 'new') {
        if (!input.driveSource) throw new Error('Sélectionnez le fichier à importer.');
        const created = await createProcedure(effectiveClient, input, null);
        void refreshCatalogueAfterSave();
        setProcedures((current) => sortRecords([...current, created]));
        flash('Document QSMS ajouté.');
        setEditorProcedure(null);
        if (fromTemplate) {
          try { await drive.open(created); }
          catch (error) { fail(`Le document est enregistré dans Procedures/${createdFilePath}, mais son ouverture a échoué. ${error instanceof Error ? error.message : ''}`); }
        }
      } else if (editorProcedure) {
        const updated = await updateProcedure(effectiveClient, editorProcedure, input, null);
        void refreshCatalogueAfterSave();
        setProcedures((current) => sortRecords(current.map((item) => item.id === updated.id ? updated : item)));
        setPublications((current) => current.map((item) => item.procedureId === updated.id ? { ...item, tags: updated.tags } : item));
        flash('Informations mises à jour.');
      }
      setEditorProcedure(null);
    } catch (error) {
      throw new Error(isProcedureNumberConflict(error)
        ? 'Cette combinaison Thème + Numéro existe déjà. Choisissez un autre numéro.'
        : `${error instanceof Error ? error.message : 'L’enregistrement du document a échoué.'}${createdFilePath ? ` Le fichier créé reste dans Procedures/${createdFilePath}.` : ''}`);
    }
    finally { setIsSaving(false); }
  }

  async function handleSaveTags(values: string[]) {
    if (!tagsTarget || !isManager) return;
    setIsSaving(true);
    const tags = normalizeProcedureTags(values);
    try {
      await updateProcedureTags(effectiveClient, tagsTarget, tags);
      void refreshCatalogueAfterSave();
      const sourceId = 'procedureId' in tagsTarget ? tagsTarget.procedureId : tagsTarget.id;
      if (sourceId !== null) {
        setProcedures(current => current.map(item => item.id === sourceId ? { ...item, tags } : item));
      }
      setPublications(current => current.map(item => (sourceId === null ? item.id === tagsTarget.id : item.procedureId === sourceId) ? { ...item, tags } : item));
      setTagsTarget(null);
      flash('Tags mis à jour.');
    } finally { setIsSaving(false); }
  }

  async function handlePublish() {
    if (!publishTarget) return;
    setIsSaving(true);
    try {
      const converted = await drive.publish(publishTarget);
      const publication = await publishProcedure(effectiveClient, publishTarget, converted);
      setPublications((current) => sortRecords([publication, ...current]));
      setProcedures((current) => current.map((item) => item.id === publishTarget.id ? {
        ...item, status: 'published', publishedOn: publication.publishedOn, diffusionOn: publication.diffusionOn,
      } : item));
      setPublishTarget(null);
      flash('PDF publié pour les profils Armement, Capitaine et Marin.');
    } catch (error) { fail(error instanceof Error ? error.message : 'La publication du PDF a échoué.'); setPublishTarget(null); }
    finally { setIsSaving(false); }
  }

  async function handleOpen(record: ProcedureRecord | PublishedProcedureRecord) {
    try {
      if (record.googleDrivePath) {
        if ('procedureId' in record) showProcedureBlob(await drive.read(record), record.fileName, false);
        else await drive.open(record);
        return;
      }
      const fileUrl = await getProcedureFileUrl(effectiveClient, record, 'open');
      const opensDesktopApp = /^(ms-(word|excel|powerpoint):|seapilot-drive:)/.test(fileUrl);
      window.open(fileUrl, opensDesktopApp ? '_self' : '_blank', opensDesktopApp ? undefined : 'noopener,noreferrer');
    }
    catch (error) { fail(error instanceof Error ? error.message : "Le fichier n'est pas disponible."); }
  }

  async function handleDownload(record: ProcedureRecord | PublishedProcedureRecord) {
    try {
      if (record.googleDriveFileId) {
        window.open(await getProcedureFileUrl(effectiveClient, record, 'download'), '_blank', 'noopener,noreferrer');
        return;
      }
      if (record.googleDrivePath) { showProcedureBlob(await drive.read(record), record.fileName, true); return; }
      window.open(await getProcedureFileUrl(effectiveClient, record, 'download'), '_blank', 'noopener,noreferrer');
    }
    catch (error) { fail(error instanceof Error ? error.message : "Le fichier n'est pas disponible."); }
  }

  async function handleDeleteSource(procedure: ProcedureRecord) {
    if (!window.confirm(procedure.googleDrivePath
      ? `Supprimer la fiche « ${procedure.title} » et ses publications ? Le fichier Google Drive sera conservé.`
      : `Supprimer « ${procedure.title} » et ses publications ?`)) return;
    try {
      const linked = publications.filter((item) => item.procedureId === procedure.id);
      await deleteProcedure(effectiveClient, procedure, linked);
      setProcedures((current) => current.filter((item) => item.id !== procedure.id));
      setPublications((current) => current.filter((item) => item.procedureId !== procedure.id));
      setSelectedId(null);
      flash('Document supprimé.');
    } catch { fail('La suppression a échoué.'); }
  }

  async function handleDeletePublication(publication: PublishedProcedureRecord) {
    if (!window.confirm(`Retirer la publication « ${publication.title} » ?`)) return;
    try {
      await deletePublishedProcedure(effectiveClient, publication);
      setPublications((current) => current.filter((item) => item.id !== publication.id));
      flash('Publication retirée.');
    } catch { fail('La suppression de la publication a échoué.'); }
  }

  if (isLoading) return <div className="admin-state">Chargement des procédures QHSE…</div>;

  return (
    <section className="procedures-page">
      <header className="procedure-hero">
        <div><p className="module-family">QHSE</p><h1>Procédures QHSE</h1><p>Bibliothèque QSMS classée par chapitre ISM, avec publication PDF et suivi des documents diffusés.</p></div>
        <div className="procedure-hero-stats"><span><BookOpenCheck size={17} /><strong>{isManager ? metrics.totalProcedures : metrics.publishedProcedures}</strong>{isManager ? 'documents de travail' : 'PDF disponibles'}</span><span><FileCheck2 size={17} /><strong>{metrics.publishedProcedures}</strong>publications</span></div>
      </header>

      <div aria-live="polite" className="admin-notices">{statusMessage ? <p className="admin-success">{statusMessage}</p> : null}{errorMessage ? <p className="form-error">{errorMessage}</p> : null}</div>

      <section aria-label="Filtres des procédures" className="procedure-filter-bar">
        <label className="procedure-search"><span>Recherche de document</span><div><Search size={16} /><input aria-label="Recherche de document" placeholder="Nom, numéro, thème, projet, navire, tags…" value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} /></div></label>
        <label><span>Projet</span><select aria-label="Projet" value={filters.project} onChange={(event) => updateFilter('project', event.target.value)}><option value="">Tous les projets</option>{projects.map((project) => <option key={project}>{project}</option>)}</select></label>
        <label><span>Navire</span><select aria-label="Navire" value={filters.vessel} onChange={(event) => updateFilter('vessel', event.target.value)}><option value="">Tous les navires</option>{vessels.map((vessel) => <option key={vessel}>{vessel}</option>)}</select></label>
      </section>

      <section className="procedure-library">
        <div className="procedure-library-heading">
          <div><h2>{view === 'sources' ? 'QSMS' : 'Procédures publiées'}</h2><span>{view === 'sources' ? 'Documents de travail privés' : 'PDF diffusés'}</span></div>
          <strong>{filteredRecords.length}</strong>
        </div>

        <div className="procedure-list-action"><button className="procedure-button-secondary" disabled={!activeRecords.length} onClick={() => setIsListOpen(true)} type="button"><ListChecks size={17} />Générer une liste des documents</button></div>

        {isManager ? (
          <div className="procedure-toolbar">
            <div><strong>{selectedProcedure ? '1 document sélectionné' : '0 document sélectionné'}</strong><small>{filteredRecords.length} document(s) affiché(s)</small></div>
            <button className={view === 'sources' ? 'is-active' : ''} onClick={() => { setView('sources'); setSelectedId(null); }} type="button"><List size={16} />Documents de travail</button>
            <button className={view === 'published' ? 'is-active' : ''} onClick={() => { setView('published'); setSelectedId(null); }} type="button"><FileCheck2 size={16} />PDF publiés</button>
            <button className="procedure-primary-action" onClick={() => setEditorProcedure('new')} type="button"><FilePlus2 size={17} />Nouveau document</button>
            <button onClick={() => setIsTagManagerOpen(true)} type="button"><Tags aria-hidden="true" size={16} />Gérer les tags</button>
            <button disabled={!selectedProcedure || view !== 'sources'} onClick={() => selectedProcedure && setEditorProcedure(selectedProcedure)} type="button"><Edit3 size={16} />Modifier</button>
            <button disabled={!selectedProcedure || view !== 'sources'} onClick={() => selectedProcedure && setPublishTarget(selectedProcedure)} type="button"><Send size={16} />Publier PDF</button>
            <button disabled={!selectedProcedure || view !== 'sources'} onClick={() => selectedProcedure && void handleDownload(selectedProcedure)} type="button"><Download size={16} />{selectedProcedure?.googleDriveFileId ? 'Voir dans Drive' : 'Télécharger'}</button>
            <button className="procedure-danger-action" disabled={!selectedProcedure || view !== 'sources'} onClick={() => selectedProcedure && void handleDeleteSource(selectedProcedure)} type="button"><Trash2 size={16} />Supprimer</button>
          </div>
        ) : <div className="procedure-public-notice"><ShieldCheck size={17} /><span>Vous consultez uniquement les versions PDF approuvées et publiées.</span></div>}


        <div className="procedure-chapters">
          {CHAPTERS.map(([key, label]) => {
            const records = filteredRecords.filter((record) => chapterKey(record.ismChapter) === key);
            if (records.length === 0) return null;
            const collapsed = collapsedChapters.has(key);
            return (
              <section className="procedure-chapter" key={key}>
                <button aria-expanded={!collapsed} className="procedure-chapter-heading" onClick={() => toggleChapter(key)} type="button">{collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}<ProcedureChapterIcon chapter={key} /><strong>{label}</strong><em>{records.length}</em></button>
                {!collapsed ? <div className="procedure-document-list">{records.map((record) => {
                  const publication = 'procedureId' in record ? record as PublishedProcedureRecord : null;
                  const source = publication ? null : record as ProcedureRecord;
                  const linkedPublication = source ? publications.find((item) => item.procedureId === source.id) : null;
                  const recordProjects = projectNames(record.projectName);
                  const reviewAlert = getAnnualReviewAlert(record.annualReview, record.diffusionOn);
                  return (
                    <article className={`${selectedId === record.id ? 'is-selected ' : ''}${!source || !isManager ? 'procedure-document-public ' : ''}${reviewAlert ? `is-review-due is-review-${reviewAlert.tone}` : ''}`.trim()} key={`${view}-${record.id}`}>
                      {source && isManager ? <input aria-label={`Sélectionner ${record.title}`} checked={selectedId === record.id} type="checkbox" onChange={() => setSelectedId((current) => current === record.id ? null : record.id)} /> : null}
                      <span className="procedure-document-icon"><FileText size={18} /></span>
                      <div className="procedure-document-copy">
                        <button aria-label={`Ouvrir ${record.procedureCode || record.documentNumber || ''} ${record.title}`.trim()} className="procedure-document-name" onClick={() => void handleOpen(record)} type="button"><strong>{record.procedureCode || record.documentNumber || 'Sans numéro'} <span>{record.title}</span></strong></button>
                        {record.vesselName || recordProjects.length > 0 ? (
                          <div className="procedure-document-metadata">
                            <span className="procedure-document-scopes">
                              {record.vesselName ? <span><b>Navire :</b>{record.vesselName}</span> : null}
                              {recordProjects.map((projectName) => <span key={projectName}><b>Projet :</b>{projectName}</span>)}
                            </span>
                          </div>
                        ) : null}
                        {record.tags.length ? <ul aria-label={`Tags de ${record.title}`} className="procedure-tag-list">{record.tags.map(tag => <li className="procedure-tag" key={tag}>{tag}</li>)}</ul> : null}
                      </div>
                      <div className="procedure-document-status">{reviewAlert ? <strong className={`procedure-review-badge is-${reviewAlert.tone}`}><BellRing aria-hidden="true" size={12} />{reviewAlert.label}</strong> : null}{publication || linkedPublication ? <strong className="is-published">Document publié le {formatDate((publication || linkedPublication)?.publishedOn || '')}</strong> : <span className={`procedure-status-${record.status}`}>{getProcedureStatusLabel(record.status)}</span>}<small>{humanFileSize(record.sizeBytes)}</small></div>
                      <div className="procedure-row-actions">
                        <button aria-label={`${source?.googleDriveFileId ? 'Voir dans Drive' : 'Télécharger'} ${record.title}`} onClick={() => void handleDownload(record)} type="button"><Download size={16} /></button>
                        {isManager ? <button aria-label={`Modifier les tags ${record.title}`} onClick={() => setTagsTarget(record)} type="button"><Tags aria-hidden="true" size={16} /></button> : null}
                        {source && isManager ? <><button aria-label={`Modifier ${record.title}`} onClick={() => setEditorProcedure(source)} type="button"><Edit3 size={16} /></button><button aria-label={`Publier ${record.title}`} onClick={() => setPublishTarget(source)} type="button"><Send size={16} /></button><button aria-label={`Supprimer ${record.title}`} className="danger" onClick={() => void handleDeleteSource(source)} type="button"><Trash2 size={16} /></button></> : null}
                        {publication && isManager ? <button aria-label={`Retirer ${record.title}`} className="danger" onClick={() => void handleDeletePublication(publication)} type="button"><Trash2 size={16} /></button> : null}
                      </div>
                    </article>
                  );
                })}</div> : null}
              </section>
            );
          })}
          {filteredRecords.length === 0 ? <div className="procedure-empty"><FileText size={28} /><strong>Aucun document ne correspond aux filtres.</strong><button onClick={() => setFilters(EMPTY_FILTERS)} type="button">Réinitialiser les filtres</button></div> : null}
        </div>
      </section>

      {isManager && editorProcedure ? <ProcedureEditor procedure={editorProcedure === 'new' ? null : editorProcedure} procedures={procedures} projectOptions={procedureProjects} vesselOptions={fleetVessels} vesselsLoading={vesselsLoading} vesselsError={vesselsError} tagCatalogue={tagCatalogue} onClose={() => setEditorProcedure(null)} onSave={handleSave} saving={isSaving} /> : null}
      {isManager && tagsTarget ? <ProcedureTagsDialog record={tagsTarget} onClose={() => setTagsTarget(null)} onSave={handleSaveTags} saving={isSaving} catalogue={tagCatalogue} /> : null}
      {isManager && isTagManagerOpen ? <ProcedureTagCatalogueDialog names={catalogueTags} loading={catalogueLoading} loadError={catalogueError} onRetry={tagCatalogue.onRetry} onCreate={handleCreateCatalogueTag} onRemove={handleRemoveCatalogueTag} onClose={() => setIsTagManagerOpen(false)} /> : null}
      {isListOpen ? <ProcedureListDialog records={activeRecords} vessels={vessels} initialVessel={filters.vessel} library={isManager ? view : 'published'} onClose={() => setIsListOpen(false)} /> : null}
      {publishTarget ? <PublishDialog procedure={publishTarget} onClose={() => setPublishTarget(null)} onPublish={handlePublish} saving={isSaving} /> : null}
    </section>
  );
}
