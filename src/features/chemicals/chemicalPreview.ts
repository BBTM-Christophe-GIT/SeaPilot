import type { SupabaseClient } from '@supabase/supabase-js';
import { blankChemical, type ChemicalVessel } from './chemicalModel';
import type { ChemicalFileStore } from './chemicalDrive';
// Fictional fixtures only: never bundle the customer's source inventory into the public preview.
export function createChemicalPreviewClient(): SupabaseClient {
  const vessels: ChemicalVessel[] = [{ id: 90001, company_id: 1, name: 'NAVIRE DÉMONSTRATION', acronym: 'DEMO', icon_url: null }, { id: 90002, company_id: 1, name: 'NAVIRE EXEMPLE', acronym: 'EX', icon_url: null }];
  type Row = Record<string, unknown>;
  const products: Row[] = [{ ...blankChemical(90001), id: 'demo-product', company_id: 1, brand: 'DÉMONSTRATION', product_type: 'Produit exemple', variant: 'Référence à compléter', usage: 'Exemple de registre', stock_litres: 12.5, pictograms: ['GHS07'], notes: 'Données fictives pour démonstration.', version: 1, deleted_at: null, updated_at: new Date().toISOString() }];
  const attachments: Row[] = [];
  const tables: Record<string, Row[]> = { chemical_products: products, chemical_attachments: attachments };
  return {
    rpc: async (name: string) => ({ data: name === 'chemical_available_vessels' ? vessels : null, error: null }),
    from: (table: string) => {
      const predicates: ((row: Row) => boolean)[] = [];
      let action = 'read', values: Row = {}, single = false, from = 0, to = Infinity;
      const chain = {
        select: () => chain, order: () => chain,
        range: (start: number, end: number) => { from=start; to=end; return chain; },
        eq: (key: string,value: unknown) => { predicates.push((row) => row[key] === value); return chain; },
        is: (key: string,value: unknown) => { predicates.push((row) => (row[key] ?? null) === value); return chain; },
        insert: (row: Row) => { action='insert'; values=row; return chain; },
        update: (row: Row) => { action='update'; values=row; return chain; },
        delete: () => { action='delete'; return chain; },
        maybeSingle: () => { single=true; return chain; }, single: () => { single=true; return chain; },
        then: (resolve: (result: unknown) => void) => {
          const rows = tables[table] || [];
          let matched = rows.filter((row) => predicates.every((predicate) => predicate(row)));
          if (action === 'insert') {
            const row = { id:crypto.randomUUID(),version:1,deleted_at:null,updated_at:new Date().toISOString(),created_at:new Date().toISOString(),...values }; rows.push(row); matched=[row];
          } else if (action === 'update') matched.forEach((row) => Object.assign(row,values,{version:Number(row.version)+1,updated_at:new Date().toISOString()}));
          else if (action === 'delete') matched.forEach((row) => rows.splice(rows.indexOf(row),1));
          return Promise.resolve({data:structuredClone(single ? matched[0] || null : matched.slice(from, to + 1)),error:null}).then(resolve);
        },
      };
      return chain;
    },
  } as unknown as SupabaseClient;
}
export function createChemicalPreviewFiles(): ChemicalFileStore {
  const files = new Map<string, Blob>();
  return {
    connect: async () => {},
    write: async (product, id, file) => {
      const path = `DEMO/${product.id}/${id}-${file.name}`;
      files.set(path,file);
      return {drive_path:path,sha256:'a'.repeat(64)};
    },
    read: async (attachment) => {
      const file = files.get(attachment.drive_path);
      if (!file) throw new Error('Fichier de démonstration indisponible.');
      return file;
    },
  };
}
