import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { LiftingPage } from './LiftingPage';
import { LIFTING_SECTIONS } from './liftingSections';
import { createLiftingPreviewClient, secondDemoVessel } from './liftingPreview';
import { fetchLiftingRegister } from './liftingQueries';

function LiftingTestShell({ client }: { client: SupabaseClient }) {
  const [liftingVesselId, setLiftingVesselId] = useState(0);
  return <><Link to="/modules/lifting/remorques">Ouvrir les remorques</Link><Outlet context={{ roles: ['admin'], client, previewMode: false, liftingVesselId, setLiftingVesselId }} /></>;
}

describe('Lifting section routes', () => {
  it('keeps the chosen vessel and opens the towing register after saving a towing item from the lifting form', async () => {
    const client = createLiftingPreviewClient();
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/modules/lifting/apparaux']}><Routes>
      <Route element={<LiftingTestShell client={client} />}>
        {LIFTING_SECTIONS.map((section) => <Route key={section.key} path={`/modules/lifting/${section.path}`} element={<LiftingPage section={section.key} />} />)}
      </Route>
    </Routes></MemoryRouter>);
    await user.click(await screen.findByRole('button', { name: secondDemoVessel.name }));
    await screen.findByText('MANILLE DU SECOND NAVIRE');
    await user.click(screen.getByRole('button', { name: 'Ajouter un matériel' }));
    const dialog = within(screen.getByRole('dialog'));
    await user.selectOptions(dialog.getByLabelText('Type d’accessoire'), 'Remorque');
    await user.type(dialog.getByLabelText('Description'), 'Remorque du second navire');
    await user.click(dialog.getByRole('button', { name: 'Enregistrer le matériel' }));
    expect(await screen.findByRole('heading', { name: 'Registre des Remorques' })).toBeInTheDocument();
    expect(await screen.findByText('Remorque du second navire')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: secondDemoVessel.name })).toHaveAttribute('aria-pressed', 'true');
    expect((await fetchLiftingRegister(client, secondDemoVessel.id, 'towing')).items).toHaveLength(1);
    expect((await fetchLiftingRegister(client, secondDemoVessel.id, 'lifting')).items.map((item) => item.description)).toEqual(['MANILLE DU SECOND NAVIRE']);
  });
});
