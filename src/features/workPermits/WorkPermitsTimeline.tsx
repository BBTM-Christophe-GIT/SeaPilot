import { useEffect, useId, useState } from 'react';
import './workPermitsTimeline.css';

export interface WorkPermitTimelineItem {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  pausedAt?: string | null;
  pausedSeconds?: number;
  location?: string;
}

interface WorkPermitsTimelineProps {
  permits: readonly WorkPermitTimelineItem[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}

const dateTime = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
});

function formatDuration(milliseconds: number): string {
  const minutes = Math.floor(milliseconds / 60_000);
  if (minutes === 0) return 'Moins d’une minute';
  const days = Math.floor(minutes / 1_440);
  const hours = Math.floor((minutes % 1_440) / 60);
  return [
    days ? `${days} j` : '',
    hours ? `${hours} h` : '',
    minutes % 60 ? `${minutes % 60} min` : '',
  ].filter(Boolean).join(' ');
}

export function WorkPermitsTimeline({ permits, selectedId, onSelect }: WorkPermitsTimelineProps) {
  const titleId = useId();
  const [now, setNow] = useState(Date.now);
  const hasOpenPermits = permits.some((permit) => !permit.endsAt);

  useEffect(() => {
    if (!hasOpenPermits) return;
    const initial = window.setTimeout(() => setNow(Date.now()), 0);
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [hasOpenPermits]);

  if (permits.length === 0) {
    return (
      <section className="work-permits-timeline" aria-labelledby={titleId}>
        <h2 id={titleId}>Frise des permis ouverts</h2>
        <p>Aucun permis ouvert.</p>
      </section>
    );
  }

  const rows = permits.map((permit) => {
    const start = Date.parse(permit.startsAt);
    const stop = permit.endsAt ?? permit.pausedAt;
    return {
      ...permit,
      start,
      end: Math.max(start, stop ? Date.parse(stop) : now),
      state: permit.endsAt ? 'closed' : permit.pausedAt ? 'paused' : start > now ? 'planned' : 'running',
    };
  }).sort((left, right) => left.start - right.start || left.end - right.end);
  const first = rows[0].start;
  const last = rows.reduce((latest, row) => Math.max(latest, row.end), hasOpenPermits ? now : first);
  const range = Math.max(last - first, 1);
  const axisStart = dateTime.format(first);
  const axisEnd = dateTime.format(last);

  return (
    <section className="work-permits-timeline" aria-labelledby={titleId}>
      <header>
        <h2 id={titleId}>Frise des permis ouverts</h2>
        <small>Heure de Paris</small>
      </header>
      <div className="work-permits-timeline__axis" aria-hidden="true">
        <span>{axisStart}</span>
        {axisStart === axisEnd ? null : <span>{axisEnd}</span>}
      </div>
      <ul>
        {rows.map((row) => {
          const elapsed = row.end - row.start;
          const duration = Math.max(0, elapsed - (row.pausedSeconds ?? 0) * 1000);
          const rowContent = (
            <>
              <span className="work-permits-timeline__label">
                <strong>{row.title}</strong>
                {row.location ? <small>{row.location}</small> : null}
              </span>
              <span className="work-permits-timeline__interval">
                <small>
                  <strong className="work-permits-timeline__status">
                    {row.state === 'paused' ? 'En pause' : row.state === 'running' ? 'En cours' : row.state === 'planned' ? 'À venir' : 'Clôturé'}
                  </strong>
                  {' · '}
                  <strong>{row.state === 'planned' ? '0 min' : formatDuration(duration)}</strong>
                  {' de travail'}
                </small>
                <small>
                  Début <time dateTime={row.startsAt}>{dateTime.format(row.start)}</time>
                  {row.pausedAt ? <> · Pause <time dateTime={row.pausedAt}>{dateTime.format(Date.parse(row.pausedAt))}</time></> : null}
                  {row.endsAt ? <> · Fin <time dateTime={row.endsAt}>{dateTime.format(row.end)}</time></> : null}
                </small>
                <span className="work-permits-timeline__track" aria-hidden="true">
                  <span
                    className="work-permits-timeline__bar"
                    style={{
                      insetInlineStart: `${(row.start - first) / range * 100}%`,
                      width: `${elapsed / range * 100}%`,
                    }}
                  />
                </span>
              </span>
            </>
          );
          return (
            <li key={row.id} data-state={row.state}>
              {onSelect ? (
                <button
                  type="button"
                  className="work-permits-timeline__row"
                  aria-pressed={selectedId === row.id}
                  onClick={() => onSelect(row.id)}
                >
                  {rowContent}
                </button>
              ) : <div className="work-permits-timeline__row">{rowContent}</div>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
