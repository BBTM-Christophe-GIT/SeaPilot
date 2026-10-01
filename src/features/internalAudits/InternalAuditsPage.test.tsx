import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoleKey } from '../permissions/roles';
import type { AppShellOutletContext } from '../shell/AppShell';
import { InternalAuditsPage } from './InternalAuditsPage';
import { auditDueOnFromDuration, todayAuditParis, type AuditFinding, type AuditFindingStatus, type AuditTemplate, type InternalAudit } from './internalAuditModel';
import type { InternalAuditData } from './internalAuditQueries';
import { createInternalAuditPreviewData } from './internalAuditPreview';

const queries = vi.hoisted(() => ({ fetchInternalAuditData: vi.fn(), saveAuditTemplate: vi.fn(), saveInternalAudit: vi.fn(), saveAuditFinding: vi.fn(), saveAuditSite: vi.fn(), addAuditFindingTreatment: vi.fn() }));
const reportExports = vi.hoisted(() => ({ pdf: vi.fn(), workbook: vi.fn(), print: vi.fn() }));
vi.mock('./internalAuditQueries', () => queries);
vi.mock('./internalAuditReport', () => ({ downloadInternalAuditReport: reportExports.pdf, openInternalAuditGridPrintPreview: reportExports.print }));
vi.mock('./internalAuditWorkbook', () => ({ downloadInternalAuditWorkbook: reportExports.workbook }));

let fixture: InternalAuditData;
function AuditLocationProbe() { const location = useLocation(); return <output aria-label="Adresse de la recette">{location.search}</output>; }
function renderPage(roles: RoleKey[] = ['armement'], initialEntry = '/', linkedAuditId?: string) {
  const currentPerson = { id: 9301, firstName: 'Test', lastName: 'AUDITEUR', functionLabel: 'Armement', gradeLabel: '', active: true, hiredOn: '2020-01-01', departedOn: '' };
  const context: AppShellOutletContext = {
    roles, client: {} as never, previewMode: false,
    currentPerson,
  };
  return render(<MemoryRouter initialEntries={[initialEntry]}><Routes><Route element={<><Outlet context={context} />{linkedAuditId ? <><Link to={`?audit=${linkedAuditId}`}>Lien audit du Planning</Link><AuditLocationProbe /></> : null}</>}><Route path="*" element={<InternalAuditsPage />} /></Route></Routes></MemoryRouter>);
}

beforeEach(() => {
  // Clear queued one-shot responses as well as calls so a failed scenario cannot poison the next load.
  vi.resetAllMocks();
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: vi.fn(() => 'blob:photo-test') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: vi.fn() });
  fixture = createInternalAuditPreviewData();
  fixture.audits = fixture.audits.filter((audit) => audit.siteId === fixture.sites[3].id);
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
  it('opens the upcoming LANDEMER demonstration audit with its unanswered reference grid', async () => {
    fixture = createInternalAuditPreviewData();
    const planned = fixture.audits.find((audit) => audit.id === '00000000-0000-4000-8000-000000000202')!;
    expect(planned).toMatchObject({ status: 'planned', performedOn: null, completedAt: null, plannedOn: auditDueOnFromDuration(todayAuditParis(), { amount: 3, unit: 'days' }) });
    expect(planned.rows).toHaveLength(61);
    expect(planned.rows.every((row) => row.answer === null && row.observation === '')).toBe(true);
    // Verify the full seed above, then keep this navigation test focused on representative unanswered rows.
    fixture.audits = fixture.audits.map((audit) => ({ ...audit, rows: audit.rows.slice(0, 2) }));
    fixture.templates = fixture.templates.map((template) => ({ ...template, rows: template.rows.slice(0, 2) }));
    renderPage(['armement'], `/?audit=${planned.id}`);
    await waitFor(() => expect(document.querySelector('.ia-audit-header h2')).toHaveTextContent(`LANDEMER · ${planned.year}`));
    expect(document.querySelector('.ia-audit-selector select')).toHaveValue(planned.id);
    expect(screen.getByLabelText('Date de réalisation')).toHaveValue('');
    expect(screen.getByText('Démarrer l’audit', { exact: true })).toBeEnabled();
    const answers = document.querySelectorAll<HTMLSelectElement>('.ia-answer-select');
    expect(answers).toHaveLength(2);
    expect([...answers].every((answer) => answer.value === '')).toBe(true);
  });

  it('opens the authorized audit linked from global Planning and aligns its annual site context', async () => {
    const user = userEvent.setup();
    const linked = fixture.audits[0];
    renderPage(['armement'], `/?audit=${linked.id.toUpperCase()}`);
    const selector = await screen.findByRole('combobox', { name: 'Audit sélectionné' });
    expect(selector).toHaveValue(linked.id);
    expect(screen.getByRole('heading', { name: 'LE ROZEL · 2025' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Grille d’audit' })).toHaveAttribute('aria-current', 'page');
    for (const answer of screen.getAllByRole('combobox', { name: /^Réponse / })) expect(answer).toBeDisabled();
    expect(queries.fetchInternalAuditData).toHaveBeenCalledOnce();
    expect(queries.fetchInternalAuditData.mock.calls[0]).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Planning' }));
    expect(screen.getByRole('combobox', { name: 'Année du planning' })).toHaveValue('2025');
  });

  it.each(['', 'invalid-id', '00000000-0000-4000-8000-999999999999'])('reports an unavailable audit link without querying or exposing its identifier (%s)', async (id) => {
    const user = userEvent.setup();
    renderPage(['armement'], `/?audit=${encodeURIComponent(id)}`);
    expect(await screen.findByRole('alert')).toHaveTextContent('Cet audit n’est pas disponible dans votre accès.');
    expect(screen.queryByRole('heading', { name: 'Planning annuel d’audit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Audit sélectionné' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Grille d’audit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /^Réponse / })).not.toBeInTheDocument();
    expect(queries.fetchInternalAuditData).toHaveBeenCalledOnce();
    expect(queries.fetchInternalAuditData.mock.calls[0]).toHaveLength(1);
    if (id) expect(screen.getByRole('alert')).not.toHaveTextContent(id);
    await user.click(screen.getByRole('button', { name: 'Retour au planning des audits' }));
    expect(await screen.findByRole('heading', { name: 'Planning annuel d’audit' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Grille d’audit' }));
    expect(screen.getByRole('combobox', { name: 'Audit sélectionné' })).toHaveValue(fixture.audits[1].id);
    expect(screen.getAllByRole('combobox', { name: /^Réponse / })[0]).toBeEnabled();
    expect(queries.fetchInternalAuditData).toHaveBeenCalledOnce();
  });

  it('uses the real profile overview for a linked audit instead of loading an inaccessible audit', async () => {
    const unavailableId = fixture.audits[0].id;
    fixture.audits = [fixture.audits[1]];
    fixture.permissions = { canManage: false, treatableFindingIds: [fixture.findings[0].id] };
    renderPage(['capitaine'], `/?audit=${unavailableId}`);
    expect(await screen.findByRole('alert')).toHaveTextContent('Cet audit n’est pas disponible dans votre accès.');
    expect(screen.queryByText('LE ROZEL · 2025')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Planifier / })).not.toBeInTheDocument();
    expect(queries.fetchInternalAuditData).toHaveBeenCalledOnce();
  });

  it('defers an incoming audit link until unsaved answers are saved or cancelled', async () => {
    const user = userEvent.setup();
    const current = fixture.audits[1];
    const target = fixture.audits[0];
    renderPage(['armement'], `/?audit=${current.id}`, target.id);
    await screen.findByRole('combobox', { name: 'Audit sélectionné' });
    await user.selectOptions(screen.getAllByRole('combobox', { name: /^Réponse / })[0], 'na');
    await user.click(screen.getByRole('link', { name: 'Lien audit du Planning' }));
    expect(screen.getByRole('combobox', { name: 'Audit sélectionné' })).toHaveValue(current.id);
    expect(screen.getAllByRole('combobox', { name: /^Réponse / })[0]).toHaveValue('na');
    expect(screen.getByText(/^Réponses non enregistrées :/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Audit sélectionné' })).toHaveValue(target.id));
    expect(screen.getByRole('heading', { name: 'LE ROZEL · 2025' })).toBeInTheDocument();
    expect(queries.saveInternalAudit).not.toHaveBeenCalled();
  });

  it('clears a consumed audit link when the user chooses another audit or planning year', async () => {
    const user = userEvent.setup();
    const current = fixture.audits[1];
    const target = fixture.audits[0];
    renderPage(['armement'], `/?audit=${target.id}&source=planning`, target.id);
    await screen.findByRole('combobox', { name: 'Audit sélectionné' });
    await user.selectOptions(screen.getByRole('combobox', { name: 'Audit sélectionné' }), current.id);
    expect(screen.getByLabelText('Adresse de la recette')).toHaveTextContent('?source=planning');
    expect(screen.getByLabelText('Adresse de la recette')).not.toHaveTextContent('audit=');
    await user.click(screen.getByRole('link', { name: 'Lien audit du Planning' }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Audit sélectionné' })).toHaveValue(target.id));
    await user.click(screen.getByRole('button', { name: 'Planning' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Année du planning' }), '2030');
    expect(screen.getByLabelText('Adresse de la recette')).not.toHaveTextContent('audit=');
    expect(screen.getByRole('combobox', { name: 'Année du planning' })).toHaveValue('2030');
  });

  it('shows all eight requested sites and projects the chosen planning year from the fixed anniversary', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Audit ISM Interne' })).toBeInTheDocument();
    for (const site of fixture.sites) expect(screen.getByText(site.name, { exact: true })).toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Année du planning' }), '2030');
    const row = screen.getByText('LE ROZEL', { exact: true }).closest('article')!;
    expect(within(row).getByText('15 juin 2030')).toBeInTheDocument();
    expect(within(row).getByText('À venir')).toBeInTheDocument();
    expect(within(row).queryByText('En retard')).not.toBeInTheDocument();
  });

  it('shows the twelve-month planning with existing fleet illustrations and a window crossing New Year', async () => {
    const user = userEvent.setup();
    fixture.sites[3].anniversaryOn = '2026-01-31';
    renderPage();
    await screen.findByRole('heading', { name: 'Planning annuel d’audit' });
    expect(screen.getByText('Janv.', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('Déc.', { exact: true })).toBeInTheDocument();
    expect(document.querySelectorAll('.ia-year-row')).toHaveLength(8);
    expect([...document.querySelectorAll('.ia-year-row .ia-site-name strong')].map((element) => element.textContent))
      .toEqual(['GOURY', 'LANDEMER', 'LE ROZEL', 'SUROIT', 'KROKDUR', 'HIRONDELLE DE LA MANCHE', 'Yard - LE HAVRE', 'Armement - CHERBOURG']);
    const row = screen.getByText('LE ROZEL', { exact: true }).closest('article')!;
    expect(row.querySelector('img')?.getAttribute('src')).toContain('/vessels/bbtm/le-rozel-');
    expect(within(row).getByText('31 oct. 2025 → 30 avr. 2026')).toBeInTheDocument();
    expect(within(row).getByRole('img', { name: /Calendrier 2026 de LE ROZEL/ })).toHaveAccessibleName(/31 oct. 2025/);
    expect(row.querySelector<HTMLElement>('.ia-year-window')?.style.left).toBe('0%');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Année du planning' }), '2030');
    expect(within(row).getByText('31 oct. 2029 → 30 avr. 2030')).toBeInTheDocument();
    expect(screen.queryByText('Aujourd’hui', { exact: true })).not.toBeInTheDocument();
  });

  it('opens a printable grid from the persisted audit and requires saving edited answers first', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { name: 'Audit ISM Interne' });
    await user.click(screen.getByRole('button', { name: 'Grille d’audit' }));
    await user.click(screen.getByRole('button', { name: 'Imprimer la grille' }));
    await waitFor(() => expect(reportExports.print).toHaveBeenCalledOnce());
    expect(reportExports.print.mock.calls[0][0]).toMatchObject({ audit: fixture.audits[1], site: fixture.sites[3], findings: [], events: [] });
    expect(reportExports.pdf).not.toHaveBeenCalled();
    await user.selectOptions(screen.getAllByRole('combobox', { name: /^Réponse / })[0], 'na');
    expect(screen.getByRole('button', { name: 'Imprimer la grille' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Imprimer la grille' }));
    expect(reportExports.print).toHaveBeenCalledOnce();
  });

  it('plots actual zero scores while leaving N/A and a missing chapter absent from the radar', async () => {
    const user = userEvent.setup();
    const base = fixture.audits[1].rows[0];
    fixture.audits[1] = { ...fixture.audits[1], status: 'completed', rows: [
      { ...base, id: 'zero', section: '1. Généralités', answer: 'non_conforme' },
      { ...base, id: 'full', section: '2. Politique', answer: 'conforme' },
      { ...base, id: 'excluded', section: '3. Responsabilité', answer: 'na' },
    ] };
    fixture.audits[0].rows = [{ ...base, section: '1. Généralités', answer: 'non_conforme' }, { ...base, section: '2. Politique', answer: 'incomplet' }];
    renderPage();
    await screen.findByRole('heading', { name: 'Audit ISM Interne' });
    await user.click(screen.getByRole('button', { name: 'Graphique' }));
    const radar = screen.getByRole('img', { name: 'Scores par chapitre : audit 2026 et année 2025' });
    expect(radar.querySelectorAll('.is-current circle')).toHaveLength(2);
    expect(radar.querySelectorAll('.is-previous circle')).toHaveLength(2);
    expect(radar.querySelectorAll('circle[data-score="0"]')).toHaveLength(2);
    expect(radar.querySelector('.is-current polygon')).toBeNull();
    const excluded = screen.getByRole('row', { name: /3\. Responsabilité/ });
    expect(within(excluded).getByRole('cell', { name: 'N/A' })).toBeInTheDocument();
    expect(within(excluded).getByRole('cell', { name: 'Absent' })).toBeInTheDocument();
    const zero = screen.getByRole('row', { name: /1\. Généralités/ });
    expect(within(zero).getAllByRole('cell', { name: '0 %' })).toHaveLength(2);
  });

  it('compares every stored ISM chapter and switches to the exact previous calendar year', async () => {
    const user = userEvent.setup();
    fixture = createInternalAuditPreviewData();
    const current = fixture.audits.find((audit) => audit.year === 2026)!;
    current.status = 'completed';
    current.completedAt = '2026-06-16T16:00:00Z';
    renderPage();
    await screen.findByRole('heading', { name: 'Planning annuel d’audit' });
    const planningHtml = document.querySelector('.internal-audits-page')!.outerHTML;
    await user.click(screen.getByRole('button', { name: 'Graphique' }));
    const table = screen.getByRole('table', { name: 'Scores par chapitre · campagnes 2026 et 2025' });
    expect(within(table).getAllByRole('row')).toHaveLength(new Set(current.rows.map((row) => row.section)).size + 1);
    expect(screen.getByRole('img', { name: 'Scores par chapitre : audit 2026 et année 2025' }).querySelector('.is-current polygon')).not.toBeNull();
    if (process.env.INTERNAL_AUDIT_DESIGN_OUTPUT) {
      const { mkdir, writeFile } = await import('node:fs/promises');
      const { join } = await import('node:path');
      await mkdir(process.env.INTERNAL_AUDIT_DESIGN_OUTPUT, { recursive: true });
      await writeFile(join(process.env.INTERNAL_AUDIT_DESIGN_OUTPUT, 'planning-fragment.html'), planningHtml);
      await writeFile(join(process.env.INTERNAL_AUDIT_DESIGN_OUTPUT, 'radar-fragment.html'), document.querySelector('.internal-audits-page')!.outerHTML);
    }
    await user.selectOptions(screen.getByRole('combobox', { name: 'Audit sélectionné' }), fixture.audits.find((audit) => audit.year === 2025)!.id);
    expect(screen.getByRole('table', { name: 'Scores par chapitre · campagnes 2025 et 2024' })).toBeInTheDocument();
    expect(screen.getByText(/Aucun audit réalisé pour LE ROZEL en 2024/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Scores par chapitre : audit 2025 et année 2024' }).querySelectorAll('.is-previous circle')).toHaveLength(0);
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
    const first = screen.getAllByRole('combobox', { name: /^Réponse / })[0];
    await user.selectOptions(first, 'na');
    expect(screen.getByText('100 %', { exact: true })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ajouter une ligne à l’audit' }));
    await user.type(screen.getAllByRole('textbox', { name: 'Question' }).at(-1)!, 'Contrôle ajouté');
    await user.click(screen.getByRole('button', { name: 'Ajouter la question' }));
    await user.click(screen.getByRole('button', { name: 'Émettre un écart Contrôle ajouté' }));
    const modal = screen.getByRole('dialog');
    await user.selectOptions(within(modal).getByRole('combobox', { name: 'Type d’écart' }), 'major');
    await user.type(within(modal).getByRole('textbox', { name: 'Description du constat' }), 'Essai à réaliser sur le dispositif');
    await user.selectOptions(within(modal).getByRole('combobox', { name: 'Responsable de traitement' }), `role:chief_engineer:${fixture.sites[3].vesselId}`);
    expect(within(modal).getByRole('spinbutton', { name: 'Délai de traitement' })).toHaveValue(1);
    expect(within(modal).getByRole('combobox', { name: 'Unité du délai' })).toHaveValue('weeks');
    await user.clear(within(modal).getByRole('spinbutton', { name: 'Délai de traitement' }));
    await user.type(within(modal).getByRole('spinbutton', { name: 'Délai de traitement' }), '2');
    await user.click(within(modal).getByRole('button', { name: 'Enregistrer l’écart' }));
    await waitFor(() => expect(queries.saveAuditFinding).toHaveBeenCalledOnce());
    expect(queries.saveInternalAudit.mock.invocationCallOrder[0]).toBeLessThan(queries.saveAuditFinding.mock.invocationCallOrder[0]);
    const savedAudit = queries.saveInternalAudit.mock.calls[0][1] as InternalAudit;
    const savedFinding = queries.saveAuditFinding.mock.calls[0][1] as AuditFinding;
    expect(savedAudit.rows).toHaveLength(3);
    expect(savedFinding).toMatchObject({ questionId: savedAudit.rows[2].id, severity: 'major', assigneeRole: 'chief_engineer', assigneeVesselId: fixture.sites[3].vesselId, assigneePersonId: null, openedOn: todayAuditParis(), treatmentDelayValue: 2, treatmentDelayUnit: 'weeks', dueOn: auditDueOnFromDuration(todayAuditParis(), { amount: 2, unit: 'weeks' }) });
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
    for (const answer of screen.getAllByRole('combobox', { name: /^Réponse / })) expect(answer).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Enregistrer les réponses' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Émettre un écart / })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Synthèse/ }));
    await user.click(screen.getByRole('button', { name: 'Suivre le traitement' }));
    expect(screen.queryByRole('option', { name: 'Clôturé' })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Avancement' }), 'resolved');
    await user.type(screen.getByRole('textbox', { name: 'Traitement / preuve de correction' }), 'Essai réalisé et rapport conservé à bord.');
    await user.click(screen.getByRole('button', { name: 'Enregistrer le traitement' }));
    await waitFor(() => expect(queries.addAuditFindingTreatment).toHaveBeenCalledWith(expect.anything(), fixture.findings[0].id, 'resolved', 'Essai réalisé et rapport conservé à bord.', []));
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
    const firstAnswer = screen.getAllByRole('combobox', { name: /^Réponse / })[0];
    await user.selectOptions(firstAnswer, 'na');

    expect(screen.getByText(/^Réponses non enregistrées :/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Planning' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Audit sélectionné' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /1 écart émis/ })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Planning' }));
    expect(firstAnswer).toHaveValue('na');
    expect(screen.queryByRole('button', { name: 'Ouvrir' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Planifier / })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Enregistrer les réponses' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Planning' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Planning' }));
    expect(screen.getByRole('button', { name: 'Ouvrir' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Planifier LE ROZEL' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Ouvrir' }));
    expect(screen.getAllByRole('combobox', { name: /^Réponse / })[0]).toHaveValue('na');
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
    for (const answer of screen.getAllByRole('combobox', { name: /^Réponse / })) expect(answer).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Graphique' }));
    expect(screen.getAllByText('0 %', { exact: true }).length).toBeGreaterThan(1);
    expect(screen.queryByText('Absent', { exact: true })).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Scores par chapitre : audit 2026 et année 2025' })).toBeInTheDocument();
  });

  it('starts a planned audit with the Paris date and displays guidance in the compact question row', async () => {
    const user = userEvent.setup();
    fixture.audits[1] = { ...fixture.audits[1], status: 'planned', performedOn: null, rows: fixture.audits[1].rows.map((row) => ({ ...row, answer: null, observation: '' })) };
    renderPage();
    await screen.findByRole('heading', { name: 'Audit ISM Interne' });
    await user.click(screen.getByRole('button', { name: 'Grille d’audit' }));
    expect(screen.getByLabelText('Date de réalisation')).toHaveValue('');
    const table = screen.getByRole('table', { name: 'Grille d’audit LE ROZEL 2026' });
    const guidance = table.querySelector('.ia-guidance-cell .ia-cell-preview')!;
    expect(guidance.querySelector('.ia-cell-line')).toHaveTextContent(fixture.audits[1].rows[0].guidance.replace(/\s+/g, ' '));
    expect(within(table).queryByRole('tooltip')).not.toBeInTheDocument();
    await user.click(guidance);
    expect(within(table).getByRole('tooltip')).toHaveTextContent(fixture.audits[1].rows[0].guidance.replace(/\s+/g, ' '));
    expect(table.querySelector('details')).toBeNull();
    expect(document.querySelector('.ia-question-editor')).toBeNull();
    await user.selectOptions(within(table).getAllByRole('combobox', { name: /^Réponse / })[0], 'conforme');
    expect(screen.getByLabelText('Date de réalisation')).toHaveValue(todayAuditParis());
    await user.click(screen.getByRole('button', { name: 'Enregistrer les réponses' }));
    await waitFor(() => expect(queries.saveInternalAudit).toHaveBeenCalledOnce());
    expect(queries.saveInternalAudit.mock.calls[0][1]).toMatchObject({ status: 'in_progress', performedOn: todayAuditParis() });
  });

  it('resets proposed durations when severity changes and emits a remark without a deadline or photos', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { name: 'Audit ISM Interne' });
    await user.click(screen.getByRole('button', { name: 'Grille d’audit' }));
    await user.click(screen.getAllByRole('button', { name: /^Émettre un écart / })[0]);
    const modal = screen.getByRole('dialog');
    const severity = within(modal).getByRole('combobox', { name: 'Type d’écart' });
    expect(within(modal).getByRole('combobox', { name: 'Unité du délai' })).toHaveValue('months');
    expect(within(modal).getByText('Échéance calculée')).toBeInTheDocument();
    expect(modal.querySelector('input[type="date"]')).toBeNull();
    await user.clear(within(modal).getByRole('spinbutton', { name: 'Délai de traitement' }));
    await user.type(within(modal).getByRole('spinbutton', { name: 'Délai de traitement' }), '4');
    await user.selectOptions(severity, 'major');
    expect(within(modal).getByRole('spinbutton', { name: 'Délai de traitement' })).toHaveValue(1);
    expect(within(modal).getByRole('combobox', { name: 'Unité du délai' })).toHaveValue('weeks');
    await user.selectOptions(severity, 'minor');
    expect(within(modal).getByRole('spinbutton', { name: 'Délai de traitement' })).toHaveValue(1);
    expect(within(modal).getByRole('combobox', { name: 'Unité du délai' })).toHaveValue('months');
    await user.selectOptions(severity, 'remark');
    expect(within(modal).queryByRole('spinbutton', { name: 'Délai de traitement' })).not.toBeInTheDocument();
    expect(within(modal).getByText(/clôture restent facultatifs/)).toBeInTheDocument();
    await user.type(within(modal).getByRole('textbox', { name: 'Description du constat' }), 'Suggestion de rangement');
    await user.selectOptions(within(modal).getByRole('combobox', { name: 'Responsable de traitement' }), 'person:9301');
    await user.click(within(modal).getByRole('button', { name: 'Enregistrer l’écart' }));
    await waitFor(() => expect(queries.saveAuditFinding).toHaveBeenCalledOnce());
    expect(queries.saveAuditFinding.mock.calls[0][1]).toMatchObject({ severity: 'remark', openedOn: todayAuditParis(), dueOn: null, treatmentDelayValue: null, treatmentDelayUnit: null, assigneePersonId: 9301 });
    expect(queries.saveAuditFinding.mock.calls[0][2]).toEqual([]);
  });

  it('passes optional finding photos and rejects an unsupported upload before saving', async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderPage();
    await screen.findByRole('heading', { name: 'Audit ISM Interne' });
    await user.click(screen.getByRole('button', { name: 'Grille d’audit' }));
    await user.click(screen.getAllByRole('button', { name: /^Émettre un écart / })[0]);
    const modal = screen.getByRole('dialog');
    const input = within(modal).getByLabelText('Photos du constat (facultatif)');
    await user.upload(input, new File(['document'], 'document.pdf', { type: 'application/pdf' }));
    expect(within(modal).getByRole('alert')).toHaveTextContent('JPEG, PNG ou WebP');
    expect(queries.saveAuditFinding).not.toHaveBeenCalled();
    const photo = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'constat.png', { type: 'image/png' });
    await user.upload(input, photo);
    expect(within(modal).getByRole('img', { name: 'Aperçu constat.png' })).toBeInTheDocument();
    await user.type(within(modal).getByRole('textbox', { name: 'Description du constat' }), 'Dispositif photographié');
    await user.selectOptions(within(modal).getByRole('combobox', { name: 'Responsable de traitement' }), 'person:9301');
    await user.click(within(modal).getByRole('button', { name: 'Enregistrer l’écart' }));
    await waitFor(() => expect(queries.saveAuditFinding).toHaveBeenCalledOnce());
    expect(queries.saveAuditFinding.mock.calls[0][2]).toEqual([photo]);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:photo-test');
  });

  it('allows a real assigned Capitaine to document treatment with a photo alone', async () => {
    const user = userEvent.setup();
    fixture.permissions = { canManage: false, treatableFindingIds: [fixture.findings[0].id] };
    renderPage(['capitaine']);
    await screen.findByRole('heading', { name: 'Audit ISM Interne' });
    await user.click(screen.getByRole('button', { name: /^Synthèse/ }));
    await user.click(screen.getByRole('button', { name: 'Suivre le traitement' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Avancement' }), 'resolved');
    const photo = new File([new Uint8Array([255, 216, 255, 224])], 'correction.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByLabelText('Photos du traitement (facultatif)'), photo);
    await user.click(screen.getByRole('button', { name: 'Enregistrer le traitement' }));
    await waitFor(() => expect(queries.addAuditFindingTreatment).toHaveBeenCalledWith(expect.anything(), fixture.findings[0].id, 'resolved', '', [photo]));
  });

  it('offers a manager optional direct closure of a remark without a closure calendar, note or photo', async () => {
    const user = userEvent.setup();
    fixture.findings[0] = { ...fixture.findings[0], severity: 'remark', dueOn: null, treatmentDelayValue: null, treatmentDelayUnit: null };
    renderPage();
    await screen.findByRole('heading', { name: 'Audit ISM Interne' });
    await user.click(screen.getByRole('button', { name: /^Synthèse/ }));
    expect(screen.getByText('Sans échéance')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Suivre le traitement' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Avancement' }), 'closed');
    expect(screen.getByLabelText('Photos de clôture (facultatif)')).toBeInTheDocument();
    expect(screen.getByRole('dialog').querySelector('input[type="date"]')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Enregistrer le traitement' }));
    await waitFor(() => expect(queries.addAuditFindingTreatment).toHaveBeenCalledWith(expect.anything(), fixture.findings[0].id, 'closed', 'Écart clôturé.', []));
  });

  it('exports the saved report in PDF and Excel and blocks export while answers are unsaved', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { name: 'Audit ISM Interne' });
    await user.click(screen.getByRole('button', { name: 'Grille d’audit' }));
    await user.click(screen.getByRole('button', { name: 'Exporter le rapport' }));
    await waitFor(() => expect(reportExports.pdf).toHaveBeenCalledOnce());
    expect(reportExports.pdf.mock.calls[0][0]).toMatchObject({ audit: { id: fixture.audits[1].id }, site: { name: 'LE ROZEL' }, findings: fixture.findings, loadPhoto: expect.any(Function) });
    await user.selectOptions(screen.getByRole('combobox', { name: 'Format du rapport' }), 'xlsx');
    await user.click(screen.getByRole('button', { name: 'Exporter le rapport' }));
    await waitFor(() => expect(reportExports.workbook).toHaveBeenCalledOnce());
    await user.selectOptions(screen.getAllByRole('combobox', { name: /^Réponse / })[0], 'na');
    expect(screen.getByRole('button', { name: 'Exporter le rapport' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Exporter le rapport' }));
    expect(reportExports.workbook).toHaveBeenCalledOnce();
  });

  it('closes a committed finding form when refresh fails so its photos and finding cannot be submitted twice', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { name: 'Audit ISM Interne' });
    queries.fetchInternalAuditData.mockRejectedValueOnce(new Error('Connexion indisponible'));
    await user.click(screen.getByRole('button', { name: 'Grille d’audit' }));
    await user.click(screen.getAllByRole('button', { name: /^Émettre un écart / })[0]);
    const modal = screen.getByRole('dialog');
    await waitFor(() => expect(within(modal).getByRole('button', { name: 'Fermer' })).toHaveFocus());
    await user.type(screen.getByRole('textbox', { name: 'Description du constat' }), 'Constat conservé malgré une connexion interrompue');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Responsable de traitement' }), 'person:9301');
    await user.click(screen.getByRole('button', { name: 'Enregistrer l’écart' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(queries.saveAuditFinding).toHaveBeenCalledOnce();
    expect(await screen.findByRole('alert')).toHaveTextContent('L’enregistrement a réussi');
    expect(queries.fetchInternalAuditData).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole('button', { name: /^Synthèse/ }));
    expect(screen.getByText('Constat conservé malgré une connexion interrompue')).toBeInTheDocument();
  });

  it('retains a committed treatment locally and closes its form when the subsequent refresh fails', async () => {
    const user = userEvent.setup();
    fixture.permissions = { canManage: false, treatableFindingIds: [fixture.findings[0].id] };
    renderPage(['capitaine']);
    await screen.findByRole('heading', { name: 'Audit ISM Interne' });
    queries.fetchInternalAuditData.mockRejectedValueOnce(new Error('Connexion indisponible'));
    await user.click(screen.getByRole('button', { name: /^Synthèse/ }));
    await user.click(screen.getByRole('button', { name: 'Suivre le traitement' }));
    const modal = screen.getByRole('dialog');
    // AppDialog focuses its close button on the next frame; wait before typing spaces into the textarea.
    await waitFor(() => expect(within(modal).getByRole('button', { name: 'Fermer' })).toHaveFocus());
    await user.type(screen.getByRole('textbox', { name: 'Traitement / preuve de correction' }), 'Correction conservée');
    await user.click(screen.getByRole('button', { name: 'Enregistrer le traitement' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(queries.addAuditFindingTreatment).toHaveBeenCalledOnce();
    expect(await screen.findByRole('alert')).toHaveTextContent('L’enregistrement a réussi');
    expect(queries.fetchInternalAuditData).toHaveBeenCalledTimes(2);
    expect(screen.getAllByText('Correction conservée').length).toBeGreaterThan(0);
    expect(screen.getByText('Historique du traitement (1)')).toBeInTheDocument();
  });

  it('displays treatment timestamps after 23:00 UTC on the following Paris calendar day', async () => {
    const user = userEvent.setup();
    fixture.permissions = { canManage: false, treatableFindingIds: [fixture.findings[0].id] };
    fixture.events.push({ id: 'event-paris', findingId: fixture.findings[0].id, actorId: 'captain-user', actorName: 'Capitaine LE ROZEL', createdAt: '2026-09-30T23:30:00Z', status: 'in_progress', treatment: 'Contrôle réalisé après minuit à Paris', photos: [] });
    renderPage(['capitaine']);
    await screen.findByRole('heading', { name: 'Audit ISM Interne' });
    await user.click(screen.getByRole('button', { name: /^Synthèse/ }));
    await user.click(screen.getByText('Historique du traitement (1)'));
    expect(screen.getByText('01 oct. 2026 · En traitement')).toBeVisible();
    expect(screen.queryByText('30 sept. 2026 · En traitement')).not.toBeInTheDocument();
    expect(screen.getByText('15 oct. 2026')).toBeVisible();
  });
});
