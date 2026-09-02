import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ProceduresPage } from './ProceduresPage';

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
  approval_status: 'Document approuve',
  theme: 'URG',
  document_type: 'PRO',
  bridge_watch: true,
  version_label: '4',
};

const approvedProcedureRow = {
  id: 12,
  procedure_code: 'QSMS-OPS-01',
  title: 'Procédure embarquement ROZEL',
  status: 'approved',
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
  status: 'approved',
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

function orderedResult(data: unknown[]) {
  const result = {
    order: vi.fn(() => result),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve),
  };
  return result;
}

function createClient(options: { procedures?: unknown[]; publications?: unknown[]; created?: unknown; published?: unknown } = {}) {
  const procedures = options.procedures ?? [approvedProcedureRow, draftProcedureRow];
  const publications = options.publications ?? [publishedProcedureRow];
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
    throw new Error(`Unexpected table ${table}`);
  });
  const client = {
    from,
    storage: { from: vi.fn(() => ({ upload, remove, createSignedUrl })) },
  };
  return { client, from, upload, createSignedUrl, procedureInsert, publicationInsert };
}

describe('ProceduresPage', () => {
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
    expect(screen.getByRole('button', { name: /Nouveau document/i })).toBeEnabled();

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
    const created = { ...approvedProcedureRow, id: 44, title: 'Plan de préparation aux urgences', procedure_code: 'URG-08-A', document_number: 'URG-08-A' };
    const { client, upload, procedureInsert } = createClient({ procedures: [], publications: [], created });
    render(<ProceduresPage client={client as never} roles={['admin']} />);

    await screen.findByRole('heading', { name: 'Procédures QHSE' });
    await user.click(screen.getByRole('button', { name: /Nouveau document/i }));
    const dialog = screen.getByRole('dialog', { name: 'Nouveau document' });
    fireEvent.change(within(dialog).getByLabelText('Titre'), { target: { value: 'Plan de préparation aux urgences' } });
    fireEvent.change(within(dialog).getByLabelText('Numéro'), { target: { value: 'URG-08-A' } });
    const sourceFile = new File(['source'], 'urgence.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    await user.upload(within(dialog).getByLabelText(/Fichier source modifiable/i), sourceFile);
    fireEvent.submit(within(dialog).getByRole('button', { name: 'Enregistrer' }).closest('form') as HTMLFormElement);

    expect(await screen.findByText('Document QSMS ajouté.')).toBeInTheDocument();
    expect(upload).toHaveBeenCalledWith(expect.stringMatching(/^sources\//), sourceFile, expect.objectContaining({ upsert: false }));
    expect(procedureInsert).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Plan de préparation aux urgences',
      document_number: 'URG-08-A',
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
    const dialog = screen.getByRole('dialog', { name: 'Publier le PDF' });
    const pdf = new File(['pdf'], 'procedure-approuvee.pdf', { type: 'application/pdf' });
    await user.upload(within(dialog).getByLabelText(/PDF à diffuser/i), pdf);
    await user.click(within(dialog).getByRole('button', { name: 'Publier' }));

    expect(upload).toHaveBeenCalledWith(expect.stringMatching(/^published\/12\//), pdf, expect.any(Object));
    expect(publicationInsert).toHaveBeenCalledWith(expect.objectContaining({
      procedure_id: 12,
      storage_bucket: 'procedure-documents',
      file_name: 'procedure-approuvee.pdf',
      mime_type: 'application/pdf',
    }));
    expect(await screen.findByText(/PDF publié pour les profils Armement/i)).toBeInTheDocument();
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
      'https://view.officeapps.live.com/op/view.aspx?src=https%3A%2F%2Fstorage.test%2Fsigned',
      '_blank',
      'noopener,noreferrer',
    );
    open.mockRestore();
  });
});
