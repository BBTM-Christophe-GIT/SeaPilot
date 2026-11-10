import { describe, expect, it } from 'vitest';
import { blankPharmacyItem, pharmacyDesignationKey, type PharmacyDotationRequirement, type PharmacyItem } from './pharmacyModel';
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
  it('orders one box for one missing tablet or bottle even without a recorded box size', () => {
    const items = [
      lot('Comprimés', { quantity: '9 comprimés', required_quantity: '10 comprimés' }),
      lot('Flacons', { stock_quantity: 9, stock_unit: 'flacon', strength: '10 mL',
        required_stock_quantity: 20, required_stock_unit: 'ampoule', required_strength: '5 mL' }),
    ];
    expect(buildPharmacyPurchaseOrderLines(items, [], dotation, issuedOn)).toMatchObject([
      { designation: 'Comprimés', quantity: 1, unit: 'boîte', reason: 'Manquant', quantityNeedsReview: false },
      { designation: 'Flacons', quantity: 1, unit: 'boîte', reason: 'Manquant', quantityNeedsReview: false },
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
