import { describe, expect, it } from 'vitest';
import { PHARMACY_EMERGENCY_BAG_KEY, blankPharmacyItem, pharmacyDesignationKey, type PharmacyDotationRequirement, type PharmacyItem } from './pharmacyModel';
import { buildPharmacyPurchaseOrderLines } from './pharmacyPurchaseOrderLines';

const issuedOn = '2026-11-10';
const dotation = 'Dotation B';
const lot = (designation: string, fields: Partial<PharmacyItem> = {}): PharmacyItem => ({
  ...blankPharmacyItem(), id: 1, company_id: 1, vessel_id: 1, designation,
  medical_dotation: dotation, medical_section: 'medicines', source_file: '', source_sheet: '', source_row: null, revision: 1, updated_at: '',
  ...fields,
});
const requirement = (designation: string, fields: Partial<PharmacyDotationRequirement> = {}): PharmacyDotationRequirement => ({
  designation, designation_key: pharmacyDesignationKey(designation), dotation_key: 'dotation b',
  medical_section: 'medicines', required_quantity: '', dotation_requirement_revision: 1,
  ...fields,
});

describe('pharmacy purchase order', () => {
  it('keeps emergency bag stock distinct and only orders stock counted as missing', () => {
    const base = requirement('Compresse', {
      medical_section: 'equipment', catalog_code: 'E001', applicability: 'standard',
      required_stock_quantity: 4, required_stock_unit: 'paquet', required_quantity: '4', packaging: 'Paquet de 5',
    });
    const bag = { ...base, dotation_key: PHARMACY_EMERGENCY_BAG_KEY };
    const items = [lot('Compresse', { medical_section: 'equipment', stock_quantity: 4, stock_unit: 'paquet' })];
    expect(buildPharmacyPurchaseOrderLines(items, [base, bag], dotation, issuedOn)).toEqual([]);
    expect(buildPharmacyPurchaseOrderLines(items, [base, bag], dotation, issuedOn, true)).toEqual([]);
    const bagCount = lot('Compresse', { id: 2, medical_dotation: PHARMACY_EMERGENCY_BAG_KEY, medical_section: 'equipment', stock_quantity: 0 });
    expect(buildPharmacyPurchaseOrderLines([...items, bagCount], [base, bag], dotation, issuedOn, true)).toMatchObject([
      { dotation: 'Sac Médical d’Urgence', designation: 'Compresse', quantity: 4, unit: 'paquet',
        quantityNeedsReview: false, requiredQuantity: '4 paquets', presentation: 'Paquet de 5' },
    ]);
  });
  it('requires a deliberate order quantity for expired lots with a conditional reference', () => {
    const reference = requirement('Produit à vérifier', {
      catalog_code: 'M001', applicability: 'conditional', regulatory_notes: 'Présentation à vérifier',
      required_stock_quantity: 4, required_stock_unit: 'ampoule', required_quantity: '4',
    });
    const item = lot(reference.designation, { expires_on: '2024-03-10', stock_quantity: 4, stock_unit: 'ampoule', package_size: 4 });
    expect(buildPharmacyPurchaseOrderLines([item], [reference], dotation, issuedOn)).toMatchObject([
      { quantity: null, canSkipReview: true, reason: 'Périmé · référence à vérifier', remarks: 'Présentation à vérifier' },
    ]);
  });
  it('orders one box for one missing tablet or bottle even without a recorded box size', () => {
    const items = [
      lot('Comprimés', { quantity: '9 comprimés', required_quantity: '10 comprimés' }),
      lot('Flacons', { stock_quantity: 9, stock_unit: 'flacon', strength: '10 mL',
        required_stock_quantity: 10, required_stock_unit: 'flacon', required_strength: '10 mL' }),
    ];
    expect(buildPharmacyPurchaseOrderLines(items, [], dotation, issuedOn)).toMatchObject([
      { designation: 'Comprimés', quantity: 1, unit: 'boîte', reason: 'Manquant', quantityNeedsReview: false },
      { designation: 'Flacons', quantity: 1, unit: 'boîte', reason: 'Manquant', quantityNeedsReview: false },
    ]);
  });

  it('applies the presentation of a standard catalogue reference to a structured count without contradictory fields', () => {
    const reference = requirement('Produit du catalogue', {
      catalog_code: 'M001', applicability: 'standard', required_quantity: '10', required_stock_quantity: 10,
      required_stock_unit: 'comprimé', required_strength: '500 mg',
    });
    const counted = lot(reference.designation, { stock_quantity: 9 });
    expect(buildPharmacyPurchaseOrderLines([counted], [reference], dotation, issuedOn)).toMatchObject([
      { quantity: 1, unit: 'boîte', reason: 'Manquant', stockQuantity: '9 comprimés', quantityNeedsReview: false },
    ]);
    expect(buildPharmacyPurchaseOrderLines([{ ...counted, stock_quantity: 0, package_size: 4 }], [reference], dotation, issuedOn)).toMatchObject([
      { quantity: 3, unit: 'boîte', reason: 'Manquant', stockQuantity: '0 comprimé', quantityNeedsReview: false },
    ]);
    expect(buildPharmacyPurchaseOrderLines([{ ...counted, stock_quantity: 8 }], [reference], dotation, issuedOn)).toMatchObject([
      { quantity: null, unit: 'boîte', reason: 'Manquant', quantityNeedsReview: true },
    ]);
    expect(buildPharmacyPurchaseOrderLines([{ ...counted, stock_unit: 'boîte' }], [reference], dotation, issuedOn)).toMatchObject([
      { quantity: null, reason: 'Stock à vérifier', canSkipReview: true },
    ]);
    expect(buildPharmacyPurchaseOrderLines([{ ...counted, strength: '250 mg' }], [reference], dotation, issuedOn)).toMatchObject([
      { quantity: null, reason: 'Stock à vérifier', canSkipReview: true },
    ]);
  });

  it('omits uncounted catalogue stock but keeps expired lots for review', () => {
    const referenceFields = {
      catalog_code: 'M001', applicability: 'standard', required_quantity: '1', required_stock_quantity: 1,
      required_stock_unit: 'flacon', required_strength: '500 mL',
    } as const;
    const requirements = [requirement('Non compté', referenceFields), requirement('Sans fiche', referenceFields),
      requirement('Périmé', referenceFields), requirement('Compté', referenceFields)];
    const items = [lot('Non compté', { notes: 'MANQUANT' }), lot('Compté', { id: 2, stock_quantity: 0 }),
      lot('Périmé', { id: 3, expires_on: '2025-07-01' })];
    expect(buildPharmacyPurchaseOrderLines(items, requirements, dotation, issuedOn)).toMatchObject([
      { designation: 'Compté', quantity: 1, unit: 'boîte', quantityNeedsReview: false },
      { designation: 'Périmé', quantity: null, reason: 'Périmé' },
    ]);
  });

  it('converts counted boxes to the regulatory unit only at a known compatible box size', () => {
    const reference = requirement('Comprimés du catalogue', {
      catalog_code: 'M001', applicability: 'standard', required_quantity: '11', required_stock_quantity: 11,
      required_stock_unit: 'comprimé', required_strength: '500 mg',
    });
    const item = lot(reference.designation, { stock_quantity: 2, stock_unit: 'boîte', package_size: 5, strength: '500 mg' });
    expect(buildPharmacyPurchaseOrderLines([item], [reference], dotation, issuedOn)).toMatchObject([
      { quantity: 1, unit: 'boîte', reason: 'Manquant', stockQuantity: '10 comprimés', quantityNeedsReview: false },
    ]);
    for (const unresolved of [{ ...item, package_size: null }, { ...item, strength: '250 mg' }]) {
      expect(buildPharmacyPurchaseOrderLines([unresolved], [reference], dotation, issuedOn)).toMatchObject([
        { quantity: null, reason: 'Stock à vérifier', canSkipReview: true },
      ]);
    }
  });

  it('converts expired and missing equivalent volumes into the required dosage before counting boxes', () => {
    const replacement = lot('Sérum', { stock_quantity: 9, stock_unit: 'flacon', strength: '10 mL', package_size: 9, expires_on: '2026-11-09' });
    const required = { required_stock_quantity: 20, required_stock_unit: 'ampoule', required_strength: '5 mL', required_package_size: 4 };
    const expected = [{ designation: 'Sérum', requiredStrength: '5 mL', quantity: 5, unit: 'boîte', reason: 'Périmé et manquant' }];
    expect(buildPharmacyPurchaseOrderLines([{ ...replacement, ...required }], [], dotation, issuedOn)).toMatchObject(expected);
    expect(buildPharmacyPurchaseOrderLines([replacement], [requirement('Sérum', required)], dotation, issuedOn)).toMatchObject(expected);
    expect(buildPharmacyPurchaseOrderLines([{ ...replacement, ...required, expires_on: null, required_package_size: null }], [], dotation, issuedOn)).toMatchObject([
      { designation: 'Sérum', requiredStrength: '5 mL', quantity: null, unit: 'boîte', reason: 'Manquant' },
    ]);
  });

  it('uses the required dosage even if the expired presentation differs, and omits an unstated dosage', () => {
    const items = [
      lot('Ancien dosage', { expires_on: '2026-11-09', stock_quantity: 1, stock_unit: 'flacon', strength: '10 mL',
        required_stock_quantity: 1, required_stock_unit: 'flacon', required_strength: '5 mL' }),
      lot('Dosage importé', { quantity: '1 × 500 mg', required_quantity: '2 × 500 mg' }),
      lot('Dosage non requis', { expires_on: '2026-11-09', stock_quantity: 1, stock_unit: 'ampoule', strength: '20 mg' }),
    ];
    const requirements = [requirement('Dosage commun', { required_stock_quantity: 1, required_stock_unit: 'comprimé', required_strength: '250 mg' })];
    const lines = buildPharmacyPurchaseOrderLines(items, requirements, dotation, issuedOn);
    expect(lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ designation: 'Ancien dosage', requiredStrength: '5 mL' }),
      expect.objectContaining({ designation: 'Dosage importé', requiredStrength: '500 mg' }),
      expect.objectContaining({ designation: 'Dosage commun', requiredStrength: '250 mg' }),
      expect.objectContaining({ designation: 'Dosage non requis', requiredStrength: '' }),
    ]));
  });

  it('uses the recorded unit for unpackaged quantities and fills an expired untyped stock unit from the requirement', () => {
    const items = [
      lot('Solution mesurée', { stock_quantity: 4, stock_unit: 'mL', required_stock_quantity: 7, required_stock_unit: 'mL' }),
      lot('Gants', { medical_section: 'equipment', quantity: '2', required_stock_quantity: 2, required_stock_unit: 'paire', expires_on: '2026-11-09' }),
      lot('Comprimés périmés', { medical_section: 'equipment', stock_quantity: 4, required_stock_unit: 'comprimé', required_package_size: 10, expires_on: '2026-11-09' }),
    ];
    const requirements = [requirement('Tubulure', { medical_section: 'equipment', required_stock_quantity: 2, required_stock_unit: 'mètre' })];
    expect(buildPharmacyPurchaseOrderLines(items, requirements, dotation, issuedOn)).toMatchObject([
      { designation: 'Comprimés périmés', quantity: 1, unit: 'boîte' },
      { designation: 'Gants', quantity: 2, unit: 'paire' },
      { designation: 'Solution mesurée', quantity: 3, unit: 'mL' },
      { designation: 'Tubulure', quantity: 2, unit: 'mètre' },
    ]);
  });

  it('rounds up the combined replacement and shortage once, and ignores other dotations and inactive or upcoming articles', () => {
    const items = [
      lot('Comprimés', { stock_quantity: 10, required_stock_quantity: 11, stock_unit: 'comprimé',
        package_size: 5, expires_on: '2026-11-09' }),
      lot('Autre dotation', { medical_dotation: 'Dotation C', expires_on: '2026-11-09' }),
      lot('Archivé', { active: false, expires_on: '2026-11-09' }),
      lot('Expire aujourd’hui', { expires_on: issuedOn }),
      lot('Sans péremption', { expires_on: '2026-11-09', no_expiry: true }),
    ];
    expect(buildPharmacyPurchaseOrderLines(items, [], dotation, issuedOn)).toMatchObject([
      { designation: 'Comprimés', quantity: 3, unit: 'boîte', packaging: '5 comprimés par boîte', reason: 'Périmé et manquant' },
    ]);
  });

  it('counts a shared target once across lots and includes absent requirements', () => {
    const items = [
      lot('Comprimés', { stock_quantity: 4, stock_unit: 'comprimé', package_size: 5, expires_on: '2026-11-09' }),
      lot('Comprimés', { id: 2, stock_quantity: 4, stock_unit: 'comprimé', package_size: 5 }),
      lot('Absent', { active: false, stock_quantity: 99 }),
      lot('Pansement', { medical_section: 'equipment', quantity: '0', required_quantity: '2', stock_unit: 'pièce' }),
    ];
    const requirements = [
      requirement('Comprimés', { required_stock_quantity: 10, required_stock_unit: 'comprimé' }),
      requirement('Absent', { required_stock_quantity: 1, required_stock_unit: 'flacon' }),
      requirement('Facultatif', { required_stock_quantity: 0, required_stock_unit: 'flacon' }),
      requirement('Autre dotation', { dotation_key: 'dotation c', required_stock_quantity: 1, required_stock_unit: 'flacon' }),
    ];
    expect(buildPharmacyPurchaseOrderLines(items, requirements, dotation, issuedOn)).toMatchObject([
      { designation: 'Absent', quantity: 1, unit: 'boîte', reason: 'Manquant' },
      { designation: 'Comprimés', quantity: 2, unit: 'boîte', reason: 'Périmé et manquant' },
      { designation: 'Pansement', quantity: 2, unit: 'pièce', reason: 'Manquant' },
    ]);
  });

  it('leaves unknown packaging or stock explicit instead of inventing quantities', () => {
    const items = [
      lot('Boîtes', { quantity: '1 boîte', required_quantity: '3 boîtes' }),
      lot('Inconnu', { expires_on: '2026-11-09', quantity: 'conditionnement indéterminé' }),
      lot('Sans taille', { quantity: '2 comprimés', required_quantity: '12 comprimés' }),
    ];
    const requirements = [requirement('Absent sans taille', { required_quantity: '4 x 5' })];
    expect(buildPharmacyPurchaseOrderLines(items, requirements, dotation, issuedOn)).toMatchObject([
      { designation: 'Absent sans taille', quantity: null, quantityNeedsReview: true, reason: 'Manquant' },
      { designation: 'Boîtes', quantity: 2, quantityNeedsReview: false, reason: 'Manquant' },
      { designation: 'Inconnu', quantity: null, quantityNeedsReview: true, reason: 'Périmé' },
      { designation: 'Sans taille', quantity: null, quantityNeedsReview: true, reason: 'Manquant' },
    ]);
  });

  it('preserves documented box sizes in imported stock and surfaces explicit contradictory missing notes', () => {
    const items = [
      lot('Gants', { medical_section: 'equipment', expires_on: '2025-07-01', quantity: '2X100', required_quantity: '1X100',
        notes: 'boîte de 100' }),
      lot('Gel antiseptique', { medical_section: 'equipment', expires_on: '2025-07-01', quantity: '2X30ML', required_quantity: '75ML' }),
      lot('Pansement', { medical_section: 'equipment', quantity: '1', required_quantity: '2 Boîtes', notes: '1 BOITE (2 TAILLES)' }),
      lot('Agrafeuse', { medical_section: 'equipment', quantity: '1', required_quantity: '1', notes: 'MANQUANT' }),
      lot('Stock importé non renseigné', { medical_section: 'equipment', required_quantity: '1', notes: 'OK' }),
    ];
    expect(buildPharmacyPurchaseOrderLines(items, [], dotation, issuedOn)).toMatchObject([
      { designation: 'Agrafeuse', quantity: null, reason: 'Stock à vérifier', canExclude: true },
      { designation: 'Gants', quantity: 2, unit: 'boîte', packaging: '100 unités par boîte', reason: 'Périmé' },
      { designation: 'Gel antiseptique', quantity: null, unit: 'boîte', reason: 'Périmé et manquant' },
      { designation: 'Pansement', quantity: 1, unit: 'boîte', reason: 'Manquant' },
    ]);
  });

  it('lets the emitter verify incompatible stock against a configured shared target when the other lots are insufficient', () => {
    const items = [
      lot('Solution', { stock_quantity: 9, stock_unit: 'ampoule', strength: '5 mg' }),
      lot('Solution', { id: 2, stock_quantity: 5, stock_unit: 'ampoule', strength: '10 mg', package_size: 5 }),
    ];
    const requirements = [requirement('Solution', { required_stock_quantity: 10, required_stock_unit: 'ampoule', required_strength: '10 mg' })];
    expect(buildPharmacyPurchaseOrderLines(items, requirements, dotation, issuedOn)).toMatchObject([
      { designation: 'Solution', quantity: null, reason: 'Stock à vérifier', canExclude: true },
    ]);
    expect(buildPharmacyPurchaseOrderLines([items[0], { ...items[1], stock_quantity: 10 }], requirements, dotation, issuedOn)).toEqual([]);
  });
});
