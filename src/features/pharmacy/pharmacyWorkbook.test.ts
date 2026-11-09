// @vitest-environment node
import JSZip from 'jszip';
import { expect, it } from 'vitest';
import { blankPharmacyItem, type PharmacyItem } from './pharmacyModel';
import { buildPharmacyWorkbook } from './pharmacyWorkbook';

it('exports all active articles in the selected vessel and dotation with their stock and expiry information', async () => {
  const item: PharmacyItem = {
    ...blankPharmacyItem(), id: 1, company_id: 1, vessel_id: 2, medical_dotation: 'B', medical_section: 'medicines',
    category: 'Cardiologie', designation: 'Traitement', lot_number: '00102',
    stock_quantity: 0, required_stock_quantity: 6, stock_unit: 'comprimé', package_size: 3, strength: '300 mg',
    required_stock_unit: 'comprimé', required_strength: '300 mg', required_package_size: 2,
    no_expiry: true, outside_dotation: true, notes: '=2+2 & <note>', revision: 1, source_file: '', source_sheet: '', source_row: null, updated_at: '',
  };
  const rows = [
    item,
    { ...item, id: 2, designation: 'Article importé', no_expiry: false, outside_dotation: false, expires_on: '2026-11-30', expiry_precision: 'month' as const,
      stock_quantity: null, required_stock_quantity: null, quantity: '20 × 300 mg', required_quantity: '30 × 300 mg' },
    { ...item, id: 3, designation: 'Autre navire', vessel_id: 3 },
    { ...item, id: 4, designation: 'Article archivé', active: false },
    { ...item, id: 5, designation: 'Autre dotation', medical_dotation: 'C' },
  ];
  const { blob, filename } = await buildPharmacyWorkbook({ id: 2, name: 'SUROÎT' }, rows, 'Dotation B', '2026-11-06');
  expect(filename).toBe('inventaire-pharmacie-suroit-2026-11-06.xlsx');
  expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const workbook = await JSZip.loadAsync(await blob.arrayBuffer());
  const sheet = await workbook.file('xl/worksheets/sheet1.xml')!.async('string');
  expect(sheet).toContain('Inventaire Pharmacie · SUROÎT');
  expect(sheet).toContain('Dotation B · 2 article(s)');
  expect(sheet).toContain('<autoFilter ref="A3:S5"/>');
  expect(sheet).toContain('<c r="G4" s="0"><v>0</v></c>');
  expect(sheet).toContain('<c r="H4" s="0"><v>6</v></c>');
  expect(sheet).toContain('<c r="J4" s="0"><v>3</v></c>');
  expect(sheet).toContain('<c r="S4" s="0"><v>2</v></c>');
  expect(sheet).toContain('00102');
  expect(sheet).toContain('comprimé');
  expect(sheet).toContain('300 mg');
  expect(sheet).toContain('Sans date de péremption');
  expect(sheet).toContain('Stock insuffisant');
  expect(sheet).toContain('20 × 300 mg');
  expect(sheet).toContain('11/2026');
  expect(sheet).toContain('Échéance ≤ 30 j');
  expect(sheet).toContain('Hors dotation');
  expect(sheet).toMatch(/<c r="O4"[^>]*><is><t[^>]*>Oui<\/t>/);
  expect(sheet).toMatch(/<c r="O5"[^>]*><is><t[^>]*>Non<\/t>/);
  expect(sheet).toContain('=2+2 &amp; &lt;note&gt;');
  expect(sheet).not.toMatch(/<f>|Autre navire|Article archivé|Autre dotation/);
});
