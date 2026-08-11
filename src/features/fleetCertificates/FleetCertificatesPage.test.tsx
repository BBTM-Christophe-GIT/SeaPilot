import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FleetCertificatesPage } from './FleetCertificatesPage';
import { buildFleetCertificateFileName, mapFleetCertificateRows, normalizeFleetCertificateDocumentName } from './fleetCertificateQueries';

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

const providers = [{
  id: 8, name: 'SERVAUX', address: '5 Quai de Guinée', city: 'Le Havre', phone: '02 32 74 95 80', company_email: null,
  specialties: [{ id: 801, name: 'Visite Radeaux', active: true }, { id: 802, name: 'Visite Equipements Incendie', active: true }],
  contacts: [{ id: 811, full_name: 'Yann DUVAL', role_label: null, email: 'y.duval@servaux.com', phone: '02 32 74 95 80', active: true }],
}];

const visits = [{
  id: 301, certificate_id: 42, scheduled_start: '2026-09-01T07:00:00Z', scheduled_end: '2026-09-01T09:00:00Z',
  location: 'Le Havre', purpose: 'Visite du certificat', notes: '', status: 'planned',
  certificate: { vessel_name: 'GOURY', category_label: '02 - Centre de Sécurité des Navires', document_title: 'Certificat de Franc-Bord' },
  assignments: [{ provider_id: 8, specialty_id: 801, contact_id: 811, provider: { id: 8, name: 'SERVAUX' }, specialty: { id: 801, name: 'Visite Radeaux' }, contact: { id: 811, full_name: 'Yann DUVAL' } }],
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
      if (table === 'fleet_certificate_finding_events') return { select: vi.fn().mockResolvedValue({ data: [{ id: 91, finding_id: 81, event_type: 'created', note: 'Écart créé', author: { display_name: 'Arthur DEMO' }, created_at: '2026-07-16T09:14:00Z' }], error: null }), insert: vi.fn() };
      if (table === 'people') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [{ id: 9303, first_name: 'Luc', last_name: 'MARTIN', function_label: 'Chef mécanicien', active: true }], error: null }) }) };
      if (table === 'service_providers') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ is: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: providers, error: null }) }) }) }) };
      if (table === 'fleet_certificate_visits') return { select: vi.fn().mockReturnValue({ neq: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: visits, error: null }) }) }) };
      if (table === 'fleet_certificate_document_names') return { select: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: [{ name: 'Permis de Navigation' }, { name: 'Certificat de Franc-Bord' }], error: null }) }) };
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
    expect(screen.getByRole('heading', { name: 'Calendrier des visites prestataires' })).toBeInTheDocument();
  });

  it('organizes the document library by vessel, category and document', async () => {
    const user = userEvent.setup(); const { client } = createClient();
    render(<FleetCertificatesPage client={client as never} roles={['direction']} />);
    const library = (await screen.findByRole('heading', { name: 'Bibliothèque documentaire' })).closest('section')!;
    expect(within(library).getByText('Navire', { selector: 'b' })).toBeInTheDocument();
    expect(within(library).getByText('Catégorie', { selector: 'b' })).toBeInTheDocument();
    expect(within(library).getByRole('treeitem', { name: 'Navire GOURY' })).toHaveAttribute('aria-expanded', 'false');
    expect(within(library).queryByRole('treeitem', { name: 'Catégorie 02 - Centre de Sécurité des Navires' })).not.toBeInTheDocument();
    expect(within(library).queryByRole('treeitem', { name: 'Document Certificat de Franc-Bord' })).not.toBeInTheDocument();
    await user.click(within(library).getByRole('button', { name: /GOURY/ }));
    await user.click(within(library).getByRole('button', { name: /02 - Centre de Sécurité des Navires/ }));
    expect(within(library).getByRole('treeitem', { name: 'Document Certificat de Franc-Bord' })).toBeInTheDocument();
    expect(within(library).getAllByText('1 à traiter').length).toBeGreaterThanOrEqual(3);
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
    expect(screen.getByRole('heading', { name: 'Bibliothèque documentaire' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Écarts & actions' })).toBeInTheDocument();
    expect(screen.getByLabelText('Rechercher dans la bibliothèque documentaire')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aperçu' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Échéances' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Versions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Prévisualisation' })).not.toBeInTheDocument();
    expect(screen.getByText('Constat & preuves')).toBeInTheDocument();
    expect(screen.getByText('Suivi du traitement')).toBeInTheDocument();
    expect(screen.getByText('Arthur DEMO')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ouvrir' })).not.toBeInTheDocument();
    expect(screen.getByText('SERVAUX · Visite Radeaux')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Certificat de Franc-Bord/ }).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: /Générer un rapport/ }));
    expect(screen.getByRole('button', { name: 'Cet écart' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ce certificat' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tous les écarts flotte' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Nouvel écart' }));
    expect(screen.getByRole('option', { name: 'Findings' })).toHaveValue('finding');
  });

  it('exposes the new document workflow to fleet managers', async () => {
    const user = userEvent.setup(); const { client } = createClient();
    render(<FleetCertificatesPage client={client as never} roles={['direction']} />);
    await user.click(await screen.findByRole('button', { name: 'Ajouter un document' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Ajouter un document');
    expect(screen.getByText('PDF, image ou Excel · 50 Mo maximum')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Catégorie')).toHaveValue('');
    expect(within(dialog).getByRole('option', { name: '02 - Centre de Sécurité des Navires' })).toBeInTheDocument();
    expect(within(dialog).getByRole('option', { name: '06 - Incendie' })).toBeInTheDocument();
    expect(document.querySelector('datalist option[value="Permis de Navigation"]')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Nom du document'), { target: { value: 'Rapport radio' } });
    fireEvent.change(screen.getByLabelText('Date d’échéance'), { target: { value: '2028-04-12' } });
    expect(screen.getByText('GOURY - Rapport radio - 2028.pdf')).toBeInTheDocument();
  });

  it('keeps the BBTM file renaming convention', () => {
    const certificate = mapFleetCertificateRows([certificates[0] as never])[0];
    expect(buildFleetCertificateFileName(certificate, '2027-09-15', 'scan final.PDF')).toBe('GOURY - Certificat de Franc-Bord - 2027.pdf');
    expect(normalizeFleetCertificateDocumentName('GOURY - Permis de Navigation - 2027.pdf', ['GOURY', 'GRY'])).toBe('Permis de Navigation');
  });
});
