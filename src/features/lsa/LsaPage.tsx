import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Download, FileCheck2, LifeBuoy, Package, Pencil, Plus, Search } from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import type { AppShellOutletContext } from '../shell/AppShell';
import type { RoleKey } from '../permissions/roles';
import { LiftingVesselFilter } from '../lifting/LiftingVesselFilter';
import { canManageLifting, formatLiftingDate, liftingDeadline, type LiftingVessel } from '../lifting/liftingModel';
import { LiftingDueBadge, useLiftingToday } from '../lifting/LiftingLifecycle';
import { saveLiftingBlob } from '../lifting/liftingPdf';
import { LsaItemForm } from './LsaItemForm';
import { LsaCatalogDialog } from './LsaCatalogDialog';
import { blankLsaDraft, categorizeLsaItems, compareLsaNames, lsaTypeKey, lsaVersionStatus, matchesLsaItem, type LsaCatalog, type LsaItem } from './lsaModel';
import { downloadLsaDocument, fetchLsaCatalog, fetchLsaRegister, fetchLsaVessels, saveLsaItem } from './lsaQueries';
import { createLsaPreviewClient } from './lsaPreview';
import '../lifting/lifting.css';
import '../lifting/liftingNavigation.css';
import './lsa.css';

const emptyRegister = { items: [], versions: [], events: [] } as Awaited<ReturnType<typeof fetchLsaRegister>>;
const messageOf = (error: unknown) => error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Impossible de charger le registre LSA. Réessayez.';

export function LsaPage({ client, roles }: { client?: SupabaseClient; roles?: RoleKey[] }) {
  const context = useOutletContext<AppShellOutletContext | undefined>();
  const [preview] = useState(createLsaPreviewClient);
  const db = client || (context?.previewMode ? preview : context?.client) || supabase;
  const administrator = (roles || context?.roles || []).includes('admin');
  const [catalog, setCatalog] = useState<LsaCatalog>({ types: [], designations: [] });
  const [catalogOpen, setCatalogOpen] = useState(false);
  const manager = canManageLifting(roles || context?.roles || []);
  const [vessels, setVessels] = useState<LiftingVessel[]>([]);
  const [vesselId, setVesselId] = useState(context?.liftingVesselId || 0);
  const [register, setRegister] = useState(emptyRegister);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [year, setYear] = useState('');
  const [view, setView] = useState<'inventory' | 'reports'>('inventory');
  const [editor, setEditor] = useState<{ item?: LsaItem } | null>(null);
  const today = useLiftingToday();
  const { versions, events } = register;
  const items = categorizeLsaItems(register.items, catalog);
  const groups = [...new Map([
    ...catalog.types.map((type) => [lsaTypeKey(type.id), { key: lsaTypeKey(type.id), name: type.name }] as const),
    ...items.map((item) => [item.category_key, { key: item.category_key, name: item.category_label }] as const),
  ]).values()].sort(compareLsaNames);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    Promise.all([fetchLsaVessels(db), fetchLsaCatalog(db)]).then(([loaded, loadedCatalog]) => {
      if (cancelled) return;
      setVessels(loaded); setCatalog(loadedCatalog);
      setVesselId((current) => loaded.some((vessel) => vessel.id === current) ? current : (loaded.find((vessel) => vessel.acronym === 'SUR')?.id || loaded[0]?.id || 0));
      if (!loaded.length) { setRegister(emptyRegister); setLoading(false); }
    }).catch((reason) => { if (!cancelled) { setError(messageOf(reason)); setLoading(false); } });
    return () => { cancelled = true; };
  }, [db, refresh]);

  useEffect(() => {
    let cancelled = false;
    setRegister(emptyRegister); setError('');
    if (!vesselId) return;
    setLoading(true);
    fetchLsaRegister(db, vesselId).then((loaded) => { if (!cancelled) setRegister(loaded); })
      .catch((reason) => { if (!cancelled) setError(messageOf(reason)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [db, vesselId, refresh]);

  const filtered = items.filter((item) => matchesLsaItem(item, query, category));
  const filteredIds = new Set(filtered.map((item) => item.id));
  const reports = versions.filter((version) => filteredIds.has(version.certificate_id) && (!year || (version.issued_on || version.created_at).startsWith(year)));
  const years = [...new Set(versions.map((version) => (version.issued_on || version.created_at).slice(0, 4)))].sort().reverse();
  const fileCount = versions.length + items.filter((item) => item.storage_path && !versions.some((version) => version.storage_path === item.storage_path)).length;

  async function act(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (reason) { setError(messageOf(reason)); } finally { setBusy(false); }
  }

  return <section className="lifting-page lsa-page">
    <header className="lifting-heading"><div><p className="lifting-eyebrow">LSA · ÉQUIPEMENTS DE SAUVETAGE</p><h1>Registre LSA</h1><p>Les équipements de sauvetage, leurs échéances et leurs documents de contrôle.</p></div><LifeBuoy size={32} aria-hidden="true" /></header>
    <LiftingVesselFilter vessels={vessels} value={vesselId} includeYard={false} disabled={busy || !!editor || catalogOpen} onChange={(id) => {
      setVesselId(id); context?.setLiftingVesselId?.(id); setQuery(''); setCategory(''); setYear(''); setNotice('');
    }} />
    {error && !editor && <div className="lifting-error" role="alert">{error}<button onClick={() => setRefresh((value) => value + 1)}>Recharger</button></div>}
    {notice && <p className="lifting-notice" role="status">{notice}</p>}
    <div className="lifting-summary">
      <div><strong>{items.length}</strong><span>matériels en inventaire</span></div>
      <div><strong>{items.filter((item) => liftingDeadline(item.expires_on, today, 90)).length}</strong><span>échéances à suivre</span></div>
      <div><strong>{fileCount}</strong><span>documents de contrôle</span></div>
    </div>
    <div className="lifting-content">
      <div className="lifting-content-heading">
        <div className="lifting-view-switch" role="group" aria-label="Vue du registre">
          <button type="button" aria-label="Inventaire" aria-pressed={view === 'inventory'} onClick={() => setView('inventory')}><Package size={22} /><span><strong>Inventaire</strong><small>Matériels et équipements</small></span><b>{loading ? '…' : items.length}</b></button>
          <button type="button" aria-label="Documents de contrôle" aria-pressed={view === 'reports'} onClick={() => setView('reports')}><FileCheck2 size={22} /><span><strong>Documents de contrôle</strong><small>Versions et historique</small></span><b>{loading ? '…' : fileCount}</b></button>
        </div>
        {administrator && <button className="secondary-button" disabled={busy || loading} onClick={() => setCatalogOpen(true)}>Gérer les désignations</button>}
        {manager && view === 'inventory' && <button className="secondary-button" disabled={busy || loading || !vesselId} onClick={() => { setError(''); setEditor({}); }}><Plus size={17} /> Ajouter un matériel</button>}
      </div>
      <div className="lifting-filter lifting-register-filters" role="search" aria-label="Filtres — registre LSA">
        <label>Type d’équipement<select aria-label="Type d’équipement" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">Tous les types</option>{groups.map((option) => <option key={option.key} value={option.key}>{option.name}</option>)}</select></label>
        <label className="lifting-search"><Search size={17} /><input aria-label="Rechercher un matériel" placeholder="Mot-clé, identifiant, numéro de série…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <span className="lifting-filter-count" role="status">{filtered.length} / {items.length} matériels affichés</span>
        {(query || category || year) && <button className="secondary-button" onClick={() => { setQuery(''); setCategory(''); setYear(''); }}>Réinitialiser les filtres</button>}
      </div>
      {loading ? <p className="lifting-empty" role="status">Chargement du registre…</p> : view === 'inventory' ? <>
        {!filtered.length && <p className="lifting-empty">{query || category ? 'Aucun matériel ne correspond aux filtres.' : 'Aucun matériel LSA dans cet inventaire.'}</p>}
        {groups.map((group) => {
          const rows = filtered.filter((item) => item.category_key === group.key);
          return !!rows.length && <section key={group.key} className="lifting-accessory-group" aria-label={group.name}>
            <header><h3>{group.name}</h3><strong>{rows.length} matériel{rows.length > 1 ? 's' : ''}</strong></header>
            <div className="lifting-item-list">{rows.map((item) => <article key={item.id} className={`lifting-item ${liftingDeadline(item.expires_on, today, 90)}`}>
              <div className="lifting-id">{item.id}</div><div className="lifting-item-main">
                <div className="lifting-item-title"><small>{item.category_label}</small><h3>{item.document_title || item.title}</h3></div>
                <div className="lifting-item-metadata"><p>{[item.brand, item.model, item.serial_number && `N° de série : ${item.serial_number}`].filter(Boolean).join(' · ')}</p><LiftingDueBadge alertDays={90} date={item.expires_on} today={today} />{!item.expires_on && <p>Échéance non renseignée</p>}</div>
                <details className="lsa-details"><summary>Détails et historique</summary>
                  <dl><div><dt>Marque</dt><dd>{item.brand || 'Non renseignée'}</dd></div><div><dt>Modèle</dt><dd>{item.model || 'Non renseigné'}</dd></div><div><dt>Numéro de série</dt><dd>{item.serial_number || 'Non renseigné'}</dd></div><div><dt>Notes</dt><dd>{item.notes || 'Aucune'}</dd></div>{item.original_designation && item.original_designation !== item.document_title && <div><dt>Désignation d’origine</dt><dd>{item.original_designation}</dd></div>}</dl>
                  {versions.filter((version) => version.certificate_id === item.id).map((version) => <p key={version.id}>Version {version.version_no} · {lsaVersionStatus(version.status)} · {version.normalized_file_name}<button className="secondary-button" disabled={busy} onClick={() => void act(async () => saveLiftingBlob(await downloadLsaDocument(db, version), version.normalized_file_name))}><Download size={16} /> Télécharger</button></p>)}
                  {events.filter((event) => event.certificate_id === item.id).map((event) => <p key={event.id}>{formatLiftingDate(event.created_at.slice(0, 10))} · {event.event_type === 'version_uploaded' ? 'Document déposé' : event.event_type === 'metadata_updated' ? 'Fiche mise à jour' : event.event_type}{event.notes && ` · ${event.notes}`}{event.provider_name && ` · ${event.provider_name}`}{event.planned_on && ` · Contrôle prévu : ${formatLiftingDate(event.planned_on)}`}{event.visit_location && ` · ${event.visit_location}`}</p>)}
                  {!versions.some((version) => version.certificate_id === item.id) && !item.storage_path && <p>Aucun document associé.</p>}
                </details>
              </div>
              {item.storage_path && <button className="lifting-icon-button" aria-label={`Télécharger ${item.document_title}`} disabled={busy} onClick={() => void act(async () => saveLiftingBlob(await downloadLsaDocument(db, item), item.file_name || `${item.document_title}.pdf`))}><Download size={18} /></button>}
              {manager && <button className="lifting-icon-button" aria-label={`Modifier ${item.document_title}`} disabled={busy} onClick={() => { setError(''); setEditor({ item }); }}><Pencil size={17} /></button>}
            </article>)}</div>
          </section>;
        })}
      </> : <>
        <div className="lifting-filter"><label>Année<select aria-label="Année" value={year} onChange={(event) => setYear(event.target.value)}><option value="">Toutes les années</option>{years.map((value) => <option key={value}>{value}</option>)}</select></label></div>
        {!reports.length && <p className="lifting-empty">Aucun document de contrôle pour cette sélection.</p>}
        {reports.map((version) => <article className={`lifting-report-row ${liftingDeadline(version.expires_on, today, 90)}`} key={version.id}><FileCheck2 /><div><h3>{version.normalized_file_name}</h3><p>Version {version.version_no} · Émission : {formatLiftingDate(version.issued_on || '')}</p><LiftingDueBadge alertDays={90} date={version.expires_on} today={today} /></div><span className="lifting-status">{lsaVersionStatus(version.status)}</span><button className="lifting-icon-button" disabled={busy} aria-label={`Télécharger ${version.normalized_file_name}`} onClick={() => void act(async () => saveLiftingBlob(await downloadLsaDocument(db, version), version.normalized_file_name))}><Download size={18} /></button></article>)}
      </>}
    </div>
    {editor && <LsaItemForm item={editor.item} client={db} vesselId={vesselId} catalog={catalog} initial={editor.item || blankLsaDraft()} busy={busy} error={error} onClose={() => { setEditor(null); setError(''); }} onSave={(draft) => void act(async () => {
      await saveLsaItem(db, vesselId, draft, editor.item); setEditor(null); setRefresh((value) => value + 1); setNotice('Matériel LSA enregistré.');
    })} />}
    {catalogOpen && <LsaCatalogDialog client={db} catalog={catalog} onChange={setCatalog} onClose={() => { setCatalogOpen(false); setRefresh((value) => value + 1); }} />}
  </section>;
}
