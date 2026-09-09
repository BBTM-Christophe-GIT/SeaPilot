import { useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Link, useOutletContext } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Download, FileCheck2, Pencil, Plus, Printer, RotateCcw, Trash2 } from 'lucide-react';
import { AppDialog } from '../../components/AppDialog';
import { supabase } from '../../lib/supabaseClient';
import type { RoleKey } from '../permissions/roles';
import type { AppShellOutletContext } from '../shell/AppShell';
import { LiftingPaperForm } from './LiftingPaperForm';
import { buildLiftingPaperPdf } from './liftingPaperPdf';
import { LiftingIcon } from './LiftingIcons';
import { LiftingControlForm, LiftingItemForm, LiftingStartForm } from './LiftingForms';
import { INSPECTOR, KIND_LABELS, blankItem, canManageLifting, entryComplete, entryUnsatisfactory, formatLiftingDate, type InspectionEntry, type ItemDraft, type LiftingInspection, type LiftingItem, type LiftingKind, type LiftingVessel } from './liftingModel';
import { downloadLiftingReport, fetchInspectionEntries, fetchLiftingRegister, fetchLiftingPaperInventory, fetchLiftingVessels, loadLiftingStamp, publishLiftingInspection, saveInspectionEntries, saveLiftingItem, setLiftingItemActive, startLiftingInspection } from './liftingQueries';
import { buildLiftingPdf, liftingReportFilename, saveLiftingBlob } from './liftingPdf';
import { accessoryDefinition, groupByAccessory } from './liftingControls';
import { LiftingFilters } from './LiftingFilters';
import { LiftingSourceDetails } from './LiftingSourceDetails';
import { LiftingPublishedControls } from './LiftingPublishedControls';
import { matchesLiftingItem, accessoryLabel } from './liftingSearch';
import './lifting.css';
import { createLiftingPreviewClient } from './liftingPreview';

function messageOf(error: unknown) { return error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Impossible de réaliser cette opération. Réessayez.'; }
const SECTIONS = [
  { key: 'crane', title: 'Examen à fond - Grue', subtitle: 'Structure, équipements et essais' },
  { key: 'lifting', title: 'Registre des Apparaux de Levage', subtitle: 'Inventaire et contrôles annuels' },
  { key: 'towing', title: 'Remorques', subtitle: 'Lignes et accessoires de remorquage' },
] as const;

export function LiftingPage({ client, roles }: { client?: SupabaseClient; roles?: RoleKey[] }) {
  const context = useOutletContext<AppShellOutletContext | undefined>();
  const [previewClient] = useState(createLiftingPreviewClient);
  const db = client || (context?.previewMode ? previewClient : context?.client) || supabase;
  const manager = canManageLifting(roles || context?.roles || []);
  const [section, setSection] = useState<LiftingKind | 'crane'>('lifting');
  const [vessels, setVessels] = useState<LiftingVessel[]>([]);
  const [vesselId, setVesselId] = useState(0);
  const [items, setItems] = useState<LiftingItem[]>([]);
  const [inspections, setInspections] = useState<LiftingInspection[]>([]);
  const [report, setReport] = useState<LiftingInspection | null>(null);
  const [entries, setEntries] = useState<InspectionEntry[]>([]);
  const [view, setView] = useState<'inventory' | 'reports'>('inventory');
  const [query, setQuery] = useState('');
  const [accessoryType, setAccessoryType] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [year, setYear] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editor, setEditor] = useState<{ id?: number; draft: ItemDraft } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [formEpoch, setFormEpoch] = useState(0);
  const [startOpen, setStartOpen] = useState(false);
  const [paperOpen, setPaperOpen] = useState(false);
  const [removeItem, setRemoveItem] = useState<LiftingItem | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const requestId = useRef(0);
  const pendingInspection = useRef<{ id: number; vesselId: number; kind: LiftingKind } | null>(null);
  const vessel = vessels.find((v) => v.id === vesselId);
  const activeItems = items.filter((i) => i.active);
  const complete = entries.filter(entryComplete).length;
  const inventoryItems = items.filter((item) => showInactive || item.active);
  const filtered = inventoryItems.filter((item) => matchesLiftingItem(item, query, accessoryType));
  const displayedReports = inspections.filter((r) => !year || String(r.inspection_year) === year);

  useEffect(() => {
    let cancelled = false;
    fetchLiftingVessels(db).then((loaded) => {
      if (cancelled) return;
      setVessels(loaded); setVesselId((current) => loaded.some((v) => v.id === current) ? current : (loaded.find((v) => v.acronym === 'SUR')?.id || loaded[0]?.id || 0));
      if (!loaded.length) setLoading(false);
    }).catch((e) => { if (!cancelled) { setError(messageOf(e)); setLoading(false); } });
    return () => { cancelled = true; };
  }, [db]);

  async function reload() {
    if (!vesselId || section === 'crane') return;
    const id = ++requestId.current; setLoading(true);
    try {
      const result = await fetchLiftingRegister(db, vesselId, section);
      if (id === requestId.current) {
        setItems(result.items); setInspections(result.inspections);
        const pending = pendingInspection.current;
        if (pending?.vesselId === vesselId && pending.kind === section) {
          const selected = result.inspections.find((inspection) => inspection.id === pending.id);
          if (!selected) throw new Error('Contrôle créé. Retrouvez-le dans les rapports après rechargement.');
          const rows = await fetchInspectionEntries(db, pending.id);
          if (id === requestId.current) { setReport(selected); setEntries(rows); pendingInspection.current = null; }
        }
      }
    } catch (e) { if (id === requestId.current) setError(messageOf(e)); }
    finally { if (id === requestId.current) setLoading(false); }
  }
  useEffect(() => {
    setReport(null); setDirty(false); setEntries([]); setItems([]); setInspections([]); setError(''); setNotice(''); setQuery(''); setAccessoryType(''); setYear('');
    void reload();
    return () => { requestId.current += 1; };
  }, [db, vesselId, section]);

  async function act(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (e) { setError(messageOf(e)); } finally { setBusy(false); }
  }
  async function saveControls(rows: InspectionEntry[]): Promise<boolean> {
    if (busy || !report) return false;
    setBusy(true); setError(''); setNotice('');
    try {
      const revision = await saveInspectionEntries(db, report, rows);
      const saved = new Map(rows.map((row) => [row.id, row]));
      setReport({ ...report, revision });
      setEntries((previous) => previous.map((row) => saved.get(row.id) || row));
      setNotice(`${rows.length} matériel${rows.length > 1 ? 's' : ''} enregistré${rows.length > 1 ? 's' : ''}. Les observations seront reprises dans le PDF.`);
      return true;
    } catch (e) { setError(messageOf(e)); return false; } finally { setBusy(false); }
  }
  async function openReport(selected: LiftingInspection) {
    await act(async () => { const rows = await fetchInspectionEntries(db, selected.id); setEntries(rows); setReport(selected); });
  }
  async function reloadCurrentReport() {
    if (!report) { await reload(); return; }
    await act(async () => {
      const loaded = await fetchLiftingRegister(db, report.vessel_id, report.kind);
      const latest = loaded.inspections.find((inspection) => inspection.id === report.id);
      if (!latest) throw new Error('Contrôle introuvable.');
      const rows = await fetchInspectionEntries(db, latest.id);
      setInspections(loaded.inspections); setReport(latest); setEntries(rows); setDirty(false); setFormEpoch((value) => value + 1);
    });
  }
  async function exportReport(selected: LiftingInspection) {
    await act(async () => {
      if (selected.storage_path) saveLiftingBlob(await downloadLiftingReport(db, selected.storage_path), liftingReportFilename(selected));
      else { const rows = await fetchInspectionEntries(db, selected.id); const pdf = await buildLiftingPdf(selected, rows); saveLiftingBlob(pdf.blob, pdf.filename); }
    });
  }
  return <section className="lifting-page">
    <header className="lifting-heading"><div><p className="lifting-eyebrow">SÉCURITÉ DES ÉQUIPEMENTS</p><h1>Levage</h1><p>Les équipements à bord, leur état et leurs contrôles.</p></div><Link className="secondary-button" to="/modules/certificates"><FileCheck2 size={17} /> Certificats flotte</Link></header>
    <nav className="lifting-sections" aria-label="Sections du module Levage">{SECTIONS.map((s) => <button disabled={busy || dirty} key={s.key} aria-label={s.title} className={section === s.key ? 'is-selected' : ''} aria-pressed={section === s.key} onClick={() => setSection(s.key)}><span className={`lifting-section-icon ${s.key}`}><LiftingIcon kind={s.key} /></span><span><strong>{s.title}</strong><small>{s.subtitle}</small></span></button>)}</nav>
    {section === 'crane' ? <div className="lifting-crane"><LiftingIcon kind="crane" /><div><h2>Examen à fond - Grue</h2><p>Cette section est réservée au contrôle de la grue. Les rapports existants restent disponibles dans les certificats du navire.</p><p>La première version du module couvre le registre des apparaux et les remorques.</p><Link to="/modules/certificates">Consulter les certificats flotte</Link></div></div> : <>
      <div className="lifting-toolbar"><label>Navire<select aria-label="Navire" value={vesselId} disabled={busy || dirty || !vessels.length} onChange={(e) => setVesselId(Number(e.target.value))}>{!vessels.length && <option value={0}>Aucun navire accessible</option>}{vessels.map((v) => <option value={v.id} key={v.id}>{v.name}</option>)}</select></label><div className="lifting-verifier"><span>Vérificateur</span><strong>{INSPECTOR}</strong></div></div>
      {error && !paperOpen && !editor && !startOpen && !publishOpen && !removeItem && <div className="lifting-error" role="alert">{error}<button onClick={() => { setError(''); void reloadCurrentReport(); }}>Recharger</button></div>}
      {notice && <p className="lifting-notice" role="status"><CheckCircle2 size={18} />{notice}</p>}
      {!report ? <>
        <div className="lifting-summary"><div><strong>{activeItems.length}</strong><span>matériels en inventaire</span></div><div><strong>{inspections.filter((r) => r.status === 'draft').length}</strong><span>contrôles en cours</span></div><div><strong>{inspections.filter((r) => r.status === 'published').length}</strong><span>rapports finalisés</span></div><div className="lifting-summary-actions"><button className="secondary-button" disabled={busy || loading || !vessels.length} onClick={() => { setError(''); setPaperOpen(true); }}><Printer size={18} /> Fiche de contrôle papier</button><button className="primary-button" disabled={busy || loading || !vessels.length} onClick={() => { setError(''); setStartOpen(true); }}><Plus size={18} /> Nouveau contrôle annuel</button></div></div>
        <div className="lifting-content"><div className="lifting-content-heading"><div className="lifting-tabs" role="group" aria-label="Vue du registre"><button aria-pressed={view === 'inventory'} onClick={() => setView('inventory')}>Inventaire</button><button aria-pressed={view === 'reports'} onClick={() => setView('reports')}>Contrôles et rapports</button></div>{manager && view === 'inventory' && <button className="secondary-button" disabled={busy || !vesselId} onClick={() => { setError(''); setEditor({ draft: blankItem(section) }); }}><Plus size={17} /> Ajouter un matériel</button>}</div>
          {loading ? <p className="lifting-empty" role="status">Chargement du registre…</p> : view === 'inventory' ? <>
            <LiftingFilters items={inventoryItems} query={query} type={accessoryType} onQuery={setQuery} onType={setAccessoryType} count={filtered.length} context="inventaire" />
            <div className="lifting-filter"><label className="lifting-toggle"><input type="checkbox" checked={showInactive} onChange={(e) => { setShowInactive(e.target.checked); setAccessoryType(''); }} /> Inclure les matériels supprimés</label></div>
            {!filtered.length ? <p className="lifting-empty">{query || accessoryType ? 'Aucun matériel ne correspond aux filtres.' : 'Aucun matériel dans cet inventaire.'}</p> : <>{groupByAccessory(filtered, (item) => item).map((group) => <section key={group.label} className="lifting-accessory-group" aria-label={group.label}><header><div><h3>{group.label}</h3><i lang="en">{group.definition?.en}</i></div><strong>{group.rows.length} matériel{group.rows.length > 1 ? 's' : ''}</strong></header><div className="lifting-item-list">{group.rows.map((item) => <article key={item.id} className={`lifting-item ${item.active ? '' : 'is-inactive'}`}><div className="lifting-id">{item.reference}</div><div className="lifting-item-main"><small>{accessoryLabel(item)}{!item.active ? ' · Supprimé de l’inventaire actif' : ''}</small><h3>{item.description}</h3><p>{item.location || 'Emplacement non renseigné'}{item.legacy_reference && ` · Ancien identifiant ${item.legacy_reference}`}{item.serial_number && ` · N° ${item.serial_number}`}</p><LiftingSourceDetails item={item} /></div><div className="lifting-cmu"><span>CMU</span><strong>{item.swl_tonnes === null ? '—' : `${item.swl_tonnes} t`}</strong></div>{manager && <div className="lifting-row-actions"><button className="lifting-icon-button" title="Modifier" aria-label={`Modifier ${item.reference}`} disabled={busy} onClick={() => { setError(''); setEditor({ id: item.id, draft: { ...item } }); }}><Pencil size={17} /></button>{item.active ? <button className="lifting-icon-button" aria-label={`Supprimer ${item.reference}`} disabled={busy} onClick={() => { setError(''); setRemoveItem(item); }}><Trash2 size={17} /></button> : <button className="lifting-icon-button" aria-label={`Restaurer ${item.reference}`} disabled={busy} onClick={() => void act(async () => { await setLiftingItemActive(db, item.id, true); await reload(); })}><RotateCcw size={17} /></button>}</div>}</article>)}</div></section>)}</>}
          </> : <><div className="lifting-filter"><label>Année<select value={year} onChange={(e) => setYear(e.target.value)}><option value="">Toutes les années</option>{[...new Set(inspections.map((r) => r.inspection_year))].map((y) => <option key={y}>{y}</option>)}</select></label></div>{!displayedReports.length && <p className="lifting-empty">Aucun rapport pour cette sélection. Démarrez un contrôle annuel pour préparer le premier rapport.</p>}{displayedReports.map((r) => <article className="lifting-report-row" key={r.id}><FileCheck2 /><div><h3>{KIND_LABELS[r.kind]} · {r.inspection_year} · LEV-{r.id}</h3><p>Émission : {formatLiftingDate(r.issued_on)} · Échéance : {formatLiftingDate(r.expires_on)}</p></div><span className={`lifting-status ${r.status}`}>{r.status === 'draft' ? 'Brouillon' : 'Finalisé'}</span><button className="secondary-button" disabled={busy} onClick={() => void openReport(r)}>{r.status === 'draft' ? 'Reprendre' : 'Consulter'}</button><button className="lifting-icon-button" disabled={busy} aria-label={`Télécharger le rapport LEV-${r.id} du ${formatLiftingDate(r.issued_on)}`} onClick={() => void exportReport(r)}><Download size={18} /></button></article>)}</>}
        </div>
      </> : <div className="lifting-content">
        <div className="lifting-report-heading"><button className="secondary-button" disabled={busy || dirty} onClick={() => { setReport(null); setView('reports'); void reload(); }}><ArrowLeft size={16} /> Rapports</button><div><h2>Contrôle annuel {report.inspection_year} · LEV-{report.id}</h2><p>{vessel?.name} · {formatLiftingDate(report.issued_on)} → {formatLiftingDate(report.expires_on)}</p></div><span className={`lifting-status ${report.status}`}>{report.status === 'draft' ? 'Brouillon' : 'Finalisé'}</span></div>
        <div className="lifting-progress">{report.source_label === 'PDF historique' && <p className="lifting-muted">Rapport historique importé. Les cases vides du document source restent non renseignées. Consultez le PDF original pour le contrôle signé.</p>}<div><strong>{report.source_label === 'PDF historique' ? `${entries.length} matériels dans le rapport source` : `${complete} / ${entries.length} matériels contrôlés`}</strong><span>{entries.filter(entryUnsatisfactory).length} résultats insatisfaisants</span></div><progress value={report.source_label === 'PDF historique' ? entries.length : complete} max={entries.length || 1} aria-label="Progression du contrôle" /></div>
        {report.status === 'draft' ? <LiftingControlForm key={`${report.id}-${formEpoch}`} entries={entries} busy={busy} error={error} onDirtyChange={setDirty} onSave={saveControls} /> : <LiftingPublishedControls key={report.id} entries={entries} />}
        {dirty && <p className="lifting-muted lifting-footnote">Enregistrez vos modifications avant de télécharger ou de classer le rapport.</p>}
        <footer className="lifting-report-footer"><button className="secondary-button" disabled={busy || dirty} onClick={() => void exportReport(report)}><Download size={17} /> {report.status === 'draft' ? 'PDF brouillon' : 'Télécharger le PDF'}</button>{report.status === 'draft' && manager && <button className="primary-button" disabled={busy || dirty || !entries.length || complete !== entries.length} onClick={() => { setError(''); setPublishOpen(true); }}><FileCheck2 size={17} /> Finaliser et classer le rapport</button>}{report.status === 'published' && <Link className="primary-button" to="/modules/certificates">Voir dans Certificats flotte</Link>}</footer>
        {report.status === 'draft' && !manager && <p className="lifting-muted lifting-footnote">La Direction ou l’Armement finalisera le rapport après vérification.</p>}
      </div>}
    </>}
    {editor && section !== 'crane' && <LiftingItemForm initial={editor.draft} kind={section} busy={busy} error={error} onClose={() => { setEditor(null); setError(''); }} onSave={(draft) => void act(async () => { const targetKind = accessoryDefinition(draft.material_type)?.code === 'TL' ? 'towing' : 'lifting'; await saveLiftingItem(db, vesselId, targetKind, draft, editor.id); setEditor(null); if (targetKind !== section) setSection(targetKind); await reload(); setNotice('Matériel enregistré.'); })} />}
    {paperOpen && section !== 'crane' && <LiftingPaperForm vessels={vessels} initialVesselId={vesselId} initialKind={section} busy={busy} error={error} onClose={() => { setPaperOpen(false); setError(''); }} onDownload={(selectedVesselId, kind, includeNotice) => void act(async () => {
      const current = await fetchLiftingPaperInventory(db, selectedVesselId, kind);
      const pdf = await buildLiftingPaperPdf(current.vessel, kind, current.items, { includeNotice });
      saveLiftingBlob(pdf.blob, pdf.filename); setPaperOpen(false);
      setNotice(`Fiche papier de ${pdf.itemCount} ${pdf.itemCount === 1 ? 'matériel' : 'matériels'} téléchargée pour ${current.vessel.name}.`);
    })} />}
    {startOpen && section !== 'crane' && <LiftingStartForm vessels={vessels} initialVesselId={vesselId} busy={busy} error={error} onClose={() => { setStartOpen(false); setError(''); }} onSave={(selectedVesselId, issued, expires) => void act(async () => {
      const id = await startLiftingInspection(db, selectedVesselId, section, issued, expires);
      pendingInspection.current = { id, vesselId: selectedVesselId, kind: section };
      setStartOpen(false);
      if (selectedVesselId !== vesselId) setVesselId(selectedVesselId);
      else await reload();
    })} />}
    {removeItem && <AppDialog title={`Supprimer le matériel ${removeItem.reference} ?`} onClose={() => { setRemoveItem(null); setError(''); }} isBusy={busy} footer={<><button className="secondary-button" disabled={busy} onClick={() => setRemoveItem(null)}>Annuler</button><button className="primary-button" disabled={busy} onClick={() => void act(async () => { await setLiftingItemActive(db, removeItem.id, false); setRemoveItem(null); await reload(); setNotice('Matériel retiré de l’inventaire actif.'); })}>Supprimer de l’inventaire</button></>}><p>Le matériel sera retiré des prochains contrôles. Les rapports existants seront conservés et le matériel pourra être restauré.</p>{error && <p role="alert" className="lifting-error">{error}</p>}</AppDialog>}
    {publishOpen && report && <AppDialog title="Finaliser et classer le rapport" onClose={() => { setPublishOpen(false); setError(''); }} isBusy={busy} footer={<><button className="secondary-button" disabled={busy} onClick={() => setPublishOpen(false)}>Annuler</button><button className="primary-button" disabled={busy} onClick={() => void act(async () => { const stamp = await loadLiftingStamp(db, report.company_id); const pdf = await buildLiftingPdf(report, entries, stamp); await publishLiftingInspection(db, report, pdf.blob, pdf.filename); const loaded = await fetchLiftingRegister(db, report.vessel_id, report.kind); setInspections(loaded.inspections); setReport(loaded.inspections.find((r) => r.id === report.id) || report); setPublishOpen(false); setNotice('Rapport finalisé et ajouté aux Certificats flotte du navire.'); })}>{busy ? 'Classement en cours…' : 'Finaliser le rapport'}</button></>}><p>Le rapport portera le nom et le tampon d’<strong>{INSPECTOR}</strong>. Vérifiez le PDF brouillon avant de finaliser.</p><p><strong>{report.vessel_snapshot.name}</strong> · Émission : {formatLiftingDate(report.issued_on)} · Échéance : {formatLiftingDate(report.expires_on)}</p><p>Il sera conservé dans « Certificats flotte », catégorie {report.kind === 'towing' ? '08.5 - Remorques' : '08.3 - Accessoires de levage'}, et ce contrôle ne sera plus modifiable.</p>{error && <p role="alert" className="lifting-error">{error}</p>}</AppDialog>}
  </section>;
}
