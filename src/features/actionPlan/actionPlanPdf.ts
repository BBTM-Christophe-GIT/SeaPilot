import type { ActionItemRecord, CreateActionItemInput } from './actionPlanQueries';

export interface ActionSheetEvidence {
  label: string;
  source: Blob | string;
}

export interface ActionSheetData {
  id?: number;
  title: string;
  description: string;
  correctiveAction: string;
  realizedAction?: string;
  comments?: string;
  openedOn: string;
  dueOn: string;
  closedOn?: string;
  vesselName: string;
  issuerName: string;
  ownerName: string;
  actionType: string;
  deviationType: string;
  status?: string;
  findingPhotos: ActionSheetEvidence[];
  closurePhoto?: ActionSheetEvidence;
  logoSource?: Blob | string;
}

export interface ActionSheetCompletionItem {
  key: string;
  label: string;
  complete: boolean;
  future: boolean;
}

const BLUE = [12, 63, 120] as const;
const INK = [23, 35, 58] as const;
const MUTED = [97, 112, 135] as const;
const LINE = [216, 226, 238] as const;
const PALE = [245, 248, 252] as const;

function hasText(value?: string): boolean {
  return Boolean(value?.trim());
}

export function actionSheetCompletion(data: ActionSheetData): ActionSheetCompletionItem[] {
  const identificationComplete = [
    data.openedOn,
    data.vesselName,
    data.issuerName,
    data.ownerName,
    data.dueOn,
  ].every(hasText);

  return [
    { key: 'identification', label: 'Identification', complete: identificationComplete, future: false },
    { key: 'qualification', label: 'Qualification', complete: hasText(data.actionType) && hasText(data.deviationType), future: false },
    { key: 'finding', label: 'Constat', complete: hasText(data.title), future: false },
    { key: 'photos', label: 'Photos ou pièces jointes', complete: data.findingPhotos.length > 0, future: false },
    { key: 'proposal', label: 'Action proposée', complete: hasText(data.correctiveAction), future: false },
    { key: 'treatment', label: 'Traitement et clôture', complete: hasText(data.realizedAction), future: true },
    { key: 'closure-proof', label: 'Photo de preuve', complete: Boolean(data.closurePhoto), future: true },
    { key: 'closed-on', label: 'Date de clôture', complete: hasText(data.closedOn), future: true },
    { key: 'validation', label: 'Validation', complete: hasText(data.closedOn) && hasText(data.status), future: true },
  ];
}

export function actionSheetCompletionPercent(data: ActionSheetData): number {
  const items = actionSheetCompletion(data);
  return Math.round((items.filter((item) => item.complete).length / items.length) * 100);
}

export function actionSheetReference(data: Pick<ActionSheetData, 'id'>): string {
  return data.id ? `ACT-${String(data.id).padStart(6, '0')}` : 'ACT-BROUILLON';
}

function formatDate(value: string): string {
  if (!value) return 'Non renseignée';
  const [year, month, day] = value.slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function safeFileName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '').slice(0, 72);
}

async function sourceToBlob(source: Blob | string): Promise<Blob> {
  if (typeof source !== 'string') return source;
  const response = await fetch(source);
  if (!response.ok) throw new Error(`Image inaccessible (${response.status}).`);
  return response.blob();
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  if (typeof FileReader === 'undefined') {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`;
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error("Impossible de lire l'image."));
    reader.readAsDataURL(blob);
  });
}

async function imageSourceToJpeg(source: Blob | string): Promise<string> {
  const blob = await sourceToBlob(source);
  if (typeof document === 'undefined' || typeof Image === 'undefined') return blobToDataUrl(blob);

  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Impossible de décoder l'image."));
      element.src = objectUrl;
    });
    const maxEdge = 1800;
    const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error("Impossible de préparer l'image pour le PDF.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.86);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function actionSheetDataFromForm(
  form: CreateActionItemInput,
  photos: File[],
): ActionSheetData {
  return {
    title: form.title,
    description: form.description,
    correctiveAction: form.correctiveAction,
    openedOn: form.openedOn,
    dueOn: form.dueOn,
    vesselName: form.vesselName,
    issuerName: form.issuerName,
    ownerName: form.ownerName,
    actionType: form.actionType,
    deviationType: form.deviationType,
    status: 'Brouillon',
    findingPhotos: photos.map((photo, index) => ({ label: `Photo du constat ${index + 1}`, source: photo })),
  };
}

export function actionSheetDataFromRecord(
  action: ActionItemRecord,
  evidenceUrls: { photo1Url?: string; photo2Url?: string; closurePhotoUrl?: string },
): ActionSheetData {
  const findingPhotoUrls = [evidenceUrls.photo1Url, evidenceUrls.photo2Url]
    .filter((source): source is string => Boolean(source));
  return {
    id: action.id,
    title: action.title,
    description: action.description,
    correctiveAction: action.correctiveAction,
    realizedAction: action.realizedAction,
    comments: action.comments,
    openedOn: action.openedOn,
    dueOn: action.dueOn,
    closedOn: action.closedOn,
    vesselName: action.vesselName,
    issuerName: action.issuerName,
    ownerName: action.ownerName,
    actionType: action.actionType || action.auditType,
    deviationType: action.deviationType,
    status: action.status,
    findingPhotos: findingPhotoUrls.map((source, index) => ({ label: `Photo du constat ${index + 1}`, source })),
    closurePhoto: evidenceUrls.closurePhotoUrl
      ? { label: 'Preuve du traitement', source: evidenceUrls.closurePhotoUrl }
      : undefined,
  };
}

export async function buildActionSheetPdf(data: ActionSheetData): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ format: 'a4', unit: 'mm', orientation: 'portrait' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - (margin * 2);
  let y = 15;
  let logo = '';
  try {
    logo = await blobToDataUrl(await sourceToBlob(data.logoSource || '/bbtm-report-logo.png'));
  } catch {
    logo = '';
  }

  const addPageHeader = () => {
    if (logo) doc.addImage(logo, 'PNG', margin, 8, 29, 14, undefined, 'FAST');
    doc.setTextColor(...INK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text("FICHE D'ACTION", pageWidth / 2, 17, { align: 'center' });
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    doc.text(actionSheetReference(data), pageWidth - margin, 12, { align: 'right' });
    doc.text(data.status || 'Brouillon', pageWidth - margin, 17, { align: 'right' });
    doc.setDrawColor(...LINE);
    doc.line(margin, 25, pageWidth - margin, 25);
    y = 31;
  };

  const ensureSpace = (needed: number) => {
    if (y + needed <= pageHeight - 18) return;
    doc.addPage();
    addPageHeader();
  };

  const addSectionTitle = (title: string) => {
    ensureSpace(12);
    doc.setFillColor(...BLUE);
    doc.rect(margin, y, contentWidth, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(title.toUpperCase(), margin + 3, y + 4.8);
    y += 10;
  };

  const addTextBlock = (label: string, value: string, fallback = 'Non renseigné') => {
    const text = value.trim() || fallback;
    doc.setFontSize(7.4);
    doc.setFont('helvetica', 'bold');
    const labelLines = doc.splitTextToSize(label, contentWidth - 6) as string[];
    doc.setFont('helvetica', 'normal');
    const valueLines = doc.splitTextToSize(text, contentWidth - 6) as string[];
    const height = Math.max(13, 4 + (labelLines.length * 3.4) + (valueLines.length * 3.8));
    ensureSpace(height + 2);
    doc.setDrawColor(...LINE);
    doc.setFillColor(255, 255, 255);
    doc.rect(margin, y, contentWidth, height, 'FD');
    doc.setTextColor(...BLUE);
    doc.setFont('helvetica', 'bold');
    doc.text(labelLines, margin + 3, y + 4.2);
    doc.setTextColor(...INK);
    doc.setFont('helvetica', 'normal');
    doc.text(valueLines, margin + 3, y + 8.2 + ((labelLines.length - 1) * 3.4));
    y += height + 2;
  };

  const addIdentification = () => {
    addSectionTitle('Identification');
    const rows = [
      ['Date du constat', formatDate(data.openedOn), 'Navire / lieu', data.vesselName || 'Non renseigné'],
      ['Émetteur', data.issuerName || 'Non renseigné', 'Responsable', data.ownerName || 'Non renseigné'],
      ['Échéance', formatDate(data.dueOn), "Type d'action", data.actionType || 'Non renseigné'],
      ["Type d'écart", data.deviationType || 'Non renseigné', 'Référence', actionSheetReference(data)],
    ];
    const rowHeight = 8;
    const labelWidth = 31;
    const half = contentWidth / 2;
    doc.setFontSize(7);
    rows.forEach((row) => {
      ensureSpace(rowHeight);
      doc.setDrawColor(...LINE);
      doc.setFillColor(...PALE);
      doc.rect(margin, y, labelWidth, rowHeight, 'FD');
      doc.rect(margin + half, y, labelWidth, rowHeight, 'FD');
      doc.rect(margin + labelWidth, y, half - labelWidth, rowHeight);
      doc.rect(margin + half + labelWidth, y, half - labelWidth, rowHeight);
      doc.setTextColor(...BLUE);
      doc.setFont('helvetica', 'bold');
      doc.text(row[0], margin + 2, y + 5);
      doc.text(row[2], margin + half + 2, y + 5);
      doc.setTextColor(...INK);
      doc.setFont('helvetica', 'normal');
      doc.text(doc.splitTextToSize(row[1], half - labelWidth - 4)[0] || '', margin + labelWidth + 2, y + 5);
      doc.text(doc.splitTextToSize(row[3], half - labelWidth - 4)[0] || '', margin + half + labelWidth + 2, y + 5);
      y += rowHeight;
    });
    y += 3;
  };

  const addEvidence = async (title: string, evidence: ActionSheetEvidence[]) => {
    if (!evidence.length) return;
    addSectionTitle(title);
    const gap = 4;
    const width = evidence.length === 1 ? contentWidth : (contentWidth - gap) / 2;
    const height = evidence.length === 1 ? 82 : 58;
    ensureSpace(height + 9);
    const images = await Promise.all(evidence.slice(0, 2).map(async (item) => {
      try { return await imageSourceToJpeg(item.source); } catch { return ''; }
    }));
    images.forEach((image, index) => {
      const x = margin + (index * (width + gap));
      doc.setDrawColor(...LINE);
      doc.rect(x, y, width, height);
      if (image) {
        const properties = doc.getImageProperties(image);
        const ratio = Math.min(width / properties.width, height / properties.height);
        const imageWidth = properties.width * ratio;
        const imageHeight = properties.height * ratio;
        const format = image.startsWith('data:image/png') ? 'PNG' : image.startsWith('data:image/webp') ? 'WEBP' : 'JPEG';
        doc.addImage(image, format, x + ((width - imageWidth) / 2), y + ((height - imageHeight) / 2), imageWidth, imageHeight, undefined, 'FAST');
      } else {
        doc.setTextColor(...MUTED);
        doc.setFontSize(7);
        doc.text('Image non disponible', x + (width / 2), y + (height / 2), { align: 'center' });
      }
      doc.setTextColor(...MUTED);
      doc.setFontSize(7);
      doc.text(evidence[index]?.label || `Photo ${index + 1}`, x, y + height + 4);
    });
    y += height + 9;
  };

  addPageHeader();
  addIdentification();
  addSectionTitle('Constat');
  addTextBlock('Constat', data.title, 'Constat non renseigné');
  if (hasText(data.description)) addTextBlock('Description complémentaire', data.description);
  addSectionTitle('Action proposée');
  addTextBlock('Proposition', data.correctiveAction, 'Aucune action proposée');
  await addEvidence('Photos du constat', data.findingPhotos);

  const hasTreatment = hasText(data.realizedAction) || hasText(data.comments) || Boolean(data.closurePhoto) || hasText(data.closedOn);
  if (hasTreatment) {
    addSectionTitle('Traitement et clôture');
    addTextBlock('Action réalisée', data.realizedAction || 'Non renseignée');
    if (hasText(data.comments)) addTextBlock('Commentaire', data.comments || '');
    if (hasText(data.closedOn)) addTextBlock('Date de clôture', formatDate(data.closedOn || ''));
    if (data.closurePhoto) await addEvidence('Preuve du traitement', [data.closurePhoto]);
  } else {
    ensureSpace(15);
    doc.setFillColor(...PALE);
    doc.setDrawColor(...LINE);
    doc.rect(margin, y, contentWidth, 12, 'FD');
    doc.setTextColor(...MUTED);
    doc.setFontSize(7.5);
    doc.text('Le traitement, sa preuve et la validation seront ajoutés après la création de la fiche.', margin + 4, y + 7.2);
    y += 15;
  }

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...LINE);
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
    doc.setTextColor(...MUTED);
    doc.setFontSize(6.8);
    doc.text('BBTM · Fiche générée depuis SeaPilot', margin, pageHeight - 7);
    doc.text(`Page ${page} / ${pageCount}`, pageWidth - margin, pageHeight - 7, { align: 'right' });
  }

  return doc.output('blob');
}

export function actionSheetFileName(data: ActionSheetData): string {
  const reference = actionSheetReference(data).toLowerCase();
  const title = safeFileName(data.title) || 'fiche-action';
  return `${reference}-${title}.pdf`;
}

export function downloadActionSheetPdf(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
