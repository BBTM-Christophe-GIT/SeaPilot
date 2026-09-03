import type { SupabaseClient } from '@supabase/supabase-js';

export const HR_DOCUMENT_EXPIRY_NOTICE_DAYS = 40;

export interface HrDocumentExpiryNotification {
  documentId: number;
  title: string;
  expiresOn: string;
  daysUntilExpiry: number;
}

interface HrDocumentNotificationRow {
  id: number | string;
  title: string;
  expires_on: string | null;
}

function parseIsoDateKey(dateKey: string): [number, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) throw new Error('Date de référence RH invalide.');
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function addIsoDateDays(dateKey: string, days: number): string {
  const [year, month, day] = parseIsoDateKey(dateKey);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

export function getParisDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Europe/Paris',
    year: 'numeric',
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get('year')}-${values.get('month')}-${values.get('day')}`;
}

export function getHrDocumentExpiryWindow(referenceDateKey = getParisDateKey()) {
  return {
    startsOn: referenceDateKey,
    endsOn: addIsoDateDays(referenceDateKey, HR_DOCUMENT_EXPIRY_NOTICE_DAYS),
  };
}

export function formatHrDocumentExpiryDate(dateKey: string): string {
  if (!dateKey) return '';
  const [year, month, day] = parseIsoDateKey(dateKey);
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

export async function fetchHrDocumentExpiryNotifications(
  client: SupabaseClient,
  personId: number,
  referenceDateKey = getParisDateKey(),
): Promise<HrDocumentExpiryNotification[]> {
  const { startsOn, endsOn } = getHrDocumentExpiryWindow(referenceDateKey);
  const { data, error } = await client
    .from('hr_documents')
    .select('id,title,expires_on')
    .eq('person_id', personId)
    .gte('expires_on', startsOn)
    .lte('expires_on', endsOn)
    .order('expires_on', { ascending: true });

  if (error) throw error;

  return ((data || []) as HrDocumentNotificationRow[])
    .filter((row): row is HrDocumentNotificationRow & { expires_on: string } => Boolean(row.expires_on))
    .map((row) => ({
      documentId: Number(row.id),
      title: row.title,
      expiresOn: row.expires_on,
      daysUntilExpiry: Math.round(
        (Date.parse(`${row.expires_on}T00:00:00Z`) - Date.parse(`${startsOn}T00:00:00Z`)) / 86_400_000,
      ),
    }));
}

export function notifyHrDocumentsChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('hr-documents:changed'));
}
