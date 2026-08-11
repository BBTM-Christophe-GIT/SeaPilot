import type { SupabaseClient } from '@supabase/supabase-js';

export interface FleetServiceProviderSpecialty {
  id: number;
  name: string;
}

export interface FleetServiceProviderContact {
  id: number;
  name: string;
  role: string;
  email: string;
  phone: string;
}

export interface FleetServiceProvider {
  id: number;
  name: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  specialties: FleetServiceProviderSpecialty[];
  contacts: FleetServiceProviderContact[];
}

export interface FleetCertificateVisitAssignment {
  providerId: number;
  providerName: string;
  specialtyId: number;
  specialtyName: string;
  contactId: number | null;
  contactName: string;
}

export interface FleetCertificateVisit {
  id: number;
  certificateId: number;
  vesselName: string;
  categoryLabel: string;
  documentTitle: string;
  scheduledStart: string;
  scheduledEnd: string;
  location: string;
  purpose: string;
  notes: string;
  status: 'planned' | 'confirmed' | 'completed' | 'cancelled';
  assignments: FleetCertificateVisitAssignment[];
}

interface ProviderRow {
  id: number;
  name: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  company_email: string | null;
  specialties: Array<{ id: number; name: string; active: boolean }>;
  contacts: Array<{
    id: number;
    full_name: string;
    role_label: string | null;
    email: string | null;
    phone: string | null;
    active: boolean;
  }>;
}

interface VisitRow {
  id: number;
  certificate_id: number;
  scheduled_start: string;
  scheduled_end: string | null;
  location: string;
  purpose: string;
  notes: string;
  status: FleetCertificateVisit['status'];
  certificate: {
    vessel_name: string | null;
    category_label: string | null;
    document_title: string | null;
  } | Array<{
    vessel_name: string | null;
    category_label: string | null;
    document_title: string | null;
  }>;
  assignments: Array<{
    provider_id: number;
    specialty_id: number;
    contact_id: number | null;
    provider: { id: number; name: string } | Array<{ id: number; name: string }>;
    specialty: { id: number; name: string } | Array<{ id: number; name: string }>;
    contact: { id: number; full_name: string } | Array<{ id: number; full_name: string }> | null;
  }>;
}

function first<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] || null : value;
}

export async function fetchFleetServiceProviders(client: SupabaseClient): Promise<FleetServiceProvider[]> {
  const { data, error } = await client
    .from('service_providers')
    .select(`
      id, name, address, city, phone, company_email,
      specialties:service_provider_specialties(id, name, active),
      contacts:service_provider_contacts(id, full_name, role_label, email, phone, active)
    `)
    .eq('active', true)
    .is('merged_into_provider_id', null)
    .order('name');
  if (error) throw new Error(`Impossible de charger les prestataires. ${error.message || ''}`.trim());

  return ((data || []) as ProviderRow[]).map((provider) => ({
    id: provider.id,
    name: provider.name,
    address: provider.address || '',
    city: provider.city || '',
    phone: provider.phone || '',
    email: provider.company_email || '',
    specialties: (provider.specialties || [])
      .filter((item) => item.active)
      .map((item) => ({ id: item.id, name: item.name }))
      .sort((left, right) => left.name.localeCompare(right.name, 'fr')),
    contacts: (provider.contacts || [])
      .filter((item) => item.active)
      .map((item) => ({
        id: item.id,
        name: item.full_name,
        role: item.role_label || '',
        email: item.email || '',
        phone: item.phone || '',
      }))
      .sort((left, right) => left.name.localeCompare(right.name, 'fr')),
  }));
}

export async function fetchFleetCertificateVisits(client: SupabaseClient): Promise<FleetCertificateVisit[]> {
  const { data, error } = await client
    .from('fleet_certificate_visits')
    .select(`
      id, certificate_id, scheduled_start, scheduled_end, location, purpose, notes, status,
      certificate:fleet_certificates!fleet_certificate_visits_certificate_id_fkey(
        vessel_name, category_label, document_title
      ),
      assignments:fleet_certificate_visit_providers(
        provider_id, specialty_id, contact_id,
        provider:service_providers!fleet_certificate_visit_providers_provider_id_fkey(id, name),
        specialty:service_provider_specialties!fleet_certificate_visit_providers_specialty_id_fkey(id, name),
        contact:service_provider_contacts!fleet_certificate_visit_providers_contact_id_fkey(id, full_name)
      )
    `)
    .neq('status', 'cancelled')
    .order('scheduled_start');
  if (error) throw new Error(`Impossible de charger le calendrier des visites. ${error.message || ''}`.trim());

  return ((data || []) as unknown as VisitRow[]).map((visit) => {
    const certificate = first(visit.certificate);
    return {
      id: visit.id,
      certificateId: visit.certificate_id,
      vesselName: certificate?.vessel_name || 'Navire non renseigné',
      categoryLabel: certificate?.category_label || 'Sans catégorie',
      documentTitle: certificate?.document_title || 'Document sans titre',
      scheduledStart: visit.scheduled_start,
      scheduledEnd: visit.scheduled_end || '',
      location: visit.location,
      purpose: visit.purpose,
      notes: visit.notes,
      status: visit.status,
      assignments: (visit.assignments || []).map((assignment) => {
        const provider = first(assignment.provider);
        const specialty = first(assignment.specialty);
        const contact = first(assignment.contact);
        return {
          providerId: assignment.provider_id,
          providerName: provider?.name || 'Prestataire',
          specialtyId: assignment.specialty_id,
          specialtyName: specialty?.name || 'Spécialité non renseignée',
          contactId: assignment.contact_id,
          contactName: contact?.full_name || '',
        };
      }),
    };
  });
}

export interface SaveFleetCertificateVisitInput {
  certificateId: number;
  scheduledStart: string;
  scheduledEnd: string;
  location: string;
  purpose: string;
  notes: string;
  assignments: Array<{ providerId: number; specialtyId: number; contactId: number | null }>;
}

export async function saveFleetCertificateVisit(
  client: SupabaseClient,
  input: SaveFleetCertificateVisitInput,
): Promise<number> {
  if (!input.scheduledStart) throw new Error('Renseignez la date et l’heure de la visite.');
  if (!input.assignments.length) throw new Error('Ajoutez au moins un prestataire.');
  if (input.assignments.length > 10) throw new Error('Une visite est limitée à 10 prestataires.');
  const start = new Date(input.scheduledStart);
  const end = input.scheduledEnd ? new Date(input.scheduledEnd) : null;
  if (Number.isNaN(start.getTime()) || (end && Number.isNaN(end.getTime()))) {
    throw new Error('La date de visite est invalide.');
  }
  if (end && end < start) throw new Error('La fin de visite doit être postérieure au début.');

  const { data, error } = await client.rpc('save_fleet_certificate_visit', {
    p_certificate_id: input.certificateId,
    p_scheduled_start: start.toISOString(),
    p_scheduled_end: end?.toISOString() || null,
    p_location: input.location.trim(),
    p_purpose: input.purpose.trim(),
    p_notes: input.notes.trim(),
    p_assignments: input.assignments,
  });
  if (error) throw new Error(`Impossible de programmer la visite. ${error.message || ''}`.trim());
  return Number(data);
}
