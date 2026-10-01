import { render, screen } from '@testing-library/react';
import { MemoryRouter, Outlet } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import App from './App';

vi.mock('./features/auth/RequireAuth', () => ({ RequireAuth: () => <Outlet /> }));
vi.mock('./features/shell/AppShell', () => ({ AppShell: () => <Outlet /> }));
vi.mock('./features/regulatoryLibrary/RegulatoryLibraryPage', () => ({ RegulatoryLibraryPage: ({ category }: { category?: string }) => <h1>Bibliothèque : {category || 'overview'}</h1> }));

describe('regulatory library application routes', () => {
  it.each([
    ['regulatoryLibrary', 'overview'],
    ['regulatorySafety', 'safety'],
    ['regulatoryTransport', 'transport'],
  ])('opens %s with the correct category', async (moduleKey, category) => {
    render(<MemoryRouter initialEntries={[`/modules/${moduleKey}`]}><App previewModeOverride={false} /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: `Bibliothèque : ${category}` })).toBeInTheDocument();
  });
});
