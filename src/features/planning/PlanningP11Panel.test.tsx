import type { SupabaseClient } from '@supabase/supabase-js';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ManningTab, PlanningP11Panel } from './PlanningP11Panel';
import type { PlanningP11Data } from './planningP11';
import type { PlanningOverview } from './planningQueries';
import {
  applyPlanningTemplate,
  fetchPlanningP11Data,
  savePlanningManningMatrix,
  savePlanningRotation,
  savePlanningTemplate,
  updatePlanningRotationOccurrence,
} from './planningP11Queries';

vi.mock('./planningP11Queries', () => ({
  applyPlanningTemplate: vi.fn(),
  fetchPlanningP11Data: vi.fn(),
  savePlanningManningMatrix: vi.fn(),
  savePlanningRotation: vi.fn(),
  savePlanningTemplate: vi.fn(),
  updatePlanningRotationOccurrence: vi.fn(),
}));

const client = {} as SupabaseClient;
const overview: PlanningOverview = {
  vessels: [{ id: 1, name: 'COTENTIN', acronym: 'CTN', active: true }],
  people: [
    { id: 10, firstName: 'Anne', lastName: 'MARTIN', functionLabel: 'Capitaine', gradeLabel: '', roleLabel: '', contractType: 'CDI', hiredOn: '', departedOn: '', active: true },
    { id: 11, firstName: 'Paul', lastName: 'DURAND', functionLabel: 'Matelot', gradeLabel: '', roleLabel: '', contractType: 'CDI', hiredOn: '', departedOn: '', active: true },
  ],
  assignments: [], days: [], periods: [], projects: [], certificates: [], hrDocuments: [], rules: [],
  publications: [], versions: [], history: [], handovers: [], derogations: [], derogationHistory: [],
};

describe('Planning P1.1 panel', () => {
  beforeEach(() => {
    vi.mocked(fetchPlanningP11Data).mockResolvedValue({ rotations: [], templates: [], matrices: [], certificates: [] });
    vi.mocked(savePlanningRotation).mockResolvedValue(5);
    vi.mocked(savePlanningTemplate).mockResolvedValue(6);
    vi.mocked(savePlanningManningMatrix).mockResolvedValue(7);
    vi.mocked(updatePlanningRotationOccurrence).mockResolvedValue(1);
    vi.mocked(applyPlanningTemplate).mockResolvedValue({ entityKind: 'project', entityId: 8 });
  });

  it('generates a 14/14 rotation and refreshes only assignments', async () => {
    const user = userEvent.setup();
    const onOperationalChange = vi.fn().mockResolvedValue(undefined);
    render(<PlanningP11Panel canManageRotations canManageTemplates client={client} onClose={vi.fn()} onOperationalChange={onOperationalChange} overview={overview} />);
    await screen.findByRole('heading', { name: 'Rotations d’équipage' });
    expect(screen.queryByRole('tab', { name: 'Décision d’effectif' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Nouvelle rotation' }));
    const form = screen.getByRole('button', { name: 'Générer la série' }).closest('form')!;
    expect(within(form).getByLabelText('Rythme')).toHaveValue('14_14');
    expect(within(form).getByLabelText('Période embarquée')).toHaveValue(14);
    expect(within(form).getByLabelText('Période de repos')).toHaveValue(14);
    await user.click(within(form).getByRole('button', { name: 'Générer la série' }));
    await waitFor(() => expect(savePlanningRotation).toHaveBeenCalledWith(client, expect.objectContaining({ patternKey: '14_14', onboardDays: 14, restDays: 14, occurrenceCount: 6 })));
    expect(onOperationalChange).toHaveBeenCalledWith('assignments');
    expect(await screen.findByText('6 occurrence(s) générée(s) dans les affectations.')).toBeInTheDocument();
  });

  it('confirms the saved rotation when the operational refresh fails', async () => {
    const user = userEvent.setup();
    const consoleWarning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const onOperationalChange = vi.fn().mockRejectedValue(new Error('refresh failed'));
    render(<PlanningP11Panel canManageRotations canManageTemplates client={client} onClose={vi.fn()} onOperationalChange={onOperationalChange} overview={overview} />);
    await screen.findByRole('heading', { name: 'Rotations d’équipage' });
    await user.click(screen.getByRole('button', { name: 'Nouvelle rotation' }));
    await user.click(screen.getByRole('button', { name: 'Générer la série' }));

    expect(await screen.findByText('La rotation et ses 6 occurrence(s) sont enregistrées, mais l’affichage n’a pas pu être actualisé. Utilisez le bouton Actualiser.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Générer la série' })).not.toBeInTheDocument();
    expect(screen.queryByText('Impossible d’enregistrer la rotation.')).not.toBeInTheDocument();
    expect(consoleWarning).toHaveBeenCalledWith('[Planning]', expect.objectContaining({ operation: 'refresh-after-save-rotation' }));
    consoleWarning.mockRestore();
  });

  it('shows the vessel staffing reference without Planning comparison in read-only mode', async () => {
    const data: PlanningP11Data = {
      rotations: [], templates: [], certificates: [], matrices: [{
        id: 2, vesselId: 1, name: 'Armement COTENTIN', navigationGenre: 'CN-CABOTAGE NATIONAL', activityDescription: 'Navigation côtière', effectiveFrom: '2026-01-01', effectiveTo: '', status: 'active', notes: '', version: 1,
        requirements: [{ id: 3, matrixId: 2, functionLabel: 'Capitaine', minimumCount: 1, targetCount: 1, requiredCertificates: [], requiredQualifications: [], requiredAuthorizations: [], requiredTrainings: [], restrictions: [], displayOrder: 0 }],
      }],
    };
    render(<ManningTab client={client} data={data} editable={false} fixedVesselId={1} linkToPlanning={false} onReload={vi.fn()} overview={overview} range={{ start: '2026-08-01', end: '2026-08-31' }} setFeedback={vi.fn()} />);
    expect(await screen.findByRole('heading', { name: 'Armement COTENTIN' })).toBeInTheDocument();
    expect(screen.getByText('CN-CABOTAGE NATIONAL')).toBeInTheDocument();
    expect(screen.getByText('Navigation côtière')).toBeInTheDocument();
    const row = screen.getByRole('cell', { name: 'Capitaine' }).closest('tr')!;
    expect(within(row).getAllByRole('cell')).toHaveLength(3);
    expect(within(row).getAllByRole('cell')[1]).toHaveTextContent('Aucun');
    expect(screen.queryByRole('button', { name: 'Configurer' })).not.toBeInTheDocument();
  });

  it('uses a Situation selector and a STCW multi-select without the removed matrix fields', async () => {
    const data: PlanningP11Data = {
      rotations: [], templates: [], matrices: [],
      certificates: [
        { id: 1, sourceItemId: 3, name: 'Capitaine 200', category: 'Pont', stcwRules: ['II/3'] },
        { id: 2, sourceItemId: 11, name: 'Chef de Quart Machine', category: 'Machine', stcwRules: ['III/1'] },
        { id: 3, sourceItemId: 25, name: 'CFBS', category: 'Formation de Sécurité', stcwRules: [] },
        { id: 4, sourceItemId: 47, name: 'CACES', category: 'Conduite d’Engin', stcwRules: [] },
        { id: 5, sourceItemId: 38, name: 'Contrat', category: 'Ressources Humaines', stcwRules: [] },
      ],
    };
    const user = userEvent.setup();
    render(<ManningTab client={client} data={data} editable fixedVesselId={1} linkToPlanning={false} onReload={vi.fn().mockResolvedValue(undefined)} overview={overview} range={{ start: '2026-08-01', end: '2026-08-31' }} setFeedback={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Nouvelle situation' }));

    expect(screen.getByLabelText('Situation')).toHaveValue('Situation 1');
    expect(screen.getAllByRole('option', { name: /Situation/ })).toHaveLength(6);
    const navigationSelect = screen.getByLabelText('Genre(s) de navigation');
    expect([...navigationSelect.querySelectorAll('option')].map((option) => option.textContent)).toEqual([
      'Sélectionner un genre de navigation',
      'CI-CABOTAGE INTERNATIONAL',
      'CN-CABOTAGE NATIONAL',
      'NC-NAVIGATION COTIERE',
    ]);
    const activitySelect = screen.getByLabelText('Description de l’activité, des conditions d’exploitation, des limites d’exploitation');
    expect([...activitySelect.querySelectorAll('option')].map((option) => option.textContent)).toEqual([
      'Sélectionner une description',
      "Assistance aux travaux, support de plongée, transfert de personnel, 4ème catégorie de navigation, séjour à la mer d'une durée maximale de 6 heures en respectant les conditions du permis de navigation.",
      'Navigation limitée à 20 milles des côtes / Zone radio SMDSM : A1',
      'Navigation limitée à 200 milles des côtes / Zone radio SMDSM : A1-A2',
      "Navire en exploitation en 4ème et 3ème catégorie de navigation d'une durée n'excédant pas 24 heures",
      "Navire en exploitation en 5ème catégorie de navigation d'une durée n'excédant pas 24 heures",
      'Vedette de servitude polyvalente - 3eme catégorie de navigation zone A1',
      'Texte personnalisé…',
    ]);
    expect(screen.queryByLabelText('Minimum')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Cible')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Qualifications')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Formations')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Restrictions')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Applicable à partir du')).not.toBeInTheDocument();
    const functionSelect = screen.getByLabelText('Fonction');
    expect([...functionSelect.querySelectorAll('optgroup')].map((group) => group.label)).toEqual(['Pont', 'Machine']);
    expect([...functionSelect.querySelectorAll('option')].map((option) => option.textContent)).toEqual([
      'Sélectionner une fonction',
      'Capitaine', '2nd Capitaine', 'Lieutenant pont', 'Officier chef de quart passerelle',
      'Officier chargé de la sécurité', 'Officier chargé de la sûreté du navire – SSO',
      'Officier chargé des opérations cargo', 'Officier de positionnement dynamique – DPO',
      'Maître d’équipage', 'Matelot qualifié pont', 'Matelot', 'Matelot de quart',
      'Matelot polyvalent pont/machine', 'Chef mécanicien', '2nd Mécanicien',
      'Officier chef de quart machine', 'Officier électrotechnicien – ETO', 'Maître machine',
      'Matelot machine', 'Matelot polyvalent pont/machine',
    ]);
    await user.selectOptions(functionSelect, 'Capitaine');
    await user.selectOptions(navigationSelect, 'CI-CABOTAGE INTERNATIONAL');
    await user.selectOptions(activitySelect, 'Texte personnalisé…');
    await user.type(screen.getByLabelText('Description personnalisée de l’activité'), 'Navigation saisonnière sous dérogation locale');
    await user.type(screen.getByLabelText('Prescriptions ou conditions spéciales (le cas échéant)'), 'Veille renforcée');
    const brevetPicker = screen.getByRole('group', { name: 'Brevets requis pour Capitaine' });
    expect(within(brevetPicker).getAllByRole('heading', { level: 6 }).map((heading) => heading.textContent)).toEqual(['Pont', 'Machine', 'Formation de Sécurité']);
    expect(within(brevetPicker).queryByRole('checkbox', { name: /CACES/ })).not.toBeInTheDocument();
    const authorizationPicker = screen.getByRole('group', { name: 'Habilitations requises pour Capitaine' });
    expect(within(authorizationPicker).getByRole('checkbox', { name: /CACES/ })).toBeInTheDocument();
    expect(within(authorizationPicker).getByRole('checkbox', { name: /Contrat/ })).toBeInTheDocument();
    expect(within(authorizationPicker).queryByRole('checkbox', { name: /Capitaine 200/ })).not.toBeInTheDocument();
    await user.click(within(brevetPicker).getByRole('checkbox', { name: /Capitaine 200/ }));
    await user.click(within(authorizationPicker).getByRole('checkbox', { name: /CACES/ }));
    await user.click(screen.getByRole('button', { name: 'Enregistrer la situation' }));

    await waitFor(() => expect(savePlanningManningMatrix).toHaveBeenCalledWith(client, expect.objectContaining({
      name: 'Situation 1',
      navigationGenre: 'CI-CABOTAGE INTERNATIONAL',
      activityDescription: 'Navigation saisonnière sous dérogation locale',
      notes: 'Veille renforcée',
      status: 'active',
      requirements: [expect.objectContaining({ minimumCount: 1, targetCount: 1, requiredCertificates: ['Capitaine 200'], requiredAuthorizations: ['CACES'], requiredQualifications: [], requiredTrainings: [], restrictions: [] })],
    })));
  });

  it('reclassifies catalog values without deleting legacy staffing requirements', async () => {
    const data: PlanningP11Data = {
      rotations: [], templates: [],
      certificates: [
        { id: 1, sourceItemId: 3, name: 'Capitaine 200', category: 'Pont', stcwRules: ['II/3'] },
        { id: 2, sourceItemId: 47, name: 'CACES', category: 'Conduite d’Engin', stcwRules: [] },
      ],
      matrices: [{
        id: 2, vesselId: 1, name: 'Situation 2', navigationGenre: 'CN-CABOTAGE NATIONAL', activityDescription: 'Navigation limitée à 20 milles des côtes / Zone radio SMDSM : A1', effectiveFrom: '2026-01-01', effectiveTo: '', status: 'active', notes: '', version: 1,
        requirements: [{
          id: 3, matrixId: 2, functionLabel: 'Capitaine', minimumCount: 1, targetCount: 1,
          requiredCertificates: ['Legacy brevet', 'CACES'], requiredQualifications: [],
          requiredAuthorizations: ['Legacy habilitation', 'Capitaine 200'], requiredTrainings: [], restrictions: [], displayOrder: 0,
        }],
      }],
    };
    const user = userEvent.setup();
    render(<ManningTab client={client} data={data} editable fixedVesselId={1} linkToPlanning={false} onReload={vi.fn().mockResolvedValue(undefined)} overview={overview} range={{ start: '2026-08-01', end: '2026-08-31' }} setFeedback={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Configurer' }));
    await user.click(screen.getByRole('button', { name: 'Enregistrer la situation' }));

    await waitFor(() => expect(savePlanningManningMatrix).toHaveBeenCalledWith(client, expect.objectContaining({
      requirements: [expect.objectContaining({
        requiredCertificates: ['Legacy brevet', 'Capitaine 200'],
        requiredAuthorizations: ['Legacy habilitation', 'CACES'],
      })],
    })));
  });
});
