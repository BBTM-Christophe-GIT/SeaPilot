import { deferred } from './workingTimeTestHelpers';
import type { SupabaseClient } from '@supabase/supabase-js';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { WorkingTimeHseKpiPanel } from './WorkingTimeHseKpiPanel';

it('ignores a KPI result when the user has changed the requested scope', async () => {
  const pending = deferred<{ data: Record<string, number>; error: null }>();
  const rpc = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue({ data: { exposure_hours: 456 }, error: null });
  const from = vi.fn((table: string) => {
    const data = table === 'hse_exposure_methodologies' ? [{ id: 1, name: 'Méthode', version_label: 'v1' }] : [];
    const query: unknown = new Proxy({}, { get: (_target, key) => key === 'then' ? (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve) : () => query });
    return query;
  });
  render(<WorkingTimeHseKpiPanel client={{ from, rpc } as unknown as SupabaseClient} range={{ start: '2026-08-01', end: '2026-08-31' }} roles={['admin']} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Calculer les KPI' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Calculer les KPI' }));
  fireEvent.change(screen.getByLabelText('Bordée'), { target: { value: 'Bordée 2' } });
  await act(async () => { pending.resolve({ data: { exposure_hours: 123 }, error: null }); await pending.promise; });
  expect(screen.queryByText('123 h')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Calculer les KPI' }));
  await waitFor(() => expect(rpc).toHaveBeenLastCalledWith('hse_kpi_summary', expect.objectContaining({ p_watch_group: 'Bordée 2' })));
  expect(await screen.findByText('456 h')).toBeInTheDocument();
});
