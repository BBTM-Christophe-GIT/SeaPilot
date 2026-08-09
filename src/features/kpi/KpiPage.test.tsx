import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { KpiPage } from './KpiPage';

function ordered(data: unknown[]) {
  const result = Promise.resolve({ data, error: null });
  const chain = { order: vi.fn() } as { order: ReturnType<typeof vi.fn> };
  chain.order.mockReturnValue(Object.assign(result, chain));
  return chain;
}

function createClient() {
  const rpc = vi.fn().mockImplementation((functionName: string) => Promise.resolve(functionName === 'refresh_hse_exposure_hours'
    ? { data: { actual_days: 24, planning_days: 0, methodology_id: 7 }, error: null }
    : { data: {
      methodology_version: '2026-08', configuration_complete: true, exposure_hours: 13133,
      FAT: 0, LWDC: 1, LTI: 1, RWC: 0, MTC: 1, FAC: 3, near_miss: 4, safety_observation: 12, lost_days: 7,
      LTIFR: 76.14, TRIR: 152.29, FAR: 0, FAC_rate: 228.43, MTC_rate: 76.14, RWC_rate: 0,
      SOFR: 182.75, french_frequency_rate: 76.14, french_severity_rate: 0.53,
    }, error: null }));
  const client = {
    rpc,
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'action_items') return { select: vi.fn().mockReturnValue(ordered([])) };
      if (table === 'action_documents') return { select: vi.fn().mockReturnValue(ordered([])) };
      if (table === 'action_type_catalog') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue(ordered([])) }) };
      if (table === 'vessels') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue(ordered([])) }) };
      if (table === 'hse_exposure_methodologies') {
        return { select: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [{ id: 7 }], error: null }) }) }) };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };
  return { client, rpc };
}

describe('KpiPage', () => {
  it('shows the HSE dashboard in QHSE KPI and loads another year', async () => {
    const user = userEvent.setup();
    const { client, rpc } = createClient();
    render(<MemoryRouter><KpiPage client={client as never} /></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'Indicateurs HSE' })).toBeInTheDocument();
    expect(screen.getByText('QHSE · KPI')).toBeInTheDocument();
    expect(screen.getByLabelText('Heures travaillées')).toHaveTextContent('13 133 h');
    expect(screen.getByText('Taux de fréquence et taux de gravité')).toBeInTheDocument();
    expect(screen.getByText('Accidents enregistrables')).toBeInTheDocument();
    expect(screen.getByText('Prévention, soins et travail adapté')).toBeInTheDocument();
    expect(screen.getByText('Premiers soins').closest('article')).toHaveTextContent('3');

    await user.selectOptions(screen.getByLabelText('Année des indicateurs HSE'), '2024');
    expect(await screen.findByText(/l’année 2024/)).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith('hse_kpi_summary', expect.objectContaining({
      p_starts_on: '2024-01-01',
      p_ends_on: '2024-12-31',
    }));

    await user.click(screen.getByRole('button', { name: 'Définitions et formules' }));
    const definitions = within(screen.getByRole('dialog', { name: 'Définitions et formules' }));
    expect(definitions.getByText('FAC')).toBeInTheDocument();
    expect(definitions.getByText(/FAT \+ LWDC \+ RWC \+ MTC/)).toBeInTheDocument();
  });
});
