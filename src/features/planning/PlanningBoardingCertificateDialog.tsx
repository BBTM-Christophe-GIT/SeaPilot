import { ShipWheel, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { formatPlanningPerson } from './planningModel';
import { planningErrorMessage } from './planningErrors';
import type { BoardingCertificateFormat } from './planningBoardingCertificate';
import type { PlanningOverview } from './planningQueries';

interface VesselOption {
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

function VesselMultiSelect({
  options,
  selectedIds,
  onChange,
}: {
  options: VesselOption[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
}) {
  const allSelected = options.length > 0 && selectedIds.length === options.length;
  const summary = allSelected
    ? 'Tous les navires'
    : `${selectedIds.length} navire${selectedIds.length > 1 ? 's' : ''} sélectionné${selectedIds.length > 1 ? 's' : ''}`;

  function toggle(id: number) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((value) => value !== id) : [...selectedIds, id]);
  }

  return (
    <fieldset className="planning-export-multiselect">
      <legend>Navires</legend>
      <details>
        <summary>{summary}</summary>
        <div>
          <label className="is-all">
            <input
              checked={allSelected}
              onChange={(event) => onChange(event.target.checked ? options.map((option) => option.id) : [])}
              type="checkbox"
            />
            Tous les navires
          </label>
          {options.map((option) => (
            <label key={option.id}>
              <input checked={selectedIds.includes(option.id)} onChange={() => toggle(option.id)} type="checkbox" />
              {option.label}
            </label>
          ))}
        </div>
      </details>
    </fieldset>
  );
}

export function PlanningBoardingCertificateDialog({
  onClose,
  overview,
}: {
  onClose: () => void;
  overview: PlanningOverview;
}) {
  const people = useMemo(() => overview.people
    .map((person) => ({ id: person.id, label: formatPlanningPerson(person) }))
    .sort((left, right) => left.label.localeCompare(right.label, 'fr')), [overview.people]);
  const vessels = useMemo<VesselOption[]>(() => overview.vessels
    .map((vessel) => ({ id: vessel.id, label: vessel.acronym ? `${vessel.name} (${vessel.acronym})` : vessel.name }))
    .sort((left, right) => left.label.localeCompare(right.label, 'fr')), [overview.vessels]);
  const [personId, setPersonId] = useState('');
  const [selectedVesselIds, setSelectedVesselIds] = useState<number[]>(() => vessels.map((vessel) => vessel.id));
  const [format, setFormat] = useState<BoardingCertificateFormat>('pdf');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null);
  const canGenerate = Boolean(personId) && selectedVesselIds.length > 0 && !saving;

  async function runExport(event: FormEvent) {
    event.preventDefault();
    if (!canGenerate) return;
    setSaving(true);
    setFeedback(null);
    try {
      const result = await import('./planningBoardingCertificate').then(({ generateBoardingCertificate }) => generateBoardingCertificate(
        format,
        overview,
        { personId: Number(personId), vesselIds: selectedVesselIds },
      ));
      downloadBlob(result.blob, result.fileName);
      setFeedback({ text: `Attestation ${format === 'docx' ? 'Word' : 'PDF'} générée.`, error: false });
    } catch (error) {
      setFeedback({ text: planningErrorMessage(error, 'Impossible de générer l’attestation.'), error: true });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="planning-dialog-backdrop" role="presentation">
      <section aria-label="Attestation d'armement" aria-modal="true" className="planning-dialog planning-export-dialog planning-boarding-certificate-dialog" role="dialog">
        <button aria-label="Fermer" className="planning-export-close" onClick={onClose} type="button"><X aria-hidden="true" size={18} /></button>
        <form onSubmit={runExport}>
          <div className="planning-export-intro">
            <ShipWheel aria-hidden="true" size={31} />
            <div><h2>Attestation d'armement</h2><p>Toutes les périodes « En Mer » enregistrées pour le marin et les navires sélectionnés sont utilisées.</p></div>
          </div>
          <div className="planning-export-grid planning-boarding-certificate-grid">
            <label>Marin<select aria-label="Marin" onChange={(event) => setPersonId(event.target.value)} required value={personId}><option value="">Choisir un marin</option>{people.map((person) => <option key={person.id} value={person.id}>{person.label}</option>)}</select></label>
            <VesselMultiSelect onChange={setSelectedVesselIds} options={vessels} selectedIds={selectedVesselIds} />
            <label>Format<select aria-label="Format" onChange={(event) => setFormat(event.target.value as BoardingCertificateFormat)} value={format}><option value="pdf">PDF</option><option value="docx">Word (.docx)</option></select></label>
          </div>
          {!personId || !selectedVesselIds.length ? <p className="planning-export-feedback is-error" role="alert">Sélectionnez un marin et au moins un navire.</p> : null}
          {feedback ? <p className={`planning-export-feedback${feedback.error ? ' is-error' : ''}`} role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p> : null}
          <footer><button className="is-secondary" onClick={onClose} type="button">Annuler</button><button disabled={!canGenerate} type="submit">{saving ? 'Génération…' : 'Générer l’attestation'}</button></footer>
        </form>
      </section>
    </div>
  );
}
