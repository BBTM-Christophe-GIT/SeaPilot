import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ProceduresPage } from './ProceduresPage';

const approvedProcedureRow = {
  id: 12,
  procedure_code: 'QSMS-OPS-01',
  title: 'Procedure embarquement ROZEL',
  status: 'approved',
  revision_label: 'Rev. 4',
  published_on: '2026-03-15',
  source_label: 'SharePoint',
  file_url: 'https://sharepoint.test/procedure.docx',
  notes: 'Document source QSMS',
};

const draftProcedureRow = {
  id: 13,
  procedure_code: 'QSMS-MAC-02',
  title: 'Consigne machine provisoire',
  status: 'draft',
  revision_label: 'Rev. 1',
  published_on: null,
  source_label: 'SharePoint',
  file_url: null,
  notes: 'A verifier',
};

const publishedProcedureRow = {
  id: 32,
  procedure_id: 12,
  procedure_sharepoint_item_id: '12',
  procedure_code: 'QSMS-OPS-01',
  title: 'Procedure embarquement ROZEL PDF',
  status: 'approved',
  revision_label: 'Rev. 4',
  published_on: '2026-03-20',
  source_label: 'SharePoint PDF',
  file_url: 'https://sharepoint.test/procedure.pdf',
  notes: 'Publication signee',
};

function createClient(procedures: unknown[] = [approvedProcedureRow, draftProcedureRow], publications: unknown[] = [publishedProcedureRow]) {
  const insert = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: approvedProcedureRow, error: null }),
    }),
  });
  const client = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'procedures') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: procedures, error: null }),
            }),
          }),
          insert,
        };
      }

      if (table === 'published_procedures') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: publications, error: null }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  };

  return { client, insert };
}

function createClientWithCreatedProcedure(createdProcedure: unknown) {
  const insert = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: createdProcedure, error: null }),
    }),
  });
  const client = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'procedures') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
          insert,
        };
      }

      if (table === 'published_procedures') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  };

  return { client, insert };
}

describe('ProceduresPage', () => {
  it('filters QHSE procedures by status, search text and document type', async () => {
    const user = userEvent.setup();
    const { client } = createClient();

    render(<ProceduresPage client={client as never} roles={['direction']} />);

    expect(await screen.findByRole('heading', { name: 'Procedures QHSE' })).toBeInTheDocument();
    expect(screen.getByText('Consigne machine provisoire')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Filtre statut'), 'approved');
    fireEvent.change(screen.getByLabelText('Recherche procedures'), { target: { value: 'ROZEL' } });

    expect(screen.getByText('Procedure embarquement ROZEL')).toBeInTheDocument();
    expect(screen.getByText('Procedure embarquement ROZEL PDF')).toBeInTheDocument();
    expect(screen.queryByText('Consigne machine provisoire')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Procedures approuvees')).toHaveTextContent('1');
    expect(screen.getByLabelText('Publications PDF publiees')).toHaveTextContent('1');

    await user.selectOptions(screen.getByLabelText('Type document'), 'publication');

    expect(screen.queryByText('Procedure embarquement ROZEL')).not.toBeInTheDocument();
    expect(screen.getByText('Procedure embarquement ROZEL PDF')).toBeInTheDocument();
  });

  it('creates a QHSE procedure for office roles', async () => {
    const user = userEvent.setup();
    const createdProcedure = {
      ...approvedProcedureRow,
      id: 44,
      procedure_code: 'QSMS-PON-07',
      title: 'Procedure controle pont',
      status: 'review',
      revision_label: 'Rev. A',
      published_on: '2026-05-01',
      source_label: 'seapilot',
      file_url: 'https://sharepoint.test/pont.docx',
      notes: 'Creation interne',
    };
    const { client, insert } = createClientWithCreatedProcedure(createdProcedure);

    render(<ProceduresPage client={client as never} roles={['armement']} />);

    await screen.findByRole('heading', { name: 'Procedures QHSE' });
    fireEvent.change(screen.getByLabelText('Code procedure'), { target: { value: 'QSMS-PON-07' } });
    fireEvent.change(screen.getByLabelText('Titre procedure'), { target: { value: 'Procedure controle pont' } });
    await user.selectOptions(screen.getByLabelText('Statut procedure'), 'review');
    fireEvent.change(screen.getByLabelText('Revision procedure'), { target: { value: 'Rev. A' } });
    fireEvent.change(screen.getByLabelText('Publication procedure'), { target: { value: '2026-05-01' } });
    fireEvent.change(screen.getByLabelText('URL fichier procedure'), {
      target: { value: 'https://sharepoint.test/pont.docx' },
    });
    fireEvent.change(screen.getByLabelText('Notes procedure'), { target: { value: 'Creation interne' } });
    await user.click(screen.getByRole('button', { name: 'Ajouter procedure' }));

    expect(insert).toHaveBeenCalledWith({
      procedure_code: 'QSMS-PON-07',
      title: 'Procedure controle pont',
      status: 'review',
      revision_label: 'Rev. A',
      published_on: '2026-05-01',
      source_label: 'seapilot',
      file_url: 'https://sharepoint.test/pont.docx',
      notes: 'Creation interne',
    });
    expect(await screen.findByText('Procedure ajoutee.')).toBeInTheDocument();
    expect(screen.getByText('Procedure controle pont')).toBeInTheDocument();
  });
});
