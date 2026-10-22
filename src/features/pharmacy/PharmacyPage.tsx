import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { AlertTriangle, BellRing, Check, CheckCircle2, ChevronDown, Download, FileCheck2, FileUp, Package, Pencil, Plus, RotateCcw, Search } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import type { RoleKey } from '../permissions/roles';
import type { AppShellOutletContext } from '../shell/AppShell';
import { canManagePharmacy, formatPharmacyDate, groupPharmacyItems, pharmacyExpiryStatus, pharmacyStockStatus, selectPharmacyVessels, type PharmacyControl, type PharmacyItem, type PharmacyItemDraft, type PharmacyVessel, type PharmacyVesselExpiryCounts } from './pharmacyModel';
import { downloadPharmacyControl, fetchPharmacyRegister, fetchPharmacyVesselExpiryCounts, fetchPharmacyVessels, savePharmacyItem, uploadPharmacyControl } from './pharmacyQueries';
import { PharmacyControlForm, PharmacyItemForm } from './PharmacyForms';
import { PharmacyVesselStrip } from './PharmacyVesselStrip';
import { PharmacyIcon } from './PharmacyIcon';
import './pharmacy.css';
import './pharmacyGroups.css';

type ItemFilter = 'all' | 'attention' | 'expiry' | 'expired' | 'due' | 'low' | 'unknown';
const FILTER_LABELS: Record<ItemFilter, string> = { all: 'Tous les articles', attention: 'À traiter', expiry: 'Péremptions à traiter', expired: 'Périmés', due: 'Échéance ≤ 30 j', low: 'Stock insuffisant', unknown: 'À vérifier' };
function requestedFilter(value: string | null): ItemFilter { return value && value in FILTER_LABELS ? value as ItemFilter : 'all'; }
function messageOf(error: unknown) { return error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Impossible de réaliser cette opération. Réessayez.'; }
function expiryLabel(item: PharmacyItem) {
  const status = pharmacyExpiryStatus(item.expires_on);
  return status === 'expired' ? 'Périmé' : status === 'due' ? 'Échéance ≤ 30 j' : status === 'unknown' ? 'Date à vérifier' : 'Date valide';
}
function isAttention(item: PharmacyItem) { return ['expired', 'due'].includes(pharmacyExpiryStatus(item.expires_on)) || pharmacyStockStatus(item) === 'low'; }
function ItemStatus({ item }: { item: PharmacyItem }) {
  const expiry = pharmacyExpiryStatus(item.expires_on);
  const stock = pharmacyStockStatus(item);
  return <div className="pharmacy-row-status"><span className={`pharmacy-badge is-${expiry}`}>{expiry === 'expired' || expiry === 'due' ? <AlertTriangle size={12} /> : expiry === 'valid' ? <Check size={12} /> : null}{expiryLabel(item)}</span>{stock === 'low' ? <span className="pharmacy-stock-low">Stock insuffisant</span> : stock === 'unknown' ? <span className="pharmacy-stock-unknown">Stock à vérifier</span> : null}</div>;
}
function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function PharmacyPage({ client, roles }: { client?: SupabaseClient; roles?: RoleKey[] }) {
  const context = useOutletContext<AppShellOutletContext | undefined>();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchFilter = searchParams.get('filter');
  const [previewClient, setPreviewClient] = useState<SupabaseClient | null>(null);
  const preview = !client && !!context?.previewMode;
  const db = client || (preview ? previewClient : context?.client) || supabase;
  const [vessels, setVessels] = useState<PharmacyVessel[]>([]);
  const [vesselId, setVesselId] = useState(() => Number(searchParams.get('vessel')) || 0);
  const [items, setItems] = useState<PharmacyItem[]>([]);
  const [controls, setControls] = useState<PharmacyControl[]>([]);
  const [vesselExpiryCounts, setVesselExpiryCounts] = useState<Record<number, PharmacyVesselExpiryCounts> | null>(null);
  const [countsLoading, setCountsLoading] = useState(true);
  const [countsError, setCountsError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [formError, setFormError] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [filter, setFilter] = useState<ItemFilter>(() => requestedFilter(searchFilter));
  const [showInactive, setShowInactive] = useState(false);
  const [editor, setEditor] = useState<{ item?: PharmacyItem } | null>(null);
  const [controlOpen, setControlOpen] = useState(false);
  const [selected, setSelected] = useState<PharmacyItem | null>(null);
  const requestId = useRef(0);
  const countsRequestId = useRef(0);
  const vessel = vessels.find((entry) => entry.id === vesselId);
  const manager = !!vessel?.can_manage && canManagePharmacy(roles || context?.roles || []);
  const active = items.filter((item) => item.active);
  const categories = [...new Set(items.map((item) => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
  const currentControl = controls.find((control) => control.is_current);
  const controlStatus = pharmacyExpiryStatus(currentControl?.expires_on || null);
  const counts = { expired: active.filter((item) => pharmacyExpiryStatus(item.expires_on) === 'expired').length, due: active.filter((item) => pharmacyExpiryStatus(item.expires_on) === 'due').length, low: active.filter((item) => pharmacyStockStatus(item) === 'low').length, unknown: active.filter((item) => pharmacyExpiryStatus(item.expires_on) === 'unknown' || pharmacyStockStatus(item) === 'unknown').length };
  const normalizedQuery = query.toLocaleLowerCase('fr');
  const filtered = items.filter((item) => (showInactive || item.active) && (!category || item.category === category) && `${item.designation} ${item.brand} ${item.lot_number} ${item.notes} ${item.category}`.toLocaleLowerCase('fr').includes(normalizedQuery) && (filter === 'all' || (filter === 'attention' && isAttention(item)) || (filter === 'expiry' && ['expired', 'due'].includes(pharmacyExpiryStatus(item.expires_on))) || (filter === 'low' && pharmacyStockStatus(item) === 'low') || (filter === 'unknown' && (pharmacyExpiryStatus(item.expires_on) === 'unknown' || pharmacyStockStatus(item) === 'unknown')) || (filter === 'expired' && pharmacyExpiryStatus(item.expires_on) === 'expired') || (filter === 'due' && pharmacyExpiryStatus(item.expires_on) === 'due')));
  const groups = groupPharmacyItems(filtered);
  const refreshVesselCounts = useCallback(async () => {
    const id = ++countsRequestId.current;
    setCountsLoading(true);
    try {
      const loaded = await fetchPharmacyVesselExpiryCounts(db);
      if (id === countsRequestId.current) { setVesselExpiryCounts(loaded); setCountsError(''); }
    } catch (reason) {
      if (id === countsRequestId.current) { setVesselExpiryCounts(null); setCountsError(messageOf(reason)); }
    } finally {
      if (id === countsRequestId.current) setCountsLoading(false);
    }
  }, [db]);

  useEffect(() => {
    if (preview && !previewClient) return;
    setVesselExpiryCounts(null);
    const refresh = () => { void refreshVesselCounts(); };
    const refreshVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    refresh();
    const timer = window.setInterval(refreshVisible, 30_000);
    window.addEventListener('focus', refresh);
    window.addEventListener('pharmacy:changed', refresh);
    document.addEventListener('visibilitychange', refreshVisible);
    return () => {
      countsRequestId.current += 1;
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pharmacy:changed', refresh);
      document.removeEventListener('visibilitychange', refreshVisible);
    };
  }, [refreshVesselCounts, preview, previewClient]);

  useEffect(() => {
    if (!preview) return;
    let cancelled = false;
    void import('./pharmacyPreview').then(({ createPharmacyPreviewClient }) => { if (!cancelled) setPreviewClient(createPharmacyPreviewClient()); }).catch((reason) => { if (!cancelled) { setError(messageOf(reason)); setLoading(false); } });
    return () => { cancelled = true; };
  }, [preview]);
  useEffect(() => {
    if (preview && !previewClient) return;
    let cancelled = false;
    setLoading(true);
    void fetchPharmacyVessels(db).then((loaded) => {
      if (cancelled) return;
      const selectable = selectPharmacyVessels(loaded);
      setVessels(selectable); setVesselId((current) => selectable.some((entry) => entry.id === current) ? current : selectable[0]?.id || 0);
      if (!selectable.length) setLoading(false);
    }).catch((reason) => { if (!cancelled) { setError(messageOf(reason)); setLoading(false); } });
    return () => { cancelled = true; };
  }, [db, preview, previewClient]);
  useEffect(() => {
    const requested = Number(searchParams.get('vessel'));
    if (requested && vessels.some((entry) => entry.id === requested)) setVesselId(requested);
  }, [searchParams, vessels]);
  useEffect(() => {
    if (!vessel) { setItems([]); setControls([]); setSelected(null); return; }
    if (preview && !previewClient) return;
    const id = ++requestId.current;
    setLoading(true); setItems([]); setControls([]); setSelected(null); setError(''); setNotice(''); setQuery(''); setCategory(''); setFilter(requestedFilter(searchFilter)); setShowInactive(false); setEditor(null); setControlOpen(false);
    void fetchPharmacyRegister(db, vesselId).then((loaded) => { if (id === requestId.current) { setItems(loaded.items); setControls(loaded.controls); } }).catch((reason) => { if (id === requestId.current) setError(messageOf(reason)); }).finally(() => { if (id === requestId.current) setLoading(false); });
    return () => { requestId.current += 1; };
  }, [db, vessel, vesselId, preview, previewClient, searchFilter]);

  async function reload(refreshCounts = true) {
    if (!vesselId) return;
    if (refreshCounts) void refreshVesselCounts();
    const id = ++requestId.current; setLoading(true); setError('');
    try { const loaded = await fetchPharmacyRegister(db, vesselId); if (id === requestId.current) { setItems(loaded.items); setControls(loaded.controls); setSelected(null); } }
    catch (reason) { if (id === requestId.current) setError(messageOf(reason)); }
    finally { if (id === requestId.current) setLoading(false); }
  }
  async function saveItem(draft: PharmacyItemDraft) {
    if (busy || !vessel) return;
    setBusy(true); setFormError('');
    try { await savePharmacyItem(db, vessel.id, draft, editor?.item); setEditor(null); await reload(false); setNotice('Article enregistré.'); window.dispatchEvent(new Event('pharmacy:changed')); }
    catch (reason) { setFormError(messageOf(reason)); }
    finally { setBusy(false); }
  }
  async function saveControl(file: File, expiresOn: string, issuedOn: string) {
    if (busy || !vessel) return;
    setBusy(true); setFormError('');
    try { await uploadPharmacyControl(db, vessel, file, expiresOn, issuedOn, currentControl?.id || null); setControlOpen(false); await reload(false); setNotice('Contrôle pharmacie enregistré. Son échéance est surveillée à J−30.'); window.dispatchEvent(new Event('pharmacy:changed')); }
    catch (reason) { setFormError(messageOf(reason)); }
    finally { setBusy(false); }
  }
  async function download(control: PharmacyControl) {
    if (busy) return;
    setBusy(true); setError('');
    try { saveBlob(await downloadPharmacyControl(db, control.storage_path), control.file_name); }
    catch (reason) { setError(messageOf(reason)); }
    finally { setBusy(false); }
  }
  const controlText = !currentControl ? 'À renseigner' : controlStatus === 'expired' ? 'Contrôle échu' : controlStatus === 'due' ? 'À renouveler sous 30 jours' : 'Contrôle à jour';
  return <section className="pharmacy-page">
    <header className="pharmacy-heading"><div><p>REGISTRES · SÉCURITÉ À BORD</p><h1><PharmacyIcon aria-hidden="true" size={27} /> Inventaire Pharmacie</h1></div></header>
    {preview ? <div className="pharmacy-demo">Démonstration · données fictives. Les inventaires importés sont disponibles dans l’espace connecté.</div> : null}
    <div className="pharmacy-vessel-bar"><PharmacyVesselStrip vessels={vessels} value={vesselId} disabled={busy} counts={vesselExpiryCounts} loading={countsLoading} onChange={(id) => { setVesselId(id); setSearchParams({ vessel: String(id) }, { replace: true }); }} /><div className="pharmacy-vessel-actions"><span className="pharmacy-vessel-meta">{loading ? 'Chargement de l’inventaire…' : `${active.length} articles actifs`}{!manager && vessel ? ' · Consultation' : ''}</span><div><button className="pharmacy-icon-button" aria-label="Actualiser l’inventaire" disabled={busy || loading || !vessel} onClick={() => void reload()} type="button"><RotateCcw size={17} /></button>{manager ? <button className="primary-button" disabled={loading || busy} onClick={() => { setFormError(''); setEditor({}); }} type="button"><Plus size={16} /> Ajouter un article</button> : null}</div></div></div>
    {countsError ? <div className="pharmacy-message is-warning" role="alert">Compteurs d’échéance indisponibles : {countsError} Utilisez Actualiser l’inventaire pour réessayer.</div> : null}
    {error ? <div role="alert" className="pharmacy-message is-error">{error}</div> : null}{notice ? <div role="status" className="pharmacy-message is-success"><CheckCircle2 size={15} />{notice}</div> : null}
    <div className="pharmacy-metrics" aria-label="Synthèse de l’inventaire">
      <button className={`pharmacy-metric is-danger ${filter === 'expired' ? 'is-selected' : ''}`} disabled={loading} onClick={() => setFilter(filter === 'expired' ? 'all' : 'expired')} type="button"><span><AlertTriangle size={16} /> Périmés</span><strong>{loading ? '—' : counts.expired}</strong></button>
      <button className={`pharmacy-metric is-warning ${filter === 'due' ? 'is-selected' : ''}`} disabled={loading} onClick={() => setFilter(filter === 'due' ? 'all' : 'due')} type="button"><span><BellRing size={16} /> Échéance ≤ 30 j</span><strong>{loading ? '—' : counts.due}</strong></button>
      <button className={`pharmacy-metric is-warning ${filter === 'low' ? 'is-selected' : ''}`} disabled={loading} onClick={() => setFilter(filter === 'low' ? 'all' : 'low')} type="button"><span><Package size={16} /> Stock insuffisant</span><strong>{loading ? '—' : counts.low}</strong></button>
      <button className={`pharmacy-metric ${filter === 'unknown' ? 'is-selected' : ''}`} disabled={loading} onClick={() => setFilter(filter === 'unknown' ? 'all' : 'unknown')} type="button"><span><Search size={16} /> À vérifier</span><strong>{loading ? '—' : counts.unknown}</strong></button>
    </div>
    <div className="pharmacy-workspace">
      <div className="pharmacy-inventory-panel">
        <div className="pharmacy-filters"><label className="pharmacy-search"><Search size={16} aria-hidden="true" /><input aria-label="Rechercher un article" placeholder="Article, marque, lot…" value={query} onChange={(event) => setQuery(event.target.value)} /></label><select aria-label="Catégorie" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">Toutes les catégories</option>{categories.map((value) => <option key={value} value={value}>{value}</option>)}</select><select aria-label="État des articles" value={filter} onChange={(event) => setFilter(event.target.value as ItemFilter)}>{Object.entries(FILTER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <div className="pharmacy-table-scroll" tabIndex={0} role="region" aria-label="Tableau de l’inventaire pharmacie" aria-busy={loading}>
          <table className="pharmacy-table"><thead><tr><th scope="col">Article / lot</th><th scope="col">À bord</th><th scope="col">Dotation</th><th scope="col">Péremption</th><th scope="col">État</th><th scope="col"><span className="pharmacy-sr-only">Actions</span></th></tr></thead>
            {loading ? <tbody><tr><td colSpan={6} className="pharmacy-empty" role="status">Chargement des articles…</td></tr></tbody> : groups.length ? groups.map((group) => <tbody key={group.key}>
              <tr className="pharmacy-category-row"><th scope="rowgroup" colSpan={6}><div><span><strong>{group.category}</strong>{group.section ? <small title={group.section}>{group.section}</small> : null}</span><em>{group.items.length} article{group.items.length > 1 ? 's' : ''}</em></div></th></tr>
              {group.items.map((item) => <tr data-pharmacy-item={item.id} key={item.id} className={`${!item.active ? 'is-inactive' : ''} ${selected?.id === item.id ? 'is-selected' : ''}`}><td><button className="pharmacy-item-title" onClick={() => setSelected(item)} type="button">{item.designation || item.brand || 'Article sans désignation'}</button><small>{[item.brand, item.lot_number ? `Lot ${item.lot_number}` : ''].filter(Boolean).join(' · ') || item.category || 'Sans catégorie'}</small></td><td className={pharmacyStockStatus(item) === 'low' ? 'pharmacy-low-value' : ''}>{item.quantity || '—'}</td><td>{item.required_quantity || '—'}</td><td>{item.expires_on ? formatPharmacyDate(item.expires_on, item.expiry_precision) : item.expiry_text || 'À renseigner'}{item.expiry_precision === 'month' && item.expires_on ? <small>Mois indiqué</small> : null}</td><td><ItemStatus item={item} /></td><td>{manager ? <button className="pharmacy-icon-button" aria-label={`Modifier ${item.designation || item.brand}`} disabled={busy} onClick={() => { setFormError(''); setEditor({ item }); }} type="button"><Pencil size={15} /></button> : <button className="pharmacy-icon-button" aria-label={`Détails ${item.designation || item.brand}`} onClick={() => setSelected(item)} type="button"><ChevronDown size={16} /></button>}</td></tr>)}
            </tbody>) : <tbody><tr><td className="pharmacy-empty" colSpan={6}>{items.length ? 'Aucun article ne correspond aux filtres.' : vessel ? 'Aucun article dans ce navire. Ajoutez son inventaire.' : 'Aucun navire accessible pour votre profil.'}</td></tr></tbody>}
          </table>
        </div>
        <footer className="pharmacy-table-footer"><span>{filtered.length} / {showInactive ? items.length : active.length} articles</span><label className="pharmacy-checkbox"><input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} /> Inclure les articles retirés</label></footer>
      </div>
      <aside className="pharmacy-side-panel" aria-label="Contrôle et détails du navire">
        <section className="pharmacy-control-card"><header><span className="pharmacy-control-icon"><FileCheck2 size={21} /></span><div><h2>Contrôle Pharmacie</h2><p>Document du navire</p></div></header><span className={`pharmacy-badge is-${currentControl ? controlStatus : 'unknown'}`}>{controlText}</span><dl><div><dt>Échéance</dt><dd>{currentControl ? formatPharmacyDate(currentControl.expires_on) : 'Non renseignée'}</dd></div><div><dt>Dernier contrôle</dt><dd>{currentControl?.issued_on ? formatPharmacyDate(currentControl.issued_on) : 'Non renseigné'}</dd></div></dl>{currentControl ? <button className="secondary-button pharmacy-full-width" disabled={busy} onClick={() => void download(currentControl)} type="button"><Download size={15} /> Télécharger le document</button> : <p className="pharmacy-no-document">Aucun document déposé pour ce navire.</p>}{manager ? <button className="primary-button pharmacy-full-width" disabled={busy || loading} onClick={() => { setFormError(''); setControlOpen(true); }} type="button"><FileUp size={15} /> {currentControl ? 'Nouveau contrôle' : 'Déposer le document'}</button> : null}<p className="pharmacy-control-rule"><BellRing size={14} /> Alerte 30 jours avant l’échéance. Les échéances dépassées restent signalées.</p></section>
        {selected ? <section className="pharmacy-detail-card"><header><h3>Détail de l’article</h3><button className="pharmacy-text-button" onClick={() => setSelected(null)} type="button">Fermer</button></header><strong>{selected.designation || selected.brand}</strong><dl><div><dt>Section</dt><dd>{selected.section || '—'}</dd></div><div><dt>Catégorie</dt><dd>{selected.category || '—'}</dd></div></dl><p className="pharmacy-item-notes">{selected.notes || 'Aucune observation.'}</p>{selected.source_file ? <p className="pharmacy-source">{selected.source_file}<br />{selected.source_sheet} · ligne {selected.source_row}</p> : null}</section> : <section className="pharmacy-reading-note"><h3>Lecture de l’inventaire</h3><p>Les quantités conservent leurs unités d’origine. Un stock textuel est indiqué « à vérifier ».</p><p>Une date absente reste à renseigner. Pour un mois seul, le repère de date du fichier sert au calcul des alertes. Vérifiez la date complète à bord.</p></section>}
        {controls.length > 1 ? <details className="pharmacy-history"><summary>Historique des contrôles ({controls.length - 1})</summary>{controls.filter((control) => !control.is_current).map((control) => <button key={control.id} onClick={() => void download(control)} disabled={busy} type="button"><Download size={14} /><span>{control.file_name}<small>Échéance {formatPharmacyDate(control.expires_on)}</small></span></button>)}</details> : null}
      </aside>
    </div>
    {editor ? <PharmacyItemForm item={editor.item} categories={categories} busy={busy} error={formError} onClose={() => setEditor(null)} onSave={(draft) => void saveItem(draft)} /> : null}
    {controlOpen && vessel ? <PharmacyControlForm vesselName={vessel.name} busy={busy} error={formError} onClose={() => setControlOpen(false)} onSave={(file, expiresOn, issuedOn) => void saveControl(file, expiresOn, issuedOn)} /> : null}
  </section>;
}
