import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchSeaOperationPlanning, type SeaOperationPlanningChoice, type SeaOperationPlanningContext } from './seaOperationQueries';

export type DatedSeaOperationPlanningChoice = SeaOperationPlanningChoice & { date: string };
export interface SeaOperationPlanningWindow {
  startDate: string;
  endDate: string;
  choices: DatedSeaOperationPlanningChoice[];
  /** An exact selected-day context, including historical dates outside the offered window. */
  selectedContext: SeaOperationPlanningContext | null;
}

function calendarDateUtc(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1000) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : null;
}

/** Four calendar dates, independent of browser timezone and Paris DST transitions. */
export function seaOperationPlanningWindowDates(startDate: string): string[] {
  const start = calendarDateUtc(startDate);
  if (start === null) throw new Error('La date de début de la fenêtre Planning est invalide.');
  const dates = Array.from({ length: 4 }, (_, offset) => new Date(start + offset * 86_400_000).toISOString().slice(0, 10));
  if (dates.some(date => calendarDateUtc(date) === null)) throw new Error('La fenêtre Planning dépasse les dates prises en charge.');
  return dates;
}

/** The existing authenticated day RPC remains the only source of choices and captain permissions. */
export async function fetchSeaOperationPlanningWindow(client: SupabaseClient, startDate: string, selectedDate?: string | null): Promise<SeaOperationPlanningWindow> {
  const dates = seaOperationPlanningWindowDates(startDate);
  const selected = calendarDateUtc(selectedDate) === null ? null : selectedDate!;
  const requested = selected && !dates.includes(selected) ? [...dates, selected] : dates;
  const contexts = await Promise.all(requested.map(async date => {
    const context = await fetchSeaOperationPlanning(client, date);
    if (context.date !== date) throw new Error('La date du contexte Planning ne correspond pas au jour demandé.');
    return context;
  }));
  return { startDate, endDate: dates[3],
    choices: contexts.slice(0, dates.length).flatMap(context => context.choices.map(choice => ({ ...choice, date: context.date }))),
    selectedContext: selected ? contexts[requested.indexOf(selected)] : null };
}

export function seaOperationPlanningChoiceKey(choice: { date: string; operationId: string }): string {
  return `${choice.date}|${choice.operationId}`;
}

export function seaOperationPlanningChoiceLabel(choice: { date: string; project: string; vessel: { name: string } }): string {
  if (calendarDateUtc(choice.date) === null) throw new Error('La date du choix Planning est invalide.');
  return `${choice.date.slice(8, 10)}/${choice.date.slice(5, 7)}/${choice.date.slice(0, 4)} · ${choice.project} · ${choice.vessel.name}`;
}
