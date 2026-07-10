import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DprPage } from './DprPage';

const cotentinDprRow = {
  id: 1200,
  title: 'DPR 2026-07-01',
  project_id: 880,
  project_sharepoint_item_id: '880',
  project_code: 'P-2026-014',
  project_title: 'Campagne Atlantique 2026',
  vessel_id: 12,
  vessel_sharepoint_item_id: '12',
  vessel_name: 'COTENTIN',
  report_date: '2026-07-01',
  report_time: '18:30',
  description: 'Transit et mesures',
  fuel_consumption_l: 1250.5,
  mgo_refueling_m3: 12.5,
  qhse_note: 'RAS',
  radio_contact: true,
  environment_incident_count: 1,
  person_accident_count: 0,
  dangerous_situation_count: 2,
  source_label: 'SharePoint',
};

const suroitDprRow = {
  id: 1202,
  title: 'DPR 2026-07-02',
  project_id: 881,
  project_sharepoint_item_id: '881',
  project_code: 'P-2026-015',
  project_title: 'Campagne Manche 2026',
  vessel_id: 13,
  vessel_sharepoint_item_id: '13',
  vessel_name: 'SUROIT',
  report_date: '2026-07-02',
  report_time: '17:15',
  description: 'Maintenance et attente meteo',
  fuel_consumption_l: 410,
  mgo_refueling_m3: 0,
  qhse_note: 'Brief securite',
  radio_contact: false,
  environment_incident_count: 0,
  person_accident_count: 0,
  dangerous_situation_count: 0,
  source_label: 'SharePoint',
};

const cotentinArchiveRow = {
  id: 1201,
  dpr_item_id: 1200,
  dpr_sharepoint_item_id: '1200',
  project_id: 880,
  project_sharepoint_item_id: '880',
  project_code: 'P-2026-014',
  project_title: 'Campagne Atlantique 2026',
  report_date: '2026-07-01',
  title: 'DPR P-2026-014 2026-07-01.pdf',
  source_label: 'SharePoint',
  source_sharepoint_id: '1201',
  file_url: 'https://sharepoint.test/dpr-cotentin.pdf',
  notes: '/sites/QHSE/DPR/P-2026-014/DPR-2026-07-01.pdf',
};

const suroitArchiveRow = {
  id: 1203,
  dpr_item_id: 1202,
  dpr_sharepoint_item_id: '1202',
  project_id: 881,
  project_sharepoint_item_id: '881',
  project_code: 'P-2026-015',
  project_title: 'Campagne Manche 2026',
  report_date: '2026-07-02',
  title: 'DPR P-2026-015 2026-07-02.pdf',
  source_label: 'SharePoint',
  source_sharepoint_id: '1203',
  file_url: 'https://sharepoint.test/dpr-suroit.pdf',
  notes: '/sites/QHSE/DPR/P-2026-015/DPR-2026-07-02.pdf',
};

const mgoPriceRow = {
  id: 44,
  price_date: '2026-07-01',
  price_ht: 812.45,
  currency: 'EUR',
  supplier_name: 'TotalEnergies',
  title: 'MGO juillet 2026',
  notes: 'Prix mensuel',
  source_label: 'SharePoint',
};

function createClient(
  reports: unknown[] = [cotentinDprRow, suroitDprRow],
  archives: unknown[] = [cotentinArchiveRow, suroitArchiveRow],
  mgoPrices: unknown[] = [mgoPriceRow],
) {
  const insert = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: cotentinDprRow, error: null }),
    }),
  });
  const client = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'dpr_items') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: reports, error: null }),
            }),
          }),
          insert,
        };
      }

      if (table === 'dpr_archives') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: archives, error: null }),
            }),
          }),
        };
      }

      if (table === 'mgo_prices') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: mgoPrices, error: null }),
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  };

  return { client, insert };
}

function createClientWithCreatedReport(createdReport: unknown) {
  const insert = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: createdReport, error: null }),
    }),
  });
  const client = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'dpr_items') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
          insert,
        };
      }

      if (table === 'dpr_archives') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      }

      if (table === 'mgo_prices') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  };

  return { client, insert };
}

describe('DprPage', () => {
  it('filters DPR reports and matching archives by project, vessel, date and search text', async () => {
    const user = userEvent.setup();
    const { client } = createClient();

    render(<DprPage client={client as never} roles={['direction']} />);

    expect(await screen.findByRole('heading', { name: 'Daily Progress Report' })).toBeInTheDocument();
    expect(screen.getByText('Maintenance et attente meteo')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Filtre projet DPR'), 'P-2026-014');
    await user.selectOptions(screen.getByLabelText('Filtre navire DPR'), 'COTENTIN');
    fireEvent.change(screen.getByLabelText('DPR depuis'), { target: { value: '2026-07-01' } });
    fireEvent.change(screen.getByLabelText("DPR jusqu'au"), { target: { value: '2026-07-01' } });
    fireEvent.change(screen.getByLabelText('Recherche DPR'), { target: { value: 'Transit' } });

    expect(screen.getByText('Transit et mesures')).toBeInTheDocument();
    expect(screen.getByText('DPR P-2026-014 2026-07-01.pdf')).toBeInTheDocument();
    expect(screen.queryByText('Maintenance et attente meteo')).not.toBeInTheDocument();
    expect(screen.queryByText('DPR P-2026-015 2026-07-02.pdf')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Rapports DPR')).toHaveTextContent('1');
    expect(screen.getByLabelText('Archives DPR importees')).toHaveTextContent('1');
  });

  it('creates a DPR report for office roles', async () => {
    const user = userEvent.setup();
    const createdReport = {
      ...cotentinDprRow,
      id: 1300,
      title: 'DPR manuel COTENTIN',
      project_code: 'P-2026-014',
      project_title: 'Campagne Atlantique 2026',
      vessel_name: 'COTENTIN',
      report_date: '2026-07-03',
      report_time: '19:00',
      description: 'Operation terminee',
      fuel_consumption_l: 900,
      mgo_refueling_m3: 4.5,
      qhse_note: 'RAS',
      radio_contact: true,
      source_label: 'seapilot',
    };
    const { client, insert } = createClientWithCreatedReport(createdReport);

    render(<DprPage client={client as never} roles={['armement']} />);

    await screen.findByRole('heading', { name: 'Daily Progress Report' });
    fireEvent.change(screen.getByLabelText('Titre DPR'), { target: { value: 'DPR manuel COTENTIN' } });
    fireEvent.change(screen.getByLabelText('Numero projet DPR'), { target: { value: 'P-2026-014' } });
    fireEvent.change(screen.getByLabelText('Nom projet DPR'), { target: { value: 'Campagne Atlantique 2026' } });
    fireEvent.change(screen.getByLabelText('Nom navire DPR'), { target: { value: 'COTENTIN' } });
    fireEvent.change(screen.getByLabelText('Date DPR'), { target: { value: '2026-07-03' } });
    fireEvent.change(screen.getByLabelText('Heure DPR'), { target: { value: '19:00' } });
    fireEvent.change(screen.getByLabelText('Conso carburant L'), { target: { value: '900' } });
    fireEvent.change(screen.getByLabelText('Avitaillement MGO m3'), { target: { value: '4,5' } });
    fireEvent.change(screen.getByLabelText('Description DPR'), { target: { value: 'Operation terminee' } });
    fireEvent.change(screen.getByLabelText('Note QHSE DPR'), { target: { value: 'RAS' } });
    await user.click(screen.getByLabelText('Contact radio'));
    await user.click(screen.getByRole('button', { name: 'Ajouter DPR' }));

    expect(insert).toHaveBeenCalledWith({
      title: 'DPR manuel COTENTIN',
      project_code: 'P-2026-014',
      project_title: 'Campagne Atlantique 2026',
      vessel_name: 'COTENTIN',
      report_date: '2026-07-03',
      report_time: '19:00',
      description: 'Operation terminee',
      fuel_consumption_l: 900,
      mgo_refueling_m3: 4.5,
      qhse_note: 'RAS',
      radio_contact: true,
      source_label: 'seapilot',
    });
    expect(await screen.findByText('Rapport DPR ajoute.')).toBeInTheDocument();
    expect(screen.getByText('Operation terminee')).toBeInTheDocument();
  });
});
