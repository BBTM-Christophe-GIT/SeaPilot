import { describe, expect, it, vi } from 'vitest';
import {
  fetchFleetCertificateVisits,
  fetchFleetServiceProviders,
  saveFleetCertificateVisit,
} from './fleetCertificateVisits';

describe('fleet certificate provider visits', () => {
  it('maps one provider with several specialties and contacts', async () => {
    const order = vi.fn().mockResolvedValue({ data: [{
      id: 8, name: 'SERVAUX', address: '5 Quai de Guinée', city: 'Le Havre', phone: '02 32 74 95 80', company_email: 'contact@servaux.com',
      specialties: [{ id: 1, name: 'Incendie', active: true }, { id: 2, name: 'Radeaux de sauvetage', active: true }],
      contacts: [{ id: 3, full_name: 'Yann DUVAL', role_label: 'Technicien', email: 'y.duval@servaux.com', phone: '06 00 00 00 00', active: true }],
    }], error: null });
    const client = { from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ is: vi.fn().mockReturnValue({ order }) }) }) }) };
    const providers = await fetchFleetServiceProviders(client as never);
    expect(providers[0]).toMatchObject({ name: 'SERVAUX', specialties: [{ name: 'Incendie' }, { name: 'Radeaux de sauvetage' }] });
    expect(providers[0].contacts[0]).toMatchObject({ name: 'Yann DUVAL', email: 'y.duval@servaux.com' });
  });

  it('maps a multi-provider visit grouped on its certificate', async () => {
    const order = vi.fn().mockResolvedValue({ data: [{
      id: 20, certificate_id: 42, scheduled_start: '2026-09-01T07:00:00Z', scheduled_end: null,
      location: 'Le Havre', purpose: 'Visite annuelle', notes: '', status: 'planned',
      certificate: { vessel_name: 'GOURY', category_label: '06 - Incendie', document_title: 'Certificat incendie' },
      assignments: [
        { provider_id: 8, specialty_id: 1, contact_id: 3, scheduled_start: '2026-09-01T07:00:00Z', scheduled_end: '2026-09-01T09:00:00Z', provider: { id: 8, name: 'SERVAUX' }, specialty: { id: 1, name: 'Incendie' }, contact: { id: 3, full_name: 'Yann DUVAL' } },
        { provider_id: 9, specialty_id: 4, contact_id: null, scheduled_start: '2026-09-01T08:00:00Z', scheduled_end: '2026-09-01T10:00:00Z', provider: { id: 9, name: 'DNV' }, specialty: { id: 4, name: 'Classification' }, contact: null },
      ],
    }], error: null });
    const client = { from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ neq: vi.fn().mockReturnValue({ order }) }) }) };
    const visits = await fetchFleetCertificateVisits(client as never);
    expect(visits[0]).toMatchObject({ vesselName: 'GOURY', documentTitle: 'Certificat incendie' });
    expect(visits[0].assignments.map((item) => item.providerName)).toEqual(['SERVAUX', 'DNV']);
  });

  it('saves all provider assignments atomically through the RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 77, error: null });
    const result = await saveFleetCertificateVisit({ rpc } as never, {
      certificateId: 42,
      scheduledStart: '2026-09-01T09:00',
      scheduledEnd: '2026-09-01T11:00',
      location: 'Le Havre',
      purpose: 'Visite annuelle',
      notes: '',
      assignments: [
        { providerId: 8, specialtyId: 1, contactId: 3, scheduledStart: '2026-09-01T09:00', scheduledEnd: '2026-09-01T11:00' },
        { providerId: 9, specialtyId: 4, contactId: null, scheduledStart: '2026-09-01T09:30', scheduledEnd: '2026-09-01T12:00' },
      ],
    });
    expect(result).toBe(77);
    expect(rpc).toHaveBeenCalledWith('save_fleet_certificate_visit', expect.objectContaining({
      p_certificate_id: 42,
      p_scheduled_start: new Date('2026-09-01T09:00').toISOString(),
      p_scheduled_end: new Date('2026-09-01T12:00').toISOString(),
      p_assignments: expect.arrayContaining([expect.objectContaining({ providerId: 8 }), expect.objectContaining({ providerId: 9 })]),
    }));
  });
});
