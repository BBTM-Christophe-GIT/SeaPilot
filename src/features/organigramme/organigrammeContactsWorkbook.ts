import type ZipArchive from 'jszip';
import type { OrgExportContent } from './OrgExportFields';
import { ORG_CONTACT_CONTENT, type OrgContactPerson } from './organigrammeContacts';
import { orgImageSource } from './organigrammeDiagram';

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const SHEET_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const OFFICE_REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PACKAGE_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const DRAWING_NS = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing';
const DRAWING_MAIN_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PHOTO_SIZE = 381000; // 40 px in English Metric Units.
const PHOTO_INSET = 38100;

const columns = [
  { title: 'Photo', key: 'photo', option: 'showPhotos', width: 9 },
  { title: 'Prénom NOM', key: 'name', option: null, width: 34 },
  { title: 'Fonction', key: 'functionLabel', option: 'showFunctions', width: 40 },
  { title: 'Email', key: 'email', option: 'showEmails', width: 39 },
  { title: 'Téléphone', key: 'phone', option: 'showPhones', width: 22 },
  { title: 'Navire', key: 'vesselLabel', option: 'showVessels', width: 30 },
  { title: 'Bordée', key: 'watchLabel', option: 'showWatches', width: 30 },
] as const;

const styles = `${XML}<styleSheet xmlns="${SHEET_NS}">
  <fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>
  <fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF12364B"/><bgColor indexed="64"/></patternFill></fill></fills>
  <borders count="1"><border/></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf></cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function escapeCellText(value: string): string {
  const replacements: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '\t': '\t', '\n': '\n', '\r': '&#13;' };
  // Keep literal Excel escape codes and strip characters XML 1.0 cannot represent.
  return value.replace(/_x[0-9a-f]{4}_/gi, (match) => `_x005F_${match.slice(1)}`)
    .replace(/[&<>\uFFFE\uFFFF]|\p{Cc}|\p{Cs}/gu, (character) => replacements[character] ?? '');
}

function rowXml(values: readonly string[], row: number, hasPhoto = false): string {
  const height = row === 1 ? 22 : hasPhoto ? 36 : null;
  const cells = values.map((value, column) => {
    const address = `${String.fromCharCode(65 + column)}${row}`;
    // Inline strings preserve leading zeroes and keep formula-like text inert.
    return `<c r="${address}" s="${row === 1 ? 1 : 0}" t="inlineStr"><is><t xml:space="preserve">${escapeCellText(value)}</t></is></c>`;
  }).join('');
  return `<row r="${row}"${height ? ` ht="${height}" customHeight="1"` : ''}>${cells}</row>`;
}

interface Portrait {
  row: number;
  base64: string;
  extension: 'png' | 'jpeg';
}

function addPortraits(zip: ZipArchive, portraits: readonly Portrait[]) {
  const anchors = portraits.map(({ row, base64, extension }, index) => {
    const id = index + 1;
    zip.file(`xl/media/portrait${id}.${extension}`, base64, { base64: true });
    return `<xdr:twoCellAnchor editAs="twoCell">
      <xdr:from><xdr:col>0</xdr:col><xdr:colOff>${PHOTO_INSET}</xdr:colOff><xdr:row>${row - 1}</xdr:row><xdr:rowOff>${PHOTO_INSET}</xdr:rowOff></xdr:from>
      <xdr:to><xdr:col>0</xdr:col><xdr:colOff>${PHOTO_INSET + PHOTO_SIZE}</xdr:colOff><xdr:row>${row - 1}</xdr:row><xdr:rowOff>${PHOTO_INSET + PHOTO_SIZE}</xdr:rowOff></xdr:to>
      <xdr:pic>
        <xdr:nvPicPr><xdr:cNvPr id="${id}" name="Photo ${id}"/><xdr:cNvPicPr/></xdr:nvPicPr>
        <xdr:blipFill><a:blip r:embed="rId${id}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>
        <xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${PHOTO_SIZE}" cy="${PHOTO_SIZE}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>
      </xdr:pic>
      <xdr:clientData/>
    </xdr:twoCellAnchor>`;
  });
  const imageRelationships = portraits.map(({ extension }, index) => {
    const id = index + 1;
    return `<Relationship Id="rId${id}" Type="${OFFICE_REL_NS}/image" Target="../media/portrait${id}.${extension}"/>`;
  });
  zip.file('xl/worksheets/_rels/sheet1.xml.rels', `${XML}<Relationships xmlns="${PACKAGE_REL_NS}"><Relationship Id="rId1" Type="${OFFICE_REL_NS}/drawing" Target="../drawings/drawing1.xml"/></Relationships>`);
  zip.file('xl/drawings/drawing1.xml', `${XML}<xdr:wsDr xmlns:xdr="${DRAWING_NS}" xmlns:a="${DRAWING_MAIN_NS}" xmlns:r="${OFFICE_REL_NS}">${anchors.join('')}</xdr:wsDr>`);
  zip.file('xl/drawings/_rels/drawing1.xml.rels', `${XML}<Relationships xmlns="${PACKAGE_REL_NS}">${imageRelationships.join('')}</Relationships>`);
}

export async function buildOrgPersonnelWorkbook(people: readonly OrgContactPerson[], content: OrgExportContent = ORG_CONTACT_CONTENT): Promise<Blob> {
  if (!people.length) throw new Error('Sélectionnez au moins une personne à exporter.');
  const options = { ...ORG_CONTACT_CONTENT, ...content };
  if (options.showPhotos && people.some((person) => person.photoUnavailable)) {
    throw new Error('Une photo sélectionnée est indisponible. Actualisez ou décochez Photos.');
  }
  const visibleColumns = columns.filter(({ option }) => option === null || options[option]);
  const portraits: Portrait[] = [];
  const header = rowXml(visibleColumns.map(({ title }) => title), 1);
  const body = people.map((person, index) => {
    const row = index + 2;
    const source = options.showPhotos ? orgImageSource(person.photoUrl) : '';
    if (source) {
      portraits.push({ row, extension: source.startsWith('data:image/png') ? 'png' : 'jpeg', base64: source.slice(source.indexOf(',') + 1) });
    }
    return rowXml(visibleColumns.map(({ key }) => key === 'photo' ? '' : person[key] ?? ''), row, !!source);
  }).join('');
  const range = `A1:${String.fromCharCode(64 + visibleColumns.length)}${people.length + 1}`;
  const columnWidths = visibleColumns.map(({ width }, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('');
  const hasPortraits = portraits.length > 0;

  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
    <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
    <Default Extension="xml" ContentType="application/xml"/>
    ${hasPortraits ? '<Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' : ''}
    <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
    <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
    <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  </Types>`);
  zip.file('_rels/.rels', `${XML}<Relationships xmlns="${PACKAGE_REL_NS}"><Relationship Id="rId1" Type="${OFFICE_REL_NS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file('xl/workbook.xml', `${XML}<workbook xmlns="${SHEET_NS}" xmlns:r="${OFFICE_REL_NS}"><bookViews><workbookView/></bookViews><sheets><sheet name="Liste du personnel" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `${XML}<Relationships xmlns="${PACKAGE_REL_NS}"><Relationship Id="rId1" Type="${OFFICE_REL_NS}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${OFFICE_REL_NS}/styles" Target="styles.xml"/></Relationships>`);
  zip.file('xl/styles.xml', styles);
  zip.file('xl/worksheets/sheet1.xml', `${XML}<worksheet xmlns="${SHEET_NS}" xmlns:r="${OFFICE_REL_NS}">
    <dimension ref="${range}"/>
    <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>
    <cols>${columnWidths}</cols>
    <sheetData>${header}${body}</sheetData>
    <autoFilter ref="${range}"/>
    ${hasPortraits ? '<drawing r:id="rId1"/>' : ''}
  </worksheet>`);
  if (hasPortraits) addPortraits(zip, portraits);
  return zip.generateAsync({ type: 'blob', mimeType: MIME, compression: 'DEFLATE' });
}
