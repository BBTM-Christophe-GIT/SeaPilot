import type { AuditAnswer, AuditFinding, AuditFindingEvent, AuditParticipant, AuditPhoto, AuditSite, AuditTemplate, InternalAudit } from './internalAuditModel';
import type { CellHookData, RowInput } from 'jspdf-autotable';
import {
  AUDIT_ANSWER_LABELS, AUDIT_STATUS_LABELS, FINDING_SEVERITY_LABELS, FINDING_STATUS_LABELS,
  blankAuditAnswers, compareAuditScores, formatAuditDate, scoreAudit, todayAuditParis,
} from './internalAuditModel';

export interface InternalAuditReportInput {
  audit: InternalAudit;
  site: AuditSite;
  audits: readonly InternalAudit[];
  findings: readonly AuditFinding[];
  events: readonly AuditFindingEvent[];
  loadPhoto?: (photo: AuditPhoto) => Promise<string | null>;
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

async function buildAuditPdf(input: InternalAuditReportInput, templateMode = false): Promise<InternalAuditGeneratedReport> {
  const data = internalAuditReportData(input);
  const sections = internalAuditReportSections(input.sections);
  const gridOnly = sections.length === 1 && sections[0] === 'grid';
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
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
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
  let currentSection = ({ grid: '01 - Grille d’audit', summary: '02 - Synthèse', chart: '03 - Graphique' })[sections[0]];
  let cursor = 41;

  function drawHeader() {
    pdf.setFillColor(...navy);
    pdf.rect(0, 0, width, 24, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(16);
    pdf.text(templateMode ? 'Modèle de grille ISM Interne' : gridOnly ? 'Grille d’audit ISM Interne' : 'Audit ISM Interne', margin, 11);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.text(cleanText(templateMode ? `BBTM - ${input.site.name} - Version ${input.audit.templateVersion}`
      : `BBTM - ${input.site.name} - Campagne ${input.audit.year}`), margin, 18);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.text(templateMode ? 'GRILLE VIERGE' : data.draft ? 'BROUILLON - REPONSES NON FINALISEES' : 'AUDIT REALISE', width - margin, 13, { align: 'right' });
    pdf.setTextColor(...navy);
    pdf.setFontSize(13);
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
  function table(body: RowInput[], head: string[], columnWidths: number[], startY = cursor, drawCell?: (cell: CellHookData) => void) {
    autoTable(pdf, {
      startY, body, head: head.length ? [head] : undefined,
      theme: 'grid', showHead: 'everyPage', rowPageBreak: 'auto',
      margin: { top: 42, bottom: 17, left: margin, right: margin },
      styles: { font: 'helvetica', fontSize: 8.2, cellPadding: 2.6, textColor: navy, lineColor: [215, 225, 229], lineWidth: 0.15, overflow: 'linebreak', valign: 'top' },
      headStyles: { fillColor: navy, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
      columnStyles: Object.fromEntries(columnWidths.map((cellWidth, index) => [index, { cellWidth }])),
      didDrawPage: drawHeader,
      didDrawCell: drawCell,
    });
    cursor = (pdf as typeof pdf & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 45;
    cursor += 6;
  }
  function scoreCards() {
    ensureSpace(24);
    const values = [
      ['Score de l’audit', auditReportPercent(data.score.percentage), `${auditReportNumber(data.score.earnedPoints)} / ${auditReportNumber(data.score.maxPoints)} points applicables`],
      ['Réponses conservées', `${data.score.answeredCount} / ${data.score.totalCount}`, `${data.score.excludedCount} réponse(s) N/A - hors calcul`],
      ...(!gridOnly ? [['Écarts émis', String(data.findings.length), `${data.findings.filter(({ finding }) => finding.severity === 'major').length} majeure(s), ${data.findings.filter(({ finding }) => finding.severity === 'minor').length} mineure(s), ${data.findings.filter(({ finding }) => finding.severity === 'remark').length} remarque(s)`]] : []),
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

  drawHeader();
  table(templateMode ? [
    ['Modèle', cleanText(input.audit.templateName), 'Version', String(input.audit.templateVersion)],
    ['Site / Navire', cleanText(input.site.name), 'Utilisation', 'Préparation de l’audit'],
  ] : [
    ['Site / Navire', cleanText(input.site.name), 'Campagne', String(input.audit.year)],
    ['Auditeur', cleanText(input.audit.auditorName || 'Non renseigné'), 'Date de réalisation', input.audit.performedOn ? formatAuditDate(input.audit.performedOn) : 'Audit non débuté'],
    ['Grille', cleanText(`${input.audit.templateName} - version ${input.audit.templateVersion}`), 'Statut', cleanText(AUDIT_STATUS_LABELS[input.audit.status])],
  ], [], [29, 109, 31, 104]);
  if (sections.includes('grid')) {
    if (!templateMode) scoreCards();
    const gridRows: RowInput[] = [];
    let previousSection = '';
    for (const question of data.questions) {
      if (question.row.section !== previousSection) {
        gridRows.push([{ content: cleanText(question.row.section), colSpan: 5, styles: { fillColor: pale, fontStyle: 'bold', textColor: navy } }]);
        previousSection = question.row.section;
      }
      gridRows.push([
        cleanText(question.row.reference || '-'),
        cleanText(question.row.hrFunction?.trim() || 'Non affectée'),
        cleanText(`${question.row.question}${question.row.guidance ? `\n\nÉléments à vérifier :\n${question.row.guidance}` : ''}`),
        cleanText(`${question.answerLabel}\n${question.pointsLabel}`),
        cleanText(question.row.observation || '-'),
      ]);
    }
    table(gridRows, ['Référence', 'Fonction RH', 'Question / Éléments à vérifier', 'Notation', 'Observations'], [20, 34, 105, 32, 82]);
  }

  if (sections.includes('summary')) {
    if (sections[0] !== 'summary') beginSection('02 - Synthèse');
    paragraph('Non conformités majeures, non conformités mineures et remarques émises pour l’audit sélectionné.', { color: muted });
    if (!data.findings.length) {
      paragraph('Aucun écart émis pour cet audit.', { bold: true });
    } else {
      table(data.findings.map(({ finding }) => [
        cleanText(finding.reference || '-'),
        cleanText(`${FINDING_SEVERITY_LABELS[finding.severity]}\n\n${finding.description}`),
        cleanText(finding.assigneeLabel),
        finding.dueOn ? formatAuditDate(finding.dueOn) : 'Sans délai',
        cleanText(`${FINDING_STATUS_LABELS[finding.status]}${finding.treatment ? `\n\n${finding.treatment}` : '\nAucun traitement renseigné'}`),
      ]), ['Référence', 'Écart / Constat', 'Responsable', 'Échéance', 'Traitement'], [20, 88, 50, 28, 87]);
      for (const entry of data.findings) {
        if (!entry.events.length && !entry.finding.photos?.length) continue;
        ensureSpace(17);
        paragraph(`${entry.finding.reference || 'Sans référence'} - ${FINDING_SEVERITY_LABELS[entry.finding.severity]} - ${entry.finding.description}`, { bold: true, size: 10 });
        if (entry.question) paragraph(`Question : ${entry.question.question}`, { size: 8, color: muted });
        await renderPhotos(entry.finding.photos ?? [], `Photo du constat - ${entry.finding.assigneeLabel}`);
        for (const event of entry.events) {
          ensureSpace(16);
          paragraph(`${formatAuditDate(auditReportTimestampDay(event.createdAt))} - ${event.actorName || 'Responsable de traitement'} - ${FINDING_STATUS_LABELS[event.status]}`, { bold: true, size: 8.5 });
          paragraph(event.treatment, { size: 8.5 });
          await renderPhotos(event.photos ?? [], `Photo du traitement - ${event.actorName || 'Responsable de traitement'} - ${formatAuditDate(auditReportTimestampDay(event.createdAt))}`);
        }
        cursor += 4;
      }
    }
  }

  if (sections.includes('chart')) {
    if (sections[0] !== 'chart') beginSection('03 - Graphique');
    const comparison = data.comparison;
    paragraph(`Comparaison de l’audit ${input.audit.year} avec l’audit réalisé du même site en ${input.audit.year - 1}.`, { color: muted });
    if (data.draft) paragraph('Brouillon : les réponses peuvent encore évoluer. Le score courant est provisoire.', { bold: true, color: [152, 81, 27] });
    if (!comparison.previousAudit) paragraph(`Aucun audit réalisé en ${input.audit.year - 1}. Le score précédent et l’évolution restent absents.`, { bold: true });
    table([
      [`Audit ${input.audit.year}`, auditReportPercent(comparison.current.percentage), `${auditReportNumber(comparison.current.earnedPoints)} / ${auditReportNumber(comparison.current.maxPoints)}`, input.audit.performedOn ? formatAuditDate(input.audit.performedOn) : 'Non débuté'],
      [`Audit ${input.audit.year - 1}`, comparison.previous ? auditReportPercent(comparison.previous.percentage) : 'Absent', comparison.previous ? `${auditReportNumber(comparison.previous.earnedPoints)} / ${auditReportNumber(comparison.previous.maxPoints)}` : '-', comparison.previousAudit?.performedOn ? formatAuditDate(comparison.previousAudit.performedOn) : '-'],
      ['Évolution', comparison.delta === null ? 'Indisponible' : `${comparison.delta > 0 ? '+' : ''}${auditReportNumber(comparison.delta)} points de pourcentage`, '', ''],
    ], ['Audit', 'Score', 'Points applicables', 'Réalisation'], [50, 90, 65, 68]);
    paragraph(`Bleu : audit ${input.audit.year}. Vert : audit ${input.audit.year - 1}. N/A : aucune notation applicable.`, { size: 8, color: muted });
    const chartRows = [{ section: 'Score global', current: comparison.current.percentage, previous: comparison.previous?.percentage ?? null }, ...comparison.sections];
    for (const row of chartRows) {
      const label = row.section.length > 240 ? `${row.section.slice(0, 237)}...` : row.section;
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8);
      const labelLines = pdf.splitTextToSize(cleanText(label), 74) as string[];
      const rowHeight = Math.max(18, labelLines.length * 3.8 + 3);
      ensureSpace(rowHeight);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8);
      pdf.setTextColor(...navy); pdf.text(labelLines, margin, cursor + 4);
      for (const [index, value] of [row.current, row.previous].entries()) {
        const y = cursor + index * 7;
        pdf.setFillColor(...pale); pdf.rect(91, y, 164, 4.5, 'F');
        if (value !== null && value > 0) { pdf.setFillColor(...(index === 0 ? navy : teal)); pdf.rect(91, y, 164 * value / 100, 4.5, 'F'); }
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(...navy);
        pdf.text(value === null ? index === 1 && !comparison.previousAudit ? 'Absent' : 'N/A' : auditReportPercent(value), 260, y + 3.5);
      }
      cursor += rowHeight;
    }
    paragraph('Les N/A sont exclus du barème. Les scores de chaque année utilisent les questions et barèmes conservés dans l’audit concerné.', { size: 8, color: muted });
    table(comparison.sections.map((row) => [
      cleanText(row.section), auditReportPercent(row.current), row.previous === null && !comparison.previousAudit ? 'Absent' : auditReportPercent(row.previous),
      row.delta === null ? '-' : `${row.delta > 0 ? '+' : ''}${auditReportNumber(row.delta)}`,
    ]), ['Chapitre', `Audit ${input.audit.year}`, `Audit ${input.audit.year - 1}`, 'Évolution (points)'], [165, 35, 35, 38]);
  }
  if (!templateMode) {
    beginSection('04 - Participants et signatures');
    paragraph('Signatures enregistrées dans les profils des participants. Leur présence ne constitue pas une nouvelle signature de ce rapport.', { size: 8, color: muted });
    if (!participants.length) paragraph('Aucun participant renseigné pour cet audit.', { bold: true });
    else table(participants.map((participant, index) =>
      [cleanText(participant.lastName), cleanText(participant.firstName), cleanText(participant.functionLabel || 'Non renseignée'), signatures[index] ? '' : 'Non signée']
        .map((content) => ({ content, styles: { minCellHeight: 33 } }))),
    ['Nom', 'Prénom', 'Fonction RH', 'Signature du profil'], [52, 52, 78, 91], cursor, (cell) => {
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
  return buildAuditPdf({ ...input, sections: ['grid'] });
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
  const report = await buildAuditPdf({ audit, site, audits: [], findings: [], events: [], sections: ['grid'], sortByHrFunction: input.sortByHrFunction }, true);
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
