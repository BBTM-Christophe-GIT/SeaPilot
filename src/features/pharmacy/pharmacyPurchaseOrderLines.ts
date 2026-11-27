import {
  PHARMACY_EMERGENCY_BAG_KEY, formatPharmacyItemExpiry, formatPharmacyStockQuantity, parsePharmacyQuantity,
  pharmacyDesignationKey, pharmacyDotationKey, pharmacyDotationLabel, pharmacyItemExpiryStatus, pharmacyItemStrength,
  pharmacyMedicalSection, pharmacyQuantityLabel, pharmacyStockDetails, type PharmacyDotationRequirement, type PharmacyItem,
} from './pharmacyModel';

export interface PharmacyPurchaseOrderLine {
  designation: string;
  brand: string;
  strength: string;
  requiredStrength: string;
  packaging: string;
  reason: string;
  quantity: number | null;
  unit: string;
  quantityNeedsReview: boolean;
  canExclude?: boolean;
  canSkipReview?: boolean;
  section?: PharmacyItem['medical_section'];
  dotation?: string;
  category?: string;
  administrationRoute?: string;
  presentation?: string;
  requiredQuantity?: string;
  stockQuantity?: string;
  expiry?: string;
  classification?: string;
  remarks?: string;
}

type StockMeasure = ReturnType<typeof pharmacyStockDetails>['stock'];
type OrderNeed = Pick<PharmacyPurchaseOrderLine, 'designation' | 'brand' | 'strength' | 'requiredStrength' | 'category' | 'administrationRoute' | 'presentation' | 'requiredQuantity' | 'stockQuantity' | 'expiry' | 'classification' | 'remarks'> & {
  section: PharmacyItem['medical_section'];
  stockUnit: string;
  unitLabel?: string | null;
  unitsPerBox: number | null;
  lotId?: number;
  volumeContainer?: boolean;
  amount: number | null;
  expired: boolean;
  missing: boolean;
  uncertainStock?: boolean;
  canSkipReview?: boolean;
};
type MeasuredLot = {
  details: ReturnType<typeof pharmacyStockDetails>;
  need: Omit<OrderNeed, 'amount' | 'expired' | 'missing' | 'uncertainStock'>;
  expired: boolean;
  available: number | null;
  orderInTargetUnits: boolean;
};

const packedStockUnits = new Set(['comprime', 'flacon', 'gelule', 'ampoule', 'dose', 'sachet', 'suppositoire', 'tube', 'patch']);
const displayUnits: Record<string, string> = { boite: 'boîte', comprime: 'comprimé', gelule: 'gélule', unite: 'unité', piece: 'pièce', ml: 'mL', cl: 'cL', dl: 'dL', l: 'L' };

function requirementKey(section: string | undefined, designation: string) {
  return JSON.stringify([pharmacyMedicalSection(section), designation]);
}

function requiredOrderStrength(requirement: Pick<PharmacyItem, 'required_quantity' | 'required_strength'>) {
  return pharmacyItemStrength({ quantity: requirement.required_quantity, required_quantity: '', strength: requirement.required_strength?.trim() }) ?? '';
}

function requirementMetadata(requirement: PharmacyDotationRequirement | undefined) {
  if (!requirement?.catalog_code) return {};
  return {
    category: requirement.category || undefined,
    administrationRoute: requirement.administration_route || undefined,
    presentation: requirement.packaging || undefined,
    requiredQuantity: requirement.required_stock_quantity == null ? requirement.required_quantity
      : formatPharmacyStockQuantity(requirement.required_stock_quantity, requirement.required_stock_unit),
    classification: requirement.classification || undefined,
    remarks: requirement.regulatory_notes || undefined,
  };
}

function itemNeed(item: PharmacyItem, measure: StockMeasure, unitsPerBox: number | null | undefined, requiredStrength: string, unitLabel: string | null | undefined) {
  return {
    designation: item.designation.trim(),
    brand: item.brand.trim(),
    strength: item.strength?.trim() || readableStrength(measure.strength),
    requiredStrength,
    section: item.medical_section,
    category: item.category || undefined,
    requiredQuantity: item.outside_dotation ? undefined : pharmacyQuantityLabel(item, 'required'),
    lotId: item.id,
    stockQuantity: [pharmacyQuantityLabel(item, 'stock'), item.stock_packaging].filter(Boolean).join(' · '),
    expiry: item.expires_on ? formatPharmacyItemExpiry(item) : undefined,
    stockUnit: measure.unit,
    unitLabel,
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
  const { designation, brand, strength, requiredStrength, amount, unitsPerBox, stockUnit, expired, missing, uncertainStock } = need;
  const alreadyBoxes = stockUnit === 'boite';
  const orderBoxes = alreadyBoxes || unitsPerBox !== null || packedStockUnits.has(stockUnit) || (!stockUnit && (need.section === 'medicines' || need.volumeContainer));
  const baseUnit = Object.hasOwn(displayUnits, stockUnit) ? displayUnits[stockUnit] : need.unitLabel?.trim() || stockUnit || 'unité';
  const unit = orderBoxes ? 'boîte' : baseUnit;
  const packaging = unitsPerBox && !alreadyBoxes ? `${formatPharmacyStockQuantity(unitsPerBox, baseUnit)} par boîte` : '';
  const quantity = amount === null ? null
    : alreadyBoxes ? ceilQuantity(amount)
    : unitsPerBox ? ceilQuantity(amount / unitsPerBox)
    : orderBoxes ? amount <= 1 ? 1 : null
    : amount;
  const reason = uncertainStock ? expired ? 'Périmé · référence à vérifier' : 'Stock à vérifier' : expired && missing ? 'Périmé et manquant' : expired ? 'Périmé' : 'Manquant';
  const { section, category, administrationRoute, presentation, requiredQuantity, stockQuantity, expiry, classification, remarks } = need;
  return { designation, brand, strength, requiredStrength, packaging: presentation || packaging, reason, quantity, unit,
    quantityNeedsReview: quantity === null, section, category, administrationRoute, presentation, requiredQuantity,
    stockQuantity, expiry, classification, remarks, ...(uncertainStock ? { canExclude: true } : {}),
    ...(need.canSkipReview ? { canSkipReview: true } : {}) };
}

function compareInTargetUnits(details: ReturnType<typeof pharmacyStockDetails>): number | null {
  const { stock, target, comparison } = details;
  if (!comparison) return stock.count === 0 ? 0 : null;
  return comparison.volume ? comparison.actual / target.volumePerUnit! : comparison.actual;
}

function expiryReplacementAmount(stock: StockMeasure, target: StockMeasure, orderInTargetUnits: boolean): number | null {
  if (!orderInTargetUnits || !stock.count) return stock.count;
  // The PDF orders the required dose, so a comparable liquid must be converted before box rounding.
  if (stock.volumePerUnit === null || target.volumePerUnit === null) return null;
  return stock.count * stock.volumePerUnit / target.volumePerUnit;
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

function measureOrderStock(item: PharmacyItem, requirement: PharmacyDotationRequirement | undefined) {
  const recorded = withDocumentedLegacyPackaging(requirement ? { ...item, ...requirement } : item);
  const details = pharmacyStockDetails(recorded);
  const { stock, target, comparison } = details;
  if (!requirement?.catalog_code || requirement.applicability !== 'standard' || item.stock_quantity == null || !target.unit) {
    return { stockItem: recorded, details };
  }

  const compatibleStrength = !stock.strength || stock.strength === target.strength;
  const countedInBoxes = stock.unit === 'boite' && target.unit !== 'boite';
  const countableUnit = packedStockUnits.has(target.unit) || ['unite', 'piece', 'paire', 'unidose', 'lyophilisat', 'ovule'].includes(target.unit);
  const unitsPerBox = countedInBoxes && countableUnit ? recorded.package_size : null;
  if (countedInBoxes && (!unitsPerBox || !compatibleStrength)) {
    return { stockItem: recorded, details: { ...details, stock: { ...stock, volumePerUnit: null }, comparison: null } };
  }
  if (!countedInBoxes && (comparison || (stock.unit && stock.unit !== target.unit) || !compatibleStrength)) {
    return { stockItem: recorded, details };
  }

  // A structured count for a catalogue article uses its reference presentation unless an alternative is recorded.
  const stockItem = {
    ...recorded,
    stock_quantity: unitsPerBox ? item.stock_quantity * unitsPerBox : item.stock_quantity,
    stock_unit: unitsPerBox || !stock.unit ? requirement.required_stock_unit : recorded.stock_unit,
    strength: stock.strength ? recorded.strength : requirement.required_strength,
  };
  return { stockItem, details: pharmacyStockDetails(stockItem) };
}

export function buildPharmacyPurchaseOrderLines(
  items: readonly PharmacyItem[],
  requirements: readonly PharmacyDotationRequirement[],
  medicalDotation: string,
  issuedOn: string,
  medicalEmergencyBag = false,
): PharmacyPurchaseOrderLine[] {
  const dotation = pharmacyDotationKey(medicalDotation);
  const shared = new Map(requirements.filter((entry) => entry.dotation_key === dotation)
    .map((entry) => [requirementKey(entry.medical_section, entry.designation_key), entry]));
  const activeByRequirement = new Map<string, MeasuredLot[]>();
  const needs = new Map<string, OrderNeed>();
  const add = (need: OrderNeed) => {
    if (need.amount !== null && need.amount <= 0) return;
    const key = JSON.stringify([need.section, pharmacyDesignationKey(need.designation), pharmacyDesignationKey(need.brand),
      need.strength.toLowerCase().replace(/\s+/g, ''), need.requiredStrength.toLowerCase().replace(/\s+/g, ''),
      need.stockUnit, need.unitsPerBox, Boolean(need.uncertainStock), Boolean(need.volumeContainer)]);
    const current = needs.get(key);
    if (!current) { needs.set(key, need); return; }
    current.amount = current.amount === null || need.amount === null ? null : current.amount + need.amount;
    current.expired ||= need.expired;
    current.missing ||= need.missing;
    if (current.lotId !== need.lotId) {
      current.lotId = undefined;
      current.stockQuantity = 'Plusieurs lots';
      current.expiry = undefined;
    }
  };
  const addUncertain = (need: MeasuredLot['need'], canSkipReview = false, expired = false) => {
    add({ ...need, amount: null, expired, missing: false, uncertainStock: true, canSkipReview });
  };
  for (const item of items) {
    if (!item.active || pharmacyDotationKey(item.medical_dotation) !== dotation) continue;
    const key = requirementKey(item.medical_section, pharmacyDesignationKey(item.designation));
    const requirement = !item.outside_dotation ? shared.get(key) : undefined;
    const { stockItem, details } = measureOrderStock(item, requirement);
    const requiredStrength = item.outside_dotation ? '' : requiredOrderStrength(stockItem);
    const { stock, target } = details;
    const canUseTargetUnit = !stock.unit && stock.volumePerUnit === null && (!stock.strength || stock.strength === target.strength);
    const orderStock = canUseTargetUnit ? { ...stock, unit: target.unit } : stock;
    const orderInTargetUnits = Boolean(requiredStrength && stock.strength !== target.strength && (stock.strength || stock.volumePerUnit !== null));
    const stockNeed = orderInTargetUnits
      ? itemNeed({ ...item, strength: requiredStrength }, target, stockItem.required_package_size, requiredStrength, stockItem.required_stock_unit)
      : itemNeed(stockItem, orderStock, itemBoxSize(stockItem, orderStock, target), requiredStrength, canUseTargetUnit ? stockItem.required_stock_unit : stockItem.stock_unit);
    const need = { ...stockNeed, ...requirementMetadata(requirement) };
    const expired = pharmacyItemExpiryStatus(item, issuedOn) === 'expired';
    const reviewReference = Boolean(requirement?.catalog_code && requirement.applicability !== 'standard');
    if (expired) {
      if (reviewReference) addUncertain(need, true, true);
      else add({ ...need, amount: expiryReplacementAmount(stock, target, orderInTargetUnits), expired: true, missing: false });
    }
    if (item.outside_dotation || requirement?.applicability === 'not_applicable') continue;

    const actual = compareInTargetUnits(details);
    if (requirement) {
      const group = activeByRequirement.get(key) ?? [];
      group.push({ details, need, expired, available: actual, orderInTargetUnits });
      activeByRequirement.set(key, group);
    }
    // Some imported rows say MANQUANT despite a non-zero quantity. A current counted stock takes precedence.
    const conflictingNote = item.stock_quantity == null && /^manquant(?:e|s|es)?$/.test(pharmacyDesignationKey(item.notes));
    if (conflictingNote && (!requirement?.catalog_code || stock.count !== null)
      && (actual === null || details.target.count === null || actual >= details.target.count)) addUncertain(need);
    if (requirement) continue;

    const required = details.target.count;
    if (actual === null || required === null || actual + Number.EPSILON * required >= required) continue;
    const amount = required - actual;
    if (!details.comparison) {
      // Zero stock can prove a shortage even when no matching presentation is recorded.
      add({ ...itemNeed({ ...item, strength: item.required_strength }, target, item.required_package_size, requiredStrength, item.required_stock_unit),
        amount, expired: false, missing: true });
      continue;
    }
    const factor = details.comparison.volume && !orderInTargetUnits ? target.volumePerUnit! / stock.volumePerUnit! : 1;
    add({ ...need, amount: amount * factor, expired: false, missing: true });
  }

  for (const [key, requirement] of shared) {
    const measured = activeByRequirement.get(key) ?? [];
    if (requirement.applicability === 'not_applicable') continue;
    // The catalogue also includes every reference whose stock has yet to be counted.
    if (requirement.catalog_code && !measured.some(({ details }) => details.stock.count !== null)) continue;
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
    const requiredStrength = requiredOrderStrength(requirement);
    const targetNeed = { designation: requirement.designation, brand: measured[0]?.need.brand ?? '',
      strength: requiredStrength, requiredStrength,
      section: requirement.medical_section, stockUnit: target.unit, unitLabel: requirement.required_stock_unit, unitsPerBox: requirement.required_package_size ?? null,
      volumeContainer: !target.unit && target.volumePerUnit !== null,
      ...requirementMetadata(requirement),
      ...(requirement.catalog_code && measured.length ? {
        stockQuantity: measured.every(({ available }) => available !== null)
          ? formatPharmacyStockQuantity(actual, requirement.required_stock_unit) : 'À vérifier',
        expiry: measured.length === 1 ? measured[0].need.expiry : undefined,
      } : {}),
    };
    if (requirement.catalog_code && (requirement.applicability !== 'standard' || target.count === null)) {
      if (!measured.some(({ expired }) => expired && requirement.applicability !== 'standard')) addUncertain(targetNeed, true);
      continue;
    }

    if ((target.count === null && measured.length > 0) || presentations.size > 1 || measured.some(({ available }) => available === null)) {
      const configured = requirement.required_stock_quantity != null || requirement.required_stock_unit
        || requirement.required_strength || requirement.required_package_size;
      if (configured) addUncertain(targetNeed, Boolean(requirement.catalog_code));
      continue;
    }

    // An expired lot of the same presentation can absorb the shortage before rounding to boxes.
    const candidate = measured.find(({ expired, details }) => details.comparison && expired)
      ?? measured.find(({ details }) => details.comparison);
    if (candidate) {
      const { need, details, orderInTargetUnits } = candidate;
      const factor = details.comparison?.volume && !orderInTargetUnits ? details.target.volumePerUnit! / details.stock.volumePerUnit! : 1;
      add({ ...need, amount: amount === null ? null : amount * factor, expired: false, missing: true });
    } else {
      add({ ...targetNeed, amount, expired: false, missing: true });
    }
  }

  const lines = [...needs.values()].map(orderLine)
    .sort((a, b) => a.designation.localeCompare(b.designation, 'fr', { numeric: true, sensitivity: 'base' }));
  if (medicalEmergencyBag && dotation !== PHARMACY_EMERGENCY_BAG_KEY) {
    lines.push(...buildPharmacyPurchaseOrderLines(items, requirements, PHARMACY_EMERGENCY_BAG_KEY, issuedOn)
      .map((line) => ({ ...line, dotation: pharmacyDotationLabel(PHARMACY_EMERGENCY_BAG_KEY) })));
  }
  return lines;
}
