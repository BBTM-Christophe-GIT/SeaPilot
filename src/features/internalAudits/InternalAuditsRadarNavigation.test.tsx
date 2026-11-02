import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { InternalAuditsPage } from './InternalAuditsPage';
import { createInternalAuditPreviewData } from './internalAuditPreview';
import type { AppShellOutletContext } from '../shell/AppShell';

const fixture = createInternalAuditPreviewData();

function renderPage(query: string) {
  const context: AppShellOutletContext = { roles: ['admin'], client: {} as never, previewMode: true,
    currentPerson: { id: 9301, firstName: 'Arthur', lastName: 'DEMO', functionLabel: 'Armement', gradeLabel: '', active: true, hiredOn: '2020-01-01', departedOn: '' } };
  return render(<MemoryRouter initialEntries={[`/modules/internalAudits${query}`]}><Routes><Route element={<Outlet context={context} />}><Route path="modules/internalAudits" element={<InternalAuditsPage />} /></Route></Routes></MemoryRouter>);
}

describe('ISM audit radar destinations (admin preview)', () => {
  it('focuses the requested site planning row and allows returning to all sites', async () => {
    renderPage(`?site=${fixture.sites[2].id}&tab=planning`);
    expect(await screen.findByText('Priorité sélectionnée : GOURY')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Planifier GOURY' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Planifier LE ROZEL' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Afficher tous les sites' }));
    expect(await screen.findByRole('button', { name: 'Planifier LE ROZEL' })).toBeVisible();
  });

  it('selects a requested historical audit and opens the requested findings tab', async () => {
    renderPage(`?audit=${fixture.audits[1].id}&tab=findings`);
    expect(await screen.findByRole('button', { name: /^Synthèse/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('combobox', { name: 'Audit sélectionné' })).toHaveValue(fixture.audits[1].id);
    expect(await screen.findByText('Aucun écart pour cet audit et ce filtre')).toBeVisible();
    expect(screen.queryByText(fixture.findings[0].description)).not.toBeInTheDocument();
  });

  it('opens the audit that owns an actionable finding', async () => {
    renderPage(`?audit=${fixture.audits[0].id}&tab=findings`);
    expect(await screen.findByText(fixture.findings[0].description)).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Audit sélectionné' })).toHaveValue(fixture.audits[0].id);
    expect(screen.getByRole('button', { name: 'Suivre le traitement' })).toBeVisible();
  });

  it('preserves the requested campaign year when the site has older audits', async () => {
    renderPage(`?site=${fixture.sites[3].id}&tab=planning&year=2028`);
    expect(await screen.findByRole('combobox', { name: 'Année du planning' })).toHaveValue('2028');
    expect(screen.getByText('Aucun audit 2028')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Planifier LE ROZEL' })).toBeVisible();
  });

  it('ignores an invalid tab and keeps an unavailable site explicitly out of the planning list', async () => {
    renderPage('?site=unknown&tab=unknown');
    expect(await screen.findByRole('heading', { name: 'Planning annuel d’audit' })).toBeVisible();
    const nav = screen.getByRole('navigation', { name: 'Onglets des audits internes' });
    expect(within(nav).getByRole('button', { name: 'Planning' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Le site demandé n’est pas disponible dans votre accès.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Planifier GOURY' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Afficher tous les sites' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Planifier GOURY' })).toBeVisible());
  });

  it('preserves the existing access block for an unavailable requested audit', async () => {
    renderPage('?audit=unavailable&tab=findings');
    expect(await screen.findByRole('alert')).toHaveTextContent('Cet audit n’est pas disponible dans votre accès.');
    expect(screen.queryByRole('combobox', { name: 'Audit sélectionné' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retour au planning des audits' })).toBeVisible();
  });
});
