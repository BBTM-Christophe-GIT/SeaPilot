// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import { buildExercisePdf } from './emergencyExercisesPdf';
import { buildExerciseReport, EXERCISE_FOOTER } from './emergencyExercisesModel';
const logo=new Uint8Array(readFileSync('public/bbtm-report-logo.png'));
const data={person:{id:6,name:'Adrien BOIS',current:true,former:false},vessel:null,year:2026};
describe('emergency exercise PDF',()=>{
  it('exports an empty individual year with the historical filename and footer',async()=>{
    const result=await buildExercisePdf(buildExerciseReport({...data,counts:[]}),logo,new Date('2026-09-22'));
    expect(result.filename).toBe('Exercices-Urgence-Adrien-BOIS-2026.pdf');
    const bytes=new Uint8Array(await result.blob.arrayBuffer());
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
    const task=getDocument({data:bytes,useSystemFonts:true});
    const pdf=await task.promise;
    const content=await (await pdf.getPage(1)).getTextContent();
    const text=content.items.map(item=>'str' in item?item.str:'').join(' ');
    expect(text).toContain(EXERCISE_FOOTER);
    expect(text).toContain("Aucun exercice d'urgence");
    expect(text).toContain('Adrien BOIS - 2026');
    await task.destroy();
  });
  it('paginates long tables with the exact footer on every page and all rows present',async()=>{
    const counts=Array.from({length:75},(_,i)=>({exercise_key:String(i),exercise_name:`Exercice numéro ${String(i+1).padStart(2,'0')}`,month:i%12+1,count:1}));
    const result=await buildExercisePdf(buildExerciseReport({...data,counts}),logo);
    const task=getDocument({data:new Uint8Array(await result.blob.arrayBuffer()),useSystemFonts:true});
    const pdf=await task.promise;
    expect(pdf.numPages).toBeGreaterThan(1); let all='';
    for(let i=1;i<=pdf.numPages;i++){
      const page=await pdf.getPage(i), content=await page.getTextContent();
      const text=content.items.map(item=>'str' in item?item.str:'').join(' ');
      expect(text).toContain(EXERCISE_FOOTER); all+=text;
    }
    for(const item of counts)expect(all).toContain(item.exercise_name);
    await task.destroy();
  });
});
