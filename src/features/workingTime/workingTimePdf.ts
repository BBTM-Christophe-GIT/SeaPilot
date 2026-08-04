import type { SupabaseClient } from '@supabase/supabase-js';
import type { jsPDF } from 'jspdf';
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

const STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon',
  awaiting_sailor_signature: 'Signature du marin attendue',
  submitted: 'Soumis au contrôle',
  validated: 'Validé et verrouillé',
  reopened: 'Rouvert pour correction',
};

const EVENT_LABELS: Record<string, string> = {
  signature_requested: 'Signature demandée',
  sailor_signed: 'Signé et soumis',
  captain_validated: 'Validé',
  reopened: 'Rouvert',
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

function formatDateTime(value: string): string {
  if (!value) return '';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function hours(seconds: number): string {
  return `${(seconds / 3600).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} h`;
}

function safeFilename(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9-]+/gi, '-').replace(/^-|-$/g, '');
}

function latestSignatureEvent(events: WorkingTimeValidationEvent[], eventType: string) {
  return events.find((event) => event.eventType === eventType)?.signatureSnapshot || null;
}

async function downloadSignature(client: SupabaseClient, snapshot: WorkingTimeSignatureSnapshot | null): Promise<Uint8Array | null> {
  if (!snapshot) return null;
  const { data, error } = await client.storage.from(snapshot.storageBucket).download(snapshot.storagePath);
  if (error || !data) {
    throw new Error(`Impossible de charger la signature figée de ${snapshot.signerName}.`);
  }
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
      { label: 'Titulaire du registre', snapshot: sailor, png: sailorPng },
      { label: 'Validateur', snapshot: validator, png: validatorPng },
    ],
    audit,
  };
}

export async function buildWorkingTimePdf(input: WorkingTimePdfInput): Promise<WorkingTimeGeneratedPdf> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const document = new jsPDF({ compress: true, format: 'a4', orientation: 'portrait', unit: 'mm' });
  const { register, workspace } = input;
  const intervals = workspace.intervals.filter((interval) => interval.registerId === register.id);
  const calculations = workspace.calculations.filter((calculation) => calculation.personId === register.personId
    && calculation.localWindowEndDate >= register.periodStart
    && calculation.localWindowEndDate <= register.periodEnd);
  const comments = workspace.dayComments.filter((comment) => comment.registerId === register.id);
  const nonCompliantDates = Array.from(new Set(calculations
    .filter((calculation) => calculation.isCompliant === false)
    .map((calculation) => calculation.localWindowEndDate))).sort();
  let cursor = 18;

  const ensureSpace = (height: number) => {
    if (cursor + height <= 280) return;
    document.addPage();
    cursor = 18;
  };
  const sectionTitle = (title: string) => {
    ensureSpace(12);
    document.setTextColor(12, 96, 116);
    document.setFont('helvetica', 'bold');
    document.setFontSize(11);
    document.text(title, 14, cursor);
    document.setDrawColor(188, 210, 218);
    document.line(14, cursor + 2, 196, cursor + 2);
    cursor += 8;
  };

  document.setFillColor(10, 65, 82);
  document.rect(0, 0, 210, 13, 'F');
  document.setTextColor(255, 255, 255);
  document.setFont('helvetica', 'bold');
  document.setFontSize(13);
  document.text('SeaPilot - Registre du temps de travail', 14, 9);

  document.setTextColor(24, 33, 50);
  document.setFontSize(16);
  document.text(register.personName, 14, cursor);
  document.setFontSize(9);
  document.setFont('helvetica', 'normal');
  document.text(`${register.functionLabel || 'Personnel maritime'} - ${register.periodStart} au ${register.periodEnd}`, 14, cursor + 6);
  document.setFont('helvetica', 'bold');
  document.setTextColor(register.status === 'validated' ? 23 : 129, register.status === 'validated' ? 96 : 82, register.status === 'validated' ? 58 : 11);
  document.text(STATUS_LABELS[register.status] || register.status, 196, cursor, { align: 'right' });
  cursor += 14;

  sectionTitle('Créneaux de travail - source de vérité');
  autoTable(document, {
    startY: cursor,
    head: [['Date', 'Début', 'Fin', 'Durée', 'Navire / bordée', 'Commentaire']],
    body: intervals.map((interval) => {
      const vessel = workspace.vessels.find((item) => item.id === interval.vesselId)?.name || 'Sans navire';
      return [
        interval.localWorkDate,
        formatDateTime(interval.startsAt),
        formatDateTime(interval.endsAt),
        hours((Date.parse(interval.endsAt) - Date.parse(interval.startsAt)) / 1000),
        `${vessel}${interval.watchGroup ? ` / ${interval.watchGroup}` : ''}`,
        interval.comment || '',
      ];
    }),
    styles: { cellPadding: 1.5, fontSize: 7 },
    headStyles: { fillColor: [12, 96, 116] },
    margin: { left: 14, right: 14 },
  });
  cursor = ((document as typeof document & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || cursor + 12) + 8;

  sectionTitle('Conformité - fenêtres glissantes 24 h et 7 jours');
  if (nonCompliantDates.length === 0) {
    document.setTextColor(23, 96, 58);
    document.setFont('helvetica', 'bold');
    document.text('CONFORME - aucune règle enfreinte sur la période calculée.', 14, cursor);
    cursor += 9;
  } else {
    document.setTextColor(139, 38, 53);
    document.setFont('helvetica', 'bold');
    document.text(`NON CONFORME - ${nonCompliantDates.length} journée(s) enfreignent au moins une règle.`, 14, cursor);
    cursor += 7;
    autoTable(document, {
      startY: cursor,
      head: [['Date', 'Statut', 'Règles enfreintes', 'Travail 24 h', 'Repos 24 h', 'Travail 7 j', 'Repos 7 j']],
      body: nonCompliantDates.map((date) => {
        const dateCalculations = calculations.filter((calculation) => calculation.localWindowEndDate === date && calculation.isCompliant === false);
        const latest = dateCalculations.at(-1);
        return [
          date,
          'NON CONFORME',
          Array.from(new Set(dateCalculations.flatMap((calculation) => calculation.violationCodes))).join(', '),
          latest ? hours(latest.work24hSeconds) : '',
          latest ? hours(latest.rest24hSeconds) : '',
          latest ? hours(latest.work7dSeconds) : '',
          latest ? hours(latest.rest7dSeconds) : '',
        ];
      }),
      styles: { cellPadding: 1.4, fontSize: 6.8 },
      headStyles: { fillColor: [139, 38, 53] },
      margin: { left: 14, right: 14 },
    });
    cursor = ((document as typeof document & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || cursor + 12) + 7;

    for (const date of nonCompliantDates) {
      const response = comments.find((comment) => comment.localWorkDate === date);
      ensureSpace(42);
      document.setFillColor(254, 247, 235);
      document.roundedRect(14, cursor, 182, 37, 2, 2, 'F');
      document.setTextColor(139, 38, 53);
      document.setFont('helvetica', 'bold');
      document.text(`${date} - NON CONFORME`, 17, cursor + 5);
      document.setTextColor(24, 33, 50);
      document.setFontSize(7.5);
      const details = response ? [
        `Cause : ${CAUSE_LABELS[response.causeCategory || ''] || response.causeCategory || 'Non renseignée'}`,
        `Contexte : ${response.operationalContext || 'Non renseigné'}`,
        `Action immédiate : ${response.immediateAction || 'Non renseignée'}`,
        `Repos compensateur : ${response.compensatoryRestPlan || 'Non renseigné'}`,
        `Commentaire : ${response.comment || 'Non renseigné'}`,
      ] : ['Réponse structurée du capitaine non enregistrée.'];
      let lineY = cursor + 10;
      for (const detail of details) {
        const lines = document.splitTextToSize(detail, 174) as string[];
        document.text(lines, 17, lineY);
        lineY += lines.length * 3.3 + 1;
      }
      cursor += 42;
    }
  }

  sectionTitle('Signatures figées');
  ensureSpace(48);
  input.signatures.forEach((signature, index) => {
    const x = index === 0 ? 14 : 107;
    document.setDrawColor(188, 210, 218);
    document.roundedRect(x, cursor, 89, 42, 2, 2);
    document.setTextColor(83, 107, 121);
    document.setFontSize(7.5);
    document.setFont('helvetica', 'bold');
    document.text(signature.label.toUpperCase(), x + 4, cursor + 5);
    if (signature.snapshot && signature.png) {
      document.addImage(signature.png, 'PNG', x + 4, cursor + 8, 50, 17, undefined, 'FAST');
    } else {
      document.setFont('helvetica', 'normal');
      document.text('Signature non apposée', x + 4, cursor + 17);
    }
    if (signature.snapshot) {
      document.setFont('helvetica', 'normal');
      document.setTextColor(24, 33, 50);
      document.text(`${signature.snapshot.signerName} - ${signature.snapshot.signerRoles.join(', ')}`, x + 4, cursor + 29);
      document.text(`${formatDateTime(signature.snapshot.signedAt)} - version ${signature.snapshot.versionNumber}`, x + 4, cursor + 33);
      document.setFontSize(6);
      document.text(`SHA-256 ${signature.snapshot.sha256}`, x + 4, cursor + 37, { maxWidth: 81 });
    }
  });
  cursor += 49;

  sectionTitle('Journal d’audit des décisions');
  autoTable(document, {
    startY: cursor,
    head: [['Date', 'Événement', 'Acteur', 'Rôle(s)', 'Transition', 'Signature', 'Motif']],
    body: input.audit.map((event) => [
      formatDateTime(event.occurredAt),
      EVENT_LABELS[event.eventType] || event.eventType,
      event.actorName,
      event.actorRoles.join(', '),
      `${event.previousStatus} -> ${event.newStatus}`,
      event.signatureSnapshot ? `v${event.signatureSnapshot.versionNumber} / ${event.signatureSnapshot.sha256.slice(0, 12)}…` : '',
      event.comment,
    ]),
    styles: { cellPadding: 1.4, fontSize: 6.5 },
    headStyles: { fillColor: [12, 96, 116] },
    margin: { left: 14, right: 14 },
  });

  const pageCount = document.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    document.setPage(page);
    document.setTextColor(97, 115, 129);
    document.setFontSize(6.5);
    document.text(`SeaPilot - généré le ${formatDateTime(new Date().toISOString())}`, 14, 291);
    document.text(`Page ${page}/${pageCount}`, 196, 291, { align: 'right' });
  }

  return {
    document,
    filename: `temps-travail-${safeFilename(register.personName)}-${register.periodStart}-${register.periodEnd}.pdf`,
  };
}
