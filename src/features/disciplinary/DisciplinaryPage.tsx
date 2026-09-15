import { FilePenLine, FolderOpen, Plus, Save, Search, Upload, Download, ShieldCheck, ExternalLink } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { AppShellOutletContext } from '../shell/AppShell';
import { fetchWorkingTimeProfileSignatures } from '../workingTime/workingTimeSignatureQueries';
import { DisciplinaryForm, Field } from './DisciplinaryForm';
import { DisciplinaryLetterEditor } from './DisciplinaryLetterEditor';
import { DisciplinaryProcedure } from './DisciplinaryProcedure';
import { buildDisciplinaryDocx, downloadBlob, imageFileDataUrl } from './disciplinaryDocx';
import { ATTACHMENT_TYPES, chooseDriveDirectory, disciplinaryDesktopUri, documentDrivePath, safeDrivePart, validateDisciplinaryPath, validateDriveUrl, writeDriveFile, type DriveDirectory } from './disciplinaryDrive';
import { fetchDisciplinaryData, fetchDisciplinaryDocuments, registerDisciplinaryDocument, saveDisciplinaryCase } from './disciplinaryQueries';
import { frenchDate, generateLetter, initialForm, isEmployed, letterIssues, LETTER_KINDS, personName, SANCTIONS, todayParis, type DisciplinaryCase, type DisciplinaryDocument, type DisciplinaryLetter, type DisciplinaryPerson, type LetterKind } from './disciplinaryModel';
import './disciplinary.css';

const DEMO_PEOPLE: DisciplinaryPerson[] = [
  { id: 9303, companyId: 1, firstName: 'Luc', lastName: 'MARTIN', functionLabel: 'Matelot', postalAddress: '12 rue des Embruns\n50100 Cherbourg-en-Cotentin', hiredOn: '2024-01-01', departedOn: '', contractType: 'CDI' },
  { id: 9304, companyId: 1, firstName: 'Emma', lastName: 'DURAND', functionLabel: 'Second de quart', postalAddress: '', hiredOn: '2024-01-01', departedOn: '', contractType: 'CDI' },
];
const TABS = [{ key: 'preparation', label: 'Préparation' }, { key: 'letter', label: 'Courrier modifiable' }, { key: 'documents', label: 'Dossier et pièces' }] as const;
type Tab = typeof TABS[number]['key'];

export function DisciplinaryPage() {
  const context = useOutletContext<AppShellOutletContext>();
  if (!context.roles.some((role) => ['admin', 'direction'].includes(role))) return <div role="alert" className="admin-state">Accès réservé à Administration et Direction.</div>;
  return <DisciplinaryWorkspace context={context} />;
}
function DisciplinaryWorkspace({ context }: { context: AppShellOutletContext }) {
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
  const [drive, setDrive] = useState<DriveDirectory | null>(null);
  const [link, setLink] = useState({ path: '', url: '', date: todayParis() });

  useEffect(() => {
    let live = true;
    if (context.previewMode) { setPeople(DEMO_PEOPLE); setLoading(false); return; }
    void fetchDisciplinaryData(context.client).then(async (result) => {
      const docs = await fetchDisciplinaryDocuments(context.client, result.cases.map((c) => c.id));
      if (live) { setPeople(result.people); setCases(result.cases); setDocuments(docs); }
    }).catch((e) => { if (live) setError(e.message || 'Chargement impossible.'); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [context.client, context.previewMode]);
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
  const selectedDocuments = documents.filter((doc) => selectedCases.some((c) => c.id === doc.case_id))
    .sort((a, b) => b.document_date.localeCompare(a.document_date) || b.created_at.localeCompare(a.created_at));
  const visiblePeople = people.filter((p) => (isEmployed(p) || cases.some((c) => c.person_id === p.id))
    && `${personName(p)} ${p.functionLabel}`.toLocaleLowerCase('fr-FR').includes(search.toLocaleLowerCase('fr-FR')));
  const issues = useMemo(() => current?.letter ? letterIssues(current.data, current.letter) : [], [current]);

  function mayLeave() { return !dirty || window.confirm('Ce dossier contient des modifications non enregistrées. Les abandonner ?'); }
  function edit(record: DisciplinaryCase) { setCurrent(record); setDirty(true); setMessage(''); }
  function fresh(person: DisciplinaryPerson) {
    setCurrent({ id: crypto.randomUUID(), company_id: person.companyId, person_id: person.id, case_date: todayParis(), data: initialForm(person), letter: null, updated_at: '' });
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
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'Action impossible.'); }
    finally { setBusy(false); }
  }
  async function save(record = current): Promise<DisciplinaryCase> {
    if (!record) throw new Error('Choisissez un collaborateur.');
    if (context.previewMode) throw new Error('Préversion : les données fictives ne sont pas enregistrées.');
    const saved = await saveDisciplinaryCase(context.client, record);
    setCurrent(saved); setCases((rows) => [saved, ...rows.filter((c) => c.id !== saved.id)]); setDirty(false);
    return saved;
  }
  function makeLetter() {
    if (!current) return;
    if (current.letter && !window.confirm('Régénérer le modèle remplacera le texte du brouillon courant. Les fichiers déjà classés seront conservés.')) return;
    const actor = context.currentPerson;
    const letter = generateLetter(current.data, kind, { name: actor ? personName(actor) : '', function: actor?.functionLabel || '', signature });
    edit({ ...current, letter }); setTab('letter');
  }
  async function saveFile(file: Blob, name: string, documentKind: 'letter' | 'attachment', date: string, snapshot: DisciplinaryLetter | null, record: DisciplinaryCase) {
    if (!drive) throw new Error('Choisissez le dossier Google Drive confidentiel.');
    const id = crypto.randomUUID(), path = documentDrivePath(record, date, name, id);
    await writeDriveFile(drive, path, file);
    const metadata = { id, case_id: record.id, file_name: path.split('/').at(-1)!, drive_path: path, drive_url: '', document_date: date, kind: documentKind, letter_snapshot: snapshot };
    try {
      const doc = await registerDisciplinaryDocument(context.client, metadata);
      setDocuments((all) => [doc, ...all]);
    } catch {
      setLink({ path, url: '', date });
      throw new Error(`Le fichier a été écrit dans Google Drive (${path}), mais sa fiche n’a pas pu être enregistrée. Utilisez « Lier un fichier déjà enregistré » pour terminer le classement.`);
    }
  }
  async function archiveLetter() {
    if (!current?.letter || issues.length) throw new Error('Complétez les points de relecture avant le classement final.');
    if (!drive) throw new Error('Choisissez le dossier Google Drive confidentiel avant le classement.');
    const saved = await save(), letter = saved.letter!;
    const blob = await buildDisciplinaryDocx(letter);
    await saveFile(blob, `${letter.date} - ${safeDrivePart(letter.subject)}.docx`, 'letter', letter.date, letter, saved);
    setTab('documents'); setMessage('Courrier classé dans le dossier synchronisé. Attendez la fin de la synchronisation Google Drive.');
  }
  async function attach(files: File[]) {
    if (!files.length) return;
    if (!drive) throw new Error('Choisissez le dossier Google Drive confidentiel avant d’ajouter des pièces.');
    const saved = await save();
    for (const file of files) await saveFile(file, file.name, 'attachment', link.date, null, saved);
    setMessage(`${files.length} pièce(s) classée(s) dans le dossier synchronisé. Attendez la fin de la synchronisation Google Drive.`);
  }
  async function linkExisting() {
    const path = validateDisciplinaryPath(link.path.trim().replace(/\\/g, '/'));
    const url = validateDriveUrl(link.url);
    const saved = await save();
    const doc = await registerDisciplinaryDocument(context.client, { id: crypto.randomUUID(), case_id: saved.id,
      file_name: path.split('/').at(-1)!, drive_path: path, drive_url: url, document_date: link.date, kind: 'attachment', letter_snapshot: null });
    setDocuments((all) => [doc, ...all]); setLink({ path: '', url: '', date: todayParis() }); setMessage('Fichier Drive lié au dossier.');
  }

  return <section className="disciplinary-page">
    <header className="disciplinary-page-header"><div><h1>Sanctions Disciplinaires</h1><p>Préparer les courriers et suivre chaque dossier.</p></div>
      <button className="disciplinary-primary" disabled={busy || !selectedPerson || !isEmployed(selectedPerson)} onClick={() => { if (selectedPerson && mayLeave()) fresh(selectedPerson); }}><Plus size={18} />Nouveau dossier</button></header>
    <div className="disciplinary-access"><ShieldCheck size={16} />Administration et Direction · Dossiers confidentiels</div>
    {error ? <div role="alert" className="disciplinary-error">{error}</div> : null}
    {message ? <div role="status" className="disciplinary-success">{message}</div> : null}
    {context.previewMode ? <p className="disciplinary-muted">Préversion avec collaborateurs fictifs. Enregistrement désactivé.</p> : null}
    <div className="disciplinary-tabs" role="tablist" aria-label="Dossier disciplinaire">{TABS.map((item, i) => <button key={item.key} role="tab" id={`disciplinary-tab-${item.key}`} aria-selected={tab === item.key} aria-controls="disciplinary-panel" tabIndex={tab === item.key ? 0 : -1} onClick={() => setTab(item.key)} onKeyDown={(e) => {
      const offset = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (offset) { e.preventDefault(); const next = TABS[(i + offset + TABS.length) % TABS.length]; setTab(next.key); document.getElementById(`disciplinary-tab-${next.key}`)?.focus(); }
    }}>{item.label}</button>)}</div>
    <div className="disciplinary-workspace">
      <aside className="disciplinary-people"><h2>Collaborateurs</h2><label className="disciplinary-search"><Search size={17} /><input aria-label="Rechercher un collaborateur" placeholder="Rechercher un collaborateur…" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
        {loading ? <p role="status">Chargement…</p> : null}
        {visiblePeople.map((person) => <button disabled={busy} aria-pressed={current?.person_id === person.id} className="disciplinary-person" key={person.id} onClick={() => selectPerson(person)}><span className="disciplinary-avatar">{person.firstName[0]}{person.lastName[0]}</span><span><strong>{personName(person)}</strong><small>{person.functionLabel}</small><small>{isEmployed(person) ? 'En poste' : 'Ancien collaborateur · dossiers'}</small></span></button>)}
        {!loading && !visiblePeople.length ? <p>Aucun collaborateur en poste ni dossier existant.</p> : null}
        {current ? <div className="disciplinary-case-list"><h3>Dossiers du collaborateur</h3>{selectedCases.map((record) => <button disabled={busy} key={record.id} aria-pressed={current.id === record.id} onClick={() => { if (mayLeave()) { setCurrent(record); setDirty(false); setTab('preparation'); } }}><strong>{frenchDate(record.case_date)}</strong><span>{SANCTIONS[record.data.sanction].label}</span><small>{record.id.slice(0, 8)}</small></button>)}{!selectedCases.length ? <p>Le nouveau dossier sera créé lors de l’enregistrement.</p> : null}</div> : null}
      </aside>
      <fieldset disabled={busy} id="disciplinary-panel" role="tabpanel" aria-labelledby={`disciplinary-tab-${tab}`} className="disciplinary-main">
        {!current ? <div className="disciplinary-empty"><FolderOpen size={36} /><h2>Choisir un collaborateur</h2><p>Cliquez sur son prénom et son nom pour préparer un courrier ou retrouver son dossier.</p></div> : <>
          <header className="disciplinary-selected"><div><h2>{current.data.employeeName}</h2><p>{selectedPerson?.functionLabel} · {current.updated_at ? `Dossier du ${frenchDate(current.case_date)}` : 'Nouveau dossier'}{dirty ? ' · Modifications non enregistrées' : ''}</p></div><button disabled={busy || context.previewMode} onClick={() => void run(async () => { await save(); setMessage('Brouillon enregistré.'); })}><Save size={17} />Enregistrer</button></header>
          {tab === 'preparation' ? <><DisciplinaryForm value={current.data} onChange={(data) => edit({ ...current, data })} /><div className="disciplinary-compose"><Field label="Courrier à préparer"><select value={kind} onChange={(e) => setKind(e.target.value as LetterKind)}>{Object.entries(LETTER_KINDS).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></Field><button className="disciplinary-primary" disabled={busy} onClick={makeLetter}><FilePenLine size={17} />Générer le courrier</button></div><p className="disciplinary-muted">La qualification et la sanction restent à apprécier au cas par cas. Les signes observés ne prouvent pas une consommation.</p></> : null}
          {tab === 'letter' ? current.letter ? <>
            <div className="disciplinary-actions"><button disabled={busy} onClick={() => void run(async () => { const letter = current.letter!; const blob = await buildDisciplinaryDocx({ ...letter, subject: issues.length ? `PROJET — ${letter.subject}` : letter.subject }); downloadBlob(blob, `${letter.date} - ${issues.length ? 'PROJET - ' : ''}${safeDrivePart(letter.subject)}.docx`); })}><Download size={16} />Télécharger Word</button><button className="disciplinary-primary" disabled={busy || context.previewMode || issues.length > 0} onClick={() => void run(archiveLetter)}><FolderOpen size={16} />Classer dans Google Drive</button></div>
            {issues.length ? <details className="disciplinary-review" open><summary>À compléter avant le classement final ({issues.length})</summary><ul>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></details> : null}
            {current.letter.reviewedForm !== JSON.stringify(current.data) ? <button disabled={busy} onClick={() => edit({ ...current, letter: { ...current.letter!, reviewedForm: JSON.stringify(current.data) } })}>Confirmer la relecture du courrier après modification</button> : null}
            {!drive ? <button onClick={() => setTab('documents')}>Choisir le dossier Drive pour le classement</button> : null}
            <DisciplinaryLetterEditor letter={current.letter} onChange={(letter) => edit({ ...current, letter })} onError={setError} />
          </> : <div className="disciplinary-empty"><FilePenLine size={32} /><p>Générez le modèle depuis l’onglet Préparation.</p><button onClick={() => setTab('preparation')}>Préparer le courrier</button></div> : null}
          {tab === 'documents' ? <>
            <div className="disciplinary-drive"><h3>Google Drive synchronisé</h3><p>Choisissez le dossier confidentiel « Sanctions Disciplinaires » de Google Drive pour ordinateur. Son partage doit être limité à Administration et Direction.</p><button disabled={busy || context.previewMode} onClick={() => { try { const selected = chooseDriveDirectory(); void run(async () => { const directory = await selected; setDrive(directory); setMessage(`Dossier choisi : ${directory.name}`); }); } catch (e) { setError((e as Error).message); } }}><FolderOpen size={16} />{drive ? `Dossier : ${drive.name}` : 'Choisir le dossier Google Drive'}</button>
              <p className="disciplinary-muted">Sur chaque PC : <a href="/connectors/seapilot-drive-windows.zip" download>installer le lanceur Windows à jour</a>, puis <a href="seapilot-drive://disciplinary/configure">configurer ce même dossier pour l’ouverture dans Office</a>. Les fichiers sont écrits localement puis synchronisés par Google Drive.</p>
            </div>
            <div className="disciplinary-upload"><Field label="Date de classement des pièces"><input type="date" required value={link.date} onChange={(e) => setLink({ ...link, date: e.target.value })} /></Field><label className="disciplinary-file-button"><Upload size={16} />Ajouter des pièces jointes<input type="file" multiple accept={ATTACHMENT_TYPES} disabled={busy || context.previewMode || !drive || !link.date} onChange={(e) => { const files = Array.from(e.target.files || []); e.target.value = ''; void run(() => attach(files)); }} /></label></div>
            <p className="disciplinary-muted">Classement : entreprise / Prénom NOM – identifiant / AAAA-MM-JJ. Les nouvelles versions conservent les fichiers antérieurs.</p>
            <div className="disciplinary-documents">{selectedDocuments.map((doc) => <article key={doc.id}><div><strong>{doc.file_name}</strong><small>{frenchDate(doc.document_date)} · {doc.kind === 'letter' ? 'Courrier Word' : 'Pièce jointe'}</small><small>{doc.drive_path}</small></div><div className="disciplinary-document-actions"><a href={disciplinaryDesktopUri(doc.drive_path)}><ExternalLink size={15} />Ouvrir le fichier</a>{doc.drive_url ? <a href={validateDriveUrl(doc.drive_url)} target="_blank" rel="noreferrer">Voir dans Drive</a> : null}{doc.letter_snapshot ? <button disabled={busy} onClick={() => { if (mayLeave()) { const original = cases.find((c) => c.id === doc.case_id); if (original) { edit({ ...original, letter: doc.letter_snapshot }); setTab('letter'); } } }}>Reprendre le modèle initial</button> : null}</div></article>)}{!selectedDocuments.length ? <div className="disciplinary-empty"><FolderOpen size={28} /><p>Aucun document classé pour ce collaborateur.</p></div> : null}</div>
            <details className="disciplinary-details"><summary>Lier un fichier déjà enregistré dans Drive</summary><p>Après un enregistrement manuel, indiquez son chemin dans le dossier confidentiel. Les liens Drive restent privés.</p><div className="disciplinary-form"><Field label="Chemin relatif du fichier" wide><input value={link.path} onChange={(e) => setLink({ ...link, path: e.target.value })} placeholder="1/Prénom NOM - 123/2026-09-15/courrier.docx" /></Field><Field label="Lien Google Drive (facultatif)" wide><input type="url" value={link.url} onChange={(e) => setLink({ ...link, url: e.target.value })} /></Field><button disabled={busy || context.previewMode || !link.path || !link.date} onClick={() => void run(linkExisting)}>Lier au dossier</button></div></details>
            <p className="disciplinary-muted">« Reprendre le modèle initial » recharge le texte au moment du classement. Les modifications ultérieures dans Word se consultent avec « Ouvrir le fichier ».</p>
          </> : null}
        </>}
      </fieldset>
      {current ? <DisciplinaryProcedure form={current.data} /> : <aside className="disciplinary-procedure"><h2>Procédure légale</h2><p>Les définitions, délais, préavis et indemnités s’afficheront selon vos choix.</p></aside>}
    </div>
  </section>;
}
