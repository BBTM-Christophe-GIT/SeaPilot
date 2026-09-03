import {
  ArchiveRestore, ArrowLeft, BellRing, Check, ChevronRight, CircleAlert, Download, ExternalLink,
  FileCheck2, FileClock, FilePlus2, Link2, LoaderCircle, MailCheck, Paperclip, PenLine,
  Building2, Plus, RotateCcw, Save, Search, Send, ShieldCheck, Ship, Trash2, UserRoundCheck, Upload, Users, X,
} from 'lucide-react';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import type { AppShellOutletContext } from '../shell/AppShell';
import { fetchWorkingTimeProfileSignatures } from '../workingTime/workingTimeSignatureQueries';
import { ServiceNoteDocument } from './ServiceNoteDocument';
import { ServiceNoteRichTextEditor } from './ServiceNoteRichTextEditor';
import {
  buildOfficeDesktopUrl, createServiceNoteAttachmentUrl, createServiceNoteDraft, createServiceNoteSignatureUrl,
  deleteServiceNoteAttachment, deleteServiceNoteDraft, fetchServiceNoteLinkOptions, fetchServiceNotes,
  fetchServiceNoteTargetingOptions, formatServiceNoteDate, linkServiceNoteRecord, publishServiceNote, recallServiceNote, saveServiceNoteDraft,
  signServiceNote, uploadServiceNoteAttachment,
  type ServiceNote, type ServiceNoteAttachment, type ServiceNoteDraftInput, type ServiceNoteLinkOption,
  type ServiceNoteTargetingOptions,
} from './serviceNoteQueries';
import { downloadServiceNotePdf } from './serviceNotePdf';
import { serviceNoteBodyHasContent } from './serviceNoteRichText';
import './serviceNotes.css';

type LibraryFilter = 'published' | 'draft' | 'recalled' | 'all';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const EMPTY_DRAFT: ServiceNoteDraftInput = {
  subject: '', body: '', authoredOn: new Date().toISOString().slice(0, 10), scope: 'all_accounts',
  targetVesselIds: [], targetPersonIds: [],
};

interface VesselOption { id: number; name: string }

function serviceNoteStatusLabel(status: ServiceNote['status']): string {
  return { draft: 'Brouillon privé', published: 'Diffusée', archived: 'Archivée', recalled: 'Rappelée' }[status];
}
function serviceNoteDisplayCode(note: ServiceNote): string {
  if (note.chronologyCode) return note.chronologyCode;
  return note.status === 'recalled' ? 'Numéro supprimé' : 'Numéro à la diffusion';
}
function percent(value: number, total: number): number {
  return total ? Math.round((value / total) * 100) : 0;
}

function missingServiceNoteRecipients(note: ServiceNote) {
  const signedRecipientIds = new Set(note.signatures.map((signature) => signature.recipientId));
  return note.recipients.filter((recipient) => !signedRecipientIds.has(recipient.id));
}

function serviceNoteAudienceLabel(note: ServiceNote): string {
  if (note.scope === 'vessels') {
    const vessels = note.targetVessels.map((vessel) => vessel.name).filter(Boolean).join(', ') || 'Navire(s) à sélectionner';
    const people = note.targetPersonIds.length;
    return people ? `${vessels} + ${people} personne${people > 1 ? 's' : ''} ajoutée${people > 1 ? 's' : ''}` : vessels;
  }
  if (note.scope === 'people') return `${note.targetPersonIds.length || note.recipients.length} personne${(note.targetPersonIds.length || note.recipients.length) > 1 ? 's' : ''}`;
  return 'Tous les utilisateurs';
}

export function resolveServiceNoteAudiencePeople(
  scope: ServiceNoteDraftInput['scope'],
  people: ServiceNoteTargetingOptions['people'],
  targetVesselIds: number[],
  targetPersonIds: number[],
): ServiceNoteTargetingOptions['people'] {
  const vesselIds = new Set(targetVesselIds);
  const personIds = new Set(targetPersonIds);
  return people.filter((person) => {
    if (!person.hasAccount || person.isAuthor) return false;
    if (scope === 'people') return personIds.has(person.id);
    if (scope === 'vessels') return personIds.has(person.id) || person.vesselIds.some((vesselId) => vesselIds.has(vesselId));
    return true;
  });
}

function serviceNoteChronology(note: ServiceNote): { year: number; sequence: number } {
  const code = note.chronologyCode || note.lastRecalledChronologyCode;
  const match = code.match(/^NS\s+(\d+)-(\d{2})/iu);
  if (match) return { year: 2000 + Number(match[2]), sequence: Number(match[1]) };
  const fallbackDate = new Date(note.authoredOn || note.updatedAt);
  return { year: Number.isNaN(fallbackDate.getTime()) ? 0 : fallbackDate.getFullYear(), sequence: -1 };
}

export function groupServiceNotesByYear(notes: ServiceNote[]): Array<{ year: number; notes: ServiceNote[] }> {
  const sorted = [...notes].sort((left, right) => {
    const leftCode = serviceNoteChronology(left);
    const rightCode = serviceNoteChronology(right);
    if (rightCode.year !== leftCode.year) return rightCode.year - leftCode.year;
    if (rightCode.sequence !== leftCode.sequence) return rightCode.sequence - leftCode.sequence;
    return new Date(right.publishedAt || right.updatedAt).getTime() - new Date(left.publishedAt || left.updatedAt).getTime();
  });
  const grouped = new Map<number, ServiceNote[]>();
  sorted.forEach((note) => {
    const year = serviceNoteChronology(note).year;
    grouped.set(year, [...(grouped.get(year) || []), note]);
  });
  return Array.from(grouped, ([year, groupedNotes]) => ({ year, notes: groupedNotes }));
}

export interface ServiceNoteLibraryVesselGroup {
  vesselName: string;
  notes: ServiceNote[];
}

export interface ServiceNoteLibraryYearGroup {
  year: number;
  notes: ServiceNote[];
  notesWithoutVessel: ServiceNote[];
  vesselGroups: ServiceNoteLibraryVesselGroup[];
}

function serviceNoteVesselNames(note: ServiceNote): string[] {
  if (note.scope === 'people') return [];
  return Array.from(new Set([
    ...note.targetVessels.map((vessel) => vessel.name.trim()),
    note.vesselName.trim(),
  ].filter(Boolean)));
}

export function groupServiceNotesByYearAndVessel(notes: ServiceNote[]): ServiceNoteLibraryYearGroup[] {
  return groupServiceNotesByYear(notes).map((yearGroup) => {
    const vesselMap = new Map<string, ServiceNote[]>();
    const notesWithoutVessel: ServiceNote[] = [];
    yearGroup.notes.forEach((note) => {
      const vesselNames = serviceNoteVesselNames(note);
      if (!vesselNames.length) {
        notesWithoutVessel.push(note);
        return;
      }
      vesselNames.forEach((vesselName) => {
        const vesselNotes = vesselMap.get(vesselName) || [];
        vesselNotes.push(note);
        vesselMap.set(vesselName, vesselNotes);
      });
    });
    return {
      ...yearGroup,
      notesWithoutVessel,
      vesselGroups: Array.from(vesselMap, ([vesselName, vesselNotes]) => ({ vesselName, notes: vesselNotes }))
        .sort((left, right) => left.vesselName.localeCompare(right.vesselName, 'fr', { numeric: true })),
    };
  });
}

function noteMatches(note: ServiceNote, search: string, vessel: string): boolean {
  const query = search.trim().toLocaleLowerCase('fr');
  const targetVesselNames = note.targetVessels.map((target) => target.name);
  const haystack = [note.chronologyCode, note.subject, note.body, note.vesselName, ...targetVesselNames, ...note.attachments.map((item) => item.displayName)]
    .join(' ').toLocaleLowerCase('fr');
  return (!query || haystack.includes(query)) && (!vessel || note.vesselName === vessel || targetVesselNames.includes(vessel));
}

function ServiceNoteListRow({ note, currentUserId, selected, onSelect }: {
  note: ServiceNote;
  currentUserId: string;
  selected: boolean;
  onSelect: (noteId: number) => void;
}) {
  const signed = note.signatures.length;
  const recipients = note.recipients.length;
  const missing = missingServiceNoteRecipients(note);
  const pendingForMe = note.status === 'published'
    && note.recipients.some((recipient) => recipient.userId === currentUserId)
    && !note.signatures.some((signature) => signature.userId === currentUserId);
  return <button className={`${selected ? 'is-selected' : ''}${pendingForMe ? ' is-pending' : ''}`} onClick={() => onSelect(note.id)} role="listitem" type="button">
    <span className={`service-note-file-icon is-${note.status}`}>{note.status === 'draft' ? <FileClock size={20} /> : note.status === 'recalled' ? <ArchiveRestore size={20} /> : <FileCheck2 size={20} />}</span>
    <span className="service-note-list-copy"><span><strong>{serviceNoteDisplayCode(note)}</strong><em className={`is-${note.status}`}>{serviceNoteStatusLabel(note.status)}</em></span><b>{note.subject || 'Sans objet'}</b><small><Ship size={12} /> {serviceNoteAudienceLabel(note)} · {formatServiceNoteDate(note.publishedAt || note.updatedAt)}</small></span>
    <span className={`service-note-list-progress${missing.length ? ' is-missing' : ''}`} title={missing.map((person) => `${person.firstName} ${person.lastName}`).join(', ')}><strong>{note.status === 'recalled' ? 'Archive' : recipients ? `${percent(signed, recipients)}%` : '—'}</strong><small>{note.status === 'recalled' ? 'Retirée des destinataires' : missing.length ? `${missing.length} non-signataire${missing.length > 1 ? 's' : ''}` : recipients ? 'Tout le monde a signé' : 'Non diffusée'}</small>{recipients && note.status !== 'recalled' ? <i><span style={{ width: `${percent(signed, recipients)}%` }} /></i> : null}</span>
    <ChevronRight size={18} />
  </button>;
}

function attachmentKindLabel(kind: ServiceNoteAttachment['kind']): string {
  return { file: 'Fichier', procedure: 'Procédure QHSE', action_item: 'Plan d’action', fleet_certificate: 'Certificat flotte' }[kind];
}

interface ServiceNoteLinkGroup {
  key: string;
  label: string;
  children: ServiceNoteLinkGroup[];
  options: ServiceNoteLinkOption[];
}

function serviceNoteLinkGroupCount(group: ServiceNoteLinkGroup): number {
  return group.options.length + group.children.reduce((total, child) => total + serviceNoteLinkGroupCount(child), 0);
}

export function buildServiceNoteLinkGroups(options: ServiceNoteLinkOption[]): ServiceNoteLinkGroup[] {
  const roots: ServiceNoteLinkGroup[] = [];
  options.forEach((option) => {
    let level = roots;
    option.groupPath.forEach((label, index) => {
      const key = option.groupPath.slice(0, index + 1).join(' › ');
      let group = level.find((candidate) => candidate.key === key);
      if (!group) {
        group = { key, label, children: [], options: [] };
        level.push(group);
      }
      if (index === option.groupPath.length - 1) group.options.push(option);
      level = group.children;
    });
  });
  const sortGroups = (groups: ServiceNoteLinkGroup[]): ServiceNoteLinkGroup[] => groups
    .sort((left, right) => left.label.localeCompare(right.label, 'fr', { numeric: true }))
    .map((group) => ({
      ...group,
      children: sortGroups(group.children),
      options: group.options.sort((left, right) => left.label.localeCompare(right.label, 'fr', { numeric: true })),
    }));
  return sortGroups(roots);
}

function ServiceNoteLinkGroupList({ groups, onSelect, searchActive, depth = 0 }: {
  groups: ServiceNoteLinkGroup[];
  onSelect: (option: ServiceNoteLinkOption) => void;
  searchActive: boolean;
  depth?: number;
}) {
  return groups.map((group) => (
    <details className={`service-note-link-group is-depth-${depth}`} key={`${searchActive}-${group.key}`} open={searchActive || depth === 0 ? true : undefined}>
      <summary><ChevronRight size={15} /><strong>{group.label}</strong><span>{serviceNoteLinkGroupCount(group)}</span></summary>
      <div>
        {group.children.length ? <ServiceNoteLinkGroupList depth={depth + 1} groups={group.children} onSelect={onSelect} searchActive={searchActive} /> : null}
        {group.options.map((option) => <article className="service-note-link-result" key={`${option.kind}-${option.id}`}>
          <a href={option.href} rel="noreferrer" target="_blank"><span><strong>{option.label}</strong><small>{option.description}</small></span><ExternalLink size={15} /></a>
          <button aria-label={`Ajouter ${option.label}`} onClick={() => onSelect(option)} title="Ajouter à la note" type="button"><Plus size={17} /></button>
        </article>)}
      </div>
    </details>
  ));
}

function ServiceNoteLinkPicker({ options, onClose, onSelect }: { options: ServiceNoteLinkOption[]; onClose: () => void; onSelect: (option: ServiceNoteLinkOption) => void }) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'all' | ServiceNoteLinkOption['kind']>('procedure');
  const filtered = options.filter((option) => (kind === 'all' || option.kind === kind)
    && `${option.label} ${option.description} ${option.groupPath.join(' ')}`.toLocaleLowerCase('fr').includes(query.trim().toLocaleLowerCase('fr')));
  const groups = buildServiceNoteLinkGroups(filtered);
  return (
    <div className="service-note-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section aria-label="Lier un élément SeaPilot" aria-modal="true" className="service-note-link-picker" onMouseDown={(event) => event.stopPropagation()} role="dialog">
        <header><div><span>RÉFÉRENCE INTERNE</span><h2>Lier un élément SeaPilot</h2></div><button aria-label="Fermer" onClick={onClose} type="button"><X size={19} /></button></header>
        <div className="service-note-link-filters">
          <label><Search size={16} /><input autoFocus onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher par titre, code ou navire…" value={query} /></label>
          <select aria-label="Type de référence" onChange={(event) => setKind(event.target.value as typeof kind)} value={kind}>
            <option value="all">Toutes les sources</option><option value="procedure">Procédures QHSE</option><option value="action_item">Plan d’action</option><option value="fleet_certificate">Certificats flotte</option>
          </select>
        </div>
        <div className="service-note-link-results">
          <ServiceNoteLinkGroupList groups={groups} onSelect={onSelect} searchActive={Boolean(query.trim())} />
          {!filtered.length ? <p>Aucun élément ne correspond à cette recherche.</p> : null}
        </div>
      </section>
    </div>
  );
}

interface EditorProps {
  note: ServiceNote;
  client: AppShellOutletContext['client'];
  vessels: VesselOption[];
  hasActiveSignature: boolean;
  onBack: () => void;
  onChanged: (noteId?: number) => Promise<void>;
}

function ServiceNoteEditor({ note, client, vessels, hasActiveSignature, onBack, onChanged }: EditorProps) {
  const [draft, setDraft] = useState<ServiceNoteDraftInput>({
    subject: note.subject, body: note.body, authoredOn: note.authoredOn || EMPTY_DRAFT.authoredOn,
    scope: note.scope, targetVesselIds: note.targetVessels.map((vessel) => vessel.id), targetPersonIds: note.targetPersonIds,
  });
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [message, setMessage] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [linkOptions, setLinkOptions] = useState<ServiceNoteLinkOption[] | null>(null);
  const [isLinkPickerOpen, setIsLinkPickerOpen] = useState(false);
  const [targetingOptions, setTargetingOptions] = useState<ServiceNoteTargetingOptions>({ date: draft.authoredOn, people: [], vessels: [] });
  const [targetVesselQuery, setTargetVesselQuery] = useState('');
  const [targetPersonQuery, setTargetPersonQuery] = useState('');
  const saveSequence = useRef(0);
  const targetVesselIdSet = useMemo(() => new Set(draft.targetVesselIds), [draft.targetVesselIds]);
  const targetPersonIdSet = useMemo(() => new Set(draft.targetPersonIds), [draft.targetPersonIds]);
  const eligiblePeopleCount = useMemo(() => targetingOptions.people.filter((person) => person.hasAccount && !person.isAuthor).length, [targetingOptions.people]);

  const audiencePeople = useMemo(() => resolveServiceNoteAudiencePeople(
    draft.scope,
    targetingOptions.people,
    draft.targetVesselIds,
    draft.targetPersonIds,
  ), [draft.scope, draft.targetPersonIds, draft.targetVesselIds, targetingOptions.people]);
  const searchableVessels = useMemo(() => {
    const search = targetVesselQuery.trim().toLocaleLowerCase('fr');
    return search ? targetingOptions.vessels.filter((vessel) => vessel.name.toLocaleLowerCase('fr').includes(search)) : targetingOptions.vessels;
  }, [targetVesselQuery, targetingOptions.vessels]);
  const searchablePeople = useMemo(() => {
    const search = targetPersonQuery.trim().toLocaleLowerCase('fr');
    return search
      ? targetingOptions.people.filter((person) => `${person.firstName} ${person.lastName} ${person.functionLabel}`.toLocaleLowerCase('fr').includes(search))
      : targetingOptions.people;
  }, [targetPersonQuery, targetingOptions.people]);

  const previewNote = useMemo(() => ({ ...note, ...{
    chronologyCode: '', subject: draft.subject, body: draft.body, vesselId: null,
    vesselName: '', authoredOn: draft.authoredOn, scope: draft.scope,
    targetVessels: vessels.filter((vessel) => targetVesselIdSet.has(vessel.id)),
    targetPersonIds: draft.targetPersonIds,
    recipients: audiencePeople.map((person) => ({
      id: person.id, noteId: note.id, userId: '', personId: person.id,
      firstName: person.firstName, lastName: person.lastName, functionLabel: person.functionLabel,
    })),
    signatures: [],
  } }), [audiencePeople, draft, note, targetVesselIdSet, vessels]);

  const persistDraft = useCallback(async () => {
    const sequence = ++saveSequence.current;
    setSaveState('saving');
    try {
      await saveServiceNoteDraft(client, note.id, draft);
      if (sequence === saveSequence.current) setSaveState('saved');
    } catch (error) {
      if (sequence === saveSequence.current) {
        setSaveState('error');
        setMessage(error instanceof Error ? error.message : 'Impossible d’enregistrer le brouillon.');
      }
      throw error;
    }
  }, [client, draft, note.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void persistDraft().catch(() => undefined); }, 750);
    return () => window.clearTimeout(timer);
  }, [persistDraft]);

  useEffect(() => {
    let active = true;
    fetchServiceNoteTargetingOptions(client, note.id, draft.authoredOn)
      .then((options) => { if (active) setTargetingOptions(options); })
      .catch((error) => { if (active) setMessage(error instanceof Error ? error.message : 'Chargement des destinataires impossible.'); });
    return () => { active = false; };
  }, [client, draft.authoredOn, note.id]);

  function updateScope(scope: ServiceNoteDraftInput['scope']) {
    setSaveState('saving');
    setTargetVesselQuery('');
    setTargetPersonQuery('');
    setDraft((current) => ({ ...current, scope }));
  }

  function toggleVessel(vesselId: number) {
    setSaveState('saving');
    setDraft((current) => ({
      ...current,
      targetVesselIds: current.targetVesselIds.includes(vesselId)
        ? current.targetVesselIds.filter((id) => id !== vesselId)
        : [...current.targetVesselIds, vesselId],
    }));
  }

  function togglePerson(personId: number) {
    setSaveState('saving');
    setDraft((current) => ({
      ...current,
      targetPersonIds: current.targetPersonIds.includes(personId)
        ? current.targetPersonIds.filter((id) => id !== personId)
        : [...current.targetPersonIds, personId],
    }));
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setIsUploading(true); setMessage('');
    try {
      for (const file of Array.from(files)) await uploadServiceNoteAttachment(client, previewNote, file);
      await onChanged(note.id);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Dépôt impossible.'); }
    finally { setIsUploading(false); }
  }

  async function openLinkPicker() {
    setMessage('');
    try {
      if (!linkOptions) setLinkOptions(await fetchServiceNoteLinkOptions(client));
      setIsLinkPickerOpen(true);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Chargement impossible.'); }
  }

  async function handleLink(option: ServiceNoteLinkOption) {
    setMessage('');
    try { await linkServiceNoteRecord(client, previewNote, option); setIsLinkPickerOpen(false); await onChanged(note.id); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Liaison impossible.'); }
  }

  async function handleDeleteAttachment(attachment: ServiceNoteAttachment) {
    setMessage('');
    try { await deleteServiceNoteAttachment(client, attachment); await onChanged(note.id); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Suppression impossible.'); }
  }

  async function handlePublish() {
    setMessage(''); setIsPublishing(true);
    try {
      await persistDraft();
      await publishServiceNote(client, note.id);
      await onChanged(note.id);
      onBack();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Diffusion impossible.'); }
    finally { setIsPublishing(false); }
  }

  async function handleSaveDraft() {
    setMessage(''); setIsSavingDraft(true);
    try {
      await persistDraft();
      await onChanged(note.id);
      onBack();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Enregistrement impossible.'); }
    finally { setIsSavingDraft(false); }
  }

  return (
    <section className="service-note-editor">
      <header className="service-note-editor-header">
        <button className="service-note-back-button" onClick={onBack} type="button"><ArrowLeft size={18} /> Bibliothèque</button>
        <div><span>QHSE · BROUILLON PRIVÉ</span><h1>{draft.subject || 'Nouvelle note de service'}</h1></div>
        <div className={`service-note-save-state is-${saveState}`} aria-live="polite">
          {saveState === 'saving' ? <LoaderCircle className="is-spinning" size={15} /> : saveState === 'error' ? <CircleAlert size={15} /> : <Check size={15} />}
          {saveState === 'saving' ? 'Enregistrement…' : saveState === 'error' ? 'Non enregistré' : 'Brouillon enregistré'}
        </div>
      </header>

      <div className="service-note-editor-layout">
        <div className="service-note-form-panel">
          <div className="service-note-private-banner"><ShieldCheck size={20} /><p><strong>Visible uniquement par Administration et Direction</strong><span>La note apparaîtra aux destinataires et dans la cloche seulement après diffusion.</span></p></div>
          <section className="service-note-form-section">
            <header><span>01</span><div><h2>Informations</h2><p>Le numéro chrono est attribué automatiquement.</p></div></header>
            <div className="service-note-form-grid">
              <div className="service-note-automatic-code"><span>Numéro chrono</span><strong>Attribué lors de la diffusion</strong></div>
              <label><span>Date</span><input onChange={(event) => { setSaveState('saving'); setDraft({ ...draft, authoredOn: event.target.value }); }} type="date" value={draft.authoredOn} /></label>
              <label className="is-wide"><span>Objet</span><input maxLength={500} onChange={(event) => { setSaveState('saving'); setDraft({ ...draft, subject: event.target.value }); }} placeholder="Objet clair et synthétique" value={draft.subject} /></label>
            </div>
          </section>
          <section className="service-note-form-section">
            <header><span>02</span><div><h2>Destinataires</h2><p>Le planning du {formatServiceNoteDate(draft.authoredOn)} détermine les personnes affectées aux navires.</p></div></header>
            <div className="service-note-scope-cards" role="radiogroup" aria-label="Périmètre de diffusion">
              <button aria-checked={draft.scope === 'all_accounts'} className={draft.scope === 'all_accounts' ? 'is-active' : ''} onClick={() => updateScope('all_accounts')} role="radio" type="button"><Building2 size={18} /><span><strong>Tous les utilisateurs</strong><small>{eligiblePeopleCount} comptes éligibles</small></span></button>
              <button aria-checked={draft.scope === 'vessels'} className={draft.scope === 'vessels' ? 'is-active' : ''} onClick={() => updateScope('vessels')} role="radio" type="button"><Ship size={18} /><span><strong>Un ou plusieurs navires</strong><small>Selon le planning</small></span></button>
              <button aria-checked={draft.scope === 'people'} className={draft.scope === 'people' ? 'is-active' : ''} onClick={() => updateScope('people')} role="radio" type="button"><UserRoundCheck size={18} /><span><strong>Liste de personnes</strong><small>Sélection nominative</small></span></button>
            </div>
            {draft.scope === 'vessels' ? <div className="service-note-combined-targets">
              <section>
                <header><strong>Navire(s) d’archivage</strong><small>La note sera classée sous chaque navire sélectionné.</small></header>
                <div className="service-note-target-picker">
                  <label><Search size={15} /><input aria-label="Rechercher un navire" onChange={(event) => setTargetVesselQuery(event.target.value)} placeholder="Rechercher un navire…" value={targetVesselQuery} /></label>
                  <div>
                    {searchableVessels.map((vessel) => <label key={vessel.id}><input checked={targetVesselIdSet.has(vessel.id)} onChange={() => toggleVessel(vessel.id)} type="checkbox" /><span><strong>{vessel.name}</strong><small>{vessel.recipientCount} destinataire{vessel.recipientCount > 1 ? 's' : ''} au planning</small></span></label>)}
                    {!searchableVessels.length ? <p>Aucun résultat.</p> : null}
                  </div>
                </div>
              </section>
              <section>
                <header><strong>Personne(s) ajoutée(s)</strong><small>Ajoutez nominativement des destinataires, en complément du planning.</small></header>
                <div className="service-note-target-picker">
                  <label><Search size={15} /><input aria-label="Rechercher une personne à ajouter" onChange={(event) => setTargetPersonQuery(event.target.value)} placeholder="Rechercher une personne…" value={targetPersonQuery} /></label>
                  <div>
                    {searchablePeople.map((person) => <label key={person.id}><input checked={targetPersonIdSet.has(person.id)} onChange={() => togglePerson(person.id)} type="checkbox" /><span><strong>{person.firstName} {person.lastName}</strong><small>{person.functionLabel || 'Fonction non renseignée'}</small></span></label>)}
                    {!searchablePeople.length ? <p>Aucun résultat.</p> : null}
                  </div>
                </div>
              </section>
            </div> : draft.scope === 'people' ? <div className="service-note-target-picker">
              <label><Search size={15} /><input aria-label="Rechercher une personne" onChange={(event) => setTargetPersonQuery(event.target.value)} placeholder="Rechercher une personne…" value={targetPersonQuery} /></label>
              <div>
                {searchablePeople.map((person) => <label key={person.id}><input checked={targetPersonIdSet.has(person.id)} onChange={() => togglePerson(person.id)} type="checkbox" /><span><strong>{person.firstName} {person.lastName}</strong><small>{person.functionLabel || 'Fonction non renseignée'}</small></span></label>)}
                {!searchablePeople.length ? <p>Aucun résultat.</p> : null}
              </div>
            </div> : null}
            <div className={`service-note-audience-summary${audiencePeople.length ? '' : ' is-empty'}`}>
              <Users size={18} /><span><strong>{audiencePeople.length} destinataire{audiencePeople.length > 1 ? 's' : ''}</strong><small>{audiencePeople.length ? audiencePeople.map((person) => `${person.firstName} ${person.lastName}`).join(', ') : 'Aucun compte ne correspond encore à ce périmètre.'}</small></span>
            </div>
          </section>
          <section className="service-note-form-section">
            <header><span>03</span><div><h2>Message</h2><p>Ce texte constituera le corps de la note commune.</p></div></header>
            <label className="service-note-body-field"><span>Contenu</span><ServiceNoteRichTextEditor onChange={(body) => { setSaveState('saving'); setDraft((current) => ({ ...current, body })); }} value={draft.body} /></label>
          </section>
          <section className="service-note-form-section">
            <header><span>04</span><div><h2>Pièces jointes et liens</h2><p>Le nom sans extension sera inventorié dans la note.</p></div></header>
            <div className="service-note-attachment-actions">
              <label className="service-note-upload-button"><Upload size={17} />{isUploading ? 'Dépôt en cours…' : 'Ajouter des fichiers'}<input disabled={isUploading} multiple onChange={(event) => void handleFiles(event.target.files)} type="file" /></label>
              <button onClick={() => void openLinkPicker()} type="button"><Link2 size={17} /> Lier un élément SeaPilot</button>
            </div>
            <div className="service-note-editor-attachments">
              {note.attachments.map((attachment) => <article key={attachment.id}><span><Paperclip size={16} /><span><strong>{attachment.displayName}</strong><small>{attachmentKindLabel(attachment.kind)}</small></span></span><button aria-label={`Retirer ${attachment.displayName}`} onClick={() => void handleDeleteAttachment(attachment)} type="button"><Trash2 size={16} /></button></article>)}
              {!note.attachments.length ? <p>Aucune pièce jointe ou référence.</p> : null}
            </div>
          </section>
          {message ? <div className="service-note-inline-error" role="alert"><CircleAlert size={17} />{message}</div> : null}
          {!hasActiveSignature ? <div className="service-note-inline-warning"><CircleAlert size={17} /><span>Ajoutez une signature active dans votre profil RH avant de diffuser cette note.</span><Link to="/modules/humanResources">Ouvrir mon profil</Link></div> : null}
          <div className="service-note-editor-footer"><button className="is-secondary" onClick={onBack} type="button">Fermer</button><button className="is-draft" disabled={isSavingDraft || isPublishing} onClick={() => void handleSaveDraft()} type="button"><Save size={17} />{isSavingDraft ? 'Enregistrement…' : 'Enregistrer le brouillon'}</button><button className="is-primary" disabled={isPublishing || isSavingDraft || !draft.subject.trim() || !serviceNoteBodyHasContent(draft.body) || !hasActiveSignature || !audiencePeople.length} onClick={() => void handlePublish()} type="button"><Send size={17} />{isPublishing ? 'Diffusion…' : `Diffuser à ${audiencePeople.length} destinataire${audiencePeople.length > 1 ? 's' : ''}`}</button></div>
        </div>
        <aside className="service-note-preview-panel"><header><div><span>APERÇU EN DIRECT</span><strong>Document commun</strong></div><span>2 pages</span></header><div className="service-note-preview-scroll"><ServiceNoteDocument note={previewNote} /></div></aside>
      </div>
      {isLinkPickerOpen && linkOptions ? <ServiceNoteLinkPicker onClose={() => setIsLinkPickerOpen(false)} onSelect={(option) => void handleLink(option)} options={linkOptions} /> : null}
    </section>
  );
}

export function ServiceNotesPage() {
  const { client, roles, currentPerson } = useOutletContext<AppShellOutletContext>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [notes, setNotes] = useState<ServiceNote[]>([]);
  const [vessels, setVessels] = useState<VesselOption[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const [hasActiveSignature, setHasActiveSignature] = useState(false);
  const [filter, setFilter] = useState<LibraryFilter>('published');
  const [query, setQuery] = useState('');
  const [vesselFilter, setVesselFilter] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(() => Number(searchParams.get('note')) || null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [readConfirmed, setReadConfirmed] = useState(false);
  const [signatureUrls, setSignatureUrls] = useState<Map<number, string>>(new Map());
  const [authorSignatureUrl, setAuthorSignatureUrl] = useState('');
  const isManager = roles.includes('admin') || roles.includes('direction');
  const visibleNotes = useMemo(() => isManager
    ? notes
    : notes.filter((note) => note.status === 'published' || note.status === 'archived'), [isManager, notes]);

  const reload = useCallback(async (preserveId?: number) => {
    const data = await fetchServiceNotes(client);
    setNotes(data);
    const requestedId = preserveId || selectedId || Number(searchParams.get('note')) || null;
    if (requestedId && data.some((note) => note.id === requestedId)) setSelectedId(requestedId);
  }, [client, searchParams, selectedId]);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    Promise.all([
      fetchServiceNotes(client),
      client.from('vessels').select('id,name,acronym').eq('active', true).order('name'),
      client.auth.getUser(),
      currentPerson ? fetchWorkingTimeProfileSignatures(client, currentPerson.id) : Promise.resolve([]),
    ]).then(([loadedNotes, vesselResult, userResult, signatures]) => {
      if (!mounted) return;
      setNotes(loadedNotes);
      setVessels(((vesselResult.data || []) as Array<Record<string, unknown>>).map((row) => ({ id: Number(row.id), name: String(row.name || row.acronym || '') })).filter((item) => item.name));
      setCurrentUserId(userResult.data.user?.id || '');
      setHasActiveSignature(signatures.some((signature) => !signature.validTo));
      const requested = Number(searchParams.get('note')) || null;
      if (requested && loadedNotes.some((note) => note.id === requested)) setSelectedId(requested);
    }).catch((error) => { if (mounted) setMessage(error instanceof Error ? error.message : 'Chargement impossible.'); })
      .finally(() => { if (mounted) setIsLoading(false); });
    return () => { mounted = false; };
  }, [client, currentPerson, searchParams]);

  const selectedNote = visibleNotes.find((note) => note.id === selectedId) || null;
  const editingNote = isManager ? visibleNotes.find((note) => note.id === editingId) || null : null;
  const latestPublishedNoteId = useMemo(() => visibleNotes
    .filter((note) => note.status === 'published')
    .sort((left, right) => {
      const dateOrder = new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime();
      return dateOrder || right.id - left.id;
    })[0]?.id || null, [visibleNotes]);

  useEffect(() => {
    if (!selectedNote) { setSignatureUrls(new Map()); setAuthorSignatureUrl(''); return; }
    let mounted = true;
    Promise.all([
      createServiceNoteSignatureUrl(client, selectedNote.authorSignatureSnapshot),
      ...selectedNote.signatures.map(async (signature) => [signature.id, await createServiceNoteSignatureUrl(client, signature.signatureSnapshot)] as const),
    ]).then(([authorUrl, ...urls]) => {
      if (!mounted) return;
      setAuthorSignatureUrl(authorUrl as string);
      setSignatureUrls(new Map(urls as Array<readonly [number, string]>));
    }).catch(() => { if (mounted) { setAuthorSignatureUrl(''); setSignatureUrls(new Map()); } });
    return () => { mounted = false; };
  }, [client, selectedNote]);

  const filteredNotes = useMemo(() => visibleNotes.filter((note) => {
    const statusMatch = filter === 'all' || note.status === filter || (filter === 'published' && note.status === 'archived');
    return statusMatch && noteMatches(note, query, vesselFilter);
  }), [filter, query, vesselFilter, visibleNotes]);
  const noteGroups = useMemo(() => groupServiceNotesByYearAndVessel(filteredNotes), [filteredNotes]);
  const distributed = visibleNotes.filter((note) => note.status === 'published' || note.status === 'archived');
  const signedCount = distributed.reduce((total, note) => total + note.signatures.length, 0);
  const recipientCount = distributed.reduce((total, note) => total + note.recipients.length, 0);
  const pendingForMe = visibleNotes.filter((note) => note.status === 'published' && note.recipients.some((recipient) => recipient.userId === currentUserId)
    && !note.signatures.some((signature) => signature.userId === currentUserId)).length;
  const vesselOptions = Array.from(new Set(visibleNotes.flatMap(serviceNoteVesselNames))).sort((a, b) => a.localeCompare(b, 'fr'));
  const hasSignedSelected = Boolean(selectedNote?.signatures.some((signature) => signature.userId === currentUserId));
  const isRecipientSelected = Boolean(selectedNote?.recipients.some((recipient) => recipient.userId === currentUserId));

  function selectNote(noteId: number) {
    setSelectedId(noteId); setReadConfirmed(false); setSearchParams({ note: String(noteId) });
  }

  async function handleCreate() {
    setIsBusy(true); setMessage('');
    try { const id = await createServiceNoteDraft(client); await reload(id); setEditingId(id); setFilter('draft'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Création impossible.'); }
    finally { setIsBusy(false); }
  }

  async function handleOpenAttachment(attachment: ServiceNoteAttachment) {
    try {
      const url = await createServiceNoteAttachmentUrl(client, attachment);
      if (url.startsWith('/modules/')) window.location.assign(url); else window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Ouverture impossible.'); }
  }

  async function handleSign() {
    if (!selectedNote) return;
    setIsBusy(true); setMessage('');
    try { await signServiceNote(client, selectedNote.id); await reload(selectedNote.id); setReadConfirmed(false); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Signature impossible.'); }
    finally { setIsBusy(false); }
  }

  async function handleDownload() {
    if (!selectedNote) return;
    setIsBusy(true); setMessage('');
    try { await downloadServiceNotePdf(client, selectedNote); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Génération du PDF impossible.'); }
    finally { setIsBusy(false); }
  }

  async function handleRecall() {
    if (!selectedNote || selectedNote.id !== latestPublishedNoteId) return;
    const confirmed = window.confirm(`Rappeler « ${selectedNote.subject} » ?\n\nLa note disparaîtra pour les autres profils, sera archivée avec le statut « Rappelée » et son numéro chrono sera supprimé.`);
    if (!confirmed) return;
    setIsBusy(true); setMessage('');
    try {
      await recallServiceNote(client, selectedNote.id);
      await reload(selectedNote.id);
      setFilter('recalled');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Rappel impossible.'); }
    finally { setIsBusy(false); }
  }

  async function handleRepublish() {
    if (!selectedNote || selectedNote.status !== 'recalled') return;
    const confirmed = window.confirm(`Diffuser à nouveau « ${selectedNote.subject} » ?\n\nUn nouveau numéro chrono sera attribué et un nouveau registre de signatures sera créé.`);
    if (!confirmed) return;
    setIsBusy(true); setMessage('');
    try {
      await publishServiceNote(client, selectedNote.id);
      await reload(selectedNote.id);
      setFilter('published');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Nouvelle diffusion impossible.'); }
    finally { setIsBusy(false); }
  }

  async function handlePublishDraft() {
    if (!selectedNote || selectedNote.status !== 'draft' || !isManager) return;
    const confirmed = window.confirm(`Diffuser « ${selectedNote.subject || 'Sans objet'} » ?\n\nLe numéro chrono sera attribué maintenant et les destinataires recevront la note.`);
    if (!confirmed) return;
    setIsBusy(true); setMessage('');
    try {
      await publishServiceNote(client, selectedNote.id);
      await reload(selectedNote.id);
      setFilter('published');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Diffusion impossible.'); }
    finally { setIsBusy(false); }
  }

  async function handleDeleteDraft() {
    if (!selectedNote || selectedNote.status !== 'draft') return;
    const confirmed = window.confirm(`Supprimer définitivement le brouillon « ${selectedNote.subject || 'Sans objet'} » ?\n\nCette action supprimera également ses pièces jointes et ne peut pas être annulée.`);
    if (!confirmed) return;
    setIsBusy(true); setMessage('');
    try {
      await deleteServiceNoteDraft(client, selectedNote);
      setSelectedId(null);
      setSearchParams({});
      await reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Suppression impossible.'); }
    finally { setIsBusy(false); }
  }

  if (isLoading) return <div className="admin-state" role="status">Chargement des notes de service…</div>;
  if (editingNote) return <ServiceNoteEditor client={client} hasActiveSignature={hasActiveSignature} note={editingNote} onBack={() => setEditingId(null)} onChanged={async (id) => { await reload(id); }} vessels={vessels} />;

  return (
    <div className="service-notes-page">
      <header className="service-notes-hero">
        <div><span>QHSE · DIFFUSION INTERNE</span><h1>Notes de Service</h1><p>Créez, diffusez et rassemblez toutes les signatures sur un seul document partagé.</p></div>
        {isManager ? <button disabled={isBusy} onClick={() => void handleCreate()} type="button"><FilePlus2 size={18} /> Nouvelle note</button> : null}
      </header>

      <section className="service-note-kpis" aria-label="Indicateurs notes de service">
        <article><span className="is-teal"><MailCheck size={19} /></span><div><small>Notes classées</small><strong>{distributed.length}</strong><em>Diffusées et archivées</em></div></article>
        <article><span className="is-blue"><Users size={19} /></span><div><small>Couverture signatures</small><strong>{percent(signedCount, recipientCount)}%</strong><em>{signedCount} sur {recipientCount || 0}</em></div></article>
        <article className={pendingForMe ? 'is-attention' : ''}><span className="is-orange"><BellRing size={19} /></span><div><small>À signer par moi</small><strong>{pendingForMe}</strong><em>{pendingForMe ? 'Lecture requise' : 'Vous êtes à jour'}</em></div></article>
        <article><span className="is-navy"><Paperclip size={19} /></span><div><small>Documents liés</small><strong>{visibleNotes.reduce((total, note) => total + note.attachments.length, 0)}</strong><em>Fichiers et références</em></div></article>
      </section>

      <section className="service-note-workspace">
        <div className="service-note-library">
          <header><div><h2>Bibliothèque</h2><span>{filteredNotes.length} note{filteredNotes.length > 1 ? 's' : ''}</span></div><div className="service-note-status-tabs"><button className={filter === 'published' ? 'is-active' : ''} onClick={() => setFilter('published')} type="button">Diffusées</button>{isManager ? <><button className={filter === 'draft' ? 'is-active' : ''} onClick={() => setFilter('draft')} type="button">Brouillons <em>{visibleNotes.filter((note) => note.status === 'draft').length}</em></button><button className={filter === 'recalled' ? 'is-active' : ''} onClick={() => setFilter('recalled')} type="button">Rappelées <em className="is-recalled-count">{visibleNotes.filter((note) => note.status === 'recalled').length}</em></button></> : null}<button className={filter === 'all' ? 'is-active' : ''} onClick={() => setFilter('all')} type="button">Toutes</button></div></header>
          <div className="service-note-filters">
            <label><Search size={16} /><input onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher une note, un objet, une pièce jointe…" value={query} /></label>
            <label className="service-note-vessel-filter"><Ship size={15} /><span>Navire</span><select aria-label="Filtrer par navire" onChange={(event) => setVesselFilter(event.target.value)} value={vesselFilter}><option value="">Tous les navires</option>{vesselOptions.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
          </div>
          <div className="service-note-list" role="list">
            {noteGroups.map((group) => <Fragment key={group.year}>
              <h3 className="service-note-year-heading"><span>{group.year || 'Sans année'}</span><small>{group.notes.length} note{group.notes.length > 1 ? 's' : ''}</small></h3>
              {group.notesWithoutVessel.map((note) => <ServiceNoteListRow currentUserId={currentUserId} key={`direct-${note.id}`} note={note} onSelect={selectNote} selected={selectedId === note.id} />)}
              {group.vesselGroups.map((vesselGroup) => <Fragment key={`${group.year}-${vesselGroup.vesselName}`}>
                <h4 className="service-note-vessel-heading"><Ship size={14} /><span>{vesselGroup.vesselName}</span><small>{vesselGroup.notes.length} note{vesselGroup.notes.length > 1 ? 's' : ''}</small></h4>
                {vesselGroup.notes.map((note) => <ServiceNoteListRow currentUserId={currentUserId} key={`${vesselGroup.vesselName}-${note.id}`} note={note} onSelect={selectNote} selected={selectedId === note.id} />)}
              </Fragment>)}
            </Fragment>)}
            {!filteredNotes.length ? <div className="service-note-empty-list"><FileClock size={28} /><strong>Aucune note dans cette vue</strong><span>Ajustez vos filtres ou créez un nouveau brouillon.</span></div> : null}
          </div>
        </div>

        <aside className="service-note-detail">
          {selectedNote ? <>
            <header><div><span>{selectedNote.status === 'draft' ? 'BROUILLON PRIVÉ' : selectedNote.status === 'recalled' ? 'ARCHIVE · RAPPELÉE' : selectedNote.sourceKind === 'sharepoint' ? 'ARCHIVE SHAREPOINT' : serviceNoteStatusLabel(selectedNote.status).toUpperCase()}</span><h2>{serviceNoteDisplayCode(selectedNote)}</h2><p>{selectedNote.subject}</p></div><button aria-label="Fermer le détail" onClick={() => { setSelectedId(null); setSearchParams({}); }} type="button"><X size={18} /></button></header>
            <div className="service-note-detail-actions">
              {selectedNote.status === 'draft' && isManager ? <button onClick={() => setEditingId(selectedNote.id)} type="button"><PenLine size={16} /> Modifier</button> : null}
              {selectedNote.status === 'draft' && isManager ? <button className="is-publish" disabled={isBusy || !hasActiveSignature} onClick={() => void handlePublishDraft()} title={!hasActiveSignature ? 'Une signature active est requise pour diffuser.' : undefined} type="button"><Send size={16} /> Diffuser</button> : null}
              {selectedNote.status === 'draft' && isManager ? <button className="is-danger" disabled={isBusy} onClick={() => void handleDeleteDraft()} type="button"><Trash2 size={16} /> Supprimer le brouillon</button> : null}
              {selectedNote.status === 'published' && selectedNote.id === latestPublishedNoteId && isManager ? <button className="is-recall" disabled={isBusy} onClick={() => void handleRecall()} type="button"><RotateCcw size={16} /> Rappeler</button> : null}
              {selectedNote.status === 'recalled' && isManager ? <button className="is-republish" disabled={isBusy || !hasActiveSignature} onClick={() => void handleRepublish()} title={!hasActiveSignature ? 'Une signature active est requise pour diffuser.' : undefined} type="button"><Send size={16} /> Diffuser à nouveau</button> : null}
              {selectedNote.sourceWebUrl ? <a href={buildOfficeDesktopUrl(selectedNote.sourceWebUrl)}><ExternalLink size={16} /> Ouvrir dans Word</a> : null}
              <button disabled={isBusy} onClick={() => void handleDownload()} type="button"><Download size={16} /> Télécharger le PDF</button>
            </div>
            {selectedNote.status !== 'draft' && selectedNote.status !== 'recalled' ? (() => {
              const missing = missingServiceNoteRecipients(selectedNote);
              return <section className={`service-note-missing-summary${missing.length ? ' is-missing' : ' is-complete'}`}><span>{missing.length ? <CircleAlert size={18} /> : <Check size={18} />}</span><div><strong>{missing.length ? `${missing.length} signature${missing.length > 1 ? 's' : ''} manquante${missing.length > 1 ? 's' : ''}` : 'Toutes les signatures sont réunies'}</strong><small>{missing.length ? missing.map((person) => `${person.firstName} ${person.lastName}`).join(' · ') : `${selectedNote.signatures.length} destinataire${selectedNote.signatures.length > 1 ? 's' : ''} enregistré${selectedNote.signatures.length > 1 ? 's' : ''}`}</small></div></section>;
            })() : null}
            <div className="service-note-detail-preview"><ServiceNoteDocument authorSignatureUrl={authorSignatureUrl} note={selectedNote} onOpenAttachment={(attachment) => void handleOpenAttachment(attachment)} signatureUrls={signatureUrls} /></div>
            {selectedNote.status === 'published' && selectedNote.sourceKind === 'seapilot' && isRecipientSelected ? (
              <section className={`service-note-sign-panel${hasSignedSelected ? ' is-signed' : ''}`}>
                {hasSignedSelected ? <><Check size={23} /><div><strong>Lecture confirmée</strong><span>Votre signature figure sur le registre commun.</span></div></> : <><PenLine size={22} /><div><strong>Signer après lecture</strong><span>Votre Prénom NOM, votre signature de profil et la date du jour seront apposés sur cette note unique.</span><label><input checked={readConfirmed} onChange={(event) => setReadConfirmed(event.target.checked)} type="checkbox" /> J’ai lu la note et ses pièces jointes.</label>{!hasActiveSignature ? <p><CircleAlert size={14} /> Une signature active est requise. <Link to="/modules/humanResources">Ouvrir mon profil RH</Link></p> : null}<button disabled={!readConfirmed || !hasActiveSignature || isBusy} onClick={() => void handleSign()} type="button"><PenLine size={16} />{isBusy ? 'Signature…' : 'Signer la note'}</button></div></>}
              </section>
            ) : null}
          </> : <div className="service-note-detail-empty"><MailCheck size={34} /><strong>Sélectionnez une note</strong><span>Prévisualisez le document, ses pièces jointes et l’avancement des signatures.</span></div>}
        </aside>
      </section>
      {message ? <div className="service-note-toast" role="alert"><CircleAlert size={17} />{message}<button aria-label="Fermer" onClick={() => setMessage('')}><X size={15} /></button></div> : null}
    </div>
  );
}
