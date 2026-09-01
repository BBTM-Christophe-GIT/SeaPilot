import type { ProjectVesselCertificateRecord } from './projectQueries';

export const BAREBOAT_DELIVERY_TRUCK_LABEL = 'Sur camion – Déchargement à la charge de l’affréteur';

export interface BareboatCertificateFields {
  lastAdminVisitIso: string;
  lastAdminVisitLabel: string;
  manningPermitLabel: string;
  navigationPermitLabel: string;
}

export function localTodayIso(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function calendarDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (match) {
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatBareboatDate(value: string): string {
  if (!value) return '';
  const date = calendarDate(value);
  if (!date) return value;
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function formatBareboatDateTime(value: string): string {
  if (!value) return '';
  const dateLabel = formatBareboatDate(value);
  const time = /T(\d{2}):(\d{2})/.exec(value);
  if (!time) return dateLabel;
  return `${dateLabel} à ${time[1]} h ${time[2]}`;
}

function normalizeDocumentTitle(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, ' ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function certificateTitle(record: ProjectVesselCertificateRecord): string {
  return normalizeDocumentTitle(`${record.documentTitle} ${record.title}`);
}

function newestCertificate(
  certificates: ProjectVesselCertificateRecord[],
  matches: (title: string) => boolean,
): ProjectVesselCertificateRecord | undefined {
  return certificates
    .filter((record) => record.status !== 'missing' && matches(certificateTitle(record)))
    .sort((left, right) => (
      right.updatedAt.localeCompare(left.updatedAt)
      || right.issuedOn.localeCompare(left.issuedOn)
      || right.expiresOn.localeCompare(left.expiresOn)
      || right.id - left.id
    ))[0];
}

export function deriveBareboatCertificateFields(
  certificates: ProjectVesselCertificateRecord[],
): BareboatCertificateFields {
  const classification = newestCertificate(certificates, (title) => (
    title.includes('certificat de classification') || title.includes('certificat de classe')
  ));
  const navigation = newestCertificate(certificates, (title) => title.includes('permis de navigation'));
  const manning = newestCertificate(certificates, (title) => title.includes('permis d armement'));
  const lastAdminVisitIso = classification ? classification.issuedOn : navigation?.issuedOn || '';

  return {
    lastAdminVisitIso,
    lastAdminVisitLabel: formatBareboatDate(lastAdminVisitIso),
    navigationPermitLabel: navigation?.expiresOn ? formatBareboatDate(navigation.expiresOn) : 'Illimité',
    manningPermitLabel: manning?.expiresOn ? formatBareboatDate(manning.expiresOn) : 'Illimité',
  };
}

export function buildBareboatDeliveryLabel(date: string, port: string, deliveredByTruck: boolean): string {
  return [
    [formatBareboatDateTime(date), port].filter(Boolean).join(' · '),
    deliveredByTruck ? BAREBOAT_DELIVERY_TRUCK_LABEL : '',
  ].filter(Boolean).join('\n');
}

export function buildBareboatRedeliveryLabel(date: string, port: string): string {
  return [formatBareboatDateTime(date), port].filter(Boolean).join(' · ');
}
