import type { SupabaseClient } from '@supabase/supabase-js';
import { jsPDF } from 'jspdf';
import type { WorkingTimeInterval } from './workingTimeModel';
import type {
  WorkingTimeSignatureSnapshot,
  WorkingTimeValidationEvent,
  WorkingTimeWorkspace,
  WorkingTimeWorkspaceRegister,
} from './workingTimeQueries';

export interface WorkingTimePdfSignature {
  label: string;
  snapshot: WorkingTimeSignatureSnapshot | null;
  png: Uint8Array | null;
}

export interface WorkingTimePdfInput {
  register: WorkingTimeWorkspaceRegister;
  workspace: WorkingTimeWorkspace;
  signatures: WorkingTimePdfSignature[];
  audit: WorkingTimeValidationEvent[];
}

export interface WorkingTimeGeneratedPdf {
  document: jsPDF;
  filename: string;
}

interface DayPhase {
  startMinute: number;
  endMinute: number;
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon',
  awaiting_sailor_signature: 'Signature du marin attendue',
  submitted: 'Soumis au contrôle',
  validated: 'Validé',
  reopened: 'Rouvert pour correction',
};

const CAUSE_LABELS: Record<string, string> = {
  unexpected_operation: 'Opération imprévue',
  safety_emergency: 'Urgence de sécurité',
  weather: 'Conditions météorologiques',
  handover: 'Relève / passation',
  breakdown_maintenance: 'Panne / maintenance',
  understaffing: 'Sous-effectif',
  other: 'Autre',
};

const SEA_BLUE: [number, number, number] = [10, 65, 82];
const SEA_TEAL: [number, number, number] = [16, 143, 161];
const GRID_BLUE: [number, number, number] = [65, 93, 108];
const LIGHT_BLUE: [number, number, number] = [230, 241, 244];
const NON_COMPLIANT: [number, number, number] = [139, 38, 53];

function formatDateTime(value: string): string {
  if (!value) return '';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function formatMonth(value: string): string {
  const label = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(new Date(`${value.slice(0, 7)}-15T12:00:00`));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function compactHours(seconds: number): string {
  const totalMinutes = Math.max(0, Math.round(seconds / 60));
  const hourValue = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hourValue} h ${String(minutes).padStart(2, '0')}` : `${hourValue} h`;
}

function safeFilename(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9-]+/gi, '-').replace(/^-|-$/g, '');
}

function dateValues(start: string, end: string): string[] {
  const values: string[] = [];
  const current = new Date(`${start}T12:00:00`);
  const last = new Date(`${end}T12:00:00`);
  while (current <= last && values.length < 31) {
    values.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }
  return values;
}

function zonedDateAndMinute(value: string, timezoneName: string): { date: string; minute: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezoneName,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || '0';
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    minute: Number(part('hour')) * 60 + Number(part('minute')),
  };
}

function phasesForDay(day: string, intervals: WorkingTimeInterval[]): DayPhase[] {
  return intervals
    .filter((interval) => interval.localWorkDate === day)
    .map((interval) => {
      const start = zonedDateAndMinute(interval.startsAt, interval.timezoneName);
      const end = zonedDateAndMinute(interval.endsAt, interval.timezoneName);
      return {
        startMinute: start.date < day ? 0 : start.minute,
        endMinute: end.date > day ? 1440 : end.minute,
      };
    })
    .filter((phase) => phase.endMinute > phase.startMinute)
    .sort((left, right) => left.startMinute - right.startMinute);
}

function phaseSeconds(phases: DayPhase[]): number {
  return phases.reduce((total, phase) => total + (phase.endMinute - phase.startMinute) * 60, 0);
}

function latestSignatureEvent(events: WorkingTimeValidationEvent[], eventType: string) {
  return events.find((event) => event.eventType === eventType)?.signatureSnapshot || null;
}

function fitText(document: jsPDF, value: string, width: number): string {
  if (!value) return '';
  if (document.getTextWidth(value) <= width) return value;
  let fitted = value;
  while (fitted.length > 1 && document.getTextWidth(`${fitted}…`) > width) fitted = fitted.slice(0, -1);
  return `${fitted}…`;
}

async function downloadSignature(client: SupabaseClient, snapshot: WorkingTimeSignatureSnapshot | null): Promise<Uint8Array | null> {
  if (!snapshot) return null;
  const { data, error } = await client.storage.from(snapshot.storageBucket).download(snapshot.storagePath);
  if (error || !data) throw new Error(`Impossible de charger la signature figée de ${snapshot.signerName}.`);
  return new Uint8Array(await data.arrayBuffer());
}

export async function prepareWorkingTimePdf(
  client: SupabaseClient,
  workspace: WorkingTimeWorkspace,
  register: WorkingTimeWorkspaceRegister,
): Promise<WorkingTimePdfInput> {
  const audit = workspace.validations
    .filter((event) => event.registerId === register.id)
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
  const sailor = latestSignatureEvent(audit, 'sailor_signed');
  const validator = latestSignatureEvent(audit, 'captain_validated');
  const [sailorPng, validatorPng] = await Promise.all([
    downloadSignature(client, sailor),
    downloadSignature(client, validator),
  ]);
  return {
    register,
    workspace,
    signatures: [
      { label: 'Marin', snapshot: sailor, png: sailorPng },
      { label: 'Capitaine / validateur', snapshot: validator, png: validatorPng },
    ],
    audit,
  };
}

export async function buildWorkingTimePdf(input: WorkingTimePdfInput): Promise<WorkingTimeGeneratedPdf> {
  const document = new jsPDF({ compress: true, format: 'a4', orientation: 'landscape', unit: 'mm' });
  const { register, workspace } = input;
  const intervals = workspace.intervals.filter((interval) => interval.personId === register.personId
    && interval.localWorkDate >= register.periodStart && interval.localWorkDate <= register.periodEnd);
  const calculations = workspace.calculations.filter((calculation) => calculation.personId === register.personId
    && calculation.localWindowEndDate >= register.periodStart
    && calculation.localWindowEndDate <= register.periodEnd);
  const comments = workspace.dayComments.filter((comment) => comment.personId === register.personId
    && comment.localWorkDate >= register.periodStart && comment.localWorkDate <= register.periodEnd);
  const nonCompliantDates = new Set(calculations
    .filter((calculation) => calculation.isCompliant === false)
    .map((calculation) => calculation.localWindowEndDate));
  const primaryVessel = workspace.vessels.find((item) => item.id === intervals.find((item) => item.vesselId)?.vesselId);
  const approvedImport = input.audit.find((event) => event.eventType === 'approved_import');
  const captainValidation = input.audit.find((event) => event.eventType === 'captain_validated');
  const validatorName = approvedImport?.actorName || captainValidation?.actorName || 'Non renseigné';
  const sourceFiles = Array.from(new Set(intervals
    .filter((interval) => interval.sourceType === 'excel_import' && interval.sourceReference)
    .map((interval) => interval.sourceReference as string)));
  const gridDays = dateValues(register.periodStart, register.periodEnd);

  document.setFillColor(...SEA_BLUE);
  document.rect(0, 0, 297, 10, 'F');
  document.setTextColor(255, 255, 255);
  document.setFont('helvetica', 'bold');
  document.setFontSize(11);
  document.text('REGISTRE MENSUEL DES HEURES DE TRAVAIL ET DE REPOS', 7, 6.8);

  const metadata = [
    ['Marin', register.personName],
    ['Fonction', register.functionLabel || 'Personnel maritime'],
    ['Mois', formatMonth(register.periodStart)],
    ['Navire', primaryVessel?.name || 'Non renseigné'],
    ['OMI', primaryVessel?.imoNumber || 'Non renseigné'],
    ['Pavillon', primaryVessel?.flagState || 'Non renseigné'],
    ['Capitaine / validateur', validatorName],
    ['Statut', approvedImport ? 'Validé - import XLSM approuvé' : STATUS_LABELS[register.status] || register.status],
  ];
  const metadataWidth = 70.75;
  document.setFontSize(5.9);
  for (let index = 0; index < metadata.length; index += 1) {
    const metadataX = 7 + (index % 4) * metadataWidth;
    const metadataY = 12 + Math.floor(index / 4) * 10;
    document.setFillColor(...LIGHT_BLUE);
    document.setDrawColor(170, 191, 200);
    document.rect(metadataX, metadataY, metadataWidth, 9, 'FD');
    document.setTextColor(65, 93, 108);
    document.setFont('helvetica', 'bold');
    document.text(metadata[index][0].toUpperCase(), metadataX + 1.5, metadataY + 3);
    document.setTextColor(23, 39, 50);
    document.setFontSize(6.8);
    document.text(fitText(document, metadata[index][1], metadataWidth - 3), metadataX + 1.5, metadataY + 7);
    document.setFontSize(5.9);
  }

  input.signatures.forEach((signature, index) => {
    const signatureX = index === 0 ? 7 : 150;
    const signatureY = 32;
    document.setDrawColor(170, 191, 200);
    document.setFillColor(250, 252, 253);
    document.roundedRect(signatureX, signatureY, 140, 12, 1.2, 1.2, 'FD');
    document.setTextColor(65, 93, 108);
    document.setFont('helvetica', 'bold');
    document.setFontSize(5.4);
    document.text(signature.label.toUpperCase(), signatureX + 1.5, signatureY + 2.8);
    if (signature.snapshot && signature.png) {
      document.addImage(signature.png, 'PNG', signatureX + 1.5, signatureY + 3.7, 28, 6.5, undefined, 'FAST');
      document.setTextColor(23, 39, 50);
      document.setFont('helvetica', 'normal');
      document.setFontSize(5.4);
      document.text(fitText(document, `${signature.snapshot.signerName} - ${signature.snapshot.signerRoles.join(', ')}`, 104), signatureX + 32, signatureY + 6.5);
      document.text(`${formatDateTime(signature.snapshot.signedAt)} - signature v${signature.snapshot.versionNumber}`, signatureX + 32, signatureY + 9.5);
    } else {
      document.setTextColor(83, 107, 121);
      document.setFont('helvetica', 'normal');
      document.setFontSize(5.8);
      document.text(approvedImport ? 'Non requise - XLSM déjà approuvé' : 'Signature non apposée', signatureX + 32, signatureY + 7.5);
    }
  });

  document.setTextColor(45, 58, 66);
  document.setFont('helvetica', 'normal');
  document.setFontSize(6.2);
  document.text('Veuillez marquer les périodes de travail par une plage continue. Les cases sont divisées en demi-heures.', 7, 47);
  if (sourceFiles.length) {
    document.setFont('helvetica', 'bold');
    document.text(`Source approuvée : ${fitText(document, sourceFiles.join(', '), 108)}`, 290, 47, { align: 'right' });
  }

  const x = 7;
  const tableTop = 50;
  const dateWidth = 10;
  const slotWidth = 2.55;
  const timelineWidth = slotWidth * 48;
  const restWidth = 17;
  const commentWidth = 55;
  const work24Width = 37;
  const work7Width = 36;
  const groupHeaderHeight = 5;
  const hourHeaderHeight = 9;
  const rowHeight = 4;
  const bottomHeaderHeight = 5;
  const timelineX = x + dateWidth;
  const restX = timelineX + timelineWidth;
  const commentX = restX + restWidth;
  const work24X = commentX + commentWidth;
  const work7X = work24X + work24Width;
  const tableRight = work7X + work7Width;
  const bodyTop = tableTop + groupHeaderHeight + hourHeaderHeight;
  const bodyBottom = bodyTop + gridDays.length * rowHeight;
  const tableBottom = bodyBottom + bottomHeaderHeight;

  document.setDrawColor(...GRID_BLUE);
  document.setLineWidth(0.22);
  document.setFillColor(245, 248, 249);
  document.rect(x, tableTop, tableRight - x, groupHeaderHeight + hourHeaderHeight, 'FD');
  document.rect(x, bodyTop, tableRight - x, gridDays.length * rowHeight + bottomHeaderHeight);
  document.setFillColor(...LIGHT_BLUE);
  document.rect(work24X, tableTop, work24Width + work7Width, groupHeaderHeight, 'F');
  document.setTextColor(23, 39, 50);
  document.setFont('helvetica', 'bold');
  document.setFontSize(5.5);
  document.text('À NE PAS REMPLIR PAR LE MARIN', work24X + (work24Width + work7Width) / 2, tableTop + 3.4, { align: 'center' });
  document.text('HEURES', x + 1.2, tableTop + 3.4);
  document.text('Date', x + dateWidth / 2, tableTop + groupHeaderHeight + 5.8, { align: 'center' });

  document.setFontSize(4.6);
  for (let hour = 0; hour < 24; hour += 1) {
    const hourX = timelineX + hour * slotWidth * 2;
    document.text(String(hour).padStart(2, '0'), hourX + slotWidth, tableTop + groupHeaderHeight + 3.5, { align: 'center' });
  }
  const headerText = (lines: string[], startX: number, width: number) => {
    document.setFontSize(4.4);
    const startY = tableTop + groupHeaderHeight + 2.7;
    lines.forEach((line, index) => document.text(line, startX + width / 2, startY + index * 2.2, { align: 'center' }));
  };
  headerText(['Repos total', 'sur 24 h'], restX, restWidth);
  headerText(['Commentaires'], commentX, commentWidth);
  headerText(['Travail / repos', 'sur toute période', 'de 24 heures'], work24X, work24Width);
  headerText(['Travail / repos', 'sur toute période', 'de 7 jours'], work7X, work7Width);

  const majorColumns = [x, timelineX, restX, commentX, work24X, work7X, tableRight];
  majorColumns.forEach((columnX) => document.line(columnX, tableTop, columnX, tableBottom));
  document.line(work24X, tableTop + groupHeaderHeight, tableRight, tableTop + groupHeaderHeight);
  document.line(x, bodyTop, tableRight, bodyTop);

  for (let slot = 0; slot <= 48; slot += 1) {
    const slotX = timelineX + slot * slotWidth;
    if (slot % 2) {
      document.setDrawColor(166, 184, 192);
      document.setLineDashPattern([0.35, 0.35], 0);
      document.setLineWidth(0.12);
    } else {
      document.setDrawColor(...GRID_BLUE);
      document.setLineDashPattern([], 0);
      document.setLineWidth(0.18);
    }
    document.line(slotX, tableTop + groupHeaderHeight, slotX, tableBottom);
  }
  document.setLineDashPattern([], 0);

  gridDays.forEach((day, dayIndex) => {
    const rowY = bodyTop + dayIndex * rowHeight;
    const phases = phasesForDay(day, intervals);
    const workedSeconds = phaseSeconds(phases);
    const dayCalculation = calculations
      .filter((calculation) => calculation.localWindowEndDate === day)
      .sort((left, right) => left.windowEnd.localeCompare(right.windowEnd)).at(-1);
    const dayComment = comments.find((comment) => comment.localWorkDate === day);
    const intervalComments = Array.from(new Set(intervals
      .filter((interval) => interval.localWorkDate === day && interval.comment)
      .map((interval) => interval.comment as string)));
    const commentText = dayComment
      ? `NON CONFORME - ${CAUSE_LABELS[dayComment.causeCategory || ''] || 'Cause'} - ${dayComment.comment}`
      : intervalComments.join(' / ');

    if (nonCompliantDates.has(day)) {
      document.setFillColor(253, 229, 233);
      document.rect(x, rowY, dateWidth, rowHeight, 'F');
      document.setTextColor(...NON_COMPLIANT);
    } else {
      document.setTextColor(23, 39, 50);
    }
    phases.forEach((phase) => {
      const firstSlot = Math.floor(phase.startMinute / 30);
      const lastSlot = Math.ceil(phase.endMinute / 30);
      for (let slot = firstSlot; slot < lastSlot; slot += 1) {
        const slotStart = slot * 30;
        const slotEnd = slotStart + 30;
        if (phase.startMinute < slotEnd && phase.endMinute > slotStart) {
          document.setFillColor(...SEA_TEAL);
          document.rect(timelineX + slot * slotWidth + .12, rowY + .12, slotWidth - .24, rowHeight - .24, 'F');
        }
      }
    });

    document.setFont('helvetica', 'bold');
    document.setFontSize(5.2);
    document.text(day.slice(8), x + dateWidth / 2, rowY + 3.05, { align: 'center' });
    document.setTextColor(23, 39, 50);
    document.setFont('helvetica', 'normal');
    document.setFontSize(4.5);
    document.text(compactHours(86400 - workedSeconds), restX + restWidth / 2, rowY + 3.05, { align: 'center' });
    document.text(fitText(document, commentText, commentWidth - 2), commentX + 1, rowY + 3.05);
    const complianceMark = dayCalculation?.isCompliant === false ? 'NC - ' : '';
    document.text(dayCalculation
      ? `${complianceMark}T ${compactHours(dayCalculation.work24hSeconds)} / R ${compactHours(dayCalculation.rest24hSeconds)}`
      : `T ${compactHours(workedSeconds)} / R ${compactHours(86400 - workedSeconds)}`,
    work24X + work24Width / 2, rowY + 3.05, { align: 'center' });
    document.text(dayCalculation
      ? `${complianceMark}T ${compactHours(dayCalculation.work7dSeconds)} / R ${compactHours(dayCalculation.rest7dSeconds)}`
      : '—',
    work7X + work7Width / 2, rowY + 3.05, { align: 'center' });
    document.setDrawColor(...GRID_BLUE);
    document.setLineWidth(0.12);
    document.line(x, rowY + rowHeight, tableRight, rowY + rowHeight);
  });

  document.setFont('helvetica', 'bold');
  document.setFontSize(4.4);
  document.text('HEURES', x + 1.2, bodyBottom + 3.3);
  for (let hour = 0; hour < 24; hour += 1) {
    document.text(String(hour).padStart(2, '0'), timelineX + hour * slotWidth * 2 + slotWidth, bodyBottom + 3.3, { align: 'center' });
  }

  document.setTextColor(97, 115, 129);
  document.setFontSize(6.5);
  const pageHeight = document.internal.pageSize.getHeight();
  const pageWidth = document.internal.pageSize.getWidth();
  document.text(`Généré le ${formatDateTime(new Date().toISOString())}`, 7, pageHeight - 4);
  document.text('Page 1/1', pageWidth - 7, pageHeight - 4, { align: 'right' });

  return {
    document,
    filename: `registre-mensuel-temps-travail-${safeFilename(register.personName)}-${register.periodStart.slice(0, 7)}.pdf`,
  };
}
