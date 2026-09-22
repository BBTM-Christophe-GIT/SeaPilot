import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useOutletContext } from 'react-router-dom';
import { Download, FlaskConical, Layers3, Paperclip, Pencil, Plus, RefreshCw, Search, Ship, Trash2 } from 'lucide-react';
import { AppDialog } from '../../components/AppDialog';
import { supabase } from '../../lib/supabaseClient';
import type { AppShellOutletContext } from '../shell/AppShell';
import { ChemicalForm } from './ChemicalForm';
import { PICTOGRAMS, filterChemicals, productLabel, saveChemicalBlob, stockLabel, type ChemicalAttachment, type ChemicalDraft, type ChemicalProduct, type ChemicalVessel } from './chemicalModel';
import { addChemicalAttachment, deleteChemicalProduct, downloadChemicalAttachment, fetchChemicalWorkspace, removeChemicalAttachment, saveChemicalProduct } from './chemicalQueries';
import { createChemicalPreviewClient, createChemicalPreviewFiles } from './chemicalPreview';
import { createChemicalDrive, type ChemicalFileStore } from './chemicalDrive';
import { launcherOpenUri } from '../documents/localDriveLauncher';
import './chemicals.css';

const messageOf = (error: unknown) => error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Impossible de réaliser cette opération.';
function Pictograms({ product }: { product: ChemicalProduct }) {
  return <div className="chem-symbols">{product.pictograms.length ? product.pictograms.map((code) => <img alt={PICTOGRAMS.find((p) => p.code === code)?.label || code} title={`${code.replace('GHS','SGH')} · ${PICTOGRAMS.find((p) => p.code === code)?.label}`} key={code} src={`/ghs/${code}.png`} />) : <span className="chem-muted">Non renseignés</span>}</div>;
}
export function ChemicalsPage({ client, fileStore }: { client?: SupabaseClient; fileStore?: ChemicalFileStore }) {
  const context = useOutletContext<AppShellOutletContext | undefined>();
  const [preview] = useState(createChemicalPreviewClient);
  const db = client || (context?.previewMode ? preview : context?.client) || supabase;
  const [previewFiles] = useState(createChemicalPreviewFiles);
  const drive = useMemo(() => createChemicalDrive(db), [db]);
  const files = fileStore || (context?.previewMode && !client ? previewFiles : drive);
  const [workspace, setWorkspace] = useState<{ vessels: ChemicalVessel[]; products: ChemicalProduct[]; attachments: ChemicalAttachment[] }>({ vessels: [], products: [], attachments: [] });
  const [vesselId, setVesselId] = useState(0);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editor, setEditor] = useState<{ product?: ChemicalProduct } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [removal, setRemoval] = useState<ChemicalProduct | ChemicalAttachment | null>(null);
  const [exportVesselId, setExportVesselId] = useState<number | null>(null);
  const [includeAttachments, setIncludeAttachments] = useState(false);
  const [attachmentKind, setAttachmentKind] = useState<ChemicalAttachment['kind']>('fds');
  const request = useRef(0);
  const { vessels, products, attachments } = workspace;
  const filtered = filterChemicals(products, vesselId, query);
  const scope = products.filter((p) => !vesselId || p.vessel_id === vesselId);
  const currentVessel = vessels.find((v) => v.id === vesselId);
  const detail = products.find((p) => p.id === detailId);
  const missingFds = scope.filter((p) => !attachments.some((a) => a.product_id === p.id && a.kind === 'fds')).length;
  const load = useCallback(async () => {
    const id = ++request.current; setLoading(true);
    try { const result = await fetchChemicalWorkspace(db); if (id === request.current) setWorkspace(result); }
    finally { if (id === request.current) setLoading(false); }
  }, [db]);
  useEffect(() => {
    setWorkspace({ vessels: [], products: [], attachments: [] }); setDetailId(null); setEditor(null); setVesselId(0); setError('');
    void load().catch((e) => setError(messageOf(e)));
    return () => { request.current++; };
  }, [load]);
  async function act(action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (e) { setError(messageOf(e)); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function save(draft: ChemicalDraft) {
    const vessel = vessels.find((v) => v.id === draft.vessel_id);
    if (!vessel) throw new Error('Sélectionnez un navire.');
    const saved = await saveChemicalProduct(db, draft, vessel, editor?.product);
    setWorkspace((old) => ({ ...old, products: [...old.products.filter((p) => p.id !== saved.id), saved] }));
    setEditor(null); setDetailId(saved.id); setNotice('Produit enregistré.');
  }
  async function upload(selection: FileList | null, product: ChemicalProduct) {
    if (!selection?.length) return;
    const selected = Array.from(selection);
    await act(async () => {
      for (const file of selected) {
        const attachment = await addChemicalAttachment(db, files, product, file, attachmentKind);
        setWorkspace((old) => ({ ...old, attachments: [...old.attachments, attachment] }));
      }
      setNotice('Pièces jointes ajoutées.');
    });
  }
  return <section className="chem-page">
    <header className="chem-header"><div><div className="chem-eyebrow">QHSE / REGISTRE DE BORD</div><h1><FlaskConical size={27}/>Produits Chimiques</h1><p>Inventaires, stocks et fiches de données de sécurité de la flotte.</p></div>
      <div className="chem-header-actions"><button type="button" className="chem-secondary" disabled={loading || busy || !vessels.length} onClick={() => { setError(''); setExportVesselId(vesselId || vessels[0]?.id || 0); }}><Download size={17}/>Exporter en PDF</button><button type="button" className="chem-primary" disabled={loading || busy || !vessels.length} onClick={() => { setError(''); setDetailId(null); setEditor({}); }}><Plus size={18}/>Ajouter un produit</button></div>
    </header>
    {context?.previewMode && !client ? <p className="chem-demo">Espace de démonstration · données fictives, modifications temporaires.</p> : null}
    <nav className="chem-vessels" aria-label="Filtrer l’inventaire par navire"><button type="button" aria-pressed={!vesselId} onClick={() => setVesselId(0)} className={!vesselId ? 'is-active' : ''}><span className="chem-fleet-icon"><Layers3 size={31}/></span><b>Flotte</b><small>{products.length} produits</small></button>
      {vessels.map((v) => <button type="button" key={v.id} aria-pressed={vesselId === v.id} className={vesselId === v.id ? 'is-active' : ''} onClick={() => setVesselId(v.id)}>{v.icon_url ? <img src={v.icon_url} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }}/> : <span className="chem-vessel-fallback"><Ship size={30}/></span>}<b>{v.name}</b><small>{products.filter((p) => p.vessel_id === v.id).length} produits</small></button>)}
    </nav>
    <div className="chem-summary"><div><span>Produits répertoriés</span><strong>{scope.length}<small>{currentVessel?.name || 'Toute la flotte'}</small></strong></div><div><span>Stock renseigné</span><strong>{stockLabel(scope.reduce((sum, p) => sum + (p.stock_litres ?? 0), 0))}<small>{scope.filter((p) => p.stock_litres === null).length} stocks à renseigner</small></strong></div><div><span>Fiches de sécurité</span><strong>{scope.length - missingFds}<small>{missingFds} produits sans FDS</small></strong></div></div>
    {error && !editor && !detail && !removal && exportVesselId === null ? <p className="chem-error" role="alert">{error}</p> : null}
    {notice ? <p className="chem-notice" role="status">{notice}</p> : null}
    <div className="chem-inventory"><div className="chem-toolbar"><div><h2>Inventaire · {currentVessel?.name || 'Flotte'}</h2><p>{filtered.length} produit{filtered.length > 1 ? 's' : ''} · Ouvrez une fiche pour consulter toutes les consignes.</p></div><label className="chem-search"><Search size={17}/><input aria-label="Rechercher un produit" placeholder="Produit, usage, référence…" value={query} onChange={(e) => setQuery(e.target.value)}/></label><button aria-label="Actualiser l’inventaire" className="chem-icon-button" type="button" disabled={busy || loading} onClick={() => void act(load)}><RefreshCw size={18}/></button></div>
      {loading ? <p className="chem-empty" role="status">Chargement de l’inventaire…</p> : !filtered.length ? <div className="chem-empty"><FlaskConical size={32}/><h3>{query ? 'Aucun produit ne correspond à votre recherche.' : 'Aucun produit répertorié.'}</h3><p>{query ? 'Essayez une autre référence ou un autre navire.' : 'Ajoutez un produit pour commencer l’inventaire de ce navire.'}</p></div> : <div className="chem-table-scroll" tabIndex={0} role="region" aria-label="Tableau de l’inventaire chimique"><table><thead><tr><th>Marque / type</th><th>Compatibilité<br/>de stockage</th><th>Usage</th><th>Pictogrammes</th><th>Dangers</th><th>Conseils de prudence</th><th>EPI</th><th>Stock</th><th>Documents / actions</th></tr></thead><tbody>{filtered.map((p) => <tr key={p.id}>
        <td><button className="chem-product-link" type="button" onClick={() => { setError(''); setDetailId(p.id); }}><span>{p.brand || 'Marque à renseigner'}</span><strong>{p.product_type}</strong></button>{p.variant ? <span className="chem-variant">{p.variant}</span> : null}<small className="chem-ship-label"><Ship size={12}/>{vessels.find((v) => v.id === p.vessel_id)?.name}</small></td>
        <td><span className="chem-compat">{p.storage_compatibility || '—'}</span></td><td><div className="chem-excerpt">{p.usage || 'À renseigner'}</div></td><td><Pictograms product={p}/></td><td><div className="chem-excerpt">{p.hazards || 'À renseigner'}</div></td><td><div className="chem-excerpt">{p.precautions || 'À renseigner'}</div></td><td><div className="chem-excerpt">{p.ppe || 'À renseigner'}</div></td><td className="chem-stock">{stockLabel(p.stock_litres)}</td><td><button className="chem-doc-link" type="button" onClick={() => { setError(''); setDetailId(p.id); }}><Paperclip size={14}/>{attachments.filter((a) => a.product_id === p.id).length} pièce(s)</button><div className="chem-row-actions"><button type="button" title="Modifier" aria-label={`Modifier ${productLabel(p)} ${p.variant}`} disabled={busy} onClick={() => { setError(''); setEditor({ product: p }); }}><Pencil size={16}/></button><button type="button" title="Supprimer" aria-label={`Supprimer ${productLabel(p)} ${p.variant}`} disabled={busy} onClick={() => { setError(''); setRemoval(p); }}><Trash2 size={16}/></button></div></td>
      </tr>)}</tbody></table></div>}
    </div>
    {editor ? <ChemicalForm key={editor.product?.id || 'new'} product={editor.product} vesselId={vesselId} vessels={vessels} busy={busy} error={error} onClose={() => { setEditor(null); setError(''); }} onSave={(draft) => void act(() => save(draft))}/> : null}
    {detail && !editor && !removal ? <AppDialog title={productLabel(detail)} eyebrow={vessels.find((v) => v.id === detail.vessel_id)?.name} size="lg" isBusy={busy} onClose={() => { setDetailId(null); setError(''); }}
      footer={<div className="app-dialog__actions"><button className="is-secondary" disabled={busy} onClick={() => setDetailId(null)} type="button">Fermer</button><button className="is-primary" disabled={busy} onClick={() => { setError(''); setEditor({ product: detail }); }} type="button"><Pencil size={16}/>Modifier le produit</button></div>}>
      {error ? <p className="chem-error" role="alert">{error}</p> : null}<div className="chem-detail-top"><div><small>Stock en litres</small><strong>{stockLabel(detail.stock_litres)}</strong></div><Pictograms product={detail}/></div>
      <dl className="chem-detail-grid">{([['Variante / format / UFI',detail.variant],['Compatibilité de stockage',detail.storage_compatibility],['Usage',detail.usage],['Emplacement',detail.storage_location],['Dangers',detail.hazards],['Conseils de prudence',detail.precautions],['EPI',detail.ppe],['Observations / source',detail.notes]]).map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value || 'À renseigner'}</dd></div>)}</dl>
      <section className="chem-attachments"><h3><Paperclip size={18}/>FDS et pièces jointes · Google Drive</h3><p>Dossier : SeaPilot / Produits Chimiques / navire / produit.</p>{attachments.filter((a) => a.product_id === detail.id).map((a) => <div className="chem-attachment" key={a.id}><button disabled={busy} type="button" onClick={() => void act(async () => saveChemicalBlob(await downloadChemicalAttachment(files,a),a.file_name))}><Download size={16}/><span><b>{a.file_name}</b><small>{a.kind === 'fds' ? 'Fiche de données de sécurité' : 'Pièce jointe'} · {(a.size_bytes/1024).toFixed(0)} Ko · Google Drive</small></span></button>{!context?.previewMode ? <a className="chem-open-drive" href={launcherOpenUri('chemicals',a.drive_path)} title="Ouvrir le fichier Google Drive sur ce PC">Ouvrir</a> : null}<button type="button" aria-label={`Supprimer ${a.file_name}`} disabled={busy} onClick={() => { setError(''); setRemoval(a); }}><Trash2 size={16}/></button></div>)}
        {!attachments.some((a) => a.product_id === detail.id) ? <p>Aucune pièce jointe. Ajoutez la fiche de données de sécurité du produit.</p> : null}
        <div className="chem-upload"><label>Type de document<select disabled={busy} value={attachmentKind} onChange={(e) => setAttachmentKind(e.target.value as ChemicalAttachment['kind'])}><option value="fds">Fiche de données de sécurité</option><option value="other">Autre pièce jointe</option></select></label><label>Ajouter des pièces jointes<input type="file" multiple disabled={busy} accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx,.txt" onChange={(e) => { void upload(e.target.files,detail); e.target.value=''; }}/></label><small>Google Drive · PDF, images, DOCX, XLSX ou texte · 20 Mo par fichier. Lanceur Windows 2.2 requis.</small></div>
      </section>
    </AppDialog> : null}
    {removal ? <AppDialog title={'file_name' in removal ? 'Retirer la pièce jointe ?' : 'Supprimer le produit ?'} size="sm" isBusy={busy} onClose={() => { setRemoval(null); setError(''); }} footer={<div className="app-dialog__actions"><button type="button" className="is-secondary" disabled={busy} onClick={() => setRemoval(null)}>Annuler</button><button type="button" className="is-danger" disabled={busy} onClick={() => void act(async () => {
      if ('file_name' in removal) { const warning = await removeChemicalAttachment(db,removal); setWorkspace((old) => ({ ...old, attachments: old.attachments.filter((a) => a.id !== removal.id) })); setNotice(warning || 'Pièce jointe supprimée.'); }
      else { await deleteChemicalProduct(db,removal); setWorkspace((old) => ({ ...old, products: old.products.filter((p) => p.id !== removal.id) })); setDetailId(null); setNotice('Produit supprimé de l’inventaire.'); }
      setRemoval(null);
    })}>{busy ? 'Suppression…' : 'Supprimer'}</button></div>}><p>{'file_name' in removal ? removal.file_name : `${productLabel(removal)} sera retiré de l’inventaire.`}</p><p>Les fichiers originaux restent dans le dossier Google Drive.</p>{error ? <p role="alert" className="chem-error">{error}</p> : null}</AppDialog> : null}
    {exportVesselId !== null ? <AppDialog title="Exporter l’inventaire en PDF" eyebrow="DOCUMENT BBTM" size="sm" isBusy={busy} onClose={() => { setExportVesselId(null); setError(''); }} footer={<div className="app-dialog__actions"><button type="button" className="is-secondary" disabled={busy} onClick={() => setExportVesselId(null)}>Annuler</button><button type="button" className="is-primary" disabled={busy || !exportVesselId} onClick={() => void act(async () => {
      const vessel = vessels.find((v) => v.id === exportVesselId); if (!vessel) throw new Error('Sélectionnez un navire.');
      if (includeAttachments && attachments.some((a) => products.some((p) => p.id === a.product_id && p.vessel_id === vessel.id))) await files.connect();
      const { buildChemicalPdf, prepareChemicalPdf } = await import('./chemicalPdf');
      const result = await buildChemicalPdf(await prepareChemicalPdf(files,vessel,products,attachments,includeAttachments));
      saveChemicalBlob(result.blob,result.filename); setNotice('PDF BBTM généré.'); setExportVesselId(null);
    })}>{busy ? 'Génération…' : 'Télécharger le PDF'}</button></div>}>
      {error ? <p className="chem-error" role="alert">{error}</p> : null}<label className="chem-field"><span>Navire</span><select disabled={busy} value={exportVesselId} onChange={(e) => setExportVesselId(Number(e.target.value))}>{vessels.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label><p>L’export contient tous les produits du navire choisi, indépendamment de la recherche affichée.</p><label className="chem-export-check"><input type="checkbox" checked={includeAttachments} disabled={busy} onChange={(e) => setIncludeAttachments(e.target.checked)}/><span><b>Inclure les pièces jointes</b><small>Les PDF et images sont ajoutés en annexe. Les autres formats sont incorporés comme fichiers joints au PDF. Le dossier Google Drive doit être synchronisé sur ce PC et le lanceur Windows 2.2 installé.</small></span></label>
    </AppDialog> : null}
  </section>;
}
