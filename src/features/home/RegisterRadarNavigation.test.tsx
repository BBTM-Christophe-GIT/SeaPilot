import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ChemicalsPage } from '../chemicals/ChemicalsPage';
import { createChemicalPreviewClient, createChemicalPreviewFiles } from '../chemicals/chemicalPreview';
import { EmergencyExercisesPage } from '../emergencyExercises/EmergencyExercisesPage';
import { createExercisePreviewClient } from '../emergencyExercises/emergencyExercisesPreview';
import { LiftingPage } from '../lifting/LiftingPage';
import { createLiftingPreviewClient, demoVessel } from '../lifting/liftingPreview';

vi.mock('../../lib/supabaseClient', () => ({ supabase: {} }));

describe('Register radar destinations (authorized demonstration data)', () => {
  it('opens the permitted chemical product from its exact identifier', async () => {
    render(<MemoryRouter initialEntries={['/modules/chemicals?vessel=90001&product=demo-product']}>
      <ChemicalsPage client={createChemicalPreviewClient()} fileStore={createChemicalPreviewFiles()} />
    </MemoryRouter>);
    expect(await screen.findByRole('dialog', { name: /Produit exemple/ })).toBeVisible();
    expect(screen.getByRole('button', { name: /NAVIRE DÉMONSTRATION/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('never opens an inaccessible chemical record', async () => {
    render(<MemoryRouter initialEntries={['/modules/chemicals?vessel=90001&product=inaccessible']}>
      <ChemicalsPage client={createChemicalPreviewClient()} fileStore={createChemicalPreviewFiles()} />
    </MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveTextContent('Le produit demandé n’est pas disponible dans votre accès.');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('selects the requested exercise vessel, person and campaign using its authenticated roster', async () => {
    render(<MemoryRouter initialEntries={['/modules/emergencyExercises?vessel=3&person=1&year=2025']}>
      <EmergencyExercisesPage client={createExercisePreviewClient()} />
    </MemoryRouter>);
    await waitFor(() => expect(screen.getByRole('button', { name: 'GOURY' })).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.getByRole('combobox', { name: 'Collaborateur' })).toHaveValue('1');
    expect(screen.getByRole('combobox', { name: 'Année' })).toHaveValue('2025');
  });

  it('focuses a lifting item and lets the user restore all equipment without losing the vessel', async () => {
    render(<MemoryRouter initialEntries={[`/modules/lifting/apparaux?vessel=${demoVessel.id}&item=2&source=radar`]}>
      <LiftingPage client={createLiftingPreviewClient()} roles={['admin']} />
    </MemoryRouter>);
    const showAll = await screen.findByRole('button', { name: 'Afficher tout le registre' }, { timeout: 10_000 });
    expect(screen.getByText('MANILLE LYRE — 6,5 T')).toBeVisible();
    expect(screen.queryByText('ÉLINGUE TEXTILE RONDE — 3 M')).not.toBeInTheDocument();
    fireEvent.click(showAll);
    expect(await screen.findByText('ÉLINGUE TEXTILE RONDE — 3 M', {}, { timeout: 10_000 })).toBeVisible();
    const filters = screen.getByRole('group', { name: 'Filtrer par navire' });
    expect(within(filters).getByRole('button', { name: 'NAVIRE DÉMONSTRATION' })).toHaveAttribute('aria-pressed', 'true');
  });
});
