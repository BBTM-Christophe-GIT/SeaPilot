import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoleKey } from '../permissions/roles';
import type { AppShellOutletContext } from '../shell/AppShell';
import { auditDueOnFromDuration, todayAuditParis, type AuditFindingStatus } from '../internalAudits/internalAuditModel';
import { DocumentaryAuditsPage } from './DocumentaryAuditsPage';
import { createDocumentaryAuditPreviewData } from './documentaryAuditPreview';
import { DOCUMENTARY_AUDIT_LABELS, type AuditAttachment, type DocumentaryAudit, type DocumentaryAuditData, type DocumentaryAuditKind, type DocumentaryFinding } from './documentaryAuditModel';

const queries = vi.hoisted(() => ({ fetchDocumentaryAuditData: vi.fn(), saveDocumentaryAudit: vi.fn(), saveDocumentaryFinding: vi.fn(), addDocumentaryTreatment: vi.fn() }));
const filesApi = vi.hoisted(() => ({ validate: vi.fn(), download: vi.fn() }));
const report = vi.hoisted(() => ({ download: vi.fn() }));
vi.mock('./documentaryAuditQueries', () => queries);
vi.mock('./documentaryAuditFiles', async (importOriginal) => ({ ...await importOriginal<typeof import('./documentaryAuditFiles')>(), validateDocumentaryFiles: filesApi.validate, downloadDocumentaryFile: filesApi.download }));
vi.mock('./documentaryAuditReport', () => ({ downloadDocumentaryAuditReport: report.download }));

let fixture: DocumentaryAuditData;
function attachments(files: File[]): AuditAttachment[] {
  return files.map((file, index) => ({ id: `new-file-${index}`, fileName: file.name, storagePath: `test/${file.name}`, mimeType: file.type, sizeBytes: file.size, url: `https://example.test/${file.name}` }));
}
function mount(kind: DocumentaryAuditKind = 'ovid', roles: RoleKey[] = ['armement'], previewMode = false) {
  const context: AppShellOutletContext = { roles, client: {} as never, previewMode, currentPerson: { id: 9301, firstName: 'Arthur', lastName: 'AUDITEUR', functionLabel: roles.includes('capitaine') ? 'Capitaine' : 'Armement', gradeLabel: '', active: true, hiredOn: '2020-01-01', departedOn: '' } };
  const page = (selectedKind: DocumentaryAuditKind) => <MemoryRouter><Routes><Route element={<Outlet context={context} />}><Route path="*" element={<DocumentaryAuditsPage kind={selectedKind} />} /></Route></Routes></MemoryRouter>;
  const result = render(page(kind));
  return { ...result, changeKind: (selectedKind: DocumentaryAuditKind) => result.rerender(page(selectedKind)) };
}
async function openFindings(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('button', { name: /^Écarts/ });
  await user.click(screen.getByRole('button', { name: /^Écarts/ }));
}
async function openNewFinding(user: ReturnType<typeof userEvent.setup>) {
  await openFindings(user);
  await user.click(screen.getByRole('button', { name: 'Créer un écart' }));
  return screen.getByRole('dialog', { name: 'Créer un écart' });
}

beforeEach(() => {
  vi.clearAllMocks();
  fixture = createDocumentaryAuditPreviewData('ovid');
  filesApi.validate.mockResolvedValue(undefined);
  filesApi.download.mockResolvedValue(new Blob(['downloaded'], { type: 'application/pdf' }));
  report.download.mockResolvedValue(undefined);
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: vi.fn(() => 'blob:documentary-test') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: vi.fn() });
  queries.fetchDocumentaryAuditData.mockImplementation(async () => structuredClone(fixture));
  queries.saveDocumentaryAudit.mockImplementation(async (_client, audit: DocumentaryAudit, files: File[] = []) => {
    const saved = { ...structuredClone(audit), files: [...audit.files, ...attachments(files)] };
    fixture.audits = [...fixture.audits.filter((item) => item.id !== saved.id), saved];
    return saved;
  });
  queries.saveDocumentaryFinding.mockImplementation(async (_client, finding: DocumentaryFinding, files: File[] = []) => {
    const saved = { ...structuredClone(finding), files: [...finding.files, ...attachments(files)] };
    fixture.findings = [...fixture.findings.filter((item) => item.id !== saved.id), saved];
    return saved;
  });
  queries.addDocumentaryTreatment.mockImplementation(async (_client, id: string, status: AuditFindingStatus, treatment: string, files: File[] = []) => {
    const event = { id: `event-test-${fixture.events.length}`, findingId: id, actorId: 'real-captain-account', actorName: 'Paul CAPITAINE', createdAt: '2026-09-30T23:30:00Z', status, treatment, files: attachments(files) };
    fixture.events.push(event);
    fixture.findings = fixture.findings.map((finding) => finding.id === id ? { ...finding, status, treatment } : finding);
    return event;
  });
});

describe('DocumentaryAuditsPage', () => {
  it.each(['ovid', 'ecmid', 'external_ism', 'client'] as const)('uses the shared interface and loads the %s dossier kind', async (kind) => {
    fixture = createDocumentaryAuditPreviewData(kind);
    mount(kind);
    expect(await screen.findByRole('heading', { name: DOCUMENTARY_AUDIT_LABELS[kind], level: 1 })).toBeInTheDocument();
    await screen.findByRole('button', { name: 'Ajouter des documents' });
    expect(queries.fetchDocumentaryAuditData).toHaveBeenCalledWith(expect.anything(), kind);
    expect(screen.getByRole('button', { name: 'Exporter le rapport PDF' })).toBeInTheDocument();
    const nav = screen.getByRole('complementary', { name: 'Navires' });
    expect(within(nav).getAllByRole('button').map((button) => button.querySelector('strong')?.textContent)).toEqual(['GOURY', 'LANDEMER', 'LE ROZEL', 'SUROIT', 'KROKDUR', 'HIRONDELLE DE LA MANCHE']);
  });

  it('creates an empty annual vessel dossier before adding multiple documents', async () => {
    const user = userEvent.setup(); mount();
    await screen.findByRole('button', { name: 'Ajouter des documents' });
    await user.selectOptions(screen.getByRole('combobox', { name: 'Année des audits' }), '2030');
    await user.click(screen.getByRole('button', { name: /^LE ROZEL/ }));
    await user.click(screen.getByRole('button', { name: 'Créer le dossier' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Date de l’audit'), { target: { value: '2030-06-15' } });
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer le dossier' }));
    await screen.findByRole('button', { name: 'Ajouter des documents' });
    expect(queries.saveDocumentaryAudit.mock.calls[0][1]).toMatchObject({ kind: 'ovid', year: 2030, siteId: fixture.sites[1].id, auditedOn: '2030-06-15', files: [] });
    expect(queries.saveDocumentaryAudit.mock.calls[0][2]).toBeUndefined();
    await user.click(screen.getByRole('button', { name: 'Ajouter des documents' }));
    const selected = [new File(['%PDF-1.4'], 'rapport.pdf', { type: 'application/pdf' }), new File(['controle;conforme'], 'controle.csv', { type: 'text/csv' })];
    await user.upload(screen.getByLabelText('Documents de l’audit'), selected);
    await screen.findByText('rapport.pdf · 1 Ko');
    await user.click(screen.getByRole('button', { name: 'Ajouter les documents' }));
    await waitFor(() => expect(queries.saveDocumentaryAudit).toHaveBeenCalledTimes(2));
    expect(queries.saveDocumentaryAudit.mock.calls[1][1].id).toBe(queries.saveDocumentaryAudit.mock.calls[0][1].id);
    expect(queries.saveDocumentaryAudit.mock.calls[1][2]).toEqual(selected);
    expect(await screen.findByRole('button', { name: 'Télécharger rapport.pdf' })).toBeInTheDocument();
  });

  it('edits only dossier metadata without changing its annual vessel identity or files', async () => {
    const user = userEvent.setup(); mount();
    await user.click(await screen.findByRole('button', { name: 'Modifier le dossier' }));
    const dialog = screen.getByRole('dialog');
    await user.clear(within(dialog).getByLabelText('Titre du dossier'));
    await user.type(within(dialog).getByLabelText('Titre du dossier'), 'Inspection annuelle GOURY');
    await user.clear(within(dialog).getByLabelText('Auditeur'));
    await user.type(within(dialog).getByLabelText('Auditeur'), 'Auditeur indépendant');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer le dossier' }));
    await screen.findByRole('heading', { name: 'Inspection annuelle GOURY' });
    expect(queries.saveDocumentaryAudit.mock.calls[0][1]).toMatchObject({ id: fixture.audits.find((audit) => audit.title === 'Inspection annuelle GOURY')?.id, siteId: fixture.sites[0].id, kind: 'ovid', year: Number(todayAuditParis().slice(0, 4)), auditorName: 'Auditeur indépendant', files: expect.arrayContaining([expect.objectContaining({ mimeType: 'application/pdf' })]) });
    expect(within(dialog).queryByLabelText('Navire')).not.toBeInTheDocument();
  });

  it('updates category defaults, computes an editable delay, and assigns a vessel function with attachments', async () => {
    const user = userEvent.setup(); mount();
    const dialog = await openNewFinding(user);
    expect(within(dialog).queryByRole('spinbutton', { name: 'Délai de traitement' })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('checkbox', { name: /Prévoir un délai/ })).not.toBeChecked();
    await user.selectOptions(within(dialog).getByLabelText('Catégorie'), 'major');
    expect(within(dialog).getByRole('spinbutton', { name: 'Délai de traitement' })).toHaveValue(1);
    expect(within(dialog).getByLabelText('Unité du délai')).toHaveValue('weeks');
    await user.selectOptions(within(dialog).getByLabelText('Catégorie'), 'minor');
    expect(within(dialog).getByLabelText('Unité du délai')).toHaveValue('months');
    await user.clear(within(dialog).getByRole('spinbutton', { name: 'Délai de traitement' }));
    await user.type(within(dialog).getByRole('spinbutton', { name: 'Délai de traitement' }), '2');
    await user.type(within(dialog).getByLabelText('Description du constat'), 'Compléter les preuves de contrôle.');
    await user.selectOptions(within(dialog).getByLabelText('Responsable de traitement'), `role:chief_engineer:${fixture.sites[1].vesselId}`);
    const photo = new File(['png'], 'constat.png', { type: 'image/png' });
    await user.upload(within(dialog).getByLabelText('Photos et documents (facultatifs)'), photo);
    await screen.findByText('constat.png · 1 Ko');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer l’écart' }));
    await waitFor(() => expect(queries.saveDocumentaryFinding).toHaveBeenCalledOnce());
    expect(queries.saveDocumentaryFinding.mock.calls[0][1]).toMatchObject({ category: 'minor', assigneeRole: 'chief_engineer', assigneeVesselId: fixture.sites[1].vesselId, assigneePersonId: null, assigneeLabel: 'Chefs Mécaniciens LE ROZEL', openedOn: todayAuditParis(), treatmentDelayValue: 2, treatmentDelayUnit: 'months', dueOn: auditDueOnFromDuration(todayAuditParis(), { amount: 2, unit: 'months' }) });
    expect(queries.saveDocumentaryFinding.mock.calls[0][2]).toEqual([photo]);
  });

  it('keeps findings deadlines optional and remarks without deadlines, with direct optional closure', async () => {
    const user = userEvent.setup(); mount();
    const dialog = await openNewFinding(user);
    await user.click(within(dialog).getByRole('checkbox', { name: /Prévoir un délai/ }));
    expect(within(dialog).getByRole('spinbutton', { name: 'Délai de traitement' })).toHaveValue(1);
    await user.selectOptions(within(dialog).getByLabelText('Catégorie'), 'remark');
    expect(within(dialog).queryByRole('spinbutton')).not.toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Description du constat'), 'Bonne pratique à partager.');
    await user.selectOptions(within(dialog).getByLabelText('Responsable de traitement'), 'person:9301');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer l’écart' }));
    await waitFor(() => expect(queries.saveDocumentaryFinding).toHaveBeenCalledOnce());
    const saved = queries.saveDocumentaryFinding.mock.calls[0][1] as DocumentaryFinding;
    expect(saved).toMatchObject({ category: 'remark', dueOn: null, treatmentDelayValue: null, treatmentDelayUnit: null, assigneePersonId: 9301, assigneeRole: null });
    const card = screen.getByRole('article', { name: 'Bonne pratique à partager.' });
    expect(within(card).getByText('Sans échéance')).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: 'Suivre le traitement' }));
    await user.selectOptions(screen.getByLabelText('Avancement'), 'closed');
    await user.click(screen.getByRole('button', { name: 'Enregistrer le suivi' }));
    await waitFor(() => expect(queries.addDocumentaryTreatment).toHaveBeenCalledWith(expect.anything(), saved.id, 'closed', 'Écart clôturé.', []));
  });

  it('preserves the finding identity, creation date, workflow and existing evidence when editing', async () => {
    fixture.findings[0].openedOn = '2026-06-15';
    fixture.findings[0].status = 'in_progress';
    const original = structuredClone(fixture.findings[0]);
    const user = userEvent.setup(); mount(); await openFindings(user);
    await user.click(screen.getByRole('button', { name: 'Modifier le constat' }));
    const dialog = screen.getByRole('dialog');
    await user.clear(within(dialog).getByLabelText('Description du constat'));
    await user.type(within(dialog).getByLabelText('Description du constat'), 'Constat précisé après vérification.');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer l’écart' }));
    await waitFor(() => expect(queries.saveDocumentaryFinding).toHaveBeenCalledOnce());
    expect(queries.saveDocumentaryFinding.mock.calls[0][1]).toMatchObject({ id: original.id, auditId: original.auditId, openedOn: original.openedOn, status: 'in_progress', files: original.files, description: 'Constat précisé après vérification.' });
  });

  it('allows a real Capitaine fixture to treat only assigned findings, including document-only evidence', async () => {
    fixture.permissions = { canManage: false, treatableFindingIds: [fixture.findings[0].id] };
    const unassigned = { ...structuredClone(fixture.findings[0]), id: 'other-finding', reference: 'F-02', assigneeVesselId: fixture.sites[1].vesselId, assigneeLabel: 'Capitaines LE ROZEL' };
    fixture.findings.push(unassigned);
    const user = userEvent.setup(); mount('ovid', ['capitaine']);
    await screen.findByRole('button', { name: /^Écarts/ });
    expect(screen.queryByRole('button', { name: 'Ajouter des documents' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Modifier le dossier' })).not.toBeInTheDocument();
    await openFindings(user);
    expect(screen.queryByRole('button', { name: 'Créer un écart' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Modifier le constat' })).not.toBeInTheDocument();
    expect(within(screen.getByRole('article', { name: 'F-02' })).queryByRole('button', { name: 'Suivre le traitement' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Suivre le traitement' }));
    expect(screen.queryByRole('option', { name: 'Clôturé' })).not.toBeInTheDocument();
    const proof = new File(['controle conforme'], 'preuve.txt', { type: 'text/plain' });
    await user.upload(screen.getByLabelText('Photos et documents du traitement ou de la clôture (facultatifs)'), proof);
    await screen.findByText('preuve.txt · 1 Ko');
    await user.selectOptions(screen.getByLabelText('Avancement'), 'resolved');
    await user.click(screen.getByRole('button', { name: 'Enregistrer le suivi' }));
    await waitFor(() => expect(queries.addDocumentaryTreatment).toHaveBeenCalledWith(expect.anything(), fixture.findings[0].id, 'resolved', 'Pièces jointes au traitement.', [proof]));
    await user.click(screen.getByText('Historique du traitement (1)'));
    const history = screen.getByText('Paul CAPITAINE · Traité, à vérifier').closest('li')!;
    expect(within(history).getByText('1 octobre 2026')).toBeInTheDocument();
  });

  it('keeps a real Marin fixture read-only when no treatment is assigned', async () => {
    fixture.permissions = { canManage: false, treatableFindingIds: [] };
    const user = userEvent.setup(); mount('ovid', ['marin']); await openFindings(user);
    for (const name of ['Créer un écart', 'Modifier le constat', 'Suivre le traitement', 'Modifier le dossier']) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exporter cet écart' })).toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Année des audits' }), '2030');
    expect(screen.queryByRole('button', { name: 'Créer le dossier' })).not.toBeInTheDocument();
    expect(queries.saveDocumentaryAudit).not.toHaveBeenCalled();
  });

  it('requires resolved major/minor/findings before manager closure and traces reopening before editing', async () => {
    const user = userEvent.setup(); mount(); await openFindings(user);
    await user.click(screen.getByRole('button', { name: 'Suivre le traitement' }));
    expect(screen.queryByRole('option', { name: 'Clôturé' })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Avancement'), 'resolved');
    await user.type(screen.getByLabelText('Traitement / commentaire'), 'Contrôle complété.');
    await user.click(screen.getByRole('button', { name: 'Enregistrer le suivi' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Suivre le traitement' }));
    await user.selectOptions(screen.getByLabelText('Avancement'), 'closed');
    await user.click(screen.getByRole('button', { name: 'Enregistrer le suivi' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Modifier le constat' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Réouvrir l’écart' }));
    await user.type(screen.getByLabelText('Traitement / commentaire'), 'Une preuve complémentaire est attendue.');
    await user.click(screen.getByRole('button', { name: 'Enregistrer le suivi' }));
    await screen.findByRole('button', { name: 'Modifier le constat' });
    expect(queries.addDocumentaryTreatment.mock.calls.map((call) => call[2])).toEqual(['resolved', 'closed', 'open']);
  });

  it('closes confirmed finding and treatment dialogs before failed refreshes, preventing duplicate submissions', async () => {
    const user = userEvent.setup(); mount();
    const dialog = await openNewFinding(user);
    await user.type(within(dialog).getByLabelText('Description du constat'), 'Constat enregistré malgré la coupure.');
    await user.selectOptions(within(dialog).getByLabelText('Responsable de traitement'), 'person:9301');
    queries.fetchDocumentaryAuditData.mockRejectedValue(new Error('network'));
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer l’écart' }));
    await screen.findByRole('alert');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const card = screen.getByRole('article', { name: 'Constat enregistré malgré la coupure.' });
    expect(queries.saveDocumentaryFinding).toHaveBeenCalledOnce();
    await user.click(within(card).getByRole('button', { name: 'Suivre le traitement' }));
    await user.type(screen.getByLabelText('Traitement / commentaire'), 'Traitement enregistré malgré la coupure.');
    await user.click(screen.getByRole('button', { name: 'Enregistrer le suivi' }));
    await screen.findByRole('alert');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(card).getAllByText('Traitement enregistré malgré la coupure.')[0]).toBeInTheDocument();
    expect(queries.addDocumentaryTreatment).toHaveBeenCalledOnce();
  });

  it('downloads original files and exports the whole audit or one finding with authenticated file loading', async () => {
    const user = userEvent.setup(); const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    try {
      mount();
      const audit = fixture.audits[0];
      await user.click(await screen.findByRole('button', { name: `Télécharger ${audit.files[0].fileName}` }));
      await waitFor(() => expect(filesApi.download).toHaveBeenCalledWith(expect.anything(), audit.files[0]));
      expect(click).toHaveBeenCalledOnce();
      expect((click.mock.instances[0] as HTMLAnchorElement).download).toBe(audit.files[0].fileName);
      await user.click(screen.getByRole('button', { name: 'Exporter le rapport PDF' }));
      await waitFor(() => expect(report.download).toHaveBeenCalledOnce());
      expect(report.download.mock.calls[0][0]).toMatchObject({ audit, site: fixture.sites[0], findings: fixture.findings, findingId: undefined, loadFile: expect.any(Function) });
      await report.download.mock.calls[0][0].loadFile(audit.files[1]);
      expect(filesApi.download).toHaveBeenLastCalledWith(expect.anything(), audit.files[1]);
      await openFindings(user);
      await user.click(screen.getByRole('button', { name: 'Exporter cet écart' }));
      await waitFor(() => expect(report.download).toHaveBeenCalledTimes(2));
      expect(report.download.mock.calls[1][0].findingId).toBe(fixture.findings[0].id);
    } finally { click.mockRestore(); }
  });

  it('rejects invalid selected attachments without submitting a mutation', async () => {
    const user = userEvent.setup(); mount();
    await user.click(await screen.findByRole('button', { name: 'Ajouter des documents' }));
    filesApi.validate.mockRejectedValueOnce(new Error('Le contenu du fichier ne correspond pas à son format.'));
    await user.upload(screen.getByLabelText('Documents de l’audit'), new File(['bad'], 'corrompu.pdf', { type: 'application/pdf' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('ne correspond pas');
    expect(screen.getByRole('button', { name: 'Ajouter les documents' })).toBeDisabled();
    expect(queries.saveDocumentaryAudit).not.toHaveBeenCalled();
  });

  it('waits for attachment validation before allowing save or closing a finding dialog', async () => {
    const user = userEvent.setup(); mount();
    const dialog = await openNewFinding(user);
    await user.type(within(dialog).getByLabelText('Description du constat'), 'Conserver la pièce choisie.');
    await user.selectOptions(within(dialog).getByLabelText('Responsable de traitement'), 'person:9301');
    let release!: () => void;
    filesApi.validate.mockReturnValueOnce(new Promise<void>((resolve) => { release = resolve; }));
    const proof = new File(['preuve conforme'], 'preuve-en-validation.txt', { type: 'text/plain' });
    await user.upload(within(dialog).getByLabelText('Photos et documents (facultatifs)'), proof);
    expect(within(dialog).getByRole('button', { name: 'Vérification des fichiers…' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Annuler' })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.submit(dialog);
    expect(queries.saveDocumentaryFinding).not.toHaveBeenCalled();
    await act(async () => { release(); });
    await screen.findByText('preuve-en-validation.txt · 1 Ko');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer l’écart' }));
    await waitFor(() => expect(queries.saveDocumentaryFinding).toHaveBeenCalledOnce());
    expect(queries.saveDocumentaryFinding.mock.calls[0][2]).toEqual([proof]);
  });

  it('keeps preview changes in memory and resets the selected module state when kind changes', async () => {
    const user = userEvent.setup(); const page = mount('ovid', ['armement'], true);
    await user.click(await screen.findByRole('button', { name: 'Modifier le dossier' }));
    await user.clear(screen.getByLabelText('Titre du dossier'));
    await user.type(screen.getByLabelText('Titre du dossier'), 'Aperçu modifié localement');
    await user.click(screen.getByRole('button', { name: 'Enregistrer le dossier' }));
    await screen.findByRole('heading', { name: 'Aperçu modifié localement' });
    page.changeKind('ecmid');
    await screen.findByRole('button', { name: 'Ajouter des documents' });
    expect(screen.getByRole('heading', { name: 'eCMID', level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Aperçu modifié localement' })).not.toBeInTheDocument();
    expect(queries.fetchDocumentaryAuditData).not.toHaveBeenCalled();
    expect(queries.saveDocumentaryAudit).not.toHaveBeenCalled();
    expect(queries.saveDocumentaryFinding).not.toHaveBeenCalled();
  });
});
