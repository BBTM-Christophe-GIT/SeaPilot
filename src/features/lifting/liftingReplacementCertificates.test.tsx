import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LiftingCertificates } from './LiftingCertificates';
import { LiftingReplaceForm } from './LiftingLifecycle';
import { addLiftingCertificate, fetchLiftingCertificates } from './liftingCertificateQueries';
import { createLiftingPreviewClient, demoVessel } from './liftingPreview';
import { fetchLiftingRegister, replaceLiftingItem } from './liftingQueries';
import { todayLocal } from './liftingModel';

const pdf = (name: string) => new File(['%PDF fixture'], name, { type: 'application/pdf' });

describe('certificates when replacing equipment', () => {
  it('archives previous files, shows only replacement files as current and rejects a stale upload', async () => {
    const client = createLiftingPreviewClient(); const user = userEvent.setup();
    const original = (await fetchLiftingRegister(client, demoVessel.id, 'lifting')).items[0];
    await addLiftingCertificate(client, original, pdf('Ancien certificat.pdf'));
    await expect(replaceLiftingItem(client, original, todayLocal())).rejects.toMatchObject({ message: expect.stringContaining('nouveau certificat') });
    await replaceLiftingItem(client, original, todayLocal(), [pdf('Nouveau certificat.pdf')]);
    const current = (await fetchLiftingRegister(client, demoVessel.id, 'lifting')).items[0];
    await expect(addLiftingCertificate(client, original, pdf('Envoi périmé.pdf'))).rejects.toMatchObject({ message: 'Accès refusé.' });
    render(<LiftingCertificates client={client} item={current} />);
    await user.click(screen.getByText('Certificat', { exact: true }));
    const currentFiles = within(await screen.findByRole('group', { name: 'Certificats du matériel actuel' }));
    expect(currentFiles.getByText('Nouveau certificat.pdf')).toBeInTheDocument();
    expect(currentFiles.queryByText('Ancien certificat.pdf')).not.toBeInTheDocument();
    await user.click(screen.getByText('Certificats des matériels remplacés (1)'));
    expect(screen.getByRole('button', { name: 'Télécharger Ancien certificat.pdf' })).toBeEnabled();
    expect(await fetchLiftingCertificates(client, current.id)).toHaveLength(2);
  });
  it('keeps the item and current files unchanged if an upload fails before replacement', async () => {
    const client = createLiftingPreviewClient(); const original = (await fetchLiftingRegister(client, demoVessel.id, 'lifting')).items[0];
    await addLiftingCertificate(client, original, pdf('Origine.pdf'));
    const before = await fetchLiftingCertificates(client, original.id); const rpc = vi.spyOn(client, 'rpc');
    vi.spyOn(client.storage, 'from').mockReturnValue({ upload: async () => ({ error: { message: 'Transfert interrompu' } }) } as unknown as ReturnType<typeof client.storage.from>);
    await expect(replaceLiftingItem(client, original, todayLocal(), [pdf('Nouveau.pdf')])).rejects.toMatchObject({ message: 'Transfert interrompu' });
    expect(rpc).not.toHaveBeenCalled();
    expect((await fetchLiftingRegister(client, demoVessel.id, 'lifting')).items[0]).toEqual(original);
    expect(await fetchLiftingCertificates(client, original.id)).toEqual(before);
  });
  it('allows replacement without attachments when none existed and lets the user remove a selected file', async () => {
    const client = createLiftingPreviewClient(); const user = userEvent.setup(); const save = vi.fn();
    const item = (await fetchLiftingRegister(client, demoVessel.id, 'lifting')).items[0];
    render(<LiftingReplaceForm client={client} item={item} busy={false} error="" onClose={vi.fn()} onSave={save} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remplacer le matériel' })).toBeEnabled());
    await user.upload(screen.getByLabelText('Nouveaux certificats'), pdf('Erreur de fichier.pdf'));
    await user.click(screen.getByRole('button', { name: 'Retirer Erreur de fichier.pdf' }));
    await user.click(screen.getByRole('button', { name: 'Remplacer le matériel' }));
    expect(save).toHaveBeenCalledWith(todayLocal(), []);
  });
});
