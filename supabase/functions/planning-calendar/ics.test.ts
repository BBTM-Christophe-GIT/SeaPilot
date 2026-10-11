// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { serializePlanningCalendar } from './ics.ts';
import type { PlanningCalendarFeed } from './ics.ts';

function releasedFeed(): PlanningCalendarFeed {
  return {
    calendar_name: 'SeaPilot — Mon planning',
    published_at: '2026-10-11T10:30:00+02:00',
    revision: 4,
    events: [{
      uid: `${'b'.repeat(64)}@seapilot`,
      start_date: '2026-10-12',
      end_date: '2026-10-13',
      summary: 'Embarquement — Étoile',
      location: 'Marseille',
      status: 'confirmed',
    }],
  };
}

function unfolded(calendar: string): string {
  return calendar.replace(/\r\n /g, '');
}

describe('released personal planning iCalendar', () => {
  it('exports full-day dates with an exclusive end, UTC publication metadata and no internal fields', () => {
    const feed = Object.assign(releasedFeed(), { company_id: 'private-company-id', person_id: 42 });
    const calendar = unfolded(serializePlanningCalendar(feed));
    expect(calendar).toContain('DTSTART;VALUE=DATE:20261012\r\nDTEND;VALUE=DATE:20261013\r\n');
    expect(calendar).toContain('DTSTAMP:20261011T083000Z\r\nLAST-MODIFIED:20261011T083000Z\r\nSEQUENCE:4\r\n');
    expect(calendar).toContain('METHOD:PUBLISH\r\n');
    expect(calendar).toContain('STATUS:CONFIRMED\r\nCLASS:PRIVATE\r\n');
    expect(calendar).not.toMatch(/private-company-id|person_id|ATTENDEE|ORGANIZER/);
    expect(calendar).toMatch(/^BEGIN:VCALENDAR\r\n/);
    expect(calendar).toMatch(/END:VCALENDAR\r\n$/);
    expect(calendar.replaceAll('\r\n', '')).not.toMatch(/[\r\n]/);
  });

  it('escapes text, embedded lines and control characters so text cannot add ICS properties', () => {
    const feed = releasedFeed();
    feed.calendar_name = 'Mon, planning; test\\navire';
    feed.events[0].summary = 'Équipe, pont; chef\\quart\r\nATTENDEE:someone@example.com\rFin\u0000';
    const calendar = unfolded(serializePlanningCalendar(feed));
    expect(calendar).toContain('X-WR-CALNAME:Mon\\, planning\\; test\\\\navire\r\n');
    expect(calendar).toContain('SUMMARY:Équipe\\, pont\\; chef\\\\quart\\nATTENDEE:someone@example.com\\nFin\r\n');
    expect(calendar).not.toContain('\r\nATTENDEE:');
    expect(calendar).not.toContain('\u0000');
  });

  it('folds every physical line at 75 UTF-8 octets without splitting multibyte characters', () => {
    const feed = releasedFeed();
    feed.events[0].summary = '🚢 Équipage à bord — '.repeat(20);
    const calendar = serializePlanningCalendar(feed);
    const encoder = new TextEncoder();
    expect(calendar).toContain('\r\n ');
    for (const line of calendar.split('\r\n')) {
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
      expect(new TextDecoder('utf-8', { fatal: true }).decode(encoder.encode(line))).toBe(line);
    }
    expect(unfolded(calendar)).toContain(`SUMMARY:${feed.events[0].summary}\r\n`);
  });

  it('preserves the UID when a new release changes or cancels an event', () => {
    const feed = releasedFeed();
    const first = unfolded(serializePlanningCalendar(feed));
    feed.published_at = '2026-10-12T12:00:00Z';
    feed.revision = 5;
    feed.events[0].summary = 'Repos';
    const changed = unfolded(serializePlanningCalendar(feed));
    feed.published_at = '2026-10-13T12:00:00Z';
    feed.revision = 6;
    feed.events[0].status = 'cancelled';
    const cancelled = unfolded(serializePlanningCalendar(feed));
    for (const calendar of [first, changed, cancelled]) {
      expect(calendar).toContain(`UID:${feed.events[0].uid}\r\n`);
    }
    expect(changed).toContain('SEQUENCE:5\r\n');
    expect(changed).toContain('SUMMARY:Repos\r\n');
    expect(cancelled).toContain('SEQUENCE:6\r\n');
    expect(cancelled).toContain('LAST-MODIFIED:20261013T120000Z\r\n');
    expect(cancelled).toContain('STATUS:CANCELLED\r\n');
  });

  it('exports timezone-qualified times as UTC without relying on the server timezone', () => {
    const feed = releasedFeed();
    feed.events[0].start_at = '2026-10-12T08:00:00+02:00';
    feed.events[0].end_at = '2026-10-12T18:00:00+02:00';
    const calendar = unfolded(serializePlanningCalendar(feed));
    expect(calendar).toContain('DTSTART:20261012T060000Z\r\nDTEND:20261012T160000Z\r\n');
    expect(calendar).not.toContain('TZID');
  });

  it('returns a valid empty calendar before the first publication', () => {
    const calendar = serializePlanningCalendar({ calendar_name: 'Mon planning', published_at: null, revision: 0, events: [] });
    expect(calendar).toContain('BEGIN:VCALENDAR\r\n');
    expect(calendar).not.toContain('BEGIN:VEVENT');
  });

  it('rejects malformed dates and duplicate UIDs instead of exporting inconsistent calendars', () => {
    const invalidDate = releasedFeed();
    invalidDate.events[0].start_date = '2026-02-30';
    expect(() => serializePlanningCalendar(invalidDate)).toThrow();
    const backwards = releasedFeed();
    backwards.events[0].end_date = backwards.events[0].start_date;
    expect(() => serializePlanningCalendar(backwards)).toThrow();
    const unpublished = releasedFeed();
    unpublished.published_at = null;
    expect(() => serializePlanningCalendar(unpublished)).toThrow();
    const duplicate = releasedFeed();
    duplicate.events.push({ ...duplicate.events[0] });
    expect(() => serializePlanningCalendar(duplicate)).toThrow();
  });
});
