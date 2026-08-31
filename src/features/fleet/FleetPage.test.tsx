import type { SupabaseClient } from '@supabase/supabase-js';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FleetPage } from './FleetPage';
import type { FleetVessel } from './fleetQueries';
import { fetchPlanningP11Data } from '../planning/planningP11Queries';
import { downloadFleetBrochure } from './fleetBrochure';
import { fetchFleetVessels, resolveFleetVesselPhotoUrl } from './fleetQueries';

vi.mock('./fleetQueries', async (importOriginal) => {
  const original = await importOriginal<typeof import('./fleetQueries')>();
  return { ...original, fetchFleetVessels: vi.fn(), resolveFleetVesselPhotoUrl: vi.fn() };
});
vi.mock('../planning/planningP11Queries', () => ({ fetchPlanningP11Data: vi.fn() }));
vi.mock('./fleetBrochure', () => ({ downloadFleetBrochure: vi.fn() }));

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

    await user.click(screen.getByRole('button', { name: /Bureaux\s*1/ }));
    expect(await screen.findByRole('heading', { name: 'Armement - Cherbourg' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Éditer brochure' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Décision d’effectif' })).not.toBeInTheDocument();
  });

  it('edits the BBTM brochure from the vessel detail', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><FleetPage client={{} as SupabaseClient} roles={['admin']} /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'GOURY' });
    await user.click(screen.getByRole('button', { name: 'Éditer brochure' }));
    expect(downloadFleetBrochure).toHaveBeenCalledWith(baseVessel, '/vessels/goury.jpg');
    expect(await screen.findByText('La brochure de GOURY a été éditée.')).toBeInTheDocument();
  });
});
