/** Public calendar data is restricted to the caller's released personal planning. */
export interface PlanningCalendarEvent {
  uid: string;
  start_date: string;
  /** The iCalendar end date is exclusive. */
  end_date: string;
  start_at?: string | null;
  end_at?: string | null;
  summary: string;
  location?: string | null;
  status: 'confirmed' | 'cancelled';
}

export interface PlanningCalendarFeed {
  calendar_name: string;
  published_at: string | null;
  revision: number;
  events: PlanningCalendarEvent[];
}

function calendarDate(value: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Invalid calendar date.');
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error('Invalid calendar date.');
  }
  return value.replaceAll('-', '');
}

function calendarTimestamp(value: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new Error('Invalid calendar timestamp.');
  }
  calendarDate(value.slice(0, 10));
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || Number(value.slice(11, 13)) > 23
    || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19)) > 59) {
    throw new Error('Invalid calendar timestamp.');
  }
  return date.toISOString().replaceAll('-', '').replaceAll(':', '').replace(/\.\d{3}Z$/, 'Z');
}

/** Escape TEXT properties before folding; embedded lines cannot create properties. */
function escapeText(value: string): string {
  if (typeof value !== 'string') throw new Error('Invalid calendar text.');
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replaceAll('\\', '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,');
}

/** RFC 5545: at most 75 UTF-8 octets per physical line, including continuation space. */
function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const lines: string[] = [];
  let current = '';
  let octets = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (octets + size > 75) {
      lines.push(current);
      current = ' ';
      octets = 1;
    }
    current += character;
    octets += size;
  }
  lines.push(current);
  return lines.join('\r\n');
}

/** Pure serializer shared by the authenticated download and the subscription feed. */
export function serializePlanningCalendar(feed: PlanningCalendarFeed): string {
  if (!feed || !Array.isArray(feed.events) || !Number.isSafeInteger(feed.revision) || feed.revision < 0) {
    throw new Error('Invalid calendar feed.');
  }
  const publishedAt = feed.published_at === null ? null : calendarTimestamp(feed.published_at);
  if (feed.events.length > 0 && publishedAt === null) throw new Error('Unpublished calendar events.');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SeaPilot//Planning personnel//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(feed.calendar_name)}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];

  const seenUids = new Set<string>();
  for (const event of feed.events) {
    if (!event || typeof event.uid !== 'string' || !/^[a-zA-Z0-9._@-]{1,255}$/.test(event.uid)
      || seenUids.has(event.uid) || !['confirmed', 'cancelled'].includes(event.status)) {
      throw new Error('Invalid calendar event.');
    }
    seenUids.add(event.uid);
    const startDate = calendarDate(event.start_date);
    const endDate = calendarDate(event.end_date);
    if (endDate <= startDate) throw new Error('Invalid calendar interval.');
    const hasStartTime = event.start_at != null;
    const hasEndTime = event.end_at != null;
    if (hasStartTime !== hasEndTime) throw new Error('Incomplete calendar interval.');

    lines.push('BEGIN:VEVENT', `UID:${event.uid}`, `DTSTAMP:${publishedAt}`, `LAST-MODIFIED:${publishedAt}`, `SEQUENCE:${feed.revision}`);
    if (hasStartTime && hasEndTime) {
      const startAt = calendarTimestamp(event.start_at!);
      const endAt = calendarTimestamp(event.end_at!);
      if (endAt <= startAt) throw new Error('Invalid calendar interval.');
      lines.push(`DTSTART:${startAt}`, `DTEND:${endAt}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${startDate}`, `DTEND;VALUE=DATE:${endDate}`);
    }
    lines.push(`SUMMARY:${escapeText(event.summary)}`);
    if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
    lines.push(`STATUS:${event.status.toUpperCase()}`, 'CLASS:PRIVATE', 'TRANSP:OPAQUE', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}
