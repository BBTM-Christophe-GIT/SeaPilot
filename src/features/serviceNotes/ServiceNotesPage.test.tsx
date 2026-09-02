import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { previewSupabaseClient } from '../preview/previewSupabaseClient';
import type { AppShellOutletContext } from '../shell/AppShell';
import { ServiceNotesPage } from './ServiceNotesPage';

function renderPage() {
  const context: AppShellOutletContext = {
    roles: ['admin'], client: previewSupabaseClient, previewMode: true,
    currentPerson: { id: 9301, firstName: 'Arthur', lastName: 'DEMO', functionLabel: 'Capitaine', gradeLabel: 'Capitaine 500' },
  };
  render(<MemoryRouter initialEntries={['/modules/serviceNotes']}><Routes><Route element={<Outlet context={context} />}><Route path="modules/serviceNotes" element={<ServiceNotesPage />} /></Route></Routes></MemoryRouter>);
}

describe('ServiceNotesPage', () => {
  it('shows the QHSE library and one common signing document', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Notes de Service' })).toBeInTheDocument();
    expect(screen.getByText('Couverture signatures')).toBeInTheDocument();
    fireEvent.click(screen.getByText('NS 08-26'));
    expect(await screen.findByText('Registre de signatures')).toBeInTheDocument();
    expect(screen.getByText('Signer après lecture')).toBeInTheDocument();
    const signingButton = screen.getByRole('button', { name: 'Signer la note' });
    expect(signingButton).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(signingButton).toBeEnabled();
    expect(await screen.findByAltText('Signature de Camille DURAND')).toBeInTheDocument();
  });

  it('keeps drafts in a dedicated manager-only view', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Notes de Service' });
    fireEvent.click(screen.getByRole('button', { name: /Brouillons/ }));
    expect(await screen.findByText('NS 09-26')).toBeInTheDocument();
    expect(screen.queryByText('NS 08-26')).not.toBeInTheDocument();
  });
});
