import { FileDown, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import {
  DEFAULT_FLEET_LIST_COLUMNS,
  FLEET_LIST_COLUMNS,
  type FleetListColumnKey,
  type FleetListLanguage,
} from './fleetList';
import type { FleetVessel } from './fleetQueries';
import './fleetListExportDialog.css';

const LANGUAGES = [
  { key: 'fr', label: 'Français' },
  { key: 'en', label: 'Anglais' },
] as const;

function toggleSelection<Key>(current: Key[], key: Key): Key[] {
  return current.includes(key) ? current.filter((selected) => selected !== key) : [...current, key];
}

export function FleetListExportDialog({ onClose, vessels }: { onClose: () => void; vessels: FleetVessel[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [vesselIds, setVesselIds] = useState(() => vessels.map((vessel) => vessel.id));
  const [columnKeys, setColumnKeys] = useState<FleetListColumnKey[]>(() => [...DEFAULT_FLEET_LIST_COLUMNS]);
  const [languageKeys, setLanguageKeys] = useState<FleetListLanguage[]>(['fr']);
  const [isExporting, setIsExporting] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; error: boolean } | null>(null);
  const selectedVessels = vessels.filter((vessel) => vesselIds.includes(vessel.id));
  const exportBoth = languageKeys.length === LANGUAGES.length;
  const canExport = selectedVessels.length > 0 && languageKeys.length > 0 && !isExporting;

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  async function exportFleet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canExport) return;

    setIsExporting(true);
    setFeedback(null);
    try {
      const { downloadFleetListPdfs } = await import('./fleetListPdf');
      const columns = FLEET_LIST_COLUMNS.filter(({ key }) => columnKeys.includes(key)).map(({ key }) => key);
      const languages = LANGUAGES.filter(({ key }) => languageKeys.includes(key)).map(({ key }) => key);
      await downloadFleetListPdfs(selectedVessels, columns, languages);
      setFeedback({ message: exportBoth ? 'Les deux PDF sont prêts dans l’archive ZIP.' : 'Le PDF est prêt.', error: false });
    } catch (error) {
      setFeedback({ message: error instanceof Error && error.message ? error.message : 'Impossible de générer le PDF de la flotte.', error: true });
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <dialog
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      className="fleet-dialog fleet-list-export"
      onCancel={(event) => {
        event.preventDefault();
        if (!isExporting) onClose();
      }}
      ref={dialog}
    >
      <form aria-busy={isExporting} onSubmit={exportFleet}>
        <header>
          <div>
            <FileDown aria-hidden="true" size={23} />
            <div>
              <h2 id={titleId}>Exporter la flotte</h2>
              <p id={descriptionId}>Choisissez les navires et les colonnes du tableau. Chaque PDF est au format A4 sur une page.</p>
            </div>
          </div>
          <button aria-label="Fermer la fenêtre" disabled={isExporting} onClick={onClose} type="button"><X aria-hidden="true" size={18} /></button>
        </header>

        <div className="fleet-list-export-body">
          <fieldset className="fleet-list-export-languages" disabled={isExporting}>
            <legend>Langues du PDF</legend>
            <div className="fleet-list-export-options">
              {LANGUAGES.map(({ key, label }) => (
                <label key={key}><input checked={languageKeys.includes(key)} onChange={() => setLanguageKeys((current) => toggleSelection(current, key))} type="checkbox" />{label}</label>
              ))}
            </div>
          </fieldset>

          <div className="fleet-list-export-selections">
            <fieldset disabled={isExporting}>
              <legend>Navires actifs</legend>
              <div className="fleet-list-export-controls">
                <p>{selectedVessels.length} / {vessels.length}</p>
                <button disabled={selectedVessels.length === vessels.length} onClick={() => setVesselIds(vessels.map((vessel) => vessel.id))} type="button">Tout sélectionner</button>
                <button disabled={!selectedVessels.length} onClick={() => setVesselIds([])} type="button">Tout désélectionner</button>
              </div>
              <div className="fleet-list-export-options">
                {vessels.map((vessel) => (
                  <label key={vessel.id}><input checked={vesselIds.includes(vessel.id)} onChange={() => setVesselIds((current) => toggleSelection(current, vessel.id))} type="checkbox" />{vessel.name}</label>
                ))}
              </div>
            </fieldset>

            <fieldset disabled={isExporting}>
              <legend>Caractéristiques</legend>
              <p className="fleet-list-export-note">Le nom du navire figure toujours dans le tableau.</p>
              <div className="fleet-list-export-controls">
                <p>{columnKeys.length} / {FLEET_LIST_COLUMNS.length}</p>
                <button disabled={columnKeys.length === FLEET_LIST_COLUMNS.length} onClick={() => setColumnKeys(FLEET_LIST_COLUMNS.map(({ key }) => key))} type="button">Tout sélectionner</button>
                <button disabled={!columnKeys.length} onClick={() => setColumnKeys([])} type="button">Tout désélectionner</button>
              </div>
              <div className="fleet-list-export-options is-columns">
                {FLEET_LIST_COLUMNS.map(({ key, labels }) => (
                  <label key={key}><input checked={columnKeys.includes(key)} onChange={() => setColumnKeys((current) => toggleSelection(current, key))} type="checkbox" />{labels.fr}</label>
                ))}
              </div>
            </fieldset>
          </div>
        </div>

        <footer>
          {feedback ? <p className={feedback.error ? 'form-error' : 'admin-success'} role={feedback.error ? 'alert' : 'status'}>{feedback.message}</p> : null}
          <button disabled={isExporting} onClick={onClose} type="button">Fermer</button>
          <button disabled={!canExport} type="submit">
            <FileDown aria-hidden="true" size={16} />
            {isExporting ? 'Génération…' : exportBoth ? 'Télécharger les PDF (.zip)' : 'Télécharger le PDF'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
