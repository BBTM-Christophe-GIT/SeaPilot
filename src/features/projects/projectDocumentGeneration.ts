import type { ClientRecord, ProjectContractRecord, ProjectRecord } from './projectQueries';
import { buildSupplytimePreview } from './projectReadModel';
import supplytimePage01Url from './assets/supplytime-page-01.png';
import supplytimePage02Url from './assets/supplytime-page-02.png';

export type ProjectGeneratedDocumentKind = 'offer' | 'contract';

export interface GeneratedProjectDocument {
  blob: Blob;
  fileName: string;
}

export interface ProjectDocumentGenerationInput {
  client?: ClientRecord;
  contract?: ProjectContractRecord;
  project: ProjectRecord;
}

export interface ProjectOfferRow {
  label: string;
  value: string;
}

interface SupplytimePdfField {
  page: 1 | 2;
  key: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

const SUPPLYTIME_PDF_FIELDS: SupplytimePdfField[] = [
  { page: 1, key: 'box01_owners', left: 13.0034, top: 18.8724, width: 36.0738, height: 2.3739 },
  { page: 1, key: 'box02_charterers', left: 51.594, top: 18.8724, width: 36.0738, height: 2.3739 },
  { page: 1, key: 'box03_vessel', left: 13.0034, top: 23.3234, width: 36.0738, height: 3.5015 },
  { page: 1, key: 'box04_delivery_date', left: 51.594, top: 23.3234, width: 17.198, height: 3.5015 },
  { page: 1, key: 'box05_cancelling_date', left: 70.4698, top: 23.3234, width: 17.198, height: 3.5015 },
  { page: 1, key: 'box06_port_delivery', left: 13.0034, top: 28.7834, width: 36.0738, height: 2.9674 },
  { page: 1, key: 'box07_delivery_range', left: 51.594, top: 28.7834, width: 36.0738, height: 2.9674 },
  { page: 1, key: 'box08_notice_delivery', left: 51.594, top: 34.4214, width: 36.0738, height: 6.0534 },
  { page: 1, key: 'box09_period', left: 13.0034, top: 34.3027, width: 36.0738, height: 6.1721 },
  { page: 1, key: 'box10_extension', left: 51.594, top: 42.73, width: 36.0738, height: 4.0356 },
  { page: 1, key: 'box11_continuation', left: 13.0034, top: 42.8487, width: 36.0738, height: 3.9169 },
  { page: 1, key: 'box12_mobilisation', left: 51.594, top: 49.5549, width: 36.0738, height: 5.1632 },
  { page: 1, key: 'box13_early_termination', left: 13.0034, top: 49.5549, width: 36.0738, height: 5.1632 },
  { page: 1, key: 'box14_bunker_delivery', left: 51.594, top: 57.3294, width: 17.198, height: 6.6469 },
  { page: 1, key: 'box15_declaration', left: 70.4698, top: 57.3294, width: 17.198, height: 6.6469 },
  { page: 1, key: 'box16_area_operation', left: 13.0034, top: 57.27, width: 36.0738, height: 6.7062 },
  { page: 1, key: 'box17_employment', left: 13.0034, top: 66.1721, width: 36.0738, height: 2.1958 },
  { page: 1, key: 'box18_delivery_hour', left: 51.594, top: 66.1721, width: 36.0738, height: 2.1958 },
  { page: 1, key: 'box19_special_fuel', left: 13.0034, top: 72.1068, width: 74.6644, height: 12.1662 },
  { page: 2, key: 'box20_charter_hire', left: 13.4228, top: 10.4451, width: 36.0738, height: 6.5282 },
  { page: 2, key: 'box21_extension_hire', left: 51.594, top: 10.4451, width: 36.0738, height: 6.5282 },
  { page: 2, key: 'box22_invoice_remittance', left: 13.4228, top: 20.178, width: 36.0738, height: 11.1573 },
  { page: 2, key: 'box23_payment', left: 51.594, top: 20.178, width: 36.0738, height: 11.1573 },
  { page: 2, key: 'box24_account_group', left: 13.4228, top: 33.8279, width: 24.3289, height: 2.4926 },
  { page: 2, key: 'box25_internal_price', left: 39.4295, top: 33.8279, width: 22.651, height: 2.4926 },
  { page: 2, key: 'box26_max_price', left: 63.7584, top: 33.8279, width: 23.9094, height: 2.4926 },
  { page: 2, key: 'box27_war_risk', left: 13.4228, top: 38.2789, width: 24.3289, height: 2.9674 },
  { page: 2, key: 'box28_terror', left: 39.4295, top: 38.2789, width: 22.651, height: 2.9674 },
  { page: 2, key: 'box29_notice_money', left: 63.7584, top: 38.2789, width: 23.9094, height: 2.9674 },
  { page: 2, key: 'box30_cancellation_clause', left: 13.4228, top: 43.2047, width: 74.245, height: 2.1958 },
  { page: 2, key: 'box31_taxes', left: 13.4228, top: 47.4777, width: 74.245, height: 2.0772 },
  { page: 2, key: 'box32_other_law', left: 13.4228, top: 52.2255, width: 74.245, height: 10.3264 },
  { page: 2, key: 'box33_dispute_resolution', left: 13.4228, top: 64.9852, width: 74.245, height: 1.7211 },
  { page: 2, key: 'box34_additional_clauses', left: 13.4228, top: 69.1988, width: 74.245, height: 2.3739 },
  { page: 2, key: 'signature_owners', left: 13.4228, top: 74.3027, width: 36.4933, height: 1.6617 },
  { page: 2, key: 'signature_charterers', left: 51.594, top: 74.3027, width: 36.0738, height: 1.6617 },
];

function present(value: string | number | null | undefined): string {
  return value === null || value === undefined || value === '' ? 'Non renseign\u00e9' : String(value);
}

function formatDate(value: string): string {
  if (!value) return 'Non renseign\u00e9e';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(date);
}

function formatMoney(value: number | null | undefined, currency: string, unit = ''): string {
  if (value === null || value === undefined) return 'Non renseign\u00e9';
  const amount = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(value);
  return [amount, currency, unit ? `/ ${unit}` : ''].filter(Boolean).join(' ');
}

function projectReference(project: ProjectRecord): string {
  return [project.projectCode, project.title].filter(Boolean).join(' - ');
}

function extensionLabel(contract?: ProjectContractRecord): string {
  if (!contract || contract.extensionCount === null || contract.extensionDuration === null) return 'Non renseign\u00e9e';
  return `${contract.extensionCount} x ${contract.extensionDuration} ${contract.extensionUnit}`.trim();
}

export function buildProjectOfferRows({
  client,
  contract,
  project,
}: ProjectDocumentGenerationInput): ProjectOfferRow[] {
  const supplytime = contract?.supplytimeData || {};
  return [
    { label: 'Client', value: present(client?.name || project.clientName) },
    { label: 'Represented by', value: present(supplytime.box02_charterers) },
    { label: 'Project', value: present(projectReference(project)) },
    { label: 'Contract form', value: present(project.contractType) },
    { label: 'Vessel(s)', value: present([project.primaryVesselName, project.secondaryVesselName].filter(Boolean).join(' / ')) },
    { label: 'Duties', value: present(project.description) },
    { label: 'Port of Delivery', value: present(project.deliveryPort) },
    { label: 'Date of Delivery', value: formatDate(project.deliveryAt || project.startsOn) },
    { label: 'Mobilization costs HT', value: formatMoney(contract?.mobilisationFee, contract?.feeCurrency || '') },
    { label: 'Port of Redelivery', value: present(project.redeliveryPort) },
    { label: 'Date of Redelivery', value: formatDate(project.redeliveryAt || project.endsOn) },
    { label: 'Demobilization costs HT', value: formatMoney(contract?.demobilisationFee, contract?.feeCurrency || '') },
    { label: 'Dur\u00e9e ferme affr\u00e8tement', value: present(supplytime.box09_period) },
    { label: 'Dur\u00e9es optionnelles', value: extensionLabel(contract) },
    { label: 'Rythme', value: present(contract?.hireUnit) },
    { label: 'Day rate normal', value: formatMoney(contract?.charterHire, contract?.hireCurrency || '', contract?.hireUnit) },
    { label: 'Day rate extension', value: formatMoney(contract?.extensionHire, contract?.hireCurrency || '', contract?.hireUnit) },
    { label: 'Fuel', value: present(supplytime.box14_bunker_delivery || supplytime.box19_special_fuel) },
    { label: 'Port / zone', value: present(project.operationArea || project.deliveryPort) },
    { label: 'Invoicing period', value: present(supplytime.box22_invoice_remittance) },
    { label: 'Payment terms', value: present(supplytime.box23_payment) },
  ];
}

export function buildProjectSupplytimePdfFields(
  project: ProjectRecord,
  contract?: ProjectContractRecord,
): Record<string, string> {
  return Object.fromEntries(
    buildSupplytimePreview(project, contract)
      .flatMap((group) => group.fields)
      .filter((field) => field.value)
      .map((field) => [field.key, field.value]),
  );
}

export function buildGeneratedDocumentFileName(kind: ProjectGeneratedDocumentKind, project: ProjectRecord): string {
  const reference = (project.projectCode || project.title || 'Projet')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[<>:"/\\|?*]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return kind === 'offer'
    ? `${reference} - Offre - R1.pdf`
    : `${reference} - Contrat SUPPLYTIME 2017.pdf`;
}

async function loadAssetBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Le mod\u00e8le SPFx n'a pas pu \u00eatre charg\u00e9 (${response.status}).`);
  return new Uint8Array(await response.arrayBuffer());
}

export async function generateProjectDocument(
  kind: ProjectGeneratedDocumentKind,
  input: ProjectDocumentGenerationInput,
): Promise<GeneratedProjectDocument> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const title = projectReference(input.project);
  pdf.setProperties({
    title: buildGeneratedDocumentFileName(kind, input.project),
    subject: title,
    creator: 'SeaPilot',
  });

  if (kind === 'offer') {
    const rows = buildProjectOfferRows(input);
    pdf.setFillColor(9, 31, 50);
    pdf.rect(0, 0, 210, 29, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(20);
    pdf.text('BBTM', 14, 13);
    pdf.setFontSize(14);
    pdf.text('OFFRE COMMERCIALE', 14, 22);
    pdf.setFontSize(8);
    pdf.text(title, 196, 20, { align: 'right', maxWidth: 90 });
    pdf.setTextColor(24, 33, 50);

    let y = 38;
    rows.forEach((row) => {
      const valueLines = pdf.splitTextToSize(row.value, 118) as string[];
      const rowHeight = Math.max(10, valueLines.length * 4 + 4);
      if (y + rowHeight > 280) {
        pdf.addPage();
        y = 18;
      }
      pdf.setDrawColor(205, 216, 224);
      pdf.setFillColor(244, 248, 250);
      pdf.rect(14, y, 52, rowHeight, 'FD');
      pdf.rect(66, y, 130, rowHeight);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.text(row.label, 17, y + 6, { maxWidth: 46 });
      pdf.setFont('helvetica', 'normal');
      pdf.text(valueLines, 70, y + 6);
      y += rowHeight;
    });
    pdf.setFontSize(7);
    pdf.setTextColor(92, 111, 124);
    pdf.text('Document g\u00e9n\u00e9r\u00e9 depuis les donn\u00e9es structur\u00e9es SeaPilot. Validation commerciale requise avant envoi.', 14, 290);
  } else {
    const [page01, page02] = await Promise.all([
      loadAssetBytes(supplytimePage01Url),
      loadAssetBytes(supplytimePage02Url),
    ]);
    const values = buildProjectSupplytimePdfFields(input.project, input.contract);
    [page01, page02].forEach((pageBytes, pageIndex) => {
      if (pageIndex > 0) pdf.addPage();
      pdf.addImage(pageBytes, 'PNG', 0, 0, 210, 297, undefined, 'FAST');
      SUPPLYTIME_PDF_FIELDS.filter((field) => field.page === pageIndex + 1).forEach((field) => {
        const value = values[field.key];
        if (!value) return;
        const x = (field.left / 100) * 210 + 1;
        const y = (field.top / 100) * 297 + 2.2;
        const width = Math.max(4, (field.width / 100) * 210 - 2);
        const height = Math.max(3, (field.height / 100) * 297 - 2);
        const fontSize = height < 6 ? 5 : height < 10 ? 6 : 7;
        const lineHeight = fontSize * 0.3528 * 1.1;
        const lines = (pdf.splitTextToSize(value, width) as string[]).slice(0, Math.max(1, Math.floor(height / lineHeight)));
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(fontSize);
        pdf.setTextColor(12, 32, 48);
        pdf.text(lines, x, y);
      });
    });
  }

  return {
    blob: pdf.output('blob'),
    fileName: buildGeneratedDocumentFileName(kind, input.project),
  };
}

export function downloadGeneratedProjectDocument(document: GeneratedProjectDocument): void {
  const url = URL.createObjectURL(document.blob);
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = document.fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
