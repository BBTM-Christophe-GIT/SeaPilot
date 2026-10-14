import type { SupabaseClient } from '@supabase/supabase-js';
import { connectLocalDrive, localDriveRequest, supportsLocalDriveVersion } from '../documents/localDriveLauncher';
import { hasDocumentBlobFile } from '../documents/documentBlobStorage';
import { attachmentMime, type ChemicalAttachment, type ChemicalProduct } from './chemicalModel';

export interface ChemicalFileStore {
  connect: () => Promise<void>;
  write: (product: ChemicalProduct, id: string, file: File) => Promise<{ drive_path: string; sha256: string }>;
  read: (attachment: ChemicalAttachment) => Promise<Blob>;
  createSignedUrl?: (attachment: ChemicalAttachment) => Promise<string>;
}
export async function chemicalFileHash(bytes: Uint8Array<ArrayBuffer>) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) => byte.toString(16).padStart(2,'0')).join('');
}
export function chemicalDriveFilename(id: string, filename: string) {
  const safe = filename.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]/g,'_');
  const dot = safe.lastIndexOf('.');
  return `${id}-${safe.slice(0,dot)}${safe.slice(dot).toLowerCase()}`;
}
export function createChemicalDrive(client: SupabaseClient): ChemicalFileStore {
  async function session() {
    const connection = await connectLocalDrive();
    if (!supportsLocalDriveVersion(connection.version, '2.2.0')) throw new Error('Installez le lanceur SeaPilot depuis Administration → Documents et Google Drive pour utiliser les pièces jointes chimiques. Le dossier déjà configuré sera conservé.');
    return connection;
  }
  const read = async (attachment: ChemicalAttachment): Promise<Blob> => {
    if (await hasDocumentBlobFile(client, 'chemical-drive', attachment.id)) {
      const { data, error } = await client.storage.from('chemical-drive').download(attachment.id);
      if (error || !data) throw error || new Error('La pièce jointe est indisponible.');
      return data;
    }
    const connection = await session();
    const result = await localDriveRequest<{path:string;bytes:number;base64:string}>(client,connection,{
      action:'read',module:'chemicals',productId:attachment.product_id,attachmentId:attachment.id,path:attachment.drive_path,
    });
    const bytes = Uint8Array.from(atob(result.base64), (char) => char.charCodeAt(0));
    if (result.path !== attachment.drive_path || result.bytes !== bytes.length || bytes.length !== attachment.size_bytes
      || await chemicalFileHash(bytes) !== attachment.sha256) throw new Error('La pièce jointe Drive a changé ou sa synchronisation est incomplète. Ajoutez sa nouvelle version.');
    return new Blob([bytes],{type:attachment.mime_type});
  };
  return {
    connect: async () => { await session(); },
    write: async (product, id, file) => {
      const mime = attachmentMime(file);
      const scope = await client.rpc('chemical_drive_scope', { target_product: product.id });
      if (scope.error) throw scope.error;
      const folder = scope.data?.folder;
      if (scope.data?.directory !== 'Produits Chimiques' || typeof folder !== 'string' || !folder) throw new Error('Dossier Google Drive indisponible.');
      const path = `${folder}/${chemicalDriveFilename(id,file.name)}`;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const sha256 = await chemicalFileHash(bytes);
      const { error } = await client.storage.from('chemical-drive').upload(id, file, {
        contentType: mime, upsert: false, metadata: { product_id: product.id, file_name: file.name },
      });
      if (error) throw error;
      return { drive_path: path, sha256 };
    },
    read,
    createSignedUrl: async attachment => {
      if (await hasDocumentBlobFile(client, 'chemical-drive', attachment.id)) {
        const { data, error } = await client.storage.from('chemical-drive').createSignedUrl(attachment.id, 120);
        if (error || !data?.signedUrl) throw error || new Error('La pièce jointe est indisponible.');
        return data.signedUrl;
      }
      const url = URL.createObjectURL(await read(attachment));
      setTimeout(() => URL.revokeObjectURL(url), 120_000);
      return url;
    },
  };
}
