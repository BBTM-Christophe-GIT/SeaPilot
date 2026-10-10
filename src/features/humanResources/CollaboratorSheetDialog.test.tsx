import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CollaboratorSheetDialog } from './CollaboratorSheetDialog';
import { buildCollaboratorSheetPdf } from './collaboratorSheet';
import { mapHrDocumentRows, mapPersonRows } from './peopleQueries';

vi.mock('./collaboratorSheet', async () => {
  const actual = await vi.importActual<typeof import('./collaboratorSheet')>('./collaboratorSheet');
  return { ...actual, buildCollaboratorSheetPdf: vi.fn() };
});

const person = mapPersonRows([{
  id: 7,
  user_id: 'linked-collaborator',
  first_name: 'Camille',
  last_name: 'DUPONT',
  function_label: 'Capitaine',
  employee_number: '00007',
  email: 'camille@example.invalid',
  phone: '+33 6 00 00 00 07',
  active: true,
} as Parameters<typeof mapPersonRows>[0][number]])[0];

type DocumentRow = Parameters<typeof mapHrDocumentRows>[0][number];

function documentRow(overrides: Partial<DocumentRow>): DocumentRow {
  return {
    id: 11,
    person_id: person.id,
    person_name: 'Camille DUPONT',
    person_sharepoint_item_id: null,
    category_key: 'deck',
    title: 'Brevet Capitaine 200',
    status: 'valid',
    issued_on: '2025-04-12',
    expires_on: '2027-04-12',
    requires_captain_validation: false,
    medical_restriction: null,
    medical_bridge_watch: null,
    medical_unfit: false,
    source_label: 'RH',
    notes: 'Document original reçu',
    file_url: null,
    ...overrides,
  };
}

const documents = mapHrDocumentRows([
  documentRow({}),
  documentRow({
    id: 12,
    category_key: 'medical_visit',
    title: 'Visite médicale annuelle',
    medical_restriction: 'Port de lunettes',
    medical_bridge_watch: true,
    notes: 'Compte rendu médical',
  }),
  documentRow({ id: 13, category_key: 'annual_review', title: 'Entretien annuel 2026' }),
  documentRow({ id: 14, person_id: 8, title: 'Brevet autre collaborateur' }),
  documentRow({
    id: 15,
    person_id: 8,
    category_key: 'medical_visit',
    title: 'Visite autre collaborateur',
    medical_restriction: 'Restriction autre collaborateur',
  }),
  documentRow({ id: 16, person_id: null, title: 'Document à rattacher' }),
]);

const allSectionKeys = new Set([
  'identity', 'contract', 'contact', 'emergency', 'administrative',
  'health', 'clothing', 'signature', 'annualReviews', 'documents',
]);

const generatePdf = vi.mocked(buildCollaboratorSheetPdf);
const createObjectURL = vi.fn(() => 'blob:collaborator-sheet');
const revokeObjectURL = vi.fn();
const originalCreateObjectURL = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
const originalRevokeObjectURL = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
let revokeTimers: ReturnType<typeof window.setTimeout>[] = [];

beforeEach(() => {
  generatePdf.mockReset();
  generatePdf.mockResolvedValue({ blob: new Blob(['pdf'], { type: 'application/pdf' }), fileName: 'Fiche-Camille-DUPONT.pdf' });
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
  const setTimeout = window.setTimeout.bind(window) as typeof window.setTimeout;
  revokeTimers = [];
  vi.spyOn(window, 'setTimeout').mockImplementation((handler, timeout, ...args) => {
    // Vitest resolves the Node timer overload while this browser timer returns a number.
    const timer = setTimeout(handler, timeout, ...args) as unknown as ReturnType<typeof window.setTimeout>;
    if (timeout === 30_000) revokeTimers.push(timer);
    return timer;
  });
});

afterEach(() => {
  cleanup();
  revokeTimers.forEach((timer) => window.clearTimeout(timer));
  vi.restoreAllMocks();
  if (originalCreateObjectURL) Object.defineProperty(URL, 'createObjectURL', originalCreateObjectURL);
  else Reflect.deleteProperty(URL, 'createObjectURL');
  if (originalRevokeObjectURL) Object.defineProperty(URL, 'revokeObjectURL', originalRevokeObjectURL);
  else Reflect.deleteProperty(URL, 'revokeObjectURL');
});

function renderDialog(visibleSectionKeys: ReadonlySet<string> = allSectionKeys, onClose = vi.fn()) {
  render(<CollaboratorSheetDialog documents={documents} onClose={onClose} person={person} visibleSectionKeys={visibleSectionKeys} />);
  return screen.getByRole('dialog', { name: 'Fiche Collaborateur' });
}

describe('CollaboratorSheetDialog', () => {
  it('starts with all available information selected and shows documents and medical visits without signature choices', () => {
    const dialog = renderDialog();

    expect(within(dialog).getByText('Camille DUPONT')).toBeInTheDocument();
    expect(within(dialog).getByText('00007')).toBeInTheDocument();
    within(dialog).getAllByRole('checkbox').forEach((checkbox) => expect(checkbox).toBeChecked());
    expect(within(dialog).getByRole('table', { name: 'Liste des visites médicales' })).toHaveTextContent('Port de lunettes');
    expect(within(dialog).getByRole('table', { name: 'Liste Documents' })).toHaveTextContent('Brevet Capitaine 200');
    expect(within(dialog).getByRole('table', { name: 'Liste Entretien Annuel' })).toHaveTextContent('Entretien annuel 2026');
    expect(within(dialog).queryByRole('checkbox', { name: /signature/i })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Générer le PDF' })).toBeEnabled();
  });

  it('selects individual fields, entire sections and medical table columns independently', async () => {
    const user = userEvent.setup();
    const dialog = renderDialog();

    await user.click(within(dialog).getByRole('checkbox', { name: 'Identité et poste : Prénom' }));
    expect(within(dialog).getByRole('checkbox', { name: 'Identité et poste : Prénom' })).not.toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: 'Identité et poste : Nom' })).toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: 'Inclure la section Identité et poste' })).toHaveProperty('indeterminate', true);

    await user.click(within(dialog).getByRole('checkbox', { name: 'Inclure la section Coordonnées' }));
    expect(within(dialog).getByRole('checkbox', { name: 'Coordonnées : Téléphone' })).not.toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: 'Coordonnées : Adresse postale' })).not.toBeChecked();

    const medicalTable = within(dialog).getByRole('table', { name: 'Liste des visites médicales' });
    await user.click(within(dialog).getByRole('checkbox', { name: 'Santé et habilitations : Restrictions' }));
    expect(within(medicalTable).queryByRole('columnheader', { name: 'Restrictions' })).not.toBeInTheDocument();
    expect(within(medicalTable).queryByText('Port de lunettes')).not.toBeInTheDocument();
    expect(within(medicalTable).getByRole('columnheader', { name: 'Aptitude' })).toBeInTheDocument();

    await user.click(within(dialog).getByRole('checkbox', { name: 'Inclure la section Documents' }));
    expect(within(dialog).queryByRole('table', { name: 'Liste Documents' })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('checkbox', { name: 'Documents : Document' })).not.toBeChecked();
    expect(within(dialog).getByRole('table', { name: 'Liste Entretien Annuel' })).toBeInTheDocument();
  });

  it('offers only permitted sections and never includes documents belonging to another person or unassigned files', () => {
    const dialog = renderDialog(new Set(['identity', 'documents']));

    expect(within(dialog).getByRole('checkbox', { name: 'Inclure la section Identité et poste' })).toBeInTheDocument();
    expect(within(dialog).getByRole('checkbox', { name: 'Inclure la section Documents' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('checkbox', { name: /Santé et habilitations/ })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('checkbox', { name: /Contact urgence/ })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('checkbox', { name: /Entretien Annuel/ })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('checkbox', { name: /signature/i })).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Port de lunettes')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Compte rendu médical')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Brevet autre collaborateur')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Visite autre collaborateur')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Restriction autre collaborateur')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Document à rattacher')).not.toBeInTheDocument();
  });

  it('prevents generation with no selected information and can restore every available option', async () => {
    const user = userEvent.setup();
    const dialog = renderDialog();
    await user.click(within(dialog).getByRole('button', { name: 'Tout désélectionner' }));

    expect(within(dialog).getByRole('button', { name: 'Générer le PDF' })).toBeDisabled();
    expect(within(dialog).getByRole('status')).toHaveTextContent('Sélectionnez au moins une information');
    fireEvent.submit(dialog);
    expect(generatePdf).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Tout sélectionner' }));
    within(dialog).getAllByRole('checkbox').forEach((checkbox) => expect(checkbox).toBeChecked());
    expect(within(dialog).getByRole('button', { name: 'Générer le PDF' })).toBeEnabled();
  });

  it('downloads the generated PDF using the chosen information and supplied filename', async () => {
    const user = userEvent.setup();
    const clickedLinks: Array<{ download: string; href: string }> = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clickedLinks.push({ download: this.download, href: this.href });
    });
    const dialog = renderDialog();
    await user.click(within(dialog).getByRole('button', { name: 'Tout désélectionner' }));
    await user.click(within(dialog).getByRole('checkbox', { name: 'Identité et poste : Prénom' }));
    await user.click(within(dialog).getByRole('checkbox', { name: 'Documents : Document' }));
    await user.click(within(dialog).getByRole('button', { name: 'Générer le PDF' }));

    expect(await within(dialog).findByRole('status')).toHaveTextContent('La fiche collaborateur PDF a été générée.');
    expect(generatePdf).toHaveBeenCalledOnce();
    expect(generatePdf).toHaveBeenCalledWith(person, expect.any(Array), {
      identity: ['firstName'], documents: ['title'],
    });
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(clickedLinks).toEqual([{ download: 'Fiche-Camille-DUPONT.pdf', href: 'blob:collaborator-sheet' }]);
    expect(document.querySelector('a[download]')).not.toBeInTheDocument();
  });

  it('shows a generation error and permits retry with the same choices', async () => {
    const user = userEvent.setup();
    generatePdf.mockRejectedValueOnce(new Error('PDF generation unavailable'));
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const dialog = renderDialog(new Set(['identity']));
    await user.click(within(dialog).getByRole('button', { name: 'Générer le PDF' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Impossible de générer la fiche collaborateur. Réessayez.');
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(within(dialog).getByRole('button', { name: 'Générer le PDF' })).toBeEnabled();
    expect(within(dialog).getByRole('checkbox', { name: 'Identité et poste : Matricule' })).toBeChecked();

    await user.click(within(dialog).getByRole('button', { name: 'Générer le PDF' }));
    expect(await within(dialog).findByRole('status')).toHaveTextContent('La fiche collaborateur PDF a été générée.');
    expect(generatePdf).toHaveBeenCalledTimes(2);
    expect(generatePdf.mock.calls[1]).toEqual(generatePdf.mock.calls[0]);
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('blocks duplicate submissions, option changes and every close path while generating', async () => {
    let finishGeneration!: (value: { blob: Blob; fileName: string }) => void;
    generatePdf.mockImplementation(() => new Promise((resolve) => { finishGeneration = resolve; }));
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const onClose = vi.fn();
    const dialog = renderDialog(new Set(['identity']), onClose);

    fireEvent.submit(dialog);
    fireEvent.submit(dialog);
    await waitFor(() => expect(generatePdf).toHaveBeenCalledOnce());
    expect(dialog).toHaveAttribute('aria-busy', 'true');
    expect(within(dialog).getByRole('button', { name: 'Génération…' })).toBeDisabled();
    within(dialog).getAllByRole('button', { name: 'Fermer' }).forEach((button) => expect(button).toBeDisabled());
    expect(within(dialog).getByRole('button', { name: 'Tout sélectionner' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Tout désélectionner' })).toBeDisabled();
    within(dialog).getAllByRole('checkbox').forEach((checkbox) => expect(checkbox).toBeDisabled());

    fireEvent.submit(dialog);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    fireEvent.mouseDown(dialog.parentElement!);
    expect(onClose).not.toHaveBeenCalled();
    expect(generatePdf).toHaveBeenCalledOnce();

    finishGeneration({ blob: new Blob(['pdf']), fileName: 'Fiche.pdf' });
    expect(await within(dialog).findByRole('status')).toHaveTextContent('La fiche collaborateur PDF a été générée.');
    expect(dialog).not.toHaveAttribute('aria-busy');
    expect(within(dialog).getByRole('button', { name: 'Générer le PDF' })).toBeEnabled();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
