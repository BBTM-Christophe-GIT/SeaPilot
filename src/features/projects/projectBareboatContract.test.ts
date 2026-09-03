import { describe, expect, it } from 'vitest';
import {
  BAREBOAT_DELIVERY_TRUCK_LABEL,
  buildBareboatDeliveryLabel,
  deriveBareboatCertificateFields,
  localTodayIso,
} from './projectBareboatContract';
import type { ProjectVesselCertificateRecord } from './projectQueries';

function certificate(
  values: Partial<ProjectVesselCertificateRecord> & Pick<ProjectVesselCertificateRecord, 'documentTitle' | 'id'>,
): ProjectVesselCertificateRecord {
  return {
    expiresOn: '',
    issuedOn: '',
    status: 'valid',
    title: values.documentTitle,
    updatedAt: '2026-08-01T10:00:00Z',
    vesselId: 4,
    ...values,
  };
}

describe('bareboat certificate mapping', () => {
  it('uses the classification issue date before the navigation permit issue date', () => {
    const fields = deriveBareboatCertificateFields([
      certificate({ documentTitle: 'Permis de Navigation', expiresOn: '2027-05-29', id: 1, issuedOn: '2024-01-10' }),
      certificate({ documentTitle: 'Certificat de Classification', id: 2, issuedOn: '2026-08-12' }),
      certificate({ documentTitle: "Permis d'Armement", id: 3 }),
    ]);

    expect(fields).toEqual({
      lastAdminVisitIso: '2026-08-12',
      lastAdminVisitLabel: '12 août 2026',
      navigationPermitLabel: '29 mai 2027',
      manningPermitLabel: 'Illimité',
    });
  });

  it('accepts Certificat de Classe and only falls back when no classification document exists', () => {
    expect(deriveBareboatCertificateFields([
      certificate({ documentTitle: 'Certificat de Classe', id: 4, issuedOn: '' }),
      certificate({ documentTitle: 'Permis de Navigation - 2027', id: 5, issuedOn: '2025-02-11' }),
    ]).lastAdminVisitIso).toBe('');

    expect(deriveBareboatCertificateFields([
      certificate({ documentTitle: 'Permis de Navigation', id: 6, issuedOn: '2025-02-11' }),
    ]).lastAdminVisitIso).toBe('2025-02-11');
  });

  it('ignores missing placeholders and includes the optional truck clause in delivery', () => {
    const fields = deriveBareboatCertificateFields([
      certificate({ documentTitle: 'Permis de Navigation', expiresOn: '2028-01-01', id: 7, status: 'missing' }),
    ]);
    const delivery = buildBareboatDeliveryLabel('2026-09-01T10:30', 'Cherbourg', true);

    expect(fields.navigationPermitLabel).toBe('Illimité');
    expect(delivery).toBe(`1 septembre 2026 à 10 h 30 · Cherbourg\n${BAREBOAT_DELIVERY_TRUCK_LABEL}`);
    expect(localTodayIso(new Date(2026, 8, 1))).toBe('2026-09-01');
  });
});
