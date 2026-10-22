import type { RoleKey } from '../permissions/roles';
import { compareFleetAssets, normalizeFleetName } from '../fleet/fleetDisplay';

export const PHARMACY_ALERT_DAYS = 30;
export type PharmacyExpiryPrecision = 'day' | 'month' | 'unknown';
export interface PharmacyVessel { id: number; company_id: number; name: string; acronym: string; can_manage: boolean; length_overall?: string | number | null }
export interface PharmacyCategory {
  id: number; company_id: number; vessel_id: number; name: string; revision: number;
  created_at: string; updated_at: string;
}
export function selectPharmacyVessels(vessels: PharmacyVessel[]): PharmacyVessel[] {
  const normalized = (value: string) => normalizeFleetName(value).replace(/[^A-Z0-9]/g, '');
  return vessels.filter((vessel) => normalized(vessel.name) !== 'BR71' && normalized(vessel.acronym || '') !== 'BR71')
    .sort(compareFleetAssets);
}
export interface PharmacyItem {
  id: number; company_id: number; vessel_id: number; section: string; category: string;
  brand: string; designation: string; lot_number: string; quantity: string; required_quantity: string;
  expires_on: string | null; expiry_text: string; expiry_precision: PharmacyExpiryPrecision;
  notes: string; active: boolean; revision: number; source_file: string; source_sheet: string;
  source_row: number | null; updated_at: string;
}
export type PharmacyItemDraft = Pick<PharmacyItem, 'section' | 'category' | 'brand' | 'designation' | 'lot_number' | 'quantity' | 'required_quantity' | 'expires_on' | 'expiry_text' | 'expiry_precision' | 'notes' | 'active'>;
export interface PharmacyControl {
  id: number; company_id: number; vessel_id: number; issued_on: string | null; expires_on: string;
  storage_path: string; file_name: string; file_size: number; mime_type: string;
  created_at: string; is_current: boolean; revision: number;
}
export interface PharmacyNotification {
  id: string; kind: 'item' | 'control'; vessel_id: number; vessel_name: string; title: string;
  expires_on: string; days_until_expiry: number; item_id: number | null;
}
export type PharmacyVesselExpiryCounts = { due: number; expired: number };
export interface PharmacyItemGroup { key: string; section: string; category: string; items: PharmacyItem[] }

export function groupPharmacyItems(items: PharmacyItem[]): PharmacyItemGroup[] {
  const sections = new Map<string, Map<string, PharmacyItemGroup>>();
  for (const item of items) {
    const section = item.section.trim();
    const category = item.category.trim() || 'Sans catégorie';
    let categories = sections.get(section);
    if (!categories) {
      categories = new Map();
      sections.set(section, categories);
    }
    let group = categories.get(category);
    if (!group) {
      group = { key: JSON.stringify([section, category]), section, category, items: [] };
      categories.set(category, group);
    }
    group.items.push(item);
  }
  return [...sections.values()].flatMap((categories) => [...categories.values()]
    .sort((a, b) => a.category.localeCompare(b.category, 'fr', { numeric: true, sensitivity: 'base' })));
}
export function canManagePharmacy(roles: RoleKey[]): boolean {
  return roles.some((role) => ['admin', 'direction', 'armement', 'capitaine'].includes(role));
}
export function blankPharmacyItem(): PharmacyItemDraft {
  return { section: '', category: '', brand: '', designation: '', lot_number: '', quantity: '', required_quantity: '', expires_on: null, expiry_text: '', expiry_precision: 'unknown', notes: '', active: true };
}
export function pharmacyToday(): string {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
export function pharmacyDaysUntil(date: string | null, today = pharmacyToday()): number | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date) return null;
  const delta = (timestamp - Date.parse(`${today}T00:00:00Z`)) / 86400000;
  return Number.isFinite(delta) ? delta : null;
}
export function pharmacyExpiryStatus(date: string | null, today = pharmacyToday()): 'expired' | 'due' | 'valid' | 'unknown' {
  const days = pharmacyDaysUntil(date, today);
  return days === null ? 'unknown' : days < 0 ? 'expired' : days <= PHARMACY_ALERT_DAYS ? 'due' : 'valid';
}
export function formatPharmacyDate(date: string | null, precision: PharmacyExpiryPrecision = 'day'): string {
  if (!date) return 'Non renseignée';
  const [year, month, day] = date.split('-');
  return precision === 'month' ? `${month}/${year}` : `${day}/${month}/${year}`;
}
// Only bare numbers have unambiguous units. Pack sizes and free text remain available for human review.
export function pharmacyStockStatus(item: Pick<PharmacyItem, 'quantity' | 'required_quantity'>): 'low' | 'ok' | 'unknown' {
  const number = (value: string) => /^\d+(?:[.,]\d+)?$/.test(value.trim()) ? Number(value.trim().replace(',', '.')) : null;
  const actual = number(item.quantity), required = number(item.required_quantity);
  return actual === null || required === null ? 'unknown' : actual < required ? 'low' : 'ok';
}
