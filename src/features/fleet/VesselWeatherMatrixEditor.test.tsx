import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { VesselWeatherMatrixEditor } from './VesselWeatherMatrixEditor';
import { createEmptyVesselWeatherMatrix, GOURY_WEATHER_MATRIX, vesselHsRange, vesselPeriodRange, type VesselWeatherMatrix } from './vesselWeatherMatrix';

function MatrixFixture({ initial = null, vesselName = 'GOURY', onChange = vi.fn() }: { initial?: VesselWeatherMatrix | null; vesselName?: string; onChange?: (value: VesselWeatherMatrix | null) => void }) {
  const [matrix, setMatrix] = useState(initial);
  const [ready, setReady] = useState(true);
  return <><VesselWeatherMatrixEditor onChange={(next) => { setMatrix(next); onChange(next); }} onValidationChange={setReady} value={matrix} vesselName={vesselName} /><button disabled={!ready} type="button">Enregistrer le navire</button></>;
}

describe('VesselWeatherMatrixEditor', () => {
  it('requires an explicit action to define a matrix, without assuming safe conditions', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MatrixFixture onChange={onChange} vesselName="BASSE BRETAGNE" />);
    expect(screen.getByText(/Matrice non renseignée/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Appliquer le modèle GOURY' })).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Définir une matrice' }));
    const matrix = onChange.mock.calls[0][0] as VesselWeatherMatrix;
    expect(matrix.levels.flat()).toEqual(Array(42).fill(null));
    expect(within(screen.getByRole('table')).getAllByRole('combobox')).toHaveLength(42);
  });

  it('offers the reference template only for GOURY and applies it without saving', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MatrixFixture onChange={onChange} />);
    expect(onChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Appliquer le modèle GOURY' }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith(GOURY_WEATHER_MATRIX);
    expect(screen.getByText(/conservées avec « Enregistrer »/)).toBeInTheDocument();
    expect(onChange.mock.calls[0][0]).not.toBe(GOURY_WEATHER_MATRIX);
  });

  it('changes a single labelled cell and can return it to undefined', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const initial = createEmptyVesselWeatherMatrix();
    render(<MatrixFixture initial={initial} onChange={onChange} />);
    const cell = screen.getByRole('combobox', { name: `Période ${vesselPeriodRange(initial, 1)} · Hs ${vesselHsRange(initial, 2)}` });
    await user.selectOptions(cell, 'twelve_hours');
    expect(onChange.mock.lastCall?.[0].levels[1][2]).toBe('twelve_hours');
    expect(onChange.mock.lastCall?.[0].levels.flat().filter(Boolean)).toEqual(['twelve_hours']);
    await user.selectOptions(cell, '');
    expect(onChange.mock.lastCall?.[0].levels[1][2]).toBeNull();
    expect(initial.levels.flat().every((level) => level === null)).toBe(true);
  });

  it('shows a read-only matrix with a period selector and no edit actions', async () => {
    const user = userEvent.setup();
    render(<VesselWeatherMatrixEditor value={GOURY_WEATHER_MATRIX} vesselName="GOURY" />);
    expect(within(screen.getByRole('table')).queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    const selector = screen.getByRole('combobox', { name: 'Ligne de période à afficher' });
    await user.selectOptions(selector, '5');
    expect(screen.getByRole('table').querySelector('tr.is-selected-period > th')).toHaveTextContent(vesselPeriodRange(GOURY_WEATHER_MATRIX, 5));
    expect(screen.getAllByText('Rude').length).toBeGreaterThan(0);
  });

  it('blocks saving unapplied axes, rejects invalid bounds, and keeps cell levels after applying valid bounds', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MatrixFixture initial={GOURY_WEATHER_MATRIX} onChange={onChange} />);
    await user.click(screen.getByText('Paramètres des intervalles'));
    const hs = screen.getByRole('textbox', { name: '6 seuils Hs (m), séparés par « ; »' });
    await user.clear(hs);
    await user.type(hs, '0,6 ; 1,1 ; 1,6 ; 2,1 ; 2,6 ; 3,1');
    expect(screen.getByRole('button', { name: 'Enregistrer le navire' })).toBeDisabled();
    expect(onChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Appliquer les intervalles' }));
    expect(onChange.mock.lastCall?.[0]).toEqual(expect.objectContaining({ hsLowerBoundsMeters: [0, .6, 1.1, 1.6, 2.1, 2.6, 3.1], levels: GOURY_WEATHER_MATRIX.levels }));
    expect(screen.getByRole('button', { name: 'Enregistrer le navire' })).toBeEnabled();
    await user.clear(hs);
    await user.type(hs, '1 ; 1 ; 2 ; 3 ; 4 ; 5');
    expect(screen.getByRole('alert')).toHaveTextContent('croissants');
    expect(hs).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: 'Appliquer les intervalles' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Enregistrer le navire' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Annuler les intervalles' }));
    expect(hs).toHaveValue('0,6 ; 1,1 ; 1,6 ; 2,1 ; 2,6 ; 3,1');
    expect(screen.getByRole('button', { name: 'Enregistrer le navire' })).toBeEnabled();
  });

  it('removes a draft matrix explicitly and disables all mutations while saving', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<VesselWeatherMatrixEditor disabled onChange={onChange} value={GOURY_WEATHER_MATRIX} vesselName="GOURY" />);
    expect(screen.getByRole('button', { name: 'Appliquer le modèle GOURY' })).toBeDisabled();
    expect(within(screen.getByRole('table')).getAllByRole('combobox').every((cell) => cell.hasAttribute('disabled'))).toBe(true);
    rerender(<VesselWeatherMatrixEditor onChange={onChange} value={GOURY_WEATHER_MATRIX} vesselName="GOURY" />);
    await user.click(screen.getByText('Paramètres des intervalles'));
    await user.click(screen.getByRole('button', { name: 'Retirer la matrice' }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith(null);
  });
});
