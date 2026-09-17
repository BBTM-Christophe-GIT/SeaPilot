import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { ManagerHomeDashboard } from './ManagerHomeDashboard';
import { buildManagerHomeItems, fetchManagerHomeDashboard, toLocalIsoDate, type ManagerHomeSourceRows } from './managerHomeData';
import { buildManagerHomeVessels, itemMatchesVessel } from './managerHomeVessels';

const today = toLocalIsoDate(new Date());
const nextMonth = new Date();
nextMonth.setDate(nextMonth.getDate() + 35);
const future = toLocalIsoDate(nextMonth);
const lastYear = `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`;

function fixture(): ManagerHomeSourceRows {
  return {
    assignments: [
      { vessel_id: 10, crew_person_id: 42, captain_person_id: 42, watch_group: 'A', vessels: { name: 'GOURY' } },
      { vessel_id: 10, crew_person_id: 43, captain_person_id: 42, watch_group: 'A', vessels: { name: 'GOURY' } },
      { vessel_id: 10, crew_person_id: 44, captain_person_id: 44, watch_group: 'B', vessels: { name: 'GOURY' } },
      { vessel_id: 11, crew_person_id: 45, captain_person_id: 45, watch_group: 'A', vessels: { name: 'KROKDUR' } },
    ],
    purchases: [10, 11].map((id) => ({
      id, request_number: String(id), title: `Achat ${id}`, requested_on: today, requester_name: null,
      project_code: null, vessel_id: id, vessel_name: id === 10 ? 'GOURY' : 'KROKDUR', status: 'En attente',
      urgent: false, approval_status: null, ordered_on: null, expected_delivery_on: null, received_on: null,
    })),
    fleetCertificates: [{
      id: 1, vessel_id: 11, vessel_name: 'KROKDUR', document_title: 'Classe KROKDUR', title: null,
      status: 'renew_due', expires_on: future, planned_on: null, workflow_status: null, is_active_fleet: true,
    }],
    procedures: [
      { id: 1, procedure_code: 'QHSE', title: 'Revue GOURY', vessel_name: 'GOURY', project_name: null, annual_review: true, diffusion_on: lastYear, status: 'approved' },
      { id: 2, procedure_code: 'GEN', title: 'Revue générale', vessel_name: null, project_name: null, annual_review: true, diffusion_on: lastYear, status: 'approved' },
    ],
    people: [42, 43, 44, 45].map((id) => ({ id, first_name: `Personne ${id}`, last_name: 'TEST', function_label: null, departed_on: null, active: true })),
    hrDocuments: [42, 43, 44, 45].map((id) => ({
      id, person_id: id, person_name: null, category_key: 'medical', title: `Document ${id}`, status: 'missing', expires_on: null, medical_unfit: false,
    })),
    workingTimeCalculations: [42, 43, 44, 45].map((id) => ({
      id, person_id: id, local_window_end_date: today, rest_24h_seconds: 1000, longest_rest_24h_seconds: 1000,
      is_compliant: false, violation_codes: ['rest_24h'], calculated_at: today,
    })),
  };
}

// Profile fixtures exercise the actual loader/query filters, without the admin preview client.
function clientFor(sources = fixture(), failedTable?: string) {
  const tables: Record<string, unknown[]> = {
    planning_assignments: (sources.assignments || []).map((row) => ({ ...row, starts_on: today, ends_on: future, confirmation_status: 'confirmed' })),
    purchase_requests: sources.purchases, fleet_certificates: sources.fleetCertificates,
    procedures: sources.procedures, published_procedures: sources.procedures,
    people: sources.people, hr_documents: sources.hrDocuments, working_time_calculation_windows: sources.workingTimeCalculations,
  };
  const from = vi.fn((table: string) => {
    let rows = (tables[table] || []) as Record<string, unknown>[];
    const query = {
      select: vi.fn(() => query), order: vi.fn(() => query), limit: vi.fn(() => query),
      in: vi.fn((key: string, values: unknown[]) => { rows = rows.filter((row) => values.includes(row[key])); return query; }),
      eq: vi.fn((key: string, value: unknown) => { rows = rows.filter((row) => row[key] === value); return query; }),
      neq: vi.fn((key: string, value: unknown) => { rows = rows.filter((row) => row[key] !== value); return query; }),
      lte: vi.fn((key: string, value: string) => { rows = rows.filter((row) => String(row[key]) <= value); return query; }),
      gte: vi.fn((key: string, value: string) => { rows = rows.filter((row) => String(row[key]) >= value); return query; }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows, error: table === failedTable ? { message: 'Unavailable' } : null }).then(resolve),
    };
    return query;
  });
  return { client: { from } as unknown as SupabaseClient, from };
}

describe('home vessel associations and real profile scopes', () => {
  it('links every category to vessels and deduplicates shared personnel alerts', () => {
    const sources = fixture();
    sources.assignments!.push({ ...sources.assignments![0], vessel_id: 11, vessels: { name: 'KROKDUR' } }, sources.assignments![0]);
    sources.people[0].departed_on = future;
    sources.procedures[0].vessel_name = 'M/V Goury';
    const items = buildManagerHomeItems(sources);
    expect(items.find((item) => item.id === 'procedure-review-1')?.vessels).toEqual([{ key: 'vessel:10', name: 'GOURY' }]);
    for (const id of ['hr-document-42', 'working-time-42', 'contract-42']) {
      expect(items.find((item) => item.id === id)?.vessels.map((vessel) => vessel.key)).toEqual(['vessel:10', 'vessel:11']);
      expect(items.filter((item) => item.id === id)).toHaveLength(1);
    }
    expect(items.filter((item) => itemMatchesVessel(item, 'unassigned')).map((item) => item.id)).toEqual(['procedure-review-2']);
    expect(items.filter((item) => itemMatchesVessel(item, 'vessel:99'))).toEqual([]);
  });

  it('never uses a matching name to override an explicit foreign vessel ID', async () => {
    const sources = fixture();
    sources.purchases[1].vessel_name = 'GOURY';
    const result = await fetchManagerHomeDashboard(clientFor(sources).client, new Date(), { roles: ['capitaine'], personId: 42 });
    expect(result.items.map((item) => item.id)).not.toContain('purchase-11');
    const index = buildManagerHomeVessels(sources);
    expect(index.forRow(11, 'GOURY')[0].key).toBe('vessel:11');
    expect(index.forRow(null, 'GOURY')[0].key).toBe('name:goury');
  });

  it.each([
    { role: 'capitaine' as const, personId: 42, visible: [42, 43] },
    { role: 'marin' as const, personId: 43, visible: [43] },
  ])('keeps $role personnel, badges and vessel options within their allowed scope', async ({ role, personId, visible }) => {
    const { client, from } = clientFor();
    const result = await fetchManagerHomeDashboard(client, new Date(), { roles: [role], personId });
    expect(result.vessels).toEqual([{ key: 'vessel:10', name: 'GOURY' }]);
    expect(result.items.filter((item) => item.group === 'humanResources').map((item) => item.id)).toEqual(visible.map((id) => `hr-document-${id}`));
    expect(result.items.filter((item) => item.group === 'workingTime').map((item) => item.id)).toEqual(visible.map((id) => `working-time-${id}`));
    expect(result.items.filter((item) => item.group === 'purchases').map((item) => item.id)).toEqual(['purchase-10']);
    expect(from).toHaveBeenCalledWith('published_procedures');
    expect(from).not.toHaveBeenCalledWith('procedures');
  });

  it.each(['capitaine', 'marin'] as const)('fails closed for %s with missing identity, assignment or unavailable planning', async (role) => {
    const missingIdentity = clientFor();
    expect(await fetchManagerHomeDashboard(missingIdentity.client, new Date(), { roles: [role], personId: null })).toMatchObject({ items: [], vessels: [] });
    expect(missingIdentity.from).not.toHaveBeenCalled();
    expect(await fetchManagerHomeDashboard(clientFor({ ...fixture(), assignments: [] }).client, new Date(), { roles: [role], personId: 42 })).toMatchObject({ items: [], vessels: [] });
    expect(await fetchManagerHomeDashboard(clientFor(fixture(), 'planning_assignments').client, new Date(), { roles: [role], personId: 42 })).toMatchObject({ items: [], vessels: [], unavailableSources: ['les affectations Planning'] });
  });

  it('retains office data and warns if assignment information is unavailable', async () => {
    const result = await fetchManagerHomeDashboard(clientFor(fixture(), 'planning_assignments').client, new Date(), { roles: ['admin', 'marin'], personId: 42 });
    expect(result.items.filter((item) => item.group === 'purchases')).toHaveLength(2);
    expect(result.items.find((item) => item.id === 'hr-document-42')?.vessels).toEqual([]);
    expect(result.unavailableSources).toContain('les affectations Planning');
  });
});

describe('home vessel and category filter interaction', () => {
  it('updates badges, queue, totals and calendar when vessel, category and date change', async () => {
    render(<MemoryRouter><ManagerHomeDashboard client={clientFor().client} firstName="Test" personId={42} roles={['admin']} /></MemoryRouter>);
    const vesselFilters = screen.getByRole('group', { name: 'Filtrer par navire' });
    const categoryFilters = screen.getByRole('group', { name: 'Filtres de la file' });
    await within(vesselFilters).findByRole('button', { name: 'GOURY 8' });
    expect(within(vesselFilters).getByRole('button', { name: 'Toute la flotte 13' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(vesselFilters).getByRole('button', { name: 'GOURY 8' }));
    expect(screen.queryByText(/Achat 11/)).not.toBeInTheDocument();
    expect(within(categoryFilters).getByRole('button', { name: 'Achats 1' })).toBeInTheDocument();
    expect(within(categoryFilters).getByRole('button', { name: 'Ressources humaines 3' })).toBeInTheDocument();
    expect(screen.queryByText('Classe KROKDUR')).not.toBeInTheDocument();
    expect(screen.getByText('Aucune échéance future dans les 90 prochains jours.')).toBeInTheDocument();
    fireEvent.click(within(categoryFilters).getByRole('button', { name: 'Achats 1' }));
    expect(within(vesselFilters).getByRole('button', { name: 'Toute la flotte 2' })).toBeInTheDocument();
    expect(within(vesselFilters).getByRole('button', { name: 'GOURY 1' })).toBeInTheDocument();
    expect(screen.queryByText(/Document 42/)).not.toBeInTheDocument();
    fireEvent.click(within(vesselFilters).getByRole('button', { name: 'KROKDUR 1' }));
    expect(screen.getByText(/Achat 11/)).toBeInTheDocument();
    expect(screen.queryByText(/Achat 10/)).not.toBeInTheDocument();
    fireEvent.click(within(categoryFilters).getByRole('button', { name: 'Documents flotte 1' }));
    const calendar = screen.getByRole('complementary', { name: 'Calendrier des échéances' });
    fireEvent.click(within(calendar).getByRole('button', { name: /Classe KROKDUR/ }));
    expect(within(vesselFilters).getByRole('button', { name: 'KROKDUR 1' })).toBeInTheDocument();
    expect(within(categoryFilters).getByRole('button', { name: 'Achats 0' })).toBeInTheDocument();
    fireEvent.click(within(categoryFilters).getByRole('button', { name: 'Achats 0' }));
    expect(screen.getByText('Aucun élément ne correspond à cette date et à ce filtre.')).toBeInTheDocument();
  });

  it('clears the previous profile data while a new profile is loading', async () => {
    const { client } = clientFor();
    const dashboard = (role: 'admin' | 'marin') => <MemoryRouter><ManagerHomeDashboard client={client} firstName="Test" personId={43} roles={[role]} /></MemoryRouter>;
    const { rerender } = render(dashboard('admin'));
    await screen.findByText(/Achat 11/);
    fireEvent.click(screen.getByRole('button', { name: 'KROKDUR 4' }));
    rerender(dashboard('marin'));
    expect(screen.queryByText(/Achat 11/)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Flotte autorisée 4' })).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.queryByRole('button', { name: /KROKDUR/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Document 42/)).not.toBeInTheDocument();
  });
});
