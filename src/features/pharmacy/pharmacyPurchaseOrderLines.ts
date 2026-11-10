import {
  formatPharmacyStockQuantity, parsePharmacyQuantity, pharmacyDesignationKey, pharmacyDotationKey, pharmacyItemExpiryStatus,
  pharmacyMedicalSection, pharmacyStockDetails, type PharmacyDotationRequirement, type PharmacyItem,
} from './pharmacyModel';

export interface PharmacyPurchaseOrderLine {
  designation: string;
  brand: string;
  strength: string;
  packaging: string;
  reason: string;
  quantity: number | null;
  unit: string;
  quantityNeedsReview: boolean;
  canExclude?: boolean;
}

type StockMeasure = ReturnType<typeof pharmacyStockDetails>['stock'];
type OrderNeed = Pick<PharmacyPurchaseOrderLine, 'designation' | 'brand' | 'strength'> & {
  section: PharmacyItem['medical_section'];
  stockUnit: string;
  unitsPerBox: number | null;
  volumeContainer?: boolean;
  amount: number | null;
  expired: boolean;
  missing: boolean;
  uncertainStock?: boolean;
};
type MeasuredLot = {
  details: ReturnType<typeof pharmacyStockDetails>;
  need: Omit<OrderNeed, 'amount' | 'expired' | 'missing' | 'uncertainStock'>;
  expired: boolean;
  available: number | null;
};

const packedStockUnits = new Set(['comprime', 'flacon', 'gelule', 'ampoule', 'dose', 'sachet', 'suppositoire', 'tube', 'patch']);
const displayUnits: Record<string, string> = { boite: 'boîte', comprime: 'comprimé', gelule: 'gélule', unite: 'unité', piece: 'pièce', ml: 'mL', cl: 'cL', dl: 'dL', l: 'L' };

function requirementKey(section: string | undefined, designation: string) {
  return JSON.stringify([pharmacyMedicalSection(section), designation]);
}

function itemNeed(item: PharmacyItem, measure: StockMeasure, unitsPerBox: number | null | undefined) {
  return {
    designation: item.designation.trim(),
    brand: item.brand.trim(),
    strength: item.strength?.trim() || readableStrength(measure.strength),
    section: item.medical_section,
    stockUnit: measure.unit,
    unitsPerBox: unitsPerBox ?? null,
    volumeContainer: !measure.unit && measure.volumePerUnit !== null,
  };
}

function readableStrength(value: string): string {
  return value.replace(/(\d)([a-zµμ%])/, '$1 $2');
}

function ceilQuantity(quantity: number): number {
  return Math.max(1, Math.ceil(quantity - Number.EPSILON * quantity));
}

function orderLine(need: OrderNeed): PharmacyPurchaseOrderLine {
  const { designation, brand, strength, amount, unitsPerBox, stockUnit, expired, missing, uncertainStock } = need;
  const alreadyBoxes = stockUnit === 'boite';
  const orderBoxes = alreadyBoxes || unitsPerBox !== null || packedStockUnits.has(stockUnit) || need.section === 'medicines' || need.volumeContainer;
  const baseUnit = Object.hasOwn(displayUnits, stockUnit) ? displayUnits[stockUnit] : stockUnit || 'unité';
  const unit = orderBoxes ? 'boîte' : baseUnit;
  const packaging = unitsPerBox && !alreadyBoxes ? `${formatPharmacyStockQuantity(unitsPerBox, baseUnit)} par boîte` : '';
  const quantity = amount === null ? null
    : alreadyBoxes ? ceilQuantity(amount)
    : unitsPerBox ? ceilQuantity(amount / unitsPerBox)
    : orderBoxes ? amount <= 1 ? 1 : null
    : amount;
  const reason = uncertainStock ? 'Stock à vérifier' : expired && missing ? 'Périmé et manquant' : expired ? 'Périmé' : 'Manquant';
  return { designation, brand, strength, packaging, reason, quantity, unit, quantityNeedsReview: quantity === null,
    ...(uncertainStock ? { canExclude: true } : {}) };
}

function compareInTargetUnits(details: ReturnType<typeof pharmacyStockDetails>): number | null {
  const { stock, target, comparison } = details;
  if (!comparison) return stock.count === 0 ? 0 : null;
  return comparison.volume ? comparison.actual / target.volumePerUnit! : comparison.actual;
}

function itemBoxSize(item: PharmacyItem, stock: StockMeasure, target: StockMeasure) {
  return item.package_size ?? (stock.unit === target.unit && stock.strength === target.strength ? item.required_package_size : null);
}

function legacyPack(value: string) {
  const match = value.trim().match(/^(\d{1,6})\s*[x×]\s*(\d{1,6})$/i);
  return match ? { boxes: Number(match[1]), size: Number(match[2]) } : null;
}

// A legacy product count is a box count only when the imported notes document its packaging.
function withDocumentedLegacyPackaging(item: PharmacyItem): PharmacyItem {
  if (item.stock_quantity != null || item.stock_unit) return item;
  const note = pharmacyDesignationKey(item.notes);
  const pack = legacyPack(item.quantity);
  const documentedSize = Number(note.match(/^boite de (\d+)\b/)?.[1]);
  if (pack?.size && pack.size === documentedSize) {
    const target = legacyPack(item.required_quantity);
    return { ...item, stock_quantity: pack.boxes * pack.size, stock_unit: 'unité', package_size: item.package_size ?? pack.size,
      ...(target && item.required_stock_quantity == null ? {
        required_stock_quantity: target.boxes * target.size, required_stock_unit: 'unité',
      } : {}) };
  }
  const documentedBoxes = Number(note.match(/^(\d+) boite(?:s)?\b/)?.[1]);
  const bareStock = parsePharmacyQuantity(item.quantity);
  return bareStock !== null && documentedBoxes === bareStock
    ? { ...item, stock_quantity: bareStock, stock_unit: 'boîte' } : item;
}

export function buildPharmacyPurchaseOrderLines(
  items: readonly PharmacyItem[],
  requirements: readonly PharmacyDotationRequirement[],
  medicalDotation: string,
  issuedOn: string,
): PharmacyPurchaseOrderLine[] {
  const dotation = pharmacyDotationKey(medicalDotation);
  const shared = new Map(requirements.filter((entry) => entry.dotation_key === dotation)
    .map((entry) => [requirementKey(entry.medical_section, entry.designation_key), entry]));
  const activeByRequirement = new Map<string, MeasuredLot[]>();
  const needs = new Map<string, OrderNeed>();
  const add = (need: OrderNeed) => {
    if (need.amount !== null && need.amount <= 0) return;
    const key = JSON.stringify([need.section, pharmacyDesignationKey(need.designation), pharmacyDesignationKey(need.brand),
      need.strength.toLowerCase().replace(/\s+/g, ''), need.stockUnit, need.unitsPerBox, Boolean(need.uncertainStock), Boolean(need.volumeContainer)]);
    const current = needs.get(key);
    if (!current) { needs.set(key, need); return; }
    current.amount = current.amount === null || need.amount === null ? null : current.amount + need.amount;
    current.expired ||= need.expired;
    current.missing ||= need.missing;
  };
  const addUncertain = (need: MeasuredLot['need']) => {
    add({ ...need, amount: null, expired: false, missing: false, uncertainStock: true });
  };
  for (const item of items) {
    if (!item.active || pharmacyDotationKey(item.medical_dotation) !== dotation) continue;
    const key = requirementKey(item.medical_section, pharmacyDesignationKey(item.designation));
    const requirement = !item.outside_dotation ? shared.get(key) : undefined;
    const stockItem = withDocumentedLegacyPackaging(requirement ? { ...item, ...requirement } : item);
    const details = pharmacyStockDetails(stockItem);
    const unitsPerBox = itemBoxSize(stockItem, details.stock, details.target);
    const need = itemNeed(item, details.stock, unitsPerBox);
    const expired = pharmacyItemExpiryStatus(item, issuedOn) === 'expired';
    if (expired) add({ ...need, amount: details.stock.count, expired: true, missing: false });
    if (item.outside_dotation) continue;

    const actual = compareInTargetUnits(details);
    if (requirement) {
      const group = activeByRequirement.get(key) ?? [];
      group.push({ details, need, expired, available: actual });
      activeByRequirement.set(key, group);
    }
    // Some imported rows say MANQUANT despite a non-zero quantity. A current counted stock takes precedence.
    const conflictingNote = item.stock_quantity == null && /^manquant(?:e|s|es)?$/.test(pharmacyDesignationKey(item.notes));
    if (conflictingNote && (actual === null || details.target.count === null || actual >= details.target.count)) addUncertain(need);
    if (requirement) continue;

    const required = details.target.count;
    if (actual === null || required === null || actual + Number.EPSILON * required >= required) continue;
    const amount = required - actual;
    if (!details.comparison) {
      // Zero stock can prove a shortage even when no matching presentation is recorded.
      add({ ...itemNeed({ ...item, strength: item.required_strength }, details.target, item.required_package_size),
        amount, expired: false, missing: true });
      continue;
    }
    const factor = details.comparison.volume ? details.target.volumePerUnit! / details.stock.volumePerUnit! : 1;
    add({ ...need, amount: amount * factor, expired: false, missing: true });
  }

  for (const [key, requirement] of shared) {
    const measured = activeByRequirement.get(key) ?? [];
    const sharedTarget = pharmacyStockDetails({ quantity: '', ...requirement }).target;
    const target = sharedTarget.count === null
      ? measured.find(({ details }) => details.target.count !== null)?.details.target ?? sharedTarget
      : sharedTarget;
    if (target.count === 0 || (target.count === null && !requirement.required_quantity.trim())) continue;
    const presentations = new Set(measured.filter(({ available }) => available !== null && available !== 0)
      .map(({ details }) => JSON.stringify([details.target.unit, details.target.strength, details.target.count])));
    const actual = measured.reduce((total, { available }) => total + (available ?? 0), 0);
    if (presentations.size <= 1 && target.count !== null && actual + Number.EPSILON * target.count >= target.count) continue;
    const amount = target.count === null ? null : target.count - actual;
    const targetNeed = { designation: requirement.designation, brand: measured[0]?.need.brand ?? '',
      strength: requirement.required_strength?.trim() || readableStrength(target.strength),
      section: requirement.medical_section, stockUnit: target.unit, unitsPerBox: requirement.required_package_size ?? null,
      volumeContainer: !target.unit && target.volumePerUnit !== null };

    if ((target.count === null && measured.length > 0) || presentations.size > 1 || measured.some(({ available }) => available === null)) {
      const configured = requirement.required_stock_quantity != null || requirement.required_stock_unit
        || requirement.required_strength || requirement.required_package_size;
      if (configured) addUncertain(targetNeed);
      continue;
    }

    // An expired lot of the same presentation can absorb the shortage before rounding to boxes.
    const candidate = measured.find(({ expired, details }) => details.comparison && expired)
      ?? measured.find(({ details }) => details.comparison);
    if (candidate) {
      const { need, details } = candidate;
      const factor = details.comparison?.volume ? details.target.volumePerUnit! / details.stock.volumePerUnit! : 1;
      add({ ...need, amount: amount === null ? null : amount * factor, expired: false, missing: true });
    } else {
      add({ ...targetNeed, amount, expired: false, missing: true });
    }
  }

  return [...needs.values()].map(orderLine)
    .sort((a, b) => a.designation.localeCompare(b.designation, 'fr', { numeric: true, sensitivity: 'base' }));
}
