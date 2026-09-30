import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoleKey } from '../permissions/roles';
import type { AppShellOutletContext } from '../shell/AppShell';
import { InternalAuditsPage } from './InternalAuditsPage';
import type { AuditFinding, AuditFindingStatus, AuditTemplate, InternalAudit } from './internalAuditModel';
import type { InternalAuditData } from './internalAuditQueries';
import { createInternalAuditPreviewData } from './internalAuditPreview';

const queries = vi.hoisted(() => ({ fetchInternalAuditData: vi.fn(), saveAuditTemplate: vi.fn(), saveInternalAudit: vi.fn(), saveAuditFinding: vi.fn(), saveAuditSite: vi.fn(), addAuditFindingTreatment: vi.fn() }));
vi.mock('./internalAuditQueries', () => queries);

let fixture: InternalAuditData;
function renderPage(roles: RoleKey[] = ['armement']) {
  const currentPerson = { id: 9301, firstName: 'Test', lastName: 'AUDITEUR', functionLabel: 'Armement', gradeLabel: '', active: true, hiredOn: '2020-01-01', departedOn: '' };
  const context: AppShellOutletContext = {
    roles, client: {} as never, previewMode: false,
    currentPerson,
  };
  return render(<MemoryRouter><Routes><Route element={<Outlet context={context} />}><Route path="*" element={<InternalAuditsPage />} /></Route></Routes></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  fixture = createInternalAuditPreviewData();
  fixture.audits.sort((a, b) => a.year - b.year);
  fixture.templates = fixture.templates.map((template) => ({ ...template, rows: template.rows.slice(0, 2) }));
  fixture.audits = fixture.audits.map((audit) => ({ ...audit, rows: audit.rows.slice(0, 2) }));
  fixture.findings[0].questionId = fixture.audits[1].rows[0].id;
  fixture.findings[0].reference = fixture.audits[1].rows[0].reference;
  queries.fetchInternalAuditData.mockImplementation(async () => structuredClone(fixture));
  queries.saveAuditTemplate.mockImplementation(async (_client, template: AuditTemplate) => {
    const exists = fixture.templates.some((item) => item.id === template.id);
    const saved = { ...structuredClone(template), version: exists ? template.version + 1 : 1 };
    fixture.templates = [...fixture.templates.filter((item) => item.id !== template.id), saved];
    return saved;
  });
  queries.saveInternalAudit.mockImplementation(async (_client, audit: InternalAudit) => {
    fixture.audits = [...fixture.audits.filter((item) => item.id !== audit.id), structuredClone(audit)];
    return audit;
  });
  queries.saveAuditFinding.mockImplementation(async (_client, finding: AuditFinding) => { fixture.findings.push(structuredClone(finding)); return finding; });
  queries.addAuditFindingTreatment.mockImplementation(async (_client, id: string, status: AuditFindingStatus, treatment: string) => {
    fixture.findings = fixture.findings.map((finding) => finding.id === id ? { ...finding, status, treatment } : finding);
    const event = { id: 'event-test', findingId: id, actorId: 'captain-user', actorName: 'Capitaine LE ROZEL', createdAt: '2026-10-01T10:00:00Z', status, treatment };
    fixture.events.push(event);
    return event;
  });
});

describe('InternalAuditsPage', () => {
  it('shows all eight requested sites and projects the chosen planning year from the fixed anniversary', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Audit ISM Interne' })).toBeInTheDocument();
    for (const site of fixture.sites) expect(screen.getByText(site.name, { exact: true })).toBeInTheDocument();
    await user.clear(screen.getByRole('spinbutton', { name: 'Année du planning' }));
    await user.type(screen.getByRole('spinbutton', { name: 'Année du planning' }), '2030');
    const row = screen.getByText('LE ROZEL', { exact: true }).closest('article')!;
    expect(within(row).getByText('15 juin 2030')).toBeInTheDocument();
    expect(within(row).getByText('À venir')).toBeInTheDocument();
    expect(within(row).queryByText('En retard')).not.toBeInTheDocument();
  });

  it('adds template questions, preserves the expected version on save, and creates a vessel-specific grid', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { name: 'Audit ISM Interne' });
    await user.click(screen.getByRole('button', { name: 'Grilles' }));
    await user.click(screen.getByRole('button', { name: 'Ajouter une ligne à la grille' }));
    await user.type(screen.getAllByRole('textbox', { name: 'Question' }).at(-1)!, 'Vérifier le matériel propre au LE ROZEL');
    await user.click(screen.getByRole('button', { name: 'Enregistrer la grille' }));
    await waitFor(() => expect(queries.saveAuditTemplate).toHaveBeenCalledOnce());
    expect(queries.saveAuditTemplate.mock.calls[0][1]).toMatchObject({ version: 1 });
    expect(queries.saveAuditTemplate.mock.calls[0][1].rows).toHaveLength(3);
    await screen.findByText('Version 2');
    await user.click(screen.getByRole('button', { name: 'Créer une grille personnalisée' }));
    await user.type(screen.getByRole('textbox', { name: 'Nom de la nouvelle grille' }), 'Grille spécifique LE ROZEL');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Site / Navire' }), fixture.sites[3].id);
    await user.click(screen.getByRole('button', { name: 'Créer la grille' }));
    await waitFor(() => expect(queries.saveAuditTemplate).toHaveBeenCalledTimes(2));
    const copied = queries.saveAuditTemplate.mock.calls[1][1] as AuditTemplate;
    expect(copied).toMatchObject({ name: 'Grille spécifique LE ROZEL', siteId: fixture.sites[3].id, version: 1 });
    expect(copied.rows.map((row) => row.id)).not.toEqual(fixture.templates[0].rows.map((row) => row.id));
  });

  it('excludes N/A from scoring and saves an added question before emitting an assigned finding', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { name: 'Audit ISM Interne' });
    await user.click(screen.getByRole('button', { name: 'Grille d’audit' }));
    const first = screen.getAllByRole('group', { name: /^Réponse / })[0];
    await user.click(within(first).getByRole('radio', { name: /N\/A/ }));
    expect(screen.getByText('100 %', { exact: true })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ajouter une ligne à l’audit' }));
    await user.type(screen.getAllByRole('textbox', { name: 'Question' }).at(-1)!, 'Contrôle ajouté');
    await user.click(screen.getByRole('button', { name: 'Émettre un écart Contrôle ajouté' }));
    const modal = screen.getByRole('dialog');
    await user.selectOptions(within(modal).getByRole('combobox', { name: 'Type d’écart' }), 'major');
    await user.type(within(modal).getByRole('textbox', { name: 'Description du constat' }), 'Essai à réaliser sur le dispositif');
    await user.selectOptions(within(modal).getByRole('combobox', { name: 'Responsable de traitement' }), `role:chief_engineer:${fixture.sites[3].vesselId}`);
    await user.type(within(modal).getByLabelText('Délai de traitement'), '2026-10-15');
    await user.click(within(modal).getByRole('button', { name: 'Enregistrer l’écart' }));
    await waitFor(() => expect(queries.saveAuditFinding).toHaveBeenCalledOnce());
    expect(queries.saveInternalAudit.mock.invocationCallOrder[0]).toBeLessThan(queries.saveAuditFinding.mock.invocationCallOrder[0]);
    const savedAudit = queries.saveInternalAudit.mock.calls[0][1] as InternalAudit;
    const savedFinding = queries.saveAuditFinding.mock.calls[0][1] as AuditFinding;
    expect(savedAudit.rows).toHaveLength(3);
    expect(savedFinding).toMatchObject({ questionId: savedAudit.rows[2].id, severity: 'major', assigneeRole: 'chief_engineer', assigneeVesselId: fixture.sites[3].vesselId, assigneePersonId: null, dueOn: '2026-10-15' });
    await user.click(screen.getByRole('button', { name: /^Synthèse/ }));
    expect(await screen.findByText('Essai à réaliser sur le dispositif')).toBeInTheDocument();
    expect(screen.getByText('Chefs Mécaniciens LE ROZEL')).toBeInTheDocument();
  });

  it('allows a shore audit finding to be assigned to a vessel function', async () => {
    const user = userEvent.setup();
    fixture.audits[1].siteId = fixture.sites[0].id;
    renderPage();
    await screen.findByRole('heading', { name: 'Audit ISM Interne' });
    await user.click(screen.getByRole('button', { name: 'Grille d’audit' }));
    await user.click(screen.getAllByRole('button', { name: /^Émettre un écart / })[0]);
    expect(screen.getByRole('option', { name: 'Capitaines LE ROZEL' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Chefs Mécaniciens LE ROZEL' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Équipage LE ROZEL' })).toBeInTheDocument();
  });

  it('uses authenticated Capitaine permissions for treatment and keeps audit answers read-only', async () => {
    const user = userEvent.setup();
    fixture.permissions = { canManage: false, treatableFindingIds: [fixture.findings[0].id] };
    renderPage(['capitaine']);
    await screen.findByRole('heading', { name: 'Audit ISM Interne' });
    expect(screen.queryByRole('button', { name: /^Planifier / })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Grille d’audit' }));
    for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Enregistrer les réponses' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Émettre un écart / })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Synthèse/ }));
    await user.click(screen.getByRole('button', { name: 'Suivre le traitement' }));
    expect(screen.queryByRole('option', { name: 'Clôturé' })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Avancement' }), 'resolved');
    await user.type(screen.getByRole('textbox', { name: 'Traitement / preuve de correction' }), 'Essai réalisé et rapport conservé à bord.');
    await user.click(screen.getByRole('button', { name: 'Enregistrer le traitement' }));
    await waitFor(() => expect(queries.addAuditFindingTreatment).toHaveBeenCalledWith(expect.anything(), fixture.findings[0].id, 'resolved', 'Essai réalisé et rapport conservé à bord.'));
    expect((await screen.findAllByText('Essai réalisé et rapport conservé à bord.')).length).toBeGreaterThan(0);
    expect(screen.getByText('Historique du traitement (1)')).toBeInTheDocument();
  });

  it('does not expose treatment controls to a real Marin fixture without an assignment', async () => {
    const user = userEvent.setup();
    fixture.permissions = { canManage: false, treatableFindingIds: [] };
    renderPage(['marin']);
    await screen.findByRole('heading', { name: 'Audit ISM Interne' });
    await user.click(screen.getByRole('button', { name: /^Synthèse/ }));
    expect(screen.queryByRole('button', { name: 'Suivre le traitement' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Grilles' }));
    expect(screen.getByRole('textbox', { name: 'Nom de la grille' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Créer une grille personnalisée' })).not.toBeInTheDocument();
  });

  it('keeps unsaved audit answers until the user saves or cancels before leaving the grid', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { name: 'Audit ISM Interne' });
    await user.click(screen.getByRole('button', { name: 'Grille d’audit' }));
    const firstAnswer = screen.getAllByRole('group', { name: /^Réponse / })[0];
    await user.click(within(firstAnswer).getByRole('radio', { name: /N\/A/ }));

    expect(screen.getByText(/^Réponses non enregistrées :/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Planning' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Audit sélectionné' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /1 écart émis/ })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Planning' }));
    expect(within(firstAnswer).getByRole('radio', { name: /N\/A/ })).toBeChecked();
    expect(screen.queryByRole('button', { name: 'Ouvrir' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Planifier / })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Enregistrer les réponses' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Planning' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Planning' }));
    expect(screen.getByRole('button', { name: 'Ouvrir' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Planifier LE ROZEL' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Ouvrir' }));
    expect(within(screen.getAllByRole('group', { name: /^Réponse / })[0]).getByRole('radio', { name: /N\/A/ })).toBeChecked();
  });

  it('protects a modified reference grid from selection and tab changes until cancellation', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { name: 'Audit ISM Interne' });
    await user.click(screen.getByRole('button', { name: 'Grilles' }));
    const originalName = fixture.templates[0].name;
    await user.clear(screen.getByRole('textbox', { name: 'Nom de la grille' }));
    await user.type(screen.getByRole('textbox', { name: 'Nom de la grille' }), 'Modifications à conserver');

    expect(screen.getByText(/^Grille non enregistrée :/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Planning' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Grille d’audit' })).toBeDisabled();
    const templates = within(screen.getByRole('complementary', { name: 'Grilles disponibles' })).getAllByRole('button');
    for (const button of templates) expect(button).toBeDisabled();
    await user.click(templates[1]);
    expect(screen.getByRole('textbox', { name: 'Nom de la grille' })).toHaveValue('Modifications à conserver');
    expect(queries.saveAuditTemplate).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Annuler les modifications' }));
    expect(screen.getByRole('textbox', { name: 'Nom de la grille' })).toHaveValue(originalName);
    expect(screen.getByRole('button', { name: 'Planning' })).toBeEnabled();
    await user.click(templates[1]);
    expect(screen.getByRole('textbox', { name: 'Nom de la grille' })).toHaveValue('Grille LE ROZEL');
  });

  it('preserves completed answers and compares a genuine previous zero score instead of marking it absent', async () => {
    const user = userEvent.setup();
    fixture.audits[1].status = 'completed';
    fixture.audits[1].completedAt = '2026-06-16T16:00:00Z';
    fixture.audits[0].rows = fixture.audits[0].rows.map((row) => ({ ...row, answer: 'non_conforme' }));
    renderPage();
    await screen.findByRole('heading', { name: 'Audit ISM Interne' });
    await user.click(screen.getByRole('button', { name: 'Grille d’audit' }));
    expect(screen.getByText(/Réponses conservées/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Finaliser l’audit' })).not.toBeInTheDocument();
    for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Graphique' }));
    expect(screen.getAllByText('0 %', { exact: true }).length).toBeGreaterThan(1);
    expect(screen.queryByText('Absent', { exact: true })).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Scores par chapitre : audit 2026 et année 2025' })).toBeInTheDocument();
  });
});
