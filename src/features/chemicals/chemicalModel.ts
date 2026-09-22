export const PICTOGRAMS = [
  { code: 'GHS01', label: 'Explosif' }, { code: 'GHS02', label: 'Inflammable' },
  { code: 'GHS03', label: 'Comburant' }, { code: 'GHS04', label: 'Gaz sous pression' },
  { code: 'GHS05', label: 'Corrosif' }, { code: 'GHS06', label: 'Toxicité aiguë' },
  { code: 'GHS07', label: 'Nocif / irritant' }, { code: 'GHS08', label: 'Danger grave pour la santé' },
  { code: 'GHS09', label: 'Dangereux pour l’environnement' },
] as const;
export type PictogramCode = (typeof PICTOGRAMS)[number]['code'];
export interface ChemicalVessel { id: number; company_id: number; name: string; acronym: string; icon_url: string | null }
export interface ChemicalDraft {
  vessel_id: number; brand: string; product_type: string; variant: string;
  storage_compatibility: string; usage: string; pictograms: PictogramCode[];
  hazards: string; precautions: string; ppe: string; stock_litres: number | null;
  storage_location: string; notes: string;
}
export interface ChemicalProduct extends ChemicalDraft {
  id: string; company_id: number; version: number; updated_at: string; source_ref: string | null;
}
export interface ChemicalAttachment {
  id: string; product_id: string; company_id: number; drive_path: string; sha256: string;
  file_name: string; mime_type: string; size_bytes: number; kind: 'fds' | 'other'; created_at: string;
}
export function blankChemical(vesselId = 0): ChemicalDraft {
  return { vessel_id: vesselId, brand: '', product_type: '', variant: '', storage_compatibility: '', usage: '',
    pictograms: [], hazards: '', precautions: '', ppe: '', stock_litres: null, storage_location: '', notes: '' };
}
export function chemicalDraft(product: ChemicalDraft): ChemicalDraft {
  return Object.fromEntries(Object.keys(blankChemical()).map((key) => [key, product[key as keyof ChemicalDraft]])) as unknown as ChemicalDraft;
}
export function productLabel(product: Pick<ChemicalDraft, 'brand' | 'product_type'>) {
  return [product.brand, product.product_type].filter(Boolean).join(' ');
}
export function stockLabel(value: number | null) {
  return value === null ? 'À renseigner' : `${value.toLocaleString('fr-FR', { maximumFractionDigits: 3 })} L`;
}
export function filterChemicals(items: ChemicalProduct[], vesselId: number, search: string) {
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const query = normalize(search.trim());
  return items.filter((item) => (!vesselId || item.vessel_id === vesselId)
    && normalize([item.brand, item.product_type, item.variant, item.usage, item.storage_location, item.hazards].join(' ')).includes(query));
}
export function validateChemical(draft: ChemicalDraft) {
  if (!draft.vessel_id || !draft.product_type.trim()) throw new Error('Sélectionnez un navire et renseignez le type / produit.');
  if (draft.stock_litres !== null && (!Number.isFinite(draft.stock_litres) || draft.stock_litres < 0 || draft.stock_litres > 999999999))
    throw new Error('Le stock doit être un nombre positif ou nul.');
  if (draft.pictograms.some((code) => !PICTOGRAMS.some((p) => p.code === code))) throw new Error('Pictogramme inconnu.');
}
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export function attachmentMime(file: Pick<File, 'name' | 'type' | 'size'>) {
  if (!file.size || file.size > MAX_ATTACHMENT_BYTES) throw new Error('Choisissez un fichier non vide de 20 Mo maximum.');
  const types: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', txt: 'text/plain' };
  const expected = types[file.name.split('.').at(-1)?.toLowerCase() || ''];
  if (!expected || (file.type && file.type !== expected && file.type !== 'application/octet-stream'))
    throw new Error('Formats acceptés : PDF, PNG, JPEG, Word, Excel et texte.');
  return expected;
}
export function saveChemicalBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
