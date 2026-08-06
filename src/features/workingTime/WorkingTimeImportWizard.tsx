import type { SupabaseClient } from '@supabase/supabase-js';
import { CheckCircle2, FileSpreadsheet, LoaderCircle, ShieldAlert, Upload } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { RoleKey } from '../permissions/roles';
import {
  formatWorkingTimeImportPhases,
  parseWorkingTimeImportPhaseText,
  type WorkingTimeImportWorkbook,
} from './workingTimeExcelImportModel';
import {
  commitWorkingTimeImport,
  createWorkingTimeImportBatchAndUpload,
  fetchWorkingTimeImportPeople,
  previewWorkingTimeImport,
  sha256WorkingTimeImportFile,
  type WorkingTimeImportEditableRow,
  type WorkingTimeImportPerson,
  type WorkingTimeImportPreviewResult,
  type WorkingTimeImportRowStatus,
} from './workingTimeImportQueries';
import { workingTimeErrorMessage } from './workingTimeQueries';

interface WorkingTimeImportWizardProps {
  client: SupabaseClient;
  roles: RoleKey[];
  onImported?: () => Promise<void> | void;
  parseWorkbook?: (file: File) => Promise<WorkingTimeImportWorkbook>;
}

interface EditableRow extends WorkingTimeImportEditableRow {
  phaseText: string;
  localError: string;
  localWarning: string;
}

const TOTAL_MISMATCH_WARNING = 'Le total du classeur diffère des demi-heures détectées. Corrigez les phases ou excluez cette journée après le contrôle.';

const STATUS_LABELS: Record<WorkingTimeImportRowStatus, string> = {
  ready: 'Prête', corrected: 'Corrigée', excluded: 'Exclue', duplicate: 'Doublon',
  inconsistent: 'Incohérente', blocked_workflow: 'Workflow verrouillé',
  blocked_validated: 'Déjà validée', imported: 'Importée',
};

function normalizeName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z]+/g, ' ').trim().toLowerCase();
}

function formatHours(seconds: number): string {
  return `${(seconds / 3600).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} h`;
}

function phaseSeconds(phases: WorkingTimeImportEditableRow['phases']): number {
  return phases.reduce((total, phase) => total + (phase.endMinute - phase.startMinute) * 60, 0);
}

function totalMismatchWarning(reportedWorkSeconds: number | null, phases: WorkingTimeImportEditableRow['phases']): string {
  return reportedWorkSeconds !== null && reportedWorkSeconds !== phaseSeconds(phases) ? TOTAL_MISMATCH_WARNING : '';
}

function defaultParser(file: File): Promise<WorkingTimeImportWorkbook> {
  return import('./workingTimeExcelImport').then(async ({ parseWorkingTimeXlsm }) => parseWorkingTimeXlsm(await file.arrayBuffer(), file.name));
}

export function WorkingTimeImportWizard({ client, roles, onImported, parseWorkbook = defaultParser }: WorkingTimeImportWizardProps) {
  const canImport = roles.some((role) => role === 'admin' || role === 'armement');
  const [people, setPeople] = useState<WorkingTimeImportPerson[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [workbook, setWorkbook] = useState<WorkingTimeImportWorkbook | null>(null);
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [personId, setPersonId] = useState<number>(0);
  const [timezoneName, setTimezoneName] = useState('Europe/Paris');
  const [batchId, setBatchId] = useState<number | null>(null);
  const [preview, setPreview] = useState<WorkingTimeImportPreviewResult | null>(null);
  const [previewStale, setPreviewStale] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!canImport) return;
    let active = true;
    void fetchWorkingTimeImportPeople(client).then((items) => { if (active) setPeople(items); }).catch((caught) => { if (active) setError(workingTimeErrorMessage(caught)); });
    return () => { active = false; };
  }, [canImport, client]);

  const rowStatus = useMemo(() => new Map(preview?.rows.map((row) => [row.localWorkDate, row])), [preview]);
  const localErrors = rows.filter((row) => row.localError).length;
  const localWarnings = rows.filter((row) => row.localWarning).length;
  const canCommit = Boolean(preview && !previewStale && preview.summary.readyRows > 0 && preview.summary.inconsistentRows === 0 && !busy);
  const canControl = Boolean(personId && !localErrors && !busy && preview?.status !== 'imported');
  const actionMessage = !personId
    ? 'Sélectionnez la personne RH associée avant de lancer le contrôle.'
    : localErrors
      ? `Corrigez ${localErrors} erreur(s) de format dans les phases de travail.`
      : previewStale
        ? 'Des corrections ont été faites : relancez le contrôle serveur.'
        : preview?.summary.inconsistentRows
          ? `${preview.summary.inconsistentRows} journée(s) incohérente(s) : corrigez les phases ou excluez-les, puis relancez le contrôle.`
          : localWarnings
            ? `${localWarnings} écart(s) de total seront analysés par le serveur. Vous pouvez lancer le contrôle.`
            : 'Les journées déjà validées ne seront jamais remplacées.';

  if (!canImport) return null;

  const markChanged = () => {
    setPreviewStale(Boolean(preview));
    setSuccess('');
  };

  const selectFile = async (selected: File | null) => {
    setFile(selected);
    setWorkbook(null);
    setRows([]);
    setPersonId(0);
    setBatchId(null);
    setPreview(null);
    setPreviewStale(false);
    setError('');
    setSuccess('');
    if (!selected) return;
    if (!selected.name.toLowerCase().endsWith('.xlsm') || selected.size > 20 * 1024 * 1024) {
      setError('Le fichier doit être un classeur XLSM de 20 Mo maximum.');
      return;
    }
    setBusy(true);
    try {
      const parsed = await parseWorkbook(selected);
      const match = people.find((person) => normalizeName(person.name) === normalizeName(parsed.detectedPersonName));
      setWorkbook(parsed);
      setPersonId(match?.id || 0);
      setRows(parsed.rows.map((row) => ({
        date: row.date, sheet: row.sourceSheet, row: row.sourceRow,
        detectedPhases: row.detectedPhases, phases: row.detectedPhases,
        reportedWorkSeconds: row.reportedWorkSeconds, captainName: row.captainName,
        vesselName: row.vesselName, imoNumber: row.imoNumber, flagState: row.flagState,
        comment: row.sourceComment, userNote: '', excluded: false,
        phaseText: formatWorkingTimeImportPhases(row.detectedPhases),
        localError: '',
        localWarning: totalMismatchWarning(row.reportedWorkSeconds, row.detectedPhases),
      })));
    } catch (caught) {
      setError(workingTimeErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const updatePhaseText = (index: number, value: string) => {
    setRows((current) => current.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      try {
        const phases = parseWorkingTimeImportPhaseText(value);
        return { ...row, phaseText: value, phases, localError: '', localWarning: totalMismatchWarning(row.reportedWorkSeconds, phases) };
      } catch (caught) {
        return { ...row, phaseText: value, localError: workingTimeErrorMessage(caught) };
      }
    }));
    markChanged();
  };

  const controlImport = async () => {
    if (!file || !workbook || !personId || localErrors) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      let targetBatchId = batchId;
      if (!targetBatchId) {
        const hash = await sha256WorkingTimeImportFile(file);
        targetBatchId = (await createWorkingTimeImportBatchAndUpload(client, file, hash)).batchId;
        setBatchId(targetBatchId);
      }
      const result = await previewWorkingTimeImport(client, { batchId: targetBatchId, personId, timezoneName, workbook, rows });
      setPreview(result);
      setPreviewStale(false);
      setSuccess('Contrôle serveur terminé. Vérifiez les statuts avant de valider l’import.');
    } catch (caught) {
      setError(workingTimeErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const commitImport = async () => {
    if (!batchId || !canCommit) return;
    setBusy(true);
    setError('');
    try {
      const summary = await commitWorkingTimeImport(client, batchId);
      setSuccess(`${summary.readyRows} journée(s) importée(s). Les doublons et journées verrouillées ont été conservés sans modification.`);
      setPreview((current) => current ? { ...current, status: 'imported', summary } : current);
      await onImported?.();
    } catch (caught) {
      setError(workingTimeErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="working-time-import" aria-labelledby="working-time-import-title">
      <header className="working-time-import-header">
        <span><FileSpreadsheet aria-hidden="true" size={21} /></span>
        <div><p>Administration</p><h2 id="working-time-import-title">Import annuel XLSM</h2><small>Assistant sécurisé en 8 étapes · macros jamais exécutées</small></div>
      </header>

      <ol className="working-time-import-steps" aria-label="Étapes de l’import">
        {['Dépôt', 'Détection', 'Aperçu', 'Totaux', 'Doublons', 'Corrections', 'Validation', 'Traçabilité'].map((label, index) => <li className={workbook && index < 6 || preview && index < 7 || preview?.status === 'imported' ? 'is-done' : ''} key={label}>{index + 1}<span>{label}</span></li>)}
      </ol>

      <div className="working-time-import-controls">
        <label className="working-time-import-drop">
          <Upload aria-hidden="true" size={23} />
          <span>{file?.name || 'Déposer le classeur annuel XLSM'}</span>
          <small>20 Mo maximum · le code VBA n’est jamais lu ni exécuté</small>
          <input accept=".xlsm,application/vnd.ms-excel.sheet.macroEnabled.12" onChange={(event) => void selectFile(event.target.files?.[0] || null)} type="file" />
        </label>
        {workbook ? <div className="working-time-import-detection"><strong>{workbook.detectedPersonName}</strong><span>Année proposée {workbook.detectedYear} · {workbook.rows.length} journées · {formatHours(workbook.detectedWorkSeconds)}</span><span className="is-safe"><ShieldAlert aria-hidden="true" size={15} />Macro {workbook.macroPresent ? 'détectée et neutralisée' : 'absente'}</span></div> : null}
        {workbook ? <label>Personne RH<select aria-label="Personne RH associée" onChange={(event) => { setPersonId(Number(event.target.value)); markChanged(); }} value={personId}><option value={0}>À associer…</option>{people.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.functionLabel}</option>)}</select></label> : null}
        {workbook ? <label>Fuseau horaire<input onChange={(event) => { setTimezoneName(event.target.value); markChanged(); }} value={timezoneName} /></label> : null}
      </div>

      {workbook?.warnings.map((warning) => <p className="working-time-message is-warning" key={warning} role="alert">{warning}</p>)}

      {error ? <p className="working-time-message is-error" role="alert">{error}</p> : null}
      {success ? <p className="working-time-message is-success" role="status"><CheckCircle2 aria-hidden="true" size={17} />{success}</p> : null}

      {rows.length ? <div className="working-time-import-table-wrap"><table className="working-time-import-table"><thead><tr><th>Date</th><th>Phases de travail</th><th>Total détecté / déclaré</th><th>Navire</th><th>Décision</th></tr></thead><tbody>{rows.map((row, index) => {
        const server = rowStatus.get(row.date);
        return <tr className={row.localError ? 'has-error' : row.localWarning ? 'has-warning' : ''} key={`${row.sheet}-${row.row}`}><td><strong>{row.date}</strong><small>{row.sheet} · ligne {row.row}</small></td><td><input aria-invalid={Boolean(row.localError)} aria-label={`Phases du ${row.date}`} disabled={row.excluded || preview?.status === 'imported'} onChange={(event) => updatePhaseText(index, event.target.value)} value={row.phaseText} />{row.localError ? <small className="is-error">{row.localError}</small> : null}{row.localWarning ? <small className="is-warning">{row.localWarning}</small> : null}</td><td>{formatHours(phaseSeconds(row.phases))}<small>déclaré : {row.reportedWorkSeconds === null ? '—' : formatHours(row.reportedWorkSeconds)}</small></td><td>{server?.vesselName || row.vesselName || 'Planning'}<small>{server?.watchGroup || 'Bordée résolue au contrôle'}</small></td><td><label className="working-time-import-exclude"><input checked={row.excluded} disabled={preview?.status === 'imported'} onChange={(event) => { setRows((current) => current.map((item, rowIndex) => rowIndex === index ? { ...item, excluded: event.target.checked } : item)); markChanged(); }} type="checkbox" />Exclure</label>{server ? <span className={`working-time-import-status is-${server.status}`}>{STATUS_LABELS[server.status]}</span> : null}{server?.issueCodes.length ? <small>{server.issueCodes.join(', ')}</small> : null}</td></tr>;
      })}</tbody></table></div> : null}

      {preview ? <div className="working-time-import-summary"><span><strong>{preview.summary.readyRows}</strong> à importer</span><span><strong>{preview.summary.duplicateRows}</strong> doublons</span><span><strong>{preview.summary.blockedRows}</strong> verrouillées</span><span><strong>{preview.summary.inconsistentRows}</strong> incohérentes</span><span><strong>{formatHours(preview.summary.effectiveWorkSeconds)}</strong> retenues</span></div> : null}

      {workbook ? <footer className="working-time-import-actions"><p id="working-time-import-action-help">{actionMessage}</p><button aria-describedby="working-time-import-action-help" disabled={!canControl} onClick={() => void controlImport()} type="button">{busy ? <LoaderCircle aria-hidden="true" className="is-spinning" size={17} /> : null}Contrôler l’import</button><button aria-describedby="working-time-import-action-help" className="is-primary" disabled={!canCommit} onClick={() => void commitImport()} type="button">Valider l’import</button></footer> : null}
    </section>
  );
}
