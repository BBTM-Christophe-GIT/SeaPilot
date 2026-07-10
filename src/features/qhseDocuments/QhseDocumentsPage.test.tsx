import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { QhseDocumentsPage } from './QhseDocumentsPage';

const workPermitRow = {
  id: 1503,
  person_id: null,
  person_sharepoint_item_id: null,
  person_name: '',
  vessel_id: 12,
  vessel_sharepoint_item_id: '12',
  vessel_name: 'COTENTIN',
  category_key: 'Travaux a chaud',
  document_date: '2026-07-02',
  expires_on: '',
  revision_label: '',
  status: 'Ouvert',
  title: 'Permis travail COTENTIN.pdf',
  source_label: 'SharePoint',
  source_sharepoint_id: '1503',
  file_url: 'https://sharepoint.test/permis-travail.pdf',
  notes: '/sites/QHSE/Permis de Travail/PT-COTENTIN.pdf',
};

const safetyAlertRow = {
  id: 1507,
  person_id: null,
  person_sharepoint_item_id: null,
  person_name: '',
  vessel_id: null,
  vessel_sharepoint_item_id: '',
  vessel_name: '',
  category_key: 'Pont',
  document_date: '2026-06-20',
  expires_on: '',
  revision_label: '',
  status: 'Publie',
  title: 'Alerte securite pont.pdf',
  source_label: 'SharePoint',
  source_sharepoint_id: '1507',
  file_url: 'https://sharepoint.test/alerte-securite.pdf',
  notes: '/sites/QHSE/Alerte Securite/alerte.pdf',
};

const technicalDocumentRow = {
  id: 1508,
  person_id: null,
  person_sharepoint_item_id: null,
  person_name: '',
  vessel_id: 12,
  vessel_sharepoint_item_id: '12',
  vessel_name: 'COTENTIN',
  category_key: 'Moteur',
  document_date: '2026-06-01',
  expires_on: '',
  revision_label: 'A',
  status: 'Valide',
  title: 'Notice moteur COTENTIN.pdf',
  source_label: 'SharePoint',
  source_sharepoint_id: '1508',
  file_url: 'https://sharepoint.test/notice-moteur.pdf',
  notes: '/sites/QHSE/Documentation Technique/COTENTIN/moteur.pdf',
};

const liftingReportRow = {
  id: 1510,
  person_id: null,
  person_sharepoint_item_id: null,
  person_name: '',
  vessel_id: 12,
  vessel_sharepoint_item_id: '12',
  vessel_name: 'COTENTIN',
  category_key: 'Levage',
  document_date: '',
  expires_on: '2027-06-01',
  revision_label: '',
  status: '',
  title: 'Rapport levage COTENTIN.pdf',
  source_label: 'SharePoint',
  source_sharepoint_id: '1510',
  file_url: 'https://sharepoint.test/rapport-levage.pdf',
  notes: '/sites/QHSE/Registre des Apparaux de Levage  Rapports/rapport.pdf',
};

const documentRowsByTable: Record<string, unknown[]> = {
  fleet_documents: [],
  lifting_reports: [liftingReportRow],
  service_notes: [],
  shared_documents: [],
  safety_alerts: [safetyAlertRow],
  technical_documents: [technicalDocumentRow],
  vessel_equipment_documents: [],
  work_permits: [workPermitRow],
};

function createSelectChain(rows: unknown[]) {
  return {
    order: vi.fn().mockReturnValue({
      order: vi.fn().mockResolvedValue({ data: rows, error: null }),
    }),
  };
}

function createClient(rowsByTable: Record<string, unknown[]> = documentRowsByTable) {
  const insert = vi.fn().mockImplementation((payload: unknown) => ({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: {
          ...workPermitRow,
          id: 1800,
          ...(payload as object),
        },
        error: null,
      }),
    }),
  }));
  const client = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table in rowsByTable) {
        return {
          select: vi.fn().mockReturnValue(createSelectChain(rowsByTable[table])),
          insert,
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  };

  return { client, insert };
}

describe('QhseDocumentsPage', () => {
  it('filters imported QHSE documents by library, vessel, status, dates and search text', async () => {
    const user = userEvent.setup();
    const { client } = createClient();

    render(<QhseDocumentsPage client={client as never} roles={['direction']} />);

    expect(await screen.findByRole('heading', { name: 'QHSE documentaire' })).toBeInTheDocument();
    expect(screen.getByText('Alerte securite pont.pdf')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Filtre bibliotheque QHSE'), 'work_permits');
    await user.selectOptions(screen.getByLabelText('Filtre navire QHSE'), 'COTENTIN');
    await user.selectOptions(screen.getByLabelText('Filtre statut QHSE'), 'Ouvert');
    fireEvent.change(screen.getByLabelText('Document depuis'), { target: { value: '2026-07-01' } });
    fireEvent.change(screen.getByLabelText("Document jusqu'au"), { target: { value: '2026-07-31' } });
    fireEvent.change(screen.getByLabelText('Recherche documentaire'), { target: { value: 'travail' } });

    expect(screen.getByText('Permis travail COTENTIN.pdf')).toBeInTheDocument();
    expect(screen.getAllByText('Travaux a chaud').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Documents QHSE')).toHaveTextContent('1');
    expect(screen.getByLabelText('Permis ouverts')).toHaveTextContent('1');
    expect(screen.queryByText('Alerte securite pont.pdf')).not.toBeInTheDocument();
    expect(screen.queryByText('Notice moteur COTENTIN.pdf')).not.toBeInTheDocument();
  });

  it('creates a QHSE document for office roles', async () => {
    const user = userEvent.setup();
    const { client, insert } = createClient({
      ...documentRowsByTable,
      work_permits: [],
    });

    render(<QhseDocumentsPage client={client as never} roles={['armement']} />);

    await screen.findByRole('heading', { name: 'QHSE documentaire' });
    await user.selectOptions(screen.getByLabelText('Bibliotheque documentaire'), 'work_permits');
    fireEvent.change(screen.getByLabelText('Titre document QHSE'), { target: { value: 'Permis travaux machine.pdf' } });
    fireEvent.change(screen.getByLabelText('Categorie document'), { target: { value: 'Travaux machine' } });
    fireEvent.change(screen.getByLabelText('Navire document'), { target: { value: 'COTENTIN' } });
    fireEvent.change(screen.getByLabelText('Collaborateur document'), { target: { value: 'Arthur MAREST' } });
    fireEvent.change(screen.getByLabelText('Date document'), { target: { value: '2026-07-04' } });
    fireEvent.change(screen.getByLabelText('Echeance document'), { target: { value: '2026-07-10' } });
    fireEvent.change(screen.getByLabelText('Revision document'), { target: { value: 'Rev. 1' } });
    fireEvent.change(screen.getByLabelText('Statut document'), { target: { value: 'Ouvert' } });
    fireEvent.change(screen.getByLabelText('Notes document'), { target: { value: 'Intervention machine' } });
    await user.click(screen.getByRole('button', { name: 'Ajouter document' }));

    expect(insert).toHaveBeenCalledWith({
      category_key: 'Travaux machine',
      document_date: '2026-07-04',
      expires_on: '2026-07-10',
      notes: 'Intervention machine',
      person_name: 'Arthur MAREST',
      revision_label: 'Rev. 1',
      source_label: 'seapilot',
      status: 'Ouvert',
      title: 'Permis travaux machine.pdf',
      vessel_name: 'COTENTIN',
    });
    expect(await screen.findByText('Document ajoute.')).toBeInTheDocument();
    expect(screen.getByText('Permis travaux machine.pdf')).toBeInTheDocument();
  });
});
