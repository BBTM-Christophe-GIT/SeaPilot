import { connectLocalDrive, type LocalDriveConnection } from '../documents/localDriveLauncher';
import { FilePenLine, FolderOpen, Plus, Save, Search, Upload, Download, ShieldCheck, ExternalLink } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext, useSearchParams, useLocation } from 'react-router-dom';
import type { AppShellOutletContext } from '../shell/AppShell';
import { fetchWorkingTimeProfileSignatures } from '../workingTime/workingTimeSignatureQueries';
import { DisciplinaryForm, Field } from './DisciplinaryForm';
import { DisciplinaryLetterEditor } from './DisciplinaryLetterEditor';
import { DisciplinaryProcedure } from './DisciplinaryProcedure';
import { buildDisciplinaryDocx, downloadBlob, imageFileDataUrl } from './disciplinaryDocx';
import { ATTACHMENT_TYPES, ensureCollaboratorDriveFolder, disciplinaryDesktopUri, documentDrivePath, safeDrivePart, validateDisciplinaryPath, validateDriveUrl, writeDriveFile } from './disciplinaryDrive';
import { fetchDisciplinaryData, fetchDisciplinaryDocuments, registerDisciplinaryDocument, saveDisciplinaryCase } from './disciplinaryQueries';
import { frenchDate, generateLetter, initialForm, isEmployed, letterIssues, LETTER_KINDS, personName, SANCTIONS, todayParis, type DisciplinaryCase, type DisciplinaryDocument, type DisciplinaryLetter, type DisciplinaryPerson, type LetterKind } from './disciplinaryModel';
import { AppDialog } from '../../components/AppDialog';
import { DisciplinaryReviewPanel, DisciplinaryTimeline } from './DisciplinaryReviewPanel';
import { EMPTY_COLLABORATION, STATUS_LABELS, fetchCollaboration, mutateDisciplinaryCase, type Collaboration, type Reviewer, type WorkflowAction } from './disciplinaryWorkflow';
import { formFingerprint, isLetterReviewed } from './disciplinaryModel';
import './disciplinary.css';

const DEMO_PEOPLE: DisciplinaryPerson[] = [
  { id: 9303, companyId: 1, firstName: 'Luc', lastName: 'MARTIN', functionLabel: 'Matelot', postalAddress: '12 rue des Embruns\n50100 Cherbourg-en-Cotentin', hiredOn: '2024-01-01', departedOn: '', contractType: 'CDI' },
  { id: 9304, companyId: 1, firstName: 'Emma', lastName: 'DURAND', functionLabel: 'Second de quart', postalAddress: '', hiredOn: '2024-01-01', departedOn: '', contractType: 'CDI' },
];
const TABS = [{ key: 'preparation', label: 'Préparation' }, { key: 'letter', label: 'Courrier modifiable' }, { key: 'documents', label: 'Dossier et pièces' }, { key: 'review', label: 'Relecture et partage' }, { key: 'timeline', label: 'Suivi' }] as const;
type Tab = typeof TABS[number]['key'];

export function DisciplinaryPage() {
  const context = useOutletContext<AppShellOutletContext>();
  if (!context.roles.some((role) => ['admin', 'direction'].includes(role))) return <div role="alert" className="admin-state">Accès réservé à Administration et Direction.</div>;
  return <DisciplinaryWorkspace context={context} />;
}
function DisciplinaryWorkspace({ context }: { context: AppShellOutletContext }) {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const appliedLink = useRef<{ key: string; search: string } | null>(null);
  const [picker, setPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [issuerChoice, setIssuerChoice] = useState<string | null>(null);
  const [actorId, setActorId] = useState('');
  const [reviewers, setReviewers] = useState<Reviewer[]>([]);
  const [collaboration, setCollaboration] = useState<Collaboration>(EMPTY_COLLABORATION);
  const [collaborationLoading, setCollaborationLoading] = useState(false);
  const [previewCollaboration, setPreviewCollaboration] = useState<Record<string, Collaboration>>({});
  const [people, setPeople] = useState<DisciplinaryPerson[]>([]);
  const [cases, setCases] = useState<DisciplinaryCase[]>([]);
  const [documents, setDocuments] = useState<DisciplinaryDocument[]>([]);
  const [current, setCurrent] = useState<DisciplinaryCase | null>(null);
  const [tab, setTab] = useState<Tab>('preparation');
  const [search, setSearch] = useState('');
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [kind, setKind] = useState<LetterKind>('notification');
  const [signature, setSignature] = useState('');
  const [link, setLink] = useState({ path: '', url: '', date: todayParis() });

  useEffect(() => {
    let live = true;
    if (context.previewMode) {
      setPeople(DEMO_PEOPLE); setActorId('preview-user');
      setReviewers([{ id: 'preview-user', name: context.currentPerson ? personName(context.currentPerson) : 'Marie DIRECTION', function: context.currentPerson?.functionLabel || 'Directrice', personId: null }, { id: 'preview-reviewer', name: 'Camille ADMINISTRATION', function: 'Administration', personId: null }]);
      setLoading(false); return;
    }
    void fetchDisciplinaryData(context.client).then(async (result) => {
      const docs = await fetchDisciplinaryDocuments(context.client, result.cases.map((c) => c.id));
      if (live) { setPeople(result.people); setCases(result.cases); setDocuments(docs); setReviewers(result.reviewers); setActorId(result.actorId); }
    }).catch((e) => { if (live) setError(e.message || 'Chargement impossible.'); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [context.client, context.previewMode]);
  useEffect(() => {
    if (loading || appliedLink.current?.key === location.key) return;
    const id = params.get('case');
    const record = cases.find((row) => row.id === id);
    if (id && dirty && current?.id !== id && !window.confirm('Ce dossier contient des modifications non enregistrées. Les abandonner pour ouvrir le dossier de la notification ?')) {
      setParams(appliedLink.current?.search || ''); return;
    }
    appliedLink.current = { key: location.key, search: params.toString() };
    if (!id) return;
    setTab(params.get('tab') === 'review' ? 'review' : 'documents');
    if (dirty && current?.id === id) { setError('Enregistrez ou proposez vos modifications, puis rouvrez la notification pour actualiser le dossier.'); return; }
    if (context.previewMode) { if (record) { setCurrent(record); setDirty(false); } else setError('Dossier de démonstration introuvable.'); return; }
    let live = true;
    // A bell link can target the already open URL. Its navigation key changes
    // on every click, so reload the server version and comments in that case too.
    void fetchDisciplinaryData(context.client).then(async (result) => {
      const latest = result.cases.find((c) => c.id === id);
      if (!latest) throw new Error('Le dossier de cette notification est inaccessible.');
      const [review, docs] = await Promise.all([fetchCollaboration(context.client, id), fetchDisciplinaryDocuments(context.client, result.cases.map((c) => c.id))]);
      if (live) { setCurrent(latest); setCases(result.cases); setPeople(result.people); setReviewers(result.reviewers); setActorId(result.actorId); setCollaboration(review); setDocuments(docs); setDirty(false); setError(''); }
    }).catch((e) => { if (live) setError(e.message || 'Actualisation du dossier impossible.'); });
    return () => { live = false; };
  }, [params, setParams, location.key, cases, loading, dirty, current?.id, context.client, context.previewMode]);
  useEffect(() => {
    let live = true;
    setCollaboration(EMPTY_COLLABORATION);
    if (!current?.updated_at) return;
    if (context.previewMode) { setCollaboration(previewCollaboration[current.id] || EMPTY_COLLABORATION); return; }
    setCollaborationLoading(true);
    void fetchCollaboration(context.client, current.id).then((data) => { if (live) setCollaboration(data); })
      .catch((e) => { if (live) setError(e.message || 'Relecture inaccessible.'); })
      .finally(() => { if (live) setCollaborationLoading(false); });
    return () => { live = false; };
  }, [context.client, context.previewMode, current?.id, current?.updated_at, previewCollaboration]);
  useEffect(() => {
    let live = true;
    if (!context.currentPerson || context.previewMode) return;
    void fetchWorkingTimeProfileSignatures(context.client, context.currentPerson.id).then(async (versions) => {
      const active = versions.find((s) => !s.validTo);
      if (!active) return;
      const { data, error } = await context.client.storage.from(active.storageBucket).download(active.storagePath);
      if (error || !data) return;
      const url = await imageFileDataUrl(data);
      if (live) setSignature(url);
    }).catch(() => { /* A signature can also be supplied explicitly in the editor. */ });
    return () => { live = false; };
  }, [context.client, context.currentPerson, context.previewMode]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const selectedPerson = people.find((p) => p.id === current?.person_id);
  const selectedCases = cases.filter((c) => c.person_id === current?.person_id);
  const selectedDocuments = documents.filter((doc) => doc.case_id === current?.id)
    .sort((a, b) => b.document_date.localeCompare(a.document_date) || b.created_at.localeCompare(a.created_at));
  const visiblePeople = people.filter((p) => cases.some((c) => c.person_id === p.id)
    && `${personName(p)} ${p.functionLabel}`.toLocaleLowerCase('fr-FR').includes(search.toLocaleLowerCase('fr-FR')));
  const issues = useMemo(() => current?.letter ? letterIssues(current.data, current.letter) : [], [current]);

  const locked = current?.workflow_status === 'validated';
  const isIssuer = current?.issuer_id === actorId;
  const issuer = reviewers.find((p) => p.id === current?.issuer_id);
  const pendingChanges = collaboration.reviews.filter((r) => r.kind === 'change' && r.status === 'pending').length;
  function mayLeave() { return !dirty || window.confirm('Ce dossier contient des modifications non enregistrées. Les abandonner ?'); }
  function edit(record: DisciplinaryCase) { setCurrent(record); setDirty(true); setMessage(''); }
  function fresh(person: DisciplinaryPerson) {
    setCurrent({ id: crypto.randomUUID(), company_id: person.companyId, person_id: person.id, case_date: todayParis(), data: initialForm(person), letter: null, updated_at: '', issuer_id: actorId, workflow_status: 'draft' });
    setDirty(false); setKind('notification'); setTab('preparation'); setError(''); setMessage('');
  }
  function selectPerson(person: DisciplinaryPerson) {
    if (!mayLeave()) return;
    const existing = cases.find((c) => c.person_id === person.id);
    if (existing) { setCurrent(existing); setKind(existing.letter?.kind || 'notification'); setTab('documents'); setDirty(false); setError(''); }
    else fresh(person);
  }
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(''); setMessage('');
    try { await action(); return true; } catch (e) { setError(e instanceof Error ? e.message : (e as { message?: string })?.message || 'Action impossible.'); return false; }
    finally { setBusy(false); }
  }
  async function save(record = current): Promise<DisciplinaryCase> {
    if (!record) throw new Error('Choisissez un collaborateur.');
    const saved = context.previewMode ? { ...record, updated_at: new Date().toISOString() } : await saveDisciplinaryCase(context.client, record);
    setCurrent(saved); setCases((rows) => [saved, ...rows.filter((c) => c.id !== saved.id)]); setDirty(false);
    return saved;
  }
  function makeLetter() {
    if (!current) return;
    if (current.letter && !window.confirm('Régénérer le modèle remplacera le texte du brouillon courant. Les fichiers déjà classés seront conservés.')) return;
    if (!isIssuer) return;
    const letter = generateLetter(current.data, kind, { name: issuer?.name || '', function: issuer?.function || '', signature });
    edit({ ...current, letter }); setTab('letter');
  }
  async function workflowAction(action: WorkflowAction, payload: Record<string, unknown> = {}) {
    return run(async () => {
      if (!current) throw new Error('Choisissez un dossier.');
      let record = current;
      const proposalsSaved = action === 'issuer' && dirty && !isIssuer;
      if (action === 'issuer') {
        if (locked || (!isIssuer && !context.roles.includes('admin'))) throw new Error('Le changement d’émetteur est réservé à l’émetteur actuel ou à Administration avant validation.');
        if (!reviewers.some((person) => person.id === payload.issuer_id)) throw new Error('Choisissez un profil Administration ou Direction autorisé.');
        if (payload.issuer_id === current.issuer_id) return;
        // Keep the draft under its original issuer before transferring it. A
        // reviewer’s unsaved changes remain proposals, as in the normal save flow.
        if (!record.updated_at || dirty) record = await save(record);
      } else {
        if (!record.updated_at) throw new Error('Enregistrez le dossier avant cette action.');
        if (dirty) throw new Error('Enregistrez ou proposez vos modifications avant cette action.');
      }
      let saved = record;
      if (context.previewMode) {
        const now = new Date().toISOString();
        const next = structuredClone(previewCollaboration[record.id] || EMPTY_COLLABORATION);
        if (action === 'share') { next.participants = (payload.recipients as string[]).map((user_id) => ({ user_id })); saved = { ...record, workflow_status: 'in_review', updated_at: now }; }
        if (action === 'comment') next.reviews.unshift({ id: crypto.randomUUID(), case_id: record.id, author_id: actorId, author_name: reviewers[0].name, kind: 'comment', target: null, field: null, before_value: null, after_value: null, comment: String(payload.comment), status: 'pending', created_at: now, decided_at: null });
        if (action === 'issuer') { const person = reviewers.find((r) => r.id === payload.issuer_id)!; saved = { ...record, issuer_id: person.id, updated_at: now, letter: record.letter ? { ...record.letter, emitterName: person.name, emitterFunction: person.function, signatureDataUrl: '' } : null }; }
        if (action === 'validate') { saved = { ...record, workflow_status: 'validated', validated_at: now, validated_by: actorId, updated_at: now }; next.letters.unshift({ id: crypto.randomUUID(), letter: record.letter!, validated_at: now }); }
        if (action === 'new_letter') saved = { ...record, letter: null, workflow_status: 'draft', validated_at: null, validated_by: null, updated_at: now };
        next.events.unshift({ id: crypto.randomUUID(), actor_name: reviewers[0].name, kind: action, detail: payload as Record<string, string>, created_at: now });
        setPreviewCollaboration((all) => ({ ...all, [record.id]: next }));
      } else {
        saved = await mutateDisciplinaryCase(context.client, record, action, payload);
        setCurrent(saved); setCases((all) => [saved, ...all.filter((c) => c.id !== saved.id)]);
        setCollaboration(await fetchCollaboration(context.client, saved.id));
      }
      if (action === 'new_letter') { setTab('preparation'); setKind('notification'); }
      setCurrent(saved); setCases((all) => [saved, ...all.filter((c) => c.id !== saved.id)]);
      setMessage(context.previewMode ? 'Démonstration mise à jour, sans envoi ni enregistrement réel.' : action === 'issuer' ? `Émetteur modifié. Sa fonction a été renseignée et l’ancienne signature retirée.${proposalsSaved ? ' Vos corrections ont été proposées pour relecture.' : ''}` : action === 'share' ? 'Courrier partagé. Les destinataires ont reçu une notification dans leur cloche.' : action === 'validate' ? 'Courrier validé et verrouillé.' : 'Action enregistrée.');
    });
  }
  async function refreshCurrent() {
    if (!mayLeave() || context.previewMode) return;
    await run(async () => {
      const result = await fetchDisciplinaryData(context.client);
      const saved = result.cases.find((c) => c.id === current?.id) || null;
      setPeople(result.people); setCases(result.cases); setReviewers(result.reviewers); setActorId(result.actorId); setCurrent(saved); setDirty(false);
      setDocuments(await fetchDisciplinaryDocuments(context.client, result.cases.map((c) => c.id)));
      if (saved) setCollaboration(await fetchCollaboration(context.client, saved.id));
    });
  }
  async function documentRecord() {
    if (!current) throw new Error('Choisissez un dossier.');
    if (dirty) throw new Error('Enregistrez ou proposez vos modifications avant de classer les documents.');
    return current.updated_at ? current : save();
  }
  async function saveFile(file: Blob, name: string, documentKind: 'letter' | 'attachment', date: string, snapshot: DisciplinaryLetter | null, record: DisciplinaryCase, connection: LocalDriveConnection) {
    const { folder } = await ensureCollaboratorDriveFolder(context.client, connection, record);
    const id = crypto.randomUUID(), path = documentDrivePath(record, date, name, id, folder);
    try { await writeDriveFile(context.client, connection, record, path, file); }
    catch (error) { setLink({ path, url: '', date }); throw error; }
    const metadata = { id, case_id: record.id, file_name: path.split('/').at(-1)!, drive_path: path, drive_url: '', document_date: date, kind: documentKind, letter_snapshot: snapshot };
    try {
      const doc = await registerDisciplinaryDocument(context.client, metadata);
      setDocuments((all) => [doc, ...all]);
    } catch {
      setLink({ path, url: '', date });
      throw new Error(`Le fichier a été écrit dans Google Drive (${path}), mais sa fiche n’a pas pu être enregistrée. Utilisez « Lier un fichier déjà enregistré » pour terminer le classement.`);
    }
  }
  async function archiveLetter(snapshot = current?.letter) {
    if (!snapshot || dirty || (!locked && !collaboration.letters.some((item) => item.letter === snapshot))) throw new Error('Validez le courrier avant le classement final.');
    if (context.previewMode) throw new Error('Préversion : classement désactivé.');
    const connection = await connectLocalDrive();
    const saved = await documentRecord(), letter = snapshot;
    const blob = await buildDisciplinaryDocx(letter);
    await saveFile(blob, `${letter.date} - ${safeDrivePart(letter.subject)}.docx`, 'letter', letter.date, letter, saved, connection);
    setTab('documents'); setMessage('Courrier classé dans le dossier synchronisé. Attendez la fin de la synchronisation Google Drive.');
  }
  async function attach(files: File[]) {
    if (!files.length) return;
    if (context.previewMode) throw new Error('Préversion : classement désactivé.');
    const connection = await connectLocalDrive();
    const saved = await documentRecord();
    for (const file of files) await saveFile(file, file.name, 'attachment', link.date, null, saved, connection);
    setMessage(`${files.length} pièce(s) classée(s) dans le dossier synchronisé. Attendez la fin de la synchronisation Google Drive.`);
  }
  async function linkExisting() {
    const path = validateDisciplinaryPath(link.path.trim().replace(/\\/g, '/'));
    const url = validateDriveUrl(link.url);
    const saved = await documentRecord();
    const doc = await registerDisciplinaryDocument(context.client, { id: crypto.randomUUID(), case_id: saved.id,
      file_name: path.split('/').at(-1)!, drive_path: path, drive_url: url, document_date: link.date, kind: 'attachment', letter_snapshot: null });
    setDocuments((all) => [doc, ...all]); setLink({ path: '', url: '', date: todayParis() }); setMessage('Fichier Drive lié au dossier.');
  }

  return <section className="disciplinary-page">
    <header className="disciplinary-page-header"><div><h1>Sanctions Disciplinaires</h1><p>Préparer les courriers et suivre chaque dossier.</p></div>
      <button className="disciplinary-primary" disabled={busy || loading || !actorId} onClick={() => { if (mayLeave()) { setPickerSearch(''); setPicker(true); } }}><Plus size={18} />Nouveau dossier</button></header>
    <div className="disciplinary-access"><ShieldCheck size={16} />Administration et Direction · Dossiers confidentiels</div>
    {error ? <div role="alert" className="disciplinary-error">{error}</div> : null}
    {message ? <div role="status" className="disciplinary-success">{message}</div> : null}
    {context.previewMode ? <p className="disciplinary-muted">Démonstration avec collaborateurs fictifs. Les essais restent dans cette page ; aucun document ni notification réelle n’est envoyé.</p> : null}
    {picker ? <AppDialog title="Nouveau dossier disciplinaire" description="Choisissez un collaborateur en poste." onClose={() => setPicker(false)}><label className="disciplinary-search"><Search size={17} /><input aria-label="Choisir un collaborateur" placeholder="Prénom, nom ou fonction…" value={pickerSearch} onChange={(e) => setPickerSearch(e.target.value)} /></label><div className="disciplinary-picker-list">{people.filter((p) => isEmployed(p) && `${personName(p)} ${p.functionLabel}`.toLocaleLowerCase('fr-FR').includes(pickerSearch.toLocaleLowerCase('fr-FR'))).map((p) => <button className="disciplinary-person" key={p.id} onClick={() => { fresh(p); setPicker(false); }}><span><strong>{personName(p)}</strong><small>{p.functionLabel}</small></span></button>)}</div></AppDialog> : null}
    <div className="disciplinary-tabs" role="tablist" aria-label="Dossier disciplinaire">{TABS.map((item, i) => <button key={item.key} role="tab" id={`disciplinary-tab-${item.key}`} aria-selected={tab === item.key} aria-controls="disciplinary-panel" tabIndex={tab === item.key ? 0 : -1} onClick={() => setTab(item.key)} onKeyDown={(e) => {
      const offset = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (offset) { e.preventDefault(); const next = TABS[(i + offset + TABS.length) % TABS.length]; setTab(next.key); document.getElementById(`disciplinary-tab-${next.key}`)?.focus(); }
    }}>{item.label}</button>)}</div>
    <div className="disciplinary-workspace">
      <aside className="disciplinary-people"><h2>Collaborateurs concernés</h2><label className="disciplinary-search"><Search size={17} /><input aria-label="Rechercher un collaborateur" placeholder="Rechercher un collaborateur…" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
        {loading ? <p role="status">Chargement…</p> : null}
        {visiblePeople.map((person) => <button disabled={busy} aria-pressed={current?.person_id === person.id} className="disciplinary-person" key={person.id} onClick={() => selectPerson(person)}><span className="disciplinary-avatar">{person.firstName[0]}{person.lastName[0]}</span><span><strong>{personName(person)}</strong><small>{person.functionLabel}</small><small>{cases.filter((c) => c.person_id === person.id).length} dossier(s){!isEmployed(person) ? ' · Ancien collaborateur' : ''}</small></span></button>)}
        {!loading && !visiblePeople.length ? <p>Aucun dossier trouvé. Cliquez sur « Nouveau dossier » pour commencer.</p> : null}
        {current ? <div className="disciplinary-case-list"><h3>Dossiers du collaborateur</h3>{selectedCases.map((record) => <button disabled={busy} key={record.id} aria-pressed={current.id === record.id} onClick={() => { if (mayLeave()) { setCurrent(record); setDirty(false); setTab('documents'); } }}><strong>{frenchDate(record.case_date)}</strong><span>{SANCTIONS[record.data.sanction].label}</span><small>{STATUS_LABELS[record.workflow_status]} · {documents.filter((d) => d.case_id === record.id).length} pièce(s)</small></button>)}{!selectedCases.length ? <p>Le nouveau dossier sera créé lors de l’enregistrement.</p> : null}</div> : null}
      </aside>
      <fieldset disabled={busy} id="disciplinary-panel" role="tabpanel" aria-labelledby={`disciplinary-tab-${tab}`} className="disciplinary-main">
        {!current ? <div className="disciplinary-empty"><FolderOpen size={36} /><h2>Vos dossiers disciplinaires</h2><p>Retrouvez un dossier à gauche ou cliquez sur « Nouveau dossier » pour choisir un collaborateur.</p></div> : <>
          <header className="disciplinary-selected"><div><h2>{current.data.employeeName}</h2><p>{selectedPerson?.functionLabel} · {current.updated_at ? `Dossier du ${frenchDate(current.case_date)}` : 'Nouveau dossier'}{dirty ? ' · Modifications non enregistrées' : ''}</p></div><button disabled={busy || locked} onClick={() => void run(async () => { await save(); setMessage(context.previewMode ? 'Brouillon conservé pour cette démonstration uniquement.' : isIssuer ? 'Brouillon enregistré.' : 'Modifications proposées à l’émetteur.'); })}><Save size={17} />{isIssuer ? 'Enregistrer' : 'Proposer les modifications'}</button></header>
          <div className="disciplinary-workflow-status"><span className={`disciplinary-status is-${current.workflow_status}`}>{STATUS_LABELS[current.workflow_status]}</span><span>Émetteur : {issuer?.name || 'À réaffecter'}</span>{!context.previewMode ? <button onClick={() => void refreshCurrent()}>Actualiser</button> : null}</div>
          {locked ? <div className="disciplinary-success"><p>Courrier validé le {frenchDate(current.validated_at || '')}. La préparation et le courrier sont verrouillés.</p>{isIssuer ? <button onClick={() => void workflowAction('new_letter')}>Préparer un autre courrier dans ce dossier</button> : null}</div> : !isIssuer ? <p className="disciplinary-muted">Vos corrections seront proposées à l’émetteur. Il pourra accepter ou rejeter chaque modification.</p> : null}
          {tab === 'preparation' ? <><DisciplinaryForm disabled={busy || locked} value={current.data} onChange={(data) => edit({ ...current, data })} /><div className="disciplinary-compose"><Field label="Courrier à préparer"><select disabled={locked || !isIssuer} value={kind} onChange={(e) => setKind(e.target.value as LetterKind)}>{Object.entries(LETTER_KINDS).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></Field><button className="disciplinary-primary" disabled={busy || locked || !isIssuer} onClick={makeLetter}><FilePenLine size={17} />Générer le courrier</button></div><p className="disciplinary-muted">La qualification et la sanction restent à apprécier au cas par cas. Les signes observés ne prouvent pas une consommation.</p></> : null}
          {tab === 'letter' ? current.letter ? <>
            <div className="disciplinary-actions"><button disabled={busy} onClick={() => void run(async () => { const letter = current.letter!; const blob = await buildDisciplinaryDocx({ ...letter, subject: !locked ? `PROJET — ${letter.subject}` : letter.subject }); downloadBlob(blob, `${letter.date} - ${!locked ? 'PROJET - ' : ''}${safeDrivePart(letter.subject)}.docx`); })}><Download size={16} />Télécharger Word</button><button className="disciplinary-primary" disabled={busy || context.previewMode || !locked || dirty} onClick={() => void run(() => archiveLetter())}><FolderOpen size={16} />Classer dans Google Drive</button></div>
            {!locked && issues.length ? <details className="disciplinary-review" open><summary>À compléter avant validation ({issues.length})</summary><ul>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></details> : null}
            {isIssuer && !locked && !isLetterReviewed(current.data, current.letter) ? <button disabled={busy} onClick={() => edit({ ...current, letter: { ...current.letter!, reviewedForm: formFingerprint(current.data) } })}>Confirmer la relecture du courrier après modification</button> : null}
            {isIssuer && !locked ? <button className="disciplinary-primary" disabled={busy || collaborationLoading || dirty || !current.updated_at || issues.length > 0 || pendingChanges > 0} onClick={() => { if (window.confirm('Valider ce courrier ? Son contenu et sa préparation seront verrouillés.')) void workflowAction('validate'); }}>Valider le courrier</button> : null}
            {!locked && pendingChanges ? <p className="disciplinary-muted">{pendingChanges} modification(s) en attente dans « Relecture et partage ».</p> : null}
            {isIssuer && !locked && signature && !current.letter.signatureDataUrl ? <button disabled={busy} onClick={() => edit({ ...current, letter: { ...current.letter!, signatureDataUrl: signature } })}>Utiliser ma signature enregistrée</button> : null}
            <DisciplinaryLetterEditor disabled={busy || locked} identityDisabled={!isIssuer} letter={current.letter} onChange={(letter) => edit({ ...current, letter })} onError={setError}
              issuerSelection={locked ? undefined : { value: current.issuer_id, options: reviewers, disabled: !isIssuer && !context.roles.includes('admin'), onChange: setIssuerChoice }} />
          </> : <div className="disciplinary-empty"><FilePenLine size={32} /><p>Générez le modèle depuis l’onglet Préparation.</p><button onClick={() => setTab('preparation')}>Préparer le courrier</button></div> : null}
          {tab === 'documents' ? <>
            <div className="disciplinary-actions"><button onClick={() => setTab('letter')}>Consulter le courrier</button><button onClick={() => setTab('timeline')}>Suivi de la procédure</button></div>
            {collaboration.letters.length ? <section className="disciplinary-validated-letters"><h3>Courriers validés</h3>{collaboration.letters.map((item) => <details key={item.id} className="disciplinary-details"><summary>{frenchDate(item.letter.date)} · {item.letter.subject}</summary><p className="disciplinary-muted">Validé le {frenchDate(item.validated_at)} · {item.letter.emitterName}</p><div className="disciplinary-actions"><button onClick={() => void run(async () => downloadBlob(await buildDisciplinaryDocx(item.letter), `${item.letter.date} - ${safeDrivePart(item.letter.subject)}.docx`))}>Télécharger ce courrier</button><button disabled={context.previewMode || busy || dirty} onClick={() => void run(() => archiveLetter(item.letter))}>Classer ce courrier dans Drive</button></div><DisciplinaryLetterEditor disabled letter={item.letter} onChange={() => undefined} onError={setError} /></details>)}</section> : null}
            <p className="disciplinary-muted">Classement automatique : SeaPilot / Sanctions Disciplinaires / {current.data.employeeName} / date. Le dossier du collaborateur est créé automatiquement.</p>
            <div className="disciplinary-upload"><Field label="Date de classement des pièces"><input type="date" required value={link.date} onChange={(e) => setLink({ ...link, date: e.target.value })} /></Field><label className="disciplinary-file-button"><Upload size={16} />Ajouter des pièces jointes<input type="file" multiple accept={ATTACHMENT_TYPES} disabled={busy || context.previewMode || !link.date} onChange={(e) => { const files = Array.from(e.target.files || []); e.target.value = ''; void run(() => attach(files)); }} /></label></div>
            <p className="disciplinary-muted">Les documents sont classés par date (AAAA-MM-JJ). Les nouvelles versions conservent les fichiers antérieurs.</p>
            <div className="disciplinary-documents">{selectedDocuments.map((doc) => <article key={doc.id}><div><strong>{doc.file_name}</strong><small>{frenchDate(doc.document_date)} · {doc.kind === 'letter' ? 'Courrier Word' : 'Pièce jointe'}</small><small>{doc.drive_path}</small></div><div className="disciplinary-document-actions"><a href={disciplinaryDesktopUri(doc.drive_path)}><ExternalLink size={15} />Ouvrir le fichier</a>{doc.drive_url ? <a href={validateDriveUrl(doc.drive_url)} target="_blank" rel="noreferrer">Voir dans Drive</a> : null}{doc.letter_snapshot && !locked ? <button disabled={busy} onClick={() => { if (mayLeave()) { const original = cases.find((c) => c.id === doc.case_id); if (original) { edit({ ...original, letter: doc.letter_snapshot }); setTab('letter'); } } }}>Reprendre le modèle initial</button> : null}</div></article>)}{!selectedDocuments.length ? <div className="disciplinary-empty"><FolderOpen size={28} /><p>Aucun document classé dans ce dossier.</p></div> : null}</div>
            <details className="disciplinary-details"><summary>Lier un fichier déjà enregistré dans Drive</summary><p>Après un enregistrement manuel, indiquez son chemin dans le dossier confidentiel. Les liens Drive restent privés.</p><div className="disciplinary-form"><Field label="Chemin relatif du fichier" wide><input value={link.path} onChange={(e) => setLink({ ...link, path: e.target.value })} placeholder="Prénom NOM - c1-p123/2026-09-15/courrier.docx" /></Field><Field label="Lien Google Drive (facultatif)" wide><input type="url" value={link.url} onChange={(e) => setLink({ ...link, url: e.target.value })} /></Field><button disabled={busy || context.previewMode || !link.path || !link.date} onClick={() => void run(linkExisting)}>Lier au dossier</button></div></details>
            <p className="disciplinary-muted">Les courriers validés restent consultables ci-dessus. Les fichiers et leurs éventuelles modifications dans Word se consultent avec « Ouvrir le fichier ».</p>
          </> : null}
          {tab === 'review' || tab === 'timeline' ? !current.updated_at ? <p>Enregistrez le nouveau dossier pour accéder au partage et au suivi.</p> : collaborationLoading ? <p role="status">Chargement du suivi…</p> : tab === 'review' ? <DisciplinaryReviewPanel key={current.id + current.issuer_id} record={current} collaboration={collaboration} reviewers={reviewers} actorId={actorId} isAdmin={context.roles.includes('admin')} busy={busy} onAction={workflowAction} /> : <DisciplinaryTimeline key={current.id} collaboration={collaboration} busy={busy} onAction={workflowAction} /> : null}
        </>}
      </fieldset>
      {current ? <DisciplinaryProcedure form={current.data} /> : <aside className="disciplinary-procedure"><h2>Procédure légale</h2><p>Les définitions, délais, préavis et indemnités s’afficheront selon vos choix.</p></aside>}
    </div>
    {issuerChoice ? <AppDialog title="Changer l’émetteur" size="sm" onClose={() => setIssuerChoice(null)} footer={<><button onClick={() => setIssuerChoice(null)}>Annuler</button><button className="disciplinary-primary" onClick={() => { const id = issuerChoice; setIssuerChoice(null); void workflowAction('issuer', { issuer_id: id }); }}>Confirmer le changement</button></>}>
      <p><strong>{reviewers.find((person) => person.id === issuerChoice)?.name}</strong> deviendra l’émetteur de ce courrier.</p>
      <p>Sa fonction sera renseignée et la signature actuelle sera retirée.</p>
      {dirty ? <p>{isIssuer ? 'Les modifications en cours seront enregistrées avant le changement.' : 'Les corrections en cours seront proposées pour relecture avant le changement.'}</p> : null}
    </AppDialog> : null}
  </section>;
}
