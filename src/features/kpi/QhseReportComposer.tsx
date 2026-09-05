import { useEffect, useState } from 'react';
import { Download, FileCheck2 } from 'lucide-react';
import type { QhseReportDefinition } from './qhseReportCatalog';
import type { QhseReportOptions, QhseReportSnapshot } from './qhseReportData';
import { composeQhseReport, prepareQhseReport, type PreparedQhseReport } from './qhseReportAssembly';
import { downloadQhseBlob } from './qhseReportPdf';

interface Props {
  reports: readonly QhseReportDefinition[];
  options: QhseReportOptions;
  scopeKey: string;
  disabled: boolean;
  getSnapshot(): Promise<QhseReportSnapshot>;
  onBusy(busy: boolean): void;
}

export function QhseReportComposer({ reports, options, scopeKey, disabled, getSnapshot, onBusy }: Props) {
  const [prepared, setPrepared] = useState<PreparedQhseReport | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [status, setStatus] = useState('');
  const [working, setWorking] = useState(false);
  const [preview, setPreview] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const signature = `${scopeKey}:${reports.map((r) => r.id).join(',')}:${JSON.stringify(options)}`;
  useEffect(() => { setPrepared(null); setSelected([]); setPreview(null); setStatus(''); }, [signature]);
  useEffect(() => {
    if (!preview) { setPreviewUrl(''); return; }
    const url = URL.createObjectURL(preview); setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [preview]);

  async function prepare() {
    setWorking(true); onBusy(true); setStatus('Lecture des données Supabase…');
    try {
      const result = await prepareQhseReport(reports, await getSnapshot(), options, (done, total) => setStatus(`Mise en page : ${done} / ${total} rapports`));
      setPrepared(result); setSelected(result.pages.map((p) => p.id));
      setPreview(await composeQhseReport(result, result.pages.map((p) => p.id)));
      setStatus(`${result.pages.length} pages produites. Vous pouvez maintenant n’en conserver qu’une seule.`);
    } catch { setStatus('Impossible de préparer le rapport. Vérifiez les accès aux données et réessayez.'); }
    finally { setWorking(false); onBusy(false); }
  }
  async function exportSelection() {
    if (!prepared) return;
    setWorking(true); onBusy(true);
    try {
      const blob = await composeQhseReport(prepared, selected);
      setPreview(blob); downloadQhseBlob(blob, `Rapport-QHSE-${selected.length}-page${selected.length > 1 ? 's' : ''}.pdf`);
      setStatus(`${selected.length} page(s) exportée(s), numérotée(s) à partir de 1.`);
    } catch { setStatus('Impossible de générer la sélection de pages.'); }
    finally { setWorking(false); onBusy(false); }
  }
  return <section className="qhse-composer" aria-label="Composition du rapport QHSE">
    <header><div><h3>Composer mon rapport</h3><p>Cochez les rapports ci-dessous, réglez chaque graphique, puis choisissez les pages exactes à conserver.</p></div>
      <button disabled={disabled || working || !reports.length} onClick={() => void prepare()}><FileCheck2 size={17} />Préparer {reports.length} rapport(s)</button></header>
    {status && <p role="status">{status}</p>}
    {prepared && <>
      <div className="qhse-composer-actions"><strong>{selected.length} / {prepared.pages.length} pages sélectionnées</strong>
        <button disabled={disabled || working} onClick={() => setSelected(prepared.pages.map((p) => p.id))}>Toutes les pages</button>
        <button disabled={disabled || working} onClick={() => setSelected([])}>Aucune page</button>
        <button disabled={disabled || working || !selected.length} onClick={() => void exportSelection()}><Download size={16} />Exporter {selected.length} page(s) en PDF</button>
      </div>
      <fieldset className="qhse-composer-pages" disabled={disabled || working}><legend>Pages réellement générées</legend>{prepared.pages.map((page) => <label key={page.id}>
        <input type="checkbox" checked={selected.includes(page.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, page.id] : current.filter((id) => id !== page.id))} />
        <span><strong>Page {page.number}</strong> · {page.reportTitle}<small>Page {page.sourceIndex + 1} de ce rapport</small></span>
      </label>)}</fieldset>
      {previewUrl && <details className="qhse-composer-preview"><summary>Aperçu du dernier PDF préparé / exporté</summary><iframe title="Aperçu du rapport QHSE" src={previewUrl} /><a href={previewUrl} target="_blank" rel="noreferrer">Ouvrir le PDF dans un nouvel onglet</a></details>}
    </>}
  </section>;
}
