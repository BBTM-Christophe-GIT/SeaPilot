import {
  formatPersonName,
  getHrDocumentCategoryLabel,
  getHrEnimClassification,
  normalizeHrFunctionLabel,
  type HrDocumentRecord,
  type PersonRecord,
} from './peopleQueries';

export interface CollaboratorSheetField {
  key: string;
  label: string;
  value: string;
}

export interface CollaboratorSheetSection {
  key: string;
  label: string;
  fields: CollaboratorSheetField[];
  table?: {
    columns: Array<{ key: string; label: string }>;
    rows: Array<Record<string, string>>;
    emptyLabel: string;
  };
}

export type CollaboratorSheetSelection = Record<string, string[]>;
export type CollaboratorSheetsExportMode = 'separate' | 'combined';
export interface CollaboratorSheetPdfOptions {
  includePhoto?: boolean;
}

const FIELD_DEFINITIONS = {
  identity: [
    ['employeeNumber', 'Matricule'], ['sailorNumber', 'Numéro de marin'],
    ['firstName', 'Prénom'], ['lastName', 'Nom'], ['functionLabel', 'Fonction'],
    ['gradeLabel', 'Grade'], ['roleLabel', 'Rôle'], ['registerLabel', 'Registre'],
    ['sex', 'Sexe'], ['email', 'Email'],
  ],
  contract: [
    ['enimFunctionCode', 'Code Fonction ENIM'], ['enimCategory', 'Catégorie'],
    ['contractType', 'Type de contrat'], ['hiredOn', 'Date embauche'],
    ['departedOn', 'Date départ'], ['departureReason', 'Cause départ'],
    ['birthDate', 'Date naissance'], ['birthPlace', 'Lieu naissance'],
  ],
  contact: [['postalAddress', 'Adresse postale'], ['phone', 'Téléphone']],
  emergency: [
    ['emergencyContactName', 'Contact'], ['emergencyContactRelationship', 'Lien parenté'],
    ['emergencyContactPhone', 'Téléphone urgence'], ['emergencyContactAddress', 'Adresse urgence'],
  ],
  administrative: [
    ['identityDocumentType', 'Type document identité'], ['identityDocumentNumber', 'Numéro document identité'],
  ],
  health: [
    ['deckCertificateLabel', 'Brevet Pont'], ['engineCertificateLabel', 'Brevet Machine'],
    ['craneInductionOn', 'Induction grutage'], ['craneTrainingOn', 'Formation grutage'],
  ],
  clothing: [
    ['coverallSize', 'Combinaison'], ['pantsSize', 'Pantalon'], ['jacketSize', 'Veste'],
    ['shoeSize', 'Pointure'], ['weightKg', 'Poids'], ['waistSize', 'Tour de taille'],
    ['chestSize', 'Poitrine'], ['fullHeightSize', 'Taille totale'],
    ['inseamSize', 'Entrejambe'], ['hipSize', 'Tour de hanche'],
  ],
  annualReviews: [],
  documents: [],
} as const;

type SectionKey = keyof typeof FIELD_DEFINITIONS;

const SECTION_LABELS: Record<SectionKey, string> = {
  identity: 'Identité et poste', contract: 'Contrat et dates', contact: 'Coordonnées',
  emergency: 'Contact urgence', administrative: 'Documents administratifs',
  health: 'Santé et habilitations', clothing: 'Tenues et mensurations',
  annualReviews: 'Entretien Annuel', documents: 'Brevets et visites médicales',
};

const DOCUMENT_COLUMNS = [
  { key: 'title', label: 'Document' }, { key: 'category', label: 'Catégorie' },
  { key: 'issuedOn', label: 'Date émission' }, { key: 'expiresOn', label: 'Échéance' },
  { key: 'status', label: 'Statut' }, { key: 'sourceLabel', label: 'Source' },
  { key: 'notes', label: 'Notes' },
];

const CERTIFICATE_COLUMNS = DOCUMENT_COLUMNS.filter((column) => ['title', 'category', 'expiresOn', 'status'].includes(column.key));
const documentCollator = new Intl.Collator('fr-FR', { sensitivity: 'base', numeric: true });

const MEDICAL_COLUMNS = [
  { key: 'title', label: 'Visite médicale' }, { key: 'issuedOn', label: 'Date visite' },
  { key: 'expiresOn', label: 'Échéance' }, { key: 'status', label: 'Statut' },
  { key: 'aptitude', label: 'Aptitude' }, { key: 'bridgeWatch', label: 'Veille passerelle' },
  { key: 'restriction', label: 'Restrictions' }, { key: 'notes', label: 'Notes médicales' },
];

const STATUS_LABELS: Record<HrDocumentRecord['status'], string> = {
  valid: 'À jour', renew_due: 'À renouveler', expired: 'Échu', missing: 'Manquant',
  pending_validation: 'Validation',
};

const DATE_FIELDS = new Set(['hiredOn', 'departedOn', 'birthDate', 'craneInductionOn', 'craneTrainingOn']);
const EMPTY_VALUE = 'Non renseigné';

function valueOrEmpty(value: string | number | null): string {
  return value === null || String(value).trim() === '' ? EMPTY_VALUE : String(value);
}

function formatDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return EMPTY_VALUE;
  const date = new Date(`${match[0]}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== match[0]) return EMPTY_VALUE;
  return new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC' }).format(date);
}

function documentRow(document: HrDocumentRecord): Record<string, string> {
  return {
    title: valueOrEmpty(document.title), category: getHrDocumentCategoryLabel(document.categoryKey),
    issuedOn: formatDate(document.issuedOn), expiresOn: formatDate(document.expiresOn),
    status: STATUS_LABELS[document.status], sourceLabel: valueOrEmpty(document.sourceLabel),
    // Medical details have their own selectable columns in the health section.
    // Keeping them out of this list prevents a second route around that selection.
    notes: document.categoryKey === 'medical_visit' ? '-' : valueOrEmpty(document.notes),
  };
}

function medicalRow(document: HrDocumentRecord): Record<string, string> {
  const restriction = document.medicalRestriction.trim();
  return {
    title: valueOrEmpty(document.title), issuedOn: formatDate(document.issuedOn),
    expiresOn: formatDate(document.expiresOn), status: STATUS_LABELS[document.status],
    aptitude: document.medicalUnfit
      ? 'Inapte à la navigation'
      : restriction ? 'Apte avec restrictions'
        : document.medicalBridgeWatch !== null ? 'Apte' : EMPTY_VALUE,
    bridgeWatch: document.medicalUnfit ? 'Sans objet'
      : document.medicalBridgeWatch === true ? 'Autorisée'
        : document.medicalBridgeWatch === false ? 'Non autorisée' : EMPTY_VALUE,
    restriction: valueOrEmpty(restriction), notes: valueOrEmpty(document.notes),
  };
}

/** Build export choices only from sections and documents already visible to the real account. */
export function buildCollaboratorSheetSections(
  person: PersonRecord,
  documents: HrDocumentRecord[],
  visibleSectionKeys: ReadonlySet<string>,
): CollaboratorSheetSection[] {
  const ownDocuments = documents.filter((document) => document.personId === person.id);
  const classification = getHrEnimClassification(person.functionLabel);
  const values = {
    ...person,
    functionLabel: normalizeHrFunctionLabel(person.functionLabel),
    enimFunctionCode: person.enimFunctionCode || classification.functionCode,
    enimCategory: person.enimCategory ?? classification.category,
  };

  return (Object.keys(FIELD_DEFINITIONS) as SectionKey[])
    .filter((key) => visibleSectionKeys.has(key))
    .map((key) => {
      const section: CollaboratorSheetSection = {
        key, label: SECTION_LABELS[key],
        fields: FIELD_DEFINITIONS[key].map(([fieldKey, label]) => ({
          key: fieldKey, label,
          value: DATE_FIELDS.has(fieldKey)
            ? formatDate(String(values[fieldKey]))
            : valueOrEmpty(values[fieldKey]),
        })),
      };
      if (key === 'health') {
        section.table = {
          columns: MEDICAL_COLUMNS.map((column) => ({ ...column })),
          rows: ownDocuments.filter((document) => document.categoryKey === 'medical_visit').map(medicalRow),
          emptyLabel: 'Aucune visite médicale enregistrée.',
        };
      } else if (key === 'annualReviews' || key === 'documents') {
        const listedDocuments = ownDocuments.filter((document) => key === 'annualReviews'
          ? document.categoryKey === 'annual_review'
          : document.categoryKey !== 'annual_review' && document.categoryKey !== 'administrative');
        if (key === 'documents') {
          listedDocuments.sort((left, right) => documentCollator.compare(getHrDocumentCategoryLabel(left.categoryKey), getHrDocumentCategoryLabel(right.categoryKey))
            || documentCollator.compare(left.title, right.title)
            || left.expiresOn.localeCompare(right.expiresOn)
            || left.id - right.id);
        }
        section.table = {
          columns: (key === 'documents' ? CERTIFICATE_COLUMNS : DOCUMENT_COLUMNS).map((column) => ({ ...column })),
          rows: listedDocuments.map((document) => {
            const row = documentRow(document);
            return key === 'documents' ? Object.fromEntries(CERTIFICATE_COLUMNS.map((column) => [column.key, row[column.key]])) : row;
          }),
          emptyLabel: key === 'annualReviews' ? 'Aucun entretien annuel enregistré.' : 'Aucun brevet ni visite médicale enregistré.',
        };
      }
      return section;
    });
}

/** Revalidate both the available schema and selected keys before handing any value to the PDF renderer. */
export function selectCollaboratorSheetSections(
  sections: CollaboratorSheetSection[],
  selection: CollaboratorSheetSelection,
): CollaboratorSheetSection[] {
  return sections.flatMap((section) => {
    if (!Object.hasOwn(FIELD_DEFINITIONS, section.key)) return [];
    const key = section.key as SectionKey;
    const chosenKeys = new Set(Array.isArray(selection[key]) ? selection[key] : []);
    const allowedFields = new Set<string>(FIELD_DEFINITIONS[key].map(([fieldKey]) => fieldKey));
    const fields = section.fields.filter((field) => allowedFields.has(field.key) && chosenKeys.has(field.key));
    const allowedColumns = new Set(
      (key === 'health' ? MEDICAL_COLUMNS : key === 'documents' ? CERTIFICATE_COLUMNS : key === 'annualReviews' ? DOCUMENT_COLUMNS : [])
        .map((column) => column.key),
    );
    const columns = section.table?.columns.filter((column) => allowedColumns.has(column.key) && chosenKeys.has(column.key)) || [];
    const table = section.table && columns.length > 0 ? {
      columns,
      rows: section.table.rows.map((row) => Object.fromEntries(columns.map((column) => [column.key, row[column.key] || EMPTY_VALUE]))),
      emptyLabel: section.table.emptyLabel,
    } : undefined;
    return fields.length || table ? [{ key, label: SECTION_LABELS[key], fields, ...(table ? { table } : {}) }] : [];
  });
}

function safeFileNamePart(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'Collaborateur';
}

function parisDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export async function buildCollaboratorSheetPdf(
  person: PersonRecord,
  sections: CollaboratorSheetSection[],
  selection: CollaboratorSheetSelection,
  generatedOn = new Date(),
  options: CollaboratorSheetPdfOptions = {},
): Promise<{ blob: Blob; fileName: string }> {
  const selectedSections = selectCollaboratorSheetSections(sections, selection);
  if (!selectedSections.length) throw new Error('Sélectionnez au moins une information à inclure dans la fiche.');
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const pdf = new jsPDF({ compress: true, format: 'a4', orientation: 'portrait', unit: 'mm' });
  const navy: [number, number, number] = [23, 32, 51];
  const blue: [number, number, number] = [21, 96, 130];
  const pale: [number, number, number] = [238, 244, 250];
  // Portraits were loaded through the existing RH permissions. Never resolve a
  // storage path or remote URL here; an unavailable image must not block a sheet.
  let portrait: { data: string; format: 'PNG' | 'JPEG'; x: number; y: number; width: number; height: number } | undefined;
  const photoFormat = /^data:image\/(jpeg|png);base64,/i.exec(person.photoUrl || '')?.[1];
  if (options.includePhoto !== false && !person.photoUnavailable && photoFormat && person.photoUrl) {
    try {
      const properties = pdf.getImageProperties(person.photoUrl);
      if (properties.width > 0 && properties.height > 0) {
        const scale = 22 / Math.max(properties.width, properties.height);
        const width = properties.width * scale;
        const height = properties.height * scale;
        const image = { data: person.photoUrl, format: photoFormat.toLowerCase() === 'png' ? 'PNG' as const : 'JPEG' as const,
          x: 15 + (22 - width) / 2, y: 10 + (22 - height) / 2, width, height };
        pdf.addImage(image.data, image.format, image.x, image.y, image.width, image.height);
        portrait = image;
      }
    } catch {
      // Keep the text-only header if the cached portrait cannot be decoded.
    }
  }
  const headerLeft = portrait ? 43 : 15;
  const personName = formatPersonName(person) || 'Collaborateur';
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  const nameLines = pdf.splitTextToSize(personName, 195 - headerLeft) as string[];
  const bodyTop = Math.max(40, 28 + nameLines.length * 4.2);
  const margin = { left: 15, right: 15, top: bodyTop, bottom: 20 };
  const styles = {
    font: 'helvetica', fontSize: 8, textColor: navy, lineColor: [216, 226, 239] as [number, number, number],
    cellPadding: 2.4, overflow: 'linebreak' as const,
  };
  const finalY = () => (pdf as typeof pdf & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || bodyTop;
  let y = bodyTop;

  selectedSections.forEach((section) => {
    if (y + 30 > 277) { pdf.addPage(); y = bodyTop; }
    pdf.setFillColor(...pale);
    pdf.roundedRect(15, y, 180, 8, 1.5, 1.5, 'F');
    pdf.setTextColor(...blue);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text(section.label, 18, y + 5.5);
    y += 11;
    if (section.fields.length) {
      autoTable(pdf, {
        startY: y, margin, theme: 'grid', styles,
        body: section.fields.map((field) => [field.label, field.value]),
        columnStyles: { 0: { cellWidth: 52, fontStyle: 'bold', fillColor: pale }, 1: { cellWidth: 128 } },
      });
      y = finalY() + 4;
    }
    if (section.table) {
      const { columns, rows, emptyLabel } = section.table;
      const weights: Record<string, number> = { title: 2, category: 1.5, sourceLabel: 1.2, issuedOn: 1.5, expiresOn: 1.5, status: 1.2, aptitude: 1.4, bridgeWatch: 1.5, restriction: 1.6, notes: 2 };
      const totalWeight = columns.reduce((total, column) => total + (weights[column.key] || 1), 0);
      autoTable(pdf, {
        startY: y, margin, theme: 'grid', styles: { ...styles, fontSize: 7.5, cellPadding: 2 },
        head: [columns.map((column) => column.label)],
        body: rows.length
          ? rows.map((row) => columns.map((column) => row[column.key]))
          : [[{ content: emptyLabel, colSpan: columns.length }]],
        headStyles: { fillColor: blue, textColor: 255, fontStyle: 'bold' },
        columnStyles: Object.fromEntries(columns.map((column, index) => [index, { cellWidth: 180 * (weights[column.key] || 1) / totalWeight }])),
      });
      y = finalY() + 4;
    }
    y += 4;
  });

  const generatedDate = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris' }).format(generatedOn);
  const pageCount = pdf.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page);
    pdf.setFillColor(...navy);
    pdf.rect(0, 0, 210, 5, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(16);
    pdf.setTextColor(...navy);
    if (portrait && page > 1) pdf.addImage(portrait.data, portrait.format, portrait.x, portrait.y, portrait.width, portrait.height);
    pdf.text('Fiche Collaborateur', headerLeft, 17);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.text(nameLines, headerLeft, 24);
    pdf.setDrawColor(...blue);
    pdf.line(15, bodyTop - 5, 195, bodyTop - 5);
    pdf.setFontSize(7);
    pdf.setTextColor(75, 93, 114);
    pdf.text(`BBTM - Générée le ${generatedDate}`, 15, 290);
    pdf.text(`Page ${page} / ${pageCount}`, 195, 290, { align: 'right' });
  }
  return {
    blob: pdf.output('blob'),
    fileName: `Fiche-Collaborateur-${safeFileNamePart(personName)}-${parisDateKey(generatedOn)}.pdf`,
  };
}

/** Export only the supplied, authorized people using the same field validation as a single sheet. */
export async function buildCollaboratorSheetsExport(
  people: PersonRecord[],
  documents: HrDocumentRecord[],
  visibleSectionKeys: ReadonlySet<string>,
  selection: CollaboratorSheetSelection,
  mode: CollaboratorSheetsExportMode,
  generatedOn = new Date(),
  options: CollaboratorSheetPdfOptions = {},
): Promise<{ blob: Blob; fileName: string }> {
  const peopleById = new Map<number, PersonRecord>();
  people.forEach((person) => { if (!peopleById.has(person.id)) peopleById.set(person.id, person); });
  const uniquePeople = [...peopleById.values()];
  if (!uniquePeople.length) throw new Error('Sélectionnez au moins un collaborateur à exporter.');
  if (mode !== 'separate' && mode !== 'combined') throw new Error('Choisissez un format d’export valide.');
  const sheets = uniquePeople.map((person) => ({
    person,
    sections: buildCollaboratorSheetSections(person, documents, visibleSectionKeys),
  }));
  if (sheets.some(({ sections }) => !selectCollaboratorSheetSections(sections, selection).length)) {
    throw new Error('Sélectionnez au moins une information à inclure dans la fiche.');
  }
  const baseFileName = `Fiches-Collaborateurs-${sheets.length}-${parisDateKey(generatedOn)}`;

  if (mode === 'separate') {
    const { default: JSZip } = await import('jszip');
    const archive = new JSZip();
    // Render sequentially so a large selection does not retain every PDF renderer at once.
    for (const { person, sections } of sheets) {
      const generated = await buildCollaboratorSheetPdf(person, sections, selection, generatedOn, options);
      const name = formatPersonName(person) || 'Collaborateur';
      archive.file(
        `Fiche-Collaborateur-${safeFileNamePart(name)}-ID${person.id}-${parisDateKey(generatedOn)}.pdf`,
        await generated.blob.arrayBuffer(),
      );
    }
    return {
      blob: new Blob([await archive.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })], { type: 'application/zip' }),
      fileName: `${baseFileName}.zip`,
    };
  }

  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const combined = await PDFDocument.create();
  const footerFont = await combined.embedFont(StandardFonts.Helvetica);
  for (const [index, { person, sections }] of sheets.entries()) {
    const generated = await buildCollaboratorSheetPdf(person, sections, selection, generatedOn, options);
    const source = await PDFDocument.load(await generated.blob.arrayBuffer());
    const pages = await combined.copyPages(source, source.getPageIndices());
    // A sheet keeps its own name and page count, and always starts on a fresh page.
    // Its position in the grouped document distinguishes sheet pagination from the total selection.
    const sheetLabel = `Fiche ${index + 1} / ${sheets.length}`;
    for (const page of pages) {
      combined.addPage(page);
      page.drawText(sheetLabel, {
        x: (page.getWidth() - footerFont.widthOfTextAtSize(sheetLabel, 7)) / 2,
        y: page.getHeight() - 290 * 72 / 25.4,
        size: 7,
        font: footerFont,
        color: rgb(75 / 255, 93 / 255, 114 / 255),
      });
    }
  }
  return {
    blob: new Blob([new Uint8Array(await combined.save()).buffer], { type: 'application/pdf' }),
    fileName: `${baseFileName}.pdf`,
  };
}
