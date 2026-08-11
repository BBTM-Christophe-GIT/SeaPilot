import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FleetCertificatesPage } from './FleetCertificatesPage';
import { buildFleetCertificateFileName, mapFleetCertificateRows } from './fleetCertificateQueries';

const certificates = [
  {
    id: 42, company_id: 1, vessel_id: 1, vessel_name: 'GOURY', vessel: { acronym: 'GRY' },
    category_key: '02-securite', category_label: '02 - Centre de Sécurité des Navires',
    document_title: 'Certificat de Franc-Bord', title: 'Certificat de Franc-Bord', status: 'renew_due',
    issued_on: '2025-09-15', expires_on: '2026-09-15', planned_on: null, alarm_on: '2026-06-17',
    provider_name: 'Bureau Veritas', visit_location: 'Cherbourg', workflow_status: 'due', renewal_notes: null,
    renaming_rule_key: 'vessel-title-expiry-year', original_file_name: 'GRY - Certificat de Franc-Bord.pdf',
    file_name: 'GRY - Certificat de Franc-Bord.pdf', source_label: 'sharepoint-iqy', file_url: null,
    storage_bucket: 'fleet-certificates', storage_path: '1/GRY/legacy/franc-bord.pdf', mime_type: 'application/pdf',
    file_size_bytes: 240000, current_version_no: 1, is_active_fleet: true, notes: null, updated_at: '2026-08-11T11:42:00Z',
  },
  {
    id: 43, company_id: 1, vessel_id: 4, vessel_name: 'SUROIT', vessel: { acronym: 'SUR' },
    category_key: '06-incendie', category_label: '06 - Incendie', document_title: 'Certificat extincteurs',
    title: 'Certificat extincteurs', status: 'expired', issued_on: '2025-08-01', expires_on: '2026-08-01',
    planned_on: null, alarm_on: '2026-05-03', provider_name: null, visit_location: null, workflow_status: 'due',
    renewal_notes: null, renaming_rule_key: 'vessel-title-expiry-year', original_file_name: 'SUR - Certificat extincteurs.pdf',
    file_name: 'SUR - Certificat extincteurs.pdf', source_label: 'sharepoint-iqy', file_url: null,
    storage_bucket: 'fleet-certificates', storage_path: '1/SUR/legacy/extincteurs.pdf', mime_type: 'application/pdf',
    file_size_bytes: 200000, current_version_no: 1, is_active_fleet: true, notes: null, updated_at: '2026-08-11T11:42:00Z',
  },
];

const findings = [{
  id: 81, company_id: 1, certificate_id: 42, reference: 'EC-2026-0012', finding_type: 'major_non_conformity',
  title: 'Corrosion du support bâbord', description: 'Corrosion perforante à reprendre avant validation.', detected_on: '2026-07-16',
  treatment_delay_days: 21, treatment_due_on: '2026-08-06', status: 'in_progress', progress: 60,
  responsible_person_id: 9303, responsible_name: 'Luc MARTIN', created_at: '2026-07-16T09:14:00Z', updated_at: '2026-08-10T15:20:00Z',
}];

function createClient() {
  const rpc = vi.fn().mockResolvedValue({ data: 42, error: null });
  const storageApi = { createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://signed.test/document' }, error: null }), download: vi.fn(), upload: vi.fn().mockResolvedValue({ error: null }), remove: vi.fn().mockResolvedValue({ error: null }) };
  const client = {
    rpc, storage: { from: vi.fn().mockReturnValue(storageApi) },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'fleet_certificates') return { select: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: certificates, error: null }) }) }) };
      if (table === 'fleet_certificate_findings') return { select: vi.fn().mockResolvedValue({ data: findings, error: null }), insert: vi.fn() };
      if (table === 'fleet_certificate_finding_attachments') return { select: vi.fn().mockResolvedValue({ data: [], error: null }), insert: vi.fn() };
      if (table === 'fleet_certificate_finding_events') return { select: vi.fn().mockResolvedValue({ data: [{ id: 91, finding_id: 81, event_type: 'created', note: 'Écart créé', created_at: '2026-07-16T09:14:00Z' }], error: null }), insert: vi.fn() };
      if (table === 'people') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [{ id: 9303, first_name: 'Luc', last_name: 'MARTIN', function_label: 'Chef mécanicien', active: true }], error: null }) }) };
      throw new Error(`Unexpected table ${table}`);
    }),
  };
  return { client, rpc };
}

describe('FleetCertificatesPage', () => {
  it('prioritizes expired documents, upcoming deadlines and open findings', async () => {
    const user = userEvent.setup(); const { client } = createClient();
    render(<FleetCertificatesPage client={client as never} roles={['direction']} />);
    expect(await screen.findByRole('heading', { name: 'Certificats flotte' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sujets à traiter' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Échéances à venir' })).toBeInTheDocument();
    expect(screen.getByText('Corrosion du support bâbord')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /1 documents échus/ })).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('Rechercher un certificat, un navire…'), 'extincteurs');
    const library = screen.getByRole('heading', { name: 'Bibliothèque documentaire' }).closest('section')!;
    expect(within(library).getByRole('treeitem', { name: 'Navire SUROIT' })).toBeInTheDocument();
    expect(within(library).getByRole('treeitem', { name: 'Catégorie 06 - Incendie' })).toBeInTheDocument();
    expect(within(library).getByText('Certificat extincteurs')).toBeInTheDocument();
    expect(within(library).queryByText('Certificat de Franc-Bord')).not.toBeInTheDocument();
  });

  it('organizes the document library by vessel, category and document', async () => {
    const user = userEvent.setup(); const { client } = createClient();
    render(<FleetCertificatesPage client={client as never} roles={['direction']} />);
    const library = (await screen.findByRole('heading', { name: 'Bibliothèque documentaire' })).closest('section')!;
    expect(within(library).getByText('Navire', { selector: 'b' })).toBeInTheDocument();
    expect(within(library).getByText('Catégorie', { selector: 'b' })).toBeInTheDocument();
    expect(within(library).getByRole('treeitem', { name: 'Navire GOURY' })).toHaveAttribute('aria-expanded', 'true');
    expect(within(library).getByRole('treeitem', { name: 'Catégorie 02 - Centre de Sécurité des Navires' })).toHaveAttribute('aria-expanded', 'true');
    expect(within(library).getByRole('treeitem', { name: 'Document Certificat de Franc-Bord' })).toBeInTheDocument();
    await user.click(within(library).getByRole('button', { name: /Tout déplier/ }));
    expect(within(library).getByRole('treeitem', { name: 'Navire SUROIT' })).toHaveAttribute('aria-expanded', 'true');
    expect(within(library).getByRole('treeitem', { name: 'Catégorie 06 - Incendie' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('opens a certificate workspace with finding evidence and report scopes', async () => {
    const user = userEvent.setup(); const { client } = createClient();
    render(<FleetCertificatesPage client={client as never} roles={['armement']} />);
    await user.click(await screen.findByText('Corrosion du support bâbord'));
    expect(await screen.findByRole('heading', { name: 'Certificat de Franc-Bord' })).toBeInTheDocument();
    expect(screen.getByText('EC-2026-0012')).toBeInTheDocument();
    expect(screen.getByText('Constat & preuves')).toBeInTheDocument();
    expect(screen.getByText('Suivi du traitement')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Générer un rapport/ }));
    expect(screen.getByRole('button', { name: 'Cet écart' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ce certificat' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tous les écarts flotte' })).toBeInTheDocument();
  });

  it('exposes the new document workflow to fleet managers', async () => {
    const user = userEvent.setup(); const { client } = createClient();
    render(<FleetCertificatesPage client={client as never} roles={['direction']} />);
    await user.click(await screen.findByRole('button', { name: 'Ajouter un document' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Ajouter un document');
    expect(screen.getByText('PDF, image ou Excel · 50 Mo maximum')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Nom du document'), { target: { value: 'Rapport radio' } });
  });

  it('keeps the BBTM file renaming convention', () => {
    const certificate = mapFleetCertificateRows([certificates[0] as never])[0];
    expect(buildFleetCertificateFileName(certificate, '2027-09-15', 'scan final.PDF')).toBe('GRY - Certificat de Franc-Bord - 2027.pdf');
  });
});
