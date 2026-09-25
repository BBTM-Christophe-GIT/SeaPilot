import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProceduresPage } from './ProceduresPage';
import { downloadProcedureListPdf } from './procedureListPdf';

vi.mock('./procedureListPdf', () => ({ downloadProcedureListPdf: vi.fn().mockResolvedValue(undefined) }));
afterEach(() => vi.unstubAllGlobals());

const baseMetadata = {
  category_label: 'Procédure d’urgence',
  diffusion_on: '2026-03-20',
  description: 'Consignes applicables à bord',
  regulatory_requirement: '',
  ism_chapter: '08',
  vessel_name: 'LE ROZEL',
  project_name: 'P144 - GUARD VESSEL EMDT; P145 - OIL SPILL SAIPEM COU',
  document_number: 'QSMS-OPS-01',
  restrictions: '',
  annual_review: true,
  theme: 'URG',
  document_type: 'PRO',
  bridge_watch: true,
  version_label: '4',
};

const approvedProcedureRow = {
  id: 12,
  procedure_code: 'QSMS-OPS-01',
  title: 'Procédure embarquement ROZEL',
  status: 'published',
  revision_label: 'Rev. 4',
  published_on: '2026-03-20',
  source_label: 'seapilot',
  file_url: null,
  notes: 'Document source QSMS',
  ...baseMetadata,
  source_storage_bucket: 'procedure-documents',
  source_storage_path: 'sources/source.docx',
  source_file_name: 'procedure.docx',
  source_mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  source_size_bytes: 2048,
};

const draftProcedureRow = {
  ...approvedProcedureRow,
  id: 13,
  procedure_code: 'QSMS-MAC-02',
  document_number: 'QSMS-MAC-02',
  title: 'Consigne machine provisoire',
  status: 'draft',
  published_on: null,
  ism_chapter: '10',
  vessel_name: 'GOURY',
  project_name: 'P258 - DCB PENLY',
};

const publishedProcedureRow = {
  id: 32,
  procedure_id: 12,
  procedure_sharepoint_item_id: '12',
  procedure_code: 'QSMS-OPS-01',
  title: 'Procédure embarquement ROZEL.pdf',
  status: 'published',
  revision_label: 'Rev. 4',
  published_on: '2026-03-20',
  source_label: 'seapilot',
  file_url: null,
  notes: 'Publication signée',
  ...baseMetadata,
  storage_bucket: 'procedure-documents',
  storage_path: 'published/12/procedure.pdf',
  file_name: 'procedure.pdf',
  mime_type: 'application/pdf',
  size_bytes: 4096,
  published_by: 'user-1',
};

const projectRows = [
  { id: 2, project_code: 'P144', title: 'GUARD VESSEL EMDT', archived_at: null },
  { id: 17, project_code: 'P254', title: 'NIVELAGE QUAI BOUGAINVILLE', archived_at: null },
  { id: 19, project_code: 'P264', title: 'PROJET ARCHIVÉ', archived_at: '2026-06-01T00:00:00Z' },
];

function orderedResult(data: unknown[]) {
  const result = {
    eq: vi.fn(() => result),
    order: vi.fn(() => result),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve),
  };
  return result;
}

function createClient(options: { procedures?: unknown[]; publications?: unknown[]; projects?: unknown[]; vessels?: unknown[]; created?: unknown; published?: unknown } = {}) {
  const procedures = options.procedures ?? [approvedProcedureRow, draftProcedureRow];
  const publications = options.publications ?? [publishedProcedureRow];
  const projects = options.projects ?? projectRows;
  const upload = vi.fn().mockResolvedValue({ error: null });
  const remove = vi.fn().mockResolvedValue({ error: null });
  const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: 'https://storage.test/signed' }, error: null });
  const procedureInsert = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: options.created || approvedProcedureRow, error: null }),
    }),
  });
  const publicationInsert = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: options.published || publishedProcedureRow, error: null }),
    }),
  });
  const update = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  });
  const removeRow = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
  const from = vi.fn().mockImplementation((table: string) => {
    if (table === 'procedures') {
      return {
        select: vi.fn(() => orderedResult(procedures)),
        insert: procedureInsert,
        update,
        delete: removeRow,
      };
    }
    if (table === 'published_procedures') {
      return {
        select: vi.fn(() => orderedResult(publications)),
        insert: publicationInsert,
        update,
        delete: removeRow,
      };
    }
    if (table === 'projects') {
      return {
        select: vi.fn(() => orderedResult(projects)),
      };
    }
    if (table === 'vessels') return { select: vi.fn(() => orderedResult(options.vessels ?? [{ name: 'GOURY' }, { name: 'LE ROZEL' }, { name: 'LANDEMER' }])) };
    throw new Error(`Unexpected table ${table}`);
  });
  const client = {
    from,
    storage: { from: vi.fn(() => ({ upload, remove, createSignedUrl })) },
  };
  return { client, from, upload, createSignedUrl, procedureInsert, publicationInsert };
}

describe('ProceduresPage', () => {
  it('assigns all twelve ISM themes and updates the suggested number when the theme changes', async () => {
    const user = userEvent.setup();
    const { client } = createClient({ procedures: [{ ...approvedProcedureRow, theme: 'OPE', document_number: '18' }] });
    render(<ProceduresPage client={client as never} roles={['admin']} />);
    await user.click(await screen.findByRole('button', { name: /Nouveau document/i }));
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByLabelText('Thème')).toHaveValue('GEN');
    expect(dialog.getByLabelText('Numéro')).toHaveValue('01');
    for (const [index, theme] of ['GEN', 'POL', 'RAC', 'DPA', 'AUT', 'REP', 'OPE', 'URG', 'SEC', 'TEC', 'SMS', 'VPC'].entries()) {
      await user.selectOptions(dialog.getByLabelText('ISM Chapitre'), String(index + 1).padStart(2, '0'));
      expect(dialog.getByLabelText('Thème')).toHaveValue(theme);
      expect(dialog.getByLabelText('Numéro')).toHaveValue(theme === 'OPE' ? '19' : '01');
    }
    for (const chapter of ['13', 'uncontrolled', 'unassigned']) {
      await user.selectOptions(dialog.getByLabelText('ISM Chapitre'), chapter);
      expect(dialog.getByLabelText('Thème')).toHaveValue('');
      await user.selectOptions(dialog.getByLabelText('Thème'), 'ADM');
      expect(dialog.getByLabelText('Thème')).toHaveValue('ADM');
    }
  });

  it('preserves an existing document until its chapter changes and keeps its number for the same theme', async () => {
    const user = userEvent.setup();
    const { client } = createClient({ procedures: [{ ...approvedProcedureRow, theme: 'URG', document_number: '07.1' }] });
    render(<ProceduresPage client={client as never} roles={['admin']} />);
    await user.click(await screen.findByLabelText('Modifier Procédure embarquement ROZEL'));
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.queryByLabelText('Mode de création')).not.toBeInTheDocument();
    expect(dialog.getByLabelText('Numéro')).toHaveValue('07.1');
    await user.selectOptions(dialog.getByLabelText('ISM Chapitre'), '08');
    expect(dialog.getByLabelText('Numéro')).toHaveValue('07.1');
    await user.selectOptions(dialog.getByLabelText('ISM Chapitre'), '10');
    expect(dialog.getByLabelText('Thème')).toHaveValue('TEC');
    expect(dialog.getByLabelText('Numéro')).toHaveValue('01');
  });

  it('creates a private Word source from the template without a manual upload', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new Uint8Array([80, 75, 3, 4, 42]).buffer }));
    const { client, upload, procedureInsert } = createClient({ procedures: [], publications: [] });
    render(<ProceduresPage client={client as never} roles={['direction']} />);
    await user.click(await screen.findByRole('button', { name: /Nouveau document/i }));
    const dialog = within(screen.getByRole('dialog'));
    await user.selectOptions(dialog.getByLabelText('Mode de création'), 'template');
    expect(dialog.getByRole('link', { name: 'Télécharger le modèle Word' })).toHaveAttribute('href', '/templates/procedure.docx');
    expect(dialog.getByLabelText('Stockage du fichier')).toHaveValue('supabase');
    expect(dialog.queryByLabelText(/Fichier source modifiable/i)).not.toBeInTheDocument();
    await user.type(dialog.getByLabelText('Titre'), 'Plan urgence');
    await user.selectOptions(dialog.getByLabelText('ISM Chapitre'), '08');
    await user.type(dialog.getByLabelText('Version'), 'a');
    await user.click(dialog.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Document QSMS ajouté.')).toBeInTheDocument();
    expect(upload).toHaveBeenCalledWith(expect.stringMatching(/^sources\//), expect.objectContaining({ name: 'URG 01-A - Plan urgence.docx', size: 5 }), expect.objectContaining({ upsert: false }));
    expect(procedureInsert).toHaveBeenCalledWith(expect.objectContaining({ theme: 'URG', ism_chapter: '08', document_number: '01', source_file_name: 'URG 01-A - Plan urgence.docx' }));
  });

  it('keeps the dialog open on template failure and allows a retry', async () => {
    const user = userEvent.setup();
    const fetch = vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValue({ ok: true, arrayBuffer: async () => new Uint8Array([80, 75, 3, 4]).buffer });
    vi.stubGlobal('fetch', fetch);
    const { client, upload, procedureInsert } = createClient({ procedures: [], publications: [] });
    render(<ProceduresPage client={client as never} roles={['admin']} />);
    await user.click(await screen.findByRole('button', { name: /Nouveau document/i }));
    const dialog = within(screen.getByRole('dialog'));
    await user.selectOptions(dialog.getByLabelText('Mode de création'), 'template');
    await user.type(dialog.getByLabelText('Titre'), 'Essai');
    await user.click(dialog.getByRole('button', { name: 'Enregistrer' }));
    expect(await dialog.findByRole('alert')).toHaveTextContent('modèle Procédure.docx est indisponible');
    expect(upload).not.toHaveBeenCalled();
    expect(procedureInsert).not.toHaveBeenCalled();
    await user.click(dialog.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Document QSMS ajouté.')).toBeInTheDocument();
  });

  it('supports saving a downloaded template in Drive without uploading another copy', async () => {
    const user = userEvent.setup();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const { client, upload, procedureInsert } = createClient({ procedures: [], publications: [] });
    render(<ProceduresPage client={client as never} roles={['admin']} />);
    await user.click(await screen.findByRole('button', { name: /Nouveau document/i }));
    const dialog = within(screen.getByRole('dialog'));
    await user.selectOptions(dialog.getByLabelText('Mode de création'), 'template');
    await user.selectOptions(dialog.getByLabelText('Stockage du fichier'), 'google-drive');
    await user.type(dialog.getByLabelText('Titre'), 'Copie Drive');
    await user.type(dialog.getByLabelText('Lien du fichier Google Drive'), 'https://drive.google.com/file/d/1234567890abcdef/view');
    await user.type(dialog.getByLabelText('Chemin dans le dossier synchronisé'), 'GEN/Copie.docx');
    await user.click(dialog.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Document QSMS ajouté.')).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    expect(procedureInsert).toHaveBeenCalledWith(expect.objectContaining({ source_google_drive_file_id: '1234567890abcdef', source_google_drive_path: 'GEN/Copie.docx' }));
  });

  it('restores the existing-file workflow when leaving template creation', async () => {
    const user = userEvent.setup();
    const { client } = createClient();
    render(<ProceduresPage client={client as never} roles={['admin']} />);
    await user.click(await screen.findByRole('button', { name: /Nouveau document/i }));
    const dialog = within(screen.getByRole('dialog'));
    await user.selectOptions(dialog.getByLabelText('Mode de création'), 'template');
    await user.selectOptions(dialog.getByLabelText('Mode de création'), 'existing');
    expect(dialog.queryByText('Modèle Procédure.docx')).not.toBeInTheDocument();
    await user.selectOptions(dialog.getByLabelText('Stockage du fichier'), 'supabase');
    expect(dialog.getByLabelText(/Fichier source modifiable/i)).toBeRequired();
  });

  it('lists vessel-specific and common documents, exporting only the checked documents in the current scope', async () => {
    const user = userEvent.setup();
    const common = { ...approvedProcedureRow, id: 14, title: 'Procédure commune', vessel_name: null };
    const { client } = createClient({ procedures: [approvedProcedureRow, draftProcedureRow, common] });
    render(<ProceduresPage client={client as never} roles={['admin']} />);
    await screen.findByRole('heading', { name: 'Procédures QHSE' });
    await user.selectOptions(screen.getByLabelText('Navire'), 'LE ROZEL');
    expect(screen.getByText('Procédure commune')).toBeInTheDocument();
    expect(screen.queryByText('Consigne machine provisoire')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Générer une liste des documents' }));
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByLabelText('Navire de la liste')).toHaveValue('LE ROZEL');
    expect(dialog.getAllByRole('checkbox')).toHaveLength(2);
    await user.click(dialog.getByLabelText('Inclure Procédure commune'));
    await user.click(dialog.getByRole('button', { name: 'Télécharger la liste PDF' }));
    expect(downloadProcedureListPdf).toHaveBeenLastCalledWith(expect.objectContaining({ vessel: 'LE ROZEL', library: 'sources', records: [expect.objectContaining({ id: 12 })] }));
    await user.selectOptions(dialog.getByLabelText('Navire de la liste'), 'GOURY');
    expect(dialog.queryByLabelText('Inclure Procédure embarquement ROZEL')).not.toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: 'Tout désélectionner' }));
    expect(dialog.getByRole('button', { name: 'Télécharger la liste PDF' })).toBeDisabled();
    await user.click(dialog.getByRole('button', { name: 'Tout sélectionner' }));
    await user.click(dialog.getByRole('button', { name: 'Télécharger la liste PDF' }));
    expect(downloadProcedureListPdf).toHaveBeenLastCalledWith(expect.objectContaining({ vessel: 'GOURY', records: [expect.objectContaining({ id: 14 }), expect.objectContaining({ id: 13 })] }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('combines vessel and status filters, preserving exclusions while exporting only visible selected documents', async () => {
    const user = userEvent.setup();
    const common = { ...approvedProcedureRow, id: 14, title: 'Procédure commune', vessel_name: null };
    const { client } = createClient({ procedures: [approvedProcedureRow, draftProcedureRow, common] });
    render(<ProceduresPage client={client as never} roles={['admin']} />);
    await user.click(await screen.findByRole('button', { name: 'Générer une liste des documents' }));
    const dialog = within(screen.getByRole('dialog'));
    const status = dialog.getByRole('combobox', { name: 'Statut' });
    expect(status).toHaveValue('');
    expect(dialog.getAllByRole('checkbox')).toHaveLength(3);

    await user.selectOptions(dialog.getByLabelText('Navire de la liste'), 'GOURY');
    await user.selectOptions(status, 'published');
    expect(dialog.getAllByRole('checkbox')).toHaveLength(1);
    expect(dialog.getByText(/1 document\(s\) disponible/)).toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: 'Télécharger la liste PDF' }));
    expect(downloadProcedureListPdf).toHaveBeenLastCalledWith(expect.objectContaining({ vessel: 'GOURY', records: [expect.objectContaining({ id: 14 })] }));
    await user.click(dialog.getByRole('button', { name: 'Tout désélectionner' }));

    await user.selectOptions(status, 'draft');
    expect(dialog.getByLabelText('Inclure Consigne machine provisoire')).toBeChecked();
    await user.click(dialog.getByRole('button', { name: 'Tout sélectionner' }));
    await user.click(dialog.getByRole('button', { name: 'Télécharger la liste PDF' }));
    expect(downloadProcedureListPdf).toHaveBeenLastCalledWith(expect.objectContaining({ records: [expect.objectContaining({ id: 13 })] }));
    await user.selectOptions(status, '');
    expect(dialog.getByLabelText('Inclure Procédure commune')).not.toBeChecked();
    expect(dialog.getByLabelText('Inclure Consigne machine provisoire')).toBeChecked();
    expect(dialog.getByText('1 document(s) sélectionné(s)')).toBeInTheDocument();

    await user.selectOptions(status, 'review');
    expect(dialog.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(dialog.getByText('Aucun document ne correspond aux filtres sélectionnés.')).toBeInTheDocument();
    expect(dialog.getByRole('button', { name: 'Télécharger la liste PDF' })).toBeDisabled();
    expect(dialog.getByRole('button', { name: 'Tout sélectionner' })).toBeDisabled();
  });

  it.each(['armement', 'capitaine', 'marin'] as const)('exports only published PDFs for a real %s role fixture', async (role) => {
    const user = userEvent.setup();
    const { client, from } = createClient();
    render(<ProceduresPage client={client as never} roles={[role]} />);
    await user.click(await screen.findByRole('button', { name: 'Générer une liste des documents' }));
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getAllByRole('checkbox')).toHaveLength(1);
    await user.selectOptions(dialog.getByRole('combobox', { name: 'Statut' }), 'draft');
    expect(dialog.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(dialog.getByRole('button', { name: 'Télécharger la liste PDF' })).toBeDisabled();
    await user.selectOptions(dialog.getByRole('combobox', { name: 'Statut' }), 'published');
    await user.click(dialog.getByRole('button', { name: 'Télécharger la liste PDF' }));
    expect(downloadProcedureListPdf).toHaveBeenLastCalledWith(expect.objectContaining({ library: 'published', records: [expect.objectContaining({ id: 32 })] }));
    expect(from).not.toHaveBeenCalledWith('procedures');
  });

  it('offers fleet vessels without existing procedures and retains a legacy vessel when editing', async () => {
    const user = userEvent.setup();
    const { client } = createClient({ vessels: [{ name: 'LANDEMER' }] });
    render(<ProceduresPage client={client as never} roles={['admin']} />);
    await user.click(await screen.findByRole('button', { name: /Nouveau document/i }));
    let dialog = within(screen.getByRole('dialog'));
    const vessel = dialog.getByRole('combobox', { name: /^Navire/ });
    expect(vessel).toHaveValue('');
    expect(within(vessel).getByRole('option', { name: 'LANDEMER' })).toBeInTheDocument();
    expect(within(vessel).queryByRole('option', { name: 'LE ROZEL' })).not.toBeInTheDocument();
    await user.selectOptions(vessel, 'LANDEMER');
    expect(vessel).toHaveValue('LANDEMER');
    await user.click(dialog.getByRole('button', { name: 'Annuler' }));
    await user.click(screen.getByLabelText('Modifier Procédure embarquement ROZEL'));
    dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByRole('combobox', { name: /^Navire/ })).toHaveValue('LE ROZEL');
  });

  it('uses the QSMS icon for every chapter and separates unassigned documents', async () => {
    const iconCases = [
      ['01', '01 - Généralités', 'info', 'blue'],
      ['02', "02 - Politique en Matière de Sécurité et de Protection de l'Environnement", 'shield-check', 'teal'],
      ['03', '03 - Responsabilité et Autorité de la Compagnie', 'building-2', 'blue'],
      ['04', '04 - Personne(s) désignée(s)', 'user-round-check', 'blue'],
      ['05', '05 - Responsabilités et autorité du capitaine', 'ship-wheel', 'blue'],
      ['06', '06 - Ressources et personnel', 'users-round', 'blue'],
      ['07', '07 - Etablissement de plans pour les opérations à bord', 'clipboard-list', 'blue'],
      ['08', "08 - Préparation aux Situations d'Urgence", 'triangle-alert', 'orange'],
      ['09', '09 - Notification et analyse des irrégularités', 'file-exclamation-point', 'orange'],
      ['10', '10 - Maintien en Etat du Navire et de son Armement', 'wrench', 'blue'],
      ['11', '11 - Documents', 'file-text', 'blue'],
      ['12', '12 - Vérification, examen et évaluation effectués par la compagnie', 'clipboard-check', 'teal'],
      ['13', '13 - Certification, Vérification et Contrôle', 'badge-check', 'teal'],
      ['uncontrolled', 'Documents non contrôlés', 'file-x', 'orange'],
      ['unassigned', '', 'circle-question-mark', 'amber'],
    ] as const;
    const procedures = iconCases.map(([key, ismChapter], index) => ({
      ...approvedProcedureRow,
      id: 100 + index,
      procedure_code: `DOC-${key}`,
      document_number: `DOC-${key}`,
      title: `Document ${key}`,
      ism_chapter: ismChapter,
      published_on: null,
    }));
    const { client } = createClient({ procedures, publications: [] });

    render(<ProceduresPage client={client as never} roles={['admin']} />);
    await screen.findByText('Document 01');

    for (const [key, , iconName, tone] of iconCases) {
      const icon = document.querySelector(`[data-chapter-icon="${key}"]`);
      expect(icon, `missing icon for chapter ${key}`).not.toBeNull();
      expect(icon).toHaveClass(`is-${tone}`);
      expect(icon?.querySelector(`.lucide-${iconName}`), `wrong icon for chapter ${key}`).not.toBeNull();
    }
    expect(screen.getByRole('button', { name: /Documents non contrôlés/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ISM - Chapitre non renseigné/ })).toBeInTheDocument();
  });

  it('shows the private QSMS workbench to Administration and Direction', async () => {
    const user = userEvent.setup();
    const { client } = createClient();

    render(<ProceduresPage client={client as never} roles={['direction']} />);

    expect(await screen.findByRole('heading', { name: 'Procédures QHSE' })).toBeInTheDocument();
    expect(screen.getByText('Procédure embarquement ROZEL')).toBeInTheDocument();
    expect(screen.getByText('Consigne machine provisoire')).toBeInTheDocument();
    expect(screen.getAllByText('LE ROZEL').length).toBeGreaterThan(0);
    expect(screen.getAllByText('P144 - GUARD VESSEL EMDT').length).toBeGreaterThan(0);
    expect(screen.getAllByText('P145 - OIL SPILL SAIPEM COU').length).toBeGreaterThan(0);
    expect(screen.queryByText('PRO · URG · 4')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Nouveau document/i })).toBeEnabled();
    expect(screen.queryByRole('link', { name: /installer le lanceur Windows/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /configurer le dossier synchronisé/i })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Projet'), 'P145 - OIL SPILL SAIPEM COU');
    expect(screen.getByText('Procédure embarquement ROZEL')).toBeInTheDocument();
    expect(screen.queryByText('Consigne machine provisoire')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Projet'), '');
    await user.selectOptions(screen.getByLabelText('Navire'), 'LE ROZEL');
    expect(screen.getByText('Procédure embarquement ROZEL')).toBeInTheDocument();
    expect(screen.queryByText('Consigne machine provisoire')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Navire'), '');
    fireEvent.change(screen.getByLabelText('Recherche de document'), { target: { value: 'P258' } });
    expect(screen.queryByText('Procédure embarquement ROZEL')).not.toBeInTheDocument();
    expect(screen.getByText('Consigne machine provisoire')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Recherche de document'), { target: { value: '' } });
    await user.click(screen.getByRole('button', { name: /PDF publiés/i }));
    expect(screen.getByText('Procédure embarquement ROZEL.pdf')).toBeInTheDocument();
  });

  it.each([['armement'], ['capitaine'], ['marin']] as const)(
    'shows only published PDFs to the %s profile',
    async (role) => {
      const { client, from } = createClient();
      render(<ProceduresPage client={client as never} roles={[role]} />);

      expect(await screen.findByText('Procédure embarquement ROZEL.pdf')).toBeInTheDocument();
      expect(screen.queryByText('Procédure embarquement ROZEL')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Nouveau document/i })).not.toBeInTheDocument();
      expect(screen.getByText(/uniquement les versions PDF/i)).toBeInTheDocument();
      expect(from).not.toHaveBeenCalledWith('procedures');
    },
  );

  it('uploads a new editable source to the private Supabase bucket', async () => {
    const user = userEvent.setup();
    const created = { ...approvedProcedureRow, id: 44, title: 'Plan de préparation aux urgences', procedure_code: 'URG 08-A', document_number: '08' };
    const { client, upload, procedureInsert } = createClient({ procedures: [], publications: [], created });
    render(<ProceduresPage client={client as never} roles={['admin']} />);

    await screen.findByRole('heading', { name: 'Procédures QHSE' });
    await user.click(screen.getByRole('button', { name: /Nouveau document/i }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByLabelText('Type document')).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Catégorie')).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Code procédure')).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Restrictions')).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Notes')).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Veille Passerelle')).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Statut d'approbation")).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Titre'), { target: { value: 'Plan de préparation aux urgences' } });
    await user.selectOptions(within(dialog).getByLabelText('Thème'), 'URG');
    fireEvent.change(within(dialog).getByLabelText('Numéro'), { target: { value: '08' } });
    fireEvent.change(within(dialog).getByLabelText('Version'), { target: { value: 'a' } });
    await user.selectOptions(within(dialog).getByRole('combobox', { name: /^Navire/ }), 'LANDEMER');
    fireEvent.change(within(dialog).getByLabelText('Projet'), { target: { value: 'P144 - GUARD VESSEL EMDT' } });
    fireEvent.change(within(dialog).getByLabelText('Date diffusion'), { target: { value: '2026-09-02' } });
    await user.click(within(dialog).getByLabelText(/Revue annuelle/));
    expect(within(dialog).getByRole('heading', { name: 'URG 08-A - Plan de préparation aux urgences' })).toBeInTheDocument();
    expect(within(dialog).getByText('Échéance le 02/09/2027')).toBeInTheDocument();
    const projectValues = Array.from(dialog.querySelectorAll('datalist option')).map((option) => option.getAttribute('value'));
    expect(projectValues).toContain('P254 - NIVELAGE QUAI BOUGAINVILLE');
    expect(projectValues).not.toContain('P264 - PROJET ARCHIVÉ');
    const sourceFile = new File(['source'], 'urgence.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    await user.selectOptions(within(dialog).getByLabelText('Stockage du fichier'), 'supabase');
    await user.upload(within(dialog).getByLabelText(/Fichier source modifiable/i), sourceFile);
    fireEvent.submit(within(dialog).getByRole('button', { name: 'Enregistrer' }).closest('form') as HTMLFormElement);

    expect(await screen.findByText('Document QSMS ajouté.')).toBeInTheDocument();
    expect(upload).toHaveBeenCalledWith(expect.stringMatching(/^sources\//), sourceFile, expect.objectContaining({ upsert: false }));
    expect(procedureInsert).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Plan de préparation aux urgences',
      procedure_code: 'URG 08-A',
      document_number: '08',
      version_label: 'A',
      vessel_name: 'LANDEMER',
      project_name: 'P144 - GUARD VESSEL EMDT',
      annual_review: true,
      source_storage_bucket: 'procedure-documents',
      source_file_name: 'urgence.docx',
    }));
  });

  it('publishes a selected PDF as a separate distribution record', async () => {
    const user = userEvent.setup();
    const { client, publicationInsert, upload } = createClient();
    render(<ProceduresPage client={client as never} roles={['admin']} />);
    await screen.findByText('Procédure embarquement ROZEL');

    await user.click(screen.getByLabelText('Publier Procédure embarquement ROZEL'));
    const dialog = screen.getByRole('dialog', { name: 'Confirmer la publication' });
    expect(within(dialog).getByText(/Êtes-vous sûr de vouloir publier ce document/i)).toBeInTheDocument();
    const pdf = new File(['pdf'], 'procedure-approuvee.pdf', { type: 'application/pdf' });
    await user.upload(within(dialog).getByLabelText(/PDF à diffuser/i), pdf);
    await user.click(within(dialog).getByRole('button', { name: 'Oui, publier' }));

    expect(upload).toHaveBeenCalledWith(expect.stringMatching(/^published\/12\//), pdf, expect.any(Object));
    expect(publicationInsert).toHaveBeenCalledWith(expect.objectContaining({
      procedure_id: 12,
      storage_bucket: 'procedure-documents',
      file_name: 'procedure-approuvee.pdf',
      mime_type: 'application/pdf',
      status: 'published',
      diffusion_on: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    }));
    expect(await screen.findByText(/PDF publié pour les profils Armement/i)).toBeInTheDocument();
  });

  it('proposes the next number for a theme and blocks an existing combination', async () => {
    const user = userEvent.setup();
    const procedures = [
      { ...approvedProcedureRow, id: 51, theme: 'OPE', document_number: '18', procedure_code: 'OPE 18-A' },
      { ...approvedProcedureRow, id: 52, theme: 'OPE', document_number: '07.1', procedure_code: 'OPE 07.1-A' },
    ];
    const { client } = createClient({ procedures, publications: [] });
    render(<ProceduresPage client={client as never} roles={['admin']} />);

    await screen.findByRole('heading', { name: 'Procédures QHSE' });
    await user.click(screen.getByRole('button', { name: /Nouveau document/i }));
    const dialog = screen.getByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('Thème'), 'OPE');

    expect(within(dialog).getByLabelText('Numéro')).toHaveValue('19');
    expect(within(dialog).getByText(/Proposition pour OPE : 19/i)).toBeInTheDocument();

    await user.clear(within(dialog).getByLabelText('Numéro'));
    await user.type(within(dialog).getByLabelText('Numéro'), '07.1');
    expect(within(dialog).getByText(/La combinaison OPE 07.1 existe déjà/i)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
  });

  it('opens a document when its name is clicked', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { client, createSignedUrl } = createClient();
    render(<ProceduresPage client={client as never} roles={['admin']} />);

    await user.click(await screen.findByRole('button', {
      name: 'Ouvrir QSMS-OPS-01 Procédure embarquement ROZEL',
    }));

    expect(createSignedUrl).toHaveBeenCalledWith('sources/source.docx', 300, undefined);
    expect(open).toHaveBeenCalledWith(
      'ms-word:ofv|u|https://storage.test/signed',
      '_self',
      undefined,
    );
    open.mockRestore();
  });

  it('creates a private Google Drive source without uploading a stale copy to Supabase', async () => {
    const user = userEvent.setup();
    const { client, upload, procedureInsert } = createClient({ procedures: [], publications: [] });
    render(<ProceduresPage client={client as never} roles={['admin']} />);
    await user.click(await screen.findByRole('button', { name: /Nouveau document/i }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('Stockage du fichier')).toHaveValue('google-drive');
    fireEvent.change(within(dialog).getByLabelText('Titre'), { target: { value: 'Source Drive' } });
    fireEvent.change(within(dialog).getByLabelText('Lien du fichier Google Drive'), { target: { value: 'https://drive.google.com/file/d/1234567890abcdef/view' } });
    fireEvent.change(within(dialog).getByLabelText('Chemin dans le dossier synchronisé'), { target: { value: 'URG/source.docx' } });
    fireEvent.submit(within(dialog).getByRole('button', { name: 'Enregistrer' }).closest('form')!);
    expect(await screen.findByText('Document QSMS ajouté.')).toBeInTheDocument();
    expect(upload).not.toHaveBeenCalled();
    expect(procedureInsert).toHaveBeenCalledWith(expect.objectContaining({
      source_google_drive_file_id: '1234567890abcdef', source_google_drive_path: 'URG/source.docx',
      source_file_name: 'source.docx', source_size_bytes: null,
    }));
  });

  it('launches the native Drive source and provides the authenticated Drive web link', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { client, createSignedUrl } = createClient({ procedures: [{ ...approvedProcedureRow,
      source_google_drive_file_id: '1234567890abcdef', source_google_drive_path: 'source.docx' }], publications: [] });
    render(<ProceduresPage client={client as never} roles={['admin']} />);
    await user.click(await screen.findByRole('button', { name: 'Ouvrir QSMS-OPS-01 Procédure embarquement ROZEL' }));
    expect(open).toHaveBeenCalledWith(expect.stringMatching(/^seapilot-drive:\/\/root\/open\//), '_self', undefined);
    await user.click(screen.getByLabelText('Voir dans Drive Procédure embarquement ROZEL'));
    expect(open).toHaveBeenLastCalledWith('https://drive.google.com/file/d/1234567890abcdef/view', '_blank', 'noopener,noreferrer');
    expect(createSignedUrl).not.toHaveBeenCalled();
    open.mockRestore();
  });
});
