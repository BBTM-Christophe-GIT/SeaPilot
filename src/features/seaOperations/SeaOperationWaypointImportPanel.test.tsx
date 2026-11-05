import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SeaOperationWaypointImportPanel } from './SeaOperationWaypointImportPanel';
import { SEA_OPERATION_WAYPOINT_IMPORT_MAX_BYTES } from './seaOperationWaypointImport';

const gpx = (body: string) => `<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">${body}</gpx>`;
const points = (count = 3) => Array.from({ length: count }, (_, index) => `<rtept lat="${49 + index / 10}" lon="${-1 + index / 10}"><name>WP ${index + 1}</name><desc>Description ${index + 1}</desc></rtept>`).join('');
const route = (count = 3) => gpx(`<rte><name>Manche</name>${points(count)}</rte>`);
function upload(xml: string, filename = 'parcours.gpx') {
  const file = new File([xml], filename, { type: 'application/gpx+xml' });
  fireEvent.change(screen.getByLabelText('Fichier GPX (.gpx)'), { target: { files: [file] } });
  return file;
}
async function open() { await userEvent.click(screen.getByRole('button', { name: 'Importer les waypoints' })); }
async function preview(xml = route()) { upload(xml); return screen.findByRole('table', { name: 'Aperçu des points à importer' }); }

describe('GPX waypoint import panel', () => {
  it('requires an explicit destination and confirmation before adding the complete route', async () => {
    const onImport = vi.fn(() => true);
    render(<SeaOperationWaypointImportPanel disabled={false} existingCount={4} onImport={onImport} />);
    await open();
    expect(screen.getByRole('region', { name: 'Import de waypoints GPX' })).toBeVisible();
    expect(screen.getByLabelText('Fichier GPX (.gpx)')).toHaveAttribute('accept', '.gpx,application/gpx+xml');
    const table = await preview(route(12));
    expect(within(table).getAllByRole('row')).toHaveLength(11);
    expect(screen.getByText(/L’import ajoutera les 12 points/)).toBeVisible();
    expect(screen.getByLabelText('Contenu à importer')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Ajouter à la fiche' })).toBeDisabled();
    expect(onImport).not.toHaveBeenCalled();
    await userEvent.selectOptions(screen.getByLabelText('Contenu à importer'), 'route');
    expect(screen.getByText(/4 waypoints déjà présents/)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter les 12 waypoints' }));
    expect(onImport).toHaveBeenCalledOnce();
    const [imported, target, zoneName] = onImport.mock.calls[0] as unknown as [Array<{ latitude: string; longitude: string; name: string; description: string }>, string, undefined];
    expect(target).toBe('route'); expect(zoneName).toBeUndefined(); expect(imported).toHaveLength(12);
    expect(imported[0]).toEqual({ latitude: '49', longitude: '-1', name: 'WP 1', description: 'Description 1' });
    expect(screen.queryByRole('region', { name: 'Import de waypoints GPX' })).not.toBeInTheDocument();
  });

  it('selects one source separately from its isolated-point destination', async () => {
    const onImport = vi.fn(() => true);
    render(<SeaOperationWaypointImportPanel disabled={false} existingCount={2} onImport={onImport} />);
    await open();
    await preview(gpx(`<wpt lat="48" lon="-2"><name>Balise</name></wpt><rte><name>Manche</name>${points(2)}</rte><trk><name>Retour</name><trkseg><trkpt lat="50" lon="1"><name>Retour 1</name></trkpt></trkseg></trk>`));
    const source = screen.getByLabelText('Jeu de points du fichier');
    expect(source).toHaveValue('route-1');
    await userEvent.selectOptions(screen.getByLabelText('Contenu à importer'), 'isolated');
    await userEvent.selectOptions(source, 'waypoints');
    expect(screen.getByRole('cell', { name: 'Balise' })).toBeVisible();
    expect(screen.getByText(/n’entrent pas dans les calculs de navigation/)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter le point isolé' }));
    expect(onImport).toHaveBeenCalledExactlyOnceWith([{ latitude: '48', longitude: '-2', name: 'Balise', description: '' }], 'isolated', undefined);
  });

  it('imports a named zone only after the user chooses it and confirms its ordered contour', async () => {
    const onImport = vi.fn(() => true);
    render(<SeaOperationWaypointImportPanel disabled={false} existingCount={0} onImport={onImport} />);
    await open(); await preview();
    await userEvent.selectOptions(screen.getByLabelText('Contenu à importer'), 'zone');
    expect(screen.getByText(/contour de la zone dans l’ordre du fichier/)).toBeVisible();
    const name = screen.getByLabelText('Nom de la zone');
    await userEvent.clear(name);
    expect(screen.getByRole('button', { name: 'Ajouter la zone' })).toBeDisabled();
    await userEvent.type(name, '  Zone de travaux  ');
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter la zone' }));
    expect(onImport).toHaveBeenCalledExactlyOnceWith(expect.arrayContaining([expect.objectContaining({ name: 'WP 1' })]), 'zone', 'Zone de travaux');
  });

  it('rejects a zone with fewer than three distinct positions', async () => {
    const onImport = vi.fn(() => true);
    render(<SeaOperationWaypointImportPanel disabled={false} existingCount={0} onImport={onImport} />);
    await open(); await preview(gpx(`<rte>${points(2)}<rtept lat="49" lon="-1" /></rte>`));
    await userEvent.selectOptions(screen.getByLabelText('Contenu à importer'), 'zone');
    expect(screen.getByRole('alert')).toHaveTextContent('au moins trois positions distinctes');
    expect(screen.getByRole('button', { name: 'Ajouter la zone' })).toBeDisabled();
    expect(onImport).not.toHaveBeenCalled();
  });

  it.each([['parcours.csv', route(), /extension .gpx/], ['parcours.gpx', '<invalid>', /document GPX/]] as const)('rejects invalid file %s before confirmation', async (filename, xml, error) => {
    const onImport = vi.fn(() => true);
    render(<SeaOperationWaypointImportPanel disabled={false} existingCount={0} onImport={onImport} />);
    await open(); upload(xml, filename);
    expect(await screen.findByRole('alert')).toHaveTextContent(error);
    expect(screen.queryByRole('table')).not.toBeInTheDocument(); expect(onImport).not.toHaveBeenCalled();
  });

  it('checks file size before reading', async () => {
    const onImport = vi.fn(() => true), text = vi.fn(async () => route());
    render(<SeaOperationWaypointImportPanel disabled={false} existingCount={0} onImport={onImport} />);
    await open();
    const file = new File([''], 'grand.gpx');
    Object.defineProperties(file, { size: { value: SEA_OPERATION_WAYPOINT_IMPORT_MAX_BYTES + 1 }, text: { value: text } });
    fireEvent.change(screen.getByLabelText('Fichier GPX (.gpx)'), { target: { files: [file] } });
    expect(screen.getByRole('alert')).toHaveTextContent('5 Mo'); expect(text).not.toHaveBeenCalled();
  });

  it.each(['disabled', 'cancel', 'unmount', 'new-file'] as const)('discards a pending file after %s', async reason => {
    const onImport = vi.fn(() => true);
    let resolveFile!: (value: string) => void;
    const file = new File([''], 'ancien.gpx');
    Object.defineProperty(file, 'text', { value: () => new Promise<string>(resolve => { resolveFile = resolve; }) });
    const view = render(<SeaOperationWaypointImportPanel disabled={false} existingCount={0} onImport={onImport} />);
    await open();
    fireEvent.change(screen.getByLabelText('Fichier GPX (.gpx)'), { target: { files: [file] } });
    if (reason === 'disabled') view.rerender(<SeaOperationWaypointImportPanel disabled existingCount={0} onImport={onImport} />);
    if (reason === 'cancel') await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    if (reason === 'unmount') view.unmount();
    if (reason === 'new-file') { await preview(route(2)); }
    await act(async () => resolveFile(route(7)));
    expect(onImport).not.toHaveBeenCalled();
    expect(screen.queryByText('7 points à importer')).not.toBeInTheDocument();
    if (reason === 'new-file') expect(screen.getByText('2 points à importer')).toBeVisible();
    if (reason === 'disabled') expect(screen.getByRole('button', { name: 'Importer les waypoints' })).toBeDisabled();
  });

  it('keeps the preview on a stale access rejection or a capacity error, then cancels cleanly', async () => {
    const onImport = vi.fn(() => false);
    render(<SeaOperationWaypointImportPanel disabled={false} existingCount={0} onImport={onImport} />);
    await open(); await preview();
    await userEvent.selectOptions(screen.getByLabelText('Contenu à importer'), 'route');
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter les 3 waypoints' }));
    expect(screen.getByRole('alert')).toHaveTextContent('n’est plus disponible');
    expect(screen.getByRole('table')).toBeVisible();
    onImport.mockImplementation(() => { throw new Error('La fiche peut contenir au maximum 200 points.'); });
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter les 3 waypoints' }));
    expect(screen.getByRole('alert')).toHaveTextContent('au maximum 200 points');
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' })); await open();
    expect(screen.queryByRole('table')).not.toBeInTheDocument(); expect(screen.getByLabelText('Contenu à importer')).toHaveValue('');
  });
});
