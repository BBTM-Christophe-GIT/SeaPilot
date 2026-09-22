import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChemicalFileStore } from './chemicalDrive';
import { attachmentMime, chemicalDraft, validateChemical, type ChemicalAttachment, type ChemicalDraft, type ChemicalProduct, type ChemicalVessel } from './chemicalModel';

const conflict = () => new Error('Ce produit a été modifié ou supprimé depuis un autre appareil. Actualisez avant de réessayer.');
export async function fetchChemicalWorkspace(client: SupabaseClient) {
  // PostgREST caps a response at 1,000 rows; exports must include the full register.
  async function allRows<T>(table: string, activeOnly = false): Promise<T[]> {
    const rows: T[] = [];
    for (let offset = 0; ; offset += 750) {
      let query = client.from(table).select('*').order('id').range(offset, offset + 749);
      if (activeOnly) query = query.is('deleted_at', null);
      const { data, error } = await query;
      if (error) throw error;
      rows.push(...(data || []) as T[]);
      if ((data || []).length < 750) return rows;
    }
  }
  const [vessels, products, attachments] = await Promise.all([
    client.rpc('chemical_available_vessels'),
    allRows<ChemicalProduct>('chemical_products', true),
    allRows<ChemicalAttachment>('chemical_attachments'),
  ]);
  if (vessels.error) throw vessels.error;
  products.sort((a, b) => (a.brand + a.product_type + a.variant).localeCompare(b.brand + b.product_type + b.variant, 'fr'));
  return { vessels: (vessels.data || []) as ChemicalVessel[], products, attachments };
}
export async function saveChemicalProduct(client: SupabaseClient, draft: ChemicalDraft, vessel: ChemicalVessel, existing?: ChemicalProduct) {
  validateChemical(draft);
  const values = chemicalDraft(draft);
  const query = existing
    ? client.from('chemical_products').update(values).eq('id', existing.id).eq('version', existing.version).is('deleted_at', null)
    : client.from('chemical_products').insert({ ...values, company_id: vessel.company_id });
  const { data, error } = await query.select('*').maybeSingle();
  if (error) throw error;
  if (!data) throw conflict();
  return data as ChemicalProduct;
}
export async function deleteChemicalProduct(client: SupabaseClient, product: ChemicalProduct) {
  const { data, error } = await client.from('chemical_products').update({ deleted_at: new Date().toISOString() })
    .eq('id', product.id).eq('version', product.version).is('deleted_at', null).select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw conflict();
}
export async function addChemicalAttachment(client: SupabaseClient, files: ChemicalFileStore, product: ChemicalProduct, file: File, kind: ChemicalAttachment['kind']) {
  const mime = attachmentMime(file);
  if (file.name.length > 250) throw new Error('Le nom du fichier est trop long (250 caractères maximum).');
  const id = crypto.randomUUID();
  const stored = await files.write(product, id, file);
  const { data, error } = await client.from('chemical_attachments').insert({ id, company_id: product.company_id,
    product_id: product.id, ...stored, file_name: file.name, mime_type: mime, size_bytes: file.size, kind }).select('*').single();
  // An ambiguous network response may follow a committed insert. Do not erase a potentially referenced file.
  if (error) throw new Error(`Le fichier est enregistré dans Google Drive : Produits Chimiques/${stored.drive_path}. Son référencement a échoué ; actualisez avant de réessayer. ${error.message}`);
  return data as ChemicalAttachment;
}
export async function downloadChemicalAttachment(files: ChemicalFileStore, attachment: ChemicalAttachment): Promise<Blob> {
  return files.read(attachment);
}
export async function removeChemicalAttachment(client: SupabaseClient, attachment: ChemicalAttachment) {
  const { data, error } = await client.from('chemical_attachments').delete().eq('id', attachment.id).select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Cette pièce jointe a déjà été supprimée. Actualisez la liste.');
  return 'Pièce retirée de l’inventaire. L’original est conservé dans Google Drive.';
}
