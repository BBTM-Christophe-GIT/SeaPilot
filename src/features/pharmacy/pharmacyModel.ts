import type { RoleKey } from '../permissions/roles';
import { compareFleetAssets, normalizeFleetName } from '../fleet/fleetDisplay';

export const PHARMACY_ALERT_DAYS = 30;
export type PharmacyExpiryPrecision = 'day' | 'month' | 'unknown';
export interface PharmacyVessel { id: number; company_id: number; name: string; acronym: string; can_manage: boolean; length_overall?: string | number | null; medical_dotation?: string | null }
export function pharmacyDotationKey(value: string | null | undefined): string {
  const raw = (value || '').trim().toLocaleLowerCase('fr');
  const folded = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
  const known = folded.match(/^(?:dotation(?: medicale)? )?([abc])(?: (restreinte?))?(?:\s*[-–—(].*)?$/);
  return known ? `dotation ${known[1]}${known[2] ? ' restreinte' : ''}` : raw;
}
export function pharmacyDotationLabel(value: string | null | undefined): string {
  const key = pharmacyDotationKey(value);
  const known = key.match(/^dotation ([abc])( restreinte)?$/);
  return known ? `Dotation ${known[1].toUpperCase()}${known[2] || ''}` : (value || '').trim() || 'Dotation non renseignée';
}
export const PHARMACY_MEDICAL_SECTIONS = {
  medicines: 'Médicaments',
  equipment: 'Matériel médical et objets de pansement',
  unclassified: 'À classer',
} as const;
export type PharmacyMedicalSection = keyof typeof PHARMACY_MEDICAL_SECTIONS;
export function pharmacyMedicalSection(value: string | null | undefined): PharmacyMedicalSection {
  return value === 'medicines' || value === 'equipment' ? value : 'unclassified';
}
export function pharmacyMedicalSectionLabel(value: string | null | undefined): string { return PHARMACY_MEDICAL_SECTIONS[pharmacyMedicalSection(value)]; }
export interface PharmacyCategory {
  id: number; company_id: number; vessel_id: number; name: string; revision: number;
  created_at: string; updated_at: string;
  medical_dotation?: string;
  medical_section?: PharmacyMedicalSection;
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
  medical_dotation?: string;
  medical_section?: PharmacyMedicalSection;
  category_id?: number | null;
}
export type PharmacyItemDraft = Pick<PharmacyItem, 'section' | 'category' | 'brand' | 'designation' | 'lot_number' | 'quantity' | 'required_quantity' | 'expires_on' | 'expiry_text' | 'expiry_precision' | 'notes' | 'active' | 'medical_dotation' | 'medical_section' | 'category_id'>;
export interface PharmacyControl {
  id: number; company_id: number; vessel_id: number; issued_on: string | null; expires_on: string;
  storage_path: string; file_name: string; file_size: number; mime_type: string;
  created_at: string; is_current: boolean; revision: number;
}
export interface PharmacyNotification {
  id: string; kind: 'item' | 'control'; vessel_id: number; vessel_name: string; title: string;
  expires_on: string; days_until_expiry: number; item_id: number | null;
}
export function pharmacyNotificationHref(notification: PharmacyNotification): string {
  const route = `/modules/pharmacy?vessel=${notification.vessel_id}&filter=expiry`;
  return notification.kind === 'item' && notification.item_id != null ? `${route}&item=${notification.item_id}` : route;
}
export type PharmacyVesselExpiryCounts = { due: number; expired: number };
export interface PharmacyItemGroup { key: string; section: string; medical_dotation: string; medical_section: PharmacyMedicalSection; category: string; items: PharmacyItem[] }

export function groupPharmacyItems(items: PharmacyItem[], catalogue: PharmacyCategory[] = []): PharmacyItemGroup[] {
  const dotations = new Map<string, Map<string, PharmacyItemGroup>>();
  for (const item of items) {
    const section = item.section.trim();
    const dotation = (item.medical_dotation || '').trim();
    const dotationKey = pharmacyDotationKey(dotation);
    const category = item.category.trim() || 'Sans catégorie';
    let categories = dotations.get(dotationKey);
    if (!categories) {
      categories = new Map();
      dotations.set(dotationKey, categories);
    }
    const medicalSection = pharmacyMedicalSection(item.medical_section);
    const categoryKey = JSON.stringify([medicalSection, category]);
    let group = categories.get(categoryKey);
    if (!group) {
      group = { key: JSON.stringify([dotationKey, medicalSection, category]), section, medical_dotation: dotation, medical_section: medicalSection, category, items: [] };
      categories.set(categoryKey, group);
    }
    if (group.section !== section) group.section = '';
    group.items.push(item);
  }
  for (const record of catalogue) {
    const dotation = record.medical_dotation || '';
    const dotationKey = pharmacyDotationKey(dotation);
    const medicalSection = pharmacyMedicalSection(record.medical_section);
    const category = record.name.trim();
    const categoryKey = JSON.stringify([medicalSection, category]);
    let categories = dotations.get(dotationKey);
    if (!categories) { categories = new Map(); dotations.set(dotationKey, categories); }
    if (!categories.has(categoryKey)) categories.set(categoryKey, { key: JSON.stringify([dotationKey, medicalSection, category]), section: '', medical_dotation: dotation, medical_section: medicalSection, category, items: [] });
  }
  return [...dotations.entries()].sort(([a], [b]) => a.localeCompare(b, 'fr', { numeric: true })).flatMap(([, categories]) => [...categories.values()]
    .sort((a, b) => Object.keys(PHARMACY_MEDICAL_SECTIONS).indexOf(a.medical_section) - Object.keys(PHARMACY_MEDICAL_SECTIONS).indexOf(b.medical_section) || a.category.localeCompare(b.category, 'fr', { numeric: true, sensitivity: 'base' })));
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
