export const VESSEL_EXPIRY_ALERT_DAYS = 30;
export interface VesselExpiryCounts { due: number; expired: number }
export interface VesselExpiryRow { vessel_id: number; expires_on: string | null }

export function vesselExpiryToday(): string {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function dayNumber(value: string | null): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value ? timestamp / 86400000 : null;
}

export function countVesselExpiries(rows: VesselExpiryRow[], today = vesselExpiryToday()): Record<number, VesselExpiryCounts> {
  const day = dayNumber(today);
  if (day === null) throw new Error('Date de référence des échéances invalide.');
  const counts: Record<number, VesselExpiryCounts> = {};
  for (const row of rows) {
    const expiry = dayNumber(row.expires_on);
    if (expiry === null || !Number.isSafeInteger(row.vessel_id) || row.vessel_id <= 0) continue;
    const remaining = expiry - day;
    if (remaining > VESSEL_EXPIRY_ALERT_DAYS) continue;
    const count = counts[row.vessel_id] ||= { due: 0, expired: 0 };
    if (remaining < 0) count.expired += 1;
    else count.due += 1;
  }
  return counts;
}
