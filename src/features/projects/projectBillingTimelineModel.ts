import { addPlanningDays, isPlanningDate, planningDateFromTimestamp } from '../planning/planningDates';
import {
  billingApplicableHireRate,
  type BillingHireRate,
  type ProjectBillingDocument,
  type ProjectBillingPeriod,
} from './projectBilling';
import type { ProjectContractRecord, ProjectPlanningOccurrenceRecord, ProjectRecord } from './projectQueries';

type TimelineRate = BillingHireRate & { label: string };

interface TimelineRateGroup {
  rates: TimelineRate[];
  vessels: string[];
}

type TimelineEvent =
  | { kind: 'invoice'; date: string; invoiceNumber: string }
  | { kind: 'hire'; date: string; initial: boolean; groups: TimelineRateGroup[] }
  | { kind: 'end'; date: string };

interface TimelineInput {
  project: ProjectRecord;
  contract?: ProjectContractRecord;
  operations: ProjectPlanningOccurrenceRecord[];
  periods: ProjectBillingPeriod[];
  documents: ProjectBillingDocument[];
}

function projectDate(...values: string[]): string {
  for (const value of values) {
    const date = value?.slice(0, 10);
    if (!isPlanningDate(date)) continue;
    if (/(Z|[+-]\d{2}:\d{2})$/i.test(value) && !Number.isNaN(Date.parse(value))) {
      return planningDateFromTimestamp(value);
    }
    return date;
  }
  return '';
}

function equalHireRates(left: BillingHireRate, right: BillingHireRate | null): boolean {
  return right !== null && left.amount === right.amount && left.currency === right.currency && left.unit === right.unit;
}

function effectiveRates(
  operations: ProjectPlanningOccurrenceRecord[],
  contract: ProjectContractRecord | undefined,
  date: string,
  vessel: string,
): TimelineRate[] {
  const ordinary = billingApplicableHireRate(operations, contract, date, vessel);
  const standby = billingApplicableHireRate(operations, contract, date, vessel, 'standby');
  const weather = billingApplicableHireRate(operations, contract, date, vessel, 'weather-standby');
  const rates: TimelineRate[] = [];
  if (ordinary) rates.push({ ...ordinary, label: 'Affrètement' });
  if (standby && !equalHireRates(standby, ordinary)) rates.push({ ...standby, label: 'Stand-by' });
  if (weather && !equalHireRates(weather, ordinary)) rates.push({ ...weather, label: 'Stand-by météo' });
  return rates;
}

function effectiveRateGroups(
  operations: ProjectPlanningOccurrenceRecord[],
  contract: ProjectContractRecord | undefined,
  date: string,
): TimelineRateGroup[] {
  const vessels = new Map<string, string>();
  for (const operation of operations) {
    if (date < operation.startsOn || date > operation.endsOn) continue;
    for (const vessel of operation.vesselNames || [operation.primaryVesselName]) {
      if (vessel?.trim()) vessels.set(vessel.trim().toLocaleUpperCase('fr-FR'), vessel.trim());
    }
  }
  const vesselNames = vessels.size ? [...vessels.values()].sort() : [''];
  const groups = new Map<string, TimelineRateGroup>();
  for (const vessel of vesselNames) {
    const rates = effectiveRates(operations, contract, date, vessel);
    const key = JSON.stringify(rates);
    const group = groups.get(key);
    if (group) group.vessels.push(vessel);
    else groups.set(key, { rates, vessels: [vessel] });
  }
  return [...groups.values()];
}

export function buildProjectBillingTimeline({ project, contract, operations, periods, documents }: TimelineInput): TimelineEvent[] {
  // The billing period is created for drafts and expenses too. Only invoice evidence marks a month as billed.
  const invoicedPeriodIds = new Set(documents
    .filter((document) => document.documentKind === 'client_invoice')
    .map((document) => document.billingPeriodId));
  const events: TimelineEvent[] = [];
  for (const period of periods) {
    const date = `${period.periodMonth.slice(0, 7)}-01`;
    const invoiceNumber = period.invoiceNumber?.trim() || '';
    if (!isPlanningDate(date)) continue;
    if (invoiceNumber || period.invoiceIssuedOn || period.invoiceSentOn || period.paidOn || invoicedPeriodIds.has(period.id)) {
      events.push({ kind: 'invoice', date, invoiceNumber });
    }
  }

  const start = projectDate(project.deliveryAt, project.charterStartsAt, project.startsOn);
  const end = projectDate(project.redeliveryAt, project.charterEndsAt, project.endsOn);
  const rateBoundaries = new Set<string>(start ? [start] : []);
  for (const interval of [...(contract?.hirePeriods || []), ...operations]) {
    if (isPlanningDate(interval.startsOn)) rateBoundaries.add(interval.startsOn);
    if (isPlanningDate(interval.endsOn)) rateBoundaries.add(addPlanningDays(interval.endsOn, 1));
  }

  let previousRate = '';
  let seenRate = false;
  for (const date of [...rateBoundaries].sort()) {
    if ((start && date < start) || (end && date > end)) continue;
    const groups = effectiveRateGroups(operations, contract, date);
    const hasRate = groups.some((group) => group.rates.length);
    const signature = hasRate ? JSON.stringify(groups.length === 1 ? groups[0].rates : groups) : '';
    if (signature === previousRate) continue;
    events.push({ kind: 'hire', date, initial: !seenRate, groups });
    previousRate = signature;
    seenRate ||= hasRate;
  }

  if (end) events.push({ kind: 'end', date: end });
  return events.sort((left, right) => left.date.localeCompare(right.date));
}
