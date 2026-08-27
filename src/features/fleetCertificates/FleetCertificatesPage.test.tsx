import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FleetCertificatesPage } from './FleetCertificatesPage';
import { resolveFleetCertificateReportSelection } from './FleetCertificateReportDialog';
import {
  buildFleetCertificateFileName,
  getDefaultFleetCertificateExpiryDate,
  mapFleetCertificateRows,
  normalizeFleetCertificateDocumentName,
} from './fleetCertificateQueries';

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
  assignments: [{ provider_id: 8, specialty_id: 801, contact_id: 811, scheduled_start: '2026-09-01T07:00:00Z', scheduled_end: '2026-09-01T09:00:00Z', provider: { id: 8, name: 'SERVAUX' }, specialty: { id: 801, name: 'Visite Radeaux' }, contact: { id: 811, full_name: 'Yann DUVAL' } }],
}];

function createClient() {
  const rpc = vi.fn().mockResolvedValue({ data: 42, error: null });
  const storageApi = { createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://signed.test/document' }, error: null }), download: vi.fn().mockResolvedValue({ data: new Blob(['document']), error: null }), upload: vi.fn().mockResolvedValue({ error: null }), remove: vi.fn().mockResolvedValue({ error: null }) };
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
  return { client, rpc, storageApi };
}

describe('FleetCertificatesPage', () => {
  it('groups the library, treatment, deadlines, visits and preview in one workspace', async () => {
    const user = userEvent.setup(); const { client } = createClient();
    render(<FleetCertificatesPage client={client as never} roles={['direction']} />);
    expect(await screen.findByRole('heading', { name: 'Certificats flotte' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /documents échus/ })).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Menu des certificats flotte' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Pilotage du traitement' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Échéances à venir' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Visites prestataires' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Aperçu du document' })).toBeInTheDocument();

    const library = screen.getByRole('heading', { name: 'Bibliothèque documentaire' }).closest('section')!;
    await user.type(within(library).getByRole('textbox', { name: 'Rechercher dans la bibliothèque documentaire' }), 'extincteurs');
    expect(within(library).getByRole('treeitem', { name: 'Navire SUROIT' })).toBeInTheDocument();
    expect(within(library).getByText('Certificat extincteurs')).toBeInTheDocument();
    expect(within(library).queryByText('Certificat de Franc-Bord')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Échéances à venir' }));
    expect(screen.getByRole('heading', { name: 'Documents à renouveler' })).toBeInTheDocument();
    expect(screen.getAllByText('Certificat extincteurs').length).toBeGreaterThanOrEqual(2);
    await user.click(screen.getByRole('tab', { name: 'Visites prestataires' }));
    expect(screen.getByText('SERVAUX · Visite Radeaux')).toBeInTheDocument();
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
    expect(within(library).getByRole('button', { name: 'Programmer une visite pour Certificat de Franc-Bord' })).toBeInTheDocument();
    expect(within(library).getByRole('button', { name: 'Supprimer Certificat de Franc-Bord' })).toBeInTheDocument();
    expect(within(library).getByRole('button', { name: 'Renouveler Certificat de Franc-Bord' })).toBeInTheDocument();
    expect(within(library).getByRole('button', { name: 'Télécharger Certificat de Franc-Bord' })).toBeInTheDocument();
    expect(within(library).queryByRole('button', { name: /Gérer/ })).not.toBeInTheDocument();
    await user.click(within(library).getByRole('checkbox', { name: 'Sélectionner Certificat de Franc-Bord' }));
    expect(within(library).getByRole('button', { name: 'Télécharger (1)' })).toBeEnabled();
    expect(screen.getByRole('navigation', { name: 'Menu des certificats flotte' })).not.toHaveTextContent('Télécharger');
    expect(within(library).getAllByText('1 à traiter').length).toBeGreaterThanOrEqual(3);
    await user.click(within(library).getByRole('button', { name: /Tout déplier/ }));
    expect(within(library).getByRole('treeitem', { name: 'Navire SUROIT' })).toHaveAttribute('aria-expanded', 'true');
    expect(within(library).getByRole('treeitem', { name: 'Catégorie 06 - Incendie' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('opens a document preview from its row and keeps treatment actions in the tabbed workspace', async () => {
    const user = userEvent.setup(); const { client } = createClient();
    render(<FleetCertificatesPage client={client as never} roles={['armement']} />);
    const library = (await screen.findByRole('heading', { name: 'Bibliothèque documentaire' })).closest('section')!;
    await user.click(within(library).getByRole('button', { name: /GOURY/ }));
    await user.click(within(library).getByRole('button', { name: /02 - Centre de Sécurité des Navires/ }));
    await user.click(within(library).getByRole('button', { name: 'Prévisualiser Certificat de Franc-Bord' }));
    expect(screen.getByRole('tab', { name: 'Aperçu du document' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('heading', { name: 'Informations du document' })).toBeInTheDocument();
    expect(screen.getByTitle('Aperçu de Certificat de Franc-Bord')).toHaveAttribute('src', 'https://signed.test/document');
    expect(screen.getByText('15 sept. 2025')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Pilotage du traitement' }));
    expect(screen.getByRole('heading', { name: 'Certificat de Franc-Bord' })).toBeInTheDocument();
    expect(screen.getByText('EC-2026-0012')).toBeInTheDocument();
    expect(screen.getByText('Constat & preuves')).toBeInTheDocument();
    expect(screen.getByText('Suivi du traitement')).toBeInTheDocument();
    expect(screen.getByText('Arthur DEMO')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Générer un rapport' }));
    const reportDialog = screen.getByRole('dialog', { name: 'Générer un rapport' });
    expect(within(reportDialog).getByRole('radio', { name: /^Toute la flotte/ })).toHaveAttribute('aria-checked', 'true');
    expect(within(reportDialog).getByRole('radio', { name: /^Liste des documents/ })).toBeInTheDocument();
    expect(within(reportDialog).getByRole('radio', { name: /^Un navire/ })).toBeInTheDocument();
    expect(within(reportDialog).getByRole('radio', { name: /^Une catégorie/ })).toBeInTheDocument();
    expect(within(reportDialog).getByRole('radio', { name: /^Un document/ })).toBeInTheDocument();
    await user.click(within(reportDialog).getByRole('radio', { name: /^Un écart/ }));
    expect(within(reportDialog).getByRole('combobox', { name: 'Navire' })).toHaveValue('GOURY');
    expect(within(reportDialog).getByRole('combobox', { name: 'Catégorie' })).toHaveValue('02-securite');
    expect(within(reportDialog).getByRole('combobox', { name: 'Document' })).toHaveValue('42');
    expect(within(reportDialog).getByRole('combobox', { name: 'Écart' })).toHaveValue('81');
    expect(within(reportDialog).getByLabelText('Récapitulatif du rapport')).toHaveTextContent('EC-2026-0012');
    expect(within(reportDialog).getByRole('checkbox', { name: /^Liste des documents/ })).toBeChecked();
    expect(within(reportDialog).getByRole('checkbox', { name: /^Liste des écarts/ })).toBeChecked();
    await user.click(within(reportDialog).getByRole('radio', { name: /^Liste des documents/ }));
    expect(within(reportDialog).getByRole('checkbox', { name: /^GOURY/ })).toBeChecked();
    expect(within(reportDialog).getByRole('checkbox', { name: /^SUROIT/ })).toBeChecked();
    await user.click(within(reportDialog).getByRole('checkbox', { name: /^SUROIT/ }));
    expect(within(reportDialog).getByLabelText('Récapitulatif du rapport')).toHaveTextContent('1 navire sélectionné');
    await user.click(within(reportDialog).getByRole('checkbox', { name: /^Liste des écarts/ }));
    expect(within(reportDialog).getByLabelText('Récapitulatif du rapport')).toHaveTextContent('liste des écarts exclue');
    await user.click(within(reportDialog).getByRole('checkbox', { name: /^Liste des documents/ }));
    expect(within(reportDialog).getByRole('button', { name: 'Générer le rapport' })).toBeDisabled();
    expect(within(reportDialog).getByText('Sélectionnez au moins une liste à éditer.')).toBeInTheDocument();
    await user.click(within(reportDialog).getByRole('button', { name: 'Fermer' }));
    await user.click(screen.getByRole('button', { name: 'Nouvel écart' }));
    expect(screen.getByRole('option', { name: 'Findings' })).toHaveValue('finding');
  });

  it('lets fleet managers edit the selected document information', async () => {
    const user = userEvent.setup(); const { client, rpc } = createClient();
    render(<FleetCertificatesPage client={client as never} roles={['direction']} />);
    const library = (await screen.findByRole('heading', { name: 'Bibliothèque documentaire' })).closest('section')!;
    await user.click(within(library).getByRole('button', { name: /GOURY/ }));
    await user.click(within(library).getByRole('button', { name: /02 - Centre de Sécurité des Navires/ }));
    await user.click(within(library).getByRole('button', { name: 'Prévisualiser Certificat de Franc-Bord' }));
    await user.click(await screen.findByRole('button', { name: 'Modifier' }));

    const dialog = screen.getByRole('dialog', { name: 'Modifier les informations' });
    expect(within(dialog).getByRole('combobox', { name: 'Navire' })).toHaveValue('1');
    expect(within(dialog).getByRole('combobox', { name: 'Catégorie' })).toHaveValue('02-securite');
    expect(within(dialog).getByLabelText('Nom du document')).toHaveValue('Certificat de Franc-Bord');
    expect(within(dialog).getByLabelText('Date d’émission')).toHaveValue('2025-09-15');
    expect(within(dialog).getByLabelText('Date d’échéance (facultative)')).toHaveValue('2026-09-15');
    expect(within(dialog).getByText('Laissez vide pour une validité illimitée.')).toBeInTheDocument();

    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Navire' }), '4');
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Catégorie' }), '06-incendie');
    await user.clear(within(dialog).getByLabelText('Nom du document'));
    await user.type(within(dialog).getByLabelText('Nom du document'), 'Rapport incendie annuel');
    fireEvent.change(within(dialog).getByLabelText('Date d’émission'), { target: { value: '2026-08-19' } });
    fireEvent.change(within(dialog).getByLabelText('Date d’échéance (facultative)'), { target: { value: '2027-08-19' } });
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    expect(rpc).toHaveBeenCalledWith('update_fleet_certificate_document_metadata', {
      p_certificate_id: 42,
      p_vessel_id: 4,
      p_category_key: '06-incendie',
      p_category_label: '06 - Incendie',
      p_document_title: 'Rapport incendie annuel',
      p_issued_on: '2026-08-19',
      p_expires_on: '2027-08-19',
    });
    expect(await screen.findByText('Informations du document mises à jour.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Modifier les informations' })).not.toBeInTheDocument();
  });

  it('keeps document editing hidden from non-manager profiles', async () => {
    const user = userEvent.setup(); const { client } = createClient();
    render(<FleetCertificatesPage client={client as never} roles={['capitaine']} />);
    const library = (await screen.findByRole('heading', { name: 'Bibliothèque documentaire' })).closest('section')!;
    await user.click(within(library).getByRole('button', { name: /GOURY/ }));
    await user.click(within(library).getByRole('button', { name: /02 - Centre de Sécurité des Navires/ }));
    await user.click(within(library).getByRole('button', { name: 'Prévisualiser Certificat de Franc-Bord' }));
    expect(await screen.findByRole('heading', { name: 'Informations du document' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Modifier' })).not.toBeInTheDocument();
  });

  it('exposes the new document workflow to fleet managers', async () => {
    const user = userEvent.setup(); const { client } = createClient();
    render(<FleetCertificatesPage client={client as never} roles={['direction']} />);
    await user.click(await screen.findByRole('button', { name: 'Ajouter un document' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Ajouter un document');
    expect(screen.getByText('Pièce jointe facultative · PDF, image ou Excel · 50 Mo maximum')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Catégorie')).toHaveValue('');
    expect(within(dialog).getByRole('option', { name: '02 - Centre de Sécurité des Navires' })).toBeInTheDocument();
    expect(within(dialog).getByRole('option', { name: '06 - Incendie' })).toBeInTheDocument();
    expect(within(dialog).getByRole('option', { name: '08 - Levage' })).toBeInTheDocument();
    expect(within(dialog).getByRole('option', { name: '↳ 08.3 - Accessoires de levage' })).toBeInTheDocument();
    expect(within(dialog).getByRole('option', { name: '15 - Dotation Médicale' })).toBeInTheDocument();
    expect(within(dialog).getByRole('option', { name: '16 - Registre des produits dangereux' })).toBeInTheDocument();
    expect(document.querySelector('datalist option[value="Permis de Navigation"]')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Nom du document'), { target: { value: 'Rapport radio' } });
    await user.upload(within(dialog).getByLabelText('Pièce jointe facultative'), new File(['radio'], 'rapport-radio.pdf', { type: 'application/pdf' }));
    fireEvent.change(screen.getByLabelText('Date d’émission'), { target: { value: '2027-04-12' } });
    expect(screen.getByLabelText('Date d’échéance (facultative)')).toHaveValue('2028-04-12');
    expect(screen.getByText('GOURY - Rapport radio - 2027.pdf')).toBeInTheDocument();
    expect(screen.queryByText('Proposée à +1 an. Modifiable ou supprimable.')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Date d’échéance (facultative)'), { target: { value: '' } });
    expect(screen.getByLabelText('Date d’échéance (facultative)')).toHaveValue('');
  });

  it('creates a tracked line without requiring an uploaded document', async () => {
    const user = userEvent.setup(); const { client, rpc } = createClient();
    render(<FleetCertificatesPage client={client as never} roles={['direction']} />);
    await user.click(await screen.findByRole('button', { name: 'Ajouter un document' }));
    const dialog = screen.getByRole('dialog', { name: 'Ajouter un document' });
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Catégorie' }), '08-3-accessoires-levage');
    await user.type(within(dialog).getByLabelText('Nom du document'), 'Élingues et manilles');

    expect(within(dialog).getByLabelText('Pièce jointe facultative')).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Date d’émission/)).not.toBeRequired();
    expect(within(dialog).getByText('Sans pièce jointe, une ligne « Manquant » sera créée et le fichier pourra être ajouté plus tard.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter la ligne' }));

    expect(rpc).toHaveBeenCalledWith('create_fleet_certificate_line', {
      p_vessel_id: 1,
      p_category_key: '08-3-accessoires-levage',
      p_category_label: '08.3 - Accessoires de levage',
      p_document_title: 'Élingues et manilles',
      p_issued_on: null,
      p_expires_on: null,
    });
    expect(await screen.findByText('Ligne de suivi ajoutée.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Ajouter un document' })).not.toBeInTheDocument();
  });

  it('creates the document when an optional attachment is selected', async () => {
    const user = userEvent.setup(); const { client, rpc, storageApi } = createClient();
    render(<FleetCertificatesPage client={client as never} roles={['direction']} />);
    await user.click(await screen.findByRole('button', { name: 'Ajouter un document' }));
    const dialog = screen.getByRole('dialog', { name: 'Ajouter un document' });
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Catégorie' }), '06-incendie');
    await user.type(within(dialog).getByLabelText('Nom du document'), 'Rapport extinction fixe');
    const file = new File(['rapport'], 'rapport-extinction.pdf', { type: 'application/pdf' });
    await user.upload(within(dialog).getByLabelText('Pièce jointe facultative'), file);
    fireEvent.change(within(dialog).getByLabelText('Date d’émission'), { target: { value: '2026-08-19' } });

    expect(within(dialog).getByLabelText('Date d’émission')).toBeRequired();
    expect(within(dialog).getByRole('button', { name: 'Ajouter le document' })).toBeInTheDocument();
    expect(within(dialog).getByText('GOURY - Rapport extinction fixe - 2026.pdf')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter le document' }));

    expect(storageApi.upload).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('create_fleet_certificate_document', expect.objectContaining({
      p_vessel_id: 1,
      p_category_key: '06-incendie',
      p_document_title: 'Rapport extinction fixe',
      p_original_file_name: 'rapport-extinction.pdf',
      p_issued_on: '2026-08-19',
      p_expires_on: '2027-08-19',
    }));
    expect(await screen.findByText('Document ajouté.')).toBeInTheDocument();
  });

  it('submits the new issue and expiry dates when renewing a certificate', async () => {
    const user = userEvent.setup(); const { client, rpc, storageApi } = createClient();
    render(<FleetCertificatesPage client={client as never} roles={['direction']} />);
    const library = (await screen.findByRole('heading', { name: 'Bibliothèque documentaire' })).closest('section')!;
    await user.click(within(library).getByRole('button', { name: /GOURY/ }));
    await user.click(within(library).getByRole('button', { name: /02 - Centre de Sécurité des Navires/ }));
    await user.click(within(library).getByRole('button', { name: 'Renouveler Certificat de Franc-Bord' }));

    const dialog = screen.getByRole('dialog', { name: 'Renouveler le certificat' });
    fireEvent.change(within(dialog).getByLabelText('Date d’émission'), { target: { value: '2026-08-20' } });
    expect(within(dialog).getByLabelText('Nouvelle échéance (facultative)')).toHaveValue('2027-08-20');
    fireEvent.change(within(dialog).getByLabelText('Nouvelle échéance (facultative)'), { target: { value: '2028-08-20' } });
    await user.upload(
      within(dialog).getByLabelText('Nouveau certificat signé'),
      new File(['certificat'], 'franc-bord-signe.pdf', { type: 'application/pdf' }),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer la nouvelle version' }));

    expect(await screen.findByText('Renouvellement enregistré.')).toBeInTheDocument();
    expect(storageApi.upload).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('submit_fleet_certificate_renewal', expect.objectContaining({
      p_certificate_id: 42,
      p_original_file_name: 'franc-bord-signe.pdf',
      p_issued_on: '2026-08-20',
      p_expires_on: '2028-08-20',
    }));
  });

  it('opens the centered visit agenda from the Planning-style ribbon with searchable grouped ports', async () => {
    const user = userEvent.setup(); const { client } = createClient();
    render(<FleetCertificatesPage client={client as never} roles={['direction']} />);
    await user.click(await screen.findByRole('button', { name: 'Programmer une visite' }));
    const targetDialog = screen.getByRole('dialog');
    expect(within(targetDialog).getByRole('combobox', { name: 'Navire' })).toHaveValue('GOURY');
    expect(within(targetDialog).getByRole('combobox', { name: 'Catégorie' })).toHaveValue('02-securite');
    await user.selectOptions(within(targetDialog).getByRole('combobox', { name: 'Document' }), '42');
    await user.click(within(targetDialog).getByRole('button', { name: 'Continuer' }));
    const dialog = screen.getByRole('dialog', { name: 'Programmer une visite prestataire' });
    expect(dialog).toHaveClass('fcx-visit-dialog');
    expect(within(dialog).getByText('Planning des journées')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Début de l’intervention')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Fin de l’intervention')).toBeInTheDocument();
    const portInput = within(dialog).getByRole('combobox', { name: 'Lieu de visite' });
    await user.clear(portInput);
    await user.type(portInput, 'Cherbourg');
    expect(within(dialog).getByRole('option', { name: /^CherbourgFR CER$/ })).toBeInTheDocument();
    expect(within(dialog).getByText('Manche', { selector: 'h3' })).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Inclure les sujets, constats, suivis et photos')).toBeChecked();
    expect(within(dialog).getByRole('button', { name: 'Exporter le PDF' })).toBeEnabled();
    await user.click(within(dialog).getByRole('button', { name: 'Fermer' }));

    const library = screen.getByRole('heading', { name: 'Bibliothèque documentaire' }).closest('section')!;
    await user.click(within(library).getByRole('button', { name: /GOURY/ }));
    await user.click(within(library).getByRole('button', { name: /02 - Centre de Sécurité des Navires/ }));
    await user.click(within(library).getByRole('button', { name: 'Programmer une visite pour Certificat de Franc-Bord' }));
    expect(screen.getByRole('dialog', { name: 'Programmer une visite prestataire' })).toBeInTheDocument();
  });

  it('resolves every report perimeter independently from the current workspace selection', () => {
    const records = mapFleetCertificateRows(certificates as never);
    const mappedFindings = [{ id: 81, certificateId: 42 }] as never;
    const sections = { includeDocuments: true, includeFindings: true };
    expect(resolveFleetCertificateReportSelection(records, mappedFindings, { scope: 'fleet', ...sections })).toMatchObject({ certificates: records, findings: mappedFindings });
    expect(resolveFleetCertificateReportSelection(records, mappedFindings, { scope: 'vessel-list', vesselNames: ['GOURY', 'SUROIT'], ...sections }).certificates.map((item) => item.id)).toEqual([42, 43]);
    expect(resolveFleetCertificateReportSelection(records, mappedFindings, { scope: 'vessel-list', vesselNames: ['SUROIT'], ...sections }).certificates.map((item) => item.id)).toEqual([43]);
    expect(resolveFleetCertificateReportSelection(records, mappedFindings, { scope: 'vessel', vesselName: 'SUROIT', ...sections }).certificates.map((item) => item.id)).toEqual([43]);
    expect(resolveFleetCertificateReportSelection(records, mappedFindings, { scope: 'category', categoryKey: '02-securite', ...sections }).certificates.map((item) => item.id)).toEqual([42]);
    expect(resolveFleetCertificateReportSelection(records, mappedFindings, { scope: 'document', certificateId: 43, ...sections })).toMatchObject({ certificates: [{ id: 43 }], findings: [] });
    expect(resolveFleetCertificateReportSelection(records, mappedFindings, { scope: 'finding', certificateId: 42, findingId: 81, ...sections })).toMatchObject({ certificates: [{ id: 42 }], findings: [{ id: 81 }] });
  });

  it('uses the issue date naming convention and a removable one-year default expiry', () => {
    const certificate = mapFleetCertificateRows([certificates[0] as never])[0];
    expect(buildFleetCertificateFileName(certificate, '2027-09-15', 'scan final.PDF')).toBe('GOURY - Certificat de Franc-Bord - 2027.pdf');
    expect(normalizeFleetCertificateDocumentName('GOURY - Permis de Navigation - 2027-09-15.pdf', ['GOURY', 'GRY'])).toBe('Permis de Navigation');
    expect(getDefaultFleetCertificateExpiryDate('2027-04-12')).toBe('2028-04-12');
    expect(getDefaultFleetCertificateExpiryDate('2028-02-29')).toBe('2029-02-28');
  });

  it('filters findings, deadlines and visits from vessel and category rows', async () => {
    const user = userEvent.setup(); const { client } = createClient();
    render(<FleetCertificatesPage client={client as never} roles={['direction']} />);
    const library = (await screen.findByRole('heading', { name: 'Bibliothèque documentaire' })).closest('section')!;
    expect(screen.getByText('Périmètre :', { exact: false }).closest('.fcx-workspace-scope')).toHaveTextContent('Toute la flotte');
    expect(screen.getByRole('heading', { name: 'GOURY' })).toBeInTheDocument();
    expect(screen.getByText('Corrosion du support bâbord')).toBeInTheDocument();

    await user.click(within(library).getByRole('button', { name: /SUROIT/ }));
    expect(screen.getByText('Périmètre :', { exact: false }).closest('.fcx-workspace-scope')).toHaveTextContent('SUROIT');
    expect(screen.queryByText('Corrosion du support bâbord')).not.toBeInTheDocument();
    await user.click(within(library).getByRole('button', { name: /06 - Incendie/ }));
    expect(screen.getByText('Périmètre :', { exact: false }).closest('.fcx-workspace-scope')).toHaveTextContent('SUROIT · 06 - Incendie');

    await user.click(screen.getByRole('tab', { name: 'Échéances à venir' }));
    const workspace = document.querySelector<HTMLElement>('.fcx-workspace-panel')!;
    expect(within(workspace).getByText('Certificat extincteurs')).toBeInTheDocument();
    expect(within(workspace).queryByText('Certificat de Franc-Bord')).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Visites prestataires' }));
    expect(screen.getByText('Aucune visite prestataire programmée.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Afficher toute la flotte' }));
    expect(screen.getByText('SERVAUX · Visite Radeaux')).toBeInTheDocument();
  });
});
