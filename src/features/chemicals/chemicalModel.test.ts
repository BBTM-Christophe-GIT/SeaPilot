import { describe, expect, it } from 'vitest';
import { attachmentMime, blankChemical, filterChemicals, stockLabel, validateChemical, type ChemicalProduct } from './chemicalModel';
import { getDefaultVisibleModules } from '../permissions/navigationPermissions';
describe('chemical inventory rules', () => {
  it.each(['admin','direction','armement','capitaine','marin'] as const)('makes the Registres submenu accessible to the real %s role fixture', (role) => {
    expect(getDefaultVisibleModules([role])).toContainEqual(expect.objectContaining({key:'chemicals',family:'Registres'}));
  });
  it('distinguishes an unknown stock from zero and accepts decimal litres', () => {
    expect(stockLabel(null)).toBe('À renseigner'); expect(stockLabel(0)).toBe('0 L'); expect(stockLabel(4.5)).toBe('4,5 L');
    expect(() => validateChemical({...blankChemical(1),product_type:'Solvant',stock_litres:4.5})).not.toThrow();
    expect(() => validateChemical({...blankChemical(1),product_type:'Solvant',stock_litres:-1})).toThrow();
    expect(() => validateChemical({...blankChemical(1),product_type:'Solvant',stock_litres:NaN})).toThrow();
  });
  it('combines vessel filtering and accent-insensitive product search', () => {
    const products = [1,2].map((id) => ({...blankChemical(id),id:String(id),product_type:'Acétone'} as ChemicalProduct));
    expect(filterChemicals(products,1,'acetone').map((p) => p.id)).toEqual(['1']);
    expect(filterChemicals(products,0,'acetone')).toHaveLength(2);
  });
  it('validates upload type, empty files and size before sending', () => {
    expect(attachmentMime({name:'FDS.PDF',type:'',size:10})).toBe('application/pdf');
    expect(() => attachmentMime({name:'x.exe',type:'',size:10})).toThrow();
    expect(() => attachmentMime({name:'x.pdf',type:'text/html',size:10})).toThrow();
    expect(() => attachmentMime({name:'x.pdf',type:'',size:21*1024*1024})).toThrow();
    expect(() => attachmentMime({name:'x.pdf',type:'',size:0})).toThrow();
  });
});
