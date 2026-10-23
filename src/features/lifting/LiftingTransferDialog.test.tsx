import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LiftingItem, LiftingVessel } from './liftingModel';
import { LiftingTransferDialog } from './LiftingTransferDialog';

const vessel = (id: number, name: string, extra: Partial<LiftingVessel> = {}): LiftingVessel => ({ id, company_id: 1, name, acronym: `V${id}`, registration_number: '', registration_port: '', call_sign: '', active: true, asset_kind: 'vessel', ...extra });
const source = vessel(1, 'Yard LE HAVRE', { asset_kind: 'quay' });
const goury = vessel(2, 'GOURY', { illustration_thumbnail_url: '/fixtures/goury.png' });
const roz = vessel(3, 'LE ROZEL');
const item: LiftingItem = { id: 101, company_id: 1, vessel_id: 1, kind: 'lifting', reference: 'LEV-101', material_type: 'Manilles', description: 'Manille identifiée', swl_tonnes: 6.5, serial_number: 'SN-101', location: 'Pont', notes: '', active: true, source_label: '', updated_at: '2026-10-23T08:00:00Z' };
const renderDialog = (props: Partial<Parameters<typeof LiftingTransferDialog>[0]> = {}) => render(<LiftingTransferDialog item={item} vessels={[source, goury, roz]} busy={false} onClose={vi.fn()} onTransfer={vi.fn().mockResolvedValue(undefined)} {...props} />);

describe('LiftingTransferDialog', () => {
  it('reuses the vessel illustrations in length order and excludes the source, inactive, foreign and non-vessel assets', () => {
    const values = Object.freeze([roz, source, vessel(4, 'Long navire', { length_overall: '45' }), vessel(5, 'Navire autre société', { company_id: 2 }), vessel(6, 'Navire inactif', { active: false }), vessel(7, 'Autre Yard', { asset_kind: 'quay' }), vessel(8, 'Bureau', { asset_kind: 'office' }), goury]);
    const { container } = renderDialog({ vessels: values });
    expect(screen.getByRole('dialog', { name: 'Transférer le matériel LEV-101' })).toBeVisible();
    const choices = within(screen.getByRole('group', { name: 'Filtrer par navire' })).getAllByRole('button');
    expect(choices.map((choice) => choice.getAttribute('aria-label'))).toEqual(['Long navire', 'GOURY', 'LE ROZEL']);
    expect(choices.every((choice) => choice.getAttribute('aria-pressed') === 'false')).toBe(true);
    expect(container.querySelector('img[src="/fixtures/goury.png"]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Voir les navires précédents' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Voir les navires suivants' })).not.toBeInTheDocument();
    expect(screen.getByText('3 unités')).toBeVisible();
    expect(screen.getByText('Navire ou site de départ : Yard LE HAVRE')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Transférer' })).toBeDisabled();
  });

  it('requires an explicit destination and submits its ID without changing the item or source selection', async () => {
    const transfer = vi.fn().mockResolvedValue(undefined);
    const initial = structuredClone(item);
    renderDialog({ onTransfer: transfer });
    fireEvent.click(screen.getByRole('button', { name: 'LE ROZEL' }));
    expect(screen.getByRole('button', { name: 'LE ROZEL' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Destination : LE ROZEL');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Transférer' })); });
    expect(transfer).toHaveBeenCalledExactlyOnceWith(3);
    expect(item).toEqual(initial);
  });

  it('guards double activation and blocks changing or closing the modal while a transfer is pending', async () => {
    let finish!: () => void;
    const transfer = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; })), close = vi.fn();
    renderDialog({ onTransfer: transfer, onClose: close });
    fireEvent.click(screen.getByRole('button', { name: 'GOURY' }));
    const confirm = screen.getByRole('button', { name: 'Transférer' });
    fireEvent.click(confirm); fireEvent.click(confirm);
    expect(transfer).toHaveBeenCalledOnce();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Fermer' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'LE ROZEL' })).toBeDisabled();
    expect(screen.getAllByRole('button').every((button) => button.matches(':disabled'))).toBe(true);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(close).not.toHaveBeenCalled();
    await act(async () => { finish(); });
    expect(confirm).toBeEnabled();
  });

  it('keeps the chosen destination and allows retry or cancellation after a rejected transfer', async () => {
    const transfer = vi.fn().mockRejectedValue(new Error('Cette référence existe déjà sur le navire destinataire.'));
    renderDialog({ onTransfer: transfer });
    fireEvent.click(screen.getByRole('button', { name: 'GOURY' }));
    fireEvent.click(screen.getByRole('button', { name: 'Transférer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Cette référence existe déjà');
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(screen.getByRole('button', { name: 'GOURY' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Transférer' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeEnabled();
  });

  it('cancels without invoking the transfer callback', () => {
    const close = vi.fn(), transfer = vi.fn().mockResolvedValue(undefined);
    renderDialog({ onClose: close, onTransfer: transfer });
    fireEvent.click(screen.getByRole('button', { name: 'GOURY' }));
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(close).toHaveBeenCalledOnce(); expect(transfer).not.toHaveBeenCalled();
  });

  it('has no automatic or stale confirmation when the destinations or source item change', () => {
    const transfer = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderDialog({ onTransfer: transfer });
    fireEvent.click(screen.getByRole('button', { name: 'GOURY' }));
    rerender(<LiftingTransferDialog item={{ ...item, updated_at: '2026-10-23T09:00:00Z' }} vessels={[source, goury, roz]} busy={false} onClose={vi.fn()} onTransfer={transfer} />);
    expect(screen.getByRole('button', { name: 'Transférer' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'GOURY' }));
    rerender(<LiftingTransferDialog item={item} vessels={[source, roz]} busy={false} onClose={vi.fn()} onTransfer={transfer} />);
    expect(screen.getByRole('button', { name: 'Transférer' })).toBeDisabled();
    expect(transfer).not.toHaveBeenCalled();
  });

  it('explains when no valid destination is available and prevents retired equipment confirmation', () => {
    const { rerender } = renderDialog({ vessels: [source, vessel(4, 'Étranger', { company_id: 2 })] });
    expect(screen.getByText('Aucun autre navire autorisé n’est disponible pour ce transfert.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Transférer' })).toBeDisabled();
    rerender(<LiftingTransferDialog item={{ ...item, active: false }} vessels={[source, goury]} busy={false} onClose={vi.fn()} onTransfer={vi.fn().mockResolvedValue(undefined)} />);
    fireEvent.click(screen.getByRole('button', { name: 'GOURY' }));
    expect(screen.getByRole('button', { name: 'Transférer' })).toBeDisabled();
  });

  it('ignores an old rejected callback after the dialog has moved to a different item context', async () => {
    let reject!: (reason: Error) => void;
    const transfer = vi.fn(() => new Promise<void>((_, fail) => { reject = fail; }));
    const { rerender } = renderDialog({ onTransfer: transfer });
    fireEvent.click(screen.getByRole('button', { name: 'GOURY' }));
    fireEvent.click(screen.getByRole('button', { name: 'Transférer' }));
    rerender(<LiftingTransferDialog item={{ ...item, id: 202, reference: 'AUTRE-202' }} vessels={[source, goury, roz]} busy={false} onClose={vi.fn()} onTransfer={transfer} />);
    await act(async () => { reject(new Error('Ancienne requête')); });
    expect(screen.getByRole('dialog', { name: 'Transférer le matériel AUTRE-202' })).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Transférer' })).toBeDisabled();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Annuler' })).toBeEnabled());
  });
});
