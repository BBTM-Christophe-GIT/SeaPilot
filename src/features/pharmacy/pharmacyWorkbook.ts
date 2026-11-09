import {
  formatPharmacyItemExpiry,
  groupPharmacyItems,
  parsePharmacyQuantity,
  pharmacyDotationKey,
  pharmacyDotationLabel,
  pharmacyItemExpiryStatus,
  pharmacyItemStrength,
  pharmacyMedicalSectionLabel,
  pharmacyStockStatus,
  pharmacyToday,
  type PharmacyItem,
  type PharmacyVessel,
} from './pharmacyModel';

const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const SHEET_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const OFFICE_REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PACKAGE_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';

type CellValue = string | number | null;

const columns = [
  { title: 'Désignation', width: 44 },
  { title: 'Marque', width: 23 },
  { title: 'Lot', width: 17 },
  { title: 'Catégorie', width: 38 },
  { title: 'Branche', width: 38 },
  { title: 'Dotation médicale', width: 28 },
  { title: 'Stock à bord', width: 17 },
  { title: 'Stock dotation', width: 18 },
  { title: 'Unité de stock', width: 17 },
  { title: 'Unités par boîte', width: 19 },
  { title: 'Dosage', width: 17 },
  { title: 'Péremption', width: 22 },
  { title: 'État de la péremption', width: 23 },
  { title: 'État du stock', width: 22 },
  { title: 'Hors dotation', width: 17 },
  { title: 'Notes', width: 48 },
  { title: 'Unité de dotation', width: 20 },
  { title: 'Dosage ou volume de dotation', width: 30 },
  { title: 'Unités par boîte de dotation', width: 28 },
];

function escapeXml(value: string): string {
  const replacements: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '\t': '\t', '\n': '\n', '\r': '&#13;' };
  return value.replace(/[&<>\uFFFE\uFFFF]|\p{Cc}/gu, character => replacements[character] ?? '');
}

function cell(value: CellValue, column: number, row: number, style: number): string {
  if (value === null || value === '') return '';
  const address = `${String.fromCharCode(65 + column)}${row}`;
  if (typeof value === 'number') return `<c r="${address}" s="${style}"><v>${value}</v></c>`;
  // Preserve text such as a leading zero in a lot or an Excel formula prefix.
  return `<c r="${address}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

function expiryLabel(item: PharmacyItem, today: string): string {
  const status = pharmacyItemExpiryStatus(item, today);
  if (status === 'none' && !item.no_expiry) return 'Date non renseignée';
  return { none: 'Sans date de péremption', expired: 'Périmé', due: 'Échéance ≤ 30 j', valid: 'Date valide', unknown: 'Date à vérifier' }[status];
}

function inventoryRow(item: PharmacyItem, today: string): CellValue[] {
  const status = pharmacyStockStatus(item);
  return [
    item.designation, item.brand, item.lot_number, item.category, pharmacyMedicalSectionLabel(item.medical_section),
    pharmacyDotationLabel(item.medical_dotation),
    item.stock_quantity ?? parsePharmacyQuantity(item.quantity) ?? item.quantity,
    item.required_stock_quantity ?? parsePharmacyQuantity(item.required_quantity) ?? item.required_quantity,
    item.stock_unit ?? null, item.package_size ?? null, pharmacyItemStrength(item),
    item.no_expiry ? null : formatPharmacyItemExpiry(item), expiryLabel(item, today),
    { low: 'Stock insuffisant', ok: 'Stock suffisant', unknown: 'Stock à vérifier', none: '—' }[status],
    item.outside_dotation ? 'Oui' : 'Non', item.notes,
    item.required_stock_unit ?? null, item.required_strength ?? null, item.required_package_size ?? null,
  ];
}

const styles = `${XML}<styleSheet xmlns="${SHEET_NS}">
  <fonts count="3">
    <font><sz val="11"/><name val="Calibri"/><color rgb="FF24364B"/></font>
    <font><b/><sz val="16"/><name val="Calibri"/><color rgb="FF123C55"/></font>
    <font><b/><sz val="11"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font>
  </fonts>
  <fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF123C55"/><bgColor indexed="64"/></patternFill></fill></fills>
  <borders count="1"><border/></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="3">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

export async function buildPharmacyWorkbook(vessel: Pick<PharmacyVessel, 'id' | 'name'>, items: readonly PharmacyItem[], dotation: string, today = pharmacyToday()): Promise<{ blob: Blob; filename: string }> {
  const dotationKey = pharmacyDotationKey(dotation);
  const vesselItems = items.filter(item => item.vessel_id === vessel.id && item.active && pharmacyDotationKey(item.medical_dotation) === dotationKey);
  const orderedItems = groupPharmacyItems(vesselItems).flatMap(group => group.items);
  const headerRow = 3;
  const lastColumn = String.fromCharCode(64 + columns.length);
  const rows = [
    [`Inventaire Pharmacie · ${vessel.name}`],
    [`${pharmacyDotationLabel(dotation)} · ${orderedItems.length} article(s) · ${today}`],
    columns.map(column => column.title),
    ...orderedItems.map(item => inventoryRow(item, today)),
  ];
  const sheetData = rows.map((values, index) => {
    const row = index + 1;
    const style = row === 1 ? 1 : row === headerRow ? 2 : 0;
    const height = row === 1 ? ' ht="29" customHeight="1"' : row === headerRow ? ' ht="23" customHeight="1"' : '';
    return `<row r="${row}"${height}>${values.map((value, column) => cell(value, column, row, style)).join('')}</row>`;
  }).join('');
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`);
  zip.file('_rels/.rels', `${XML}<Relationships xmlns="${PACKAGE_REL_NS}"><Relationship Id="rId1" Type="${OFFICE_REL_NS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file('xl/workbook.xml', `${XML}<workbook xmlns="${SHEET_NS}" xmlns:r="${OFFICE_REL_NS}"><bookViews><workbookView/></bookViews><sheets><sheet name="Inventaire" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `${XML}<Relationships xmlns="${PACKAGE_REL_NS}"><Relationship Id="rId1" Type="${OFFICE_REL_NS}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${OFFICE_REL_NS}/styles" Target="styles.xml"/></Relationships>`);
  zip.file('xl/styles.xml', styles);
  zip.file('xl/worksheets/sheet1.xml', `${XML}<worksheet xmlns="${SHEET_NS}">
    <dimension ref="A1:${lastColumn}${rows.length}"/>
    <sheetViews><sheetView workbookViewId="0"><pane xSplit="1" ySplit="${headerRow}" topLeftCell="B${headerRow + 1}" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>
    <cols>${columns.map(({ width }, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('')}</cols>
    <sheetData>${sheetData}</sheetData><autoFilter ref="A${headerRow}:${lastColumn}${rows.length}"/>
    <mergeCells count="2"><mergeCell ref="A1:${lastColumn}1"/><mergeCell ref="A2:${lastColumn}2"/></mergeCells>
  </worksheet>`);
  const name = vessel.name.normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  return {
    blob: await zip.generateAsync({ type: 'blob', mimeType: MIME, compression: 'DEFLATE' }),
    filename: `inventaire-pharmacie-${name || vessel.id}-${today}.xlsx`,
  };
}
