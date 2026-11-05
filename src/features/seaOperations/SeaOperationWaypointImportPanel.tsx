import { Upload } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { formatSeaLatitude, formatSeaLongitude } from './seaOperationCoordinates';
import { parseSeaOperationWaypointImport, SEA_OPERATION_WAYPOINT_IMPORT_MAX_BYTES,
  type SeaOperationImportedWaypoint, type SeaOperationWaypointImportSource, type SeaOperationWaypointImportTarget,
  seaOperationImportedZoneError } from './seaOperationWaypointImport';
import './seaOperationWaypointImport.css';

interface Props {
  disabled: boolean;
  existingCount: number;
  destinationLabel?: string;
  onImport: (points: SeaOperationImportedWaypoint[], target: SeaOperationWaypointImportTarget, zoneName?: string) => boolean;
  children?: (controls: { trigger: ReactNode; panel: ReactNode }) => ReactNode;
}
interface ImportState {
  open: boolean; loading: boolean; filename: string; sources: SeaOperationWaypointImportSource[];
  sourceId: string; target: SeaOperationWaypointImportTarget | ''; zoneName: string; error: string;
}
const emptyState: ImportState = { open: false, loading: false, filename: '', sources: [], sourceId: '', target: '', zoneName: '', error: '' };

function readGpxFile(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Le fichier GPX n’a pas pu être lu. Réessayez.'));
    reader.onabort = () => reject(new Error('Lecture du fichier GPX annulée.'));
    reader.readAsText(file);
  });
}

export function SeaOperationWaypointImportPanel({ disabled, existingCount, destinationLabel = 'la fiche', onImport, children }: Props) {
  const [state, setState] = useState<ImportState>(emptyState);
  const panelId = useId();
  const readVersion = useRef(0);
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  useEffect(() => () => { readVersion.current++; }, []);
  useEffect(() => {
    if (disabled) { readVersion.current++; setState(emptyState); }
  }, [disabled]);
  const source = state.sources.find(item => item.id === state.sourceId);
  const count = source?.points.length ?? 0;
  const zoneError = source ? seaOperationImportedZoneError(source.points) : null;
  const validZone = Boolean(source && !zoneError);
  const zoneIssue = state.target === 'zone' && source && zoneError;
  const ready = !disabled && !state.loading && count > 0 && Boolean(state.target)
    && (state.target !== 'zone' || validZone && Boolean(state.zoneName.trim()));
  function close() { readVersion.current++; setState(emptyState); }
  async function chooseFile(file: File | undefined) {
    if (disabledRef.current || !file) return;
    const version = ++readVersion.current;
    setState(previous => ({ ...previous, filename: file.name, sources: [], sourceId: '', zoneName: '', error: '', loading: false }));
    if (!/\.gpx$/i.test(file.name)) {
      setState(previous => ({ ...previous, error: 'Choisissez un fichier GPX portant l’extension .gpx.' })); return;
    }
    if (file.size > SEA_OPERATION_WAYPOINT_IMPORT_MAX_BYTES) {
      setState(previous => ({ ...previous, error: 'Le fichier GPX dépasse la limite de 5 Mo.' })); return;
    }
    setState(previous => ({ ...previous, loading: true }));
    try {
      const text = await readGpxFile(file);
      if (version !== readVersion.current || disabledRef.current) return;
      const { sources } = parseSeaOperationWaypointImport(text);
      const first = sources.find(item => item.kind === 'route') ?? sources[0];
      setState(previous => ({ ...previous, sources, sourceId: first.id, zoneName: first.label || file.name.replace(/\.gpx$/i, ''), loading: false }));
    } catch (error) {
      if (version !== readVersion.current || disabledRef.current) return;
      setState(previous => ({ ...previous, loading: false, error: error instanceof Error ? error.message : 'Le fichier GPX n’a pas pu être importé.' }));
    }
  }
  function confirm() {
    if (!ready || disabledRef.current || !source || !state.target) return;
    try {
      if (onImport(source.points, state.target, state.target === 'zone' ? state.zoneName.trim() : undefined)) close();
      else setState(previous => ({ ...previous, error: `L’import n’est plus disponible pour ${destinationLabel}. Vérifiez son état avant de réessayer.` }));
    } catch (error) {
      setState(previous => ({ ...previous, error: error instanceof Error ? error.message : `L’import n’a pas pu être ajouté à ${destinationLabel}.` }));
    }
  }
  const confirmLabel = !source || !state.target ? `Ajouter à ${destinationLabel}` : state.target === 'zone' ? 'Ajouter la zone' : state.target === 'isolated'
    ? `Ajouter ${count === 1 ? 'le point isolé' : `les ${count} points isolés`}`
    : `Ajouter ${count === 1 ? 'le waypoint' : `les ${count} waypoints`}`;
  const trigger = <button type="button" className="sp-button sp-button--secondary" disabled={disabled} aria-expanded={state.open} aria-controls={panelId}
    onClick={() => state.open ? close() : setState({ ...emptyState, open: true })}><Upload size={16} aria-hidden="true" />Importer les waypoints</button>;
  const panel = state.open && <section id={panelId} className="so-waypoint-import-panel" aria-label="Import de waypoints GPX">
      <h3>Importer un fichier GPX</h3>
      <p className="so-help">Sélectionnez un fichier GPX (.gpx), puis indiquez le contenu à ajouter à {destinationLabel}. Taille maximale : 5 Mo.</p>
      <div className="so-waypoint-import-fields">
        <label>Fichier GPX (.gpx)<input type="file" accept=".gpx,application/gpx+xml" disabled={disabled}
          onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; void chooseFile(file); }} /></label>
        <label>Contenu à importer<select value={state.target} disabled={disabled} aria-required="true" onChange={event => setState(previous => ({ ...previous, target: event.target.value as ImportState['target'] }))}>
          <option value="">Choisir le contenu</option><option value="isolated">Points isolés</option><option value="route">Route</option><option value="zone">Zone</option>
        </select></label>
        {state.sources.length > 1 && <label>Jeu de points du fichier<select value={state.sourceId} disabled={disabled} onChange={event => {
          const next = state.sources.find(item => item.id === event.target.value);
          if (next) setState(previous => ({ ...previous, sourceId: next.id, zoneName: next.label }));
        }}>{state.sources.map(item => <option key={item.id} value={item.id}>{item.label} · {item.points.length} points</option>)}</select></label>}
        {state.target === 'zone' && <label>Nom de la zone<input value={state.zoneName} disabled={disabled} aria-required="true" maxLength={500}
          onKeyDown={event => { if (event.key === 'Enter') event.preventDefault(); }}
          onChange={event => setState(previous => ({ ...previous, zoneName: event.target.value }))} /></label>}
      </div>
      {state.target === 'route' && <p className="so-help">Les points importés complètent la route ({existingCount} waypoints déjà présents). Les ETA suivent le calcul du voyage.</p>}
      {(state.target === 'isolated' || state.target === 'zone') && <p className="so-help">Les points isolés et les zones s’affichent sur la carte et n’entrent pas dans les calculs de navigation.{state.target === 'zone' && ' Les points formeront le contour de la zone dans l’ordre du fichier.'}</p>}
      {state.loading && <p role="status" className="so-help">Lecture du fichier GPX…</p>}
      {state.error && <p role="alert" className="so-alert so-danger">{state.error}</p>}
      {zoneIssue && <p role="alert" className="so-alert so-danger">{zoneError}</p>}
      {source && <div className="so-waypoint-import-preview">
        <p role="status"><strong>{count} point{count > 1 ? 's' : ''} à importer</strong> · {state.filename}</p>
        {count > 10 && <p className="so-help">Aperçu des 10 premiers points. L’import ajoutera les {count} points du jeu sélectionné.</p>}
        <table><caption>Aperçu des points à importer</caption><thead><tr><th scope="col">Point</th><th scope="col">Latitude</th><th scope="col">Longitude</th></tr></thead>
          <tbody>{source.points.slice(0, 10).map((point, index) => <tr key={index}><td>{point.name || `Point ${index + 1}`}</td><td>{formatSeaLatitude(point.latitude)}</td><td>{formatSeaLongitude(point.longitude)}</td></tr>)}</tbody></table>
      </div>}
      <footer><button type="button" className="sp-button sp-button--secondary so-secondary" onClick={close}>Annuler</button><button type="button" className="sp-button sp-button--primary" disabled={!ready} onClick={confirm}>{confirmLabel}</button></footer>
    </section>;
  return children ? children({ trigger, panel }) : <>{trigger}{panel}</>;
}
