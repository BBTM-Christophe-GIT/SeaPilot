// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PDFDocument, PDFDict, PDFName } from 'pdf-lib';
import { describe, expect, it, vi } from 'vitest';
import { buildChemicalPdf, type ChemicalPdfInput } from './chemicalPdf';
import { blankChemical, type ChemicalProduct } from './chemicalModel';
const logo = new Uint8Array(readFileSync('public/bbtm-service-note-logo.png'));
function input(): ChemicalPdfInput {
  return { vessel:{id:1,company_id:1,name:'TEST',acronym:'T',icon_url:null},
    products:[{...blankChemical(1),id:'p1',company_id:1,product_type:'Acétone',stock_litres:4.5,pictograms:['GHS02'],version:1,updated_at:'',source_ref:null},
      {...blankChemical(2),id:'p2',company_id:1,product_type:'Other vessel',version:1,updated_at:'',source_ref:null}] as ChemicalProduct[],
    attachments:[{id:'a1',product_id:'p1',company_id:1,file_name:'FDS.pdf',mime_type:'application/pdf',size_bytes:1,kind:'fds',drive_path:'test',sha256:'a'.repeat(64),created_at:''},
      {id:'a2',product_id:'p2',company_id:1,file_name:'other.pdf',mime_type:'application/pdf',size_bytes:1,kind:'fds',drive_path:'other',sha256:'a'.repeat(64),created_at:''}],
    logo,pictograms:new Map([['GHS02',new Uint8Array(readFileSync('public/ghs/GHS02.png'))]]),includeAttachments:false,loadAttachment:vi.fn(),
    issuedAt:new Date('2026-09-22T12:00:00Z') };
}
describe('chemical PDF assembly', () => {
  it('generates inventory alone without downloading attachments', async () => {
    const data = input(), result = await buildChemicalPdf(data);
    expect(data.loadAttachment).not.toHaveBeenCalled();
    const pdf = await PDFDocument.load(await result.blob.arrayBuffer());
    expect(pdf.getPageCount()).toBe(2);
    expect(result.filename).toBe('BBTM-Produits-Chimiques-TEST.pdf');
  });
  it('merges only the selected vessel attachments and embeds other formats', async () => {
    const data = input(); data.includeAttachments=true;
    const fds = await PDFDocument.create(); fds.addPage();
    const bytes = await fds.save(); data.loadAttachment=vi.fn(async (a) => a.mime_type === 'application/pdf' ? bytes : new TextEncoder().encode('FDS texte'));
    data.attachments.push({...data.attachments[0],id:'a3',file_name:'FDS.txt',mime_type:'text/plain'});
    const result = await buildChemicalPdf(data), pdf = await PDFDocument.load(await result.blob.arrayBuffer());
    expect(data.loadAttachment).toHaveBeenCalledTimes(2);
    expect(data.loadAttachment).not.toHaveBeenCalledWith(expect.objectContaining({id:'a2'}));
    expect(pdf.getPageCount()).toBe(5);
    expect(pdf.catalog.lookup(PDFName.of('Names'), PDFDict).get(PDFName.of('EmbeddedFiles'))).toBeDefined();
  });
  it('stops an incomplete dossier when an attachment cannot be read', async () => {
    const data=input(); data.includeAttachments=true; data.loadAttachment=vi.fn(async () => {throw new Error('Missing');});
    await expect(buildChemicalPdf(data)).rejects.toThrow('FDS.pdf');
  });
});
