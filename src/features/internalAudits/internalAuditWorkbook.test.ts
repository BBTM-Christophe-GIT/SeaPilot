// @vitest-environment node
import JSZip from 'jszip';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { describe, expect, it } from 'vitest';
import { createInternalAuditPreviewData } from './internalAuditPreview';
import type { InternalAuditReportInput } from './internalAuditReport';
import { buildInternalAuditWorkbook } from './internalAuditWorkbook';

function input(): InternalAuditReportInput {
  const data = createInternalAuditPreviewData();
  return { ...data, audit: data.audits[0], site: data.sites.find((site) => site.id === data.audits[0].siteId)! };
}
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@' });
const array = <T,>(value: T | T[] | undefined): T[] => value == null ? [] : Array.isArray(value) ? value : [value];

describe('internal audit Excel report', () => {
  it('creates three actual worksheets with complete saved evidence and a native annual chart', async () => {
    const report = input();
    report.audit.rows[0].question = 'Question <avec> & texte';
    report.audit.rows[0].observation = '=HYPERLINK("https://example.invalid")';
    const generated = await buildInternalAuditWorkbook(report);
    const zip = await JSZip.loadAsync(await generated.blob.arrayBuffer());
    expect(generated.filename).toBe('audit-ism-interne-le-rozel-2026.xlsx');
    for (const file of Object.values(zip.files).filter((item) => !item.dir && /\.xml$|\.rels$/.test(item.name))) {
      expect(XMLValidator.validate(await file.async('string')), file.name).toBe(true);
    }
    const workbook = parser.parse(await zip.file('xl/workbook.xml')!.async('string'));
    expect(workbook.workbook.sheets.sheet.map((sheet: Record<string, string>) => sheet['@name'])).toEqual(['Grille d’audit', 'Synthèse', 'Graphique']);
    const grid = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
    expect(grid).toContain('Question &lt;avec&gt; &amp; texte');
    expect(grid).toContain('=HYPERLINK(&quot;https://example.invalid&quot;)');
    expect(grid).not.toContain('<f>');
    expect(grid).toContain(report.audit.rows.at(-1)!.reference);
    expect(grid).toContain('BROUILLON');
    expect(grid).toContain('N/A');
    expect(grid).toContain('ySplit="6"');
    const summary = await zip.file('xl/worksheets/sheet2.xml')!.async('string');
    expect(summary).toContain('Capitaines LE ROZEL');
    const chart = parser.parse(await zip.file('xl/charts/chart1.xml')!.async('string'));
    const series = chart['c:chartSpace']['c:chart']['c:plotArea']['c:barChart']['c:ser'];
    expect(series.map((item: Record<string, { [key: string]: unknown }>) => item['c:tx']['c:v'])).toEqual([2025, 2026]);
    expect(zip.file('xl/drawings/_rels/drawing3.xml.rels')).not.toBeNull();
  });

  it('keeps unavailable prior scores blank, a true zero numeric, and N/A excluded', async () => {
    const report = input();
    report.audits = [];
    report.audit.rows = [{ ...report.audit.rows[0], answer: 'non_conforme' }, { ...report.audit.rows[1], answer: 'na', maxPoints: 100 }];
    const zip = await JSZip.loadAsync(await (await buildInternalAuditWorkbook(report)).blob.arrayBuffer());
    const graph = parser.parse(await zip.file('xl/worksheets/sheet3.xml')!.async('string'));
    const seventhRow = array(graph.worksheet.sheetData.row).find((row: Record<string, unknown>) => row['@r'] === '7') as { c: Record<string, unknown>[] };
    expect(seventhRow.c.find((cell) => cell['@r'] === 'B7')).not.toHaveProperty('v');
    expect(seventhRow.c.find((cell) => cell['@r'] === 'C7')).toHaveProperty('v', 0);
    const chart = parser.parse(await zip.file('xl/charts/chart1.xml')!.async('string'));
    const series = chart['c:chartSpace']['c:chart']['c:plotArea']['c:barChart']['c:ser'];
    expect(series[0]['c:val']['c:numRef']['c:numCache']).not.toHaveProperty('c:pt');
    expect(array(series[1]['c:val']['c:numRef']['c:numCache']['c:pt'])[0]).toHaveProperty('c:v', 0);
    const grid = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
    expect(grid).toContain('<c r="F9" s="0"><v>3</v></c>');
    expect(await zip.file('xl/worksheets/sheet3.xml')!.async('string')).toContain('score précédent absent');
  });

  it('embeds both finding and closure photos without expiring signed links or unrelated findings', async () => {
    const report = input();
    const photo = { id: 'photo', fileName: 'constat.png', storagePath: 'private.png', mimeType: 'image/png', sizeBytes: 70, url: 'https://private.invalid/token-secret' };
    report.findings = [{ ...report.findings[0], severity: 'remark', dueOn: null, photos: [photo] }, { ...report.findings[0], id: 'other', auditId: 'other-audit', description: 'OTHER SECRET' }];
    report.events = [{ id: 'closure', findingId: report.findings[0].id, actorId: 'actor', actorName: 'Auditeur', createdAt: '2026-10-01T12:00:00Z', status: 'closed', treatment: 'Correction vérifiée', photos: [{ ...photo, id: 'closure-photo', fileName: 'cloture.png' }] }];
    report.loadPhoto = async () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC';
    const zip = await JSZip.loadAsync(await (await buildInternalAuditWorkbook(report)).blob.arrayBuffer());
    expect(zip.file('xl/media/photo1.png')).not.toBeNull();
    expect(zip.file('xl/media/photo2.png')).not.toBeNull();
    const summary = await zip.file('xl/worksheets/sheet2.xml')!.async('string');
    expect(summary).toContain('Aucun délai · clôture facultative');
    expect(summary).toContain('Correction vérifiée');
    expect(summary).not.toContain('OTHER SECRET');
    expect(summary).not.toContain('token-secret');
    expect(await zip.file('xl/drawings/drawing2.xml')!.async('string')).toContain('cloture.png');
  });

  it('does not silently omit a photo whose authorized download failed', async () => {
    const report = input();
    report.findings[0].photos = [{ id: 'photo', fileName: 'preuve.png', storagePath: '', mimeType: 'image/png', sizeBytes: 70, url: '' }];
    report.loadPhoto = async () => null;
    await expect(buildInternalAuditWorkbook(report)).rejects.toThrow('preuve.png');
  });

  it('keeps long grid and finding text fully readable in continuation rows without duplicating points', async () => {
    const report = input();
    const question = 'Question et contrôles applicables à bord : '.repeat(250) + '\n\nFin de question.';
    const guidance = Array.from({ length: 35 }, (_, index) => `Vérification ${index + 1} : consigne et preuve documentaire.`).join('\n');
    const observation = 'Observation de l’auditeur et éléments constatés à bord. '.repeat(200);
    const description = 'Constat nécessitant une correction par le responsable désigné. '.repeat(200);
    const treatment = 'Traitement effectué et nouvelle vérification documentaire. '.repeat(200);
    report.audit.rows = [{ ...report.audit.rows[0], question, guidance, observation, maxPoints: 3, answer: 'conforme' }];
    report.findings = [{ ...report.findings[0], description, treatment, photos: [] }];
    report.events = [];
    const zip = await JSZip.loadAsync(await (await buildInternalAuditWorkbook(report)).blob.arrayBuffer());
    type XmlCell = { '@r': string; v?: number; is?: { t: string | { '#text': string } } };
    type XmlRow = { '@r': string; '@ht': string; c?: XmlCell | XmlCell[] };
    const text = (cell: XmlCell) => typeof cell.is?.t === 'string' ? cell.is.t : cell.is?.t['#text'] || '';
    const preservingParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', trimValues: false });
    const extract = (sheet: string) => array<XmlRow>(preservingParser.parse(sheet).worksheet.sheetData.row);
    const joinColumn = (rows: XmlRow[], letter: string) => rows.flatMap((row) => array(row.c)).filter((cell) => new RegExp(`^${letter}\\d+$`).test(cell['@r'])).map(text).join('');
    const grid = extract(await zip.file('xl/worksheets/sheet1.xml')!.async('string'));
    const questionRows = grid.filter((row) => Number(row['@r']) >= 7 && Number(row['@r']) < grid.length - 1);
    expect(questionRows.length).toBeGreaterThan(5);
    expect(joinColumn(questionRows, 'C')).toBe(question);
    expect(joinColumn(questionRows, 'D')).toBe(guidance);
    expect(joinColumn(questionRows, 'H')).toBe(observation);
    expect(joinColumn(questionRows, 'B')).toContain('Suite 2');
    for (const column of ['E', 'F', 'G']) {
      expect(questionRows.slice(1).flatMap((row) => array(row.c)).filter((cell) => cell['@r'].startsWith(column)).every((cell) => !cell.is && cell.v == null)).toBe(true);
    }
    const summary = extract(await zip.file('xl/worksheets/sheet2.xml')!.async('string'));
    const findingRows = summary.filter((row) => Number(row['@r']) >= 7);
    expect(joinColumn(findingRows, 'C')).toBe(description);
    expect(joinColumn(findingRows, 'G')).toBe(treatment);
    expect(findingRows.length).toBeGreaterThan(5);
    expect([...questionRows, ...findingRows].every((row) => Number(row['@ht']) >= 42 && Number(row['@ht']) <= 409)).toBe(true);
    const graph = extract(await zip.file('xl/worksheets/sheet3.xml')!.async('string'));
    expect(graph.filter((row) => Number(row['@r']) >= 7).every((row) => Number(row['@ht']) >= 25)).toBe(true);
  });
});
