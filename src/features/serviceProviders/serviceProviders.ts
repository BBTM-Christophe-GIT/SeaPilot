import type { SupabaseClient } from '@supabase/supabase-js';

export interface ServiceProviderSpecialty {
  id: number;
  name: string;
  active: boolean;
}

export interface ServiceProviderContact {
  id: number;
  fullName: string;
  roleLabel: string;
  email: string;
  phone: string;
  active: boolean;
}

export interface ServiceProvider {
  id: number;
  companyId: number;
  name: string;
  category: string;
  serviceType: string;
  activity: string;
  address: string;
  city: string;
  phone: string;
  legalForm: string;
  accountingEmail: string;
  companyEmail: string;
  supplies: string;
  evaluation: string;
  active: boolean;
  sourceModifiedAt: string;
  specialties: ServiceProviderSpecialty[];
  contacts: ServiceProviderContact[];
}

export interface ServiceProviderDraft {
  name: string;
  category: string;
  serviceType: string;
  activity: string;
  address: string;
  city: string;
  phone: string;
  legalForm: string;
  accountingEmail: string;
  companyEmail: string;
  supplies: string;
  evaluation: string;
  active: boolean;
}

export interface ServiceProviderContactDraft {
  fullName: string;
  roleLabel: string;
  email: string;
  phone: string;
  active: boolean;
}

const PROVIDER_SELECT = `
  id, company_id, name, category, service_type, activity, address, city, phone,
  legal_form, accounting_email, company_email, supplies, evaluation, active,
  source_modified_at, merged_into_provider_id,
  specialties:service_provider_specialties(id, name, active),
  contacts:service_provider_contacts(id, full_name, role_label, email, phone, active)
`;

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function number(value: unknown): number {
  return typeof value === 'number' ? value : Number(value || 0);
}

function mapProvider(row: Record<string, unknown>): ServiceProvider {
  const specialtyRows = Array.isArray(row.specialties) ? row.specialties as Array<Record<string, unknown>> : [];
  const contactRows = Array.isArray(row.contacts) ? row.contacts as Array<Record<string, unknown>> : [];

  return {
    id: number(row.id),
    companyId: number(row.company_id),
    name: text(row.name),
    category: text(row.category) || 'Non classé',
    serviceType: text(row.service_type),
    activity: text(row.activity),
    address: text(row.address),
    city: text(row.city),
    phone: text(row.phone),
    legalForm: text(row.legal_form),
    accountingEmail: text(row.accounting_email),
    companyEmail: text(row.company_email),
    supplies: text(row.supplies),
    evaluation: text(row.evaluation),
    active: row.active !== false,
    sourceModifiedAt: text(row.source_modified_at),
    specialties: specialtyRows
      .map((specialty) => ({
        id: number(specialty.id),
        name: text(specialty.name),
        active: specialty.active !== false,
      }))
      .sort((left, right) => left.name.localeCompare(right.name, 'fr')),
    contacts: contactRows
      .map((contact) => ({
        id: number(contact.id),
        fullName: text(contact.full_name),
        roleLabel: text(contact.role_label),
        email: text(contact.email),
        phone: text(contact.phone),
        active: contact.active !== false,
      }))
      .sort((left, right) => left.fullName.localeCompare(right.fullName, 'fr')),
  };
}

export function compareServiceProviders(left: ServiceProvider, right: ServiceProvider): number {
  return left.category.localeCompare(right.category, 'fr', { sensitivity: 'base' })
    || left.name.localeCompare(right.name, 'fr', { sensitivity: 'base' });
}

export function groupServiceProviders(providers: ServiceProvider[]): Array<{
  category: string;
  providers: ServiceProvider[];
}> {
  const groups = new Map<string, ServiceProvider[]>();
  [...providers].sort(compareServiceProviders).forEach((provider) => {
    const category = provider.category.trim() || 'Non classé';
    groups.set(category, [...(groups.get(category) || []), provider]);
  });
  return Array.from(groups, ([category, groupedProviders]) => ({ category, providers: groupedProviders }));
}

export async function fetchServiceProviders(client: SupabaseClient): Promise<ServiceProvider[]> {
  const { data, error } = await client
    .from('service_providers')
    .select(PROVIDER_SELECT)
    .is('merged_into_provider_id', null)
    .order('category')
    .order('name');
  if (error) throw new Error(`Impossible de charger les sociétés. ${error.message || ''}`.trim());
  return ((data || []) as unknown as Array<Record<string, unknown>>).map(mapProvider).sort(compareServiceProviders);
}

export async function saveServiceProvider(
  client: SupabaseClient,
  draft: ServiceProviderDraft,
  providerId?: number,
): Promise<ServiceProvider> {
  const payload = {
    name: draft.name.trim(),
    category: draft.category.trim() || null,
    service_type: draft.serviceType.trim() || null,
    activity: draft.activity.trim() || null,
    address: draft.address.trim() || null,
    city: draft.city.trim() || null,
    phone: draft.phone.trim() || null,
    legal_form: draft.legalForm.trim() || null,
    accounting_email: draft.accountingEmail.trim() || null,
    company_email: draft.companyEmail.trim() || null,
    supplies: draft.supplies.trim() || null,
    evaluation: draft.evaluation.trim() || null,
    active: draft.active,
    updated_at: new Date().toISOString(),
  };
  const query = providerId
    ? client.from('service_providers').update(payload).eq('id', providerId)
    : client.from('service_providers').insert(payload);
  const { data, error } = await query.select(PROVIDER_SELECT).single();
  if (error) throw new Error(`Impossible d’enregistrer la société. ${error.message || ''}`.trim());
  return mapProvider(data as unknown as Record<string, unknown>);
}

export async function saveServiceProviderSpecialty(
  client: SupabaseClient,
  provider: ServiceProvider,
  name: string,
  specialtyId?: number,
): Promise<ServiceProviderSpecialty> {
  const payload = {
    company_id: provider.companyId,
    provider_id: provider.id,
    name: name.trim(),
    active: true,
    updated_at: new Date().toISOString(),
  };
  const query = specialtyId
    ? client.from('service_provider_specialties').update(payload).eq('id', specialtyId)
    : client.from('service_provider_specialties').insert(payload);
  const { data, error } = await query.select('id, name, active').single();
  if (error) throw new Error(`Impossible d’enregistrer la spécialité. ${error.message || ''}`.trim());
  return {
    id: number(data?.id),
    name: text(data?.name),
    active: data?.active !== false,
  };
}

export async function saveServiceProviderContact(
  client: SupabaseClient,
  provider: ServiceProvider,
  draft: ServiceProviderContactDraft,
  contactId?: number,
): Promise<ServiceProviderContact> {
  const payload = {
    company_id: provider.companyId,
    provider_id: provider.id,
    full_name: draft.fullName.trim(),
    role_label: draft.roleLabel.trim() || null,
    email: draft.email.trim() || null,
    phone: draft.phone.trim() || null,
    active: draft.active,
    updated_at: new Date().toISOString(),
  };
  const query = contactId
    ? client.from('service_provider_contacts').update(payload).eq('id', contactId)
    : client.from('service_provider_contacts').insert(payload);
  const { data, error } = await query.select('id, full_name, role_label, email, phone, active').single();
  if (error) throw new Error(`Impossible d’enregistrer le contact. ${error.message || ''}`.trim());
  return {
    id: number(data?.id),
    fullName: text(data?.full_name),
    roleLabel: text(data?.role_label),
    email: text(data?.email),
    phone: text(data?.phone),
    active: data?.active !== false,
  };
}

export function serviceProviderDraft(provider?: ServiceProvider): ServiceProviderDraft {
  return {
    name: provider?.name || '',
    category: provider?.category === 'Non classé' ? '' : provider?.category || '',
    serviceType: provider?.serviceType || '',
    activity: provider?.activity || '',
    address: provider?.address || '',
    city: provider?.city || '',
    phone: provider?.phone || '',
    legalForm: provider?.legalForm || '',
    accountingEmail: provider?.accountingEmail || '',
    companyEmail: provider?.companyEmail || '',
    supplies: provider?.supplies || '',
    evaluation: provider?.evaluation || '',
    active: provider?.active ?? true,
  };
}
