import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ServiceProvidersPage } from './ServiceProvidersPage';
import { groupServiceProviders, type ServiceProvider } from './serviceProviders';

const providerRows = [{
  id: 1,
  company_id: 1,
  name: 'SERVAUX',
  category: 'Prestataire de Service',
  service_type: 'Radeaux · Équipements incendie',
  activity: 'Maintenance des équipements de sécurité maritime',
  address: '5 Quai de Guinée',
  city: 'Le Havre',
  phone: '02 32 74 95 80',
  legal_form: 'SAS',
  accounting_email: null,
  company_email: 'contact@servaux.com',
  supplies: 'Radeaux de sauvetage',
  evaluation: '5',
  active: true,
  source_modified_at: '2026-08-20T10:00:00Z',
  merged_into_provider_id: null,
  specialties: [{ id: 10, name: 'Visite Radeaux', active: true }],
  contacts: [{ id: 20, full_name: 'Yann DUVAL', role_label: 'Radeaux', email: 'yann@servaux.example', phone: '02 32 74 95 80', active: true }],
}, {
  id: 2,
  company_id: 1,
  name: 'Würth',
  category: 'Approvisionnement',
  service_type: 'Matériel et fournitures',
  activity: 'Fournitures industrielles',
  address: '',
  city: 'Erstein',
  phone: '',
  legal_form: '',
  accounting_email: '',
  company_email: '',
  supplies: 'Outillage',
  evaluation: '',
  active: true,
  source_modified_at: null,
  merged_into_provider_id: null,
  specialties: [],
  contacts: [],
}];

function createClient() {
  const from = vi.fn(() => {
    const result = { data: providerRows, error: null };
    const promise = Promise.resolve(result);
    const query: Record<string, unknown> = {
      then: promise.then.bind(promise),
      catch: promise.catch.bind(promise),
    };
    query.select = vi.fn(() => query);
    query.is = vi.fn(() => query);
    query.order = vi.fn(() => query);
    return query;
  });
  return { from };
}

describe('ServiceProvidersPage', () => {
  it('groups companies by category and displays the selected company details', async () => {
    const user = userEvent.setup();
    const client = createClient();
    render(<ServiceProvidersPage client={client as never} roles={['direction']} />);

    expect(await screen.findByRole('heading', { name: 'Gestion des Sous-Traitants' })).toBeInTheDocument();
    expect(screen.getAllByText('Approvisionnement').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Prestataire de Service').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Ajouter une société' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /SERVAUX/ }));
    const profile = screen.getByRole('heading', { name: 'SERVAUX' }).closest('article');
    expect(profile).not.toBeNull();
    expect(within(profile as HTMLElement).getByText('5 Quai de Guinée, Le Havre')).toBeInTheDocument();
    expect(within(profile as HTMLElement).getByText('Visite Radeaux')).toBeInTheDocument();
    expect(within(profile as HTMLElement).getByText('Yann DUVAL')).toBeInTheDocument();
  });

  it('filters the directory by company, service or city', async () => {
    const user = userEvent.setup();
    render(<ServiceProvidersPage client={createClient() as never} roles={['admin']} />);
    await screen.findByRole('heading', { name: 'Gestion des Sous-Traitants' });

    await user.type(screen.getByLabelText('Rechercher une société'), 'radeaux');
    expect(screen.getByRole('button', { name: /SERVAUX/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Würth/ })).not.toBeInTheDocument();
  });
});

describe('groupServiceProviders', () => {
  it('sorts categories and companies in French alphabetical order', () => {
    const providers = providerRows.map((row) => ({
      id: row.id,
      companyId: 1,
      name: row.name,
      category: row.category,
      serviceType: row.service_type,
      activity: row.activity,
      address: row.address,
      city: row.city,
      phone: row.phone,
      legalForm: row.legal_form,
      accountingEmail: row.accounting_email || '',
      companyEmail: row.company_email,
      supplies: row.supplies,
      evaluation: row.evaluation,
      active: row.active,
      sourceModifiedAt: row.source_modified_at || '',
      specialties: [],
      contacts: [],
    })) as ServiceProvider[];
    expect(groupServiceProviders(providers).map((group) => group.category)).toEqual([
      'Approvisionnement',
      'Prestataire de Service',
    ]);
  });
});
