import { describe, expect, it } from 'vitest';
import type { RegulatoryReview } from './regulatoryModel';
import {
  canManageRegulatoryLibrary, getRegulatoryReviewStatus, latestRegulatoryReview,
  normalizeRegulatoryUrl, REGULATORY_REFERENCE_TEXTS, regulatoryReviewDueAt,
  validateRegulatoryReviewDraft, validateRegulatoryTextDraft,
} from './regulatoryModel';

const review = (reviewed_at: string, text_id = 'text'): RegulatoryReview => ({
  id: reviewed_at, text_id, reviewed_at, reviewer_name: 'Direction', has_updates: false, updates: '',
});

describe('regulatory monthly review status', () => {
  it('starts without any invented review and marks an unreviewed text explicitly', () => {
    expect(REGULATORY_REFERENCE_TEXTS).toHaveLength(6);
    expect(REGULATORY_REFERENCE_TEXTS.filter((text) => text.is_primary)).toHaveLength(2);
    expect(REGULATORY_REFERENCE_TEXTS.find((text) => text.title.startsWith('Division 214'))?.url).toContain('d214-09-07-24.pdf');
    expect(getRegulatoryReviewStatus(null)).toBe('never');
  });

  it('uses a calendar month instead of a fixed thirty day period', () => {
    const last = review('2026-01-31T10:20:30.456Z');
    expect(regulatoryReviewDueAt(last.reviewed_at)?.toISOString()).toBe('2026-02-28T10:20:30.456Z');
    expect(getRegulatoryReviewStatus(last, new Date('2026-02-28T10:20:30.455Z'))).toBe('current');
    expect(getRegulatoryReviewStatus(last, new Date('2026-02-28T10:20:30.456Z'))).toBe('overdue');
  });

  it('clamps leap-year and year-boundary months correctly', () => {
    expect(regulatoryReviewDueAt('2024-01-31T10:00:00Z')?.toISOString()).toBe('2024-02-29T10:00:00.000Z');
    expect(regulatoryReviewDueAt('2026-12-31T10:00:00Z')?.toISOString()).toBe('2027-01-31T10:00:00.000Z');
  });

  it('preserves the French calendar time through daylight saving changes', () => {
    expect(regulatoryReviewDueAt('2026-03-01T10:00:00Z')?.toISOString()).toBe('2026-04-01T09:00:00.000Z');
    expect(regulatoryReviewDueAt('2026-10-01T09:00:00Z')?.toISOString()).toBe('2026-11-01T10:00:00.000Z');
    expect(regulatoryReviewDueAt('2027-02-28T01:30:00Z')?.toISOString()).toBe('2027-03-28T01:30:00.000Z');
  });

  it('never reports malformed or future dates as current', () => {
    expect(regulatoryReviewDueAt('invalid')).toBeNull();
    expect(getRegulatoryReviewStatus(review('invalid'), new Date('2026-10-01T12:00:00Z'))).toBe('invalid');
    expect(getRegulatoryReviewStatus(review('2026-10-02T12:00:00Z'), new Date('2026-10-01T12:00:00Z'))).toBe('invalid');
  });

  it('selects the latest review for the requested text without mutating the history', () => {
    const history = [review('2026-08-01T10:00:00Z'), review('2026-10-01T10:00:00Z', 'other'), review('2026-09-30T10:00:00Z')];
    expect(latestRegulatoryReview('text', history)?.reviewed_at).toBe('2026-09-30T10:00:00Z');
    expect(latestRegulatoryReview('missing', history)).toBeNull();
    expect(history[0].reviewed_at).toBe('2026-08-01T10:00:00Z');
  });

  it('requires a fresh review when the reference URL has been replaced and retains the original history', () => {
    const history = [{ ...review('2026-09-30T10:00:00Z'), url_snapshot: 'https://example.org/old' }];
    const current = latestRegulatoryReview('text', history, 'https://example.org/new');
    expect(current).toBeNull();
    expect(getRegulatoryReviewStatus(current)).toBe('never');
    expect(latestRegulatoryReview('text', history)?.url_snapshot).toBe('https://example.org/old');
  });
});

describe('regulatory editor validation', () => {
  it.each(['admin', 'direction', 'armement'] as const)('allows management for %s', (role) => {
    expect(canManageRegulatoryLibrary([role])).toBe(true);
  });
  it.each(['marin', 'capitaine'] as const)('keeps the real %s profile read-only', (role) => {
    expect(canManageRegulatoryLibrary([role])).toBe(false);
  });
  it('accepts HTTPS links and retains the supplied PDF reference', () => {
    expect(normalizeRegulatoryUrl(' https://www.mer.gouv.fr/sites/default/files/2023-04/d213%20%2828.03.2023%29.pdf '))
      .toBe('https://www.mer.gouv.fr/sites/default/files/2023-04/d213%20%2828.03.2023%29.pdf');
    expect(validateRegulatoryTextDraft({ category: 'safety', title: '  Nouveau texte  ', url: 'https://example.org/text' }).title).toBe('Nouveau texte');
  });
  it.each(['javascript:alert(1)', 'http://example.org', 'https://alice:secret@example.org', 'https://alice@example.org', 'https://example.org/a b', 'https://example.org\\unsafe'])('rejects unsafe links: %s', (url) => {
    expect(() => normalizeRegulatoryUrl(url)).toThrow();
  });
  it('requires an update list only when updates have been observed', () => {
    expect(validateRegulatoryReviewDraft({ has_updates: false, updates: '' })).toEqual({ has_updates: false, updates: '' });
    expect(validateRegulatoryReviewDraft({ has_updates: true, updates: '  Article modifié  ' }).updates).toBe('Article modifié');
    expect(() => validateRegulatoryReviewDraft({ has_updates: true, updates: ' ' })).toThrow('Décrivez');
    expect(() => validateRegulatoryReviewDraft({ has_updates: false, updates: 'Article modifié' })).toThrow('Mises à jour');
  });
});
