import type { AuditAnswer, AuditFinding, AuditFindingEvent, AuditParticipant, AuditPhoto, AuditSite, AuditTemplate, InternalAudit } from './internalAuditModel';
import type { CellHookData, RowInput } from 'jspdf-autotable';
import {
  AUDIT_ANSWER_LABELS, AUDIT_STATUS_LABELS, FINDING_SEVERITY_LABELS, FINDING_STATUS_LABELS,
  blankAuditAnswers, compareAuditScores, formatAuditDate, scoreAudit, scoreBySection, todayAuditParis,
} from './internalAuditModel';
import { drawInternalAuditRadar, internalAuditScoreColor } from './internalAuditRadar';

export interface InternalAuditReportInput {
  audit: InternalAudit;
  site: AuditSite;
  audits: readonly InternalAudit[];
  findings: readonly AuditFinding[];
  events: readonly AuditFindingEvent[];
  loadPhoto?: (photo: AuditPhoto) => Promise<string | null>;
  loadVesselPhoto?: () => Promise<string | null>;
  generatedAt?: Date;
  sections?: readonly InternalAuditReportSection[];
  sortByHrFunction?: boolean;
  loadSignature?: (participant: AuditParticipant) => Promise<string | null>;
}

export type InternalAuditReportSection = 'grid' | 'summary' | 'chart';

export function internalAuditReportSections(sections?: readonly InternalAuditReportSection[]): InternalAuditReportSection[] {
  const available: InternalAuditReportSection[] = ['grid', 'summary', 'chart'];
  if (sections === undefined) return available;
  if (!Array.isArray(sections) || !sections.length || sections.some((section) => !available.includes(section))) {
    throw new Error('Sélectionnez au moins une section valide pour le rapport PDF.');
  }
  return available.filter((section) => sections.includes(section));
}

export interface InternalAuditReportQuestion {
  row: AuditAnswer;
  answerLabel: string;
  earnedPoints: number | null;
  pointsLabel: string;
}

export interface InternalAuditReportFinding {
  finding: AuditFinding;
  question: AuditAnswer | null;
  events: AuditFindingEvent[];
}

export interface InternalAuditReportData {
  filename: string;
  draft: boolean;
  questions: InternalAuditReportQuestion[];
  findings: InternalAuditReportFinding[];
  score: ReturnType<typeof scoreAudit>;
  comparison: ReturnType<typeof compareAuditScores>;
}

export function auditReportNumber(value: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(value);
}

export function auditReportPercent(value: number | null): string {
  return value === null ? 'N/A' : `${auditReportNumber(value)} %`;
}

export function auditReportTimestampDay(value: string): string {
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? value.slice(0, 10) : todayAuditParis(timestamp);
}

export function internalAuditReportFilename(audit: InternalAudit, site: AuditSite): string {
  const slug = site.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
  return `Audit_ISM_Interne_${slug || 'Site'}_${audit.year}${audit.status === 'completed' ? '' : '_Brouillon'}.pdf`;
}

/** One mapping is shared by printable and spreadsheet exports. */
export function internalAuditReportData(input: InternalAuditReportInput): InternalAuditReportData {
  if (input.site.id !== input.audit.siteId || input.site.companyId !== input.audit.companyId) {
    throw new Error('Le site du rapport ne correspond pas à l’audit sélectionné.');
  }
  internalAuditReportSections(input.sections);
  const findings = input.findings.filter((finding) => finding.auditId === input.audit.id && finding.companyId === input.audit.companyId);
  const questionRows = [...input.audit.rows];
  if (input.sortByHrFunction) questionRows.sort((left, right) => {
    const leftFunction = left.hrFunction?.trim() || '';
    const rightFunction = right.hrFunction?.trim() || '';
    return Number(!leftFunction) - Number(!rightFunction) || leftFunction.localeCompare(rightFunction, 'fr', { sensitivity: 'base' });
  });
  return {
    filename: internalAuditReportFilename(input.audit, input.site),
    draft: input.audit.status !== 'completed',
    score: scoreAudit(input.audit.rows),
    comparison: compareAuditScores(input.audit, input.audits),
    questions: questionRows.map((row) => {
      const earnedPoints = row.answer === 'conforme' ? row.maxPoints : row.answer === 'incomplet' ? row.maxPoints / 2 : row.answer === 'non_conforme' ? 0 : null;
      return {
        row, earnedPoints,
        answerLabel: row.answer === null ? 'Non renseigné' : AUDIT_ANSWER_LABELS[row.answer],
        pointsLabel: row.answer === 'na' ? 'Hors calcul (N/A)' : row.answer === null ? `Barème : ${auditReportNumber(row.maxPoints)}`
          : `${auditReportNumber(earnedPoints ?? 0)} / ${auditReportNumber(row.maxPoints)} points`,
      };
    }),
    findings: findings.map((finding) => ({
      finding,
      question: input.audit.rows.find((row) => row.id === finding.questionId) ?? null,
      events: input.events.filter((event) => event.findingId === finding.id).sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)),
    })),
  };
}

function bytesToDataUrl(bytes: Uint8Array, mimeType: string): string {
  let binary = '';
  for (let start = 0; start < bytes.length; start += 8192) binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
  return `data:${mimeType};base64,${btoa(binary)}`;
}

async function convertWebpToPng(dataUrl: string, fileName: string): Promise<string> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    throw new Error(`La photo ${fileName} doit être convertie en PNG pour exporter le rapport.`);
  }
  const picture = new Image();
  await new Promise<void>((resolve, reject) => {
    picture.onload = () => resolve();
    picture.onerror = () => reject(new Error(`Impossible de lire la photo ${fileName}.`));
    picture.src = dataUrl;
  });
  const canvas = document.createElement('canvas');
  canvas.width = picture.naturalWidth;
  canvas.height = picture.naturalHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error(`Impossible de convertir la photo ${fileName}.`);
  context.drawImage(picture, 0, 0);
  return canvas.toDataURL('image/png');
}

/** Signed private URLs are read only when the user requests an export. */
export async function loadInternalAuditReportPhoto(photo: AuditPhoto): Promise<string> {
  if (!photo.url) throw new Error(`La photo ${photo.fileName} est indisponible. Rechargez l’audit avant de télécharger le rapport.`);
  const response = await fetch(photo.url);
  if (!response.ok) throw new Error(`Impossible de télécharger la photo ${photo.fileName}. Rechargez l’audit puis réessayez.`);
  const dataUrl = bytesToDataUrl(new Uint8Array(await response.arrayBuffer()), photo.mimeType);
  return photo.mimeType === 'image/webp' ? convertWebpToPng(dataUrl, photo.fileName) : dataUrl;
}

export async function resolveInternalAuditReportPhoto(input: InternalAuditReportInput, photo: AuditPhoto): Promise<string> {
  const image = input.loadPhoto ? await input.loadPhoto(photo) : await loadInternalAuditReportPhoto(photo);
  if (!image) throw new Error(`La photo ${photo.fileName} ne peut pas être incluse dans le rapport.`);
  const normalized = /^data:image\/webp[;,]/i.test(image) ? await convertWebpToPng(image, photo.fileName) : image;
  if (!/^data:image\/(png|jpeg);base64,/i.test(normalized)) throw new Error(`Le format de la photo ${photo.fileName} n’est pas compatible avec le rapport.`);
  return normalized;
}

export async function resolveInternalAuditReportSignature(input: InternalAuditReportInput, participant: AuditParticipant): Promise<string | null> {
  if (!participant.signatureUrl && !Object.keys(participant.signatureSnapshot || {}).length) return null;
  const identity = `${participant.firstName} ${participant.lastName}`.trim();
  let image: string | null;
  try {
    if (input.loadSignature) image = await input.loadSignature(participant);
    else if (participant.signatureUrl) {
      const response = await fetch(participant.signatureUrl);
      if (!response.ok) throw new Error('Signature inaccessible');
      const mimeType = response.headers.get('content-type')?.split(';')[0] || 'image/png';
      image = bytesToDataUrl(new Uint8Array(await response.arrayBuffer()), mimeType);
    } else image = null;
  } catch {
    throw new Error(`La signature de ${identity} est indisponible. Rechargez l’audit puis réessayez.`);
  }
  if (!image) throw new Error(`La signature de ${identity} est indisponible. Rechargez l’audit puis réessayez.`);
  if (!/^data:image\/(png|jpeg);base64,/i.test(image)) {
    throw new Error(`Le format de la signature de ${identity} n’est pas compatible avec le rapport.`);
  }
  return image;
}

function cleanText(value: string): string {
  return value.replace(/[\u2010-\u2015\u2212]/g, '-').replace(/\u00a0|\u202f/g, ' ').replace(/\u2022/g, '-');
}

export interface InternalAuditGeneratedReport { blob: Blob; filename: string; pageCount: number }

async function loadReportLogo(): Promise<Uint8Array | null> {
  if (typeof document === 'undefined' || !document.baseURI) return null;
  const response = await fetch('/bbtm-report-logo.png');
  if (!response.ok) throw new Error('Le logo BBTM est indisponible. Réessayez.');
  return new Uint8Array(await response.arrayBuffer());
}

async function loadCoverPhoto(input: InternalAuditReportInput): Promise<string | null> {
  try {
    const image = await input.loadVesselPhoto?.();
    if (!image) return null;
    if (/^data:image\/webp[;,]/i.test(image)) return await convertWebpToPng(image, input.site.name);
    return /^data:image\/(png|jpeg);base64,/i.test(image) ? image : null;
  } catch {
    return null;
  }
}

async function buildAuditPdf(
  input: InternalAuditReportInput, mode: 'report' | 'print' | 'template' = 'report',
): Promise<InternalAuditGeneratedReport> {
  const data = internalAuditReportData(input);
  const sections = internalAuditReportSections(input.sections);
  const templateMode = mode === 'template';
  const gridOnly = sections.length === 1 && sections[0] === 'grid';
  const chapterScores = scoreBySection(input.audit.rows);
  const photoReferences = new Map<string, AuditPhoto>();
  for (const entry of sections.includes('summary') ? data.findings : []) {
    for (const photo of [...(entry.finding.photos ?? []), ...entry.events.flatMap((event) => event.photos ?? [])]) {
      photoReferences.set(photo.storagePath || photo.id, photo);
    }
  }
  const loadedPhotos = new Map<string, string>();
  for (const [key, photo] of photoReferences) loadedPhotos.set(key, await resolveInternalAuditReportPhoto(input, photo));
  const participants = templateMode ? [] : input.audit.participants || [];
  const signatures = await Promise.all(participants.map((participant) => resolveInternalAuditReportSignature(input, participant)));
  const [{ jsPDF }, { autoTable }, logo, coverPhoto] = await Promise.all([
    import('jspdf'), import('jspdf-autotable'), loadReportLogo(),
    mode === 'report' && input.site.kind === 'vessel' ? loadCoverPhoto(input) : null,
  ]);
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  pdf.setProperties({ title: templateMode ? `Modèle de grille ISM - ${input.audit.templateName} - version ${input.audit.templateVersion}`
    : `${gridOnly ? 'Grille - ' : ''}Audit ISM Interne - ${input.site.name} - ${input.audit.year}`,
    subject: templateMode ? 'Grille vierge à préparer avant la planification de l’audit' : sections.map((section) => ({ grid: 'Grille', summary: 'Synthèse', chart: 'Graphique' })[section]).join(', '),
    author: input.audit.auditorName || 'SeaPilot', creator: 'SeaPilot' });
  const width = 297;
  const height = 210;
  const margin = 12;
  const usableWidth = width - margin * 2;
  const navy: [number, number, number] = [19, 48, 68];
  const teal: [number, number, number] = [15, 123, 132];
  const muted: [number, number, number] = [82, 104, 114];
  const pale: [number, number, number] = [237, 245, 246];
  const draftColor: [number, number, number] = [152, 81, 27];
  const auditDate = input.audit.performedOn ? formatAuditDate(input.audit.performedOn) : 'Audit non débuté';
  const findingCounts = { major: 0, minor: 0, remark: 0 };
  for (const { finding } of data.findings) findingCounts[finding.severity] += 1;
  const findingBreakdown = `${findingCounts.major} majeure${findingCounts.major > 1 ? 's' : ''}, `
    + `${findingCounts.minor} mineure${findingCounts.minor > 1 ? 's' : ''}, `
    + `${findingCounts.remark} remarque${findingCounts.remark > 1 ? 's' : ''}`;
  let currentSection = ({ grid: '01 - Grille d’audit', summary: '02 - Synthèse', chart: '03 - Graphique' })[sections[0]];
  let cursor = 41;

  function drawHeader() {
    pdf.setFillColor(...navy);
    pdf.rect(0, 0, width, 2, 'F');
    if (logo) pdf.addImage(logo, 'PNG', margin, 7, 15, 15, 'bbtm-logo');
    const titleX = logo ? margin + 21 : margin;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(16);
    pdf.setTextColor(...navy);
    pdf.text(templateMode ? 'Modèle de grille ISM Interne'
      : gridOnly ? 'Grille d’audit ISM Interne' : 'Audit ISM Interne', titleX, 13);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(...muted);
    pdf.text(cleanText(templateMode ? `BBTM - ${input.site.name} - Version ${input.audit.templateVersion}`
      : `Année : ${input.audit.year}`), titleX, 19, { maxWidth: 165 });
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(...(data.draft && !templateMode ? draftColor : navy));
    pdf.text(templateMode ? 'GRILLE VIERGE' : data.draft ? 'BROUILLON - RÉPONSES NON FINALISÉES' : 'AUDIT RÉALISÉ', width - margin, 13, { align: 'right' });
    pdf.setDrawColor(210, 223, 229);
    pdf.setLineWidth(0.25);
    pdf.line(margin, 26, width - margin, 26);
    pdf.setFontSize(13);
    pdf.setTextColor(...navy);
    pdf.text(cleanText(currentSection), margin, 34);
    pdf.setDrawColor(...teal);
    pdf.setLineWidth(0.45);
    pdf.line(margin, 37, width - margin, 37);
  }
  function nextPage() { pdf.addPage(); drawHeader(); cursor = 43; }
  function beginSection(section: string) { currentSection = section; nextPage(); }
  function ensureSpace(amount: number) { if (cursor + amount > height - 18) nextPage(); }
  function paragraph(value: string, options: { bold?: boolean; size?: number; color?: [number, number, number] } = {}) {
    const size = options.size ?? 9;
    pdf.setFont('helvetica', options.bold ? 'bold' : 'normal');
    pdf.setFontSize(size);
    pdf.setTextColor(...(options.color ?? navy));
    const lines = pdf.splitTextToSize(cleanText(value), usableWidth) as string[];
    const lineHeight = size * 0.44;
    for (const line of lines) {
      ensureSpace(lineHeight + 1);
      // A continuation header changes the active font; restore the paragraph style.
      pdf.setFont('helvetica', options.bold ? 'bold' : 'normal');
      pdf.setFontSize(size);
      pdf.setTextColor(...(options.color ?? navy));
      pdf.text(line, margin, cursor);
      cursor += lineHeight;
    }
    cursor += 2.5;
  }
  function table(
    body: RowInput[], head: string[], columnWidths: number[],
    options: { cellPadding?: number; drawCell?: (cell: CellHookData) => void } = {},
  ) {
    autoTable(pdf, {
      startY: cursor, body, head: head.length ? [head] : undefined,
      theme: 'grid', showHead: 'everyPage', rowPageBreak: 'auto',
      margin: { top: 42, bottom: 17, left: margin, right: margin },
      styles: { font: 'helvetica', fontSize: 8.2, cellPadding: options.cellPadding ?? 2.6, textColor: navy, lineColor: [215, 225, 229], lineWidth: 0.15, overflow: 'linebreak', valign: 'top' },
      headStyles: { fillColor: navy, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
      columnStyles: Object.fromEntries(columnWidths.map((cellWidth, index) => [index, { cellWidth }])),
      didDrawPage: () => drawHeader(),
      didDrawCell: options.drawCell,
    });
    cursor = (pdf as typeof pdf & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 45;
    cursor += 6;
  }
  function scoreCards() {
    ensureSpace(24);
    const values = [
      ['Score de l’audit', auditReportPercent(data.score.percentage), `${auditReportNumber(data.score.earnedPoints)} / ${auditReportNumber(data.score.maxPoints)} points applicables`],
      ['Écarts émis', String(data.findings.length), findingBreakdown],
    ];
    const cardWidth = (usableWidth - (values.length - 1) * 6) / values.length;
    values.forEach(([label, value, description], index) => {
      const x = margin + index * (cardWidth + 6);
      pdf.setFillColor(...pale);
      pdf.roundedRect(x, cursor - 2, cardWidth, 22, 1.5, 1.5, 'F');
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.8); pdf.setTextColor(...muted);
      pdf.text(cleanText(label), x + 3, cursor + 3);
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(13); pdf.setTextColor(...navy);
      pdf.text(cleanText(value), x + 3, cursor + 10);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7);
      pdf.text(cleanText(description), x + 3, cursor + 16);
    });
    cursor += 26;
  }
  async function renderPhotos(photos: readonly AuditPhoto[], context: string) {
    for (const photo of photos) {
      ensureSpace(87);
      const picture = loadedPhotos.get(photo.storagePath || photo.id);
      if (!picture) throw new Error(`La photo ${photo.fileName} ne peut pas être incluse dans le rapport.`);
      let props: { width: number; height: number };
      try { props = pdf.getImageProperties(picture); }
      catch { throw new Error(`La photo ${photo.fileName} est illisible. Le rapport n’a pas été téléchargé.`); }
      const scale = Math.min(145 / props.width, 78 / props.height);
      const imageWidth = props.width * scale;
      const imageHeight = props.height * scale;
      pdf.setFillColor(...pale); pdf.rect(margin, cursor - 2, 147, 82, 'F');
      pdf.addImage(picture, picture.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG', margin + (147 - imageWidth) / 2, cursor + (78 - imageHeight) / 2, imageWidth, imageHeight, undefined, 'FAST');
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.setTextColor(...navy);
      const caption = pdf.splitTextToSize(cleanText(photo.fileName), 116) as string[];
      pdf.text(caption, 166, cursor + 4);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(...muted);
      pdf.text(pdf.splitTextToSize(cleanText(context), 116), 166, cursor + 8 + caption.length * 4);
      cursor += 87;
    }
  }

  function drawCover() {
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12); pdf.setTextColor(...navy);
    pdf.text('Audit ISM interne', margin, 18);
    pdf.setFontSize(28);
    const name = pdf.splitTextToSize(cleanText(input.site.name), usableWidth) as string[];
    pdf.text(name, margin, 33);
    const dateY = 42 + (name.length - 1) * 11.4;
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(11); pdf.setTextColor(...muted);
    pdf.text(input.audit.performedOn ? `Date de l’audit : ${auditDate}` : auditDate, margin, dateY);
    if (data.draft) {
      pdf.setFontSize(8); pdf.setTextColor(...draftColor);
      pdf.text('Brouillon - réponses non finalisées', margin, dateY + 5);
    }

    const panelY = dateY + 11;
    const panelWidth = 88;
    const isVessel = input.site.kind === 'vessel';
    if (isVessel) {
      pdf.setFillColor(...pale);
      pdf.roundedRect(margin, panelY, panelWidth, 65, 2, 2, 'F');
      let photoDrawn = false;
      if (coverPhoto) {
        try {
          const dimensions = pdf.getImageProperties(coverPhoto);
          const scale = Math.min(panelWidth / dimensions.width, 65 / dimensions.height);
          const imageWidth = dimensions.width * scale;
          const imageHeight = dimensions.height * scale;
          pdf.addImage(coverPhoto, /^data:image\/jpeg/i.test(coverPhoto) ? 'JPEG' : 'PNG',
            margin + (panelWidth - imageWidth) / 2, panelY + (65 - imageHeight) / 2,
            imageWidth, imageHeight, 'audit-vessel-cover', 'FAST');
          photoDrawn = true;
        } catch {
          // The cover remains available when the fleet image cannot be decoded.
        }
      }
      if (!photoDrawn) {
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(...muted);
        pdf.text('Photo du navire indisponible', margin + panelWidth / 2, panelY + 33, { align: 'center' });
      }
    }
    const scoreY = isVessel ? panelY + 70 : panelY;
    pdf.setFillColor(...pale);
    pdf.roundedRect(margin, scoreY, panelWidth, 38, 2, 2, 'F');
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.setTextColor(...navy);
    pdf.text('Score global de l’audit', margin + 5, scoreY + 7);
    pdf.setFontSize(27); pdf.setTextColor(...internalAuditScoreColor(data.score.percentage));
    pdf.text(cleanText(auditReportPercent(data.score.percentage)), margin + 5, scoreY + 20);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(...muted);
    pdf.text(cleanText(`${auditReportNumber(data.score.earnedPoints)} / ${auditReportNumber(data.score.maxPoints)} points applicables`),
      margin + 5, scoreY + 27);
    pdf.text(`Écarts : ${findingBreakdown}`, margin + 5, scoreY + 33);
    const auditor = pdf.splitTextToSize(cleanText(`Auditeur : ${input.audit.auditorName || 'Non renseigné'}`), panelWidth) as string[];
    pdf.text(auditor, margin, scoreY + 45);
    pdf.text(cleanText(`Grille : ${input.audit.templateName} - version ${input.audit.templateVersion}`),
      margin, scoreY + 45 + auditor.length * 4, { maxWidth: panelWidth });
    const radarX = margin + panelWidth + 7;
    const radarY = dateY - 8;
    drawInternalAuditRadar(pdf, chapterScores, { x: radarX, y: radarY, width: width - margin - radarX, height: 190 - radarY }, { labelLayout: 'radial' });
  }

  if (mode === 'report') {
    drawCover();
    nextPage();
  } else {
    drawHeader();
    table(templateMode ? [
      ['Modèle', cleanText(input.audit.templateName), 'Version', String(input.audit.templateVersion)],
      ['Site / Navire', cleanText(input.site.name), 'Utilisation', 'Préparation de l’audit'],
    ] : [
      ['Site / Navire', cleanText(input.site.name), 'Campagne', String(input.audit.year)],
      ['Auditeur', cleanText(input.audit.auditorName || 'Non renseigné'), 'Date de réalisation', auditDate],
      ['Grille', cleanText(`${input.audit.templateName} - version ${input.audit.templateVersion}`), 'Statut', cleanText(AUDIT_STATUS_LABELS[input.audit.status])],
    ], [], [29, 109, 31, 104]);
  }
  if (sections.includes('grid')) {
    if (!templateMode) scoreCards();
    const gridRows: RowInput[] = [];
    const chapterEnds = new Map<string, number>();
    const chapterPercentages = new Map(chapterScores.map(({ section, percentage }) => [section, percentage]));
    const scoreRows = new Map<number, number | null>();
    const gridChapters = data.questions.map(({ row }) => row.section.trim() || 'Sans chapitre');
    gridChapters.forEach((section, index) => chapterEnds.set(section, index));
    data.questions.forEach((question, index) => {
      const section = gridChapters[index];
      if (section !== gridChapters[index - 1]) {
        gridRows.push([{ content: cleanText(section), colSpan: 5, styles: { fillColor: pale, fontStyle: 'bold', textColor: navy } }]);
      }
      gridRows.push([
        cleanText(question.row.reference || '-'),
        cleanText(question.row.hrFunction?.trim() || 'Non affectée'),
        cleanText(`${question.row.question}${question.row.guidance ? `\n\nÉléments à vérifier :\n${question.row.guidance}` : ''}`),
        cleanText(`${question.answerLabel}\n${question.pointsLabel}`),
        cleanText(question.row.observation || '-'),
      ]);
      if (!templateMode && chapterEnds.get(section) === index) {
        const score = chapterPercentages.get(section) ?? null;
        scoreRows.set(gridRows.length, score);
        gridRows.push([{ content: cleanText(`Score du chapitre - ${section} : ${auditReportPercent(score)}`), colSpan: 5,
          styles: { fontStyle: 'bold', minCellHeight: 14, cellPadding: { top: 2.6, right: 2.6, bottom: 7, left: 2.6 } } }]);
      }
    });
    table(gridRows, ['Référence', 'Fonction RH', 'Question / Éléments à vérifier', 'Notation', 'Observations'], [20, 34, 105, 32, 82], {
      drawCell(cell) {
        if (cell.section !== 'body' || cell.column.index !== 0 || !scoreRows.has(cell.row.index)) return;
        const score = scoreRows.get(cell.row.index) ?? null;
        const x = cell.cell.x + 2.6;
        const y = cell.cell.y + cell.cell.height - 5.7;
        const barWidth = cell.cell.width - 5.2;
        pdf.setFillColor(...pale); pdf.rect(x, y, barWidth, 3, 'F');
        if (score !== null && score > 0) {
          pdf.setFillColor(...internalAuditScoreColor(score)); pdf.rect(x, y, barWidth * score / 100, 3, 'F');
        }
      },
    });
  }

  if (sections.includes('summary')) {
    if (sections[0] !== 'summary') beginSection('02 - Synthèse');
    paragraph('02.1 - Liste des écarts', { bold: true, size: 12 });
    if (!data.findings.length) {
      paragraph('Aucun écart émis pour cet audit.', { bold: true });
    } else {
      table(data.findings.map(({ finding }) => [
        cleanText(finding.reference || '-'),
        cleanText(`${FINDING_SEVERITY_LABELS[finding.severity]}\n\n${finding.description}`),
        cleanText(finding.assigneeLabel),
        finding.dueOn ? formatAuditDate(finding.dueOn) : 'Sans délai',
      ]), ['Référence', 'Écart / Constat', 'Responsable', 'Échéance'], [25, 153, 60, 35]);
    }
    ensureSpace(26);
    paragraph('02.2 - Suivi du traitement des écarts', { bold: true, size: 12 });
    if (!data.findings.length) paragraph('Aucun écart à suivre.', { color: muted });
    for (const { finding, question, events } of data.findings) {
      ensureSpace(17);
      paragraph(`${finding.reference || 'Sans référence'} - ${FINDING_SEVERITY_LABELS[finding.severity]} - ${FINDING_STATUS_LABELS[finding.status]}`, { bold: true, size: 10 });
      if (question) paragraph(`Question : ${question.question}`, { size: 8, color: muted });
      if (finding.treatment && finding.treatment !== events.at(-1)?.treatment) {
        paragraph(finding.treatment, { size: 8.5 });
      } else if (!finding.treatment && !events.length) {
        paragraph('Aucun traitement renseigné.', { size: 8.5, color: muted });
      }
      await renderPhotos(finding.photos ?? [], `Photo du constat - ${finding.assigneeLabel}`);
      for (const event of events) {
        ensureSpace(16);
        paragraph(`${formatAuditDate(auditReportTimestampDay(event.createdAt))} - ${event.actorName || 'Responsable de traitement'} - ${FINDING_STATUS_LABELS[event.status]}`, { bold: true, size: 8.5 });
        paragraph(event.treatment, { size: 8.5 });
        await renderPhotos(event.photos ?? [], `Photo du traitement - ${event.actorName || 'Responsable de traitement'} - ${formatAuditDate(auditReportTimestampDay(event.createdAt))}`);
      }
      cursor += 4;
    }
  }

  if (sections.includes('chart')) {
    if (sections[0] !== 'chart') beginSection('03 - Graphique');
    const comparison = data.comparison;
    paragraph(input.audit.performedOn ? `Scores de l’audit du ${auditDate}` : auditDate, { bold: true, size: 11 });
    if (data.draft) paragraph('Brouillon : les réponses peuvent encore évoluer. Le score courant est provisoire.', { bold: true, color: draftColor });
    const radarHeight = 182 - cursor;
    drawInternalAuditRadar(pdf, [{ section: 'Score global', percentage: data.score.percentage }, ...chapterScores],
      { x: margin, y: cursor, width: usableWidth, height: radarHeight });
    cursor += radarHeight + 4;
    paragraph('N/A : aucun score calculable pour ce chapitre.', { size: 8, color: muted });

    nextPage();
    paragraph('Comparaison annuelle', { bold: true, size: 11 });
    if (!comparison.previousAudit) paragraph(`Aucun audit réalisé en ${input.audit.year - 1}. Le score précédent et l’évolution restent absents.`, { bold: true });
    table([
      [`Audit ${input.audit.year}`, auditReportPercent(comparison.current.percentage), `${auditReportNumber(comparison.current.earnedPoints)} / ${auditReportNumber(comparison.current.maxPoints)}`, input.audit.performedOn ? formatAuditDate(input.audit.performedOn) : 'Non débuté'],
      [`Audit ${input.audit.year - 1}`, comparison.previous ? auditReportPercent(comparison.previous.percentage) : 'Absent', comparison.previous ? `${auditReportNumber(comparison.previous.earnedPoints)} / ${auditReportNumber(comparison.previous.maxPoints)}` : '-', comparison.previousAudit?.performedOn ? formatAuditDate(comparison.previousAudit.performedOn) : '-'],
      ['Évolution', comparison.delta === null ? 'Indisponible' : `${comparison.delta > 0 ? '+' : ''}${auditReportNumber(comparison.delta)} points de pourcentage`, '', ''],
    ], ['Audit', 'Score', 'Points applicables', 'Réalisation'], [50, 90, 65, 68], { cellPadding: 1.6 });
    paragraph('Les N/A sont exclus du barème. Les scores de chaque année utilisent les questions et barèmes conservés dans l’audit concerné.', { size: 8, color: muted });
    table(comparison.sections.map((row) => [
      cleanText(row.section), auditReportPercent(row.current), row.previous === null && !comparison.previousAudit ? 'Absent' : auditReportPercent(row.previous),
      row.delta === null ? '-' : `${row.delta > 0 ? '+' : ''}${auditReportNumber(row.delta)}`,
    ]), ['Chapitre', `Audit ${input.audit.year}`, `Audit ${input.audit.year - 1}`, 'Évolution (points)'], [165, 35, 35, 38], { cellPadding: 1.6 });
  }
  if (!templateMode) {
    beginSection('04 - Participants et signatures');
    paragraph('Signatures enregistrées dans les profils des participants. Leur présence ne constitue pas une nouvelle signature de ce rapport.', { size: 8, color: muted });
    if (!participants.length) paragraph('Aucun participant renseigné pour cet audit.', { bold: true });
    else table(participants.map((participant, index) =>
      [cleanText(participant.lastName), cleanText(participant.firstName), cleanText(participant.functionLabel || 'Non renseignée'), signatures[index] ? '' : 'Non signée']
        .map((content) => ({ content, styles: { minCellHeight: 33 } }))),
    ['Nom', 'Prénom', 'Fonction RH', 'Signature du profil'], [52, 52, 78, 91], {
      drawCell(cell) {
        if (cell.section !== 'body' || cell.column.index !== 3) return;
        const image = signatures[cell.row.index];
        if (!image) return;
        let dimensions: { width: number; height: number };
        try { dimensions = pdf.getImageProperties(image); }
        catch { throw new Error(`La signature de ${participants[cell.row.index].firstName} ${participants[cell.row.index].lastName} est illisible.`); }
        const scale = Math.min((cell.cell.width - 8) / dimensions.width, 25 / dimensions.height);
        const imageWidth = dimensions.width * scale;
        const imageHeight = dimensions.height * scale;
        pdf.addImage(image, /^data:image\/jpeg/i.test(image) ? 'JPEG' : 'PNG',
          cell.cell.x + (cell.cell.width - imageWidth) / 2, cell.cell.y + (cell.cell.height - imageHeight) / 2,
          imageWidth, imageHeight, undefined, 'FAST');
      },
    });
  }
  return finishPdf();

  function finishPdf(): InternalAuditGeneratedReport {
    const pageCount = pdf.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
      pdf.setPage(page); pdf.setDrawColor(210, 223, 229); pdf.setLineWidth(0.25); pdf.line(margin, height - 13, width - margin, height - 13);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.setTextColor(...muted);
      pdf.text(cleanText(templateMode ? `SeaPilot - Modèle de grille - version ${input.audit.templateVersion}`
        : `SeaPilot - ${input.site.name} - Audit ${input.audit.year}${data.draft ? ' - Brouillon' : ''}`), margin, height - 8);
      pdf.text(`Export du ${formatAuditDate(todayAuditParis(input.generatedAt ?? new Date()))}`, width / 2, height - 8, { align: 'center' });
      pdf.text(`${page} / ${pageCount}`, width - margin, height - 8, { align: 'right' });
    }
    return { blob: pdf.output('blob'), filename: `${gridOnly ? 'Grille_' : ''}${data.filename}`, pageCount };
  }
}

export function buildInternalAuditReport(input: InternalAuditReportInput): Promise<InternalAuditGeneratedReport> {
  return buildAuditPdf(input);
}

/** Print the persisted audit snapshot without findings, comparison or private-photo requests. */
export function buildInternalAuditGridReport(input: InternalAuditReportInput): Promise<InternalAuditGeneratedReport> {
  return buildAuditPdf({ ...input, sections: ['grid'] }, 'print');
}

export interface InternalAuditTemplateReportInput { template: AuditTemplate; site?: AuditSite; sortByHrFunction?: boolean }

export async function buildInternalAuditTemplateReport(input: InternalAuditTemplateReportInput): Promise<InternalAuditGeneratedReport> {
  if (input.site && (input.site.companyId !== input.template.companyId
    || input.template.siteId !== null && input.template.siteId !== input.site.id)) {
    throw new Error('Le site de la grille ne correspond pas au modèle sélectionné.');
  }
  const site: AuditSite = input.site || { id: input.template.siteId || `template-${input.template.id}`, companyId: input.template.companyId,
    name: input.template.siteId ? 'Site du modèle' : 'Tous les sites', kind: 'shore', vesselId: null, anniversaryOn: null };
  const audit: InternalAudit = { id: `template-${input.template.id}`, companyId: input.template.companyId, siteId: site.id,
    templateId: input.template.id, templateName: input.template.name, templateVersion: input.template.version,
    year: 0, plannedOn: '', performedOn: null, auditorName: '', status: 'planned', rows: blankAuditAnswers(input.template.rows), completedAt: null };
  const report = await buildAuditPdf({ audit, site, audits: [], findings: [], events: [], sections: ['grid'], sortByHrFunction: input.sortByHrFunction }, 'template');
  const slug = input.template.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
  return { ...report, filename: `Modele_Grille_Audit_ISM_${slug || 'Grille'}_v${input.template.version}.pdf` };
}

/** Reserve the tab during the click gesture, then let the user choose the PDF viewer's print action. */
export async function openInternalAuditGridPrintPreview(input: InternalAuditReportInput): Promise<void> {
  const preview = window.open('', '_blank');
  if (!preview) throw new Error('L’aperçu a été bloqué. Autorisez les fenêtres de SeaPilot, puis cliquez à nouveau sur Imprimer la grille.');
  preview.opener = null;
  preview.document.title = 'Grille d’audit · aperçu imprimable';
  preview.document.body.textContent = 'Préparation de la grille d’audit…';
  let url: string | null = null;
  try {
    const report = await buildInternalAuditGridReport(input);
    if (preview.closed) return;
    url = URL.createObjectURL(report.blob);
    preview.location.replace(url);
    const previewUrl = url;
    window.setTimeout(() => URL.revokeObjectURL(previewUrl), 600_000);
  } catch (cause) {
    if (url) URL.revokeObjectURL(url);
    preview.close();
    throw cause;
  }
}

export async function downloadInternalAuditReport(input: InternalAuditReportInput): Promise<void> {
  const report = await buildInternalAuditReport(input);
  downloadGeneratedInternalAuditReport(report);
}

export async function downloadInternalAuditGridReport(input: InternalAuditReportInput): Promise<void> {
  downloadGeneratedInternalAuditReport(await buildInternalAuditGridReport(input));
}

export async function downloadInternalAuditTemplateReport(input: InternalAuditTemplateReportInput): Promise<void> {
  downloadGeneratedInternalAuditReport(await buildInternalAuditTemplateReport(input));
}

function downloadGeneratedInternalAuditReport(report: InternalAuditGeneratedReport): void {
  const url = URL.createObjectURL(report.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = report.filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
