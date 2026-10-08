import { ChevronDown, ChevronRight, Download, FileText, Folder, FolderOpen, ListChecks } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AppDialog } from '../../components/AppDialog';
import { procedureAppliesToVessel, selectProcedureList } from './procedureList';
import { CHAPTERS, chapterKey, type ProcedureChapterKey } from './procedureChapters';
import { downloadProcedureListPdf } from './procedureListPdf';
import { getProcedureStatusLabel, type ProcedureRecord, type ProcedureStatus } from './procedureQueries';
import './procedureList.css';

interface ProcedureListDialogProps {
  records: ProcedureRecord[];
  vessels: string[];
  initialVessel: string;
  library: 'sources' | 'published';
  onClose: () => void;
}

export function ProcedureListDialog({ records, vessels, initialVessel, library, onClose }: ProcedureListDialogProps) {
  const [vessel, setVessel] = useState(initialVessel);
  const [status, setStatus] = useState<ProcedureStatus | ''>('');
  const [chapter, setChapter] = useState<ProcedureChapterKey | ''>('');
  const [excludedIds, setExcludedIds] = useState<Set<number>>(() => new Set());
  const [collapsedChapters, setCollapsedChapters] = useState<Set<ProcedureChapterKey>>(() => new Set());
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState('');
  const eligible = useMemo(() => records.filter((record) => procedureAppliesToVessel(record, vessel)
    && (!status || record.status === status)
    && (!chapter || chapterKey(record.ismChapter) === chapter)), [records, vessel, status, chapter]);
  const selected = selectProcedureList(eligible, vessel, excludedIds);
  const groups = useMemo(() => CHAPTERS.map(([key, label]) => ({
    key, label,
    documents: eligible.filter(record => chapterKey(record.ismChapter) === key)
      .sort((left, right) => left.procedureCode.localeCompare(right.procedureCode, 'fr', { numeric: true }) || left.title.localeCompare(right.title, 'fr')),
  })).filter(group => group.documents.length > 0), [eligible]);

  function toggleChapter(key: ProcedureChapterKey) {
    setCollapsedChapters(current => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function setIncluded(ids: number[], included: boolean) {
    setExcludedIds((current) => {
      const next = new Set(current);
      ids.forEach((id) => { if (included) next.delete(id); else next.add(id); });
      return next;
    });
  }

  async function exportList() {
    setIsExporting(true); setError('');
    try { await downloadProcedureListPdf({ records: selected, vessel, library }); }
    catch { setError('Impossible de générer la liste PDF. Réessayez.'); }
    finally { setIsExporting(false); }
  }

  return <AppDialog
    title="Générer une liste des documents" eyebrow="Procédures QHSE" size="xl" icon={<ListChecks size={22} />}
    description="Filtrez par chapitre ISM, navire et statut, puis cochez les documents à intégrer. Les procédures sans navire sont communes à toute la flotte."
    isBusy={isExporting} onClose={onClose}
    footer={<><span aria-live="polite">{selected.length} document(s) sélectionné(s)</span><div className="app-dialog__actions">
      <button className="procedure-button-secondary" disabled={isExporting} onClick={onClose} type="button">Fermer</button>
      <button className="procedure-button-primary" disabled={!selected.length || isExporting} onClick={() => void exportList()} type="button"><Download size={16} />{isExporting ? 'Génération…' : 'Télécharger la liste PDF'}</button>
    </div></>}
  >
    <div className="procedure-list-controls">
      <label className="procedure-list-chapter">ISM Chapitre<select disabled={isExporting} value={chapter} onChange={(event) => setChapter(event.target.value as ProcedureChapterKey | '')}>
        <option value="">Tous les chapitres</option>{CHAPTERS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      <label>Navire de la liste<select disabled={isExporting} value={vessel} onChange={(event) => setVessel(event.target.value)}>
        <option value="">Tous les navires</option>{vessels.map((name) => <option key={name}>{name}</option>)}
      </select></label>
      <label>Statut<select disabled={isExporting} value={status} onChange={(event) => setStatus(event.target.value as ProcedureStatus | '')}>
        <option value="">Tous les statuts</option>
        {(['draft', 'review', 'approved', 'published', 'archived', 'unknown'] as const).map((value) => <option key={value} value={value}>{getProcedureStatusLabel(value)}</option>)}
      </select></label>
      <p>{library === 'sources' ? 'Documents de travail privés' : 'PDF publiés'} · {eligible.length} document(s) disponible(s)</p>
      <button className="procedure-button-secondary" disabled={!eligible.length || isExporting} onClick={() => setIncluded(eligible.map((record) => record.id), true)} type="button">Tout sélectionner</button>
      <button className="procedure-button-secondary" disabled={!selected.length || isExporting} onClick={() => setIncluded(eligible.map((record) => record.id), false)} type="button">Tout désélectionner</button>
    </div>
    {error ? <p role="alert" className="form-error">{error}</p> : null}
    {groups.length ? <div className="procedure-list-tree-controls" role="group" aria-label="Affichage des chapitres ISM">
      <span>{groups.length} chapitre(s) ISM</span>
      <button className="procedure-button-secondary" type="button" disabled={isExporting || groups.every(group => !collapsedChapters.has(group.key))} onClick={() => setCollapsedChapters(new Set())}>Tout déplier</button>
      <button className="procedure-button-secondary" type="button" disabled={isExporting || groups.every(group => collapsedChapters.has(group.key))} onClick={() => setCollapsedChapters(new Set(groups.map(group => group.key)))}>Tout replier</button>
    </div> : null}
    {eligible.length ? <div className="procedure-list-table-wrap"><table className="procedure-list-table">
      <thead><tr><th scope="col">Inclure</th><th scope="col">Document</th><th scope="col">Navire</th><th scope="col">Version</th><th scope="col">Statut</th></tr></thead>
      {groups.map(group => <tbody key={group.key} aria-label={group.label}>
        <tr><th className="procedure-list-chapter-heading" scope="rowgroup" colSpan={5}>
          <button type="button" aria-expanded={!collapsedChapters.has(group.key)} disabled={isExporting} onClick={() => toggleChapter(group.key)}>
            {collapsedChapters.has(group.key) ? <ChevronRight aria-hidden="true" size={16} /> : <ChevronDown aria-hidden="true" size={16} />}
            {collapsedChapters.has(group.key) ? <Folder aria-hidden="true" size={17} /> : <FolderOpen aria-hidden="true" size={17} />}
            <span className="procedure-list-chapter-name">{group.label}</span>
            <span className="procedure-list-chapter-count">{group.documents.length} document(s)</span>
          </button>
        </th></tr>
        {!collapsedChapters.has(group.key) ? group.documents.map((record) => <tr key={record.id}>
          <td><input aria-label={`Inclure ${record.title}`} type="checkbox" disabled={isExporting} checked={!excludedIds.has(record.id)} onChange={(event) => setIncluded([record.id], event.target.checked)} /></td>
          <td className="procedure-list-document"><div className="procedure-list-document-branch"><FileText aria-hidden="true" size={14} /><span title={`${record.procedureCode || record.documentNumber || 'Sans référence'} ${record.title}`}><strong>{record.procedureCode || record.documentNumber || 'Sans référence'}</strong>{' '}{record.title}</span></div></td>
          <td>{record.vesselName.trim() || 'Toute la flotte'}</td>
          <td>{record.versionLabel || record.revisionLabel || '-'}</td>
          <td>{getProcedureStatusLabel(record.status)}</td>
        </tr>) : null}
      </tbody>)}
    </table></div> : <p className="procedure-list-empty">Aucun document ne correspond aux filtres sélectionnés.</p>}
  </AppDialog>;
}
