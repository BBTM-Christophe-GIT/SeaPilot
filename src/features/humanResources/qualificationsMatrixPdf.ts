import type {
  QualificationsMatrix, QualificationsMatrixDocument, QualificationsMatrixPerson,
} from './qualificationsMatrixModel';

type Pdf = import('jspdf').jsPDF;
type Rgb = [number, number, number];

const NAVY: Rgb = [23, 32, 51];
const BLUE: Rgb = [21, 96, 130];
const SLATE: Rgb = [75, 93, 114];
const GRID: Rgb = [216, 226, 239];
const PALE: Rgb = [238, 244, 250];
const STATUS_COLORS: Record<QualificationsMatrixDocument['status'], { text: Rgb; fill: Rgb }> = {
  valid: { text: [0, 105, 74], fill: [235, 247, 239] },
  renew_due: { text: [147, 87, 0], fill: [255, 248, 225] },
  expired: { text: [167, 35, 47], fill: [254, 238, 239] },
  missing: { text: [91, 108, 127], fill: [242, 245, 249] },
  pending_validation: { text: [37, 90, 156], fill: [237, 244, 253] },
};

const LEFT = 12, RIGHT = 285, TOP = 42, BOTTOM = 192;
const WIDTH = RIGHT - LEFT, DOCUMENT_WIDTH = 195, DATE_WIDTH = 35, STATUS_WIDTH = 43;
const FONT_SIZE = 8.5, LINE_HEIGHT = 3.6, PADDING = 2.2;

function printable(value: string): string {
  return value.replace(/[\u00a0\u202f]/g, ' ').replace(/[’‘]/g, "'").replace(/[\u2010-\u2014]/g, '-');
}

function parisDateKey(date: Date): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(date);
}

function setText(pdf: Pdf, color: Rgb, size: number, bold = false): void {
  pdf.setTextColor(...color); pdf.setFont('helvetica', bold ? 'bold' : 'normal'); pdf.setFontSize(size);
}

/** Export only the already-authorized, formatted matrix; never resolve storage or medical data. */
export async function buildQualificationsMatrixPdf(
  matrix: QualificationsMatrix,
  generatedOn = new Date(),
): Promise<{ blob: Blob; fileName: string }> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ compress: true, format: 'a4', orientation: 'landscape', unit: 'mm' });
  const dateLabel = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris' }).format(generatedOn);
  const dateKey = parisDateKey(generatedOn);
  pdf.setProperties({ title: 'Matrice des Qualifications', subject: 'Brevets et visites médicales des marins', author: 'BBTM', creator: 'SeaPilot' });
  pdf.setCreationDate(generatedOn);
  setText(pdf, SLATE, 6.5);
  const exportedCategoryLines = pdf.splitTextToSize(printable(`Catégories exportées : ${matrix.categories.map((category) => category.label).join(' · ') || 'Aucune'}`), WIDTH) as string[];
  const bodyTop = TOP + Math.max(0, exportedCategoryLines.length - 1) * 2.8;
  let y = bodyTop, currentFunction = '', currentPerson: QualificationsMatrixPerson | null = null;
  let currentCategory = '';

  const split = (value: string, width: number, size = FONT_SIZE, bold = false): string[] => {
    setText(pdf, NAVY, size, bold);
    const lines = pdf.splitTextToSize(printable(value), width) as string[];
    return lines.length ? lines : ['Non renseigné'];
  };
  const header = () => {
    pdf.setDrawColor(...NAVY); pdf.setLineWidth(.25); pdf.rect(LEFT, 10, WIDTH, 18); pdf.line(38, 10, 38, 28);
    setText(pdf, NAVY, 10, true); pdf.text('BBTM', 25, 21, { align: 'center' });
    setText(pdf, BLUE, 15, true); pdf.text('MATRICE DES QUALIFICATIONS', 44, 21.5);
    setText(pdf, SLATE, 8); pdf.text(`Édité le ${dateLabel}`, LEFT, 35);
    pdf.text(`${matrix.peopleCount} marin(s) · ${matrix.groups.filter((group) => group.people.length).length} fonction(s)`, RIGHT, 35, { align: 'right' });
    setText(pdf, SLATE, 6.5); pdf.text(exportedCategoryLines, LEFT, 39, { lineHeightFactor: 1.12 });
  };
  const band = (text: string, fill: Rgb, color: Rgb, size: number, minimumHeight: number): void => {
    const lines = split(text, WIDTH - 5, size, true);
    const height = Math.max(minimumHeight, lines.length * 3.8 + 3);
    pdf.setFillColor(...fill); pdf.rect(LEFT, y, WIDTH, height, 'F');
    setText(pdf, color, size, true); pdf.text(lines, LEFT + 2.5, y + 4.3, { lineHeightFactor: 1.12 });
    y += height;
  };
  const functionBand = (continued = false) => {
    band(`${currentFunction}${continued ? ' (suite)' : ''}`, BLUE, [255, 255, 255], 9.5, 7);
    y += 1.5;
  };
  const personBand = (continued = false) => {
    if (!currentPerson) return;
    const situation = `${currentPerson.employmentStatusLabel}${currentPerson.active ? '' : ' · Profil archivé'}`;
    const nameLines = split(`${currentPerson.personName}${continued ? ' (suite)' : ''}`, WIDTH - 63, 9.5, true);
    const height = Math.max(8, nameLines.length * 4 + 3);
    pdf.setFillColor(...PALE); pdf.rect(LEFT, y, WIDTH, height, 'F');
    setText(pdf, NAVY, 9.5, true); pdf.text(nameLines, LEFT + 2.5, y + 4.8, { lineHeightFactor: 1.15 });
    setText(pdf, SLATE, 7.3); pdf.text(printable(situation), RIGHT - 2.5, y + 4.8, { align: 'right' });
    y += height;
  };
  const columns = () => {
    pdf.setFillColor(248, 250, 252); pdf.setDrawColor(...GRID); pdf.setLineWidth(.2); pdf.rect(LEFT, y, WIDTH, 6.5, 'FD');
    setText(pdf, SLATE, 7.5, true);
    pdf.text('Document', LEFT + PADDING, y + 4.3);
    pdf.text('Échéance', LEFT + DOCUMENT_WIDTH + PADDING, y + 4.3);
    pdf.text('Statut', LEFT + DOCUMENT_WIDTH + DATE_WIDTH + PADDING, y + 4.3);
    pdf.line(LEFT + DOCUMENT_WIDTH, y, LEFT + DOCUMENT_WIDTH, y + 6.5);
    pdf.line(LEFT + DOCUMENT_WIDTH + DATE_WIDTH, y, LEFT + DOCUMENT_WIDTH + DATE_WIDTH, y + 6.5);
    y += 6.5;
  };
  const categoryBand = (continued = false) => {
    band(`${currentCategory}${continued ? ' (suite)' : ''}`, [225, 235, 245], BLUE, 8, 6);
  };
  const newPage = (repeatContext = false, repeatCategory = false) => {
    pdf.addPage(); header(); y = bodyTop;
    if (repeatContext && currentPerson) { functionBand(true); personBand(true); columns(); }
    if (repeatCategory && currentCategory) categoryBand(true);
  };
  const row = (title: string[], date: string[], status: string[], height: number, state?: QualificationsMatrixDocument['status']) => {
    pdf.setFillColor(255, 255, 255); pdf.setDrawColor(...GRID); pdf.setLineWidth(.15); pdf.rect(LEFT, y, WIDTH, height, 'FD');
    if (state) { pdf.setFillColor(...STATUS_COLORS[state].fill); pdf.rect(LEFT + DOCUMENT_WIDTH + DATE_WIDTH, y, STATUS_WIDTH, height, 'F'); }
    pdf.line(LEFT + DOCUMENT_WIDTH, y, LEFT + DOCUMENT_WIDTH, y + height);
    pdf.line(LEFT + DOCUMENT_WIDTH + DATE_WIDTH, y, LEFT + DOCUMENT_WIDTH + DATE_WIDTH, y + height);
    setText(pdf, NAVY, FONT_SIZE); pdf.text(title, LEFT + PADDING, y + PADDING + 2.5, { lineHeightFactor: 1.2 });
    setText(pdf, SLATE, FONT_SIZE); pdf.text(date, LEFT + DOCUMENT_WIDTH + PADDING, y + PADDING + 2.5, { lineHeightFactor: 1.2 });
    setText(pdf, state ? STATUS_COLORS[state].text : SLATE, FONT_SIZE);
    pdf.text(status, LEFT + DOCUMENT_WIDTH + DATE_WIDTH + PADDING, y + PADDING + 2.5, { lineHeightFactor: 1.2 });
    y += height;
  };

  header();
  if (!matrix.groups.some((group) => group.people.length)) {
    setText(pdf, SLATE, 10); pdf.text('Aucun marin à afficher dans la matrice des qualifications.', LEFT, y + 7);
  } else if (!matrix.categories.length) {
    setText(pdf, SLATE, 10); pdf.text('Aucune catégorie de qualification accessible.', LEFT, y + 7);
  } else for (const group of matrix.groups) {
    if (!group.people.length) continue;
    currentFunction = printable(group.functionLabel);
    const personMinimum = (person: QualificationsMatrixPerson) => {
      const nameHeight = Math.max(8, split(person.personName, WIDTH - 63, 9.5, true).length * 4 + 3);
      const category = matrix.categories[0];
      const firstDocument = category ? person.categories[category.key][0] : undefined;
      const firstTitle = firstDocument ? split(firstDocument.title, DOCUMENT_WIDTH - 2 * PADDING) : [''];
      const firstHeight = Math.min(25, Math.max(7.5, firstTitle.length * LINE_HEIGHT + 2 * PADDING));
      return nameHeight + 6.5 + 7 + firstHeight;
    };
    const functionHeight = Math.max(7, split(currentFunction, WIDTH - 5, 9.5, true).length * 3.8 + 3) + 1.5;
    if (y + functionHeight + personMinimum(group.people[0]) > BOTTOM) newPage();
    functionBand();
    for (const [personIndex, person] of group.people.entries()) {
      currentPerson = person; currentCategory = '';
      if (personIndex) y += 4;
      if (y + personMinimum(person) > BOTTOM) { newPage(); functionBand(true); }
      personBand(); columns();
      for (const category of matrix.categories) {
        currentCategory = printable(category.label);
        const documents = person.categories[category.key];
        const firstRow = documents[0];
        const firstTitle = firstRow ? split(firstRow.title, DOCUMENT_WIDTH - 2 * PADDING) : ['Aucun document enregistré.'];
        const firstHeight = Math.min(25, Math.max(7.5, firstTitle.length * LINE_HEIGHT + 2 * PADDING));
        if (y + 7 + firstHeight > BOTTOM) newPage(true);
        categoryBand();
        if (!documents.length) {
          row(['Aucun document enregistré.'], ['Non renseignée'], ['Non renseigné'], 7.5);
          continue;
        }
        for (const document of documents) {
          const titleLines = split(document.title, DOCUMENT_WIDTH - 2 * PADDING);
          const dateLines = split(document.expiresOnLabel, DATE_WIDTH - 2 * PADDING);
          const statusLines = split(document.statusLabel, STATUS_WIDTH - 2 * PADDING);
          let remaining = titleLines;
          const height = Math.max(7.5, Math.max(titleLines.length, dateLines.length, statusLines.length) * LINE_HEIGHT + 2 * PADDING);
          // Keep ordinary document rows whole. A document longer than an entire
          // page is split into visible continuations, with all context repeated.
          if (y + height > BOTTOM && height <= 110) newPage(true, true);
          while (remaining.length) {
            const availableLines = Math.floor((BOTTOM - y - 2 * PADDING) / LINE_HEIGHT);
            if (availableLines < Math.max(1, dateLines.length, statusLines.length)) { newPage(true, true); continue; }
            const part = remaining.slice(0, availableLines);
            const partHeight = Math.max(7.5, Math.max(part.length, dateLines.length, statusLines.length) * LINE_HEIGHT + 2 * PADDING);
            row(part, dateLines, statusLines, partHeight, document.status);
            remaining = remaining.slice(part.length);
            if (remaining.length) newPage(true, true);
          }
        }
      }
      y += 2;
    }
    y += 3;
  }

  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page); pdf.setDrawColor(...GRID); pdf.setLineWidth(.2); pdf.line(LEFT, 197, RIGHT, 197);
    setText(pdf, SLATE, 6.5); pdf.text('SeaPilot - Ressources Humaines - Matrice des Qualifications', LEFT, 202);
    pdf.text(`${dateLabel} · Page ${page} / ${pages}`, RIGHT, 202, { align: 'right' });
  }
  return { blob: pdf.output('blob'), fileName: `Matrice-des-Qualifications-${dateKey}.pdf` };
}
