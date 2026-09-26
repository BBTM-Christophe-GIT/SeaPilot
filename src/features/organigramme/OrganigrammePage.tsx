import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Download, FileDown, Network, RefreshCw, Settings2, Ship, Users } from 'lucide-react';
import type { AppShellOutletContext } from '../shell/AppShell';
import { buildOrganigramme, ORGANIGRAMME_REFERENCE, ORGANIGRAMME_SOURCE, ORG_VIEW_LABELS, orgCategoryLabel, orgLocalDate, orgPopulatedVessels, type OrgData, type OrgOptions } from './organigrammeModel';
import { layoutOrganigramme, organigrammeSvg } from './organigrammeDiagram';
import { fetchOrganigramme } from './organigrammeQueries';
import { OrgSupportEditor } from './OrgSupportEditor';
import { OrgStructureEditor } from './OrgStructureEditor';
import { OrgWatchEditor } from './OrgWatchEditor';
import { OrgPersonnelPanel } from './OrgPersonnelPanel';
import './organigramme.css';

export function OrganigrammePage() {
  const context = useOutletContext<AppShellOutletContext>();
  if (!context.roles.some((role) => role === 'admin' || role === 'direction')) return <div className="admin-state" role="alert">L’organigramme est réservé à Administrateur et Direction.</div>;
  return <OrganigrammeContent {...context} />;
}

function OrganigrammeContent({ client, previewMode }: AppShellOutletContext) {
  const [asOf, setAsOf] = useState(orgLocalDate);
  const [activeDocument, setDocument] = useState<'chart' | 'personnel' | 'emergency'>('chart');
  const [data, setData] = useState<OrgData | null>(null);
  const [error, setError] = useState('');
  const [exportError, setExportError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [download, setDownload] = useState<{ url: string; name: string; format: string } | null>(null);
  const [updatedAt, setUpdatedAt] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [watchEditorOpen, setWatchEditorOpen] = useState(false);
  const [imageFormat, setImageFormat] = useState<'png' | 'svg'>('png');
  const [zoom, setZoom] = useState(0);
  const [options, setOptions] = useState<OrgOptions>({ view: 'vessels', vesselIds: null, includeOffice: true, includeExternal: true, includeUnassigned: true, showVessels: true });
  const refresh = () => setRevision((value) => value + 1);
  useEffect(() => () => { if (download) URL.revokeObjectURL(download.url); }, [download]);
  useEffect(() => {
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 60_000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(interval); window.removeEventListener('focus', refresh); };
  }, []);
  useEffect(() => {
    let current = true;
    setLoading(true); setError('');
    fetchOrganigramme(client, asOf).then((result) => {
      if (current) { setData(result); setUpdatedAt(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })); }
    }).catch((reason: unknown) => { if (current) setError(reason instanceof Error ? reason.message : 'Chargement impossible.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [client, asOf, revision]);
  const currentData = data?.asOf === asOf ? data : null;
  const vesselChoices = useMemo(() => currentData ? orgPopulatedVessels(currentData) : [], [currentData]);
  const selectedVesselCount = vesselChoices.filter((vessel) => options.vesselIds === null || options.vesselIds.includes(vessel.id)).length;
  const sections = useMemo(() => currentData ? buildOrganigramme(currentData, options) : [], [currentData, options]);
  const diagram = useMemo(() => layoutOrganigramme(sections, options.showVessels), [sections, options.showVessels]);
  const diagramUrl = useMemo(() => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(organigrammeSvg(diagram))}`, [diagram]);
  const count = new Set(sections.filter((section) => section.kind !== 'relations').flatMap((section) => section.columns.flatMap((column) => column.members.map((member) => member.id)))).size;
  const shownLinks = sections.filter((section) => section.kind === 'relations').reduce((total, section) => total + section.columns.length, 0);
  const hiddenLinks = (currentData?.links?.length || 0) - shownLinks;
  const canExport = Boolean(currentData && sections.length && !loading && !error && !exporting);
  async function exportChart(format: 'pdf' | 'png' | 'svg') {
    if (!canExport || !currentData) return;
    setExporting(true); setExportError('');
    try {
      const { buildOrgImage, buildOrgPdf, downloadOrgBlob } = await import('./organigrammeExport');
      const blob = format === 'pdf' ? await buildOrgPdf(sections, options.showVessels, asOf, options.view) : await buildOrgImage(sections, options.showVessels, format);
      const name = `BBTM_Organigramme_${asOf}_${options.view === 'vessels' ? 'navires' : options.view === 'watches' ? 'bordees' : 'fonctions'}${options.showVessels ? '' : '_sans-navires'}.${format}`;
      setDownload({ url: URL.createObjectURL(blob), name, format: format.toUpperCase() });
      downloadOrgBlob(blob, name);
    } catch (reason) { setExportError(reason instanceof Error ? reason.message : 'Export impossible.'); }
    finally { setExporting(false); }
  }
  return <div className="org-page">
    <header className="org-header"><div><h1><Network size={26} />Organigramme</h1><p>Les équipes BBTM, leurs bordées et leurs fonctions.</p></div>
      <div className="org-actions"><button type="button" onClick={refresh} disabled={loading}><RefreshCw size={16} />Actualiser</button>{activeDocument === 'chart' && <button type="button" className="org-primary" onClick={() => void exportChart('pdf')} disabled={!canExport}><FileDown size={16} />Exporter le PDF</button>}</div>
    </header>
    {previewMode && <p className="org-notice">Préversion avec des données de démonstration.</p>}
    <div className="org-document-toolbar"><div className="org-tabs" role="group" aria-label="Document à préparer">{([{ key: 'chart', label: 'Organigramme' }, { key: 'personnel', label: 'Liste du personnel' }, { key: 'emergency', label: 'Numéros d’urgence' }] as const).map(({ key, label }) => <button type="button" key={key} aria-pressed={activeDocument === key} onClick={() => setDocument(key)}>{label}</button>)}</div>
      <label>Situation au<input type="date" aria-label="Date de situation" value={asOf} onChange={(event) => { if (/^\d{4}-\d{2}-\d{2}$/.test(event.target.value)) setAsOf(event.target.value); }} /></label>
    </div>
    {error && <div className="org-error" role="alert">{error} <button type="button" onClick={refresh}>Réessayer</button></div>}
    <div hidden={activeDocument !== 'chart'}>
    <section className="org-controls" aria-label="Configuration de l’organigramme">
      <div className="org-toolbar"><div className="org-tabs" role="group" aria-label="Présentation"><button type="button" aria-pressed={options.view === 'vessels'} onClick={() => setOptions({ ...options, view: 'vessels' })}><Ship size={16} />Par navire et bordée</button><button type="button" aria-pressed={options.view === 'watches'} onClick={() => setOptions({ ...options, view: 'watches' })}><Users size={16} />Par bordée</button><button type="button" aria-pressed={options.view === 'functions'} onClick={() => setOptions({ ...options, view: 'functions' })}><Users size={16} />Par fonction</button></div>
      </div>
      <fieldset className="org-vessel-filter" disabled={loading || !!error} aria-describedby="org-vessel-help">
        <legend>Navires à afficher <span>({selectedVesselCount} / {vesselChoices.length})</span></legend>
        <div className="org-vessel-choices">
          <button type="button" aria-pressed={options.vesselIds === null} onClick={() => setOptions((previous) => ({ ...previous, vesselIds: null }))}>Tous les navires</button>
          <button type="button" aria-pressed={options.vesselIds?.length === 0} onClick={() => setOptions((previous) => ({ ...previous, vesselIds: [] }))}>Aucun navire</button>
          {vesselChoices.map((vessel) => <label key={vessel.id}><input type="checkbox" checked={options.vesselIds === null || options.vesselIds.includes(vessel.id)} onChange={(event) => {
            const checked = event.target.checked;
            setOptions((previous) => {
              const ids = previous.vesselIds ?? vesselChoices.map((choice) => choice.id);
              return { ...previous, vesselIds: checked ? [...ids, vessel.id] : ids.filter((id) => id !== vessel.id) };
            });
          }} />{vessel.name}</label>)}
        </div>
        <p id="org-vessel-help">Les navires sans équipage sont masqués. Utilisez « Composer les bordées » pour les compléter.</p>
      </fieldset>
      <div className="org-options">{([{ key: 'includeOffice', label: orgCategoryLabel(data || {}, 'office') }, { key: 'includeExternal', label: orgCategoryLabel(data || {}, 'external') }, { key: 'includeUnassigned', label: orgCategoryLabel(data || {}, 'unassigned') }, { key: 'showVessels', label: 'Afficher les navires' }] as const).map(({ key, label }) => <label key={key}><input type="checkbox" checked={options[key]} disabled={key === 'includeUnassigned' && options.vesselIds !== null} onChange={(event) => setOptions({ ...options, [key]: event.target.checked })} />{label}</label>)}
        <button type="button" aria-expanded={watchEditorOpen} onClick={() => setWatchEditorOpen(!watchEditorOpen)}><Users size={15} />Composer les bordées</button><button type="button" aria-expanded={editorOpen} onClick={() => setEditorOpen(!editorOpen)}><Settings2 size={15} />Modifier la structure</button>
      </div>
    </section>
    {watchEditorOpen && currentData && <OrgWatchEditor client={client} data={currentData} onSaved={refresh} previewMode={previewMode} disabled={loading || !!error} />}
    {editorOpen && currentData && <><OrgStructureEditor client={client} data={currentData} onSaved={refresh} previewMode={previewMode} /><OrgSupportEditor client={client} data={currentData} onSaved={refresh} previewMode={previewMode} /></>}
    {hiddenLinks > 0 && <p className="org-notice">{hiddenLinks} lien(s) enregistré(s) non affiché(s) : leur catégorie ou leur cible est absente de la date, de la vue ou des filtres choisis.</p>}
    {exportError && <p className="org-error" role="alert">{exportError}</p>}
    {download && <p className="org-download" role="status">Dernier export prêt : <a href={download.url} download={download.name}>Télécharger le fichier {download.format}</a></p>}
    <section className="org-canvas-panel" aria-label="Aperçu de l’organigramme">
      <div className="org-canvas-toolbar"><span>{loading ? 'Actualisation…' : `${count} personnes et intervenants · Actualisé à ${updatedAt}`}</span><div><label>Zoom<select aria-label="Zoom" value={zoom} onChange={(event) => setZoom(Number(event.target.value))}><option value={0}>Ajuster</option>{[50, 70, 90, 100, 125].map((value) => <option key={value} value={value}>{value} %</option>)}</select></label><label className="org-format">Format image<select aria-label="Format image" value={imageFormat} onChange={(event) => setImageFormat(event.target.value as 'png' | 'svg')}><option value="png">PNG</option><option value="svg">SVG vectoriel</option></select></label><button type="button" disabled={!canExport} onClick={() => void exportChart(imageFormat)}><Download size={16} />Exporter l’image</button></div></div>
      {loading && !currentData ? <div className="admin-state" role="status">Chargement de l’organigramme…</div> : !error && !sections.length ? <div className="admin-state">Aucun effectif dans cette sélection. Modifiez les filtres ou composez les bordées.</div> : currentData && !error ? <div className="org-canvas" tabIndex={0} aria-label="Diagramme défilant"><img src={diagramUrl} width={diagram.width * (zoom || 100) / 100} height={diagram.height * (zoom || 100) / 100} style={zoom === 0 ? { width: '100%', height: 'auto', maxWidth: '100%' } : undefined} alt={`Organigramme ${ORG_VIEW_LABELS[options.view].toLocaleLowerCase('fr')}${options.showVessels ? '' : ', sans navires'}`} /></div> : null}
      {exporting && <p className="org-export-status" role="status">Préparation de l’export…</p>}
    </section>
    <footer className="org-footer"><p>Hiérarchie par rang, fonctions Support sur les côtés. Les bordées sont composées par défaut dans ce module, indépendamment du planning. La date filtre les effectifs et les navires ; les compositions restent courantes.</p><p>PDF sur une seule page paysage, de taille adaptée au contenu, avec logo BBTM · {ORGANIGRAMME_REFERENCE} · Référence : {ORGANIGRAMME_SOURCE}. Tous les navires sont côte à côte. L’image contient uniquement le diagramme.</p></footer>
    </div>
    <div hidden={activeDocument === 'chart'}>{data ? <OrgPersonnelPanel data={data} kind={activeDocument === 'emergency' ? 'emergency' : 'personnel'} disabled={loading || !!error || !currentData} /> : !error && <p role="status">Chargement des coordonnées du personnel…</p>}</div>
  </div>;
}
