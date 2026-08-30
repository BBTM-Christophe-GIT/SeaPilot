import JSZip from 'jszip';
import type {
  ClientRecord,
  ProjectContractRecord,
  ProjectPlanningOccurrenceRecord,
  ProjectRecord,
} from './projectQueries';
import type { ProjectGeneratedDocumentKind } from './projectDocumentTypes';
import { buildSupplytimePreview } from './projectReadModel';
import { DEFAULT_PROJECT_FUEL_TERMS } from './projectContractOptions';
import { formatProjectOfferPort } from './projectPorts';
import { BIMCO_P144_FIELDS } from './projectContractModels';
import {
  buildCommercialReserves,
  formatProjectDocumentEmitterName,
  shouldDisplayCommercialOfferRoute,
  type ProjectDocumentEmitter,
} from './projectCommercialOffer';
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
    towage_contract: 'Contrat de remorquage - R1.docx',
    bareboat_charter: 'Contrat affretement coque nue - R1.docx',
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
  if (kind === 'bareboat_charter' || kind === 'intellectual_service') {
    throw new Error('Le modèle de ce contrat doit encore être fourni avant sa génération.');
  }

  if (kind === 'towage_contract') {
    return generateTowageContract(input);
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

function escapeWordXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r?\n/g, '</w:t><w:br/><w:t xml:space="preserve">');
}

export function buildTowageTemplateFields({
  client,
  contract,
  occurrence,
  project,
}: ProjectDocumentGenerationInput): Record<string, string> {
  const supplytime = contract?.supplytimeData || {};
  const startsOn = occurrence?.startsOn || project.deliveryAt || project.startsOn;
  const endsOn = occurrence?.endsOn || project.redeliveryAt || project.endsOn;
  const vesselName = occurrence?.primaryVesselName || project.primaryVesselName;
  const owner = contract?.ownerIdentity || 'BBTM\n15, impasse du Pou\n50340 Le Rozel';
  return {
    CONTRACT_DATE_LONG: formatDateLong(startsOn || new Date().toISOString()),
    CONTRACT_DATE_SHORT: formatDateShort(startsOn || new Date().toISOString()),
    DOCUMENT_CODE: '-',
    PROJECT_CODE: project.projectCode,
    CHARTERER: client ? [client.name, client.address, [client.city, client.country].filter(Boolean).join(' ')].filter(Boolean).join('\n') : project.clientName,
    OWNER: owner,
    TOWED_VESSEL: supplytime.towed_vessel || project.description || project.title,
    TUG: vesselName,
    TOWED_CONDITIONS: supplytime.towed_conditions || project.description,
    PICKUP_PLACE: project.deliveryPort,
    DEPARTURE_WINDOW: startsOn ? formatDateLong(startsOn) : '',
    DESTINATION_PLACE: project.redeliveryPort,
    ARRIVAL_WINDOW: endsOn ? formatDateLong(endsOn) : '',
    CONNECTION_TIME: supplytime.connection_time || '',
    DISCONNECTION_TIME: supplytime.disconnection_time || '',
    FIXED_PRICE: formatMoney(contract?.charterHire, contract?.hireCurrency || contract?.feeCurrency || 'EUR', contract?.hireUnit),
    OPTIONAL_COSTS: supplytime.optional_costs || '',
    PAYMENT_TERMS: supplytime.box23_payment || '',
    ADDITIONAL_CHARGES: supplytime.additional_charges || '',
    SPECIAL_CONDITIONS: supplytime.special_conditions || '',
    CHARTERER_SIGNATORY: supplytime.charterer_signatory || '',
    OWNER_SIGNATORY: supplytime.owner_signatory || 'Benjamin BON - Président',
    SIGNATURE_DATE: '',
  };
}

async function generateTowageContract(input: ProjectDocumentGenerationInput): Promise<GeneratedProjectDocument> {
  const templateBytes = await loadAssetBytes('/templates/contrat-remorquage-bbtm.docx');
  const zip = await JSZip.loadAsync(templateBytes);
  const values = buildTowageTemplateFields(input);
  const xmlEntries = Object.keys(zip.files).filter((name) => name.startsWith('word/') && name.endsWith('.xml'));

  await Promise.all(xmlEntries.map(async (entryName) => {
    const entry = zip.file(entryName);
    if (!entry) return;
    let xml = await entry.async('string');
    Object.entries(values).forEach(([key, value]) => {
      xml = xml.replaceAll(`{{${key}}}`, escapeWordXml(value || ''));
    });
    zip.file(entryName, xml);
  }));

  const unresolved = await Promise.all(xmlEntries.map(async (entryName) => (await zip.file(entryName)?.async('string')) || ''));
  if (unresolved.some((xml) => /\{\{[A-Z0-9_]+\}\}/.test(xml))) {
    throw new Error('Le modèle de remorquage contient une zone non renseignée par SeaPilot.');
  }

  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  return {
    blob,
    fileName: buildGeneratedDocumentFileName('towage_contract', input.project),
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
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
