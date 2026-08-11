import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateFleetCertificateVisitReport } from './fleetCertificateVisitReport';

describe('fleet certificate visit report', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('generates the daily Planning des visites PDF with concurrent providers and optional subjects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const result = await generateFleetCertificateVisitReport({
      certificate: {
        id: 42,
        vesselName: 'GOURY',
        categoryLabel: '06 - Incendie',
        documentTitle: 'Certificat incendie',
      } as never,
      visit: {
        certificateId: 42,
        scheduledStart: '2026-09-01T09:00',
        scheduledEnd: '2026-09-01T12:00',
        location: 'Cherbourg - FR CER',
        purpose: 'Visite annuelle',
        notes: 'Accès par la coupée bâbord',
        assignments: [
          { providerId: 8, specialtyId: 81, contactId: 811, scheduledStart: '2026-09-01T09:00', scheduledEnd: '2026-09-01T11:00' },
          { providerId: 9, specialtyId: 91, contactId: null, scheduledStart: '2026-09-01T09:00', scheduledEnd: '2026-09-01T12:00' },
        ],
      },
      providers: [{
        id: 8, name: 'SERVAUX', address: '', city: '', phone: '', email: '',
        specialties: [{ id: 81, name: 'Incendie' }],
        contacts: [{ id: 811, name: 'Yann DUVAL', role: '', email: 'y.duval@example.com', phone: '0200000000' }],
      }, {
        id: 9, name: 'DNV', address: '', city: '', phone: '', email: '',
        specialties: [{ id: 91, name: 'Classification' }], contacts: [],
      }],
      findings: [{
        id: 81, certificateId: 42, reference: 'EC-2026-0012', findingType: 'major_non_conformity',
        title: 'Corrosion du support', description: 'Corrosion constatée à bâbord.', treatmentDueOn: '2026-09-15',
        responsibleName: 'Arthur DEMO', progress: 20, events: [{ id: 1, eventType: 'comment', note: 'Pièce commandée', authorName: 'Arthur DEMO', createdAt: '2026-08-20T09:00:00Z' }], attachments: [],
      } as never],
      reportDate: '2026-09-01',
      includeSubjects: true,
      generatedOn: new Date('2026-08-11T12:00:00Z'),
    });

    expect(result.filename).toBe('BBTM-Planning-des-visites-2026-09-01.pdf');
    expect(result.blob.type).toBe('application/pdf');
    expect(new Uint8Array(result.arrayBuffer).slice(0, 4)).toEqual(new Uint8Array([37, 80, 68, 70]));
    expect(result.arrayBuffer.byteLength).toBeGreaterThan(5_000);
  });
});
