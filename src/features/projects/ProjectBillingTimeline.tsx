import { useId, useMemo } from 'react';
import { parsePlanningDate } from '../planning/planningDates';
import type { BillingHireRate, ProjectBillingDocument, ProjectBillingPeriod } from './projectBilling';
import { buildProjectBillingTimeline } from './projectBillingTimelineModel';
import type { ProjectContractRecord, ProjectPlanningOccurrenceRecord, ProjectRecord } from './projectQueries';
import './ProjectBillingTimeline.css';

const dayFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const monthFormat = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const amountFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const NO_PERIODS: ProjectBillingPeriod[] = [];
const NO_DOCUMENTS: ProjectBillingDocument[] = [];

interface ProjectBillingTimelineProps {
  project: ProjectRecord;
  contract?: ProjectContractRecord;
  operations: ProjectPlanningOccurrenceRecord[];
  periods?: ProjectBillingPeriod[];
  documents?: ProjectBillingDocument[];
  loading?: boolean;
}

function formatRate(rate: BillingHireRate): string {
  return `${amountFormat.format(rate.amount)} ${rate.currency === 'EUR' ? '€' : rate.currency}${rate.unit ? ` / ${rate.unit}` : ''}`;
}

export function ProjectBillingTimeline({
  project,
  contract,
  operations,
  periods = NO_PERIODS,
  documents = NO_DOCUMENTS,
  loading = false,
}: ProjectBillingTimelineProps) {
  const heading = useId();
  const events = useMemo(() => buildProjectBillingTimeline({ project, contract, operations, periods, documents }),
    [project, contract, operations, periods, documents]);

  return (
    <section aria-labelledby={heading} className="project-billing-timeline">
      <h3 id={heading}>Chronologie du projet</h3>
      {events.length ? (
        <ol aria-labelledby={heading} role="list" tabIndex={0}>
          {events.map((event) => (
            <li className={`project-billing-timeline-event is-${event.kind}`} key={`${event.kind}-${event.date}`}>
              <time dateTime={event.kind === 'invoice' ? event.date.slice(0, 7) : event.date}>
                {(event.kind === 'invoice' ? monthFormat : dayFormat).format(parsePlanningDate(event.date))}
              </time>
              {event.kind === 'invoice' ? (
                <>
                  <strong>Mois facturé</strong>
                  {event.invoiceNumber ? <span>Facture {event.invoiceNumber}</span> : null}
                </>
              ) : event.kind === 'hire' ? (
                <>
                  <strong>{event.initial ? 'Loyer initial' : 'Changement de loyer'}</strong>
                  {event.groups.map((group) => (
                    <div key={group.vessels.join('|')} className="project-billing-timeline-rates">
                      {event.groups.length > 1 ? <span>{group.vessels.join(', ')}</span> : null}
                      {group.rates.length ? group.rates.map((rate) => (
                        <span key={rate.label}>{group.rates.length > 1 || rate.label !== 'Affrètement' ? `${rate.label} · ` : ''}{formatRate(rate)}</span>
                      )) : <span>Aucun loyer renseigné</span>}
                    </div>
                  ))}
                </>
              ) : <strong>Fin du contrat</strong>}
            </li>
          ))}
        </ol>
      ) : <p>{loading ? 'Chargement de la chronologie…' : 'Aucune étape renseignée.'}</p>}
    </section>
  );
}
