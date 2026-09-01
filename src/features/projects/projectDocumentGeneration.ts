import type {
  ClientRecord,
  ProjectContractRecord,
  ProjectPlanningOccurrenceRecord,
  ProjectRecord,
  ProjectTowedAssetRecord,
  ProjectVesselCertificateRecord,
  VesselRecord,
} from './projectQueries';
import type { ProjectGeneratedDocumentKind } from './projectDocumentTypes';
import { buildSupplytimePreview } from './projectReadModel';
import {
  DEFAULT_BAREBOAT_CONTRACT_FIELDS,
  DEFAULT_BAREBOAT_OWNER_IDENTITY,
  DEFAULT_PROJECT_FUEL_TERMS,
  DEFAULT_TOWAGE_CONDITIONS,
  DEFAULT_TOWAGE_PAYMENT_TERMS,
  DEFAULT_TOWAGE_SPECIAL_CONDITIONS,
  towageOptionalCostsWithDefault,
} from './projectContractOptions';
import { formatProjectOfferPort } from './projectPorts';
import { BIMCO_P144_FIELDS } from './projectContractModels';
import type { PDFFont, PDFImage, PDFPage } from 'pdf-lib';
import {
  buildCommercialReserves,
  formatProjectDocumentEmitterName,
  shouldDisplayCommercialOfferRoute,
  type ProjectDocumentEmitter,
} from './projectCommercialOffer';
import {
  buildBareboatDeliveryLabel,
  buildBareboatRedeliveryLabel,
  deriveBareboatCertificateFields,
  formatBareboatDate,
  localTodayIso,
} from './projectBareboatContract';
import bimcoPage01Url from './assets/contract-previews/bimco-p144-page-01.png';
import bimcoPage02Url from './assets/contract-previews/bimco-p144-page-02.png';
import bimcoPage03Url from './assets/contract-previews/bimco-p144-page-03.png';
import bimcoPage04Url from './assets/contract-previews/bimco-p144-page-04.png';

export interface GeneratedProjectDocument {
  blob: Blob;
  fileName: string;
  mimeType: string;
}

export interface ProjectDocumentGenerationInput {
  client?: ClientRecord;
  contract?: ProjectContractRecord;
  emitter?: ProjectDocumentEmitter;
  occurrence?: ProjectPlanningOccurrenceRecord;
  project: ProjectRecord;
  towedAsset?: ProjectTowedAssetRecord;
  vessel?: VesselRecord;
  vesselCertificates?: ProjectVesselCertificateRecord[];
}

export interface ProjectOfferRow {
  label: string;
  value: string;
}

interface SupplytimePdfField {
  page: 1 | 2 | 3 | 4;
  key: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

const SUPPLYTIME_PDF_FIELDS: SupplytimePdfField[] = [
  { page: 1, key: 'p144_box01_place_date', left: 10.2, top: 17.3, width: 80, height: 5.3 },
  { page: 1, key: 'p144_box02_owners', left: 10.2, top: 25.1, width: 42.5, height: 9.5 },
  { page: 1, key: 'p144_box03_charterers', left: 58.1, top: 25.1, width: 34.1, height: 9.5 },
  { page: 1, key: 'p144_box04_vessel_imo', left: 10.2, top: 38.2, width: 42.5, height: 5.2 },
  { page: 1, key: 'p144_box05_delivery_date', left: 58.1, top: 38.2, width: 16.2, height: 5.2 },
  { page: 1, key: 'p144_box06_cancelling_date', left: 80.1, top: 38.8, width: 12.1, height: 4.6 },
  { page: 1, key: 'p144_box07_delivery_place', left: 10.2, top: 45.4, width: 42.5, height: 8.5 },
  { page: 1, key: 'p144_box08_redelivery', left: 58.1, top: 48.8, width: 34.1, height: 7.2 },
  { page: 1, key: 'p144_box09_hire_period', left: 10.2, top: 59.4, width: 42.5, height: 8.8 },
  { page: 1, key: 'p144_box10_extensions', left: 58.1, top: 61.4, width: 34.1, height: 7.4 },
  { page: 1, key: 'p144_box11_automatic_extension', left: 10.2, top: 72.9, width: 42.5, height: 8.2 },
  { page: 1, key: 'p144_box12_mobilisation', left: 58.1, top: 72.9, width: 34.1, height: 8.2 },
  { page: 2, key: 'p144_box13_early_termination', left: 10.2, top: 6.6, width: 42.5, height: 11.5 },
  { page: 2, key: 'p144_box14_termination_notice', left: 58.1, top: 6.6, width: 16.2, height: 11.5 },
  { page: 2, key: 'p144_box15_demobilisation', left: 80.1, top: 6.6, width: 12.1, height: 11.5 },
  { page: 2, key: 'p144_box16_operation_area', left: 10.2, top: 22.5, width: 42.5, height: 5.2 },
  { page: 2, key: 'p144_box17_employment', left: 58.1, top: 23.4, width: 34.1, height: 5.2 },
  { page: 2, key: 'p144_box18_specialist_operations', left: 10.2, top: 31.3, width: 42.5, height: 10.5 },
  { page: 2, key: 'p144_box19_fuel', left: 58.1, top: 31.3, width: 34.1, height: 12.5 },
  { page: 2, key: 'p144_box20_charter_hire', left: 10.2, top: 49.1, width: 42.5, height: 24.7 },
  { page: 2, key: 'p144_box21_extension_hire', left: 58.1, top: 49.1, width: 34.1, height: 20.2 },
  { page: 3, key: 'p144_box22_invoicing', left: 10.2, top: 6.6, width: 42.5, height: 14.8 },
  { page: 3, key: 'p144_box23_payments', left: 58.1, top: 6.6, width: 34.1, height: 14.8 },
  { page: 3, key: 'p144_box24_payment_deadline', left: 10.2, top: 25.1, width: 42.5, height: 7.2 },
  { page: 3, key: 'p144_box25_interest', left: 58.1, top: 25.1, width: 16.2, height: 7.2 },
  { page: 3, key: 'p144_box26_audit_period', left: 80.1, top: 25.1, width: 12.1, height: 7.2 },
  { page: 3, key: 'p144_box27_meals', left: 10.2, top: 37.1, width: 18, height: 5 },
  { page: 3, key: 'p144_box28_accommodation', left: 32.1, top: 37.1, width: 20.5, height: 5 },
  { page: 3, key: 'p144_box29_sublet', left: 58.1, top: 37.1, width: 34.1, height: 5 },
  { page: 3, key: 'p144_box30_war_cancellation', left: 10.2, top: 44.2, width: 82, height: 4 },
  { page: 3, key: 'p144_box31_taxes', left: 10.2, top: 49.6, width: 82, height: 4 },
  { page: 3, key: 'p144_box32_off_hire', left: 10.2, top: 55.4, width: 82, height: 8.5 },
  { page: 3, key: 'p144_box33_dispute_resolution', left: 10.2, top: 67.5, width: 82, height: 6.6 },
  { page: 3, key: 'p144_box34_additional_clauses', left: 10.2, top: 77.2, width: 82, height: 6.5 },
  { page: 4, key: 'p144_signature_owners', left: 10.2, top: 5.2, width: 42.5, height: 7 },
  { page: 4, key: 'p144_signature_charterers', left: 58.1, top: 5.2, width: 34.1, height: 7 },
];

function present(value: string | number | null | undefined): string {
  return value === null || value === undefined || value === '' ? '' : String(value);
}

function formatDate(value: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(date);
}

export function formatOfferGenerationDate(value: Date): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(value);
}

const CURRENCY_SYMBOLS: Readonly<Record<string, string>> = {
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  USD: '$',
};

function formatHireUnit(unit: string): string {
  const normalized = unit.trim().toLocaleLowerCase('fr-FR');
  if (['jour', 'jours', 'journalier', 'journalière'].includes(normalized)) return 'Jour';
  return normalized ? `${normalized[0].toLocaleUpperCase('fr-FR')}${normalized.slice(1)}` : '';
}

function formatMoney(value: number | null | undefined, currency: string, unit = ''): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  const amount = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 })
    .format(value)
    .replace(/[\s\u00a0\u202f]+/g, ' ');
  const normalizedCurrency = currency.trim().toLocaleUpperCase('fr-FR');
  const currencyLabel = CURRENCY_SYMBOLS[normalizedCurrency] || normalizedCurrency;
  const unitLabel = formatHireUnit(unit);
  return [amount, currencyLabel, 'HT', unitLabel ? `/ ${unitLabel}` : ''].filter(Boolean).join(' ');
}

function projectReference(project: ProjectRecord): string {
  return [project.projectCode, project.title].filter(Boolean).join(' - ');
}

function extensionLabel(contract?: ProjectContractRecord): string {
  if (!contract || contract.extensionCount === null || contract.extensionDuration === null) return '';
  return `${contract.extensionCount} x ${contract.extensionDuration} ${contract.extensionUnit}`.trim();
}

function hireRateLine(
  label: string,
  value: number | null | undefined,
  currency: string,
  unit: string,
): string {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) return '';
  return `${label} : ${formatMoney(value, currency, unit)}.`;
}

function contractHireScheduleLabel(contract?: ProjectContractRecord): string {
  if (!contract?.hirePeriods?.length) {
    return hireRateLine(
      'En Opération',
      contract?.charterHire,
      contract?.hireCurrency || '',
      contract?.hireUnit || '',
    );
  }
  const schedules = contract.hirePeriods.flatMap((period) => {
    const lines = [
      hireRateLine('En Opération', period.charterHire, period.hireCurrency, period.hireUnit),
      hireRateLine('Weather Stand-by', period.weatherStandbyHire, period.hireCurrency, period.hireUnit),
      hireRateLine('Stand-by', period.standbyHire, period.hireCurrency, period.hireUnit),
    ].filter(Boolean);
    return lines.length > 0 ? [{ period, lines }] : [];
  });
  const showPeriodHeadings = schedules.length > 1;
  return schedules.map(({ period, lines }) => [
    showPeriodHeadings
      ? `${formatDate(period.startsOn)}${period.endsOn ? ` - ${formatDate(period.endsOn)}` : ' et après'}`
      : '',
    ...lines,
  ].filter(Boolean).join('\n')).join('\n\n');
}

export function buildProjectOfferRows({
  client,
  contract,
  project,
}: ProjectDocumentGenerationInput): ProjectOfferRow[] {
  const supplytime = contract?.supplytimeData || {};
  return [
    { label: 'Client', value: present(client?.name || project.clientName) },
    { label: 'Represented by', value: present(client?.representedBy) },
    { label: 'Project', value: present(projectReference(project)) },
    { label: 'Contract form', value: present(project.contractType) },
    { label: 'Vessel(s)', value: present([project.primaryVesselName, project.secondaryVesselName].filter(Boolean).join(' / ')) },
    { label: 'Duties', value: present(project.description) },
    { label: 'Port of Delivery', value: present(formatProjectOfferPort(project.deliveryPort)) },
    { label: 'Date of Delivery', value: formatDate(project.deliveryAt || project.startsOn) },
    { label: 'Mobilization costs HT', value: formatMoney(contract?.mobilisationFee, contract?.feeCurrency || '') },
    { label: 'Port of Redelivery', value: present(formatProjectOfferPort(project.redeliveryPort)) },
    { label: 'Date of Redelivery', value: formatDate(project.redeliveryAt || project.endsOn) },
    { label: 'Demobilization costs HT', value: formatMoney(contract?.demobilisationFee, contract?.feeCurrency || '') },
    { label: 'Dur\u00e9e ferme affr\u00e8tement', value: present(supplytime.box09_period) },
    { label: 'Dur\u00e9es optionnelles', value: extensionLabel(contract) },
    { label: 'Rythme', value: present(contract?.hireUnit) },
    { label: 'Day rate normal', value: contractHireScheduleLabel(contract) },
    { label: 'Day rate extension', value: formatMoney(contract?.extensionHire, contract?.hireCurrency || '', contract?.hireUnit) },
    { label: 'Fuel', value: present(supplytime.box19_special_fuel || DEFAULT_PROJECT_FUEL_TERMS) },
    { label: 'Port / zone', value: present(project.operationArea || project.deliveryPort) },
    { label: 'Invoicing period', value: present(supplytime.box22_invoice_remittance) },
    { label: 'Payment terms', value: present(supplytime.box23_payment) },
  ].filter((row) => row.value.trim() && !/^non renseign[ée]e?$/i.test(row.value.trim()));
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

export function buildProjectBimcoP144PdfFields({
  client,
  contract,
  project,
}: ProjectDocumentGenerationInput): Record<string, string> {
  const saved = contract?.supplytimeData || {};
  const clientAddress = [
    client?.name || project.clientName,
    client?.address,
    [client?.city, client?.country].filter(Boolean).join(' '),
  ].filter(Boolean).join('\n');
  const hirePeriod = [formatDate(project.charterStartsAt || project.deliveryAt), formatDate(project.charterEndsAt || project.redeliveryAt)]
    .filter(Boolean)
    .join(' – ');
  const specialistOperations = [
    project.isRovSupport ? 'ROV operations: Yes' : '',
    project.isDivingSupport ? 'Diving platform: Yes' : '',
  ].filter(Boolean).join('\n');
  const canonical: Record<string, string> = {
    p144_box01_place_date: saved.p144_box01_place_date || formatDate(project.startsOn || project.deliveryAt),
    p144_box02_owners: saved.p144_box02_owners || contract?.ownerIdentity || '',
    p144_box03_charterers: saved.p144_box03_charterers || clientAddress,
    p144_box04_vessel_imo: saved.p144_box04_vessel_imo || project.primaryVesselName,
    p144_box05_delivery_date: saved.p144_box05_delivery_date || formatDate(project.deliveryAt),
    p144_box06_cancelling_date: saved.p144_box06_cancelling_date || formatDate(project.charterStartsAt),
    p144_box07_delivery_place: saved.p144_box07_delivery_place || project.deliveryPort,
    p144_box08_redelivery: saved.p144_box08_redelivery || project.redeliveryPort,
    p144_box09_hire_period: saved.p144_box09_hire_period || hirePeriod,
    p144_box10_extensions: saved.p144_box10_extensions || extensionLabel(contract),
    p144_box11_automatic_extension: saved.p144_box11_automatic_extension || [contract?.autoExtensionPeriod, contract?.maxExtensionDays ? `${contract.maxExtensionDays} day(s)` : ''].filter(Boolean).join('\n'),
    p144_box12_mobilisation: saved.p144_box12_mobilisation || formatMoney(contract?.mobilisationFee, contract?.feeCurrency || ''),
    p144_box15_demobilisation: saved.p144_box15_demobilisation || formatMoney(contract?.demobilisationFee, contract?.feeCurrency || ''),
    p144_box16_operation_area: saved.p144_box16_operation_area || project.operationArea,
    p144_box17_employment: saved.p144_box17_employment || project.description,
    p144_box18_specialist_operations: saved.p144_box18_specialist_operations || specialistOperations,
    p144_box19_fuel: saved.p144_box19_fuel || saved.box19_special_fuel || DEFAULT_PROJECT_FUEL_TERMS,
    p144_box20_charter_hire: saved.p144_box20_charter_hire || contractHireScheduleLabel(contract),
    p144_box21_extension_hire: saved.p144_box21_extension_hire || formatMoney(contract?.extensionHire, contract?.hireCurrency || '', contract?.hireUnit || ''),
    p144_box22_invoicing: saved.p144_box22_invoicing || saved.box22_invoice_remittance || '',
    p144_box23_payments: saved.p144_box23_payments || saved.box23_payment || '',
    p144_box26_audit_period: saved.p144_box26_audit_period || contract?.maxAuditPeriod || '',
  };
  return Object.fromEntries(BIMCO_P144_FIELDS.map((field) => [field.key, canonical[field.key] || saved[field.key] || '']));
}

export function buildGeneratedDocumentFileName(kind: ProjectGeneratedDocumentKind, project: ProjectRecord): string {
  const reference = (project.projectCode || project.title || 'Projet')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[<>:"/\\|?*]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  const suffixes: Record<ProjectGeneratedDocumentKind, string> = {
    offer: 'Offre - R1.pdf',
    bimco_supplytime: 'BIMCO - R1.pdf',
    towage_contract: 'Contrat de remorquage - R1.pdf',
    bareboat_charter: "Contrat d'affretement - R1.pdf",
    intellectual_service: 'Contrat prestation intellectuelle - R1.docx',
  };
  return `${reference} - ${suffixes[kind]}`;
}

async function loadAssetBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Le modèle SeaPilot n'a pas pu être chargé (${response.status}).`);
  return new Uint8Array(await response.arrayBuffer());
}

export async function generateProjectDocument(
  kind: ProjectGeneratedDocumentKind,
  input: ProjectDocumentGenerationInput,
): Promise<GeneratedProjectDocument> {
  if (kind === 'intellectual_service') {
    throw new Error('Le modèle de ce contrat doit encore être fourni avant sa génération.');
  }

  if (kind === 'towage_contract') {
    return generateTowageContract(input);
  }

  if (kind === 'bareboat_charter') {
    return generateBareboatCharter(input);
  }

  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const title = projectReference(input.project);
  pdf.setProperties({
    title: buildGeneratedDocumentFileName(kind, input.project),
    subject: title,
    creator: 'SeaPilot',
  });

  if (kind === 'offer') {
    const [logoBytes, signatureBytes] = await Promise.all([
      loadAssetBytes('/bbtm-report-logo.png'),
      input.emitter?.signatureUrl
        ? loadAssetBytes(input.emitter.signatureUrl).catch(() => null)
        : Promise.resolve(null),
    ]);
    const contract = input.contract;
    const supplytime = contract?.supplytimeData || {};
    const reserves = buildCommercialReserves(supplytime);
    const emitterName = formatProjectDocumentEmitterName(input.emitter);
    const duration = input.project.startsOn && input.project.endsOn
      ? Math.max(1, Math.round((new Date(input.project.endsOn).getTime() - new Date(input.project.startsOn).getTime()) / 86_400_000) + 1)
      : null;
    const reference = `OC-${input.project.projectCode.replace(/^P/i, '') || 'BROUILLON'}`;
    const line = (value: string, width: number, maximum = 3): string[] => (
      pdf.splitTextToSize(value || '-', width) as string[]
    ).slice(0, maximum);
    const sectionHeading = (number: string, label: string, x: number, y: number) => {
      pdf.setFillColor(46, 109, 233);
      pdf.circle(x + 4, y + 4, 4, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7);
      pdf.text(number, x + 4, y + 5.4, { align: 'center' });
      pdf.setTextColor(18, 61, 104);
      pdf.setFontSize(10);
      pdf.text(label, x + 11, y + 5.5);
    };
    const detailRow = (label: string, value: string, x: number, y: number, width: number) => {
      pdf.setDrawColor(226, 232, 240);
      pdf.line(x, y + 5.5, x + width, y + 5.5);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(6.2);
      pdf.setTextColor(113, 128, 150);
      pdf.text(label.toLocaleUpperCase('fr-FR'), x, y + 3.5);
      pdf.setTextColor(35, 59, 87);
      pdf.text(line(value, width * 0.58, 1), x + width, y + 3.5, { align: 'right' });
    };

    pdf.setFillColor(9, 31, 50);
    pdf.rect(0, 0, 210, 29, 'F');
    pdf.addImage(logoBytes, 'PNG', 14, 5, 20, 20, undefined, 'FAST');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(15);
    pdf.text('OFFRE COMMERCIALE', 39, 18);
    pdf.setFontSize(9);
    pdf.text(reference, 196, 12, { align: 'right' });
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Émise le ${formatOfferGenerationDate(new Date())}`, 196, 19, { align: 'right' });
    pdf.setTextColor(24, 33, 50);

    [[14, 'PROPOSITION ADRESSÉE À', input.client?.name || input.project.clientName || 'CLIENT À RENSEIGNER', input.client?.representedBy ? `À l’attention de ${input.client.representedBy}` : 'Interlocuteur à renseigner'],
      [108, 'PROJET', title || 'NOUVEAU PROJET', input.project.contractType || 'Offre Commerciale']]
      .forEach(([xValue, label, primary, secondary]) => {
        const x = Number(xValue);
        pdf.setFillColor(243, 246, 250);
        pdf.rect(x, 35, 88, 22, 'F');
        pdf.setFillColor(46, 109, 233);
        pdf.rect(x, 35, 2, 22, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(6.2);
        pdf.setTextColor(113, 128, 150);
        pdf.text(String(label), x + 5, 40);
        pdf.setFontSize(8.5);
        pdf.setTextColor(23, 59, 101);
        pdf.text(line(String(primary), 79, 2), x + 5, 46);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7);
        pdf.setTextColor(88, 106, 128);
        pdf.text(line(String(secondary), 79, 1), x + 5, 53);
      });

    pdf.setDrawColor(219, 228, 238);
    pdf.rect(14, 63, 182, 37);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6.2);
    pdf.setTextColor(113, 128, 150);
    pdf.text('NOTRE PROPOSITION', 18, 69);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(23, 38, 58);
    pdf.text(line(input.project.description || 'Prestation à renseigner.', 105, 5), 18, 75);
    detailRow('Navire', input.project.primaryVesselName || '-', 132, 68, 59);
    detailRow('Période', [formatDate(input.project.startsOn), formatDate(input.project.endsOn)].filter(Boolean).join(' - ') || '-', 132, 76, 59);
    if (shouldDisplayCommercialOfferRoute(input.project.deliveryPort, input.project.redeliveryPort)) {
      detailRow('Route', [input.project.deliveryPort, input.project.redeliveryPort].filter(Boolean).join(' - ') || '-', 132, 84, 59);
    }

    pdf.setDrawColor(216, 226, 237);
    pdf.rect(14, 106, 88, 82);
    pdf.rect(108, 106, 88, 82);
    sectionHeading('1', 'Cadre opérationnel', 18, 111);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6.2);
    pdf.setTextColor(113, 128, 150);
    pdf.text('PÉRIMÈTRE PROPOSÉ', 18, 124);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.1);
    pdf.setTextColor(23, 38, 58);
    pdf.text(line(input.project.operationArea || 'Zone d’opération à renseigner', 78, 3), 18, 130);
    detailRow('Type de contrat', input.project.contractType || 'Offre Commerciale', 18, 145, 78);
    detailRow('Livraison', [input.project.deliveryPort, formatDate(input.project.deliveryAt)].filter(Boolean).join(' - ') || '-', 18, 153, 78);
    detailRow('Redélivraison', [input.project.redeliveryPort, formatDate(input.project.redeliveryAt)].filter(Boolean).join(' - ') || '-', 18, 161, 78);
    detailRow('Durée ferme', duration ? `${duration} jours calendaires` : '-', 18, 169, 78);
    detailRow('Carburant', supplytime.box19_special_fuel || '-', 18, 177, 78);

    sectionHeading('2', 'Conditions commerciales', 112, 111);
    detailRow('Mobilisation', formatMoney(contract?.mobilisationFee, contract?.feeCurrency || '') || '-', 112, 126, 78);
    detailRow('Démobilisation', formatMoney(contract?.demobilisationFee, contract?.feeCurrency || '') || '-', 112, 136, 78);
    detailRow('Opération', formatMoney(contract?.charterHire, contract?.hireCurrency || '', contract?.hireUnit || '') || '-', 112, 146, 78);
    detailRow('Extension', formatMoney(contract?.extensionHire, contract?.hireCurrency || '', contract?.hireUnit || '') || '-', 112, 156, 78);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6.2);
    pdf.setTextColor(113, 128, 150);
    pdf.text('FACTURATION', 112, 172);
    pdf.text('PAIEMENT', 151, 172);
    pdf.setFontSize(6.7);
    pdf.setTextColor(35, 59, 87);
    pdf.text(line(supplytime.box22_invoice_remittance || '-', 34, 2), 112, 178);
    pdf.text(line(supplytime.box23_payment || '-', 39, 2), 151, 178);

    let signatureY = 202;
    if (reserves.length > 0) {
      const reserveLines = reserves.flatMap((reserve) => line(`- ${reserve}`, 169, 2)).slice(0, 6);
      const reserveHeight = 10 + reserveLines.length * 4;
      pdf.setDrawColor(236, 203, 140);
      pdf.setFillColor(255, 249, 235);
      pdf.rect(14, 194, 182, reserveHeight, 'FD');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(6.5);
      pdf.setTextColor(139, 90, 8);
      pdf.text('RÉSERVES COMMERCIALES', 18, 200);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(6.5);
      pdf.setTextColor(107, 85, 43);
      pdf.text(reserveLines, 18, 206);
      signatureY = 198 + reserveHeight + 4;
    }

    const signatureHeight = Math.min(54, 279 - signatureY);
    pdf.setDrawColor(203, 215, 229);
    pdf.rect(14, signatureY, 91, signatureHeight);
    pdf.rect(105, signatureY, 91, signatureHeight);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(23, 60, 102);
    pdf.text('Armateur', 18, signatureY + 7);
    pdf.text('Client', 109, signatureY + 7);
    pdf.setFontSize(7.2);
    pdf.setTextColor(35, 59, 87);
    pdf.text(emitterName || 'Émetteur à renseigner', 18, signatureY + 14);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.7);
    pdf.setTextColor(80, 97, 120);
    pdf.text(input.emitter?.functionLabel || 'Fonction à renseigner', 18, signatureY + 20);
    if (signatureBytes) {
      pdf.addImage(signatureBytes, 'PNG', 18, signatureY + 23, 34, Math.min(16, signatureHeight - 25), undefined, 'FAST');
    } else {
      pdf.text('Signature non renseignée', 18, signatureY + 29);
    }
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.2);
    pdf.setTextColor(35, 59, 87);
    pdf.text('BON POUR ACCORD', 109, signatureY + 14);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.5);
    pdf.setTextColor(80, 97, 120);
    ['NOM ET QUALITÉ', 'SIGNATURE', 'Date ET CACHET'].forEach((label, index) => {
      const labelY = signatureY + 22 + index * 8;
      pdf.text(label, 109, labelY);
      pdf.setDrawColor(190, 202, 216);
      pdf.line(132, labelY, 191, labelY);
    });

    const generatedOn = `Offre générée le ${formatOfferGenerationDate(new Date())}`;
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(8);
    pdf.setTextColor(92, 111, 124);
    pdf.text(generatedOn, 196, 290, { align: 'right' });
  } else {
    const pages = await Promise.all([
      loadAssetBytes(bimcoPage01Url),
      loadAssetBytes(bimcoPage02Url),
      loadAssetBytes(bimcoPage03Url),
      loadAssetBytes(bimcoPage04Url),
    ]);
    const values = buildProjectBimcoP144PdfFields(input);
    pages.forEach((pageBytes, pageIndex) => {
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

  if (kind === 'bimco_supplytime') {
    const [{ PDFDocument }, partTwoBytes] = await Promise.all([
      import('pdf-lib'),
      loadAssetBytes('/templates/bimco-p144-part-ii.pdf'),
    ]);
    const partOne = await PDFDocument.load(pdf.output('arraybuffer'));
    const partTwo = await PDFDocument.load(partTwoBytes);
    const merged = await PDFDocument.create();
    const partOnePages = await merged.copyPages(partOne, partOne.getPageIndices());
    const partTwoPages = await merged.copyPages(partTwo, partTwo.getPageIndices());
    [...partOnePages, ...partTwoPages].forEach((page) => merged.addPage(page));
    const bytes = await merged.save({ useObjectStreams: true });
    return {
      blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }),
      fileName: buildGeneratedDocumentFileName(kind, input.project),
      mimeType: 'application/pdf',
    };
  }

  return {
    blob: pdf.output('blob'),
    fileName: buildGeneratedDocumentFileName(kind, input.project),
    mimeType: 'application/pdf',
  };
}

function formatDateLong(value: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full' }).format(date);
}

function formatDateShort(value: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('fr-FR').format(date);
}

function towageNumber(value: number | null | undefined): string {
  return value == null ? '' : new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(value);
}

function towageValueWithUnit(value: string | undefined, unit: string): string {
  const trimmed = (value || '').trim();
  if (!trimmed) return '';
  return new RegExp(`\\b${unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(trimmed)
    ? trimmed
    : `${trimmed} ${unit}`;
}

function towageTowedAssetIdentity(asset?: ProjectTowedAssetRecord): string {
  if (!asset) return '';
  return [
    `Nom : ${asset.name}`,
    `Type d’engin, de navire ou de colis : ${asset.assetType}`,
    `Longueur hors tout : ${towageNumber(asset.lengthOverallM)}${asset.lengthOverallM === null ? '' : ' m'}`,
    `Largeur hors tout : ${towageNumber(asset.breadthOverallM)}${asset.breadthOverallM === null ? '' : ' m'}`,
    `Tirant d’eau max : ${towageNumber(asset.maxDraftM)}${asset.maxDraftM === null ? '' : ' m'}`,
    `Déplacement léger : ${towageNumber(asset.lightDisplacementT)}${asset.lightDisplacementT === null ? '' : ' T'}`,
    `Pavillon : ${asset.flag}`,
    `Société de classification : ${asset.classificationSociety}`,
    `N° d’enregistrement : ${asset.registrationNumber}`,
    `Propriétaire (si différent de l’affréteur) : ${asset.ownerName}`,
    `Assureur corps et machine : ${asset.hullMachineryInsurer}`,
    `Assureur RC : ${asset.liabilityInsurer}`,
  ].join('\n');
}

function towageVesselIdentity(vessel?: VesselRecord): string {
  if (!vessel) return '';
  const mainEngine = vessel.mainEngine || '';
  const power = mainEngine && vessel.mainEnginePowerKw
    ? `${mainEngine} (total ${towageNumber(vessel.mainEnginePowerKw)} kW)`
    : mainEngine || (vessel.mainEnginePowerKw ? `${towageNumber(vessel.mainEnginePowerKw)} kW` : '');
  const normalizedFlag = (vessel.flagState || '').trim().toLocaleLowerCase('fr-FR');
  const flag = ['fr', 'france', 'français', 'francais'].includes(normalizedFlag)
    ? 'Pavillon français'
    : `Pavillon : ${vessel.flagState || ''}`;
  return [
    `Nom : ${vessel.name}`,
    `Longueur hors tout : ${towageValueWithUnit(vessel.lengthOverall, 'm')}`,
    `Traction au point fixe : ${vessel.bollardPullTonnes == null ? '' : `${towageNumber(vessel.bollardPullTonnes)} t`}`,
    `Équipement du navire pour le remorquage : ${vessel.deckEquipment || ''}`,
    `Puissance propulsive : ${power}`,
    `Société de classification : ${vessel.classificationLabel || ''}`,
    flag,
    `N° d’enregistrement : ${vessel.registrationNumber || ''}`,
    `Assureur RC (P&I) : ${vessel.liabilityInsurer || ''}`,
  ].join('\n');
}

export function buildTowageTemplateFields({
  client,
  contract,
  emitter,
  project,
  towedAsset,
  vessel,
}: ProjectDocumentGenerationInput): Record<string, string> {
  const supplytime = contract?.supplytimeData || {};
  const today = new Date().toISOString();
  const owner = contract?.ownerIdentity || 'BBTM\n15, impasse du Pou\n50340 Le Rozel';
  return {
    CONTRACT_DATE_LONG: formatDateShort(today),
    CONTRACT_DATE_SHORT: formatDateShort(today),
    DOCUMENT_CODE: '-',
    PROJECT_CODE: project.projectCode,
    CHARTERER: client ? [client.name, client.address, [client.city, client.country].filter(Boolean).join(' ')].filter(Boolean).join('\n') : project.clientName,
    OWNER: owner,
    TOWED_VESSEL: towageTowedAssetIdentity(towedAsset),
    TUG: towageVesselIdentity(vessel),
    TOWED_CONDITIONS: supplytime.towed_conditions || DEFAULT_TOWAGE_CONDITIONS,
    PICKUP_PLACE: project.deliveryPort,
    DEPARTURE_WINDOW: supplytime.departure_window || '',
    DESTINATION_PLACE: project.redeliveryPort,
    ARRIVAL_WINDOW: supplytime.arrival_window || formatDateLong(project.redeliveryAt),
    CONNECTION_TIME: supplytime.connection_time || '',
    DISCONNECTION_TIME: supplytime.disconnection_time || '',
    FIXED_PRICE: formatMoney(contract?.charterHire, contract?.hireCurrency || contract?.feeCurrency || 'EUR'),
    OPTIONAL_COSTS: towageOptionalCostsWithDefault(supplytime.optional_costs),
    PAYMENT_TERMS: supplytime.box23_payment || DEFAULT_TOWAGE_PAYMENT_TERMS,
    ADDITIONAL_CHARGES: supplytime.additional_charges || '',
    SPECIAL_CONDITIONS: supplytime.special_conditions || DEFAULT_TOWAGE_SPECIAL_CONDITIONS,
    CHARTERER_SIGNATORY: client?.representedBy || supplytime.charterer_signatory || '',
    OWNER_SIGNATORY: formatProjectDocumentEmitterName(emitter) || supplytime.owner_signatory || '',
    SIGNATURE_DATE: `Le ${formatDateLong(today)}`,
  };
}

function bareboatClientIdentity(client: ClientRecord | undefined, project: ProjectRecord): string {
  if (!client) return project.clientName;
  return [
    client.name,
    client.address,
    [client.postalCode, client.city].filter(Boolean).join(' '),
    client.country,
    client.siret ? `Siret : ${client.siret}` : '',
  ].filter(Boolean).join('\n');
}

function bareboatVesselIdentity(vessel: VesselRecord | undefined, project: ProjectRecord): string {
  if (!vessel) return project.primaryVesselName ? `Nom : ${project.primaryVesselName}` : '';
  return [
    `Nom : ${vessel.name}`,
    `Immatriculation : ${vessel.registrationNumber || ''}`,
    `Port d’immatriculation : ${vessel.registrationPort || ''}`,
    `Pavillon : ${vessel.flagState || ''}`,
    `Classe : ${vessel.classificationLabel || ''}`,
  ].join('\n');
}

function bareboatMinimumDuration(project: ProjectRecord): string {
  const start = project.charterStartsAt || project.deliveryAt || project.startsOn;
  const end = project.charterEndsAt || project.redeliveryAt || project.endsOn;
  if (!start || !end) return '';
  const startsAt = new Date(start);
  const endsAt = new Date(end);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt < startsAt) return '';
  return `${Math.max(1, Math.ceil((endsAt.getTime() - startsAt.getTime()) / 86_400_000))} jours`;
}

export function buildBareboatTemplateFields({
  client,
  contract,
  emitter,
  project,
  vessel,
  vesselCertificates,
}: ProjectDocumentGenerationInput): Record<string, string> {
  const saved = contract?.supplytimeData || {};
  const contractDate = saved.bareboat_contract_date || localTodayIso();
  const certificateFields = vesselCertificates
    ? deriveBareboatCertificateFields(vesselCertificates)
    : undefined;
  const ownerSignatory = saved.bareboat_owner_signatory || formatProjectDocumentEmitterName(emitter) || '';
  const chartererSignatory = saved.bareboat_charterer_signatory || client?.representedBy || '';
  const vesselDetails = [
    vessel?.builtYear ? `Année de construction : ${vessel.builtYear}${saved.bareboat_refit_details ? ` - ${saved.bareboat_refit_details}` : ''}` : saved.bareboat_refit_details || '',
    `Limites d’exploitation : ${saved.bareboat_operating_limits || vessel?.navigationCategory || ''}`,
  ].filter(Boolean).join('\n');
  const titles = [
    `Permis de navigation : ${certificateFields ? certificateFields.navigationPermitLabel : saved.bareboat_navigation_permit || ''}`,
    `Permis d’armement : ${certificateFields ? certificateFields.manningPermitLabel : saved.bareboat_manning_permit || ''}`,
  ].join('\n');
  return {
    CONTRACT_DATE_SHORT: formatDateShort(contractDate),
    CONTRACT_DATE_LONG: formatBareboatDate(contractDate),
    CONTRACT_PLACE: saved.bareboat_contract_place || DEFAULT_BAREBOAT_CONTRACT_FIELDS.bareboat_contract_place,
    PROJECT_CODE: project.projectCode,
    VESSEL_NAME: vessel?.name || project.primaryVesselName,
    CHARTERER: saved.bareboat_charterer_identity || bareboatClientIdentity(client, project),
    OWNER: contract?.ownerIdentity || DEFAULT_BAREBOAT_OWNER_IDENTITY,
    VESSEL_IDENTITY: bareboatVesselIdentity(vessel, project),
    VESSEL_DETAILS: vesselDetails,
    LAST_ADMIN_VISIT: certificateFields ? certificateFields.lastAdminVisitLabel : saved.bareboat_last_admin_visit || '',
    NAVIGATION_TITLES: titles,
    DELIVERY: buildBareboatDeliveryLabel(
      project.deliveryAt,
      project.deliveryPort,
      saved.bareboat_delivery_by_truck === 'true',
    ),
    MOBILISATION: formatMoney(contract?.mobilisationFee, contract?.feeCurrency || 'EUR'),
    REDELIVERY: buildBareboatRedeliveryLabel(project.redeliveryAt, project.redeliveryPort),
    DEMOBILISATION: formatMoney(contract?.demobilisationFee, contract?.feeCurrency || 'EUR'),
    MINIMUM_DURATION: saved.bareboat_minimum_duration || bareboatMinimumDuration(project),
    EXTENSIONS: saved.bareboat_extension_options || extensionLabel(contract),
    CHARTER_HIRE: contract?.charterHire == null ? '' : formatMoney(contract.charterHire, contract.hireCurrency || 'EUR'),
    EARLY_TERMINATION: saved.bareboat_early_termination_indemnity
      || DEFAULT_BAREBOAT_CONTRACT_FIELDS.bareboat_early_termination_indemnity,
    INSURED_VALUE: saved.bareboat_insured_value || '',
    INSURANCE_PAYER: saved.bareboat_insurance_payer || DEFAULT_BAREBOAT_CONTRACT_FIELDS.bareboat_insurance_payer,
    APPLICABLE_LAW: saved.bareboat_applicable_law || DEFAULT_BAREBOAT_CONTRACT_FIELDS.bareboat_applicable_law,
    JURISDICTION: saved.bareboat_jurisdiction || DEFAULT_BAREBOAT_CONTRACT_FIELDS.bareboat_jurisdiction,
    CHARTERER_SIGNATORY: chartererSignatory,
    OWNER_SIGNATORY: ownerSignatory,
    OWNER_SIGNATORY_FUNCTION: saved.bareboat_owner_signatory_function || emitter?.functionLabel || '',
  };
}

interface TowagePdfBox {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

const TOWAGE_SOURCE_WIDTH = 993;
const TOWAGE_SOURCE_HEIGHT = 1404;

function towagePdfBox(page: PDFPage, box: TowagePdfBox) {
  const { width, height } = page.getSize();
  return {
    height: ((box.bottom - box.top) / TOWAGE_SOURCE_HEIGHT) * height,
    width: ((box.right - box.left) / TOWAGE_SOURCE_WIDTH) * width,
    x: (box.left / TOWAGE_SOURCE_WIDTH) * width,
    y: height - (box.bottom / TOWAGE_SOURCE_HEIGHT) * height,
  };
}

function towagePdfText(value: string): string {
  return value
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/[\u2010\u2011\u2012\u2013\u2014]/g, '-')
    .trim();
}

function wrapTowagePdfText(font: PDFFont, value: string, size: number, maxWidth: number): string[] {
  return towagePdfText(value).split('\n').flatMap((paragraph) => {
    if (!paragraph.trim()) return [];
    const lines: string[] = [];
    let line = '';
    paragraph.trim().split(/\s+/).forEach((word) => {
      const candidate = line ? `${line} ${word}` : word;
      if (!line || font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    });
    if (line) lines.push(line);
    return lines;
  });
}

function drawTowagePdfText(
  page: PDFPage,
  font: PDFFont,
  value: string,
  box: TowagePdfBox,
  requestedSize = 8,
  align: 'left' | 'center' = 'left',
) {
  if (!value.trim()) return;
  const bounds = towagePdfBox(page, box);
  const padding = 4;
  let size = requestedSize;
  let lines = wrapTowagePdfText(font, value, size, bounds.width - padding * 2);
  while (size > 5 && lines.length * size * 1.18 > bounds.height - padding * 2) {
    size -= 0.25;
    lines = wrapTowagePdfText(font, value, size, bounds.width - padding * 2);
  }
  const lineHeight = size * 1.18;
  lines.slice(0, Math.max(1, Math.floor((bounds.height - padding * 2) / lineHeight))).forEach((line, index) => {
    const lineWidth = font.widthOfTextAtSize(line, size);
    page.drawText(line, {
      x: align === 'center' ? bounds.x + (bounds.width - lineWidth) / 2 : bounds.x + padding,
      y: bounds.y + bounds.height - padding - size - index * lineHeight,
      size,
      font,
    });
  });
}

function drawTowageSignature(
  page: PDFPage,
  font: PDFFont,
  name: string,
  date: string,
  signature: PDFImage | null,
  box: TowagePdfBox,
) {
  const bounds = towagePdfBox(page, box);
  drawTowagePdfText(page, font, [name, date].filter(Boolean).join('\n'), box, 8.5);
  if (!signature) return;
  const natural = signature.scale(1);
  const maximumWidth = bounds.width * 0.42;
  const maximumHeight = bounds.height * 0.55;
  const ratio = Math.min(maximumWidth / natural.width, maximumHeight / natural.height, 1);
  page.drawImage(signature, {
    x: bounds.x + 6,
    y: bounds.y + 8,
    width: natural.width * ratio,
    height: natural.height * ratio,
  });
}

async function generateTowageContract(input: ProjectDocumentGenerationInput): Promise<GeneratedProjectDocument> {
  const { PDFDocument, StandardFonts } = await import('pdf-lib');
  const [templateBytes, signatureBytes] = await Promise.all([
    loadAssetBytes('/templates/contrat-remorquage-bbtm.pdf'),
    input.emitter?.signatureUrl
      ? loadAssetBytes(input.emitter.signatureUrl).catch(() => null)
      : Promise.resolve(null),
  ]);
  const document = await PDFDocument.load(templateBytes);
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  let signature: PDFImage | null = null;
  if (signatureBytes) {
    try {
      signature = input.emitter?.signatureMimeType === 'image/jpeg'
        ? await document.embedJpg(signatureBytes)
        : await document.embedPng(signatureBytes);
    } catch {
      signature = null;
    }
  }
  const values = buildTowageTemplateFields(input);
  const pages = document.getPages();
  pages.forEach((page) => {
    drawTowagePdfText(page, bold, values.DOCUMENT_CODE, { left: 236, top: 96, right: 346, bottom: 160 }, 8, 'center');
    drawTowagePdfText(page, bold, values.PROJECT_CODE, { left: 349, top: 96, right: 461, bottom: 160 }, 15, 'center');
    drawTowagePdfText(page, bold, values.CONTRACT_DATE_SHORT, { left: 752, top: 60, right: 873, bottom: 93 }, 8.5, 'center');
  });

  const firstPage = pages[0];
  drawTowagePdfText(firstPage, regular, values.CONTRACT_DATE_LONG, { left: 496, top: 207, right: 872, bottom: 228 }, 8.5);
  drawTowagePdfText(firstPage, regular, values.CHARTERER, { left: 120, top: 250, right: 494, bottom: 331 }, 8.5);
  drawTowagePdfText(firstPage, regular, values.OWNER, { left: 496, top: 250, right: 872, bottom: 331 }, 8.5);
  drawTowagePdfText(firstPage, regular, values.TOWED_VESSEL, { left: 120, top: 353, right: 494, bottom: 638 }, 7.5);
  drawTowagePdfText(firstPage, regular, values.TUG, { left: 496, top: 353, right: 872, bottom: 638 }, 7.5);
  drawTowagePdfText(firstPage, regular, values.TOWED_CONDITIONS, { left: 120, top: 660, right: 872, bottom: 701 }, 8.25);
  drawTowagePdfText(firstPage, regular, values.PICKUP_PLACE, { left: 120, top: 723, right: 494, bottom: 743 }, 8);
  drawTowagePdfText(firstPage, regular, values.DEPARTURE_WINDOW, { left: 496, top: 723, right: 872, bottom: 743 }, 8);
  drawTowagePdfText(firstPage, regular, values.DESTINATION_PLACE, { left: 120, top: 765, right: 494, bottom: 785 }, 8);
  drawTowagePdfText(firstPage, regular, values.ARRIVAL_WINDOW, { left: 496, top: 765, right: 872, bottom: 785 }, 8);
  drawTowagePdfText(firstPage, regular, values.CONNECTION_TIME, { left: 120, top: 828, right: 494, bottom: 848 }, 8);
  drawTowagePdfText(firstPage, regular, values.DISCONNECTION_TIME, { left: 496, top: 828, right: 872, bottom: 848 }, 8);
  drawTowagePdfText(firstPage, regular, values.FIXED_PRICE, { left: 120, top: 870, right: 494, bottom: 911 }, 8);
  drawTowagePdfText(firstPage, regular, values.OPTIONAL_COSTS, { left: 496, top: 870, right: 872, bottom: 911 }, 7.5);
  drawTowagePdfText(firstPage, regular, values.PAYMENT_TERMS, { left: 120, top: 933, right: 494, bottom: 994 }, 7.5);
  drawTowagePdfText(firstPage, regular, values.ADDITIONAL_CHARGES, { left: 496, top: 933, right: 872, bottom: 994 }, 7.5);
  drawTowagePdfText(firstPage, regular, values.SPECIAL_CONDITIONS, { left: 120, top: 1016, right: 872, bottom: 1073 }, 8);
  drawTowageSignature(firstPage, regular, values.CHARTERER_SIGNATORY, '', null, { left: 120, top: 1095, right: 494, bottom: 1251 });
  drawTowageSignature(firstPage, regular, values.OWNER_SIGNATORY, values.SIGNATURE_DATE, signature, { left: 496, top: 1095, right: 872, bottom: 1251 });

  if (pages[5]) {
    drawTowageSignature(pages[5], regular, values.OWNER_SIGNATORY, values.SIGNATURE_DATE, signature, { left: 120, top: 442, right: 494, bottom: 647 });
    drawTowageSignature(pages[5], regular, values.CHARTERER_SIGNATORY, '', null, { left: 496, top: 442, right: 872, bottom: 647 });
  }

  document.setTitle(buildGeneratedDocumentFileName('towage_contract', input.project));
  document.setSubject(projectReference(input.project));
  document.setCreator('SeaPilot');
  const bytes = await document.save({ useObjectStreams: false });
  return {
    blob: new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' }),
    fileName: buildGeneratedDocumentFileName('towage_contract', input.project),
    mimeType: 'application/pdf',
  };
}

async function generateBareboatCharter(input: ProjectDocumentGenerationInput): Promise<GeneratedProjectDocument> {
  const { PDFDocument, StandardFonts } = await import('pdf-lib');
  const [templateBytes, signatureBytes] = await Promise.all([
    loadAssetBytes('/templates/contrat-affretement-bbtm.pdf'),
    input.emitter?.signatureUrl
      ? loadAssetBytes(input.emitter.signatureUrl).catch(() => null)
      : Promise.resolve(null),
  ]);
  const templateDocument = await PDFDocument.load(templateBytes);
  const document = await PDFDocument.create();
  // Word leaves the fourth source page with a graphics state that clips later operators.
  // Embedding every template page as an isolated form keeps the background vectorial and resets that state.
  const templatePages = await document.embedPdf(templateDocument, templateDocument.getPageIndices());
  templatePages.forEach((templatePage) => {
    const page = document.addPage([templatePage.width, templatePage.height]);
    page.drawPage(templatePage, {
      height: templatePage.height,
      width: templatePage.width,
      x: 0,
      y: 0,
    });
  });
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  let signature: PDFImage | null = null;
  if (signatureBytes) {
    try {
      signature = input.emitter?.signatureMimeType === 'image/jpeg'
        ? await document.embedJpg(signatureBytes)
        : await document.embedPng(signatureBytes);
    } catch {
      signature = null;
    }
  }

  const values = buildBareboatTemplateFields(input);
  const pages = document.getPages();
  pages.forEach((page) => {
    drawTowagePdfText(page, bold, values.PROJECT_CODE, { left: 287, top: 83, right: 416, bottom: 142 }, 11, 'center');
    drawTowagePdfText(page, regular, values.CONTRACT_DATE_SHORT, { left: 547, top: 60, right: 675, bottom: 82 }, 8.5, 'center');
    drawTowagePdfText(page, regular, values.VESSEL_NAME, { left: 417, top: 112, right: 934, bottom: 142 }, 9, 'center');
  });

  const firstPage = pages[0];
  drawTowagePdfText(firstPage, regular, `${values.CONTRACT_PLACE}, le ${values.CONTRACT_DATE_LONG}`, { left: 60, top: 191, right: 934, bottom: 215 }, 8.5);
  drawTowagePdfText(firstPage, regular, values.CHARTERER, { left: 60, top: 238, right: 485, bottom: 376 }, 8.5);
  drawTowagePdfText(firstPage, regular, values.OWNER, { left: 486, top: 238, right: 934, bottom: 376 }, 8.5);
  drawTowagePdfText(firstPage, regular, values.VESSEL_IDENTITY, { left: 60, top: 399, right: 485, bottom: 513 }, 8.25);
  drawTowagePdfText(firstPage, regular, values.VESSEL_DETAILS, { left: 486, top: 399, right: 934, bottom: 513 }, 8.25);
  drawTowagePdfText(firstPage, regular, values.LAST_ADMIN_VISIT, { left: 60, top: 536, right: 485, bottom: 583 }, 8.25);
  drawTowagePdfText(firstPage, regular, values.NAVIGATION_TITLES, { left: 486, top: 536, right: 934, bottom: 583 }, 8.25);
  drawTowagePdfText(firstPage, regular, values.DELIVERY, { left: 60, top: 606, right: 485, bottom: 675 }, 8.25);
  drawTowagePdfText(firstPage, regular, values.MOBILISATION, { left: 486, top: 606, right: 934, bottom: 675 }, 8.25);
  drawTowagePdfText(firstPage, regular, values.REDELIVERY, { left: 60, top: 698, right: 485, bottom: 722 }, 8.25);
  drawTowagePdfText(firstPage, regular, values.DEMOBILISATION, { left: 486, top: 698, right: 934, bottom: 722 }, 8.25);
  drawTowagePdfText(firstPage, regular, values.MINIMUM_DURATION, { left: 60, top: 745, right: 485, bottom: 768 }, 8.25);
  drawTowagePdfText(firstPage, regular, values.EXTENSIONS, { left: 486, top: 745, right: 934, bottom: 768 }, 8.25);
  drawTowagePdfText(firstPage, regular, values.CHARTER_HIRE, { left: 60, top: 791, right: 485, bottom: 814 }, 7.75);
  drawTowagePdfText(firstPage, regular, values.EARLY_TERMINATION, { left: 486, top: 791, right: 934, bottom: 814 }, 7.75);
  drawTowagePdfText(firstPage, regular, values.INSURED_VALUE, { left: 60, top: 838, right: 485, bottom: 861 }, 8.25);
  drawTowagePdfText(firstPage, regular, values.INSURANCE_PAYER, { left: 486, top: 838, right: 934, bottom: 861 }, 8.25);
  drawTowagePdfText(firstPage, regular, values.APPLICABLE_LAW, { left: 60, top: 884, right: 485, bottom: 907 }, 8.25);
  drawTowagePdfText(firstPage, regular, values.JURISDICTION, { left: 486, top: 884, right: 934, bottom: 907 }, 8.25);
  drawTowageSignature(firstPage, regular, values.CHARTERER_SIGNATORY, '', null, { left: 60, top: 930, right: 485, bottom: 1083 });
  drawTowageSignature(firstPage, regular, [values.OWNER_SIGNATORY, values.OWNER_SIGNATORY_FUNCTION].filter(Boolean).join('\n'), '', signature, { left: 486, top: 930, right: 934, bottom: 1083 });

  const signaturePage = pages[3];
  if (signaturePage) {
    drawTowagePdfText(signaturePage, bold, `Fait à ${values.CONTRACT_PLACE}, le ${values.CONTRACT_DATE_LONG}`, { left: 60, top: 165, right: 934, bottom: 198 }, 9);
    drawTowageSignature(signaturePage, regular, values.CHARTERER_SIGNATORY, '', null, { left: 60, top: 263, right: 496, bottom: 435 });
    drawTowageSignature(signaturePage, regular, [values.OWNER_SIGNATORY, values.OWNER_SIGNATORY_FUNCTION].filter(Boolean).join('\n'), '', signature, { left: 497, top: 263, right: 934, bottom: 435 });
  }

  document.setTitle(buildGeneratedDocumentFileName('bareboat_charter', input.project));
  document.setSubject(projectReference(input.project));
  document.setCreator('SeaPilot');
  const bytes = await document.save({ useObjectStreams: false });
  return {
    blob: new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' }),
    fileName: buildGeneratedDocumentFileName('bareboat_charter', input.project),
    mimeType: 'application/pdf',
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
