import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LsaPage } from './LsaPage';
import { createLsaPreviewClient } from './lsaPreview';
import * as queries from './lsaQueries';
import { todayLocal } from '../lifting/liftingModel';
import { demoFleetVessels } from '../lifting/liftingPreview';

const dateAt = (days: number) => {
  const date = new Date(`${todayLocal()}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const suroit = demoFleetVessels.find((vessel) => vessel.acronym === 'SUR')!;
const goury = demoFleetVessels.find((vessel) => vessel.name === 'GOURY')!;

describe('LSA vessel expiry badges', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps all-vessel counts independent from the selected vessel, category and search filters', async () => {
    const client = createLsaPreviewClient();
    const { items } = await queries.fetchLsaRegister(client, goury.id);
    const due = items.find((item) => item.document_title === 'EPIRB - 01')!;
    await queries.deleteLsaItem(client, due);
    const user = userEvent.setup();
    render(<MemoryRouter><LsaPage client={client} roles={['marin']} /></MemoryRouter>);
    await screen.findByText('4 / 4 matériels affichés');
    const selected = screen.getByRole('button', { name: suroit.name });
    const other = screen.getByRole('button', { name: goury.name });
    await within(selected).findByRole('img', { name: '1 matériel à échéance sous 30 jours' });
    expect(within(selected).getByRole('img', { name: '1 matériel périmé' })).toBeInTheDocument();
    expect(other).toHaveAttribute('aria-pressed', 'false');
    expect(within(other).queryByRole('img', { name: /échéance/ })).not.toBeInTheDocument();
    expect(within(other).getByRole('img', { name: '1 matériel périmé' })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Type d’équipement'), 'lsa-type-2');
    await user.type(screen.getByRole('textbox', { name: 'Rechercher un matériel' }), 'inexistant');
    expect(screen.getByText('Aucun matériel ne correspond aux filtres.')).toBeInTheDocument();
    expect(within(selected).getByRole('img', { name: '1 matériel à échéance sous 30 jours' })).toBeInTheDocument();
    expect(within(other).getByRole('img', { name: '1 matériel périmé' })).toBeInTheDocument();
    await user.click(other);
    await screen.findByText('3 / 3 matériels affichés');
    expect(other).toHaveAttribute('aria-pressed', 'true');
    expect(within(other).queryByRole('img', { name: /échéance/ })).not.toBeInTheDocument();
    expect(within(selected).getByRole('img', { name: '1 matériel à échéance sous 30 jours' })).toBeInTheDocument();
  });

  it('refreshes the whole fleet snapshot after a material expiry is updated', async () => {
    const client = createLsaPreviewClient();
    const user = userEvent.setup();
    render(<MemoryRouter><LsaPage client={client} roles={['capitaine']} /></MemoryRouter>);
    await screen.findByText('4 / 4 matériels affichés');
    const vessel = screen.getByRole('button', { name: suroit.name });
    await within(vessel).findByRole('img', { name: '1 matériel à échéance sous 30 jours' });
    await user.click(screen.getByRole('button', { name: 'Mettre à jour EPIRB - 01' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Mettre à jour l’échéance' }));
    fireEvent.change(dialog.getByLabelText('Date d’échéance'), { target: { value: dateAt(31) } });
    await user.click(dialog.getByRole('button', { name: 'Enregistrer' }));
    await screen.findByText('Échéance LSA mise à jour.');
    await waitFor(() => expect(within(vessel).queryByRole('img', { name: /échéance/ })).not.toBeInTheDocument());
    expect(within(vessel).getByRole('img', { name: '1 matériel périmé' })).toBeInTheDocument();
    expect(within(screen.getByRole('button', { name: goury.name })).getByRole('img', { name: '1 matériel à échéance sous 30 jours' })).toBeInTheDocument();
    const card = document.querySelector('.lifting-summary')!;
    expect(card).toHaveTextContent('3échéances à suivre');
  });

  it('reports a failed counter load without hiding the inventory and retries without a false zero', async () => {
    const client = createLsaPreviewClient();
    vi.spyOn(queries, 'fetchLsaVesselExpiryCounts').mockRejectedValueOnce(new Error('Compteurs LSA indisponibles'));
    const user = userEvent.setup();
    render(<MemoryRouter><LsaPage client={client} roles={['admin']} /></MemoryRouter>);
    await screen.findByText('4 / 4 matériels affichés');
    expect(await screen.findByRole('alert')).toHaveTextContent('Compteurs LSA indisponibles');
    const vessel = screen.getByRole('button', { name: suroit.name });
    expect(vessel).toHaveAccessibleDescription('Comptages indisponibles');
    expect(within(vessel).queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'EPIRB - 01' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Réessayer les compteurs' }));
    expect(await within(vessel).findByRole('img', { name: '1 matériel à échéance sous 30 jours' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });
});
