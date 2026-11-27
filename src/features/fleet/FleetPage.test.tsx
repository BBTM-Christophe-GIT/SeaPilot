import type { SupabaseClient } from '@supabase/supabase-js';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FleetPage } from './FleetPage';
import type { FleetVessel } from './fleetQueries';
import { fetchPlanningP11Data } from '../planning/planningP11Queries';
import { downloadFleetBrochure } from './fleetBrochure';
import { DEFAULT_FLEET_LAYOUT } from './fleetLayout';
import { fetchFleetLayout, saveFleetLayout } from './fleetLayoutQueries';
import { downloadFleetListPdfs } from './fleetListPdf';
import { fetchFleetVessels, resolveFleetVesselPhotoUrl, saveFleetVessel } from './fleetQueries';
import { createEmptyVesselWeatherMatrix, GOURY_WEATHER_MATRIX, vesselHsRange, vesselPeriodRange } from './vesselWeatherMatrix';

vi.mock('./fleetQueries', async (importOriginal) => {
  const original = await importOriginal<typeof import('./fleetQueries')>();
  return { ...original, fetchFleetVessels: vi.fn(), resolveFleetVesselPhotoUrl: vi.fn(), saveFleetVessel: vi.fn() };
});
vi.mock('../planning/planningP11Queries', () => ({ fetchPlanningP11Data: vi.fn() }));
vi.mock('./fleetBrochure', () => ({ downloadFleetBrochure: vi.fn() }));
vi.mock('./fleetLayoutQueries', () => ({ fetchFleetLayout: vi.fn(), saveFleetLayout: vi.fn() }));
vi.mock('./fleetListPdf', () => ({ downloadFleetListPdfs: vi.fn() }));
vi.mock('./FleetCapacityPlans', () => ({ FleetCapacityPlans: () => <section aria-label="Plans" /> }));

const baseVessel: FleetVessel = {
  id: 1, companyId: 1, name: 'GOURY', acronym: 'GRY', assetKind: 'vessel', typeLabel: 'Navire de charge',
  unitTypeLabel: 'Navire', fleetExitOn: '', registrationNumber: '934968', imoNumber: '9213870',
  registrationPort: 'MARSEILLE', callSign: 'FLBU', mmsi: '361001000', grossTonnage: '293', maxPeople: 12,
  crewMembers: '', medicalDotation: 'Dotation B', medicalEmergencyBag: false, lengthOverall: '30.62 m', flagState: 'France', active: true,
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
    vi.mocked(downloadFleetBrochure).mockReset().mockResolvedValue(undefined);
    vi.mocked(fetchFleetLayout).mockResolvedValue(DEFAULT_FLEET_LAYOUT);
    vi.mocked(saveFleetLayout).mockReset().mockImplementation(async (_client, _companyId, layout) => layout);
    vi.mocked(saveFleetVessel).mockReset();
  });

  describe('fleet list exports', () => {
    const dialogMethods = Object.getOwnPropertyDescriptors(HTMLDialogElement.prototype);

    beforeAll(() => {
      if (!dialogMethods.showModal) {
        Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
          configurable: true, value(this: HTMLDialogElement) { this.open = true; },
        });
      }
      if (!dialogMethods.close) {
        Object.defineProperty(HTMLDialogElement.prototype, 'close', {
          configurable: true, value(this: HTMLDialogElement) { this.open = false; },
        });
      }
    });

    afterAll(() => {
      if (!dialogMethods.showModal) Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
      if (!dialogMethods.close) Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
    });

    beforeEach(() => {
      vi.mocked(downloadFleetListPdfs).mockReset().mockResolvedValue(undefined);
    });

    it('opens with no selections and exports only the manually chosen vessel, column and languages', async () => {
      const user = userEvent.setup();
      const secondVessel = { ...baseVessel, id: 4, name: 'ROZEL' };
      const archivedVessel = { ...baseVessel, id: 5, name: 'ANCIEN NAVIRE', active: false };
      vi.mocked(fetchFleetVessels).mockResolvedValue([baseVessel, office, quay, secondVessel, archivedVessel]);
      render(<MemoryRouter><FleetPage client={{} as SupabaseClient} roles={['direction']} /></MemoryRouter>);
      await screen.findByRole('heading', { name: baseVessel.name });
      await user.click(screen.getByRole('button', { name: /Bureaux/ }));
      await user.click(screen.getByRole('checkbox', { name: 'Afficher les éléments retirés' }));
      await user.type(screen.getByRole('searchbox', { name: 'Rechercher un actif' }), 'Cherbourg');

      const menu = within(screen.getByRole('navigation', { name: 'Menu des navires' }));
      expect(menu.queryByRole('button', { name: 'Ajouter' })).not.toBeInTheDocument();
      await user.click(menu.getByRole('button', { name: 'Flotte' }));
      const dialog = within(screen.getByRole('dialog', { name: 'Exporter la flotte' }));
      for (const checkbox of dialog.getAllByRole('checkbox')) expect(checkbox).not.toBeChecked();
      expect(dialog.getByRole('button', { name: 'Télécharger le PDF' })).toBeDisabled();
      const shipOptions = within(dialog.getByRole('group', { name: 'Navires actifs' }));
      expect(shipOptions.getAllByRole('checkbox')).toHaveLength(2);
      await user.click(shipOptions.getByRole('button', { name: 'Tout sélectionner' }));
      expect(shipOptions.getByRole('checkbox', { name: baseVessel.name })).toBeChecked();
      expect(shipOptions.getByRole('checkbox', { name: secondVessel.name })).toBeChecked();
      await user.click(shipOptions.getByRole('button', { name: 'Tout désélectionner' }));
      expect(shipOptions.getByRole('checkbox', { name: baseVessel.name })).not.toBeChecked();
      await user.click(shipOptions.getByRole('checkbox', { name: secondVessel.name }));
      expect(dialog.getByRole('button', { name: 'Télécharger le PDF' })).toBeDisabled();

      const columns = within(dialog.getByRole('group', { name: 'Caractéristiques' }));
      await user.click(columns.getByRole('checkbox', { name: 'N° IMO' }));
      await user.click(dialog.getByRole('checkbox', { name: 'Français' }));
      await user.click(dialog.getByRole('checkbox', { name: 'Anglais' }));
      await user.click(dialog.getByRole('button', { name: 'Télécharger les PDF (.zip)' }));

      expect(await dialog.findByRole('status')).toHaveTextContent('Les deux PDF');
      expect(downloadFleetListPdfs).toHaveBeenCalledWith(
        [secondVessel],
        ['imoNumber'],
        ['fr', 'en'],
      );
    });

    it('retries an English PDF with vessel names only and resets selections on reopening', async () => {
      vi.mocked(downloadFleetListPdfs).mockRejectedValueOnce(new Error('Réduisez la sélection pour tenir sur une page.'));
      const user = userEvent.setup();
      render(<MemoryRouter><FleetPage client={{} as SupabaseClient} roles={['direction']} /></MemoryRouter>);
      await screen.findByRole('heading', { name: baseVessel.name });
      await user.click(screen.getByRole('button', { name: 'Flotte' }));
      const dialogElement = screen.getByRole('dialog', { name: 'Exporter la flotte' });
      const dialog = within(dialogElement);
      const submit = dialog.getByRole('button', { name: 'Télécharger le PDF' });
      await user.click(dialog.getByRole('checkbox', { name: 'Anglais' }));
      expect(submit).toBeDisabled();
      await user.click(dialog.getByRole('checkbox', { name: baseVessel.name }));
      await user.click(submit);
      expect(await dialog.findByRole('alert')).toHaveTextContent('Réduisez la sélection');
      expect(dialog.getByRole('checkbox', { name: 'Anglais' })).toBeChecked();
      await user.click(submit);
      expect(await dialog.findByRole('status')).toHaveTextContent('Le PDF est prêt.');
      expect(downloadFleetListPdfs).toHaveBeenLastCalledWith([baseVessel], [], ['en']);
      fireEvent(dialogElement, new Event('cancel', { cancelable: true }));
      expect(screen.queryByRole('dialog', { name: 'Exporter la flotte' })).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Flotte' }));
      const reopened = within(screen.getByRole('dialog', { name: 'Exporter la flotte' }));
      for (const checkbox of reopened.getAllByRole('checkbox')) expect(checkbox).not.toBeChecked();
      expect(reopened.getByRole('button', { name: 'Télécharger le PDF' })).toBeDisabled();
    });
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
    expect(screen.queryByRole('heading', { name: 'Source BBTM - Flotte' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Modifier' }));
    expect(within(screen.getByRole('dialog')).queryByRole('region', { name: 'Capacités' })).not.toBeInTheDocument();
  });

  it('groups vessel details under illustrated categories and hides the populated source record', async () => {
    render(<MemoryRouter><FleetPage client={{} as SupabaseClient} roles={['admin']} /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'GOURY' });

    const detail = within(screen.getByRole('article'));
    expect(detail.getByRole('tab', { name: 'Vue d’ensemble' })).toHaveAttribute('aria-selected', 'true');
    const fieldsByCategory = [
      ['Identification maritime', '934968'],
      ['Dimensions et tonnage', '8,5 m'],
      ['Propulsion et performances', 'CATERPILLAR C3512 B'],
      ['Navigation et conformité', 'DNV'],
      ['Équipage et sécurité', 'Dotation B'],
      ['Équipements et emménagements', 'Grue de pont'],
      ['Capacités', '110 000 L'],
    ];
    for (const [category, value] of fieldsByCategory) {
      const heading = detail.getByRole('heading', { name: category });
      expect(heading.querySelector('svg[aria-hidden="true"]')).toBeInTheDocument();
      expect(detail.getByRole('region', { name: category })).toHaveTextContent(value);
    }
    expect(detail.queryByRole('heading', { name: 'Source BBTM - Flotte' })).not.toBeInTheDocument();
    expect(detail.queryByText(/Élément SharePoint|Version source|Libellé actif source|Sortie de flotte source|Identifiant source|Dernière modification source/)).not.toBeInTheDocument();
    expect(detail.queryByText(baseVessel.sourceGuid)).not.toBeInTheDocument();
  });

  it('edits the BBTM brochure from the vessel detail', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><FleetPage client={{} as SupabaseClient} roles={['admin']} /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'GOURY' });
    await user.click(screen.getByRole('button', { name: 'Éditer brochure' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Éditer la brochure' }));
    await user.selectOptions(dialog.getByRole('combobox', { name: 'Format' }), 'folded');
    await user.selectOptions(dialog.getByRole('combobox', { name: 'Langue' }), 'en');
    await user.click(dialog.getByRole('button', { name: 'Télécharger le PDF' }));
    expect(await screen.findByText('La brochure de GOURY a été éditée.')).toBeInTheDocument();
    expect(downloadFleetBrochure).toHaveBeenCalledWith(baseVessel, '/vessels/goury.jpg', {
      format: 'folded', language: 'en', layout: DEFAULT_FLEET_LAYOUT, fallbackPhotoUrls: expect.any(Array),
    });
  });

  it('uses an administered category label on all vessels and in their brochures', async () => {
    const user = userEvent.setup();
    const client = {} as SupabaseClient;
    vi.mocked(fetchFleetVessels).mockResolvedValue([baseVessel, { ...baseVessel, id: 4, name: 'HIRONDELLE' }]);
    render(<MemoryRouter><FleetPage client={client} roles={['admin']} /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'GOURY' });
    await user.click(screen.getByRole('button', { name: 'Trame des navires' }));
    const editor = within(screen.getByRole('dialog', { name: 'Organisation des fiches navire' }));
    fireEvent.change(editor.getByRole('textbox', { name: 'Nom de la rubrique' }), { target: { value: 'Identité de l’unité' } });
    await user.click(editor.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByRole('heading', { name: 'Identité de l’unité' })).toBeVisible();
    expect(saveFleetLayout).toHaveBeenCalledWith(client, 1, expect.arrayContaining([expect.objectContaining({
      id: 'identity', label: 'Identité de l’unité',
    })]));
    await user.click(screen.getByRole('button', { name: /HIRONDELLE/ }));
    await screen.findByRole('heading', { name: 'HIRONDELLE' });
    expect(screen.getByRole('heading', { name: 'Identité de l’unité' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Éditer brochure' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Éditer la brochure' })).getByRole('button', { name: 'Télécharger le PDF' }));
    await waitFor(() => expect(downloadFleetBrochure).toHaveBeenCalledWith(expect.objectContaining({ name: 'HIRONDELLE' }),
      expect.any(String), expect.objectContaining({ layout: expect.arrayContaining([expect.objectContaining({ label: 'Identité de l’unité' })]) })));
  });

  it('validates editable English cover missions and saves the text on the vessel', async () => {
    const user = userEvent.setup();
    vi.mocked(saveFleetVessel).mockResolvedValue(baseVessel);
    render(<MemoryRouter><FleetPage client={{} as SupabaseClient} roles={['admin']} /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'GOURY' });
    await user.click(screen.getByRole('button', { name: 'Modifier' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Modifier l’actif' }));
    const operations = dialog.getByRole('textbox', { name: 'Usages opérationnels en anglais (un par ligne)' });
    const save = dialog.getByRole('button', { name: 'Enregistrer' });
    fireEvent.change(operations, { target: { value: 'x'.repeat(101) } });
    expect(operations).toBeInvalid();
    expect(save).toBeDisabled();
    fireEvent.change(operations, { target: { value: 'Offshore support\nDiving support' } });
    expect(operations).toBeValid();
    await user.click(save);
    expect(saveFleetVessel).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      name: 'GOURY', brochureCover: { en: { operations: ['Offshore support', 'Diving support'] } },
    }));
  });

  it('selects a regulatory dotation and persists the independent emergency bag choice', async () => {
    const user = userEvent.setup();
    const imported = { ...baseVessel, medicalDotation: 'Dotation médicale B - Médicaments (catégorie 2 - 200 miles)' };
    vi.mocked(fetchFleetVessels).mockResolvedValue([imported]);
    vi.mocked(saveFleetVessel).mockImplementation(async (_client, changes) => {
      const saved = { ...imported, medicalDotation: changes.medicalDotation, medicalEmergencyBag: changes.medicalEmergencyBag ?? false };
      vi.mocked(fetchFleetVessels).mockResolvedValue([saved]);
      return saved;
    });
    render(<MemoryRouter><FleetPage client={{} as SupabaseClient} roles={['admin']} /></MemoryRouter>);
    await user.click(await screen.findByRole('button', { name: 'Modifier' }));
    const editor = within(screen.getByRole('dialog', { name: 'Modifier l’actif' }));
    const dotation = editor.getByRole('combobox', { name: 'Dotation médicale' });
    const bag = editor.getByRole('checkbox', { name: "Sac Médical d'Urgence" });
    expect(within(dotation).getAllByRole('option').map(option => option.textContent)).toEqual([
      'Non renseignée', 'DOTATION A', 'DOTATION B', 'DOTATION B restreinte', 'DOTATION C', 'DOTATION C restreinte',
    ]);
    expect(dotation).toHaveValue('DOTATION B');
    expect(bag).not.toBeChecked();

    await user.click(bag);
    await user.click(editor.getByRole('button', { name: 'Enregistrer' }));
    await screen.findByText('Navire enregistré.');
    expect(saveFleetVessel).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({
      medicalDotation: imported.medicalDotation, medicalEmergencyBag: true,
    }));
    const crew = within(screen.getByRole('region', { name: 'Équipage et sécurité' }));
    expect(crew.getByText("Sac Médical d'Urgence", { selector: 'dt' }).nextElementSibling).toHaveTextContent(/^Oui$/);

    await user.click(screen.getByRole('button', { name: 'Modifier' }));
    const reopened = within(screen.getByRole('dialog', { name: 'Modifier l’actif' }));
    expect(reopened.getByRole('checkbox', { name: "Sac Médical d'Urgence" })).toBeChecked();
    await user.selectOptions(reopened.getByRole('combobox', { name: 'Dotation médicale' }), 'DOTATION C restreinte');
    await user.click(reopened.getByRole('checkbox', { name: "Sac Médical d'Urgence" }));
    await user.click(reopened.getByRole('button', { name: 'Enregistrer' }));
    expect(saveFleetVessel).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({
      medicalDotation: 'DOTATION C restreinte', medicalEmergencyBag: false,
    }));
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

  it('saves draft, net tonnage and summer freeboard separately from legacy lightship tonnage', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><FleetPage client={{} as SupabaseClient} roles={['admin']} /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'GOURY' });
    expect(screen.getByText('Tirant d’eau', { selector: 'dt' }).nextElementSibling).toHaveTextContent('—');
    expect(screen.getByText('Jauge nette', { selector: 'dt' }).nextElementSibling).toHaveTextContent('—');
    expect(screen.getByText('Hauteur du Franc Bord - Été', { selector: 'dt' }).nextElementSibling).toHaveTextContent('—');
    expect(screen.queryByText(/Jauge lège/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Modifier' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Modifier l’actif' }));
    const draft = dialog.getByRole('spinbutton', { name: 'Tirant d’eau (m)' });
    const netTonnage = dialog.getByRole('spinbutton', { name: 'Jauge nette' });
    const freeboard = dialog.getByRole('spinbutton', { name: 'Hauteur du Franc Bord - Été (mm)' });
    expect(draft).toHaveValue(null);
    expect(draft).toHaveAttribute('max', '50');
    expect(netTonnage).toHaveValue(null);
    expect(freeboard).toHaveValue(null);
    expect(dialog.queryByRole('spinbutton', { name: /Jauge lège/ })).not.toBeInTheDocument();
    await user.type(draft, '3.25');
    await user.type(netTonnage, '91');
    await user.type(freeboard, '875');
    const measurements = { draftMeters: 3.25, netTonnage: 91, summerFreeboardMm: 875 };
    const saved = { ...baseVessel, ...measurements };
    vi.mocked(saveFleetVessel).mockResolvedValue(saved);
    vi.mocked(fetchFleetVessels).mockResolvedValue([saved, office, quay]);
    await user.click(dialog.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Navire enregistré.')).toBeInTheDocument();
    expect(saveFleetVessel).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 1, ...measurements }));
    expect(screen.getByText('Tirant d’eau', { selector: 'dt' }).nextElementSibling).toHaveTextContent('3,25 m');
    expect(screen.getByText('Jauge nette', { selector: 'dt' }).nextElementSibling).toHaveTextContent(/^91$/);
    expect(screen.getByText('Hauteur du Franc Bord - Été', { selector: 'dt' }).nextElementSibling).toHaveTextContent('875 mm');
  });

  it('prefills saved measurements and lets the user clear them to unknown values', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchFleetVessels).mockResolvedValue([{
      ...baseVessel, draftMeters: 3.5, netTonnage: 91, summerFreeboardMm: 875,
    }, office, quay]);
    render(<MemoryRouter><FleetPage client={{} as SupabaseClient} roles={['admin']} /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'GOURY' });
    await user.click(screen.getByRole('button', { name: 'Modifier' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Modifier l’actif' }));
    const draft = dialog.getByRole('spinbutton', { name: 'Tirant d’eau (m)' });
    const netTonnage = dialog.getByRole('spinbutton', { name: 'Jauge nette' });
    const freeboard = dialog.getByRole('spinbutton', { name: 'Hauteur du Franc Bord - Été (mm)' });
    expect(draft).toHaveValue(3.5);
    expect(netTonnage).toHaveValue(91);
    expect(freeboard).toHaveValue(875);
    await user.clear(draft);
    await user.clear(netTonnage);
    await user.clear(freeboard);
    const cleared = { draftMeters: null, netTonnage: null, summerFreeboardMm: null };
    vi.mocked(saveFleetVessel).mockResolvedValue({ ...baseVessel, ...cleared });
    await user.click(dialog.getByRole('button', { name: 'Enregistrer' }));
    await screen.findByText('Navire enregistré.');
    expect(saveFleetVessel).toHaveBeenCalledWith(expect.anything(), expect.objectContaining(cleared));
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
      ...baseVessel, netTonnage: 91, summerFreeboardMm: 875, weatherMatrix: GOURY_WEATHER_MATRIX,
      medicalEmergencyBag: true,
      fuelTankCapacitiesLiters: [7000, 5000], dailyFuelTankCapacityLiters: 800,
      dailyFuelTankName: role === 'capitaine' ? 'Caisse service' : null,
      capacitySections: [{ name: 'Eau douce', tanks: [{
        id: '8d2ac1e5-e963-4d04-8672-2a092841b402', name: 'Réserve', capacityLiters: 650, showInSoutes: true,
      }] }],
    }, office, quay]);
    render(<MemoryRouter><FleetPage client={{} as SupabaseClient} roles={[role]} /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'GOURY' });
    expect(screen.queryByRole('button', { name: 'Modifier' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ajouter' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Identification maritime' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Source BBTM - Flotte' })).not.toBeInTheDocument();
    const crew = within(screen.getByRole('region', { name: 'Équipage et sécurité' }));
    expect(crew.getByText("Sac Médical d'Urgence", { selector: 'dt' }).nextElementSibling).toHaveTextContent(/^Oui$/);
    expect(crew.queryByRole('checkbox')).not.toBeInTheDocument();
    const dimensions = within(screen.getByRole('region', { name: 'Dimensions et tonnage' }));
    expect(dimensions.getByText('Jauge nette', { selector: 'dt' }).nextElementSibling).toHaveTextContent(/^91$/);
    expect(dimensions.getByText('Hauteur du Franc Bord - Été', { selector: 'dt' }).nextElementSibling).toHaveTextContent('875 mm');
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
    await user.click(screen.getByRole('tab', { name: 'Vue d’ensemble' }));
    expect(screen.getByRole('heading', { name: 'Identification maritime' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: /Bureaux\s*1/ }));
    expect(screen.queryByRole('tab', { name: 'Conditions météo limites' })).not.toBeInTheDocument();
    expect(screen.queryByRole('table', { name: /Matrice Hs/ })).not.toBeInTheDocument();
  });
});
