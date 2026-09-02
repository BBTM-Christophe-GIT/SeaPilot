import type { SupabaseClient } from '@supabase/supabase-js';
import {
  BookOpenCheck,
  ChevronDown,
  ChevronRight,
  Download,
  Edit3,
  FileCheck2,
  FilePlus2,
  FileText,
  List,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import type { RoleKey } from '../permissions/roles';
import type { AppShellOutletContext } from '../shell/AppShell';
import {
  buildProcedureMetrics,
  createProcedure,
  deleteProcedure,
  deletePublishedProcedure,
  fetchProceduresData,
  getProcedureFileUrl,
  getProcedureStatusLabel,
  publishProcedure,
  updateProcedure,
  type ProcedureInput,
  type ProcedureRecord,
  type ProcedureStatus,
  type PublishedProcedureRecord,
} from './procedureQueries';

interface ProceduresPageProps {
  client?: SupabaseClient;
  roles?: RoleKey[];
}

interface ProcedureFilterState {
  search: string;
  project: string;
  vessel: string;
}

type LibraryView = 'sources' | 'published';

const CHAPTERS = [
  ['01', '01 - Généralités'],
  ['02', "02 - Politique en Matière de Sécurité et de Protection de l'Environnement"],
  ['03', '03 - Responsabilité et Autorité de la Compagnie'],
  ['04', '04 - Personne(s) Désignée(s)'],
  ['05', '05 - Responsabilité et Autorité du Capitaine'],
  ['06', '06 - Ressources et Personnel'],
  ['07', '07 - Établissement de Plans pour les Opérations à Bord'],
  ['08', "08 - Préparation aux Situations d'Urgence"],
  ['09', '09 - Rapports et Analyse des Non-conformités, Accidents et Incidents'],
  ['10', '10 - Maintenance du Navire et de son Équipement'],
  ['11', '11 - Documentation'],
  ['12', '12 - Vérification, Examen et Évaluation de la Compagnie'],
  ['13', '13 - Certification, Vérification et Contrôle'],
  ['uncontrolled', 'Documents non contrôlés'],
] as const;

const THEMES = ['ADM', 'AUT', 'DNC', 'DPA', 'GEN', 'OPE', 'POL', 'RAC', 'REP', 'SEC', 'SMS', 'TEC', 'URG', 'VPC'];
const DOCUMENT_TYPES = ['FOR', 'GEN', 'MAN', 'PRO', 'REG'];

const EMPTY_FILTERS: ProcedureFilterState = { search: '', project: '', vessel: '' };
const EMPTY_FORM: ProcedureInput = {
  procedureCode: '', title: '', status: 'draft', revisionLabel: '', diffusionOn: '', categoryLabel: '',
  description: '', regulatoryRequirement: '', ismChapter: '01', vesselName: '', projectName: '', documentNumber: '',
  restrictions: '', annualReview: false, approvalStatus: 'En cours de creation', theme: '', documentType: '',
  bridgeWatch: false, versionLabel: '', notes: '',
};

function canManageProcedures(roles: RoleKey[]): boolean {
  return roles.some((role) => role === 'admin' || role === 'direction');
}

function normalizeSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function chapterKey(value: string): string {
  const match = value.match(/^\s*(0[1-9]|1[0-3])/);
  return match?.[1] || 'uncontrolled';
}

function matchesFilters(record: ProcedureRecord, filters: ProcedureFilterState): boolean {
  if (filters.project && record.projectName !== filters.project) return false;
  if (filters.vessel && record.vesselName !== filters.vessel) return false;
  if (!filters.search) return true;
  const searchable = normalizeSearch([
    record.title, record.procedureCode, record.documentNumber, record.theme, record.ismChapter, record.description,
  ].join(' '));
  return searchable.includes(normalizeSearch(filters.search));
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
    approvalStatus: procedure.approvalStatus,
    theme: procedure.theme,
    documentType: procedure.documentType,
    bridgeWatch: procedure.bridgeWatch,
    versionLabel: procedure.versionLabel,
    notes: procedure.notes,
  };
}

interface ProcedureEditorProps {
  procedure: ProcedureRecord | null;
  onClose: () => void;
  onSave: (input: ProcedureInput, file: File | null) => Promise<void>;
  saving: boolean;
}

function ProcedureEditor({ procedure, onClose, onSave, saving }: ProcedureEditorProps) {
  const [form, setForm] = useState(() => procedure ? formFromProcedure(procedure) : EMPTY_FORM);
  const [file, setFile] = useState<File | null>(null);

  function setValue<K extends keyof ProcedureInput>(key: K, value: ProcedureInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSave(form, file);
  }

  return (
    <div className="procedure-dialog-backdrop" role="presentation">
      <section aria-labelledby="procedure-editor-title" aria-modal="true" className="procedure-dialog" role="dialog">
        <header>
          <div>
            <span>QSMS · Document de travail</span>
            <h2 id="procedure-editor-title">{procedure ? 'Modifier les informations' : 'Nouveau document'}</h2>
          </div>
          <button aria-label="Fermer" onClick={onClose} type="button"><X size={19} /></button>
        </header>
        <form onSubmit={handleSubmit}>
          <div className="procedure-form-grid">
            <label>Titre<input required value={form.title} onChange={(event) => setValue('title', event.target.value)} /></label>
            <label>Numéro<input value={form.documentNumber} onChange={(event) => setValue('documentNumber', event.target.value)} /></label>
            <label>Thème<select value={form.theme} onChange={(event) => setValue('theme', event.target.value)}><option value="">Non renseigné</option>{THEMES.map((theme) => <option key={theme}>{theme}</option>)}</select></label>
            <label>Type document<select value={form.documentType} onChange={(event) => setValue('documentType', event.target.value)}><option value="">Non renseigné</option>{DOCUMENT_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
            <label className="procedure-form-wide">ISM Chapitre<select value={form.ismChapter} onChange={(event) => setValue('ismChapter', event.target.value)}>{CHAPTERS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <label>Projet<input value={form.projectName} onChange={(event) => setValue('projectName', event.target.value)} /></label>
            <label>Navire<input value={form.vesselName} onChange={(event) => setValue('vesselName', event.target.value)} /></label>
            <label>Version<input value={form.versionLabel} onChange={(event) => setValue('versionLabel', event.target.value)} /></label>
            <label>Statut<select value={form.status} onChange={(event) => setValue('status', event.target.value as ProcedureStatus)}><option value="draft">Brouillon</option><option value="review">En revue</option><option value="approved">Approuvée</option><option value="archived">Archivée</option></select></label>
            <label>Date diffusion<input type="date" value={form.diffusionOn} onChange={(event) => setValue('diffusionOn', event.target.value)} /></label>
            <label>Catégorie<input value={form.categoryLabel} onChange={(event) => setValue('categoryLabel', event.target.value)} /></label>
            <label>Statut d'approbation<select value={form.approvalStatus} onChange={(event) => setValue('approvalStatus', event.target.value)}><option>En cours de creation</option><option>En cours de validation</option><option>Document approuve</option><option>Archive</option></select></label>
            <label>Code procédure<input value={form.procedureCode} onChange={(event) => setValue('procedureCode', event.target.value)} /></label>
            <label className="procedure-form-check"><input checked={form.annualReview} type="checkbox" onChange={(event) => setValue('annualReview', event.target.checked)} /> Revue annuelle</label>
            <label className="procedure-form-check"><input checked={form.bridgeWatch} type="checkbox" onChange={(event) => setValue('bridgeWatch', event.target.checked)} /> Veille Passerelle</label>
            <label className="procedure-form-wide">Description<textarea value={form.description} onChange={(event) => setValue('description', event.target.value)} /></label>
            <label className="procedure-form-wide">Exigence réglementaire<textarea value={form.regulatoryRequirement} onChange={(event) => setValue('regulatoryRequirement', event.target.value)} /></label>
            <label className="procedure-form-wide">Restrictions<textarea value={form.restrictions} onChange={(event) => setValue('restrictions', event.target.value)} /></label>
            <label className="procedure-form-wide">Notes<textarea value={form.notes} onChange={(event) => setValue('notes', event.target.value)} /></label>
            <label className="procedure-file-field procedure-form-wide">
              <Upload size={18} />
              <span>{procedure ? 'Remplacer le fichier source (facultatif)' : 'Fichier source modifiable'}</span>
              <input accept=".doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.txt" required={!procedure} type="file" onChange={(event) => setFile(event.target.files?.[0] || null)} />
              <small>{file?.name || procedure?.fileName || 'Word, Excel, PowerPoint ou OpenDocument · 50 Mo max.'}</small>
            </label>
          </div>
          <footer><button className="procedure-button-secondary" onClick={onClose} type="button">Annuler</button><button className="procedure-button-primary" disabled={saving} type="submit">{saving ? 'Enregistrement…' : 'Enregistrer'}</button></footer>
        </form>
      </section>
    </div>
  );
}

interface PublishDialogProps {
  procedure: ProcedureRecord;
  onClose: () => void;
  onPublish: (file: File) => Promise<void>;
  saving: boolean;
}

function PublishDialog({ procedure, onClose, onPublish, saving }: PublishDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  return (
    <div className="procedure-dialog-backdrop" role="presentation">
      <section aria-labelledby="procedure-publish-title" aria-modal="true" className="procedure-dialog procedure-publish-dialog" role="dialog">
        <header><div><span>Diffusion contrôlée</span><h2 id="procedure-publish-title">Publier le PDF</h2></div><button aria-label="Fermer" onClick={onClose} type="button"><X size={19} /></button></header>
        <div className="procedure-publish-body">
          <ShieldCheck size={30} />
          <div><strong>{procedure.procedureCode || procedure.documentNumber} · {procedure.title}</strong><p>Le PDF sera accessible aux profils Armement, Capitaine et Marin. Le fichier source reste privé.</p></div>
          <label className="procedure-file-field"><Upload size={18} /><span>PDF à diffuser</span><input accept="application/pdf,.pdf" required type="file" onChange={(event) => setFile(event.target.files?.[0] || null)} /><small>{file?.name || 'Sélectionnez la version PDF approuvée.'}</small></label>
        </div>
        <footer><button className="procedure-button-secondary" onClick={onClose} type="button">Annuler</button><button className="procedure-button-primary" disabled={!file || saving} onClick={() => file && void onPublish(file)} type="button"><Send size={16} />{saving ? 'Publication…' : 'Publier'}</button></footer>
      </section>
    </div>
  );
}

export function ProceduresPage({ client, roles }: ProceduresPageProps) {
  const outletContext = useOutletContext<AppShellOutletContext | undefined>();
  const effectiveClient = client || outletContext?.client || supabase;
  const effectiveRoles = roles || outletContext?.roles || [];
  const isManager = canManageProcedures(effectiveRoles);
  const [procedures, setProcedures] = useState<ProcedureRecord[]>([]);
  const [publications, setPublications] = useState<PublishedProcedureRecord[]>([]);
  const [filters, setFilters] = useState<ProcedureFilterState>(EMPTY_FILTERS);
  const [view, setView] = useState<LibraryView>(isManager ? 'sources' : 'published');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [collapsedChapters, setCollapsedChapters] = useState<Set<string>>(new Set());
  const [editorProcedure, setEditorProcedure] = useState<ProcedureRecord | 'new' | null>(null);
  const [publishTarget, setPublishTarget] = useState<ProcedureRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isManager) {
      setView('published');
      setSelectedId(null);
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

  const activeRecords = view === 'sources' ? procedures : publications;
  const filteredRecords = useMemo(() => activeRecords.filter((record) => matchesFilters(record, filters)), [activeRecords, filters]);
  const projects = useMemo(() => [...new Set(activeRecords.map((record) => record.projectName).filter(Boolean))].sort(), [activeRecords]);
  const vessels = useMemo(() => [...new Set(activeRecords.map((record) => record.vesselName).filter(Boolean))].sort(), [activeRecords]);
  const selectedProcedure = procedures.find((procedure) => procedure.id === selectedId) || null;
  const metrics = useMemo(() => buildProcedureMetrics({ procedures, publications }), [procedures, publications]);

  function updateFilter(key: keyof ProcedureFilterState, value: string) { setFilters((current) => ({ ...current, [key]: value })); }
  function toggleChapter(key: string) { setCollapsedChapters((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; }); }
  function flash(message: string) { setStatusMessage(message); setErrorMessage(null); }
  function fail(message: string) { setErrorMessage(message); setStatusMessage(null); }

  async function handleSave(input: ProcedureInput, file: File | null) {
    setIsSaving(true);
    try {
      if (editorProcedure === 'new') {
        if (!file) throw new Error('Fichier source manquant');
        const created = await createProcedure(effectiveClient, input, file);
        setProcedures((current) => sortRecords([...current, created]));
        flash('Document QSMS ajouté.');
      } else if (editorProcedure) {
        const updated = await updateProcedure(effectiveClient, editorProcedure, input, file);
        setProcedures((current) => sortRecords(current.map((item) => item.id === updated.id ? updated : item)));
        flash('Informations mises à jour.');
      }
      setEditorProcedure(null);
    } catch { fail("L'enregistrement du document a échoué."); }
    finally { setIsSaving(false); }
  }

  async function handlePublish(file: File) {
    if (!publishTarget) return;
    setIsSaving(true);
    try {
      const publication = await publishProcedure(effectiveClient, publishTarget, file);
      setPublications((current) => sortRecords([publication, ...current]));
      setProcedures((current) => current.map((item) => item.id === publishTarget.id ? { ...item, status: 'approved', publishedOn: publication.publishedOn, approvalStatus: 'Document approuve' } : item));
      setPublishTarget(null);
      flash('PDF publié pour les profils Armement, Capitaine et Marin.');
    } catch { fail('La publication du PDF a échoué.'); }
    finally { setIsSaving(false); }
  }

  async function handleOpen(record: ProcedureRecord | PublishedProcedureRecord) {
    try { window.open(await getProcedureFileUrl(effectiveClient, record, 'open'), '_blank', 'noopener,noreferrer'); }
    catch { fail("Le fichier n'est pas disponible."); }
  }

  async function handleDownload(record: ProcedureRecord | PublishedProcedureRecord) {
    try { window.open(await getProcedureFileUrl(effectiveClient, record, 'download'), '_blank', 'noopener,noreferrer'); }
    catch { fail("Le fichier n'est pas disponible."); }
  }

  async function handleDeleteSource(procedure: ProcedureRecord) {
    if (!window.confirm(`Supprimer « ${procedure.title} » et ses publications ?`)) return;
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
        <label className="procedure-search"><span>Recherche de document</span><div><Search size={16} /><input aria-label="Recherche de document" placeholder="Nom, numéro, thème, chapitre…" value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} /></div></label>
        <label><span>Projet</span><select aria-label="Projet" value={filters.project} onChange={(event) => updateFilter('project', event.target.value)}><option value="">Tous les projets</option>{projects.map((project) => <option key={project}>{project}</option>)}</select></label>
        <label><span>Navire</span><select aria-label="Navire" value={filters.vessel} onChange={(event) => updateFilter('vessel', event.target.value)}><option value="">Tous les navires</option>{vessels.map((vessel) => <option key={vessel}>{vessel}</option>)}</select></label>
      </section>

      <section className="procedure-library">
        <div className="procedure-library-heading">
          <div><h2>{view === 'sources' ? 'QSMS' : 'Procédures publiées'}</h2><span>{view === 'sources' ? 'Documents de travail privés' : 'PDF diffusés'}</span></div>
          <strong>{filteredRecords.length}</strong>
        </div>

        {isManager ? (
          <div className="procedure-toolbar">
            <div><strong>{selectedProcedure ? '1 document sélectionné' : '0 document sélectionné'}</strong><small>{filteredRecords.length} document(s) affiché(s)</small></div>
            <button className={view === 'sources' ? 'is-active' : ''} onClick={() => { setView('sources'); setSelectedId(null); }} type="button"><List size={16} />Documents de travail</button>
            <button className={view === 'published' ? 'is-active' : ''} onClick={() => { setView('published'); setSelectedId(null); }} type="button"><FileCheck2 size={16} />PDF publiés</button>
            <button className="procedure-primary-action" onClick={() => setEditorProcedure('new')} type="button"><FilePlus2 size={17} />Nouveau document</button>
            <button disabled={!selectedProcedure || view !== 'sources'} onClick={() => selectedProcedure && setEditorProcedure(selectedProcedure)} type="button"><Edit3 size={16} />Modifier</button>
            <button disabled={!selectedProcedure || view !== 'sources'} onClick={() => selectedProcedure && setPublishTarget(selectedProcedure)} type="button"><Send size={16} />Publier PDF</button>
            <button disabled={!selectedProcedure || view !== 'sources'} onClick={() => selectedProcedure && void handleDownload(selectedProcedure)} type="button"><Download size={16} />Télécharger</button>
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
                <button aria-expanded={!collapsed} className="procedure-chapter-heading" onClick={() => toggleChapter(key)} type="button">{collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}<span className="procedure-chapter-icon">{key === 'uncontrolled' ? <FileText size={16} /> : <ShieldCheck size={16} />}</span><strong>{label}</strong><em>{records.length}</em></button>
                {!collapsed ? <div className="procedure-document-list">{records.map((record) => {
                  const publication = 'procedureId' in record ? record as PublishedProcedureRecord : null;
                  const source = publication ? null : record as ProcedureRecord;
                  const linkedPublication = source ? publications.find((item) => item.procedureId === source.id) : null;
                  return (
                    <article className={`${selectedId === record.id && source ? 'is-selected ' : ''}${!source || !isManager ? 'procedure-document-public' : ''}`} key={`${view}-${record.id}`}>
                      {source && isManager ? <input aria-label={`Sélectionner ${record.title}`} checked={selectedId === record.id} type="checkbox" onChange={() => setSelectedId((current) => current === record.id ? null : record.id)} /> : null}
                      <span className="procedure-document-icon"><FileText size={18} /></span>
                      <div className="procedure-document-copy"><button aria-label={`Ouvrir ${record.procedureCode || record.documentNumber || ''} ${record.title}`.trim()} className="procedure-document-name" onClick={() => void handleOpen(record)} type="button"><strong>{record.procedureCode || record.documentNumber || 'Sans numéro'} <span>{record.title}</span></strong></button><small>{[record.documentType, record.theme, record.versionLabel || record.revisionLabel, record.vesselName, record.projectName].filter(Boolean).join(' · ') || record.fileName}</small></div>
                      <div className="procedure-document-status">{publication || linkedPublication ? <strong className="is-published">Document publié le {formatDate((publication || linkedPublication)?.publishedOn || '')}</strong> : <span className={`procedure-status-${record.status}`}>{getProcedureStatusLabel(record.status)}</span>}<small>{humanFileSize(record.sizeBytes)}</small></div>
                      <div className="procedure-row-actions">
                        <button aria-label={`Télécharger ${record.title}`} onClick={() => void handleDownload(record)} type="button"><Download size={16} /></button>
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

      {editorProcedure ? <ProcedureEditor procedure={editorProcedure === 'new' ? null : editorProcedure} onClose={() => setEditorProcedure(null)} onSave={handleSave} saving={isSaving} /> : null}
      {publishTarget ? <PublishDialog procedure={publishTarget} onClose={() => setPublishTarget(null)} onPublish={handlePublish} saving={isSaving} /> : null}
    </section>
  );
}
