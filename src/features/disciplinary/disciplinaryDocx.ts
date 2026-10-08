import JSZip from 'jszip';
import { frenchDate, type DisciplinaryLetter } from './disciplinaryModel';
import { disciplinaryWordBody, xmlText } from './disciplinaryWordBody';

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
function paragraph(text: string, align = 'left', bold = false, keepNext = false): string {
  const runs = text.split('\n').map((line, index) => `${index ? '<w:r><w:br/></w:r>' : ''}<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/>${bold ? '<w:b/>' : ''}</w:rPr><w:t xml:space="preserve">${xmlText(line)}</w:t></w:r>`).join('');
  return `<w:p><w:pPr><w:jc w:val="${align}"/>${keepNext ? '<w:keepNext/>' : ''}<w:spacing w:after="160" w:line="260" w:lineRule="auto"/></w:pPr>${runs}</w:p>`;
}
function signatureDrawing(width = 1828800, height = 685800): string {
  return `<w:p><w:pPr><w:jc w:val="right"/><w:keepNext w:val="0"/></w:pPr><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${width}" cy="${height}"/><wp:docPr id="901" name="Signature émetteur"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="901" name="Signature"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdDisciplinarySignature"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${width}" cy="${height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}
export async function buildDisciplinaryDocx(letter: DisciplinaryLetter, templateBytes?: ArrayBuffer): Promise<Blob> {
  if (!templateBytes) {
    const response = await fetch('/templates/disciplinary-letterhead-bbtm.docx');
    if (!response.ok) throw new Error('Le papier à en-tête BBTM ne peut pas être chargé.');
    templateBytes = await response.arrayBuffer();
  }
  const zip = await JSZip.loadAsync(templateBytes);
  const original = await zip.file('word/document.xml')?.async('string');
  if (!original) throw new Error('Le modèle Word est invalide.');
  const section = original.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/)?.[0];
  if (!section) throw new Error('La mise en page du modèle est introuvable.');
  const body = disciplinaryWordBody(letter.body);
  const relPath = 'word/_rels/document.xml.rels';
  const rels = await zip.file(relPath)!.async('string');
  zip.file(relPath, rels.replace('</Relationships>', `${body.relationships}</Relationships>`));
  if (body.numbering) {
    const numberingPath = 'word/disciplinary-numbering.xml';
    zip.file(numberingPath, `<?xml version="1.0" encoding="UTF-8"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${body.numbering}</w:numbering>`);
    const updatedRels = await zip.file(relPath)!.async('string');
    // The replaced body uses only the generated list definitions.
    zip.file(relPath, updatedRels.replace(/<Relationship\b[^>]*Type="[^"]*\/numbering"[^>]*\/>/g, '').replace('</Relationships>', '<Relationship Id="rIdDisciplinaryNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="disciplinary-numbering.xml"/></Relationships>'));
    const types = await zip.file('[Content_Types].xml')!.async('string');
    zip.file('[Content_Types].xml', types.replace('</Types>', '<Override PartName="/word/disciplinary-numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>'));
  }
  let content = paragraph(`${letter.employeeName}\n${letter.address}`, 'right')
    + paragraph(`Cherbourg-en-Cotentin, le ${frenchDate(letter.date)}`, 'right')
    + paragraph(`Objet : ${letter.subject}`, 'left', true)
    + body.xml
    + paragraph(`${letter.emitterName}\n${letter.emitterFunction}`, 'right', false, Boolean(letter.signatureDataUrl));
  if (letter.signatureDataUrl) {
    const match = letter.signatureDataUrl.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/);
    if (!match) throw new Error('La signature doit être une image PNG ou JPEG.');
    const extension = match[1] === 'jpeg' ? 'jpg' : 'png';
    zip.file(`word/media/disciplinary-signature.${extension}`, match[2], { base64: true });
    const relPath = 'word/_rels/document.xml.rels';
    const rels = await zip.file(relPath)!.async('string');
    zip.file(relPath, rels.replace('</Relationships>', `<Relationship Id="rIdDisciplinarySignature" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/disciplinary-signature.${extension}"/></Relationships>`));
    const types = await zip.file('[Content_Types].xml')!.async('string');
    if (!types.includes(`Extension="${extension}"`)) zip.file('[Content_Types].xml', types.replace('</Types>', `<Default Extension="${extension}" ContentType="image/${match[1]}"/></Types>`));
    let width = 1828800, height = 685800;
    if (typeof createImageBitmap === 'function') {
      const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: `image/${match[1]}` }));
      const scale = Math.min(width / bitmap.width, height / bitmap.height);
      width = Math.round(bitmap.width * scale); height = Math.round(bitmap.height * scale);
      bitmap.close();
    }
    content += signatureDrawing(width, height);
  }
  zip.file('word/document.xml', original.replace(/<w:body>[\s\S]*<\/w:body>/, `<w:body>${content}${section}</w:body>`));
  // Remove template authorship/history; retain the user's actual header/footer and page setup.
  zip.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xmlText(letter.subject)}</dc:title><dc:creator>${xmlText(letter.emitterName)}</dc:creator></cp:coreProperties>`);
  return zip.generateAsync({ type: 'blob', mimeType: DOCX_MIME, compression: 'DEFLATE' });
}
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url; anchor.download = fileName; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
export async function imageFileDataUrl(file: Blob): Promise<string> {
  if (!['image/png', 'image/jpeg'].includes(file.type) || !file.size || file.size > 1_048_576) throw new Error('Choisissez une signature PNG ou JPEG de moins de 1 Mo.');
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
}
