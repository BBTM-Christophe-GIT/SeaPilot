import { afterEach, describe, expect, it, vi } from 'vitest';
import { openFleetFindingAttachment, type FleetFindingAttachment } from './fleetCertificateFindings';

const attachment = { storageBucket: 'fleet-certificates', storagePath: '1/finding/proof.pdf' } as FleetFindingAttachment;
afterEach(() => vi.restoreAllMocks());
describe('mobile fleet finding documents', () => {
  it('creates the tab before waiting for a fresh authorized URL', async () => {
    let resolve!: (value: unknown) => void;
    const signed = vi.fn(() => new Promise(done => { resolve = done; }));
    const popup = { opener: {}, location: { replace: vi.fn() }, close: vi.fn() };
    const open = vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    const client = { storage: { from: () => ({ createSignedUrl: signed }) } };
    const pending = openFleetFindingAttachment(client as never, attachment);
    expect(open).toHaveBeenCalledWith('', '_blank');
    expect(popup.opener).toBeNull();
    expect(popup.location.replace).not.toHaveBeenCalled();
    resolve({ data: { signedUrl: 'https://private.example/current' }, error: null });
    await pending;
    expect(popup.location.replace).toHaveBeenCalledWith('https://private.example/current');
    expect(signed).toHaveBeenCalledWith(attachment.storagePath, 300);
  });

  it('closes the empty tab on a read refusal', async () => {
    const popup = { opener: {}, location: { replace: vi.fn() }, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    const client = { storage: { from: () => ({ createSignedUrl: vi.fn().mockResolvedValue({ data: null, error: new Error('Document inaccessible') }) }) } };
    await expect(openFleetFindingAttachment(client as never, attachment)).rejects.toThrow('Document inaccessible');
    expect(popup.close).toHaveBeenCalledOnce();
    expect(popup.location.replace).not.toHaveBeenCalled();
  });

  it('reports a blocked popup before requesting a URL', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    const from = vi.fn();
    await expect(openFleetFindingAttachment({ storage: { from } } as never, attachment)).rejects.toThrow('fenêtres contextuelles');
    expect(from).not.toHaveBeenCalled();
  });
});
