import type { SupabaseClient } from '@supabase/supabase-js';
import type { PharmacyDotationRequirement, PharmacyItem } from './pharmacyModel';

export interface PharmacyPurchaseOrderContext {
  issued_on: string;
  vessel_name: string;
  registration_number: string | null;
  imo_number: string | null;
  medical_dotation: string;
  signer_name: string;
  signer_function: string | null;
  signature_path: string;
  signature_mime_type: 'image/png' | 'image/jpeg' | 'image/webp';
  items: PharmacyItem[];
  requirements: PharmacyDotationRequirement[];
}

export async function fetchPharmacyPurchaseOrderContext(client: SupabaseClient, vesselId: number): Promise<PharmacyPurchaseOrderContext> {
  const { data, error } = await client.rpc('pharmacy_purchase_order_context', { p_vessel_id: vesselId });
  if (error) throw error;
  if (!data) throw new Error('Impossible de préparer le bon de commande pour ce navire.');
  return data;
}

export async function downloadPharmacyPurchaseOrderSignature(client: SupabaseClient, order: PharmacyPurchaseOrderContext): Promise<Uint8Array> {
  const { data, error } = await client.storage.from('working-time-signatures').download(order.signature_path);
  if (error || !data?.size) throw new Error('Impossible de lire votre signature de profil. Vérifiez-la dans votre profil, puis réessayez.');
  if (order.signature_mime_type !== 'image/webp') return new Uint8Array(await data.arrayBuffer());

  const image = await createImageBitmap(data);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Impossible de lire votre signature de profil.');
    context.drawImage(image, 0, 0);
    const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Impossible de lire votre signature de profil.'));
    }, 'image/png'));
    return new Uint8Array(await png.arrayBuffer());
  } finally {
    image.close();
  }
}
