import type { SupabaseClient } from '@supabase/supabase-js';

export const HR_PORTRAIT_BUCKET = 'hr-portraits';
export const PORTRAIT_MAX_BYTES = 5 * 1024 * 1024;

export function validatePortrait(file: File) {
  if (!['image/jpeg', 'image/png'].includes(file.type) || !file.size || file.size > PORTRAIT_MAX_BYTES) {
    throw new Error('Choisissez une photo JPEG ou PNG de 5 Mo maximum.');
  }
}

export function blobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Lecture de l’image impossible.'));
    reader.readAsDataURL(blob);
  });
}

/** A small square, stripped of original metadata, suitable for avatars and exports. */
export async function preparePortrait(file: File): Promise<Blob> {
  validatePortrait(file);
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve(); image.onerror = () => reject(new Error('Cette photo ne peut pas être lue.'));
      image.src = url;
    });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('La photo est vide.');
    const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 320;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Préparation de la photo indisponible.');
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, 320, 320);
    context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, 320, 320);
    return await new Promise((resolve, reject) => canvas.toBlob((blob) => blob && blob.size <= 262144 ? resolve(blob) : reject(new Error('La miniature est trop volumineuse.')), 'image/jpeg', .86));
  } finally { URL.revokeObjectURL(url); }
}

export async function loadPortrait(client: SupabaseClient, path: string): Promise<string> {
  const { data, error } = await client.storage.from(HR_PORTRAIT_BUCKET).download(path);
  if (error || !data) throw new Error('Photo indisponible.');
  return blobDataUrl(data);
}

export async function loadPeoplePortraits<T extends { photoPath?: string; photoUrl?: string }>(client: SupabaseClient, people: T[]): Promise<T[]> {
  return Promise.all(people.map(async (person) => {
    if (!person.photoPath) return person;
    try { return { ...person, photoUrl: await loadPortrait(client, person.photoPath) }; }
    catch { return { ...person, photoUrl: '', photoUnavailable: true }; }
  }));
}
