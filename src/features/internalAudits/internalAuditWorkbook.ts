import { internalAuditReportData, resolveInternalAuditReportPhoto, type InternalAuditReportInput } from './internalAuditReport';
import {
  AUDIT_ANSWER_LABELS, AUDIT_STATUS_LABELS, FINDING_SEVERITY_LABELS, FINDING_STATUS_LABELS,
  compareAuditScores, type AuditPhoto,
} from './internalAuditModel';

const SHEETS = ['Grille d’audit', 'Synthèse', 'Graphique'];
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
type Cell = string | number | null;
type TableRow = { values: Cell[]; style?: number; height?: number; merge?: boolean };
const GRID_WIDTHS = [26, 12, 64, 76, 18, 10, 10, 55];
const SUMMARY_WIDTHS = [13, 27, 65, 32, 26, 20, 55, 80];
const GRAPH_WIDTHS = [42, 16, 16, 25, 4];

/** Conservative Calibri wrapping estimates keep rows readable without Excel autofit. */
function textLines(value: string, width: number): string[] {
  const capacity = Math.max(7, Math.floor(width * 0.82));
  const result: string[] = [];
  for (const naturalLine of value.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g) || []) {
    if (!naturalLine) continue;
    let remaining = naturalLine;
    while (remaining.length > capacity) {
      // Preserve every character, including the whitespace at a soft wrap.
      const delimiter = remaining.search(/[\r\n]/);
      if (delimiter >= 0 && delimiter <= capacity) break;
      const space = remaining.lastIndexOf(' ', capacity - 1);
      const boundary = space >= Math.floor(capacity / 2) ? space + 1 : capacity;
      result.push(remaining.slice(0, boundary));
      remaining = remaining.slice(boundary);
    }
    if (remaining) result.push(remaining);
  }
  return result.length ? result : [''];
}

function textChunks(value: string, width: number): string[] {
  const lines = textLines(value, width);
  const result: string[] = [];
  for (let offset = 0; offset < lines.length; offset += 14) result.push(lines.slice(offset, offset + 14).join(''));
  return result;
}

function readableHeight(values: Cell[], widths: number[], minimum = 24): number {
  const lines = Math.max(1, ...values.map((value, index) => typeof value === 'string' ? textLines(value, widths[index] || 12).length : 1));
  return Math.min(409, Math.max(minimum, lines * 15 + 10));
}

/** Each saved question/finding has one main row; extra text continues below it. */
function continuationRows(values: Cell[], widths: number[], referenceColumn: number, firstOnly: number[], minimum: number): TableRow[] {
  const chunks = values.map((value, index) => typeof value === 'string' ? textChunks(value, widths[index]) : [value]);
  return Array.from({ length: Math.max(...chunks.map((parts) => parts.length)) }, (_, rowIndex) => {
    const rowValues: Cell[] = chunks.map((parts, index) => rowIndex > 0 && firstOnly.includes(index) ? null : parts[rowIndex] ?? null);
    if (rowIndex > 0) rowValues[referenceColumn] = `${values[referenceColumn] || '-'} · Suite ${rowIndex + 1}`;
    return { values: rowValues, height: readableHeight(rowValues, widths, minimum) };
  });
}

function escapeXml(value: string): string {
  // XML 1.0 forbids these control characters, including pasted spreadsheet input.
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!);
}
function column(index: number): string {
  let result = '';
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) result = String.fromCharCode(65 + (value - 1) % 26) + result;
  return result;
}
function cellXml(value: Cell, address: string, style = 0): string {
  if (value == null) return `<c r="${address}" s="${style}"/>`;
  if (typeof value === 'number') return `<c r="${address}" s="${style}"><v>${value}</v></c>`;
  // Inline strings keep user-entered text (including =,+,-,@) inert in Excel.
  return `<c r="${address}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}
function relationships(items: { id: string; type: string; target: string }[]): string {
  return `${XML}<Relationships xmlns="${PKG_REL}">${items.map((item) => `<Relationship Id="${item.id}" Type="${REL}/${item.type}" Target="${escapeXml(item.target)}"/>`).join('')}</Relationships>`;
}
function worksheet(rows: TableRow[], widths: number[], drawing = false, filter = false): string {
  const lastColumn = column(widths.length - 1);
  const mergedRows = [1, ...rows.flatMap((row, index) => row.merge && index > 0 ? [index + 1] : [])];
  return `${XML}<worksheet xmlns="${MAIN}" xmlns:r="${REL}"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${lastColumn}${Math.max(rows.length, drawing ? 36 : 1)}"/><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="6" topLeftCell="A7" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="24"/><cols>${widths.map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`).join('')}</cols><sheetData>${rows.map((row, i) => `<row r="${i + 1}" ht="${row.height || readableHeight(row.values, row.merge || i === 0 ? [widths.reduce((sum, width) => sum + width, 0)] : widths)}" customHeight="1">${row.values.map((value, j) => cellXml(value, `${column(j)}${i + 1}`, row.style)).join('')}</row>`).join('')}</sheetData>${filter && rows.length > 6 ? `<autoFilter ref="A6:${lastColumn}${rows.length}"/>` : ''}<mergeCells count="${mergedRows.length}">${mergedRows.map((row) => `<mergeCell ref="A${row}:${lastColumn}${row}"/>`).join('')}</mergeCells><printOptions horizontalCentered="1"/><pageMargins left="0.25" right="0.25" top="0.4" bottom="0.4" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>${drawing ? '<drawing r:id="rId1"/>' : ''}</worksheet>`;
}
const STYLES = `${XML}<styleSheet xmlns="${MAIN}"><fonts count="3"><font><sz val="10"/><color rgb="FF24364B"/><name val="Calibri"/></font><font><b/><sz val="16"/><color rgb="FF123C55"/><name val="Calibri"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF123C55"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border/><border><bottom style="hair"><color rgb="FFDDE5EC"/></bottom></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="2" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

function metadata(input: InternalAuditReportInput, title: string): TableRow[] {
  return [
    { values: [`${title} · ${input.site.name} · ${input.audit.year}`], style: 1, height: 32 },
    { values: ['Statut', AUDIT_STATUS_LABELS[input.audit.status], 'Réalisation', input.audit.performedOn || 'Non réalisé'] },
    { values: ['Auditeur', input.audit.auditorName, 'Date prévue', input.audit.plannedOn] },
    { values: ['Grille', input.audit.templateName, 'Version', input.audit.templateVersion] },
    { values: [input.audit.status === 'completed' ? 'Rapport de l’audit réalisé' : 'BROUILLON · audit non finalisé'] },
  ];
}
function chartXml(input: InternalAuditReportInput): string {
  const comparison = compareAuditScores(input.audit, input.audits);
  const data = [{ section: 'Score global', current: comparison.current.percentage, previous: comparison.previous?.percentage ?? null }, ...comparison.sections];
  const range = (col: string) => `'Graphique'!$${col}$7:$${col}$${6 + data.length}`;
  const series = (year: number, key: 'current' | 'previous', col: string, index: number, color: string) => `<c:ser><c:idx val="${index}"/><c:order val="${index}"/><c:tx><c:v>${year}</c:v></c:tx><c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></c:spPr><c:cat><c:strRef><c:f>${range('A')}</c:f><c:strCache><c:ptCount val="${data.length}"/>${data.map((item, i) => `<c:pt idx="${i}"><c:v>${escapeXml(item.section)}</c:v></c:pt>`).join('')}</c:strCache></c:strRef></c:cat><c:val><c:numRef><c:f>${range(col)}</c:f><c:numCache><c:formatCode>0.0</c:formatCode><c:ptCount val="${data.length}"/>${data.map((item, i) => item[key] == null ? '' : `<c:pt idx="${i}"><c:v>${item[key]}</c:v></c:pt>`).join('')}</c:numCache></c:numRef></c:val></c:ser>`;
  return `${XML}<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><c:lang val="fr-FR"/><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Évolution du score de conformité (%)</a:t></a:r></a:p></c:rich></c:tx></c:title><c:plotArea><c:layout/><c:barChart><c:barDir val="bar"/><c:grouping val="clustered"/>${series(input.audit.year - 1, 'previous', 'B', 0, 'B8C7D5')}${series(input.audit.year, 'current', 'C', 1, '187D99')}<c:gapWidth val="75"/><c:overlap val="0"/><c:axId val="1"/><c:axId val="2"/></c:barChart><c:catAx><c:axId val="1"/><c:scaling><c:orientation val="maxMin"/></c:scaling><c:axPos val="l"/><c:tickLblPos val="nextTo"/><c:crossAx val="2"/><c:crosses val="max"/></c:catAx><c:valAx><c:axId val="2"/><c:scaling><c:orientation val="minMax"/><c:max val="100"/><c:min val="0"/></c:scaling><c:axPos val="b"/><c:majorGridlines/><c:numFmt formatCode="0&quot;%&quot;" sourceLinked="0"/><c:tickLblPos val="nextTo"/><c:crossAx val="1"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx></c:plotArea><c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`;
}
function chartDrawing(): string {
  return `${XML}<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><xdr:twoCellAnchor><xdr:from><xdr:col>5</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>5</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>15</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>34</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="1" name="Comparaison annuelle"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="${REL}" r:id="rId1"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>`;
}
type Evidence = { photo: AuditPhoto; label: string };
function evidenceRows(input: InternalAuditReportInput): Evidence[] {
  const findings = input.findings.filter((finding) => finding.auditId === input.audit.id && finding.companyId === input.audit.companyId);
  return findings.flatMap((finding) => [
    ...(finding.photos ?? []).map((photo) => ({ photo, label: `${finding.reference} · Constat · ${photo.fileName}` })),
    ...input.events.filter((event) => event.findingId === finding.id).flatMap((event) => (event.photos ?? []).map((photo) => ({ photo, label: `${finding.reference} · ${FINDING_STATUS_LABELS[event.status]} · ${event.createdAt} · ${photo.fileName}` }))),
  ]);
}

/** A portable report: actual three worksheets, native Excel chart, embedded photographic evidence. */
export async function buildInternalAuditWorkbook(input: InternalAuditReportInput): Promise<{ blob: Blob; filename: string }> {
  internalAuditReportData(input);
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const comparison = compareAuditScores(input.audit, input.audits);
  const findings = input.findings.filter((finding) => finding.auditId === input.audit.id && finding.companyId === input.audit.companyId);
  const grid: TableRow[] = [
    ...metadata(input, 'Grille d’audit'),
    { values: ['Chapitre ISM', 'Référence', 'Question', 'Éléments à vérifier', 'Réponse', 'Barème', 'Points', 'Observations'], style: 2, height: 40 },
    ...input.audit.rows.flatMap((row) => continuationRows([
      row.section, row.reference, row.question, row.guidance,
      row.answer ? AUDIT_ANSWER_LABELS[row.answer] : 'Sans réponse', row.maxPoints,
      row.answer === 'na' || row.answer == null ? null : row.answer === 'conforme' ? row.maxPoints : row.answer === 'incomplet' ? row.maxPoints / 2 : 0,
      row.observation,
    ], GRID_WIDTHS, 1, [4, 5, 6], 42)),
    { values: ['Total applicable (hors N/A)', null, null, null, null, comparison.current.maxPoints, comparison.current.earnedPoints] },
    { values: ['Score (%)', comparison.current.percentage] },
  ];
  const summary: TableRow[] = [
    ...metadata(input, 'Synthèse'),
    { values: ['Référence', 'Type d’écart', 'Constat', 'Responsable', 'Échéance de traitement', 'Statut', 'Dernier traitement', 'Historique'], style: 2, height: 55 },
    ...findings.flatMap((finding) => continuationRows([
      finding.reference, FINDING_SEVERITY_LABELS[finding.severity], finding.description, finding.assigneeLabel,
      finding.dueOn || 'Aucun délai · clôture facultative', FINDING_STATUS_LABELS[finding.status], finding.treatment,
      input.events.filter((event) => event.findingId === finding.id).map((event) => `${event.createdAt} · ${event.actorName} · ${FINDING_STATUS_LABELS[event.status]} : ${event.treatment}`).join('\n'),
    ], SUMMARY_WIDTHS, 0, [1, 4, 5], 72)),
  ];
  if (!findings.length) summary.push({ values: ['Aucun écart émis pour cet audit.'] });
  const graph: TableRow[] = [...metadata(input, 'Graphique'), { values: ['Chapitre / score', input.audit.year - 1, input.audit.year, 'Évolution (points de %)'], style: 2, height: 30 }, { values: ['Score global', comparison.previous?.percentage ?? null, comparison.current.percentage, comparison.delta] }, ...comparison.sections.map((item) => ({ values: [item.section, item.previous, item.current, item.delta] })), { values: [comparison.previousAudit ? `Comparaison avec l’audit réalisé ${input.audit.year - 1}.` : `Aucun audit réalisé en ${input.audit.year - 1} · score précédent absent.`] }, { values: ['N/A exclus du barème. Cellule vide = score indisponible.'] }];
  const evidence = evidenceRows(input);
  const images: { bytes: string; extension: string; row: number; label: string; width: number; height: number }[] = [];
  const imageReader = evidence.length ? new (await import('jspdf')).jsPDF() : null;
  for (const item of evidence) {
    const dataUrl = await resolveInternalAuditReportPhoto(input, item.photo);
    const match = dataUrl?.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=\r\n]+)$/);
    if (!match) throw new Error(`La photo « ${item.photo.fileName} » ne peut pas être intégrée au rapport. Réessayez après rechargement.`);
    let dimensions: { width: number; height: number };
    try { dimensions = imageReader!.getImageProperties(dataUrl); }
    catch { throw new Error(`La photo « ${item.photo.fileName} » est illisible. Le rapport n’a pas été téléchargé.`); }
    const scale = Math.min(2743200 / dimensions.width, 1828800 / dimensions.height);
    summary.push({ values: [item.label], merge: true });
    const firstRow = summary.length;
    summary.push(...Array.from({ length: 7 }, () => ({ values: [], height: 24 })));
    images.push({ bytes: match[2], extension: match[1] === 'jpeg' ? 'jpg' : 'png', row: firstRow, label: item.label, width: Math.round(dimensions.width * scale), height: Math.round(dimensions.height * scale) });
  }
  zip.file('_rels/.rels', relationships([{ id: 'rId1', type: 'officeDocument', target: 'xl/workbook.xml' }]));
  zip.file('xl/workbook.xml', `${XML}<workbook xmlns="${MAIN}" xmlns:r="${REL}"><bookViews><workbookView/></bookViews><sheets>${SHEETS.map((name, i) => `<sheet name="${name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', relationships([...SHEETS.map((_, i) => ({ id: `rId${i + 1}`, type: 'worksheet', target: `worksheets/sheet${i + 1}.xml` })), { id: 'rId4', type: 'styles', target: 'styles.xml' }]));
  zip.file('xl/styles.xml', STYLES);
  zip.file('xl/worksheets/sheet1.xml', worksheet(grid, GRID_WIDTHS, false, true));
  zip.file('xl/worksheets/sheet2.xml', worksheet(summary, SUMMARY_WIDTHS, images.length > 0));
  zip.file('xl/worksheets/sheet3.xml', worksheet(graph, GRAPH_WIDTHS, true));
  zip.file('xl/worksheets/_rels/sheet3.xml.rels', relationships([{ id: 'rId1', type: 'drawing', target: '../drawings/drawing3.xml' }]));
  zip.file('xl/drawings/drawing3.xml', chartDrawing());
  zip.file('xl/drawings/_rels/drawing3.xml.rels', relationships([{ id: 'rId1', type: 'chart', target: '../charts/chart1.xml' }]));
  zip.file('xl/charts/chart1.xml', chartXml(input));
  if (images.length) {
    zip.file('xl/worksheets/_rels/sheet2.xml.rels', relationships([{ id: 'rId1', type: 'drawing', target: '../drawings/drawing2.xml' }]));
    zip.file('xl/drawings/drawing2.xml', `${XML}<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${images.map((item, i) => `<xdr:oneCellAnchor><xdr:from><xdr:col>2</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${item.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="${item.width}" cy="${item.height}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${i + 1}" name="Photo ${i + 1}" descr="${escapeXml(item.label)}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip xmlns:r="${REL}" r:embed="rId${i + 1}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`).join('')}</xdr:wsDr>`);
    zip.file('xl/drawings/_rels/drawing2.xml.rels', relationships(images.map((item, i) => ({ id: `rId${i + 1}`, type: 'image', target: `../media/photo${i + 1}.${item.extension}` }))));
    images.forEach((item, i) => zip.file(`xl/media/photo${i + 1}.${item.extension}`, item.bytes, { base64: true }));
  }
  zip.file('[Content_Types].xml', `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${SHEETS.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/drawings/drawing3.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>${images.length ? '<Override PartName="/xl/drawings/drawing2.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' : ''}<Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>`);
  const name = input.site.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  return { blob: await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', compression: 'DEFLATE' }), filename: `audit-ism-interne-${name}-${input.audit.year}.xlsx` };
}

export async function downloadInternalAuditWorkbook(input: InternalAuditReportInput): Promise<void> {
  const report = await buildInternalAuditWorkbook(input);
  const url = URL.createObjectURL(report.blob);
  const link = document.createElement('a');
  link.href = url; link.download = report.filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
