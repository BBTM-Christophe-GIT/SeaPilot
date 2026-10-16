import { cloneElement, isValidElement, useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useOutletContext } from 'react-router-dom';
import { AlertTriangle, Anchor, ArrowLeft, CheckCircle2, ChevronRight, ClipboardCheck, Compass, FileText, Plus, Printer, Save, Search, Ship, Trash2 } from 'lucide-react';
import { ModuleRibbon, ModuleRibbonCommand, ModuleRibbonGroup } from '../../components/ModuleRibbon';
import type { AppShellOutletContext } from '../shell/AppShell';
import { DIVING_MEDICAL_KIT, SEA_OPERATION_CHECKS, SEA_OPERATION_SECTIONS, SEA_OPERATION_SUPPLY_ITEMS, emptySeaOperation, getSeaOperationAssessment, isSeaOperationPayload, validateSeaOperation, type SeaOperationPayload, type SeaOperationAnswer as Answer } from './seaOperationModel';
import { fetchSeaOperationData, fetchSeaOperationDetail, saveSeaOperation, signSeaOperation, type SeaOperationData, type SeaOperationRecord } from './seaOperationQueries';
import './seaOperations.css';
import { SeaOperationPrint } from './SeaOperationPrint';

const STEPS = ['Armement', 'Contrôles avant appareillage', 'Plan de passage', 'Décision du Capitaine'];
const formatDate = (value: string | null) => value ? new Date(value).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : 'Non renseignée';
const errorMessage = (error: unknown) => error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String(error.message) : 'Une erreur est survenue. Réessayez.';
const recoveryKey = (data: SeaOperationData) => `seapilot:sea-operation-draft:v1:${data.companyId}:${data.actorId}`;
interface DraftRecovery { draft: SeaOperationPayload; recordId: string | null; version: number | null; step: number }
function readRecovery(data: SeaOperationData): DraftRecovery | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(recoveryKey(data)) || 'null');
    if (!value || typeof value !== 'object') return null;
    const saved = value as Partial<DraftRecovery>;
    if (!isSeaOperationPayload(saved.draft) || !Number.isInteger(saved.step) || saved.step! < 0 || saved.step! >= STEPS.length
      || !(saved.recordId === null && saved.version === null || typeof saved.recordId === 'string' && Number.isInteger(saved.version) && saved.version! > 0)) return null;
    return saved as DraftRecovery;
  } catch { return null; }
}
function clearRecovery(data: SeaOperationData | null) {
  try { if (data) sessionStorage.removeItem(recoveryKey(data)); } catch { /* Storage can be unavailable. */ }
}

function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  const id = useId();
  return <div className={wide ? 'so-field so-wide' : 'so-field'}><label htmlFor={id}>{label}</label>{isValidElement<{ id?: string }>(children) ? cloneElement(children, { id }) : children}</div>;
}

function AnswerControl({ label, value, onChange, yesOnly = false, id }: { label: string; value: Answer; onChange: (value: Answer) => void; yesOnly?: boolean; id?: string }) {
  return <select id={id} aria-label={label} value={value} onChange={(event) => onChange(event.target.value as Answer)}><option value="">À renseigner</option><option value="yes">Oui</option>{!yesOnly && <option value="no">Non</option>}</select>;
}

export function SeaOperationsPage() {
  const { client } = useOutletContext<AppShellOutletContext>();
  const [data, setData] = useState<SeaOperationData | null>(null);
  const [record, setRecord] = useState<SeaOperationRecord | null>(null);
  const [draft, setDraft] = useState<SeaOperationPayload>(emptySeaOperation);
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [step, setStep] = useState(0);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [issues, setIssues] = useState<string[]>([]);
  const loadSequence = useRef(0);
  const loadedAccount = useRef('');
  const applyData = useCallback((result: SeaOperationData) => {
    setData(result);
    const account = recoveryKey(result);
    if (loadedAccount.current === account) return;
    loadedAccount.current = account;
    setRecord(null); setDraft(emptySeaOperation()); setEditing(false); setDirty(false); setStep(0);
    const recovery = readRecovery(result);
    if (!recovery) return;
    const existing = recovery.recordId ? result.records.find((item) => item.id === recovery.recordId) : null;
    if (recovery.recordId && (!existing || existing.status === 'signed' || !existing.canEdit)) {
      clearRecovery(result);
      setNotice('La préparation locale ne peut pas être reprise : la fiche est signée, inaccessible ou vos droits ont changé.');
      return;
    }
    setRecord(existing ? { ...existing, version: recovery.version! } : null);
    setDraft(recovery.draft); setStep(recovery.step); setEditing(true); setDirty(true);
    setNotice('Votre préparation non enregistrée a été récupérée dans cet onglet. Vérifiez-la avant de l’enregistrer.');
  }, []);

  useEffect(() => {
    let active = true;
    fetchSeaOperationData(client).then((result) => { if (active) applyData(result); }).catch((reason: unknown) => { if (active) setError(errorMessage(reason)); });
    return () => { active = false; };
  }, [client, applyData]);
  useEffect(() => {
    if (!data || !dirty) return;
    try { sessionStorage.setItem(recoveryKey(data), JSON.stringify({ draft, recordId: record?.id ?? null, version: record?.version ?? null, step })); }
    catch { /* Editing and server saves remain available when local storage is unavailable. */ }
  }, [data, dirty, draft, record, step]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    const beforeNavigation = (event: MouseEvent) => {
      if (!dirty || event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
      if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
      const target = new URL(link.href, window.location.href);
      if (target.origin === window.location.origin && target.pathname === window.location.pathname && target.search === window.location.search) return;
      if (!window.confirm('Quitter cette fiche sans enregistrer les modifications ?')) { event.preventDefault(); event.stopPropagation(); }
      else { clearRecovery(data); setDirty(false); }
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', beforeNavigation, true);
    return () => { window.removeEventListener('beforeunload', beforeUnload); document.removeEventListener('click', beforeNavigation, true); };
  }, [dirty, data]);

  const update = (patch: Partial<SeaOperationPayload>) => { setDraft((current) => ({ ...current, ...patch })); setDirty(true); setNotice(''); setIssues([]); };
  const vesselUpdate = (patch: Partial<SeaOperationPayload['vessel']>) => update({ vessel: { ...draft.vessel, ...patch } });
  const editable = !record || record.canEdit;
  const signed = record?.status === 'signed';
  const assessment = getSeaOperationAssessment(draft);
  const canSign = record?.canSign || (!record && data?.vessels.some((vessel) => String(vessel.id) === draft.vessel.id && vessel.canSign));
  const confirmLeave = () => !dirty || window.confirm('Quitter cette fiche sans enregistrer les modifications ?');
  const remember = (saved: SeaOperationRecord) => {
    clearRecovery(data);
    setRecord(saved); setDraft(saved.draft); setDirty(false);
    setData((current) => current ? { ...current, records: [saved, ...current.records.filter((item) => item.id !== saved.id)] } : current);
  };
  async function open(item: SeaOperationRecord) {
    if (!confirmLeave()) return;
    const request = ++loadSequence.current;
    setBusy(true); setError(''); setNotice(''); setIssues([]);
    try { const loaded = await fetchSeaOperationDetail(client, item.id); if (request === loadSequence.current) { remember(loaded); setEditing(true); setStep(0); } }
    catch (reason) { setError(errorMessage(reason)); }
    finally { setBusy(false); }
  }
  function create() {
    if (!confirmLeave()) return;
    clearRecovery(data);
    ++loadSequence.current;
    setRecord(null); setDraft(emptySeaOperation()); setDirty(false); setEditing(true); setStep(0); setError(''); setNotice(''); setIssues([]);
  }
  async function save(sign = false) {
    if (busy) return;
    const validation = validateSeaOperation(draft, sign ? draft.decision || 'GO' : 'DRAFT');
    if (validation.length) { setIssues(validation); setStep(sign ? 3 : step); return; }
    setBusy(true); setError(''); setIssues([]); setNotice('');
    try {
      const saved = await saveSeaOperation(client, draft, record || undefined);
      remember(saved);
      if (sign) {
        const finalized = await signSeaOperation(client, saved, draft.signature.captainName, draft.signature.acknowledged);
        remember(finalized); setNotice('Décision du Capitaine signée et enregistrée. La fiche est figée.');
      } else setNotice('Brouillon enregistré.');
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setBusy(false); }
  }
  const records = (data?.records || []).filter((item) => {
    const matches = `${item.draft.project} ${item.draft.client} ${item.draft.vessel.name}`.toLocaleLowerCase('fr').includes(search.toLocaleLowerCase('fr'));
    return matches && (status === 'all' || (status === 'draft' ? item.status === 'draft' : item.status === 'signed' && item.draft.decision === status));
  });

  return <div className="so-page"><div className="so-screen">
    <header className="so-heading sp-module-header"><div className="so-title"><span className="so-icon"><Anchor size={26} /></span><div><span className="so-eyebrow">OPÉRATIONS · OPE-FOR-10-C</span><h1>Opération en Mer</h1><p>Préparer la mission, vérifier les conditions et consigner la décision du Capitaine.</p></div></div></header>
    <ModuleRibbon ariaLabel="Commandes Opération en Mer" singleRow><ModuleRibbonGroup label="Opérations"><ModuleRibbonCommand disabled={busy || !data} icon={<Plus size={22} />} label="Nouvelle opération" onClick={create} />{editing && <ModuleRibbonCommand disabled={busy} icon={<ArrowLeft size={22} />} label="Les opérations" onClick={() => { if (confirmLeave()) { clearRecovery(data); setEditing(false); setDirty(false); setNotice('' ); } }} />}</ModuleRibbonGroup>{editing && <ModuleRibbonGroup label="Fiche">{editable && !signed && <ModuleRibbonCommand disabled={busy} icon={<Save size={22} />} label="Enregistrer le brouillon" onClick={() => void save()} />}{record && !dirty && <ModuleRibbonCommand icon={<Printer size={22} />} label="Imprimer la fiche" onClick={() => window.print()} />}</ModuleRibbonGroup>}</ModuleRibbon>
    {error && <div className="so-alert so-danger" role="alert"><AlertTriangle size={19} /><span>{error}</span>{!data && <button onClick={() => { setError(''); void fetchSeaOperationData(client).then(applyData).catch((reason: unknown) => setError(errorMessage(reason))); }}>Réessayer</button>}</div>}
    {notice && <div className="so-alert so-success" role="status"><CheckCircle2 size={18} />{notice}</div>}
    {!data && !error && <p role="status">Chargement des opérations en mer…</p>}
    {data && !editing && <>
      <div className="so-metrics">{[['Fiches enregistrées', data.records.length], ['En préparation', data.records.filter((item) => item.status === 'draft').length], ['Décisions GO', data.records.filter((item) => item.status === 'signed' && item.draft.decision === 'GO').length], ['Décisions NO GO', data.records.filter((item) => item.status === 'signed' && item.draft.decision === 'NO_GO').length]].map(([label, count]) => <div key={label}><span>{label}</span><strong>{count}</strong></div>)}</div>
      <section className="so-register sp-panel"><header><div><h2>Registre des opérations</h2><p>Les préparations et décisions de votre société.</p></div><div className="so-filters sp-filters"><label className="so-search"><Search size={17} /><input aria-label="Rechercher une opération" placeholder="Projet, client ou navire…" value={search} onChange={(event) => setSearch(event.target.value)} /></label><select aria-label="Filtrer par état" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">Tous les états</option><option value="draft">Brouillons</option><option value="GO">GO signés</option><option value="NO_GO">NO GO signés</option></select></div></header>
      {records.length ? <div className="so-records">{records.map((item) => <button className="so-record" key={item.id} disabled={busy} onClick={() => void open(item)}><span className="so-record-icon"><Ship size={21} /></span><span><strong>{item.draft.project || 'Opération sans titre'}</strong><small>{item.draft.vessel.name || 'Navire à renseigner'} · {item.draft.client || 'Client à renseigner'}</small></span><span className={`so-badge ${item.status === 'draft' ? '' : item.draft.decision === 'GO' ? 'is-go' : 'is-nogo'}`}>{item.status === 'draft' ? 'Brouillon' : item.draft.decision === 'NO_GO' ? 'NO GO' : 'GO'}</span><span className="so-record-date">{formatDate(item.updatedAt)}<small>{item.updatedByName}</small></span><ChevronRight size={18} /></button>)}</div> : <div className="so-empty"><Compass size={42} /><h3>{search || status !== 'all' ? 'Aucune opération correspondante' : 'Préparez votre première opération en mer'}</h3><p>Renseignez la mission puis les contrôles du formulaire GO / NO GO.</p>{!search && status === 'all' && <button onClick={create}><Plus size={16} />Créer une opération</button>}</div>}</section>
      <p className="so-source">Référence : formulaire « GO / NO GO – Opération en Mer », OPE-FOR-10-C.</p>
    </>}
    {editing && <>
      <div className="so-workbar"><div><span className={`so-badge ${signed ? draft.decision === 'GO' ? 'is-go' : 'is-nogo' : ''}`}>{signed ? draft.decision === 'GO' ? 'GO signé' : 'NO GO signé' : 'Brouillon'}</span><strong>{draft.project || 'Nouvelle opération'}</strong><small>{dirty ? 'Modifications non enregistrées' : record ? `Version ${record.version} · ${formatDate(record.updatedAt)}` : 'Fiche à compléter'}</small></div></div>
      <nav className="so-steps" aria-label="Étapes de la préparation">{STEPS.map((label, index) => <button key={label} aria-current={step === index ? 'step' : undefined} className={step === index ? 'is-active' : ''} onClick={() => setStep(index)}><span>{index + 1}</span>{label}</button>)}</nav>
      {issues.length > 0 && <div className="so-alert so-danger" role="alert"><div><strong>La fiche doit être complétée</strong><ul>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div></div>}
      <fieldset className="so-form" disabled={!editable || busy || signed}>
        <section className={`so-panel ${step === 0 ? 'is-active' : ''}`} aria-label="Préparation de l’Armement">
          <div className="so-section-title"><FileText size={21} /><div><h2>Préparation de l’Armement</h2><p>Informations opérationnelles et organisation de la mission.</p></div></div>
          <div className="so-grid"><Field label="Projet"><input value={draft.project} onChange={(event) => update({ project: event.target.value })} /></Field><Field label="Client"><input value={draft.client} onChange={(event) => update({ client: event.target.value })} /></Field><Field label="Coordonnées du client" wide><input value={draft.clientContact} onChange={(event) => update({ clientContact: event.target.value })} /></Field><Field label="Description de l’opération" wide><textarea rows={3} value={draft.description} onChange={(event) => update({ description: event.target.value })} /></Field></div>
          <h3>Personnel spécial à embarquer</h3>{draft.specialPersonnel.map((person, index) => <div className="so-contact" key={index}><Field label={`Prénom NOM ${index + 1}`}><input value={person.name} onChange={(event) => update({ specialPersonnel: draft.specialPersonnel.map((row, i) => i === index ? { ...row, name: event.target.value } : row) })} /></Field><Field label={`Téléphone ${index + 1}`}><input type="tel" value={person.phone} onChange={(event) => update({ specialPersonnel: draft.specialPersonnel.map((row, i) => i === index ? { ...row, phone: event.target.value } : row) })} /></Field><button type="button" className="so-secondary sp-button sp-button--secondary" aria-label={`Retirer la personne ${index + 1}`} onClick={() => update({ specialPersonnel: draft.specialPersonnel.filter((_, i) => i !== index) })}><Trash2 size={16} /></button></div>)}<button className="so-secondary sp-button sp-button--secondary" onClick={() => update({ specialPersonnel: [...draft.specialPersonnel, { name: '', phone: '' }] })}><Plus size={15} />Ajouter une personne</button>
          <h3>Demande d’attribution de poste à quai (DAPAQ)</h3><p className="so-help">Caen, Le Havre, Dieppe et Rouen : préparation dans NOMADE par l’Armement ou le Capitaine. Autres ports : transmission par mail à la Capitainerie.</p><div className="so-grid"><Field label="Mode de déclaration"><select value={draft.dapaq.method} onChange={(event) => update({ dapaq: { ...draft.dapaq, method: event.target.value as SeaOperationPayload['dapaq']['method'] } })}><option value="">À renseigner</option><option value="nomade">NOMADE</option><option value="email">Mail à la Capitainerie</option></select></Field><Field label="Préparée par"><select value={draft.dapaq.preparedBy} onChange={(event) => update({ dapaq: { ...draft.dapaq, preparedBy: event.target.value as SeaOperationPayload['dapaq']['preparedBy'] } })}><option value="">À renseigner</option><option value="armament">Armement</option><option value="captain">Capitaine</option>{draft.dapaq.method !== 'nomade' && <option value="agent">Agent consignataire</option>}</select></Field>{draft.dapaq.preparedBy === 'agent' && <><Field label="Nom de l’agent consignataire"><input value={draft.dapaq.agentName} onChange={(event) => update({ dapaq: { ...draft.dapaq, agentName: event.target.value } })} /></Field><Field label="Coordonnées de l’agent"><input value={draft.dapaq.agentContact} onChange={(event) => update({ dapaq: { ...draft.dapaq, agentContact: event.target.value } })} /></Field></>}</div>
          <h3>Navire et voyage</h3><div className="so-grid"><Field label="Navire"><select value={draft.vessel.id ?? ''} onChange={(event) => { const vessel = data?.vessels.find((item) => item.id === Number(event.target.value)); vesselUpdate({ id: vessel ? String(vessel.id) : '', name: vessel?.name || '', registrationImo: vessel?.registrationImo || '' }); }}><option value="">Choisir un navire</option>{data?.vessels.map((vessel) => <option key={vessel.id} value={vessel.id}>{vessel.name}</option>)}</select></Field><Field label="Immatriculation / IMO"><input value={draft.vessel.registrationImo} onChange={(event) => vesselUpdate({ registrationImo: event.target.value })} /></Field><Field label="Prénom NOM du Capitaine"><input value={draft.vessel.captainName} onChange={(event) => vesselUpdate({ captainName: event.target.value })} /></Field><span /><Field label="Port de départ"><input value={draft.vessel.departurePort} onChange={(event) => vesselUpdate({ departurePort: event.target.value })} /></Field><Field label="Quai de départ"><input value={draft.vessel.departureQuay} onChange={(event) => vesselUpdate({ departureQuay: event.target.value })} /></Field><Field label="Port d’arrivée"><input value={draft.vessel.arrivalPort} onChange={(event) => vesselUpdate({ arrivalPort: event.target.value })} /></Field><Field label="Quai d’arrivée"><input value={draft.vessel.arrivalQuay} onChange={(event) => vesselUpdate({ arrivalQuay: event.target.value })} /></Field><Field label="ETD · date et heure de départ"><input type="datetime-local" value={draft.vessel.etd} onChange={(event) => vesselUpdate({ etd: event.target.value })} /></Field><Field label="ETA · date et heure d’arrivée"><input type="datetime-local" value={draft.vessel.eta} onChange={(event) => vesselUpdate({ eta: event.target.value })} /></Field></div><p className="so-help">Les horaires sont saisis dans l’heure locale de l’opération.</p>
        </section>
        <section className={`so-panel ${step === 1 ? 'is-active' : ''}`} aria-label="Contrôles du Capitaine">
          <div className="so-section-title"><ClipboardCheck size={22} /><div><h2>Contrôles avant appareillage</h2><p>À remplir par le Capitaine. Toute réponse bloquante impose un NO GO.</p></div></div>
          {SEA_OPERATION_SECTIONS.map((section) => <section className="so-check-section" key={section.id}><h3>{section.title}</h3>{section.applicability && <Field label="Cette rubrique est-elle applicable ?"><AnswerControl label={`${section.title} applicable`} value={draft.applicability[section.applicability]} onChange={(value) => update({ applicability: { ...draft.applicability, [section.applicability!]: value } })} /></Field>}{(!section.applicability || draft.applicability[section.applicability] === 'yes') && <>
            {SEA_OPERATION_CHECKS.filter((check) => check.section === section.id).map((check) => <div className={`so-check ${check.blocking && draft.checks[check.id] === 'no' ? 'is-blocking' : ''}`} key={check.id}><div><label htmlFor={`check-${check.id}`}>{check.label}</label>{check.blocking && <small className="so-block-label">Non = NO GO</small>}{check.help && <p className="so-help">{check.help}</p>}</div><div><select id={`check-${check.id}`} value={draft.checks[check.id]} onChange={(event) => update({ checks: { ...draft.checks, [check.id]: event.target.value as Answer } })}><option value="">À renseigner</option><option value="yes">{check.yesLabel || 'Oui'}</option>{!check.yesOnly && <option value="no">{check.noLabel || 'Non'}</option>}</select></div>{draft.checks[check.id] === 'no' && (check.justifyNo || check.blocking) && <Field label={`Justification — ${check.label}`} wide><textarea rows={2} value={draft.justifications[check.id] || ''} onChange={(event) => update({ justifications: { ...draft.justifications, [check.id]: event.target.value } })} /></Field>}</div>)}
            {section.id === '2.4' && <details className="so-kit"><summary>Kit médical plongée prévu par le formulaire</summary><p>En complément de la dotation médicale réglementaire :</p><ul>{DIVING_MEDICAL_KIT.map((item) => <li key={item.article}>{item.quantity} × {item.article}. {item.detail}</li>)}</ul></details>}
            {section.id === '2.5' && draft.applicability.towing === 'yes' && <div className="so-grid"><Field label="Des marins doivent-ils aller sur le navire remorqué ?"><AnswerControl label="Embarquement sur le remorqué" value={draft.towedVesselBoarding.required} onChange={(value) => update({ towedVesselBoarding: { ...draft.towedVesselBoarding, required: value } })} /></Field>{draft.towedVesselBoarding.required === 'yes' && <><Field label="Mesures de sécurité sur le remorqué"><select value={draft.towedVesselBoarding.measures} onChange={(event) => update({ towedVesselBoarding: { ...draft.towedVesselBoarding, measures: event.target.value as 'sms' | 'specific' } })}><option value="">À renseigner</option><option value="sms">Pas de mesures autres que le SMS</option><option value="specific">Mesures spécifiques prises</option></select></Field>{draft.towedVesselBoarding.measures === 'specific' && <Field label="Ronde de sécurité, zones dangereuses et mesures prises" wide><textarea value={draft.towedVesselBoarding.details} onChange={(event) => update({ towedVesselBoarding: { ...draft.towedVesselBoarding, details: event.target.value } })} /></Field>}</>}</div>}
            {section.id === '2.7' && <><h4>Services à l’arrivée</h4><div className="so-checkboxes">{([['towing', 'Remorquage'], ['pilotage', 'Pilotage'], ['mooring', 'Lamanage'], ['none', 'Le règlement n’exige pas ces services']] as const).map(([key, label]) => <label key={key}><input type="checkbox" checked={draft.portServices.includes(key)} onChange={(event) => update({ portServices: event.target.checked ? key === 'none' ? ['none'] : [...draft.portServices.filter((item) => item !== 'none'), key] : draft.portServices.filter((item) => item !== key) })} />{label}</label>)}</div><label className="so-checkbox"><input type="checkbox" checked={draft.mandatoryServicesNotified} onChange={(event) => update({ mandatoryServicesNotified: event.target.checked })} />Les services obligatoires sont identifiés et prévenus au besoin.</label></>}
            {section.id === '2.8' && <><div className="so-grid"><Field label="Escale déléguée à un shipchandler ?"><AnswerControl label="Shipchandler" value={draft.supplies.delegated} onChange={(value) => update({ supplies: { ...draft.supplies, delegated: value } })} /></Field>{draft.supplies.delegated === 'yes' && <><Field label="Nom du shipchandler"><input value={draft.supplies.shipchandlerName} onChange={(event) => update({ supplies: { ...draft.supplies, shipchandlerName: event.target.value } })} /></Field><Field label="Coordonnées du shipchandler"><input value={draft.supplies.shipchandlerContact} onChange={(event) => update({ supplies: { ...draft.supplies, shipchandlerContact: event.target.value } })} /></Field></>}{draft.supplies.delegated === 'no' && <p className="so-help">Le Capitaine gère l’escale avec l’appui de l’Armement.</p>}</div><div className="so-checkboxes">{SEA_OPERATION_SUPPLY_ITEMS.map((item) => <label key={item.id}><input type="checkbox" checked={draft.supplies.items.includes(item.id)} onChange={(event) => update({ supplies: { ...draft.supplies, items: event.target.checked ? [...draft.supplies.items, item.id] : draft.supplies.items.filter((value) => value !== item.id) } })} />{item.label}</label>)}</div><Field label="Fournisseurs et besoins identifiés"><textarea rows={3} value={draft.supplies.suppliers} onChange={(event) => update({ supplies: { ...draft.supplies, suppliers: event.target.value } })} /></Field><label className="so-checkbox"><input type="checkbox" checked={draft.supplies.customerAccountsPrepared} onChange={(event) => update({ supplies: { ...draft.supplies, customerAccountsPrepared: event.target.checked } })} />Comptes clients préparés au besoin avec la Direction financière.</label></>}
          </>}</section>)}
        </section>
        <section className={`so-panel ${step === 2 ? 'is-active' : ''}`} aria-label="Plan de passage"><div className="so-section-title"><Compass size={22} /><div><h2>Plan de passage</h2><p>Cartes, points de route et conditions de navigation.</p></div></div><Field label="Numéro de la ou des cartes marines"><input value={draft.charts} onChange={(event) => update({ charts: event.target.value })} /></Field><div className="so-waypoints">{draft.waypoints.map((point, index) => <section className="so-waypoint" key={point.id}><header><h3>Point {index + 1}</h3><button className="so-secondary sp-button sp-button--secondary" aria-label={`Supprimer le point ${index + 1}`} onClick={() => update({ waypoints: draft.waypoints.filter((_, i) => i !== index) })}><Trash2 size={15} /></button></header><div className="so-grid">{([['number', 'N° du point'], ['descriptionVhf', 'Description / Contact VHF'], ['latitude', 'Latitude'], ['longitude', 'Longitude'], ['ukc', 'UKC'], ['eta', 'ETA · date et heure']] as const).map(([key, label]) => <Field key={key} label={`${label} · point ${index + 1}`}><input type="text" placeholder={key === 'eta' ? 'HH:mm ou AAAA-MM-JJTHH:mm' : undefined} value={point[key]} onChange={(event) => update({ waypoints: draft.waypoints.map((row, i) => i === index ? { ...row, [key]: event.target.value } : row) })} /></Field>)}</div><label className="so-checkbox"><input type="checkbox" checked={point.denseTraffic} onChange={(event) => update({ waypoints: draft.waypoints.map((row, i) => i === index ? { ...row, denseTraffic: event.target.checked } : row) })} />Zone maritime à trafic dense</label></section>)}</div><button className="so-secondary sp-button sp-button--secondary" onClick={() => update({ waypoints: [...draft.waypoints, { id: crypto.randomUUID(), number: String(draft.waypoints.length + 1), descriptionVhf: '', latitude: '', longitude: '', ukc: '', eta: '', denseTraffic: false }] })}><Plus size={16} />Ajouter un point de passage</button></section>
        <section className={`so-panel ${step === 3 ? 'is-active' : ''}`} aria-label="Décision du Capitaine"><div className="so-section-title"><Anchor size={22} /><div><h2>Décision du Capitaine</h2><p>Le Capitaine consigne sa décision après examen des conditions de la mission.</p></div></div>
          <div className={`so-assessment ${assessment.blockingChecks.length ? 'is-nogo' : 'is-pending'}`}><AlertTriangle size={22} /><div><strong>{assessment.blockingChecks.length ? `NO GO imposé · ${assessment.blockingChecks.length} contrôle(s) bloquant(s)` : 'Vérification de la préparation'}</strong><p>Toute case rouge cochée entraîne un NO GO automatique. Le Capitaine doit trouver une solution et justifier toute situation empêchant l’appareillage.</p>{assessment.blockingChecks.length > 0 && <ul>{assessment.blockingChecks.map((check) => <li key={check.id}>{check.label}</li>)}</ul>}</div></div>
          <Field label="Décision"><select value={draft.decision} onChange={(event) => update({ decision: event.target.value as SeaOperationPayload['decision'] })}><option value="">Choisir la décision</option><option value="GO" disabled={assessment.blockingChecks.length > 0}>GO · la mission peut être réalisée</option><option value="NO_GO">NO GO · la mission ne peut être réalisée</option></select></Field><Field label="Risques identifiés / informations à transmettre à l’Armement"><textarea rows={4} value={draft.risks} onChange={(event) => update({ risks: event.target.value })} /></Field><div className="so-grid"><Field label="Prénom NOM du Capitaine signataire"><input value={draft.signature.captainName} onChange={(event) => update({ signature: { ...draft.signature, captainName: event.target.value } })} /></Field><Field label="Date de la décision"><input type="date" value={draft.signature.date} onChange={(event) => update({ signature: { ...draft.signature, date: event.target.value } })} /></Field><Field label="Lieu de la décision"><input value={draft.signature.place} onChange={(event) => update({ signature: { ...draft.signature, place: event.target.value } })} /></Field></div><label className="so-checkbox so-attestation"><input type="checkbox" checked={draft.signature.acknowledged} onChange={(event) => update({ signature: { ...draft.signature, acknowledged: event.target.checked } })} />En qualité de Capitaine, je confirme les informations renseignées et signe cette décision.</label>
        </section>
      </fieldset>
      {step === 3 && <div className="so-signature-footer">{signed ? <p><CheckCircle2 size={18} />Décision signée par {record.signedByName} le {formatDate(record.signedAt)}. Cette fiche est figée.</p> : <><p>{canSign ? 'La signature enregistre votre identité et fige définitivement cette fiche.' : 'La signature est réservée au compte réel du Capitaine affecté au navire. Enregistrez la préparation pour lui transmettre la fiche.'}</p><button disabled={busy || !editable || !canSign || !draft.decision} onClick={() => void save(true)}><CheckCircle2 size={17} />Signer la décision {draft.decision === 'NO_GO' ? 'NO GO' : draft.decision}</button></>}</div>}
      <div className="so-pagination"><button className="so-secondary sp-button sp-button--secondary" disabled={step === 0} onClick={() => setStep((current) => current - 1)}><ArrowLeft size={15} />Précédent</button><span>{step + 1} / {STEPS.length}</span><button className="so-secondary sp-button sp-button--secondary" disabled={step === STEPS.length - 1} onClick={() => setStep((current) => current + 1)}>Suivant<ChevronRight size={15} /></button></div>
    </>}
  </div>{record && <SeaOperationPrint record={record} />}</div>;
}
