import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { emptySeaOperationWaypoint, type SeaOperationWaypoint } from '../seaOperations/seaOperationModel';
import { SEA_METEO_FRANCE_SOURCE_URL } from '../seaOperations/seaOperationWeatherModel';
import { ProjectLocationOverlayFields, ProjectLocationPointFields } from './ProjectLocationOverlayFields';
import { ProjectLocationPreview } from './ProjectLocationPreview';
import { emptyProjectLocationPlan } from './projectLocation';

vi.mock('../seaOperations/SeaOperationRouteMap', () => ({ SeaOperationRouteMap: () => <div>Carte conservée</div> }));

function retainedPoint(): SeaOperationWaypoint {
  return { ...emptySeaOperationWaypoint('isolated'), number: 'P1', descriptionVhf: 'Balise isolée', latitude: '49.65', longitude: '-1.62',
    eta: '2026-10-27T12:07', etaMode: 'manual', ukc: 'ANNOTATION-UKC-HISTORIQUE', denseTraffic: true,
    radio: { version: 1, latitude: 49.65, longitude: -1.62, capturedAt: '2026-10-26T08:00:00Z', verifiedOn: '2026-10-26', contacts: [] },
    weather: { pointId: 'isolated', latitude: 49.65, longitude: -1.62, etaUtc: '2026-10-27T11:07:00Z', fetchedAt: '2026-10-26T08:00:00Z',
      wind: null, waves: null, windMessage: 'Prévision conservée', wavesMessage: 'Hs conservée', attribution: 'Météo-France', sourceUrl: SEA_METEO_FRANCE_SOURCE_URL } };
}

describe('isolated project and operation location points', () => {
  it('shows only number, description, coordinates and deletion without publishing or clearing retained navigation data', () => {
    const point = retainedPoint(), original = structuredClone(point), changed = vi.fn();
    render(<ProjectLocationPointFields point={point} index={0} kind="Point isolé" onChange={changed} onDelete={vi.fn()} />);
    const row = within(screen.getByRole('row', { name: 'Point isolé 1' }));
    expect(row.getAllByRole('textbox')).toHaveLength(4);
    for (const name of ['Numéro', 'Description', 'Latitude', 'Longitude']) expect(row.getByLabelText(`${name} · Point isolé 1`)).toBeInTheDocument();
    expect(row.getByRole('button', { name: 'Supprimer Point isolé 1' })).toBeEnabled();
    expect(row.queryByLabelText(/ETA|UKC/)).not.toBeInTheDocument(); expect(row.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(row.queryByText(/Contacts VHF|prévisions|date et heure/i)).not.toBeInTheDocument();
    expect(changed).not.toHaveBeenCalled(); expect(point).toEqual(original);
  });
  it('keeps historical ETA, UKC, traffic and valid captures when the description is edited through the real overlay', () => {
    const point = retainedPoint(), value = { version: 1 as const, points: [point], zones: [] }, original = structuredClone(value), changed = vi.fn();
    render(<ProjectLocationOverlayFields value={value} onChange={changed} />);
    fireEvent.change(screen.getByLabelText('Description · Point isolé 1'), { target: { value: 'Nouvelle description' } });
    expect(changed).toHaveBeenCalledWith({ ...value, points: [{ ...point, descriptionVhf: 'Nouvelle description' }] });
    expect(value).toEqual(original);
  });
  it('preserves disabled controls and prevents changes to read-only overlays', () => {
    const changed = vi.fn(); render(<ProjectLocationOverlayFields value={{ version: 1, points: [retainedPoint()], zones: [] }} onChange={changed} disabled />);
    const row = within(screen.getByRole('row', { name: 'Point isolé 1' }));
    for (const input of row.getAllByRole('textbox')) expect(input).toBeDisabled();
    fireEvent.change(row.getByLabelText('Description · Point isolé 1'), { target: { value: 'Interdit' } });
    fireEvent.click(row.getByRole('button', { name: 'Supprimer Point isolé 1' }));
    expect(changed).not.toHaveBeenCalled();
  });
  it('keeps the complete route waypoint calendar, UKC, traffic and radio/weather controls', () => {
    const point = retainedPoint(), changed = vi.fn();
    render(<ProjectLocationPointFields point={point} index={0} onChange={changed} onDelete={vi.fn()} />);
    const row = within(screen.getByRole('row', { name: 'Waypoint 1' }));
    expect(row.getByLabelText('Heures de l’ETA (Paris)')).toBeEnabled();
    expect(row.getByLabelText('UKC · point 1')).toHaveValue(point.ukc);
    expect(row.getByRole('checkbox', { name: 'Zone maritime à trafic dense' })).toBeChecked();
    expect(row.getByText('Contacts VHF et météo')).toBeInTheDocument();
    expect(row.getByRole('button', { name: 'Rétablir l’ETA automatique' })).toBeInTheDocument();
    expect(changed).not.toHaveBeenCalled();
  });
  it('previews only four isolated-point columns while keeping all nine route columns and the retained snapshot', () => {
    const isolated = retainedPoint(), plan = { ...emptyProjectLocationPlan(), points: [isolated], waypoints: [{ ...isolated, id: 'route', number: '1', descriptionVhf: 'Route conservée' }] };
    const original = structuredClone(plan), { container } = render(<ProjectLocationPreview plan={plan} projectLabel="P1" />);
    const tables = container.querySelectorAll('table'); expect(tables).toHaveLength(2);
    expect(within(tables[0]).getAllByRole('columnheader')).toHaveLength(9);
    expect(within(tables[0]).getByRole('columnheader', { name: 'UKC' })).toBeInTheDocument();
    expect(within(tables[1]).getAllByRole('columnheader').map(cell => cell.textContent)).toEqual(['Point', 'Description', 'Latitude', 'Longitude']);
    expect(within(tables[1]).getAllByRole('cell')).toHaveLength(4);
    expect(tables[1]).not.toHaveTextContent(isolated.ukc); expect(tables[1]).not.toHaveTextContent('12:07');
    expect(plan).toEqual(original);
  });
});
