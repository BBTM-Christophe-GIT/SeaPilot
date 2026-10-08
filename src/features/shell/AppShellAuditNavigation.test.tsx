import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthProvider';
import { AppShell } from './AppShell';

describe('Audits navigation', () => {
  it('groups the five audit modules including OVID in a dedicated menu', async () => {
    const client = {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'audit-manager' } } }, error: null }),
        onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
        signOut: vi.fn(),
      },
      from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })) })) })),
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    render(<AuthProvider client={client as never}><MemoryRouter><Routes>
      <Route element={<AppShell client={client as never} rolesOverride={['admin']} previewMode />}>
        <Route index element={<div>Accueil</div>} />
      </Route>
    </Routes></MemoryRouter></AuthProvider>);
    const menu = await screen.findByRole('button', { name: 'Audits' });
    const section = within(menu.closest('section')!);
    expect(section.getByRole('link', { name: 'OVID' })).toHaveAttribute('href', '/modules/ovid');
    expect(section.getByRole('link', { name: 'eCMID' })).toHaveAttribute('href', '/modules/ecmid');
    expect(section.getByRole('link', { name: 'Audit ISM Externe' })).toHaveAttribute('href', '/modules/externalIsmAudits');
    expect(section.getByRole('link', { name: 'Audit ISM Interne' })).toHaveAttribute('href', '/modules/internalAudits');
    expect(section.getByRole('link', { name: 'Audit Client' })).toHaveAttribute('href', '/modules/clientAudits');
  });
});
