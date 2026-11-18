import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { OrgWatchTransferBoard } from './OrgWatchTransferBoard';
import { ORG_DEMO } from './organigrammeFixtures';
import { orgLocalDate } from './organigrammeModel';

function setup(asOf = orgLocalDate()) {
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
  const saved = vi.fn();
  const data = { ...ORG_DEMO, chartId: 87, asOf, vessels: [...ORG_DEMO.vessels, { id: 9, name: 'NOUVEAU NAVIRE', lengthOverall: 14 }] };
  const client = { rpc } as unknown as SupabaseClient;
  render(<OrgWatchTransferBoard client={client} data={data} onSaved={saved} disabled={false} />);
  const member = screen.getByRole('button', { name: 'Déplacer Élodie MARTIN' });
  return { rpc, saved, member };
}

describe('OrgWatchTransferBoard', () => {
  it('moves a member from one vessel to a specific watch in the selected chart', async () => {
    const { member, rpc, saved } = setup();
    const source = screen.getByRole('region', { name: 'GOURY · Bordée 1' });
    const target = screen.getByRole('region', { name: 'LE ROZEL · Bordée 2' });
    const dataTransfer = { setData: vi.fn(), effectAllowed: '', dropEffect: '' };

    fireEvent.dragStart(member, { dataTransfer });
    fireEvent.dragOver(target, { dataTransfer });
    expect(target).toHaveAttribute('data-drop-active', 'true');
    fireEvent.drop(source, { dataTransfer });
    expect(rpc).not.toHaveBeenCalled();
    fireEvent.drop(target, { dataTransfer });

    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
    expect(rpc).toHaveBeenCalledExactlyOnceWith('move_organigramme_watch_member', {
      p_chart_id: 87, p_person_id: 2, p_from_watch_id: 1, p_to_vessel_id: 2, p_to_watch_id: 4,
    });
    expect(screen.getByRole('status')).toHaveTextContent('Élodie MARTIN rejoint LE ROZEL · Bordée 2.');
  });

  it('uses the same transfer action through the destination selector and supports a vessel without watches', async () => {
    const { member, rpc, saved } = setup();
    const source = within(screen.getByRole('region', { name: 'GOURY · Bordée 1' }));

    fireEvent.click(member);
    const destination = source.getByRole('combobox', { name: 'Bordée de destination' });
    expect(within(destination).queryByRole('option', { name: 'GOURY · Bordée 1' })).not.toBeInTheDocument();
    fireEvent.change(destination, { target: { value: 'vessel:9' } });
    fireEvent.click(source.getByRole('button', { name: 'Déplacer' }));

    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
    expect(rpc).toHaveBeenCalledExactlyOnceWith('move_organigramme_watch_member', {
      p_chart_id: 87, p_person_id: 2, p_from_watch_id: 1, p_to_vessel_id: 9, p_to_watch_id: null,
    });
  });

  it('keeps a historical chart read-only', () => {
    const { member, rpc } = setup('2000-01-01');
    expect(member).toBeDisabled();
    expect(member).toHaveAttribute('draggable', 'false');
    expect(rpc).not.toHaveBeenCalled();
  });
});
