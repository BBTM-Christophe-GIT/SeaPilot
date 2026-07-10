import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FleetCertificatesPage } from './FleetCertificatesPage';

const validCertificateRow = {
  id: 42,
  vessel_id: 1,
  vessel_name: 'COTENTIN',
  category_key: 'navigation',
  title: 'Permis de navigation COTENTIN',
  status: 'valid',
  issued_on: '2025-01-10',
  expires_on: '2026-09-15',
  source_label: 'SharePoint',
  file_url: 'https://sharepoint.test/cotentin.pdf',
  notes: 'Archive flotte',
};

const renewalCertificateRow = {
  id: 43,
  vessel_id: 2,
  vessel_name: 'SUROIT',
  category_key: 'security',
  title: 'Certificat securite SUROIT',
  status: 'renew_due',
  issued_on: '2024-03-20',
  expires_on: '2026-08-01',
  source_label: 'SharePoint',
  file_url: 'https://sharepoint.test/suroit.pdf',
  notes: 'Renouvellement a preparer',
};

function createClient(certificates: unknown[] = [validCertificateRow, renewalCertificateRow]) {
  const insert = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: validCertificateRow, error: null }),
    }),
  });
  const client = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'fleet_certificates') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: certificates, error: null }),
            }),
          }),
          insert,
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  };

  return { client, insert };
}

function createClientWithCreatedCertificate(createdCertificate: unknown) {
  const insert = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: createdCertificate, error: null }),
    }),
  });

  return {
    client: {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'fleet_certificates') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
            insert,
          };
        }

        throw new Error(`Unexpected table ${table}`);
      }),
    },
    insert,
  };
}

describe('FleetCertificatesPage', () => {
  it('filters fleet certificates by vessel, status and search text', async () => {
    const user = userEvent.setup();
    const { client } = createClient();

    render(<FleetCertificatesPage client={client as never} roles={['direction']} />);

    expect(await screen.findByRole('heading', { name: 'Certificats flotte' })).toBeInTheDocument();
    expect(screen.getByText('Certificat securite SUROIT')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Filtre navire'), 'COTENTIN');
    await user.selectOptions(screen.getByLabelText('Filtre statut'), 'valid');
    fireEvent.change(screen.getByLabelText('Recherche certificats'), { target: { value: 'navigation' } });

    expect(screen.getByText('Permis de navigation COTENTIN')).toBeInTheDocument();
    expect(screen.queryByText('Certificat securite SUROIT')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Certificats valides')).toHaveTextContent('1');
    expect(screen.getByLabelText('Certificats a renouveler')).toHaveTextContent('0');
  });

  it('creates a fleet certificate for office roles', async () => {
    const user = userEvent.setup();
    const createdCertificate = {
      ...validCertificateRow,
      id: 44,
      vessel_name: 'COTENTIN',
      category_key: 'radio',
      title: 'Certificat radio COTENTIN',
      status: 'pending_validation',
      issued_on: '2026-01-01',
      expires_on: '2027-01-01',
      file_url: 'https://sharepoint.test/radio.pdf',
      notes: null,
    };
    const { client, insert } = createClientWithCreatedCertificate(createdCertificate);

    render(<FleetCertificatesPage client={client as never} roles={['armement']} />);

    await screen.findByRole('heading', { name: 'Certificats flotte' });
    fireEvent.change(screen.getByLabelText('Titre certificat'), { target: { value: 'Certificat radio COTENTIN' } });
    fireEvent.change(screen.getByLabelText('Navire certificat'), { target: { value: 'COTENTIN' } });
    fireEvent.change(screen.getByLabelText('Categorie certificat'), { target: { value: 'radio' } });
    await user.selectOptions(screen.getByLabelText('Statut certificat'), 'pending_validation');
    fireEvent.change(screen.getByLabelText('Delivrance certificat'), { target: { value: '2026-01-01' } });
    fireEvent.change(screen.getByLabelText('Echeance certificat'), { target: { value: '2027-01-01' } });
    fireEvent.change(screen.getByLabelText('URL fichier certificat'), {
      target: { value: 'https://sharepoint.test/radio.pdf' },
    });
    await user.click(screen.getByRole('button', { name: 'Ajouter certificat' }));

    expect(insert).toHaveBeenCalledWith({
      vessel_name: 'COTENTIN',
      category_key: 'radio',
      title: 'Certificat radio COTENTIN',
      status: 'pending_validation',
      issued_on: '2026-01-01',
      expires_on: '2027-01-01',
      source_label: 'seapilot',
      file_url: 'https://sharepoint.test/radio.pdf',
      notes: null,
    });
    expect(await screen.findByText('Certificat ajoute.')).toBeInTheDocument();
    expect(screen.getByText('Certificat radio COTENTIN')).toBeInTheDocument();
  });
});
