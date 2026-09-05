import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ANNUAL_REVIEW_ESG_PROMPTS,
  ANNUAL_REVIEW_EVALUATION_GROUPS,
  ANNUAL_REVIEW_TITLE,
  ANNUAL_REVIEW_WORK_CONDITIONS,
  type AnnualReviewAnswers,
} from './annualReviewQuestionnaire';
import type { AnnualReviewRecord, AnnualReviewSignatureSnapshot } from './annualReviewQueries';
import { fetchWorkingTimeProfileSignatures } from '../workingTime/workingTimeSignatureQueries';

export interface AnnualReviewGeneratedPdf {
  blob: Blob;
  filename: string;
}

interface SignatureAsset {
  bytes: Uint8Array;
  name: string;
  signedAt: string;
  mimeType: string;
}

export interface AnnualReviewPdfInput {
  review: AnnualReviewRecord;
  answers: AnnualReviewAnswers;
  ownerName: string;
  kind: 'manager' | 'final' | 'personal';
  logoBytes: Uint8Array;
  managerSignature?: SignatureAsset | null;
  collaboratorSignature?: SignatureAsset | null;
}

function formatDate(value: string): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function htmlToText(value: string): string {
  if (typeof document !== 'undefined') {
    const template = document.createElement('template');
    template.innerHTML = value;
    return (template.content.textContent || '').replace(/\s+/gu, ' ').trim();
  }
  return value.replace(/<[^>]+>/gu, ' ').replace(/&nbsp;/gu, ' ').replace(/\s+/gu, ' ').trim();
}

async function downloadBytes(client: SupabaseClient, bucket: string, path: string): Promise<Uint8Array> {
  const { data, error } = await client.storage.from(bucket).download(path);
  if (error || !data) throw new Error('Impossible de charger une signature privée.');
  return new Uint8Array(await data.arrayBuffer());
}

async function activeSignature(client: SupabaseClient, personId: number, name: string): Promise<SignatureAsset> {
  const signatures = await fetchWorkingTimeProfileSignatures(client, personId);
  const signature = signatures.find((item) => item.validTo === null);
  if (!signature) throw new Error('Une signature active doit être enregistrée dans le dossier RH avant de continuer.');
  return {
    bytes: await downloadBytes(client, signature.storageBucket, signature.storagePath),
    name, signedAt: new Date().toISOString(), mimeType: signature.mimeType,
  };
}

async function snapshotSignature(client: SupabaseClient, snapshot: AnnualReviewSignatureSnapshot, fallbackName: string): Promise<SignatureAsset | null> {
  const bucket = String(snapshot.storage_bucket || '');
  const path = String(snapshot.storage_path || '');
  if (!bucket || !path) return null;
  return {
    bytes: await downloadBytes(client, bucket, path),
    name: String(snapshot.signer_name || fallbackName),
    signedAt: String(snapshot.signed_at || ''),
    mimeType: String(snapshot.mime_type || 'image/png'),
  };
}

export async function prepareAnnualReviewPdf(
  client: SupabaseClient,
  review: AnnualReviewRecord,
  answers: AnnualReviewAnswers,
  kind: AnnualReviewPdfInput['kind'],
): Promise<AnnualReviewPdfInput> {
  const response = await fetch('/bbtm-report-logo.png');
  if (!response.ok) throw new Error('Impossible de charger le logo BBTM.');
  const logoBytes = new Uint8Array(await response.arrayBuffer());
  if (kind === 'personal') return { review, answers, ownerName: review.employeeName, kind, logoBytes };
  const managerSignature = kind === 'manager'
    ? await activeSignature(client, review.managerPersonId, review.managerName)
    : await snapshotSignature(client, review.managerSignatureSnapshot, review.managerName);
  const collaboratorSignature = kind === 'final'
    ? await activeSignature(client, review.employeePersonId, review.employeeName)
    : null;
  return { review, answers, ownerName: review.managerName, kind, logoBytes, managerSignature, collaboratorSignature };
}

function signatureFormat(asset: SignatureAsset): 'PNG' | 'JPEG' {
  return asset.mimeType.toLowerCase().includes('jpeg') || asset.mimeType.toLowerCase().includes('jpg') ? 'JPEG' : 'PNG';
}

export async function buildAnnualReviewPdf(input: AnnualReviewPdfInput): Promise<AnnualReviewGeneratedPdf> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const pdf = new jsPDF({ compress: true, format: 'a4', orientation: 'portrait', unit: 'mm' });
  const navy: [number, number, number] = [13, 47, 68];
  const teal: [number, number, number] = [18, 136, 145];
  const pale: [number, number, number] = [235, 246, 247];
  const muted: [number, number, number] = [82, 104, 116];
  const lastY = () => (pdf as typeof pdf & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || 34;
  const ensureRoom = (y: number, requiredHeight: number) => {
    if (y + requiredHeight <= 277) return y;
    pdf.addPage();
    return 32;
  };
  const sectionHeading = (title: string, y: number, contentHeight = 25) => {
    y = ensureRoom(y, 11 + contentHeight);
    pdf.setFillColor(...pale); pdf.roundedRect(15, y, 180, 8, 2, 2, 'F');
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.setTextColor(...navy); pdf.text(title, 19, y + 5.4);
    return y + 11;
  };

  autoTable(pdf, {
    startY: 35, margin: { left: 15, right: 15, top: 32, bottom: 18 }, theme: 'grid',
    body: [
      ['Collaborateur', input.review.employeeName],
      ['Fonction', input.review.employeeFunction || '—'],
      ['Manager', input.review.managerName],
      ['Année', String(input.review.reviewYear)],
      ['Rendez-vous', `${formatDate(input.review.startsAt)} – ${input.review.meetingMode === 'video' ? input.review.videoUrl : input.review.meetingLocation}`],
      ['Version', input.kind === 'personal' ? 'Réponses personnelles du collaborateur' : input.kind === 'final' ? 'Rapport final signé' : 'Rapport validé par le management'],
    ],
    columnStyles: { 0: { cellWidth: 42, fontStyle: 'bold', fillColor: pale }, 1: { cellWidth: 138 } },
    styles: { font: 'helvetica', fontSize: 8.5, textColor: navy, lineColor: [181, 199, 206], cellPadding: 2.8 },
  });

  let y = lastY() + 7;
  y = sectionHeading('1. Critères d’évaluation métier', y, 35);
  ANNUAL_REVIEW_EVALUATION_GROUPS.forEach((group) => {
    y = ensureRoom(y, 12 + group.questions.length * 7.5);
    autoTable(pdf, {
      startY: y, margin: { left: 15, right: 15, top: 32, bottom: 18 }, theme: 'grid',
      head: [[group.label, 'Évaluation', 'Commentaire']],
      body: group.questions.map((question) => [
        question.label,
        input.answers.evaluation[question.id]?.rating || 'Non renseigné',
        input.answers.evaluation[question.id]?.comment || '',
      ]),
      headStyles: { fillColor: navy, textColor: 255, fontStyle: 'bold' },
      styles: { font: 'helvetica', fontSize: 7.5, textColor: navy, lineColor: [190, 203, 210], cellPadding: 2.2 },
      columnStyles: { 0: { cellWidth: 75 }, 1: { cellWidth: 35 }, 2: { cellWidth: 70 } },
    });
    y = lastY() + 4;
  });

  y = sectionHeading('2. Performances Environnement, Sociales et de Gouvernance', y, 38);
  autoTable(pdf, {
    startY: y, margin: { left: 15, right: 15, top: 32, bottom: 18 }, theme: 'grid',
    body: ANNUAL_REVIEW_ESG_PROMPTS.map((prompt) => [prompt.label, input.answers.esg[prompt.id] || 'Aucune proposition']),
    columnStyles: { 0: { cellWidth: 48, fontStyle: 'bold', fillColor: pale }, 1: { cellWidth: 132 } },
    styles: { font: 'helvetica', fontSize: 8, textColor: navy, lineColor: [190, 203, 210], cellPadding: 2.6 },
  });

  y = sectionHeading('3. Ma vie au sein de l’entreprise', lastY() + 6, 62);
  autoTable(pdf, {
    startY: y, margin: { left: 15, right: 15, top: 32, bottom: 18 }, theme: 'grid',
    body: [
      ['Satisfaction générale', input.answers.life.overall || 'Non renseigné'],
      ...ANNUAL_REVIEW_WORK_CONDITIONS.map(([id, label]) => [label, input.answers.life.conditions[id] || 'Non renseigné']),
      ['Pourquoi ?', input.answers.life.why || '—'],
    ],
    columnStyles: { 0: { cellWidth: 55, fontStyle: 'bold', fillColor: pale }, 1: { cellWidth: 125 } },
    styles: { font: 'helvetica', fontSize: 8, textColor: navy, lineColor: [190, 203, 210], cellPadding: 2.6 },
  });

  y = sectionHeading('4. Évolution professionnelle et personnelle', lastY() + 6, 43);
  autoTable(pdf, {
    startY: y, margin: { left: 15, right: 15, top: 32, bottom: 18 }, theme: 'grid',
    body: [
      ['Souhait', input.answers.evolution.choice || 'Non renseigné'],
      ['Poste souhaité', input.answers.evolution.desiredPosition || '—'],
      ['Formation souhaitée', input.answers.evolution.desiredTraining || '—'],
      ['Raisons', input.answers.evolution.reasons || '—'],
      ['Autres informations', input.answers.evolution.other || '—'],
    ],
    columnStyles: { 0: { cellWidth: 55, fontStyle: 'bold', fillColor: pale }, 1: { cellWidth: 125 } },
    styles: { font: 'helvetica', fontSize: 8, textColor: navy, lineColor: [190, 203, 210], cellPadding: 2.6 },
  });

  y = sectionHeading('5. Objectifs personnels pour l’année N+1', lastY() + 6, 27);
  autoTable(pdf, {
    startY: y, margin: { left: 15, right: 15, top: 32, bottom: 18 }, theme: 'grid',
    body: [[htmlToText(input.answers.objectives) || 'Non renseigné']],
    styles: { font: 'helvetica', fontSize: 8.5, textColor: navy, lineColor: [190, 203, 210], cellPadding: 3, minCellHeight: 18 },
  });

  if (input.kind !== 'personal') {
    y = sectionHeading('Signatures', lastY() + 7, 57);
    const signatureRows = [
      { label: 'Management', asset: input.managerSignature || null },
      { label: 'Collaborateur', asset: input.collaboratorSignature || null },
    ];
    autoTable(pdf, {
      startY: y, margin: { left: 15, right: 15, top: 32, bottom: 18 }, theme: 'grid',
      head: [['Rôle', 'Prénom NOM', 'Date et signature']],
      body: signatureRows.map(({ label, asset }) => [label, asset?.name || 'En attente', asset ? formatDate(asset.signedAt) : 'En attente']),
      headStyles: { fillColor: navy, textColor: 255 },
      styles: { font: 'helvetica', fontSize: 8, textColor: navy, lineColor: [190, 203, 210], cellPadding: 3, minCellHeight: 22 },
      columnStyles: { 0: { cellWidth: 36 }, 1: { cellWidth: 62 }, 2: { cellWidth: 82 } },
      didDrawCell: (cell) => {
        if (cell.section !== 'body' || cell.column.index !== 2) return;
        const asset = signatureRows[cell.row.index]?.asset;
        if (!asset) return;
        pdf.addImage(asset.bytes, signatureFormat(asset), cell.cell.x + 34, cell.cell.y + 2.5, 38, 11, undefined, 'FAST');
      },
    });
  }

  const pageCount = pdf.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page);
    pdf.setFillColor(...navy); pdf.rect(0, 0, 210, 7, 'F');
    pdf.addImage(input.logoBytes, 'PNG', 15, 11, 12, 12, undefined, 'FAST');
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(14); pdf.setTextColor(...navy);
    pdf.text(ANNUAL_REVIEW_TITLE, 105, 18, { align: 'center' });
    pdf.setDrawColor(...teal); pdf.setLineWidth(0.7); pdf.line(15, 27, 195, 27);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.setTextColor(...muted);
    pdf.text(`BBTM · ${input.review.reviewYear}`, 15, 291);
    pdf.text(`Page ${page} / ${pageCount}`, 195, 291, { align: 'right' });
  }

  const filename = `${ANNUAL_REVIEW_TITLE} - ${input.review.employeeName} - ${input.review.reviewYear}.pdf`;
  return { blob: pdf.output('blob'), filename };
}

export function downloadAnnualReviewPdf(generated: AnnualReviewGeneratedPdf): void {
  const url = URL.createObjectURL(generated.blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = generated.filename; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function printAnnualReviewPdf(generated: AnnualReviewGeneratedPdf): void {
  const url = URL.createObjectURL(generated.blob);
  const popup = window.open(url, '_blank', 'noopener,noreferrer');
  if (!popup) { URL.revokeObjectURL(url); throw new Error('Autorisez l’ouverture d’un nouvel onglet pour imprimer le rapport.'); }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
