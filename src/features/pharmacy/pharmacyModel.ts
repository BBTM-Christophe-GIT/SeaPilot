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
  no_expiry?: boolean;
  outside_dotation?: boolean;
  stock_quantity?: number | null;
  required_stock_quantity?: number | null;
  stock_unit?: string | null;
  package_size?: number | null;
  strength?: string | null;
  required_stock_unit?: string | null;
  required_package_size?: number | null;
  required_strength?: string | null;
}
type PharmacyRequirementFields = Pick<PharmacyItem, 'required_quantity' | 'required_stock_quantity' | 'required_stock_unit' | 'required_strength' | 'required_package_size'>;
export type PharmacyItemDraft = Pick<PharmacyItem, 'section' | 'category' | 'brand' | 'designation' | 'lot_number' | 'quantity' | 'expires_on' | 'expiry_text' | 'expiry_precision' | 'notes' | 'active' | 'medical_dotation' | 'medical_section' | 'category_id' | 'no_expiry' | 'outside_dotation' | 'stock_quantity' | 'stock_unit' | 'package_size' | 'strength'> & PharmacyRequirementFields & {
  update_dotation_requirement?: boolean;
  dotation_requirement_revision?: number | null;
};
export interface PharmacyDotationRequirement extends PharmacyRequirementFields {
  dotation_key: string;
  medical_section: PharmacyMedicalSection;
  designation: string;
  designation_key: string;
  dotation_requirement_revision: number;
}
export function pharmacyDesignationKey(value: string): string {
  const accents = 'àâäçéèêëîïôöùûüÿ';
  const plain = 'aaaceeeeiioouuuy';
  return value.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase()
    .replace(/[àâäçéèêëîïôöùûüÿ]/g, (character) => plain[accents.indexOf(character)]);
}
export interface PharmacyControl {
  id: number; company_id: number; vessel_id: number; issued_on: string | null; expires_on: string;
  storage_path: string; file_name: string; file_size: number; mime_type: string;
  created_at: string; is_current: boolean; revision: number;
}
export interface PharmacyNotification {
  id: string; kind: 'item' | 'control' | 'stock' | 'outside_dotation'; vessel_id: number; vessel_name: string; title: string;
  expires_on: string | null; days_until_expiry: number | null; item_id: number | null;
}
export function pharmacyNotificationHref(notification: PharmacyNotification): string {
  const filter = notification.kind === 'stock' ? 'low' : notification.kind === 'outside_dotation' ? 'outside_dotation' : 'expiry';
  const route = `/modules/pharmacy?vessel=${notification.vessel_id}&filter=${filter}`;
  return notification.item_id != null ? `${route}&item=${notification.item_id}` : route;
}
export type PharmacyVesselExpiryCounts = { due: number; expired: number; low?: number; red?: number };

export function pharmacyVesselExpiryCounts(notifications: PharmacyNotification[]): Record<number, PharmacyVesselExpiryCounts> {
  const counts: Record<number, PharmacyVesselExpiryCounts> = {};
  const urgentItems = new Map<number, Set<number | string>>();
  for (const notification of notifications) {
    const days = notification.days_until_expiry;
    if (notification.kind === 'control' || notification.kind === 'outside_dotation') continue;
    if (notification.kind === 'item' && (days === null || !Number.isFinite(days) || days > PHARMACY_ALERT_DAYS)) continue;
    const vesselCounts = counts[notification.vessel_id] ||= { due: 0, expired: 0 };
    if (notification.kind === 'item' && days !== null && days >= 0) {
      vesselCounts.due += 1;
      continue;
    }
    if (notification.kind === 'item') vesselCounts.expired += 1;
    if (notification.kind === 'stock') vesselCounts.low = (vesselCounts.low ?? 0) + 1;
    const vesselItems = urgentItems.get(notification.vessel_id) ?? new Set<number | string>();
    vesselItems.add(notification.item_id ?? notification.id);
    urgentItems.set(notification.vessel_id, vesselItems);
  }
  for (const [vesselId, items] of urgentItems) {
    if (counts[vesselId].low) counts[vesselId].red = items.size;
  }
  return counts;
}

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
  return { section: '', category: '', brand: '', designation: '', lot_number: '', quantity: '', required_quantity: '', expires_on: null, expiry_text: '', expiry_precision: 'unknown', notes: '', active: true, no_expiry: false, outside_dotation: false, stock_quantity: null, required_stock_quantity: null, stock_unit: null, package_size: null, strength: null };
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
export function pharmacyItemExpiryStatus(item: Pick<PharmacyItem, 'no_expiry' | 'expires_on' | 'outside_dotation'>, today = pharmacyToday()) {
  return item.no_expiry || (item.outside_dotation && !item.expires_on) ? 'none' : pharmacyExpiryStatus(item.expires_on, today);
}
export function formatPharmacyItemExpiry(item: Pick<PharmacyItem, 'no_expiry' | 'expires_on' | 'expiry_precision' | 'expiry_text' | 'outside_dotation'>): string {
  if (item.no_expiry) return 'Sans date de péremption';
  return item.expires_on ? formatPharmacyDate(item.expires_on, item.expiry_precision) : item.expiry_text || (item.outside_dotation ? '—' : 'À renseigner');
}
export function parsePharmacyQuantity(value: string): number | null {
  const trimmed = value.trim();
  const decimal = trimmed.match(/^\d+(?:[.,](\d+))?$/);
  if (!decimal || (decimal[1]?.replace(/0+$/, '').length ?? 0) > 3) return null;
  const quantity = Number(trimmed.replace(',', '.'));
  return quantity <= 1e12 ? quantity : null;
}
type PharmacyStock = Pick<PharmacyItem, 'quantity' | 'stock_quantity' | 'stock_unit' | 'strength' | 'outside_dotation'> & PharmacyRequirementFields;

const pharmacyUnitAliases: Record<string, string> = {
  boites: 'boite', comprimes: 'comprime', gelules: 'gelule', ampoules: 'ampoule', flacons: 'flacon',
  sachets: 'sachet', unites: 'unite', doses: 'dose', tubes: 'tube', suppositoires: 'suppositoire',
  patchs: 'patch', pieces: 'piece', litres: 'litre',
};
function canonicalPharmacyUnit(value: string | null | undefined): string {
  const normalized = (value ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
  return Object.hasOwn(pharmacyUnitAliases, normalized) ? pharmacyUnitAliases[normalized] : normalized;
}
function canonicalPharmacyStrength(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, '').replace(',', '.');
}
const millilitresPerUnit = new Map([['ml', 1], ['cl', 10], ['dl', 100], ['l', 1000], ['litre', 1000]]);

function pharmacyVolumePerUnit(strength: string): number | null {
  const volume = strength.match(/^(\d+(?:\.\d+)?)(ml|cl|dl|l|litre|litres)$/);
  if (!volume || Number(volume[1]) <= 0 || !Number.isFinite(Number(volume[1]))) return null;
  return Number(volume[1]) * millilitresPerUnit.get(canonicalPharmacyUnit(volume[2]))!;
}

function legacyPharmacyStock(value: string): { count: number; kind: 'bare' | 'strength' | 'unit'; unit: string } | null {
  const trimmed = canonicalPharmacyUnit(value);
  const numeric = parsePharmacyQuantity(trimmed);
  if (numeric !== null) return { count: numeric, kind: 'bare', unit: '' };
  const strength = trimmed.match(/^(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?\s*(?:µg|μg|ug|mcg|mg|g|kg|ml|cl|dl|l|litres?|ui|iu|%))$/);
  const labelled = trimmed.match(/^(\d+(?:[.,]\d+)?)(?:\s+([a-z]+(?:[ -][a-z]+)*)|\s*(ml|cl|dl|l))$/);
  const count = parsePharmacyQuantity(strength?.[1] ?? labelled?.[1] ?? '');
  if (count === null) return null;
  if (strength) return { count, kind: 'strength', unit: canonicalPharmacyStrength(strength[2]) };
  const unit = canonicalPharmacyUnit(labelled?.[2] ?? labelled?.[3]);
  return /^(?:ug|mcg|mg|g|kg|ui|iu)$/.test(unit) ? null : { count, kind: 'unit', unit };
}

export function pharmacyItemStrength(item: PharmacyStock): string | null {
  if (item.strength) return item.strength;
  const actual = legacyPharmacyStock(item.quantity);
  if (actual?.kind !== 'strength') return null;
  return actual.unit.replace(/(\d)([a-zµμ%])/, '$1 $2');
}

const pharmacyQuantityFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 });
export function formatPharmacyStockQuantity(quantity: number, unit?: string | null): string {
  const normalizedUnit = unit?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const pluralUnit = unit && normalizedUnit && Object.hasOwn(pharmacyUnitAliases, `${normalizedUnit}s`) && quantity >= 2 ? `${unit}s` : unit;
  return [pharmacyQuantityFormat.format(quantity), pluralUnit].filter(Boolean).join(' ');
}

function hasIndependentRequirement(item: PharmacyStock): boolean {
  return Boolean(item.required_stock_unit || item.required_strength);
}

export function pharmacyQuantityLabel(item: PharmacyStock, kind: 'stock' | 'required'): string {
  const quantity = kind === 'stock' ? item.stock_quantity : item.required_stock_quantity;
  if (quantity == null) return (kind === 'stock' ? item.quantity : item.required_quantity) || '—';
  const legacy = legacyPharmacyStock(kind === 'stock' ? item.quantity : item.required_quantity);
  const unit = kind === 'stock' ? item.stock_unit : item.required_stock_unit || (!hasIndependentRequirement(item) && (!legacy || legacy.kind === 'bare') ? item.stock_unit : null);
  return formatPharmacyStockQuantity(quantity, unit || (legacy?.kind === 'unit' ? legacy.unit : null));
}

function comparablePharmacyStock(quantity: number | null | undefined, legacy: ReturnType<typeof legacyPharmacyStock>, unitValue: string | null | undefined, strengthValue: string | null | undefined) {
  const unit = canonicalPharmacyUnit(unitValue) || (legacy?.kind === 'unit' ? legacy.unit : '');
  const strength = canonicalPharmacyStrength(strengthValue) || (legacy?.kind === 'strength' ? legacy.unit : '');
  const count = quantity ?? legacy?.count ?? null;
  const factor = millilitresPerUnit.get(unit) ?? pharmacyVolumePerUnit(strength);
  return { count, unit, strength, volume: count !== null && factor !== null ? count * factor : null };
}

export function pharmacyStockStatus(item: PharmacyStock): 'low' | 'ok' | 'unknown' | 'none' {
  if (item.outside_dotation) return 'none';
  const legacyActual = legacyPharmacyStock(item.quantity);
  const legacyRequired = legacyPharmacyStock(item.required_quantity);
  const independent = hasIndependentRequirement(item);
  const inheritActual = !independent && (!legacyRequired || legacyRequired.kind === 'bare');
  const actualStock = comparablePharmacyStock(item.stock_quantity, legacyActual, item.stock_unit, item.strength);
  const requiredStock = comparablePharmacyStock(item.required_stock_quantity, legacyRequired,
    item.required_stock_unit || (inheritActual ? item.stock_unit : null),
    item.required_strength || (inheritActual ? item.strength : null));
  if (actualStock.volume !== null && requiredStock.volume !== null) {
    const tolerance = Number.EPSILON * Math.max(actualStock.volume, requiredStock.volume);
    return actualStock.volume + tolerance < requiredStock.volume ? 'low' : 'ok';
  }
  if (independent) {
    const { count: actual, unit, strength } = actualStock;
    const { count: required, unit: requiredUnit, strength: requiredStrength } = requiredStock;
    return actual === null || required === null || unit !== requiredUnit || strength !== requiredStrength ? 'unknown' : actual < required ? 'low' : 'ok';
  }
  const sameLegacyUnit = !!legacyActual && !!legacyRequired && legacyActual.kind === legacyRequired.kind && legacyActual.unit === legacyRequired.unit;
  const matchesStockUnit = (legacy: ReturnType<typeof legacyPharmacyStock>) => !!legacy && (legacy.kind === 'bare'
    || (legacy.kind === 'strength' && legacy.unit === canonicalPharmacyStrength(item.strength))
    || (legacy.kind === 'unit' && legacy.unit === canonicalPharmacyUnit(item.stock_unit)));
  const actual = item.stock_quantity ?? (sameLegacyUnit || (item.required_stock_quantity != null && matchesStockUnit(legacyActual)) ? legacyActual?.count ?? null : null);
  const required = item.required_stock_quantity ?? (sameLegacyUnit || (item.stock_quantity != null && matchesStockUnit(legacyRequired)) ? legacyRequired?.count ?? null : null);
  return actual === null || required === null ? 'unknown' : actual < required ? 'low' : 'ok';
}
