import type { RoleKey } from '../permissions/roles';

export type RegulatoryCategory = 'safety' | 'transport';

export interface RegulatoryText {
  id: string;
  category: RegulatoryCategory;
  title: string;
  url: string;
  is_primary: boolean;
  sort_order: number;
}

export interface RegulatoryTextDraft {
  category: RegulatoryCategory;
  title: string;
  url: string;
  is_primary?: boolean;
  sort_order?: number;
}

export interface RegulatoryReview {
  id: string;
  text_id: string;
  reviewed_at: string;
  reviewer_name: string;
  has_updates: boolean;
  updates: string;
  title_snapshot?: string;
  url_snapshot?: string;
}

export interface RegulatoryReviewDraft {
  has_updates: boolean;
  updates: string;
}

export const REGULATORY_REFERENCE_TEXTS: RegulatoryText[] = [
  { id: 'd1600000-0000-4000-8000-000000000001', category: 'safety', title: 'Pôle réglementation de la sécurité maritime', url: 'https://www.mer.gouv.fr/pole-reglementation-de-la-securite-maritime', is_primary: true, sort_order: 0 },
  { id: 'd1600000-0000-4000-8000-000000000002', category: 'safety', title: 'Division 160 - Gestion de la Sécurité', url: 'https://www.mer.gouv.fr/sites/default/files/2026-08/d160-20-06-26.pdf', is_primary: false, sort_order: 160 },
  { id: 'd1600000-0000-4000-8000-000000000003', category: 'safety', title: 'Division 213 - Prévention de la Pollution', url: 'https://www.mer.gouv.fr/sites/default/files/2023-04/d213%20%2828.03.2023%29.pdf', is_primary: false, sort_order: 213 },
  { id: 'd1600000-0000-4000-8000-000000000004', category: 'safety', title: 'Division 214 - Protection des travailleurs et appareils de levage', url: 'https://www.mer.gouv.fr/sites/default/files/2025-07/d214-09-07-24.pdf', is_primary: false, sort_order: 214 },
  { id: 'd1600000-0000-4000-8000-000000000005', category: 'safety', title: 'Division 222 - Conception et Exploitation des navires de charge de jauge brute inférieure à 500', url: 'https://www.mer.gouv.fr/sites/default/files/2025-05/d222-11-04-25.pdf', is_primary: false, sort_order: 222 },
  { id: 'd1600000-0000-4000-8000-000000000006', category: 'transport', title: 'Code des Transports', url: 'https://www.legifrance.gouv.fr/loda/id/LEGISCTA000043341020', is_primary: true, sort_order: 0 },
];

export function canManageRegulatoryLibrary(roles: readonly RoleKey[]): boolean {
  return roles.some((role) => role === 'admin' || role === 'direction' || role === 'armement');
}

export function normalizeRegulatoryUrl(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length > 8000 || /[\s\\]/u.test(trimmed)
      || Array.from(trimmed).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
    throw new Error('Le lien doit être une adresse HTTPS valide sans espace.');
  }
  let url: URL;
  try { url = new URL(trimmed); } catch { throw new Error('Le lien doit être une adresse HTTPS valide.'); }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) {
    throw new Error('Utilisez un lien HTTPS sans identifiant ni mot de passe.');
  }
  // Restrict the authority to ordinary domain names / IPv4, matching the database guard.
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/iu.test(url.hostname)) {
    throw new Error('Le nom de domaine du lien est invalide.');
  }
  if (url.href.length > 8000) throw new Error('Le lien dépasse 8 000 caractères.');
  return url.href;
}

export function validateRegulatoryTextDraft(draft: RegulatoryTextDraft): RegulatoryTextDraft {
  if (draft.category !== 'safety' && draft.category !== 'transport') throw new Error('Choisissez une rubrique réglementaire.');
  const title = draft.title.trim();
  if (!title || title.length > 240) throw new Error('Le titre doit contenir entre 1 et 240 caractères.');
  if (draft.sort_order !== undefined && (!Number.isInteger(draft.sort_order) || draft.sort_order < 0 || draft.sort_order > 1_000_000)) {
    throw new Error('L’ordre du lien est invalide.');
  }
  return {
    category: draft.category, title, url: normalizeRegulatoryUrl(draft.url),
    ...(draft.is_primary === undefined ? {} : { is_primary: draft.is_primary }),
    ...(draft.sort_order === undefined ? {} : { sort_order: draft.sort_order }),
  };
}

export function validateRegulatoryReviewDraft(draft: RegulatoryReviewDraft): RegulatoryReviewDraft {
  if (typeof draft.has_updates !== 'boolean') throw new Error('Précisez si le texte a été mis à jour.');
  const updates = draft.updates.trim();
  if (updates.length > 12000) throw new Error('La liste des mises à jour dépasse 12 000 caractères.');
  if (draft.has_updates && !updates) throw new Error('Décrivez les mises à jour constatées.');
  if (!draft.has_updates && updates) throw new Error('Choisissez « Mises à jour constatées » pour enregistrer cette liste.');
  return { has_updates: draft.has_updates, updates };
}

const calendarFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function parisWallTime(date: Date): number {
  const parts = calendarFormatter.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((value) => value.type === type)?.value);
  return Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'), date.getUTCMilliseconds());
}

/** One calendar month in France, clamped at month end; preserves the review's local time. */
export function regulatoryReviewDueAt(reviewedAt: string): Date | null {
  const reviewed = new Date(reviewedAt);
  if (!Number.isFinite(reviewed.getTime())) return null;
  const local = new Date(parisWallTime(reviewed));
  const targetMonth = local.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(local.getUTCFullYear(), targetMonth + 1, 0)).getUTCDate();
  const target = Date.UTC(local.getUTCFullYear(), targetMonth, Math.min(local.getUTCDate(), lastDay),
    local.getUTCHours(), local.getUTCMinutes(), local.getUTCSeconds(), local.getUTCMilliseconds());
  if (!Number.isFinite(target)) return null;
  let candidate = target;
  let previous = candidate;
  for (let step = 0; step < 4; step += 1) {
    const adjustment = target - parisWallTime(new Date(candidate));
    if (adjustment === 0) return new Date(candidate);
    const next = candidate + adjustment;
    // A nonexistent time during the spring DST jump is advanced by the missing hour.
    if (step > 0 && next === previous) return new Date(Math.max(candidate, next));
    previous = candidate;
    candidate = next;
  }
  return new Date(candidate);
}

export type RegulatoryReviewStatus = 'never' | 'current' | 'overdue' | 'invalid';

export function getRegulatoryReviewStatus(review: RegulatoryReview | null | undefined, now = new Date()): RegulatoryReviewStatus {
  if (!review) return 'never';
  const reviewedAt = new Date(review.reviewed_at).getTime();
  const due = regulatoryReviewDueAt(review.reviewed_at);
  if (!due || !Number.isFinite(now.getTime()) || reviewedAt > now.getTime()) return 'invalid';
  return now.getTime() >= due.getTime() ? 'overdue' : 'current';
}

export function latestRegulatoryReview(textId: string, reviews: readonly RegulatoryReview[], sourceUrl?: string): RegulatoryReview | null {
  const matching = reviews.filter((review) => review.text_id === textId
    && (!sourceUrl || !review.url_snapshot || review.url_snapshot === sourceUrl));
  return matching.reduce<RegulatoryReview | null>((latest, review) => {
    if (!latest) return review;
    const latestTime = new Date(latest.reviewed_at).getTime();
    const reviewTime = new Date(review.reviewed_at).getTime();
    if (Number.isFinite(reviewTime) && (!Number.isFinite(latestTime) || reviewTime > latestTime)) return review;
    return latest;
  }, null);
}
