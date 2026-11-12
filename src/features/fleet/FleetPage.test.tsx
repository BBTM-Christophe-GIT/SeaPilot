import type { SupabaseClient } from '@supabase/supabase-js';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FleetPage } from './FleetPage';
import type { FleetVessel } from './fleetQueries';
import { fetchPlanningP11Data } from '../planning/planningP11Queries';
import { downloadFleetBrochure } from './fleetBrochure';
import { fetchFleetVessels, resolveFleetVesselPhotoUrl, saveFleetVessel } from './fleetQueries';
import { createEmptyVesselWeatherMatrix, GOURY_WEATHER_MATRIX, vesselHsRange, vesselPeriodRange } from './vesselWeatherMatrix';

vi.mock('./fleetQueries', async (importOriginal) => {
  const original = await importOriginal<typeof import('./fleetQueries')>();
  return { ...original, fetchFleetVessels: vi.fn(), resolveFleetVesselPhotoUrl: vi.fn(), saveFleetVessel: vi.fn() };
});
vi.mock('../planning/planningP11Queries', () => ({ fetchPlanningP11Data: vi.fn() }));
vi.mock('./fleetBrochure', () => ({ downloadFleetBrochure: vi.fn() }));
vi.mock('./FleetCapacityPlans', () => ({ FleetCapacityPlans: () => <section aria-label="Plans" /> }));

const baseVessel: FleetVessel = {
  id: 1, companyId: 1, name: 'GOURY', acronym: 'GRY', assetKind: 'vessel', typeLabel: 'Navire de charge',
  unitTypeLabel: 'Navire', fleetExitOn: '', registrationNumber: '934968', imoNumber: '9213870',
  registrationPort: 'MARSEILLE', callSign: 'FLBU', mmsi: '361001000', grossTonnage: '293', maxPeople: 12,
  crewMembers: '', medicalDotation: 'Dotation B', lengthOverall: '30.62 m', flagState: 'France', active: true,
  sharePointListId: '543b9f00-aed2-489a-808a-7b64cc835a83', sharePointItemId: '1',
  sourceModifiedAt: '2026-05-31T10:45:21Z', sourceGuid: '9c29663e-fe10-4560-b2cf-4bd228e38da5',
  sourceEtag: '33', sourceActiveLabel: 'GOURY', sourceFleetExitAt: '', photoUrl: '/vessels/goury.jpg',
  photoStorageBucket: '', photoStoragePath: '', brochureSubtitle: 'Offshore Guard Vessel', brochureSummary: 'Polyvalent',
  brochureOperations: ['Support plongée'], builtYear: 2001, classificationLabel: 'DNV', navigationCategory: 'Catégorie 2',
  beamOverallM: 8.5, lightshipTonnes: 400, deadweightTonnes: 100, safeManning: 4,
  mainEngine: 'CATERPILLAR C3512 B', mainEnginePowerKw: 750, bowThrusterPowerKw: 75,
  gensets: '2 × 230 KVA', maxSpeedKnots: 12, bollardPullTonnes: 12, fuelCapacityM3: 110,
  rangeDescription: '4 semaines', deckEquipment: 'Grue de pont', electronicsCommunications: 'SMDSM', accommodation: '12 personnes',
  liabilityInsurer: "Shipowner’s Club",
};
const office: FleetVessel = { ...baseVessel, id: 2, name: 'Armement - Cherbourg', acronym: '', assetKind: 'office', typeLabel: '', unitTypeLabel: 'Armement', photoUrl: '', sharePointItemId: '15' };
const quay: FleetVessel = { ...baseVessel, id: 3, name: 'YARD - Le Havre', acronym: '', assetKind: 'quay', typeLabel: '', unitTypeLabel: 'Yard', photoUrl: '', sharePointItemId: '8' };

describe('FleetPage', () => {
  beforeEach(() => {
    vi.mocked(fetchFleetVessels).mockResolvedValue([baseVessel, office, quay]);
    vi.mocked(fetchPlanningP11Data).mockResolvedValue({ rotations: [], templates: [], matrices: [], certificates: [] });
    vi.mocked(resolveFleetVesselPhotoUrl).mockResolvedValue('/vessels/goury.jpg');
    vi.mocked(downloadFleetBrochure).mockResolvedValue(undefined);
    vi.mocked(saveFleetVessel).mockReset();
  });

  it('organizes the mixed register and keeps staffing decisions inside each vessel', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><FleetPage client={{} as SupabaseClient} roles={['admin']} /></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'GOURY' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Navires\s*1/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Bureaux\s*1/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Quais\s*1/ })).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: 'Photo du navire GOURY' })).toHaveAttribute('src', '/vessels/goury.jpg');
    expect(screen.getByRole('tab', { name: 'Décision d’effectif' })).toBeInTheDocument();
    const capacities = within(screen.getByRole('region', { name: 'Capacités' }));
    expect(capacities.getByRole('region', { name: 'Carburant' })).toBeVisible();
    expect(capacities.getByRole('region', { name: 'Plans' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: /Bureaux\s*1/ }));
    expect(await screen.findByRole('heading', { name: 'Armement - Cherbourg' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Éditer brochure' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Décision d’effectif' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Capacités' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Modifier' }));
    expect(within(screen.getByRole('dialog')).queryByRole('region', { name: 'Capacités' })).not.toBeInTheDocument();
  });

  it('edits the BBTM brochure from the vessel detail', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><FleetPage client={{} as SupabaseClient} roles={['admin']} /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'GOURY' });
    await user.click(screen.getByRole('button', { name: 'Éditer brochure' }));
    expect(downloadFleetBrochure).toHaveBeenCalledWith(baseVessel, '/vessels/goury.jpg');
    expect(await screen.findByText('La brochure de GOURY a été éditée.')).toBeInTheDocument();
  });

  it('configures the main tanks in liters and keeps the daily tank separate from the total', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><FleetPage client={{} as SupabaseClient} roles={['admin']} /></MemoryRouter>);
    const fuel = within(await screen.findByRole('region', { name: 'Carburant' }));
    expect(fuel.getByText('Capacité historique')).toBeVisible();
    expect(fuel.getByText('110 000 L')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Modifier' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Modifier l’actif' }));
    const tankCount = dialog.getByRole('combobox', { name: 'Nombre de cuves principales' });
    expect(tankCount).toHaveValue('0');
    expect(dialog.queryByRole('spinbutton', { name: /^Cuve / })).not.toBeInTheDocument();
    await user.selectOptions(tankCount, '1');
    expect(dialog.getByRole('spinbutton', { name: 'Cuve (L)' })).toBeVisible();
    expect(dialog.getByRole('textbox', { name: 'Nom de la cuve 1' })).toHaveValue('Cuve');
    await user.selectOptions(tankCount, '2');
    fireEvent.change(dialog.getByRole('spinbutton', { name: 'Cuve Bâbord (L)' }), { target: { value: '7000' } });
    fireEvent.change(dialog.getByRole('spinbutton', { name: 'Cuve Tribord (L)' }), { target: { value: '5000' } });
    const dailyTank = dialog.getByRole('checkbox', { name: 'Caisse journalière' });
    expect(dailyTank).not.toBeChecked();
    await user.click(dailyTank);
    const dailyName = dialog.getByRole('textbox', { name: 'Nom de la caisse journalière' });
    expect(dailyName).toHaveAttribute('placeholder', 'Caisse journalière');
    fireEvent.change(dailyName, { target: { value: ' Caisse service ' } });
    fireEvent.change(dialog.getByRole('spinbutton', { name: 'Capacité de la caisse journalière (L)' }), { target: { value: '800' } });
    const saved = { ...baseVessel, fuelTankCapacitiesLiters: [7000, 5000], dailyFuelTankCapacityLiters: 800, dailyFuelTankName: 'Caisse service' };
    vi.mocked(saveFleetVessel).mockResolvedValue(saved);
    vi.mocked(fetchFleetVessels).mockResolvedValue([saved, office, quay]);
    await user.click(dialog.getByRole('button', { name: 'Enregistrer' }));
    await screen.findByText('Navire enregistré.');
    expect(saveFleetVessel).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      fuelTankCapacitiesLiters: [7000, 5000], fuelTankNames: null, dailyFuelTankCapacityLiters: 800, dailyFuelTankName: 'Caisse service',
    }));
    expect(vi.mocked(saveFleetVessel).mock.lastCall?.[1]).not.toHaveProperty('fuelCapacityM3');
    const detail = within(screen.getByRole('region', { name: 'Carburant' }));
    expect(detail.getByText('12 000 L')).toBeVisible();
    expect(detail.getByText('Cuve Bâbord')).toBeVisible();
    expect(detail.getByText('Cuve Tribord')).toBeVisible();
    expect(detail.getByText('Caisse service')).toBeVisible();
    expect(detail.getByText('800 L')).toBeVisible();
    expect(detail.queryByText('12 800 L')).not.toBeInTheDocument();
    expect(detail.queryByText('110 000 L')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Modifier' }));
    const updateDialog = within(screen.getByRole('dialog', { name: 'Modifier l’actif' }));
    expect(updateDialog.getByRole('spinbutton', { name: 'Cuve Tribord (L)' })).toHaveValue(5000);
    expect(updateDialog.getByRole('checkbox', { name: 'Caisse journalière' })).toBeChecked();
    expect(updateDialog.getByRole('textbox', { name: 'Nom de la caisse journalière' })).toHaveValue('Caisse service');
    await user.click(updateDialog.getByRole('checkbox', { name: 'Caisse journalière' }));
    expect(updateDialog.queryByRole('textbox', { name: 'Nom de la caisse journalière' })).not.toBeInTheDocument();
    expect(updateDialog.queryByRole('spinbutton', { name: 'Capacité de la caisse journalière (L)' })).not.toBeInTheDocument();
    const withoutDailyTank = { ...saved, dailyFuelTankCapacityLiters: null, dailyFuelTankName: null };
    vi.mocked(saveFleetVessel).mockResolvedValue(withoutDailyTank);
    vi.mocked(fetchFleetVessels).mockResolvedValue([withoutDailyTank, office, quay]);
    await user.click(updateDialog.getByRole('button', { name: 'Enregistrer' }));
    expect(saveFleetVessel).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({
      fuelTankCapacitiesLiters: [7000, 5000], dailyFuelTankCapacityLiters: null, dailyFuelTankName: null,
    }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Modifier l’actif' })).not.toBeInTheDocument());
    expect(within(screen.getByRole('region', { name: 'Carburant' })).queryByText('800 L')).not.toBeInTheDocument();
  });

  it('names three main tanks and retains default labels for unnamed legacy tanks', async () => {
    const user = userEvent.setup();
    const legacy = { ...baseVessel, fuelTankCapacitiesLiters: [1000, 2000, 3000] };
    vi.mocked(fetchFleetVessels).mockResolvedValue([legacy]);
    render(<MemoryRouter><FleetPage client={{} as SupabaseClient} roles={['admin']} /></MemoryRouter>);
    expect(within(await screen.findByRole('region', { name: 'Carburant' })).getByText('Cuve 3')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Modifier' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Modifier l’actif' }));
    const firstName = dialog.getByRole('textbox', { name: 'Nom de la cuve 1' });
    const secondName = dialog.getByRole('textbox', { name: 'Nom de la cuve 2' });
    expect(firstName).toHaveValue('Cuve 1');
    fireEvent.change(firstName, { target: { value: ' Avant ' } });
    fireEvent.change(secondName, { target: { value: 'aVANT' } });
    const save = dialog.getByRole('button', { name: 'Enregistrer' });
    expect(save).toBeDisabled();
    fireEvent.change(secondName, { target: { value: 'Arrière' } });
    expect(dialog.getByRole('spinbutton', { name: 'Avant (L)' })).toHaveValue(1000);
    const saved = { ...legacy, fuelTankNames: ['Avant', 'Arrière', 'Cuve 3'] };
    vi.mocked(saveFleetVessel).mockResolvedValue(saved);
    vi.mocked(fetchFleetVessels).mockResolvedValue([saved]);
    await user.click(save);
    await screen.findByText('Navire enregistré.');
    expect(saveFleetVessel).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      fuelTankCapacitiesLiters: [1000, 2000, 3000], fuelTankNames: ['Avant', 'Arrière', 'Cuve 3'],
    }));
    const detail = within(screen.getByRole('region', { name: 'Carburant' }));
    expect(detail.getByText('Avant')).toBeVisible();
    expect(detail.getByText('Arrière')).toBeVisible();
  });

  it('renames either of two tanks and keeps their Soutes selection keyed by position', async () => {
    const user = userEvent.setup();
    const vessel: FleetVessel = { ...baseVessel, fuelTankCapacitiesLiters: [7000, 5000], dailyFuelTankCapacityLiters: 800, hiddenFuelTankKeys: ['day'] };
    vi.mocked(fetchFleetVessels).mockResolvedValue([vessel]);
    render(<MemoryRouter><FleetPage client={{} as SupabaseClient} roles={['admin']} /></MemoryRouter>);
    await user.click(await screen.findByRole('button', { name: 'Modifier' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Modifier l’actif' }));
    const firstName = dialog.getByRole('textbox', { name: 'Nom de la cuve 1' });
    const secondName = dialog.getByRole('textbox', { name: 'Nom de la cuve 2' });
    expect(firstName).toHaveValue('Cuve Bâbord');
    expect(secondName).toHaveValue('Cuve Tribord');
    expect(dialog.getByRole('checkbox', { name: 'Afficher dans Soutes — Caisse journalière' })).not.toBeChecked();
    await user.click(dialog.getByRole('checkbox', { name: 'Afficher dans Soutes — Cuve Tribord' }));
    fireEvent.change(firstName, { target: { value: 'Soute avant' } });
    fireEvent.change(secondName, { target: { value: 'Soute arrière' } });
    expect(dialog.getByRole('checkbox', { name: 'Afficher dans Soutes — Soute arrière' })).not.toBeChecked();
    expect(dialog.getByRole('spinbutton', { name: 'Soute arrière (L)' })).toHaveValue(5000);

    const saved: FleetVessel = { ...vessel, fuelTankNames: ['Soute avant', 'Soute arrière'], hiddenFuelTankKeys: ['day', 'main-2'] };
    vi.mocked(saveFleetVessel).mockResolvedValue(saved);
    vi.mocked(fetchFleetVessels).mockResolvedValue([saved]);
    await user.click(dialog.getByRole('button', { name: 'Enregistrer' }));
    await screen.findByText('Navire enregistré.');
    expect(saveFleetVessel).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      fuelTankCapacitiesLiters: [7000, 5000], fuelTankNames: ['Soute avant', 'Soute arrière'], hiddenFuelTankKeys: ['day', 'main-2'],
    }));
    expect(within(screen.getByRole('region', { name: 'Carburant' })).getByText('Soute arrière')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Modifier' }));
    const nextDialog = within(screen.getByRole('dialog', { name: 'Modifier l’actif' }));
    const count = nextDialog.getByRole('combobox', { name: 'Nombre de cuves principales' });
    await user.selectOptions(count, '1');
    await user.selectOptions(count, '2');
    expect(nextDialog.getByRole('textbox', { name: 'Nom de la cuve 1' })).toHaveValue('Soute avant');
    expect(nextDialog.getByRole('checkbox', { name: 'Afficher dans Soutes — Cuve Tribord' })).toBeChecked();
  });

  it('adds vessel-specific sections and selects individual custom tanks for Soutes', async () => {
    const user = userEvent.setup();
    const vessel = { ...baseVessel, fuelCapacityM3: null };
    const other = { ...baseVessel, id: 4, name: 'ROZEL', capacitySections: [{ name: 'Eaux grises', tanks: [] }] };
    vi.mocked(fetchFleetVessels).mockResolvedValue([vessel, other]);
    vi.mocked(saveFleetVessel).mockImplementation(async (_, input) => {
      const saved = { ...vessel, capacitySections: input.capacitySections, hiddenFuelTankKeys: input.hiddenFuelTankKeys };
      vi.mocked(fetchFleetVessels).mockResolvedValue([saved, other]);
      return saved;
    });
    render(<MemoryRouter><FleetPage client={{} as SupabaseClient} roles={['admin']} /></MemoryRouter>);
    await user.click(await screen.findByRole('button', { name: 'Modifier' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Modifier l’actif' }));
    await user.click(dialog.getByRole('checkbox', { name: 'Afficher dans Soutes — Cuve sans capacité renseignée' }));
    await user.click(dialog.getByRole('button', { name: 'Ajouter une sous-section' }));
    fireEvent.change(dialog.getByRole('textbox', { name: 'Nom de la sous-section' }), { target: { value: ' Eau douce ' } });
    const freshWater = within(dialog.getByRole('group', { name: 'Eau douce' }));
    await user.click(freshWater.getByRole('button', { name: 'Ajouter une cuve' }));
    fireEvent.change(freshWater.getByRole('textbox', { name: 'Nom de la cuve' }), { target: { value: ' Réserve ' } });
    fireEvent.change(freshWater.getByRole('spinbutton', { name: 'Capacité (L)' }), { target: { value: '650.5' } });
    const showInSoutes = freshWater.getByRole('checkbox', { name: 'Afficher dans Soutes — Réserve (Eau douce)' });
    expect(showInSoutes).not.toBeChecked();
    await user.click(showInSoutes);
    await user.click(dialog.getByRole('button', { name: 'Ajouter une sous-section' }));
    const newSection = within(dialog.getByRole('group', { name: 'Nouvelle sous-section' }));
    fireEvent.change(newSection.getByRole('textbox', { name: 'Nom de la sous-section' }), { target: { value: 'eau DOUCE' } });
    const save = dialog.getByRole('button', { name: 'Enregistrer' });
    expect(save).toBeDisabled();
    fireEvent.change(newSection.getByRole('textbox', { name: 'Nom de la sous-section' }), { target: { value: 'Huiles' } });
    await user.click(save);
    await screen.findByText('Navire enregistré.');
    expect(saveFleetVessel).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      id: 1, hiddenFuelTankKeys: ['main-1'],
      capacitySections: [
        { name: 'Eau douce', tanks: [{ id: expect.stringMatching(/^[\da-f-]{36}$/), name: 'Réserve', capacityLiters: 650.5, showInSoutes: true }] },
        { name: 'Huiles', tanks: [] },
      ],
    }));
    const details = within(screen.getByRole('region', { name: 'Capacités' }));
    expect(within(details.getByRole('region', { name: 'Eau douce' })).getByText('650,5 L')).toBeVisible();
    expect(details.getByRole('region', { name: 'Huiles' })).toBeVisible();
    expect(details.queryByRole('region', { name: 'Eaux grises' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /ROZEL/ }));
    expect(details.getByRole('region', { name: 'Eaux grises' })).toBeVisible();
    expect(details.queryByRole('region', { name: 'Eau douce' })).not.toBeInTheDocument();
  });

  it('keeps an unknown vessel draft empty and saves an explicitly entered measurement', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><FleetPage client={{} as SupabaseClient} roles={['admin']} /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'GOURY' });
    expect(screen.getByText('Tirant d’eau', { selector: 'dt' }).nextElementSibling).toHaveTextContent('—');
    await user.click(screen.getByRole('button', { name: 'Modifier' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Modifier l’actif' }));
    const input = dialog.getByRole('spinbutton', { name: 'Tirant d’eau (m)' });
    expect(input).toHaveValue(null);
    expect(input).toHaveAttribute('max', '50');
    await user.type(input, '3.25');
    const saved = { ...baseVessel, draftMeters: 3.25 };
    vi.mocked(saveFleetVessel).mockResolvedValue(saved);
    vi.mocked(fetchFleetVessels).mockResolvedValue([saved, office, quay]);
    await user.click(dialog.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Navire enregistré.')).toBeInTheDocument();
    expect(saveFleetVessel).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 1, draftMeters: 3.25 }));
    expect(screen.getByText('Tirant d’eau', { selector: 'dt' }).nextElementSibling).toHaveTextContent('3.25 m');
  });

  it('prefills the saved draft and lets the user clear it to an unknown value', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchFleetVessels).mockResolvedValue([{ ...baseVessel, draftMeters: 3.5 }, office, quay]);
    render(<MemoryRouter><FleetPage client={{} as SupabaseClient} roles={['admin']} /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'GOURY' });
    await user.click(screen.getByRole('button', { name: 'Modifier' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Modifier l’actif' }));
    const input = dialog.getByRole('spinbutton', { name: 'Tirant d’eau (m)' });
    expect(input).toHaveValue(3.5);
    await user.clear(input);
    vi.mocked(saveFleetVessel).mockResolvedValue({ ...baseVessel, draftMeters: null });
    await user.click(dialog.getByRole('button', { name: 'Enregistrer' }));
    await screen.findByText('Navire enregistré.');
    expect(saveFleetVessel).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ draftMeters: null }));
  });

  it('saves a vessel matrix only through the usual save action and can discard its changes', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><FleetPage client={{} as SupabaseClient} roles={['admin']} /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'GOURY' });
    await user.click(screen.getByRole('tab', { name: 'Conditions météo limites' }));
    expect(screen.getByText(/Matrice non renseignée/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Modifier' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Modifier l’actif' }));
    await user.click(dialog.getByRole('button', { name: 'Appliquer le modèle GOURY' }));
    expect(saveFleetVessel).not.toHaveBeenCalled();
    await user.click(dialog.getByRole('button', { name: 'Annuler' }));
    expect(screen.getByText(/Matrice non renseignée/)).toBeInTheDocument();
    expect(saveFleetVessel).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Modifier' }));
    const nextDialog = within(screen.getByRole('dialog', { name: 'Modifier l’actif' }));
    await user.click(nextDialog.getByRole('button', { name: 'Définir une matrice' }));
    const empty = createEmptyVesselWeatherMatrix();
    await user.selectOptions(nextDialog.getByRole('combobox', { name: `Période ${vesselPeriodRange(empty, 0)} · Hs ${vesselHsRange(empty, 0)}` }), 'uncomfortable');
    const matrix = { ...empty, levels: empty.levels.map((row, period) => row.map((level, hs) => period === 0 && hs === 0 ? 'uncomfortable' as const : level)) };
    const saved = { ...baseVessel, weatherMatrix: matrix };
    vi.mocked(saveFleetVessel).mockResolvedValue(saved);
    vi.mocked(fetchFleetVessels).mockResolvedValue([saved, office, quay]);
    await user.click(nextDialog.getByRole('button', { name: 'Enregistrer' }));
    await screen.findByText('Navire enregistré.');
    expect(saveFleetVessel).toHaveBeenCalledExactlyOnceWith(expect.anything(), expect.objectContaining({ id: 1, weatherMatrix: matrix }));
    expect(within(screen.getByRole('table', { name: 'Matrice Hs × période de GOURY' })).getByText('Peu confortable')).toBeInTheDocument();
  });

  it.each(['marin', 'capitaine'] as const)('exposes the saved capacities and matrix read-only for a real %s profile fixture', async (role) => {
    const user = userEvent.setup();
    vi.mocked(fetchFleetVessels).mockResolvedValue([{
      ...baseVessel, weatherMatrix: GOURY_WEATHER_MATRIX, fuelTankCapacitiesLiters: [7000, 5000], dailyFuelTankCapacityLiters: 800,
      dailyFuelTankName: role === 'capitaine' ? 'Caisse service' : null,
      capacitySections: [{ name: 'Eau douce', tanks: [{
        id: '8d2ac1e5-e963-4d04-8672-2a092841b402', name: 'Réserve', capacityLiters: 650, showInSoutes: true,
      }] }],
    }, office, quay]);
    render(<MemoryRouter><FleetPage client={{} as SupabaseClient} roles={[role]} /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'GOURY' });
    expect(screen.queryByRole('button', { name: 'Modifier' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ajouter' })).not.toBeInTheDocument();
    const fuel = within(screen.getByRole('region', { name: 'Carburant' }));
    expect(fuel.getByText('12 000 L')).toBeVisible();
    expect(fuel.getByText(role === 'capitaine' ? 'Caisse service' : 'Caisse journalière')).toBeVisible();
    expect(fuel.getByText('800 L')).toBeVisible();
    expect(fuel.queryByRole('textbox')).not.toBeInTheDocument();
    expect(fuel.queryByRole('spinbutton')).not.toBeInTheDocument();
    const freshWater = within(screen.getByRole('region', { name: 'Eau douce' }));
    expect(freshWater.getByText('650 L')).toBeVisible();
    expect(freshWater.queryByRole('checkbox')).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Conditions météo limites' }));
    const table = screen.getByRole('table', { name: 'Matrice Hs × période de GOURY' });
    expect(within(table).getAllByText('Confortable').length).toBeGreaterThan(0);
    expect(within(table).queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Appliquer le modèle GOURY' })).not.toBeInTheDocument();
    expect(saveFleetVessel).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /Bureaux\s*1/ }));
    expect(screen.queryByRole('tab', { name: 'Conditions météo limites' })).not.toBeInTheDocument();
    expect(screen.queryByRole('table', { name: /Matrice Hs/ })).not.toBeInTheDocument();
  });
});
