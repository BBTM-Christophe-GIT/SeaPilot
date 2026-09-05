import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { AppShellOutletContext } from '../shell/AppShell';
import { AnnualReviewsPage } from './AnnualReviewsPage';

function renderPage(context: AppShellOutletContext, recipient = false) {
  return render(
    <MemoryRouter initialEntries={[recipient ? '/annual-review/9901' : '/modules/annualReviews']}>
      <Routes>
        <Route element={<Outlet context={context} />}>
          <Route path="modules/annualReviews" element={<AnnualReviewsPage />} />
          <Route path="annual-review/:reviewId" element={<AnnualReviewsPage recipientRoute />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('AnnualReviewsPage', () => {
  it('lets an authorised manager open the invitation editor', async () => {
    const user = userEvent.setup();
    renderPage({
      roles: ['admin'], client: {} as never, previewMode: true,
      currentPerson: { id: 9301, firstName: 'Arthur', lastName: 'DEMO', functionLabel: 'Administrateur', gradeLabel: '' },
    });

    expect(await screen.findByRole('heading', { name: 'Entretien Professionnel et d’Evaluation' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Nouvel entretien' }));
    expect(screen.getByRole('heading', { name: 'Proposer un rendez-vous' })).toBeInTheDocument();
    expect(screen.getByLabelText('Collaborateur actif')).toBeInTheDocument();
    expect(screen.getByText('Lieu physique')).toBeInTheDocument();
    expect(screen.getByText('Visioconférence')).toBeInTheDocument();
  });

  it('gives the collaborator a permanent guide, personal exports and an explicit sharing choice', async () => {
    renderPage({
      roles: ['marin'], client: {} as never, previewMode: true,
      currentPerson: { id: 9303, firstName: 'Luc', lastName: 'MARTIN', functionLabel: 'Matelot polyvalent', gradeLabel: '' },
    }, true);

    expect(await screen.findByRole('heading', { name: 'Entretien Professionnel et d’Evaluation' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guide du collaborateur' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Télécharger mes réponses' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Imprimer' })).toBeInTheDocument();
    expect(screen.getByText('Partager avec le manager')).toBeInTheDocument();
    expect(screen.getByText('Garder mes réponses privées')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guide' })).toBeInTheDocument();
  });
});
