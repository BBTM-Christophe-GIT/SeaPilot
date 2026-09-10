import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { LiftingPage } from './LiftingPage';
import { LiftingCertificates } from './LiftingCertificates';
import { LiftingDueBadge } from './LiftingLifecycle';
import { annualExpiry, liftingDeadline, todayLocal } from './liftingModel';
import { createLiftingPreviewClient, demoVessel } from './liftingPreview';
import { fetchLiftingRegister, replaceLiftingItem } from './liftingQueries';
import { addLiftingCertificate, downloadLiftingCertificate, fetchLiftingCertificates } from './liftingCertificateQueries';
import { ACCESSORIES } from './liftingControls';

describe('inventory lifecycle and equipment certificates', () => {
  it.each(['admin', 'direction', 'armement', 'capitaine', 'marin'] as const)('allows adding equipment for %s with the matching role fixture', async (role) => {
    const user = userEvent.setup(); const client = createLiftingPreviewClient({ roles: [role] });
    render(<MemoryRouter><LiftingPage client={client} roles={[role]} /></MemoryRouter>);
    await screen.findByText('ÉLINGUE TEXTILE RONDE — 3 M');
    const manager = ['admin', 'direction', 'armement'].includes(role);
    expect(Boolean(screen.queryByRole('button', { name: 'Nouveau contrôle annuel' }))).toBe(manager);
    expect(Boolean(screen.queryByRole('button', { name: 'Remplacer 1' }))).toBe(manager);
    await user.click(screen.getByRole('button', { name: 'Ajouter un matériel' }));
    await user.type(screen.getByLabelText('Description'), 'MATÉRIEL AJOUTÉ');
    await user.click(screen.getByRole('button', { name: 'Enregistrer le matériel' }));
    expect(await screen.findByText('MATÉRIEL AJOUTÉ')).toBeInTheDocument();
  });
  it('keeps creation available for an explicitly authorized captain', async () => {
    render(<MemoryRouter><LiftingPage client={createLiftingPreviewClient({ roles: ['capitaine'], inspectorGrant: true })} roles={['capitaine']} /></MemoryRouter>);
    await screen.findByText('ÉLINGUE TEXTILE RONDE — 3 M');
    expect(screen.getByRole('button', { name: 'Nouveau contrôle annuel' })).toBeEnabled();
  });
  it('uses date-only expiry boundaries, including today and exactly 60 days', () => {
    expect(liftingDeadline('2026-09-09', '2026-09-10')).toBe('expired');
    expect(liftingDeadline('2026-09-10', '2026-09-10')).toBe('soon');
    expect(liftingDeadline('2026-11-09', '2026-09-10')).toBe('soon');
    expect(liftingDeadline('2026-11-10', '2026-09-10')).toBe('');
    expect(liftingDeadline(null, '2026-09-10')).toBe('');
    expect(annualExpiry('2024-02-29')).toBe('2025-02-28');
    render(<LiftingDueBadge date="2026-09-09" today="2026-09-10" />);
    expect(screen.getByText('Échu le 09/09/2026')).toHaveClass('expired');
    expect(screen.getByText('Échu le 09/09/2026').querySelector('svg')).not.toBeNull();
  });
  it.each(['lifting', 'towing'] as const)('preserves %s identity, characteristics and certificates on replacement and rejects stale replacement', async (kind) => {
    const client = createLiftingPreviewClient(); const user = userEvent.setup();
    const original = (await fetchLiftingRegister(client, demoVessel.id, kind)).items[0];
    await addLiftingCertificate(client, original, new File(['%PDF-1.7 fixture'], 'Certificat origine.pdf', { type: 'application/pdf' }));
    render(<MemoryRouter><LiftingPage client={client} roles={['admin']} /></MemoryRouter>);
    await screen.findByText('ÉLINGUE TEXTILE RONDE — 3 M');
    if (kind === 'towing') { await user.click(screen.getByRole('button', { name: 'Remorques' })); await screen.findByText(original.description); }
    await user.click(screen.getByRole('button', { name: `Remplacer ${original.reference}` }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remplacer le matériel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const current = (await fetchLiftingRegister(client, demoVessel.id, kind)).items.find((item) => item.id === original.id)!;
    expect(current).toMatchObject({ reference: original.reference, description: original.description, serial_number: original.serial_number, notes: original.notes, swl_tonnes: original.swl_tonnes, service_version: 2, commissioned_on: todayLocal(), inspection_due_on: annualExpiry(todayLocal()), last_control_on: null });
    const certificates = await fetchLiftingCertificates(client, current.id);
    expect(certificates).toHaveLength(1);
    expect((await downloadLiftingCertificate(client, certificates[0])).size).toBe(16);
    await expect(replaceLiftingItem(client, original, todayLocal())).rejects.toMatchObject({ message: 'Accès refusé.' });
  });
  it('offers certificate upload for every accessory and downloads the attached file', async () => {
    const client = createLiftingPreviewClient({ roles: ['marin'] }); const user = userEvent.setup();
    const item = (await fetchLiftingRegister(client, demoVessel.id, 'lifting')).items[0];
    const view = render(<LiftingCertificates client={client} item={item} />);
    for (const accessory of ACCESSORIES) {
      view.rerender(<LiftingCertificates client={client} item={{ ...item, material_type: accessory.fr }} />);
      expect(screen.getByText('Certificat', { exact: true })).toBeInTheDocument();
    }
    await user.click(screen.getByText('Certificat', { exact: true }));
    const input = await screen.findByLabelText('Ajouter un certificat');
    await waitFor(() => expect(input).toBeEnabled());
    const pdf = new File(['%PDF-1.7 fixture'], 'Essai matériel.pdf', { type: 'application/pdf' });
    await user.upload(input, pdf);
    expect(await screen.findByText('Certificat ajouté.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Télécharger Essai matériel.pdf' })).toBeEnabled();
    const [certificate] = await fetchLiftingCertificates(client, item.id);
    expect(await downloadLiftingCertificate(client, certificate)).toBe(pdf);
  });
  it('rejects disallowed, empty and oversized files before uploading and reports storage failure', async () => {
    const client = createLiftingPreviewClient();
    const item = (await fetchLiftingRegister(client, demoVessel.id, 'lifting')).items[0];
    const storage = vi.spyOn(client.storage, 'from');
    for (const file of [new File(['x'], 'bad.exe', { type: 'application/octet-stream' }), new File([], 'empty.pdf', { type: 'application/pdf' }), { name: 'huge.pdf', type: 'application/pdf', size: 20971521 } as File]) {
      await expect(addLiftingCertificate(client, item, file)).rejects.toThrow('20 Mo');
    }
    expect(storage).not.toHaveBeenCalled();
    storage.mockReturnValue({ upload: async () => ({ error: { message: 'Connexion interrompue' } }) } as unknown as ReturnType<typeof client.storage.from>);
    await expect(addLiftingCertificate(client, item, new File(['%PDF'], 'test.pdf', { type: 'application/pdf' }))).rejects.toMatchObject({ message: 'Connexion interrompue' });
    expect(await fetchLiftingCertificates(client, item.id)).toHaveLength(0);
  });
});
