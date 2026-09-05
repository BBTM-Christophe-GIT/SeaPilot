import { useEffect, useMemo, useRef, useState } from 'react';
import { Archive, ChevronLeft, ChevronRight, Download, ExternalLink, FileText, Maximize2, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { QHSE_REPORT_FAMILIES, type QhseReportDefinition } from './qhseReportCatalog';
import type { QhseReportOptions, QhseReportSnapshot } from './qhseReportData';
import { composeQhseReport, prepareQhseReport, type PreparedQhseReport } from './qhseReportAssembly';
import { buildQhseReportArchive, downloadQhseBlob, qhseReportArchiveFileName } from './qhseReportPdf';
import { QhseGraphOptions } from './QhseGraphOptions';
import { KpiDialog } from './KpiDialog';
import KpiPdfPreview from './KpiPdfPreview';
import { qhseGraphAvailability } from './qhseGraphAvailability';

interface Props {
  reports: readonly QhseReportDefinition[];
  options: QhseReportOptions;
  scopeKey: string;
  disabled: boolean;
  getSnapshot(): Promise<QhseReportSnapshot>;
  snapshot?: QhseReportSnapshot | null;
}
const defaults = ['social-safety-1', 'consumption', 'training-plan'];
const shortTitle = (report: QhseReportDefinition) => report.title.replace(/^(RSE|RH|Opérations) — /, '').replace(/^./, (letter) => letter.toUpperCase());

export function QhseReportComposer({ reports, options: baseOptions, scopeKey, disabled, getSnapshot, snapshot }: Props) {
  const [reportIds, setReportIds] = useState<string[]>(() => {
    const initial = reports.filter((r) => defaults.includes(r.id)).map((r) => r.id);
    return initial.length ? initial : reports.slice(0, 1).map((r) => r.id);
  });
  const [activeReport, setActiveReport] = useState<string>(reports.find((r) => r.id === 'consumption')?.id || reports[0]?.id || '');
  const [tab, setTab] = useState<'reports' | 'pages'>('reports');
  const [graphOptions, setGraphOptions] = useState<QhseReportOptions>({});
  const options = useMemo(() => ({ ...graphOptions, ...baseOptions }), [graphOptions, baseOptions]);
  const selectedReports = useMemo(() => reports.filter((r) => reportIds.includes(r.id)), [reports, reportIds]);
  const [preparedState, setPreparedState] = useState<{ key: string; value: PreparedQhseReport } | null>(null);
  // Exclusions, rather than inclusions, preserve deliberate page choices when graphs are regenerated.
  const [excluded, setExcluded] = useState<{ scope: string; ids: string[] }>({ scope: scopeKey, ids: [] });
  const [preview, setPreview] = useState<{ key: string; blob: Blob; url: string } | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [page, setPage] = useState(2);
  const [zoom, setZoom] = useState('page-fit');
  const [expanded, setExpanded] = useState(false);
  const [zipBusy, setZipBusy] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<'selection' | 'preview'>('selection');
  const signature = `${scopeKey}:${selectedReports.map((r) => r.id).join(',')}:${JSON.stringify(options)}:${revision}`;
  const currentSignature = useRef(signature);
  currentSignature.current = disabled ? '' : signature;
  useEffect(() => () => { currentSignature.current = ''; }, []);
  const prepared = !disabled && preparedState?.key === signature ? preparedState.value : null;
  const selectedPages = useMemo(() => prepared?.pages.filter((p) => excluded.scope !== scopeKey || !excluded.ids.includes(p.id)) || [], [prepared, excluded, scopeKey]);
  const pageKey = `${signature}:${selectedPages.map((p) => p.id).join(',')}`;
  const readyPreview = !disabled && prepared && preview?.key === pageKey ? preview : null;
  const visiblePage = Math.min(page, selectedPages.length) || 1;

  useEffect(() => {
    if (disabled || !selectedReports.length) { setStatus(''); return; }
    let active = true;
    setError(''); setStatus('Préparation de l’aperçu…');
    const timer = window.setTimeout(() => {
      void getSnapshot().then((snapshot) => prepareQhseReport(selectedReports, snapshot, options, (done, total) => {
        if (active) setStatus(`Mise en page : ${done} / ${total} rapports`);
      })).then((value) => { if (active) { setPreparedState({ key: signature, value }); setStatus('Assemblage des pages sélectionnées…'); } })
        .catch(() => { if (active) { setError('Impossible de préparer le rapport. Réessayez après vérification des données.'); setStatus(''); } });
    }, 300);
    return () => { active = false; window.clearTimeout(timer); };
  }, [disabled, signature, selectedReports, options, getSnapshot]);

  useEffect(() => {
    if (!prepared || !selectedPages.length) return;
    let active = true;
    let url: string | undefined;
    setError('');
    void composeQhseReport(prepared, selectedPages.map((p) => p.id)).then((blob) => {
      if (!active) return;
      url = URL.createObjectURL(blob);
      setPreview({ key: pageKey, blob, url }); setStatus('Aperçu à jour · identique au PDF exporté');
    }).catch(() => { if (active) setError('Impossible d’assembler les pages sélectionnées.'); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [prepared, selectedPages, pageKey]);

  function togglePage(id: string, checked: boolean) {
    setExcluded((state) => ({ scope: scopeKey, ids: checked ? state.ids.filter((value) => value !== id) : [...(state.scope === scopeKey ? state.ids : []), id] }));
  }
  function exportPdf() {
    // Download the exact reviewed bytes. Never rebuild an unreviewed PDF on export.
    if (!readyPreview) return;
    downloadQhseBlob(readyPreview.blob, `Rapport-QHSE-${selectedPages.length}-page${selectedPages.length > 1 ? 's' : ''}.pdf`);
    setStatus(`${selectedPages.length} page(s) exportée(s).`);
  }
  async function exportArchive() {
    if (disabled || zipBusy || !selectedReports.length) return;
    setZipBusy(true);
    const requestKey = signature;
    try {
      const snapshot = await getSnapshot();
      const blob = await buildQhseReportArchive(selectedReports, snapshot, undefined, options);
      if (currentSignature.current === requestKey) downloadQhseBlob(blob, qhseReportArchiveFileName(snapshot));
    } catch { if (currentSignature.current === requestKey) setError('Impossible de préparer l’archive ZIP.'); }
    finally { setZipBusy(false); }
  }
  const editedReport = reports.find((r) => r.id === activeReport);
  const availability = useMemo(() => snapshot ? qhseGraphAvailability(activeReport, snapshot, baseOptions) : undefined, [activeReport, snapshot, baseOptions]);
  const previewFrame = readyPreview ? <KpiPdfPreview key={readyPreview.url} blob={readyPreview.blob} page={visiblePage} zoom={zoom} fitHeight={expanded ? 840 : 560} /> : <div className="kpi-preview-empty" role="status"><FileText size={32} /><strong>{disabled ? 'En attente des données du périmètre' : !selectedReports.length ? 'Choisissez un rapport' : prepared && !selectedPages.length ? 'Choisissez au moins une page' : error ? 'Aperçu indisponible' : 'Mise en page de votre rapport…'}</strong><span>{error || 'Le PDF affiché ici sera celui téléchargé à l’export.'}</span></div>;

  return <section className="qhse-composer" aria-label="Composition du rapport QHSE">
    <header className="kpi-workshop-head"><div><h2>Composer le rapport</h2><p>Choisissez les rapports, ajustez les graphiques et vérifiez les pages avant export.</p></div><div className="kpi-head-actions"><button className="kpi-button" disabled={disabled || !selectedReports.length} onClick={() => setRevision((r) => r + 1)}><RefreshCw size={15} />Actualiser l’aperçu</button><button className="kpi-button is-primary" disabled={!readyPreview} onClick={exportPdf}><Download size={16} />Exporter {prepared ? selectedPages.length : ''} page{selectedPages.length > 1 ? 's' : ''} en PDF</button></div></header>
    <div className="kpi-mobile-workshop"><button aria-pressed={mobilePanel === 'selection'} onClick={() => setMobilePanel('selection')}>Sélection et réglages</button><button aria-pressed={mobilePanel === 'preview'} onClick={() => setMobilePanel('preview')}>Aperçu {readyPreview ? `· ${selectedPages.length} page${selectedPages.length > 1 ? 's' : ''}` : ''}</button></div>
    <div className={`kpi-workshop-grid show-${mobilePanel}`}>
      <section className="kpi-panel kpi-report-selection" aria-label="Sélection et réglages du rapport">
        <div className="kpi-tabs" role="tablist" aria-label="Préparation du rapport"><button role="tab" aria-selected={tab === 'reports'} onClick={() => setTab('reports')}>Rapports <span>{reports.length}</span></button><button role="tab" aria-selected={tab === 'pages'} onClick={() => setTab('pages')}>Pages à exporter <span>{prepared ? selectedPages.length : '—'}</span></button></div>
        {tab === 'reports' ? <><div className="kpi-selection-actions"><span>{selectedReports.length} rapports sélectionnés</span><button onClick={() => setReportIds(reports.map((r) => r.id))}>Tout</button><button onClick={() => setReportIds([])}>Aucun</button></div>
          <div className="kpi-report-list">{QHSE_REPORT_FAMILIES.map((family) => {
            const group = reports.filter((r) => r.family === family);
            return group.length ? <fieldset key={family}><legend>{family}</legend>{group.map((report) => <div className={`kpi-report-row${activeReport === report.id ? ' is-active' : ''}`} key={report.id}>
              <input type="checkbox" aria-label={`Inclure ${report.title}`} checked={reportIds.includes(report.id)} onChange={(event) => setReportIds((ids) => event.target.checked ? [...ids, report.id] : ids.filter((id) => id !== report.id))} />
              <button aria-label={`Régler ${report.title}`} aria-pressed={activeReport === report.id} onClick={() => setActiveReport(report.id)} title={report.description}><span>{shortTitle(report)}</span><small>{prepared?.pages.filter((p) => p.reportId === report.id).length || '—'} p.</small><ChevronRight size={14} /></button>
            </div>)}</fieldset> : null;
          })}</div>
          {editedReport && <div className="kpi-report-settings"><h3><SlidersHorizontal size={15} />{shortTitle(editedReport)}</h3><QhseGraphOptions reportId={editedReport.id} value={options} availability={availability} disabled={disabled} onChange={setGraphOptions} /><p>Tendance : évolution observée. Prévision : mois futurs en pointillés. Les totaux restent réels.</p></div>}
        </> : <><div className="kpi-selection-actions"><span>{prepared ? `${selectedPages.length} / ${prepared.pages.length} pages` : 'Calcul des pages…'}</span><button disabled={!prepared} onClick={() => setExcluded({ scope: scopeKey, ids: [] })}>Toutes les pages</button><button disabled={!prepared} onClick={() => setExcluded({ scope: scopeKey, ids: prepared?.pages.map((p) => p.id) || [] })}>Aucune page</button></div>
          <div className="kpi-physical-pages">{prepared ? prepared.pages.map((p) => <label key={p.id}><input type="checkbox" checked={selectedPages.some((page) => page.id === p.id)} onChange={(e) => togglePage(p.id, e.target.checked)} /><span><strong>Page {p.number} · {p.reportTitle}</strong><small>Page {p.sourceIndex + 1} de ce rapport</small></span></label>) : <p>Les pages exactes apparaîtront après la mise en page.</p>}</div><p className="kpi-pages-note">Vous pouvez conserver une seule page. Le PDF final est renuméroté à partir de 1.</p></>}
      </section>
      <section className="kpi-panel kpi-preview-panel" aria-label="Aperçu avant export">
        <header><div><FileText size={17} /><strong>Aperçu du rapport</strong><span>{readyPreview ? `${selectedPages.length} page(s) · A4` : 'A4'}</span></div></header>
        <div className="kpi-preview-toolbar"><div><button className="kpi-button is-icon" aria-label="Page précédente" disabled={!readyPreview || visiblePage <= 1} onClick={() => setPage(visiblePage - 1)}><ChevronLeft size={16} /></button><span>Page {readyPreview ? visiblePage : '—'} / {prepared ? selectedPages.length : '—'}</span><button className="kpi-button is-icon" aria-label="Page suivante" disabled={!readyPreview || visiblePage >= selectedPages.length} onClick={() => setPage(visiblePage + 1)}><ChevronRight size={16} /></button></div><div><select aria-label="Zoom de l’aperçu" value={zoom} onChange={(e) => setZoom(e.target.value)}><option value="page-fit">Ajuster</option><option value="75">75 %</option><option value="100">100 %</option><option value="125">125 %</option></select><button className="kpi-button is-icon" aria-label="Agrandir l’aperçu" disabled={!readyPreview} onClick={() => setExpanded(true)}><Maximize2 size={16} /></button>{readyPreview && <a className="kpi-button is-icon" aria-label="Ouvrir le PDF dans un nouvel onglet" href={readyPreview.url} target="_blank" rel="noreferrer"><ExternalLink size={16} /></a>}</div></div>
        <div className="kpi-preview-canvas">{!expanded && previewFrame}</div>
        <footer><span role={error ? 'alert' : 'status'}>{error || (disabled ? 'Le périmètre a changé : actualisation en cours.' : !selectedReports.length ? 'Aucun rapport sélectionné.' : prepared && !selectedPages.length ? 'Aucune page sélectionnée.' : status)}</span></footer>
      </section>
    </div>
    <div className="kpi-workshop-foot"><span>Filtres communs à la synthèse et aux PDF · numérotation des pages automatique</span><button disabled={disabled || zipBusy || !selectedReports.length} onClick={() => void exportArchive()} title="Tous les rapports cochés, complets, dans des PDF séparés"><Archive size={14} />{zipBusy ? 'Préparation du ZIP…' : 'Rapports complets séparés (.zip)'}</button></div>
    {expanded && <KpiDialog title="Aperçu du rapport QHSE — agrandi" onClose={() => setExpanded(false)}><div className="kpi-preview-expanded">{previewFrame}</div></KpiDialog>}
  </section>;
}
