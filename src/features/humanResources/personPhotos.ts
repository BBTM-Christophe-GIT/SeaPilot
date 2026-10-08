import type { SupabaseClient } from '@supabase/supabase-js';
import { createHrDocument, type PersonRecord } from './peopleQueries';
import { blobDataUrl, HR_PORTRAIT_BUCKET, preparePortrait, validatePortrait } from './portraitMedia';
import { connectHrDrive } from './hrDocumentDrive';

export async function savePersonPhoto(client: SupabaseClient, person: PersonRecord, file: File) {
  validatePortrait(file);
  // Start the existing local launcher within the upload gesture. The full-size
  // original must be verified in Drive before registering the display copy.
  const connection = connectHrDrive();
  const [thumbnail] = await Promise.all([preparePortrait(file), connection]);
  const document = await createHrDocument(client, {
    person, file, dueDate: '',
    documentType: { id: 0, sourceItemId: 0, name: 'Photo du collaborateur', fileName: 'Photo', categoryKey: 'administrative', categoryLabel: 'Documents administratifs' },
  });
  const path = `${person.id}/${crypto.randomUUID()}.jpg`;
  const storage = client.storage.from(HR_PORTRAIT_BUCKET);
  const { error: uploadError } = await storage.upload(path, thumbnail, { contentType: 'image/jpeg', upsert: false });
  if (uploadError) throw new Error('La photo originale est enregistrée dans le dossier RH, mais sa miniature n’a pas pu être enregistrée. Réessayez.');
  const { error } = await client.from('people').update({ photo_document_id: document.id, photo_storage_path: path }).eq('id', person.id).select('id').single();
  if (error) {
    await storage.remove([path]);
    throw new Error('La photo originale est conservée dans le dossier RH. La photo du profil n’a pas pu être mise à jour.');
  }
  // Keep the original document as an archive. Cleanup only the superseded thumbnail.
  if (person.photoPath) await storage.remove([person.photoPath]);
  return { document, photoPath: path, photoDocumentId: document.id, photoUrl: await blobDataUrl(thumbnail) };
}

export async function removePersonPhoto(client: SupabaseClient, person: PersonRecord) {
  const { error } = await client.from('people').update({ photo_document_id: null, photo_storage_path: null }).eq('id', person.id).select('id').single();
  if (error) throw new Error('Impossible de retirer la photo du profil.');
  if (person.photoPath) await client.storage.from(HR_PORTRAIT_BUCKET).remove([person.photoPath]);
}
