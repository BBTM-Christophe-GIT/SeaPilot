import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FleetCertificatesPage } from './FleetCertificatesPage';
import { buildFleetCertificateFileName, mapFleetCertificateRows } from './fleetCertificateQueries';

const baseCertificate = {
  company_id: 1,
  category_label: 'Navigation',
  document_title: 'Permis de navigation',
  planned_on: null,
  alarm_on: '2026-06-17',
  provider_name: 'Bureau Veritas',
  visit_location: 'Cherbourg',
  workflow_status: 'due',
  renewal_notes: null,
  renaming_rule_key: 'vessel-title-expiry-year',
  original_file_name: 'GRY - Permis de Navigation.pdf',
  file_name: 'GRY - Permis de Navigation.pdf',
  storage_bucket: 'fleet-certificates',
  storage_path: '1/GRY/legacy/004-GRY-Permis-de-Navigation.pdf',
  mime_type: 'application/pdf',
  file_size_bytes: 240000,
  current_version_no: 1,
  is_active_fleet: true,
  updated_at: '2026-08-11T11:42:00Z',
  vessel: { acronym: 'GRY' },
};

const renewalCertificateRow = {
  ...baseCertificate,
  id: 42,
  vessel_id: 1,
  vessel_name: 'GOURY',
  category_key: 'navigation',
  title: 'Permis de navigation',
  status: 'renew_due',
  issued_on: '2025-09-15',
  expires_on: '2026-09-15',
  source_label: 'sharepoint-iqy',
  file_url: null,
  notes: null,
};

const expiredCertificateRow = {
  ...baseCertificate,
  id: 43,
  vessel_id: 4,
  vessel_name: 'SUROIT',
  vessel: { acronym: 'SUR' },
  category_key: 'security',
  category_label: 'Sécurité',
  document_title: 'Certificat sécurité',
  title: 'Certificat sécurité',
  status: 'expired',
  issued_on: '2025-08-01',
  expires_on: '2026-08-01',
  alarm_on: '2026-05-03',
  source_label: 'sharepoint-iqy',
  storage_path: '1/SUR/legacy/107-SUR-Certificat-Extinction-Fixe-et-Portatif.pdf',
  original_file_name: 'SUR - Certificat sécurité.pdf',
  file_name: 'SUR - Certificat sécurité.pdf',
  provider_name: null,
  visit_location: null,
  workflow_status: 'due',
  file_url: null,
  notes: null,
};

function createClient(certificates: unknown[] = [renewalCertificateRow, expiredCertificateRow]) {
  const rpc = vi.fn().mockResolvedValue({ data: 42, error: null });
  const client = {
    rpc,
    storage: {
      from: vi.fn().mockReturnValue({
        createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://signed.test/document' }, error: null }),
        upload: vi.fn().mockResolvedValue({ error: null }),
        remove: vi.fn().mockResolvedValue({ error: null }),
      }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'fleet_certificates') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: certificates, error: null }),
            }),
          }),
        };
      }
      if (table === 'fleet_certificate_versions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [{
                  id: 100,
                  version_no: 1,
                  status: 'active',
                  original_file_name: 'GRY - Permis de Navigation.pdf',
                  normalized_file_name: 'GRY - Permis de Navigation.pdf',
                  storage_bucket: 'fleet-certificates',
                  storage_path: '1/GRY/legacy/004-GRY-Permis-de-Navigation.pdf',
                  mime_type: 'application/pdf',
                  file_size_bytes: 240000,
                  issued_on: '2025-09-15',
                  expires_on: '2026-09-15',
                  is_current: true,
                  created_at: '2026-08-11T11:42:00Z',
                  validated_at: null,
                }],
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };
  return { client, rpc };
}

describe('FleetCertificatesPage', () => {
  it('renders the SharePoint-style metrics, filters and document search', async () => {
    const user = userEvent.setup();
    const { client } = createClient();
    render(<FleetCertificatesPage client={client as never} roles={['direction']} />);

    expect(await screen.findByRole('heading', { name: 'Suivi des certificats' })).toBeInTheDocument();
    expect(screen.getByLabelText('CERTIFICATS À 3 MOIS')).toHaveTextContent('1');
    expect(screen.getByLabelText('CERTIFICATS EXPIRÉS')).toHaveTextContent('1');
    expect(screen.getByLabelText('VISITES NON PLANIFIÉES À 3 MOIS')).toHaveTextContent('1');

    await user.selectOptions(screen.getByLabelText('Filtre navire'), 'SUROIT');
    expect(screen.getByRole('button', { name: /SUROIT/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /GOURY/ })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Recherche de document'), { target: { value: 'navigation' } });
    expect(await screen.findByText('Permis de navigation')).toBeInTheDocument();
    expect(screen.getByText(/GOURY · GRY - Permis/)).toBeInTheDocument();
  });

  it('plans a renewal and exposes the recovered renaming convention', async () => {
    const user = userEvent.setup();
    const { client, rpc } = createClient();
    render(<FleetCertificatesPage client={client as never} roles={['armement']} />);

    const eventButton = await screen.findByRole('button', { name: /Permis de navigation, échéance/ });
    await user.click(eventButton);
    expect(await screen.findByRole('dialog', { name: /Détail du certificat Permis de navigation/ })).toBeInTheDocument();
    expect(screen.getByText('ACRONYME - TITRE DU DOCUMENT - ANNÉE.extension')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Date prévue du renouvellement'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('Prestataire du renouvellement'), { target: { value: 'Socotec' } });
    await user.click(screen.getByRole('button', { name: 'Enregistrer la planification' }));

    expect(rpc).toHaveBeenCalledWith('plan_fleet_certificate_renewal', {
      p_certificate_id: 42,
      p_planned_on: '2026-09-01',
      p_provider_name: 'Socotec',
      p_visit_location: 'Cherbourg',
      p_notes: null,
    });
    expect(await screen.findByText('Renouvellement planifié.')).toBeInTheDocument();
  });

  it('builds normalized renewal names from vessel, title and expiry year', () => {
    const certificate = mapFleetCertificateRows([renewalCertificateRow as never])[0];
    expect(buildFleetCertificateFileName(certificate, '2027-09-15', 'scan final.PDF')).toBe(
      'GRY - Permis de navigation - 2027.pdf',
    );
  });
});
