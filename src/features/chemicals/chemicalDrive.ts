import type { SupabaseClient } from '@supabase/supabase-js';
import { blobBase64, connectLocalDrive, localDriveRequest } from '../documents/localDriveLauncher';
import { attachmentMime, type ChemicalAttachment, type ChemicalProduct } from './chemicalModel';

export interface ChemicalFileStore {
  connect: () => Promise<void>;
  write: (product: ChemicalProduct, id: string, file: File) => Promise<{ drive_path: string; sha256: string }>;
  read: (attachment: ChemicalAttachment) => Promise<Blob>;
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
    if (!['2.2.0', '2.3.0', '2.4.0'].includes(connection.version || '')) throw new Error('Installez le lanceur SeaPilot depuis Administration → Documents et Google Drive pour utiliser les pièces jointes chimiques. Le dossier déjà configuré sera conservé.');
    return connection;
  }
  return {
    connect: async () => { await session(); },
    write: async (product, id, file) => {
      attachmentMime(file);
      const pending = session(); // Start the native protocol while the user gesture is active.
      const [connection, scope, base64] = await Promise.all([pending, client.rpc('chemical_drive_scope', { target_product: product.id }), blobBase64(file)]);
      if (scope.error) throw scope.error;
      const folder = scope.data?.folder;
      if (scope.data?.directory !== 'Produits Chimiques' || typeof folder !== 'string' || !folder) throw new Error('Dossier Google Drive indisponible.');
      const path = `${folder}/${chemicalDriveFilename(id,file.name)}`;
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const sha256 = await chemicalFileHash(bytes);
      const written = await localDriveRequest<{ path: string; bytes: number }>(client,connection,{
        action:'write',module:'chemicals',productId:product.id,path,base64,
      });
      if (written.path !== path || written.bytes !== file.size) throw new Error('Le fichier écrit sur Google Drive ne correspond pas au fichier sélectionné.');
      return { drive_path: path, sha256 };
    },
    read: async (attachment) => {
      const connection = await session();
      const result = await localDriveRequest<{path:string;bytes:number;base64:string}>(client,connection,{
        action:'read',module:'chemicals',productId:attachment.product_id,attachmentId:attachment.id,path:attachment.drive_path,
      });
      const bytes = Uint8Array.from(atob(result.base64), (char) => char.charCodeAt(0));
      if (result.path !== attachment.drive_path || result.bytes !== bytes.length || bytes.length !== attachment.size_bytes
        || await chemicalFileHash(bytes) !== attachment.sha256) throw new Error('La pièce jointe Drive a changé ou sa synchronisation est incomplète. Ajoutez sa nouvelle version.');
      return new Blob([bytes],{type:attachment.mime_type});
    },
  };
}
