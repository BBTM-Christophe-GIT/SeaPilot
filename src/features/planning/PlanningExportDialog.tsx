import type { SupabaseClient } from '@supabase/supabase-js';
import { Download, RefreshCw, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { formatPlanningPerson } from './planningModel';
import { formatPlanningDate } from './planningDates';
import { planningErrorMessage } from './planningErrors';
import { buildPlanningWorkRestChecks, type PlanningP13Data } from './planningP13';
import { fetchPlanningP13Data } from './planningP13Queries';
import type { PlanningExportFormat, PlanningExportKind } from './planningP13Exports';
import type { PlanningOverview } from './planningQueries';

const EMPTY_DATA: PlanningP13Data = {
  policies: [],
  notifications: [],
  dependencies: [],
  p12: { absences: [], conflictCases: [], conflictHistory: [], matrices: [] },
};

interface ExportOption {
  id: number;
  label: string;
}

function downloadBlob(blob: Blob, fileName: string): void {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(link.href);
}

function ExportMultiSelect({
  allLabel,
  label,
  options,
  selectedIds,
  onChange,
}: {
  allLabel: string;
  label: string;
  options: ExportOption[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
}) {
  const allSelected = options.length > 0 && selectedIds.length === options.length;
  const summary = allSelected ? allLabel : `${selectedIds.length} sélectionné${selectedIds.length > 1 ? 's' : ''}`;

  function toggle(id: number) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((value) => value !== id) : [...selectedIds, id]);
  }

  return (
    <fieldset className="planning-export-multiselect">
      <legend>{label}</legend>
      <details>
        <summary>{summary}</summary>
        <div>
          <label className="is-all">
            <input checked={allSelected} onChange={(event) => onChange(event.target.checked ? options.map((option) => option.id) : [])} type="checkbox" />
            {allLabel}
          </label>
          {options.map((option) => (
            <label key={option.id}>
              <input
                checked={selectedIds.includes(option.id)}
                onChange={() => toggle(option.id)}
                type="checkbox"
              />
              {option.label}
            </label>
          ))}
        </div>
      </details>
    </fieldset>
  );
}

export function PlanningExportDialog({
  client,
  onClose,
  overview,
  range,
}: {
  client: SupabaseClient;
  onClose: () => void;
  overview: PlanningOverview;
  range: { start: string; end: string };
}) {
  const people = useMemo<ExportOption[]>(() => overview.people
    .map((person) => ({ id: person.id, label: formatPlanningPerson(person) }))
    .sort((left, right) => left.label.localeCompare(right.label, 'fr')), [overview.people]);
  const vessels = useMemo<ExportOption[]>(() => overview.vessels
    .map((vessel) => ({ id: vessel.id, label: vessel.acronym ? `${vessel.name} (${vessel.acronym})` : vessel.name }))
    .sort((left, right) => left.label.localeCompare(right.label, 'fr')), [overview.vessels]);
  const [startsOn, setStartsOn] = useState(range.start);
  const [endsOn, setEndsOn] = useState(range.end);
  const [selectedPersonIds, setSelectedPersonIds] = useState<number[]>(() => people.map((person) => person.id));
  const [selectedVesselIds, setSelectedVesselIds] = useState<number[]>(() => vessels.map((vessel) => vessel.id));
  const [exportKind, setExportKind] = useState<PlanningExportKind>('schedule');
  const [exportFormat, setExportFormat] = useState<PlanningExportFormat>('xlsx');
  const [data, setData] = useState<PlanningP13Data>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    let active = true;
    void fetchPlanningP13Data(client)
      .then((result) => { if (active) setData(result); })
      .catch((error) => { if (active) setDataError(planningErrorMessage(error, 'Impossible de préparer les exports avancés.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client]);

  const checks = useMemo(
    () => buildPlanningWorkRestChecks(overview, data.policies, { start: startsOn, end: endsOn }),
    [data.policies, endsOn, overview, startsOn],
  );
  const requiresP13Data = exportKind === 'anomalies' || exportKind === 'work_rest';
  const validPersonSelection = selectedPersonIds.length > 0;
  const canGenerate = !saving && startsOn <= endsOn && validPersonSelection && selectedVesselIds.length > 0
    && (!requiresP13Data || (!loading && !dataError));

  async function runExport(event: FormEvent) {
    event.preventDefault();
    if (!canGenerate) return;
    setSaving(true);
    setFeedback(null);
    try {
      const result = await import('./planningP13Exports').then(({ generatePlanningExport }) => generatePlanningExport(
          exportKind,
          exportFormat,
          { overview, data, checks, startsOn, endsOn, personIds: selectedPersonIds, vesselIds: selectedVesselIds },
        ));
      downloadBlob(result.blob, result.fileName);
      setFeedback({ text: `Export ${exportFormat.toUpperCase()} généré.`, error: false });
    } catch (error) {
      setFeedback({ text: planningErrorMessage(error, 'Impossible de générer l’export.'), error: true });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="planning-dialog-backdrop" role="presentation">
      <section aria-label="Exports métier" aria-modal="true" className="planning-dialog planning-export-dialog" role="dialog">
        <button aria-label="Fermer" className="planning-export-close" onClick={onClose} type="button"><X aria-hidden="true" size={18} /></button>
        <form onSubmit={runExport}>
          <div className="planning-export-intro">
            <Download aria-hidden="true" size={31} />
            <div><h2>Exports métier</h2><p>Période sélectionnée : {formatPlanningDate(startsOn)} – {formatPlanningDate(endsOn)}.</p></div>
          </div>
          <div className="planning-export-grid">
            <label>Du<input max={endsOn} onChange={(event) => setStartsOn(event.target.value)} required type="date" value={startsOn} /></label>
            <label>Au<input min={startsOn} onChange={(event) => setEndsOn(event.target.value)} required type="date" value={endsOn} /></label>
            <ExportMultiSelect allLabel="Tous les marins" label="Marins" onChange={setSelectedPersonIds} options={people} selectedIds={selectedPersonIds} />
            <ExportMultiSelect allLabel="Tous les navires" label="Navires" onChange={setSelectedVesselIds} options={vessels} selectedIds={selectedVesselIds} />
            <label>Contenu<select onChange={(event) => setExportKind(event.target.value as PlanningExportKind)} value={exportKind}><option value="schedule">Planning complet</option><option value="sailor">Exporter un marin</option><option value="crew_list">Liste d’équipage</option><option value="handover_sheet">Feuille de relève</option><option value="anomalies">Anomalies</option><option value="work_rest">Travail et repos</option></select></label>
            <label>Format<select onChange={(event) => setExportFormat(event.target.value as PlanningExportFormat)} value={exportFormat}><option value="xlsx">Excel (.xlsx)</option><option value="pdf">PDF</option><option value="ics">Calendrier (.ics)</option></select></label>
          </div>
          {loading && requiresP13Data ? <p className="planning-export-feedback" role="status"><RefreshCw className="is-spinning" size={16} />Préparation des données…</p> : null}
          {dataError && requiresP13Data ? <p className="planning-export-feedback is-error" role="alert">{dataError}</p> : null}
          {feedback ? <p className={`planning-export-feedback${feedback.error ? ' is-error' : ''}`} role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p> : null}
          {!validPersonSelection || !selectedVesselIds.length ? <p className="planning-export-feedback is-error" role="alert">Sélectionnez au moins un marin et un navire.</p> : null}
          <footer><button className="is-secondary" onClick={onClose} type="button">Annuler</button><button disabled={!canGenerate} type="submit">{saving ? 'Génération…' : 'Générer l’export'}</button></footer>
        </form>
      </section>
    </div>
  );
}
