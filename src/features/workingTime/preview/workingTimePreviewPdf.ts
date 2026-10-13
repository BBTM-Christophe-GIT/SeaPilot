import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

/** Clock values from the preview, without a browser-dependent time zone conversion. */
export interface WorkingTimePreviewPdfPhase {
  startsAt: string;
  endsAt: string;
  comment?: string;
}

export interface WorkingTimePreviewPdfApproval {
  status: 'draft' | 'signed' | 'validated' | 'reopened';
  sailorName?: string;
  sailorSignedAt?: string;
  sailorPng?: Uint8Array;
  captainName?: string;
  captainSignedAt?: string;
  captainPng?: Uint8Array;
}

export interface WorkingTimePreviewPdfDay {
  date: string;
  phases: WorkingTimePreviewPdfPhase[];
  comment?: string;
  approval?: WorkingTimePreviewPdfApproval;
}

/** Deliberately excludes the screen's automatic rule evaluations. */
export interface WorkingTimePreviewPdfInput {
  kind: 'register' | 'report';
  personName: string;
  vesselName?: string;
  periodLabel: string;
  days: WorkingTimePreviewPdfDay[];
}

export interface WorkingTimePreviewGeneratedPdf {
  document: jsPDF;
  filename: string;
}

interface ClockRange { start: number; end: number }
interface DailyFacts {
  date: string;
  ranges: ClockRange[];
  workMinutes: number;
  restMinutes: number;
  comments: string[];
  approval?: WorkingTimePreviewPdfApproval;
}

const INK: [number, number, number] = [32, 48, 59];
const TEAL: [number, number, number] = [23, 94, 104];
const MUTED: [number, number, number] = [88, 103, 111];

function dayMinute(date: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Journée invalide : ${date}`);
  const timestamp = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (new Date(timestamp).toISOString().slice(0, 10) !== date) throw new Error(`Journée invalide : ${date}`);
  return timestamp / 60_000;
}

function localMinute(value: string): number {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::00)?$/.exec(value);
  if (!match || Number(match[2]) > 23 || Number(match[3]) > 59) {
    throw new Error(`Horaire local invalide : ${value}`);
  }
  return dayMinute(match[1]) + Number(match[2]) * 60 + Number(match[3]);
}

function mergedRanges(ranges: ClockRange[]): ClockRange[] {
  const merged: ClockRange[] = [];
  for (const range of [...ranges].sort((left, right) => left.start - right.start || left.end - right.end)) {
    const previous = merged.at(-1);
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
}

function factualDays(input: WorkingTimePreviewPdfInput): DailyFacts[] {
  const phases = input.days.flatMap((day) => day.phases.map((phase) => {
    const start = localMinute(phase.startsAt);
    const end = localMinute(phase.endsAt);
    if (end <= start) throw new Error('La fin de la plage doit suivre son début.');
    return { start, end, comment: phase.comment?.trim() };
  }));
  const uniqueDays = new Map<string, WorkingTimePreviewPdfDay>();
  for (const day of input.days) {
    if (uniqueDays.has(day.date)) throw new Error(`Journée présente plusieurs fois : ${day.date}`);
    uniqueDays.set(day.date, day);
  }
  return [...uniqueDays.values()].sort((left, right) => left.date.localeCompare(right.date)).map((day) => {
    const start = dayMinute(day.date);
    const end = start + 1440;
    const relevant = phases.filter((phase) => phase.start < end && phase.end > start);
    const ranges = mergedRanges(relevant.map((phase) => ({
      start: Math.max(phase.start, start) - start,
      end: Math.min(phase.end, end) - start,
    })));
    const workMinutes = ranges.reduce((sum, range) => sum + range.end - range.start, 0);
    return {
      date: day.date,
      ranges,
      workMinutes,
      restMinutes: 1440 - workMinutes,
      comments: [...new Set([day.comment?.trim(), ...relevant.map((phase) => phase.comment)].filter((value): value is string => Boolean(value)))],
      approval: day.approval,
    };
  });
}

function clock(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

function hours(minutes: number): string {
  const remainder = minutes % 60;
  return `${Math.floor(minutes / 60)} h${remainder ? ` ${String(remainder).padStart(2, '0')}` : ''}`;
}

function displayDate(date: string): string {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}

function approvalLabel(approval?: WorkingTimePreviewPdfApproval): string {
  switch (approval?.status) {
    case 'signed': return 'Signé par le marin';
    case 'validated': return 'Validé';
    case 'reopened': return 'Réouvert';
    default: return 'Brouillon';
  }
}

function safeFilename(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9-]+/gi, '-').replace(/^-|-$/g, '');
}

/** Both export buttons use these factual records, independently of visual annotations. */
export function buildWorkingTimePreviewPdf(input: WorkingTimePreviewPdfInput): WorkingTimePreviewGeneratedPdf {
  if (!input.days.length) throw new Error('Sélectionnez au moins une journée à exporter.');
  const facts = factualDays(input);
  const document = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const width = document.internal.pageSize.getWidth();
  const height = document.internal.pageSize.getHeight();
  const left = 14;
  let y = 17;
  const ensure = (needed: number) => {
    if (y + needed > height - 17) { document.addPage(); y = 17; }
  };
  const paragraph = (value: string, bold = false) => {
    document.setTextColor(...INK);
    document.setFont('helvetica', bold ? 'bold' : 'normal');
    document.setFontSize(9);
    const lines = document.splitTextToSize(value, width - left * 2) as string[];
    for (const line of lines) { ensure(5); document.text(line, left, y); y += 4.5; }
    y += 2;
  };
  document.setFont('helvetica', 'bold');
  document.setFontSize(17);
  document.setTextColor(...TEAL);
  document.text(input.kind === 'register' ? 'Registre du temps de travail' : 'Rapport du temps de travail', left, y);
  y += 8;
  paragraph(`${input.personName}${input.vesselName ? ` • ${input.vesselName}` : ''} • ${input.periodLabel}`, true);
  paragraph('Préversion — données saisies dans cet écran.');
  const workTotal = facts.reduce((sum, day) => sum + day.workMinutes, 0);
  const restTotal = facts.reduce((sum, day) => sum + day.restMinutes, 0);
  paragraph(`${facts.length} journée(s) • Travail saisi : ${hours(workTotal)} • Temps hors plages de travail : ${hours(restTotal)}`);
  autoTable(document, {
    startY: y,
    margin: { left, right: left, top: 14, bottom: 17 },
    head: [['Journée', 'Plages de travail (heure locale)', 'Travail saisi', 'Temps hors plages', 'État']],
    body: facts.map((day) => [
      displayDate(day.date),
      day.ranges.length ? day.ranges.map((range) => `${clock(range.start)} - ${clock(range.end)}`).join('\n') : 'Aucune plage saisie',
      hours(day.workMinutes), hours(day.restMinutes), approvalLabel(day.approval),
    ]),
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 9, textColor: INK, lineColor: [216, 224, 227], lineWidth: 0.15, cellPadding: 3 },
    headStyles: { fillColor: TEAL, textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [246, 248, 249] },
  });
  y = (document as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  y += 9;
  paragraph('Les temps hors plages sont calculés à partir des horaires saisis ; ils ne constituent pas une attestation de repos.');

  const hasCurrentApproval = (day: DailyFacts) => day.approval?.status === 'signed' || day.approval?.status === 'validated';
  const documented = facts.filter((day) => day.comments.length || (hasCurrentApproval(day) && (day.approval?.sailorName || day.approval?.captainName)));
  if (documented.length) {
    ensure(12);
    paragraph('Commentaires et validations', true);
    for (const day of documented) {
      ensure(12);
      paragraph(displayDate(day.date), true);
      for (const comment of day.comments) paragraph(comment);
      if (!hasCurrentApproval(day)) continue;
      for (const [label, name, signedAt, png] of [
        ['Marin', day.approval?.sailorName, day.approval?.sailorSignedAt, day.approval?.sailorPng],
        ['Capitaine / validateur', day.approval?.status === 'validated' ? day.approval.captainName : undefined, day.approval?.captainSignedAt, day.approval?.captainPng],
      ] as const) {
        if (!name) continue;
        paragraph(`${label} : ${name}${signedAt ? ` • ${signedAt}` : ''}`);
        if (png) { ensure(18); document.addImage(png, 'PNG', left, y, 45, 14, undefined, 'FAST'); y += 18; }
      }
    }
  }
  const pageCount = document.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    document.setPage(page);
    document.setFont('helvetica', 'normal');
    document.setFontSize(8);
    document.setTextColor(...MUTED);
    document.text(`SeaPilot • Préversion • ${page}/${pageCount}`, left, height - 8);
  }
  return {
    document,
    filename: `SeaPilot-preversion-${input.kind === 'register' ? 'registre' : 'rapport'}-${safeFilename(input.personName)}-${facts[0].date}.pdf`,
  };
}
