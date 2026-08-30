import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientEditor, ProjectEditor, ProjectPlanningEditor } from './ProjectEditors';

const mutationMocks = vi.hoisted(() => ({
  saveProject: vi.fn(),
  saveProjectPlanningOccurrence: vi.fn(),
  saveClient: vi.fn(),
  saveProjectContractDetails: vi.fn(),
  saveProjectContractHirePeriods: vi.fn(),
  saveProjectTowedAsset: vi.fn(),
}));

vi.mock('./projectMutations', async (importOriginal) => ({
  ...await importOriginal<typeof import('./projectMutations')>(),
  saveProject: mutationMocks.saveProject,
  saveProjectPlanningOccurrence: mutationMocks.saveProjectPlanningOccurrence,
  saveClient: mutationMocks.saveClient,
  saveProjectContractDetails: mutationMocks.saveProjectContractDetails,
  saveProjectContractHirePeriods: mutationMocks.saveProjectContractHirePeriods,
  saveProjectTowedAsset: mutationMocks.saveProjectTowedAsset,
}));

mutationMocks.saveProjectContractDetails.mockResolvedValue(undefined);
mutationMocks.saveProjectPlanningOccurrence.mockResolvedValue(901);
mutationMocks.saveClient.mockResolvedValue(52);

beforeEach(() => {
  vi.clearAllMocks();
});

const project = {
  id: 145,
  projectCode: 'P145',
  title: 'OIL SPILL SAIPEM COU',
  description: 'Contrat antipollution',
  startsOn: '2026-08-10',
  endsOn: '2026-08-12',
};
const vessels = [
  { id: 1, name: 'LE ROZEL', acronym: 'LRZ', active: true, fleetExitOn: '', sharePointItemId: '' },
  { id: 2, name: 'SUROIT', acronym: 'SRT', active: true, fleetExitOn: '', sharePointItemId: '' },
];

function renderEditor(canViewCharterHire: boolean) {
  return render(
    <ProjectPlanningEditor
      canViewCharterHire={canViewCharterHire}
      client={{ rpc: vi.fn() } as never}
      initialVesselIds={[1]}
      onClose={vi.fn()}
      onSaved={vi.fn()}
      project={project}
      vessels={vessels}
    />,
  );
}

describe('ProjectPlanningEditor permissions', () => {
  it('never renders charter-hire controls for non Admin/Direction profiles', () => {
    renderEditor(false);
    expect(screen.queryByLabelText('Loyer d’affrètement')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Devise')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ajouter un navire' })).toBeInTheDocument();
  });

  it('renders charter-hire controls for Admin/Direction profiles', () => {
    renderEditor(true);
    expect(screen.getByLabelText('Loyer d’affrètement')).toBeInTheDocument();
    expect(screen.getByLabelText('Devise')).toBeInTheDocument();
  });
});

describe('ProjectEditor contract hire periods', () => {
  it('replaces the hire schedule with one daily EUR hire for a commercial offer', async () => {
    const user = userEvent.setup();
    render(
      <ProjectEditor
        client={{ rpc: vi.fn().mockResolvedValue({ data: 'P999', error: null }) } as never}
        clients={[]}
        contractTypes={[]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        statuses={['Non validé']}
        towedAssets={[]}
        vessels={vessels}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Offre Commerciale/ }));

    expect(screen.queryByRole('region', { name: 'Barème des loyers d’affrètement' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Loyer en prolongation')).not.toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: /Loyer d’affrètement/ })).toBeInTheDocument();
    expect(screen.getByText('€ / jour')).toBeInTheDocument();
  });

  it('separates BIMCO from the categorized document library and accepts several expiring files', async () => {
    const user = userEvent.setup();
    render(
      <ProjectEditor
        client={{ rpc: vi.fn().mockResolvedValue({ data: 'P999', error: null }) } as never}
        clients={[]}
        contractTypes={['Offre commerciale']}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        statuses={['Non validé']}
        towedAssets={[]}
        vessels={vessels}
      />,
    );

    expect(screen.getAllByRole('option').filter((option) => (
      ['Offre Commerciale', 'Contrat de Remorquage', 'BIMCO'].includes(option.textContent || '')
    )).map((option) => option.textContent)).toEqual(['Offre Commerciale', 'Contrat de Remorquage', 'BIMCO']);
    const contractType = screen.getByLabelText('Type de contrat');
    await user.selectOptions(contractType, 'BIMCO');
    expect(screen.getByText('1 / 29')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Page suivante' }));
    expect(screen.getByText('2 / 29')).toBeInTheDocument();
    await user.selectOptions(contractType, 'Offre Commerciale');
    expect(screen.getByText('1 / 1')).toBeInTheDocument();
    await user.selectOptions(contractType, 'BIMCO');
    expect(screen.getByRole('button', { name: /BIMCO/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Documents/ }));
    expect(screen.getByRole('region', { name: 'Pièces jointes du projet' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Offre Commerciale' })).toBeInTheDocument();
    expect(screen.getByText('HSE')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Facturation' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Toilette de Mer' })).toBeInTheDocument();
    expect(screen.getByText('Attestation Expert/BV')).toBeInTheDocument();

    const fileInput = screen.getByLabelText('Ajouter des documents · Offre Commerciale · Contrat');
    await user.upload(fileInput, [
      new File(['contrat'], 'contrat.pdf', { type: 'application/pdf' }),
      new File(['annexe'], 'annexe.pdf', { type: 'application/pdf' }),
    ]);
    expect(screen.getByText('contrat.pdf')).toBeInTheDocument();
    expect(screen.getByText('annexe.pdf')).toBeInTheDocument();
    expect(screen.getByLabelText('Date d’échéance de contrat.pdf')).toHaveAttribute('type', 'date');
  });

  it('copies project boundaries to planning timestamps and defaults the Fuel terms', async () => {
    const user = userEvent.setup();
    render(
      <ProjectEditor
        client={{ rpc: vi.fn().mockResolvedValue({ data: 'P999', error: null }) } as never}
        clients={[]}
        contractTypes={[]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        statuses={['Non validé']}
        towedAssets={[]}
        vessels={vessels}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Opérations/ }));
    fireEvent.input(screen.getByLabelText('Début du projet'), { target: { value: '2026-09-04' } });
    fireEvent.input(screen.getByLabelText('Fin du projet'), { target: { value: '2026-09-11' } });

    expect(screen.getByLabelText('Livraison *')).toHaveValue('2026-09-04T10:00');
    expect(screen.getByLabelText('Début d’affrètement')).toHaveValue('2026-09-04T10:00');
    expect(screen.getByLabelText('Restitution *')).toHaveValue('2026-09-11T18:00');
    expect(screen.getByLabelText('Fin d’affrètement')).toHaveValue('2026-09-11T18:00');

    await user.click(screen.getByRole('button', { name: /Offre Commerciale/ }));
    expect(screen.getByLabelText('Fuel')).toHaveValue("A la charge de l'affréteur");
  });

  it('asks for the vessel, delivery and redelivery before creating a new planning operation', async () => {
    const user = userEvent.setup();
    mutationMocks.saveProject.mockClear();
    mutationMocks.saveProjectPlanningOccurrence.mockClear();
    render(
      <ProjectEditor
        client={{ rpc: vi.fn().mockResolvedValue({ data: 'P999', error: null }) } as never}
        clients={[]}
        contractTypes={[]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        statuses={['Non validé']}
        towedAssets={[]}
        vessels={vessels}
      />,
    );

    await user.type(screen.getByLabelText('Nom du projet *'), 'Mission automatique');
    await user.click(screen.getByRole('button', { name: 'Créer le projet' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'renseignez le navire principal, la livraison, la restitution',
    );
    expect(screen.getByRole('button', { name: /Opérations/ })).toHaveAttribute('aria-current', 'step');
    expect(mutationMocks.saveProject).not.toHaveBeenCalled();
    expect(mutationMocks.saveProjectPlanningOccurrence).not.toHaveBeenCalled();
  });

  it('creates a non-validated planning operation from Delivery, Redelivery and selected vessels', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    mutationMocks.saveProject.mockClear();
    mutationMocks.saveProjectPlanningOccurrence.mockClear();
    mutationMocks.saveProject.mockResolvedValueOnce({
      id: 501,
      projectCode: 'P501',
      title: 'Mission automatique',
      updatedAt: '2026-08-20T15:00:00Z',
    });
    render(
      <ProjectEditor
        client={{ rpc: vi.fn().mockResolvedValue({ data: 'P501', error: null }) } as never}
        clients={[]}
        contractTypes={[]}
        onClose={vi.fn()}
        onSaved={onSaved}
        statuses={['Non validé']}
        towedAssets={[]}
        vessels={vessels}
      />,
    );

    await user.type(screen.getByLabelText('Nom du projet *'), 'Mission automatique');
    await user.type(screen.getByLabelText('Description'), 'Inspection en mer');
    await user.click(screen.getByRole('button', { name: /Opérations/ }));
    fireEvent.change(screen.getByLabelText('Livraison *'), { target: { value: '2026-09-04T10:00' } });
    fireEvent.change(screen.getByLabelText('Restitution *'), { target: { value: '2026-09-11T18:00' } });
    await user.click(screen.getByRole('button', { name: /Facturation/ }));
    await user.selectOptions(screen.getByLabelText('Navire principal *'), '1');
    await user.selectOptions(screen.getByLabelText('Navire secondaire'), '2');
    await user.click(screen.getByRole('button', { name: 'Créer le projet' }));

    await waitFor(() => {
      expect(mutationMocks.saveProjectPlanningOccurrence).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          endsOn: '2026-09-11',
          projectId: 501,
          startsOn: '2026-09-04',
          status: 'Non validé',
          vesselIds: [1, 2],
        }),
      );
    });
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 501, projectCode: 'P501' }));
  });

  it('shows contractual defaults and loads an editable towed asset for a towage contract', async () => {
    const user = userEvent.setup();
    render(
      <ProjectEditor
        client={{ rpc: vi.fn().mockResolvedValue({ data: 'P999', error: null }) } as never}
        clients={[]}
        contractTypes={['Affrètement à temps', 'Oil Spill Response', 'Contrat de Remorquage - BBTM']}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        statuses={['Non validé']}
        towedAssets={[{
          id: 8,
          name: 'DENVER',
          assetType: 'AUTOMOTEUR FLUVIAL',
          lengthOverallM: 82,
          breadthOverallM: 8.2,
          maxDraftM: 1,
          lightDisplacementT: 700,
          flag: 'FR',
          classificationSociety: '',
          registrationNumber: '',
          ownerName: '',
          hullMachineryInsurer: '',
        liabilityInsurer: '',
        photoUrl: '',
        photoStoragePath: '',
          active: true,
        }]}
        vessels={vessels}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Offre Commerciale/ }));
    expect(screen.getByLabelText('Devise des frais')).toHaveValue('EUR');
    expect(screen.getByRole('option', { name: '€ — EUR' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Aperçu de l’identité armateur')).not.toBeInTheDocument();
    const commercialFields = [
      screen.getByLabelText('Identité armateur'),
      screen.getByRole('spinbutton', { name: /Loyer d’affrètement/ }),
      screen.getByLabelText('Frais de mobilisation'),
      screen.getByLabelText('Frais de démobilisation'),
      screen.getByLabelText('Devise des frais'),
      screen.getByLabelText('Fuel'),
    ];
    commercialFields.forEach((field) => expect(field.closest('label')).toHaveClass('is-wide'));
    commercialFields.slice(1).forEach((field, index) => {
      expect(commercialFields[index].compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    const contractType = screen.getByLabelText('Type de contrat');
    await user.selectOptions(contractType, 'Contrat de Remorquage');
    expect(screen.getByRole('region', { name: 'Remorqué' })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Nom du remorqué'), '8');
    expect(screen.getByLabelText('Type d’engin, de navire ou de colis')).toHaveValue('AUTOMOTEUR FLUVIAL');
    expect(screen.getByLabelText('Longueur hors tout (m)')).toHaveValue(82);
  });

  it('shows commercial reserves in the offer only when Operations contains a selection or free text', async () => {
    const user = userEvent.setup();
    render(
      <ProjectEditor
        client={{ rpc: vi.fn().mockResolvedValue({ data: 'P999', error: null }) } as never}
        clients={[]}
        contractTypes={[]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        statuses={['Non validé']}
        towedAssets={[]}
        vessels={vessels}
      />,
    );

    const preview = within(screen.getByRole('region', { name: 'Aperçu du document généré' }));
    expect(preview.queryByText('RÉSERVES COMMERCIALES')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Opérations/ }));
    const availability = screen.getByRole('checkbox', {
      name: 'Sous réserve de disponibilité du navire et de validation technique et contractuelle.',
    });
    await user.click(availability);
    expect(preview.getByText('RÉSERVES COMMERCIALES')).toBeInTheDocument();
    expect(preview.getByText('Sous réserve de disponibilité du navire et de validation technique et contractuelle.')).toBeInTheDocument();

    await user.click(availability);
    expect(preview.queryByText('RÉSERVES COMMERCIALES')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Autre réserve'), 'Sous réserve de l’accord du port.');
    expect(preview.getByText('Sous réserve de l’accord du port.')).toBeInTheDocument();
  });

  it('does not rewrite an unchanged historical project while its contract snapshot is missing', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();

    render(
      <ProjectEditor
        client={{ rpc: vi.fn() } as never}
        clients={[]}
        contractTypes={[]}
        towedAssets={[]}
        onClose={vi.fn()}
        onSaved={onSaved}
        project={{
          ...project,
          contractType: 'BIMCO',
          id: 60,
          clientId: null,
          projectCode: 'P268',
          status: 'Non validé',
          updatedAt: '2026-08-07T08:05:49Z',
        } as never}
        statuses={['Non validé']}
        vessels={vessels}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Enregistrer le projet' }));

    expect(mutationMocks.saveProject).not.toHaveBeenCalled();
    expect(mutationMocks.saveProjectContractDetails).toHaveBeenCalledWith(
      expect.anything(),
      60,
      expect.objectContaining({ ownerIdentity: expect.stringContaining('BBTM'), feeCurrency: 'EUR' }),
      null,
    );
    expect(mutationMocks.saveProjectContractHirePeriods).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 60, projectCode: 'P268' }));
  });

  it('saves a changed hire schedule without rewriting an unchanged project', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    mutationMocks.saveProjectContractHirePeriods.mockResolvedValue(undefined);

    render(
      <ProjectEditor
        client={{ rpc: vi.fn() } as never}
        clients={[]}
        contract={{
          charterHire: 4450,
          hireCurrency: 'EUR',
          hirePeriods: [{
            charterHire: 4450,
            standbyHire: 3200,
            weatherStandbyHire: 2200,
            contractId: 3,
            endsOn: '2025-06-20',
            hireCurrency: 'EUR',
            hireUnit: 'Journalier',
            id: 1,
            projectId: 2,
            startsOn: '2024-05-31',
          }],
          hireUnit: 'Journalier',
        } as never}
        contractTypes={[]}
        towedAssets={[]}
        onClose={vi.fn()}
        onSaved={onSaved}
        project={{
          ...project,
          contractType: 'BIMCO',
          clientId: null,
          projectCode: 'P144',
          status: 'Non validé',
          updatedAt: '2026-08-10T10:00:00Z',
        } as never}
        statuses={['Non validé']}
        vessels={vessels}
      />,
    );

    await user.click(screen.getByRole('button', { name: /BIMCO/ }));
    await user.click(screen.getByRole('button', { name: /Facturation/ }));
    await user.click(screen.getByRole('button', { name: 'Ajouter une période' }));
    await user.click(screen.getByRole('button', { name: 'Enregistrer le projet' }));

    await waitFor(() => {
      expect(mutationMocks.saveProjectContractHirePeriods).toHaveBeenCalledWith(
        expect.anything(),
        145,
        expect.arrayContaining([
          expect.objectContaining({ startsOn: '2024-05-31', charterHire: 4450, standbyHire: 3200, weatherStandbyHire: 2200 }),
          expect.objectContaining({ startsOn: '2025-06-21', charterHire: 4450, standbyHire: 3200, weatherStandbyHire: 2200 }),
        ]),
      );
    });
    expect(mutationMocks.saveProject).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 145, projectCode: 'P144' }));
  });
});

describe('ClientEditor representative', () => {
  it('formats first and last names and saves their combined display value', async () => {
    const user = userEvent.setup();
    render(
      <ClientEditor
        client={{ rpc: vi.fn() } as never}
        clientRecord={{
          id: 50,
          name: 'COSMA',
          representedBy: 'Marie DUPONT DE LA TOUR',
          updatedAt: '2026-08-20T10:00:00Z',
        } as never}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Prénom')).toHaveValue('Marie');
    expect(screen.getByLabelText('NOM')).toHaveValue('DUPONT DE LA TOUR');

    await user.clear(screen.getByLabelText('Prénom'));
    await user.type(screen.getByLabelText('Prénom'), 'jEAN-pIERRE');
    await user.clear(screen.getByLabelText('NOM'));
    await user.type(screen.getByLabelText('NOM'), 'dupré martin');
    expect(screen.getByLabelText('Prénom')).toHaveValue('Jean-Pierre');
    expect(screen.getByLabelText('NOM')).toHaveValue('DUPRÉ MARTIN');

    await user.click(screen.getByRole('button', { name: 'Enregistrer dans Supabase' }));
    await waitFor(() => {
      expect(mutationMocks.saveClient).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ representedBy: 'Jean-Pierre DUPRÉ MARTIN' }),
      );
    });
  });
});
