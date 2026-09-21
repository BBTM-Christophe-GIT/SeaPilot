import type { SupabaseClient } from '@supabase/supabase-js';

export interface LinkCategory { id: string; name: string }
export interface UsefulLink { id: string; title: string; url: string; category_id: string | null }
export type LinkDraft = Omit<UsefulLink, 'id'>;
export interface LinksDirectory { links: UsefulLink[]; categories: LinkCategory[]; canManage: boolean }

export function validateLink(draft: LinkDraft): LinkDraft {
  const title = draft.title.trim();
  if (!title || title.length > 120) throw new Error('Le titre doit contenir entre 1 et 120 caractères.');
  let url: URL;
  try { url = new URL(draft.url.trim()); } catch { throw new Error('Saisissez une adresse complète commençant par https:// ou http://.'); }
  if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.href.length > 8000) {
    throw new Error('Utilisez une adresse HTTP ou HTTPS sans identifiants intégrés (8 000 caractères maximum).');
  }
  return { title, url: url.href, category_id: draft.category_id || null };
}

export function faviconUrl(value: string): string {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol)) return '';
    // Only the hostname is sent: paths, meeting IDs and query parameters remain private.
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(url.hostname)}&sz=64`;
  } catch { return ''; }
}

// Icons declared by the supplied portals (verified 2026-09-21). Other sites use
// the browser's conventional /favicon.ico, then the hostname-only icon service.
const PORTAL_ICONS: Record<string, string> = {
  'vendor.supplhi.com': 'https://vendor.supplhi.com/assets/img/favicon.ico',
  'www.veracity.com': 'https://www.veracity.com/veracity_logo_square.svg',
  'services.veracity.com': 'https://services.veracity.com/assets/favicon-B4Pkr-3I.ico',
  'nomade.portsdenormandie.fr': 'https://nomade.portsdenormandie.fr/templates/easyPOS/favicon/favicon-96x96.png',
  'www.offshoreenergymanager.com': 'https://www.offshoreenergymanager.com/src/assets/favicon/favicon-96x96.png',
  'constructionandengineering.oraclecloud.com': 'https://constructionandengineering.oraclecloud.com/ui/v1/styles/images/favicon.ico',
  'apps.docusign.com': 'https://apps.docusign.com/favicon.ico?v=2',
  'teams.microsoft.com': 'https://teams.public.onecdn.static.microsoft/evergreen-assets/icons/microsoft_teams_logo_refresh_v2025.ico',
};

export function faviconSources(value: string): string[] {
  const fallback = faviconUrl(value);
  if (!fallback) return [];
  const { hostname } = new URL(value);
  return [PORTAL_ICONS[hostname] || `https://${hostname}/favicon.ico`, fallback];
}

export function searchText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr');
}

export async function fetchLinksDirectory(client: SupabaseClient): Promise<LinksDirectory> {
  const [links, categories, permission] = await Promise.all([
    client.from('useful_links').select('id,title,url,category_id').order('title'),
    client.from('useful_link_categories').select('id,name').order('name'),
    client.rpc('useful_links_can_manage'),
  ]);
  for (const result of [links, categories, permission]) if (result.error) throw result.error;
  return { links: (links.data || []) as UsefulLink[], categories: (categories.data || []) as LinkCategory[], canManage: permission.data === true };
}

export async function saveUsefulLink(client: SupabaseClient, draft: LinkDraft, id?: string): Promise<UsefulLink> {
  const values = validateLink(draft);
  const table = client.from('useful_links');
  const { data, error } = await (id ? table.update(values).eq('id', id) : table.insert(values)).select('id,title,url,category_id').single();
  if (error) throw error;
  return data as UsefulLink;
}

export async function saveLinkCategory(client: SupabaseClient, name: string, id?: string): Promise<LinkCategory> {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 80) throw new Error('La catégorie doit contenir entre 1 et 80 caractères.');
  const table = client.from('useful_link_categories');
  const { data, error } = await (id ? table.update({ name: trimmed }).eq('id', id) : table.insert({ name: trimmed })).select('id,name').single();
  if (error) {
    if (error.code === '23505') throw new Error('Cette catégorie existe déjà.');
    throw error;
  }
  return data as LinkCategory;
}

export async function deleteDirectoryItem(client: SupabaseClient, type: 'link' | 'category', id: string): Promise<void> {
  const { error } = await client.from(type === 'link' ? 'useful_links' : 'useful_link_categories').delete().eq('id', id).select('id').single();
  if (error) throw error;
}

export function directoryError(error: unknown): string {
  return error instanceof Error ? error.message : 'L’opération a échoué. Vérifiez votre accès et réessayez.';
}
