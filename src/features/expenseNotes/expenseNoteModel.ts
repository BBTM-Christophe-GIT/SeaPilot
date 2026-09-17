import type { RoleKey } from '../permissions/roles';

export type ExpenseKind = 'expense' | 'mileage';
export type Fuel = 'essence' | 'diesel' | 'hybrid' | 'electric';
export class ExpenseInputError extends Error {}
export interface MileageTrip { date: string; route: string; reason: string; km: number; amount: number; rate?: number | null }
export interface MileageDetails { vehicle: string; fiscalPower: string; fuel: Fuel; function: string; period: string; tolls: number; trips: MileageTrip[] }
export interface ExpenseNote {
  id: string; company_id: number; created_by: string; creator_name: string; issuer_person_id: number | null; issuer_name: string;
  vessel_id: number | null; vessel_name: string; kind: ExpenseKind; expense_on: string;
  title: string; description: string; payment_method: string; amount: number;
  mileage: MileageDetails | null; receipt_count: number; pdf_path: string;
  status: 'preparing' | 'issued'; issued_at: string | null; created_at: string;
  delivery_status: 'pending' | 'sending' | 'sent' | 'failed' | 'unknown';
  delivered_at: string | null; delivery_error: string | null;
}
export interface ExpenseNoteInput {
  id: string; issuer_name: string; issuer_person_id: number | null; vessel_id: number | null; kind: ExpenseKind; expense_on: string;
  title: string; description: string; payment_method: string; amount: number;
  mileage: MileageDetails | null; receipt_count: number;
}
export const PAYMENT_METHODS = ['CB-Perso', 'CB-Benjamin', 'CB-Armement - 9893', 'CB-SUROIT', 'CB-LE ROZEL', 'CB-GOURY', 'CB-LANDEMER', 'Espèces', 'Autre'];
export const FUEL_LABELS: Record<Fuel, string> = { essence: 'Essence', diesel: 'Diesel', hybrid: 'Hybride', electric: 'Électrique' };
export const expenseIssuerKey = (note: Pick<ExpenseNote, 'issuer_person_id' | 'issuer_name'>) => note.issuer_person_id === null ? `name:${note.issuer_name.trim().toLocaleLowerCase('fr')}` : `person:${note.issuer_person_id}`;
export const DELIVERY_LABELS: Record<ExpenseNote['delivery_status'], string> = {
  pending: 'À transmettre', sending: 'Transmission en cours', sent: 'Transmise à la comptabilité',
  failed: 'Transmission à reprendre', unknown: 'Transmission à vérifier',
};
export function canViewAllExpenseNotes(roles: RoleKey[]) { return roles.includes('admin') || roles.includes('direction'); }
export const formatExpenseMoney = (amount: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount);
export function mileageAmount(km: number, fuel: Fuel, manualAmount: number): number {
  return Math.round((fuel === 'electric' ? manualAmount : Math.min(Math.max(0, Math.trunc(km)) * 0.606, 100)) * 100) / 100;
}
export function mileageTotal(details: MileageDetails): number {
  return Math.round((details.trips.reduce((sum, trip) => sum + mileageAmount(trip.km, details.fuel, trip.amount), 0) + details.tolls) * 100) / 100;
}
export function groupExpenseNotes(notes: ExpenseNote[]) {
  const vessels = new Map<string, { key: string; name: string; issuers: Map<string, { id: string; name: string; notes: ExpenseNote[] }> }>();
  for (const note of notes) {
    const key = String(note.vessel_id ?? 'none');
    if (!vessels.has(key)) vessels.set(key, { key, name: note.vessel_name, issuers: new Map() });
    const vessel = vessels.get(key)!;
    if (!vessel.issuers.has(expenseIssuerKey(note))) vessel.issuers.set(expenseIssuerKey(note), { id: expenseIssuerKey(note), name: note.issuer_name, notes: [] });
    vessel.issuers.get(expenseIssuerKey(note))!.notes.push(note);
  }
  return [...vessels.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr')).map((vessel) => ({
    ...vessel, issuers: [...vessel.issuers.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr')).map((issuer) => ({
      ...issuer, notes: issuer.notes.sort((a, b) => (b.issued_at || '').localeCompare(a.issued_at || '') || a.id.localeCompare(b.id)),
    })),
  }));
}
export function validateExpenseFiles(files: File[]) {
  if (files.length > 20) throw new Error('Vous pouvez joindre au maximum 20 justificatifs.');
  for (const file of files) {
    if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error(`${file.name} : utilisez un PDF ou une image JPG, PNG ou WebP.`);
    if (file.size > 15_000_000) throw new Error(`${file.name} dépasse 15 Mo.`);
  }
  if (files.reduce((size, file) => size + file.size, 0) > 50_000_000) throw new Error('Les justificatifs dépassent 50 Mo au total.');
}
