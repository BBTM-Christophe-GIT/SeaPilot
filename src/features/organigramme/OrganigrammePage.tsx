import { useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Copy, Maximize2, Minimize2, Network, Pencil, Plus, RefreshCw } from 'lucide-react';
import { AppDialog } from '../../components/AppDialog';
import type { AppShellOutletContext } from '../shell/AppShell';
import { buildOrganigramme, ORGANIGRAMME_REFERENCE, ORGANIGRAMME_SOURCE, ORG_VIEW_LABELS, PRIMARY_ORG_CHART, orgLocalDate, type OrgData, type OrgOptions } from './organigrammeModel';
import { OrgChartSettings, type OrgEditor } from './OrgChartSettings';
import { OrgChartNameDialog, type OrgChartNameAction } from './OrgChartNameDialog';
import { layoutOrganigramme, organigrammeSvg } from './organigrammeDiagram';
import { createOrgChart, fetchOrganigramme, renameOrgChart, saveOrgEmergencyDefault } from './organigrammeQueries';
import { OrgSupportEditor } from './OrgSupportEditor';
import { OrgStructureEditor } from './OrgStructureEditor';
import { OrgWatchEditor } from './OrgWatchEditor';
import { OrgWatchTransferBoard } from './OrgWatchTransferBoard';
import { OrgDiagramCanvas } from './OrgDiagramCanvas';
import { OrgPersonnelPanel } from './OrgPersonnelPanel';
import './organigramme.css';

const EDITOR_LABELS: Record<OrgEditor, { title: string; description?: string }> = {
  watches: { title: 'Composer les bordées', description: 'Préparez les équipages de chaque navire.' },
  transfer: { title: 'Déplacer des collaborateurs' },
  structure: { title: 'Modifier la structure', description: 'Organisez les catégories, les responsabilités et leurs liens.' },
};

export function OrganigrammePage() {
  const context = useOutletContext<AppShellOutletContext>();
  if (!context.roles.some((role) => role === 'admin' || role === 'direction')) return <div className="admin-state" role="alert">L’organigramme est réservé à Administrateur et Direction.</div>;
  return <OrganigrammeContent {...context} />;
}

function OrganigrammeContent({ client, previewMode }: AppShellOutletContext) {
  const [asOf, setAsOf] = useState(orgLocalDate);
  const [chartId, setChartId] = useState(PRIMARY_ORG_CHART.id);
  const [activeDocument, setDocument] = useState<'chart' | 'personnel' | 'emergency'>('chart');
  const [data, setData] = useState<OrgData | null>(null);
  const [error, setError] = useState('');
  const [exportError, setExportError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [download, setDownload] = useState<{ url: string; name: string; format: string } | null>(null);
  const [updatedAt, setUpdatedAt] = useState('');
  const [editor, setEditor] = useState<OrgEditor | null>(null);
  const [nameEditor, setNameEditor] = useState<OrgChartNameAction | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [imageFormat, setImageFormat] = useState<'png' | 'svg'>('png');
  const [zoom, setZoom] = useState(90);
  const canvasRef = useRef<HTMLDivElement>(null);
  const centeredCanvas = useRef<{ element: HTMLDivElement; chartId: number; zoom: number; view: OrgOptions['view']; vesselIds: OrgOptions['vesselIds'] } | null>(null);
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
    fetchOrganigramme(client, asOf, chartId).then((result) => {
      if (current) { setData(result); setUpdatedAt(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })); }
    }).catch((reason: unknown) => { if (current) setError(reason instanceof Error ? reason.message : 'Chargement impossible.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [client, asOf, chartId, revision]);
  const currentData = data?.asOf === asOf && data.chartId === chartId ? data : null;
  const currentChart = data?.charts.find((chart) => chart.id === chartId);
  const sections = useMemo(() => currentData ? buildOrganigramme(currentData, options) : [], [currentData, options]);
  const diagram = useMemo(() => layoutOrganigramme(sections, options.showVessels), [sections, options.showVessels]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const previous = centeredCanvas.current;
    if (previous?.element === canvas && previous.chartId === chartId && previous.zoom === zoom &&
        previous.view === options.view && previous.vesselIds === options.vesselIds) return;
    centeredCanvas.current = { element: canvas, chartId, zoom, view: options.view, vesselIds: options.vesselIds };
    const head = diagram.boxes.find((box) => box.tone === 'leader');
    const center = head ? head.x + head.width / 2 : diagram.width / 2;
    canvas.scrollLeft = zoom ? Math.max(0, center * zoom / 100 - canvas.clientWidth / 2) : 0;
  }, [activeDocument, chartId, diagram, options.vesselIds, options.view, zoom]);
  const diagramUrl = useMemo(() => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(organigrammeSvg(diagram))}`, [diagram]);
  const count = new Set(sections.filter((section) => section.kind !== 'relations').flatMap((section) => section.columns.flatMap((column) => column.members.map((member) => member.id)))).size;
  const shownLinks = sections.filter((section) => section.kind === 'relations').reduce((total, section) => total + section.columns.length, 0);
  const hiddenLinks = (currentData?.links?.length || 0) - shownLinks;
  const photoErrors = currentData?.people.filter((person) => person.photoUnavailable && (sections.some((section) => section.columns.some((column) => column.members.some((member) => member.id === person.id))) || (options.includeExternal && currentData.support.some((entry) => entry.category === 'external' && entry.personId === person.id)))).length || 0;
  const canExport = Boolean(currentData && sections.length && !loading && !error && !exporting && (options.showPhotos === false || !photoErrors));
  function selectChart(id: number) {
    setEditor(null);
    setChartId(id);
    setOptions((previous) => ({ ...previous, vesselIds: null }));
    setExportError('');
    setDownload(null);
  }
  async function saveChartName(name: string) {
    const chart = nameEditor === 'rename' ? await renameOrgChart(client, chartId, name)
      : await createOrgChart(client, name, nameEditor === 'duplicate' ? chartId : undefined);
    setData((previous) => {
      if (!previous) return previous;
      const exists = previous.charts.some((item) => item.id === chart.id);
      const charts = exists ? previous.charts.map((item) => item.id === chart.id ? chart : item) : [...previous.charts, chart];
      return { ...previous, charts };
    });
    setNameEditor(null);
    if (chart.id !== chartId) selectChart(chart.id);
    else {
      setDownload(null);
      refresh();
    }
  }
  async function exportChart(format: 'pdf' | 'png' | 'svg') {
    if (!canExport || !currentData) return;
    setExporting(true); setExportError('');
    try {
      const { buildOrgImage, buildOrgPdf, downloadOrgBlob } = await import('./organigrammeExport');
      const chartName = currentChart?.name || PRIMARY_ORG_CHART.name;
      const blob = format === 'pdf' ? await buildOrgPdf(sections, options.showVessels, asOf, options.view, undefined, chartName) : await buildOrgImage(sections, options.showVessels, format);
      const fileTitle = chartName.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'Organigramme';
      const name = `BBTM_${fileTitle}_${asOf}_${options.view === 'vessels' ? 'navires' : 'fonctions'}${options.showVessels ? '' : '_sans-navires'}.${format}`;
      setDownload({ url: URL.createObjectURL(blob), name, format: format.toUpperCase() });
      downloadOrgBlob(blob, name);
    } catch (reason) { setExportError(reason instanceof Error ? reason.message : 'Export impossible.'); }
    finally { setExporting(false); }
  }
  return <div className="org-page">
    <header className="org-header"><div><h1><Network size={26} aria-hidden="true" />Organigramme</h1><p>Les équipes BBTM et leurs bordées.</p></div>
      <div className="org-actions"><button type="button" onClick={refresh} disabled={loading}><RefreshCw size={16} aria-hidden="true" />Actualiser</button></div>
    </header>
    <div className="org-document-toolbar"><div className="org-document-tabs" role="group" aria-label="Document à préparer">{([{ key: 'chart', label: 'Organigramme' }, { key: 'personnel', label: 'Liste du personnel' }, { key: 'emergency', label: 'Numéros d’urgence' }] as const).map(({ key, label }) => <button type="button" key={key} aria-pressed={activeDocument === key} onClick={() => setDocument(key)}>{label}</button>)}</div>
      {activeDocument !== 'chart' && <label>Situation au<input type="date" aria-label="Date de situation" value={asOf} onChange={(event) => { if (/^\d{4}-\d{2}-\d{2}$/.test(event.target.value)) setAsOf(event.target.value); }} /></label>}
    </div>
    {error && <div className="org-error" role="alert">{error} <button type="button" onClick={refresh}>Réessayer</button></div>}
    {activeDocument === 'chart' && <>
      <div className={`org-workspace${expanded ? ' is-expanded' : ''}`}>
        <div className="org-chart-column">
          <section className="org-canvas-panel" aria-label="Aperçu de l’organigramme">
            <div className="org-canvas-toolbar">
              <div className="org-canvas-title">
                <select aria-label="Organigramme à afficher" value={chartId} disabled={!data || exporting} onChange={(event) => selectChart(Number(event.target.value))}>
                  {(data?.charts || [PRIMARY_ORG_CHART]).map((chart) => <option key={chart.id} value={chart.id}>{chart.name}</option>)}
                </select>
                <span>{loading || !currentData ? 'Actualisation…' : `${count} personnes et intervenants`}</span>
              </div>
              <div className="org-canvas-actions">
                <button type="button" disabled={!currentData || loading || !!error || exporting} onClick={() => setNameEditor('create')}><Plus size={16} aria-hidden="true" />Nouvel organigramme</button>
                <button type="button" disabled={!currentData || loading || !!error || exporting} onClick={() => setNameEditor('duplicate')}><Copy size={15} aria-hidden="true" />Dupliquer</button>
                <button type="button" disabled={!currentData || loading || !!error || exporting} onClick={() => setNameEditor('rename')}><Pencil size={15} aria-hidden="true" />Renommer</button>
                <label><span className="org-sr-only">Zoom</span><select aria-label="Zoom" value={zoom} onChange={(event) => setZoom(Number(event.target.value))}><option value={0}>Ajuster</option>{[50, 70, 90, 100, 125].map((value) => <option key={value} value={value}>{value} %</option>)}</select></label>
                <button type="button" className="org-expand" aria-label={expanded ? 'Afficher les réglages' : 'Agrandir l’organigramme'} aria-pressed={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button>
              </div>
            </div>
            {!error && !currentData ? <div className="admin-state" role="status">Chargement de l’organigramme…</div> : !error && !sections.length ? <div className="admin-state">Aucun effectif dans cette sélection. Modifiez les filtres ou composez les bordées.</div> : currentData && !error && (
              <OrgDiagramCanvas
                canvasRef={canvasRef} diagram={diagram} imageSrc={diagramUrl} zoom={zoom}
                imageAlt={[`Organigramme ${ORG_VIEW_LABELS[options.view].toLocaleLowerCase('fr')}${options.showVessels ? '' : ', sans navires'}`,
                  ...diagram.legend?.map(({ label, line }) => `${line.relationship === 'dpa' ? 'Trait rouge' : 'Trait gris'} — ${label}`) ?? [],
                ].join('. ')}
                client={client} data={currentData} disabled={loading || exporting} onSaved={refresh}
              />
            )}
            {exporting && <p className="org-export-status" role="status">Préparation de l’export…</p>}
          </section>
          {photoErrors > 0 && <p className="org-notice" role="status">{photoErrors} photo(s) indisponible(s). Actualisez pour réessayer ou décochez « Inclure les photos dans les exports ».</p>}
          {hiddenLinks > 0 && <p className="org-notice">{hiddenLinks} lien(s) enregistré(s) non affiché(s) : leur catégorie ou leur cible est absente de la date, de la vue ou des filtres choisis.</p>}
          {exportError && <p className="org-error" role="alert">{exportError}</p>}
          {download && <p className="org-download" role="status">Dernier export prêt : <a href={download.url} download={download.name}>Télécharger le fichier {download.format}</a></p>}
          <footer className="org-footer"><span>Actualisé à {updatedAt || '—'}</span><span>PDF sur une page · {ORGANIGRAMME_REFERENCE}</span><p>Référence : {ORGANIGRAMME_SOURCE}. Bordées composées dans ce module, indépendamment du planning.</p></footer>
        </div>
        {!expanded && <OrgChartSettings data={currentData} options={options} onChange={setOptions} asOf={asOf} onDateChange={setAsOf} disabled={loading || !!error} canExport={canExport} imageFormat={imageFormat} onImageFormatChange={setImageFormat} onExportImage={() => void exportChart(imageFormat)} onExportPdf={() => void exportChart('pdf')} onEdit={setEditor} />}
      </div>
    </>}
    <div hidden={activeDocument === 'chart'}>{data ? <OrgPersonnelPanel data={data} kind={activeDocument === 'emergency' ? 'emergency' : 'personnel'} disabled={loading || !!error || !currentData} previewMode={previewMode} onSaveDefault={async (ids) => {
      await saveOrgEmergencyDefault(client, ids);
      setData((previous) => previous ? { ...previous, emergencyDefaultIds: ids } : previous);
    }} /> : !error && <p role="status">Chargement des coordonnées du personnel…</p>}</div>
    {nameEditor && currentChart && <OrgChartNameDialog action={nameEditor} chartName={currentChart.name} onClose={() => setNameEditor(null)} onSave={saveChartName} />}
    {editor && currentData && <AppDialog {...EDITOR_LABELS[editor]} key={chartId} variant="drawer" onClose={() => setEditor(null)}>
      {editor === 'watches' && <OrgWatchEditor client={client} data={currentData} onSaved={refresh} previewMode={previewMode} disabled={loading || !!error} />}
      {editor === 'transfer' && <OrgWatchTransferBoard client={client} data={currentData} onSaved={refresh} disabled={loading || !!error} />}
      {editor === 'structure' && <><OrgStructureEditor client={client} data={currentData} onSaved={refresh} previewMode={previewMode} /><OrgSupportEditor client={client} data={currentData} onSaved={refresh} previewMode={previewMode} /></>}
    </AppDialog>}
  </div>;
}
