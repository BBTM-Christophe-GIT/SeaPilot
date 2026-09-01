import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  FileText,
  RefreshCw,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { ProjectTowedAssetWriteInput, ProjectWriteInput } from './projectMutations';
import type { ClientRecord, ProjectVesselCertificateRecord, VesselRecord } from './projectQueries';
import {
  BAREBOAT_CONTRACT_TYPE,
  BIMCO_CONTRACT_TYPE,
  COMMERCIAL_OFFER_CONTRACT_TYPE,
  DEFAULT_BAREBOAT_CONTRACT_FIELDS,
  normalizeProjectContractType,
  TOWAGE_CONTRACT_TYPE,
} from './projectContractOptions';
import { BIMCO_P144_FIELDS, BIMCO_P144_GROUPS } from './projectContractModels';
import bimcoPage01Url from './assets/contract-previews/bimco-p144-page-01.png';
import bimcoPage02Url from './assets/contract-previews/bimco-p144-page-02.png';
import bimcoPage03Url from './assets/contract-previews/bimco-p144-page-03.png';
import bimcoPage04Url from './assets/contract-previews/bimco-p144-page-04.png';
import towagePage01Url from './assets/contract-previews/towage-contract-page-01.png';
import towagePage02Url from './assets/contract-previews/towage-contract-page-02.png';
import towagePage03Url from './assets/contract-previews/towage-contract-page-03.png';
import towagePage04Url from './assets/contract-previews/towage-contract-page-04.png';
import towagePage05Url from './assets/contract-previews/towage-contract-page-05.png';
import towagePage06Url from './assets/contract-previews/towage-contract-page-06.png';
import bareboatPage01Url from './assets/contract-previews/bareboat-charter-page-1.png';
import bareboatPage02Url from './assets/contract-previews/bareboat-charter-page-2.png';
import bareboatPage03Url from './assets/contract-previews/bareboat-charter-page-3.png';
import bareboatPage04Url from './assets/contract-previews/bareboat-charter-page-4.png';
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

interface ProjectContractPreviewProps {
  client?: Pick<ClientRecord, 'address' | 'city' | 'country' | 'name' | 'postalCode' | 'representedBy' | 'siret'>;
  emitter?: ProjectDocumentEmitter;
  form: ProjectWriteInput;
  projectCode: string;
  towedAsset: ProjectTowedAssetWriteInput | null;
  vessel?: VesselRecord;
  vesselCertificates?: ProjectVesselCertificateRecord[];
}

interface PositionedValue {
  height: number;
  key: string;
  left: number;
  page: number;
  top: number;
  width: number;
}

const BIMCO_PAGE_URLS = [bimcoPage01Url, bimcoPage02Url, bimcoPage03Url, bimcoPage04Url] as const;
const TOWAGE_PAGE_URLS = [
  towagePage01Url,
  towagePage02Url,
  towagePage03Url,
  towagePage04Url,
  towagePage05Url,
  towagePage06Url,
] as const;
const BAREBOAT_PAGE_URLS = [bareboatPage01Url, bareboatPage02Url, bareboatPage03Url, bareboatPage04Url] as const;

const BIMCO_POSITIONED_VALUES: PositionedValue[] = [
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

function compactDate(value: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('fr-FR').format(date);
}

function longDate(value: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(date);
}

function todayLongDate(): string {
  return `Le ${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full' }).format(new Date())}`;
}

function money(value: number | null, currency = 'EUR', unit = ''): string {
  if (value === null) return '';
  const amount = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(value);
  return `${amount} ${currency === 'EUR' ? '€' : currency} HT${unit ? ` / ${unit}` : ''}`;
}

function clientIdentity(client?: ProjectContractPreviewProps['client']): string {
  if (!client) return '';
  return [client.name, client.address, [client.city, client.country].filter(Boolean).join(' ')].filter(Boolean).join('\n');
}

function frenchNumber(value: number | null | undefined): string {
  return value == null ? '' : new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(value);
}

function valueWithUnit(value: string | undefined, unit: string): string {
  const trimmed = (value || '').trim();
  if (!trimmed) return '';
  return new RegExp(`\\b${unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(trimmed)
    ? trimmed
    : `${trimmed} ${unit}`;
}

function towedIdentity(asset: ProjectTowedAssetWriteInput | null): string {
  if (!asset) return '';
  return [
    `Nom : ${asset.name}`,
    `Type d’engin, de navire ou de colis : ${asset.assetType}`,
    `Longueur hors tout : ${frenchNumber(asset.lengthOverallM)}${asset.lengthOverallM === null ? '' : ' m'}`,
    `Largeur hors tout : ${frenchNumber(asset.breadthOverallM)}${asset.breadthOverallM === null ? '' : ' m'}`,
    `Tirant d’eau max : ${frenchNumber(asset.maxDraftM)}${asset.maxDraftM === null ? '' : ' m'}`,
    `Déplacement léger : ${frenchNumber(asset.lightDisplacementT)}${asset.lightDisplacementT === null ? '' : ' T'}`,
    `Pavillon : ${asset.flag}`,
    `Société de classification : ${asset.classificationSociety}`,
    `N° d’enregistrement : ${asset.registrationNumber}`,
    `Propriétaire (si différent de l’affréteur) : ${asset.ownerName}`,
    `Assureur corps et machine : ${asset.hullMachineryInsurer}`,
    `Assureur RC : ${asset.liabilityInsurer}`,
  ].join('\n');
}

function vesselIdentity(vessel?: VesselRecord): string {
  if (!vessel) return '';
  const mainEngine = vessel.mainEngine || '';
  const power = mainEngine && vessel.mainEnginePowerKw
    ? `${mainEngine} (total ${frenchNumber(vessel.mainEnginePowerKw)} kW)`
    : mainEngine || (vessel.mainEnginePowerKw ? `${frenchNumber(vessel.mainEnginePowerKw)} kW` : '');
  const normalizedFlag = (vessel.flagState || '').trim().toLocaleLowerCase('fr-FR');
  const flag = ['fr', 'france', 'français', 'francais'].includes(normalizedFlag)
    ? 'Pavillon français'
    : `Pavillon : ${vessel.flagState || ''}`;
  return [
    `Nom : ${vessel.name}`,
    `Longueur hors tout : ${valueWithUnit(vessel.lengthOverall, 'm')}`,
    `Traction au point fixe : ${vessel.bollardPullTonnes == null ? '' : `${frenchNumber(vessel.bollardPullTonnes)} t`}`,
    `Équipement du navire pour le remorquage : ${vessel.deckEquipment || ''}`,
    `Puissance propulsive : ${power}`,
    `Société de classification : ${vessel.classificationLabel || ''}`,
    flag,
    `N° d’enregistrement : ${vessel.registrationNumber || ''}`,
    `Assureur RC (P&I) : ${vessel.liabilityInsurer || ''}`,
  ].join('\n');
}

function buildBimcoValues({ client, form, vessel }: ProjectContractPreviewProps): Record<string, string> {
  const saved = form.supplytimeData;
  const hirePeriod = [compactDate(form.charterStartsAt || form.deliveryAt), compactDate(form.charterEndsAt || form.redeliveryAt)]
    .filter(Boolean)
    .join(' – ');
  const extension = form.extensionCount && form.extensionDuration
    ? `${form.extensionCount} × ${form.extensionDuration} ${form.extensionUnit}`
    : '';
  const specialistOperations = [
    form.isRovSupport ? 'ROV operations: Yes' : '',
    form.isDivingSupport ? 'Diving platform: Yes' : '',
  ].filter(Boolean).join('\n');
  const canonical: Record<string, string> = {
    p144_box01_place_date: saved.p144_box01_place_date || longDate(form.startsOn || form.deliveryAt),
    p144_box02_owners: saved.p144_box02_owners || form.ownerIdentity,
    p144_box03_charterers: saved.p144_box03_charterers || clientIdentity(client),
    p144_box04_vessel_imo: saved.p144_box04_vessel_imo || vessel?.name || '',
    p144_box05_delivery_date: saved.p144_box05_delivery_date || compactDate(form.deliveryAt),
    p144_box06_cancelling_date: saved.p144_box06_cancelling_date || compactDate(form.charterStartsAt),
    p144_box07_delivery_place: saved.p144_box07_delivery_place || form.deliveryPort,
    p144_box08_redelivery: saved.p144_box08_redelivery || form.redeliveryPort,
    p144_box09_hire_period: saved.p144_box09_hire_period || hirePeriod,
    p144_box10_extensions: saved.p144_box10_extensions || extension,
    p144_box11_automatic_extension: saved.p144_box11_automatic_extension || [form.autoExtensionPeriod, form.maxExtensionDays ? `${form.maxExtensionDays} day(s)` : ''].filter(Boolean).join('\n'),
    p144_box12_mobilisation: saved.p144_box12_mobilisation || money(form.mobilisationFee, form.feeCurrency),
    p144_box15_demobilisation: saved.p144_box15_demobilisation || money(form.demobilisationFee, form.feeCurrency),
    p144_box16_operation_area: saved.p144_box16_operation_area || form.operationArea,
    p144_box17_employment: saved.p144_box17_employment || form.description,
    p144_box18_specialist_operations: saved.p144_box18_specialist_operations || specialistOperations,
    p144_box19_fuel: saved.p144_box19_fuel || saved.box19_special_fuel || '',
    p144_box20_charter_hire: saved.p144_box20_charter_hire || money(form.charterHire, form.hireCurrency, form.hireUnit),
    p144_box21_extension_hire: saved.p144_box21_extension_hire || money(form.extensionHire, form.hireCurrency, form.hireUnit),
    p144_box22_invoicing: saved.p144_box22_invoicing || saved.box22_invoice_remittance || '',
    p144_box23_payments: saved.p144_box23_payments || saved.box23_payment || '',
    p144_box26_audit_period: saved.p144_box26_audit_period || form.maxAuditPeriod,
  };
  return Object.fromEntries(BIMCO_P144_FIELDS.map((field) => [field.key, canonical[field.key] || saved[field.key] || '']));
}

function buildTowageValues({ client, emitter, form, projectCode, towedAsset, vessel }: ProjectContractPreviewProps) {
  const saved = form.supplytimeData;
  const today = new Date().toISOString();
  return {
    documentCode: '-',
    projectCode,
    headerDate: compactDate(today),
    contractDate: compactDate(today),
    signatureDate: todayLongDate(),
    charterer: clientIdentity(client),
    owner: form.ownerIdentity,
    towed: towedIdentity(towedAsset),
    tug: vesselIdentity(vessel),
    conditions: saved.towed_conditions || '',
    pickup: form.deliveryPort,
    departure: saved.departure_window || '',
    destination: form.redeliveryPort,
    arrival: saved.arrival_window || longDate(form.redeliveryAt),
    connection: saved.connection_time || '',
    disconnection: saved.disconnection_time || '',
    fixedPrice: money(form.charterHire, form.hireCurrency || form.feeCurrency),
    optionalCosts: saved.optional_costs || '',
    payment: saved.box23_payment || '',
    additional: saved.additional_charges || '',
    special: saved.special_conditions || '',
    chartererSignatory: client?.representedBy || saved.charterer_signatory || '',
    ownerSignatory: formatProjectDocumentEmitterName(emitter) || saved.owner_signatory || '',
    ownerSignatureUrl: emitter?.signatureUrl || '',
  };
}

function bareboatClientIdentity(client?: ProjectContractPreviewProps['client']): string {
  if (!client) return '';
  return [
    client.name,
    client.address,
    [client.postalCode, client.city].filter(Boolean).join(' '),
    client.country,
    client.siret ? `Siret : ${client.siret}` : '',
  ].filter(Boolean).join('\n');
}

function bareboatMinimumDuration(form: ProjectWriteInput): string {
  const start = form.charterStartsAt || form.deliveryAt || form.startsOn;
  const end = form.charterEndsAt || form.redeliveryAt || form.endsOn;
  if (!start || !end) return '';
  const startsAt = new Date(start);
  const endsAt = new Date(end);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt < startsAt) return '';
  return `${Math.max(1, Math.ceil((endsAt.getTime() - startsAt.getTime()) / 86_400_000))} jours`;
}

function buildBareboatValues({
  client,
  emitter,
  form,
  projectCode,
  vessel,
  vesselCertificates,
}: ProjectContractPreviewProps) {
  const saved = form.supplytimeData;
  const contractDate = saved.bareboat_contract_date || localTodayIso();
  const certificateFields = vesselCertificates
    ? deriveBareboatCertificateFields(vesselCertificates)
    : undefined;
  const extension = form.extensionCount && form.extensionDuration
    ? `${form.extensionCount} × ${form.extensionDuration} ${form.extensionUnit}`
    : '';
  const vesselIdentityValue = vessel ? [
    `Nom : ${vessel.name}`,
    `Immatriculation : ${vessel.registrationNumber || ''}`,
    `Port d’immatriculation : ${vessel.registrationPort || ''}`,
    `Pavillon : ${vessel.flagState || ''}`,
    `Classe : ${vessel.classificationLabel || ''}`,
  ].join('\n') : '';
  const vesselDetails = [
    vessel?.builtYear ? `Année de construction : ${vessel.builtYear}${saved.bareboat_refit_details ? ` - ${saved.bareboat_refit_details}` : ''}` : saved.bareboat_refit_details || '',
    `Limites d’exploitation : ${saved.bareboat_operating_limits || vessel?.navigationCategory || ''}`,
  ].filter(Boolean).join('\n');
  return {
    projectCode,
    headerDate: compactDate(contractDate),
    vesselName: vessel?.name || '',
    contractDate: `${saved.bareboat_contract_place || DEFAULT_BAREBOAT_CONTRACT_FIELDS.bareboat_contract_place}, le ${formatBareboatDate(contractDate)}`,
    charterer: saved.bareboat_charterer_identity || bareboatClientIdentity(client),
    owner: form.ownerIdentity,
    vesselIdentity: vesselIdentityValue,
    vesselDetails,
    lastAdminVisit: certificateFields ? certificateFields.lastAdminVisitLabel : saved.bareboat_last_admin_visit || '',
    navigationTitles: [
      `Permis de navigation : ${certificateFields ? certificateFields.navigationPermitLabel : saved.bareboat_navigation_permit || ''}`,
      `Permis d’armement : ${certificateFields ? certificateFields.manningPermitLabel : saved.bareboat_manning_permit || ''}`,
    ].join('\n'),
    delivery: buildBareboatDeliveryLabel(
      form.deliveryAt,
      form.deliveryPort,
      saved.bareboat_delivery_by_truck === 'true',
    ),
    mobilisation: money(form.mobilisationFee, form.feeCurrency),
    redelivery: buildBareboatRedeliveryLabel(form.redeliveryAt, form.redeliveryPort),
    demobilisation: money(form.demobilisationFee, form.feeCurrency),
    minimumDuration: saved.bareboat_minimum_duration || bareboatMinimumDuration(form),
    extensions: saved.bareboat_extension_options || extension,
    charterHire: form.charterHire == null ? '' : money(form.charterHire, form.hireCurrency || 'EUR'),
    earlyTermination: saved.bareboat_early_termination_indemnity || DEFAULT_BAREBOAT_CONTRACT_FIELDS.bareboat_early_termination_indemnity,
    insuredValue: saved.bareboat_insured_value || '',
    insurancePayer: saved.bareboat_insurance_payer || DEFAULT_BAREBOAT_CONTRACT_FIELDS.bareboat_insurance_payer,
    applicableLaw: saved.bareboat_applicable_law || DEFAULT_BAREBOAT_CONTRACT_FIELDS.bareboat_applicable_law,
    jurisdiction: saved.bareboat_jurisdiction || DEFAULT_BAREBOAT_CONTRACT_FIELDS.bareboat_jurisdiction,
    chartererSignatory: saved.bareboat_charterer_signatory || client?.representedBy || '',
    ownerSignatory: saved.bareboat_owner_signatory || formatProjectDocumentEmitterName(emitter) || '',
    ownerSignatoryFunction: saved.bareboat_owner_signatory_function || emitter?.functionLabel || '',
    ownerSignatureUrl: emitter?.signatureUrl || '',
    signatureStatement: `Fait à ${saved.bareboat_contract_place || DEFAULT_BAREBOAT_CONTRACT_FIELDS.bareboat_contract_place}, le ${formatBareboatDate(contractDate)}`,
  };
}

function OfferPreview({ client, emitter, form, projectCode, vessel }: ProjectContractPreviewProps) {
  const duration = form.startsOn && form.endsOn
    ? Math.max(1, Math.round((new Date(form.endsOn).getTime() - new Date(form.startsOn).getTime()) / 86_400_000) + 1)
    : null;
  const reserves = buildCommercialReserves(form.supplytimeData);
  const emitterName = formatProjectDocumentEmitterName(emitter);
  return (
    <div className="project-offer-document">
      <header>
        <img alt="BBTM" src="/bbtm-report-logo.png" />
        <strong>OFFRE COMMERCIALE</strong>
        <span><b>{`OC-${projectCode.replace(/^P/i, '') || 'BROUILLON'}`}</b><small>{`Émise le ${compactDate(new Date().toISOString())}`}</small></span>
      </header>
      <section className="project-offer-address">
        <div><small>PROPOSITION ADRESSÉE À</small><strong>{client?.name || 'CLIENT À RENSEIGNER'}</strong><span>{client?.representedBy ? `À l’attention de ${client.representedBy}` : 'Interlocuteur à renseigner'}</span></div>
        <div><small>PROJET</small><strong>{`${projectCode} - ${form.title || 'NOUVEAU PROJET'}`}</strong><span>{COMMERCIAL_OFFER_CONTRACT_TYPE}</span></div>
      </section>
      <section className="project-offer-summary">
        <div><small>NOTRE PROPOSITION</small><p>{form.description || 'Décrivez la prestation et le dispositif opérationnel proposé.'}</p></div>
        <dl><div><dt>NAVIRE</dt><dd>{vessel?.name || '—'}</dd></div><div><dt>PÉRIODE</dt><dd>{[compactDate(form.startsOn), compactDate(form.endsOn)].filter(Boolean).join(' - ') || '—'}</dd></div>{shouldDisplayCommercialOfferRoute(form.deliveryPort, form.redeliveryPort) ? <div><dt>ROUTE</dt><dd>{[form.deliveryPort, form.redeliveryPort].filter(Boolean).join(' → ') || '—'}</dd></div> : null}</dl>
      </section>
      <div className="project-offer-columns">
        <section><h3><span>1</span>Cadre opérationnel</h3><small>Périmètre proposé</small><p>{form.operationArea || 'Zone d’opération à renseigner'}</p><dl><div><dt>TYPE DE CONTRAT</dt><dd>{COMMERCIAL_OFFER_CONTRACT_TYPE}</dd></div><div><dt>LIVRAISON</dt><dd>{[form.deliveryPort, compactDate(form.deliveryAt)].filter(Boolean).join(' - ') || '—'}</dd></div><div><dt>REDÉLIVRAISON</dt><dd>{[form.redeliveryPort, compactDate(form.redeliveryAt)].filter(Boolean).join(' - ') || '—'}</dd></div><div><dt>DURÉE FERME</dt><dd>{duration ? `${duration} jours calendaires` : '—'}</dd></div><div><dt>CARBURANT</dt><dd>{form.supplytimeData.box19_special_fuel || '—'}</dd></div></dl></section>
        <section><h3><span>2</span>Conditions commerciales</h3><dl><div><dt>Mobilisation</dt><dd>{money(form.mobilisationFee, form.feeCurrency) || '—'}</dd></div><div><dt>Démobilisation</dt><dd>{money(form.demobilisationFee, form.feeCurrency) || '—'}</dd></div><div><dt>Opération</dt><dd>{money(form.charterHire, form.hireCurrency, form.hireUnit) || '—'}</dd></div><div><dt>Extension</dt><dd>{money(form.extensionHire, form.hireCurrency, form.hireUnit) || '—'}</dd></div></dl><footer><span>FACTURATION<br /><b>{form.supplytimeData.box22_invoice_remittance || '—'}</b></span><span>PAIEMENT<br /><b>{form.supplytimeData.box23_payment || '—'}</b></span></footer></section>
      </div>
      {reserves.length > 0 ? <aside><strong>RÉSERVES COMMERCIALES</strong><span>{reserves.map((reserve) => <span key={reserve}>{reserve}</span>)}</span></aside> : null}
      <section className="project-offer-signatures">
        <div className="project-offer-owner-signature">
          <strong>Armateur</strong>
          <b>{emitterName || 'Émetteur à renseigner'}</b>
          <span>{emitter?.functionLabel || 'Fonction à renseigner'}</span>
          {emitter?.signatureUrl ? <img alt={`Signature de ${emitterName}`} src={emitter.signatureUrl} /> : <small>Signature non renseignée</small>}
        </div>
        <div className="project-offer-client-signature">
          <strong>Client</strong>
          <b>BON POUR ACCORD</b>
          <span>NOM ET QUALITÉ</span>
          <span>SIGNATURE</span>
          <span>Date ET CACHET</span>
        </div>
      </section>
    </div>
  );
}

function TowageSignature({
  className,
  date,
  name,
  signatureUrl,
}: {
  className: string;
  date?: string;
  name: string;
  signatureUrl?: string;
}) {
  return (
    <span className={`towage-overlay towage-signature ${className}`}>
      <span>{name}</span>
      {date ? <span>{date}</span> : null}
      {signatureUrl ? <img alt={`Signature de ${name}`} src={signatureUrl} /> : null}
    </span>
  );
}

function TowagePreview({ page, ...props }: ProjectContractPreviewProps & { page: number }) {
  const values = buildTowageValues(props);
  return (
    <div className="project-contract-page project-towage-page">
      <img alt={`Aperçu du contrat de remorquage, page ${page}`} src={TOWAGE_PAGE_URLS[page - 1]} />
      <span className="towage-overlay document-code">{values.documentCode}</span>
      <span className="towage-overlay project-code">{values.projectCode}</span>
      <span className="towage-overlay header-date">{values.headerDate}</span>
      {page === 1 ? (
        <>
          <span className="towage-overlay contract-date">{values.contractDate}</span>
          <span className="towage-overlay charterer">{values.charterer}</span>
          <span className="towage-overlay owner">{values.owner}</span>
          <span className="towage-overlay towed">{values.towed}</span>
          <span className="towage-overlay tug">{values.tug}</span>
          <span className="towage-overlay conditions">{values.conditions}</span>
          <span className="towage-overlay pickup">{values.pickup}</span>
          <span className="towage-overlay departure">{values.departure}</span>
          <span className="towage-overlay destination">{values.destination}</span>
          <span className="towage-overlay arrival">{values.arrival}</span>
          <span className="towage-overlay connection">{values.connection}</span>
          <span className="towage-overlay disconnection">{values.disconnection}</span>
          <span className="towage-overlay fixed-price">{values.fixedPrice}</span>
          <span className="towage-overlay optional-costs">{values.optionalCosts}</span>
          <span className="towage-overlay payment">{values.payment}</span>
          <span className="towage-overlay additional">{values.additional}</span>
          <span className="towage-overlay special">{values.special}</span>
          <TowageSignature className="charterer-signatory" name={values.chartererSignatory} />
          <TowageSignature className="owner-signatory" date={values.signatureDate} name={values.ownerSignatory} signatureUrl={values.ownerSignatureUrl} />
        </>
      ) : null}
      {page === 6 ? (
        <>
          <TowageSignature className="page-six-owner-signatory" date={values.signatureDate} name={values.ownerSignatory} signatureUrl={values.ownerSignatureUrl} />
          <TowageSignature className="page-six-charterer-signatory" name={values.chartererSignatory} />
        </>
      ) : null}
    </div>
  );
}

function BareboatSignature({
  className,
  functionLabel,
  name,
  signatureUrl,
}: {
  className: string;
  functionLabel?: string;
  name: string;
  signatureUrl?: string;
}) {
  return (
    <span className={`bareboat-overlay bareboat-signature ${className}`}>
      <span>{name}</span>
      {functionLabel ? <span>{functionLabel}</span> : null}
      {signatureUrl ? <img alt={`Signature de ${name}`} src={signatureUrl} /> : null}
    </span>
  );
}

function BareboatPreview({ page, values }: { page: number; values: ReturnType<typeof buildBareboatValues> }) {
  return (
    <div className="project-contract-page project-bareboat-page">
      <img alt={`Aperçu du contrat d’affrètement, page ${page}`} src={BAREBOAT_PAGE_URLS[page - 1]} />
      <span className="bareboat-overlay project-code">{values.projectCode}</span>
      <span className="bareboat-overlay header-date">{values.headerDate}</span>
      <span className="bareboat-overlay vessel-name">{values.vesselName}</span>
      {page === 1 ? (
        <>
          <span className="bareboat-overlay contract-date">{values.contractDate}</span>
          <span className="bareboat-overlay charterer">{values.charterer}</span>
          <span className="bareboat-overlay owner">{values.owner}</span>
          <span className="bareboat-overlay vessel-identity">{values.vesselIdentity}</span>
          <span className="bareboat-overlay vessel-details">{values.vesselDetails}</span>
          <span className="bareboat-overlay last-admin-visit">{values.lastAdminVisit}</span>
          <span className="bareboat-overlay navigation-titles">{values.navigationTitles}</span>
          <span className="bareboat-overlay delivery">{values.delivery}</span>
          <span className="bareboat-overlay mobilisation">{values.mobilisation}</span>
          <span className="bareboat-overlay redelivery">{values.redelivery}</span>
          <span className="bareboat-overlay demobilisation">{values.demobilisation}</span>
          <span className="bareboat-overlay minimum-duration">{values.minimumDuration}</span>
          <span className="bareboat-overlay extensions">{values.extensions}</span>
          <span className="bareboat-overlay charter-hire">{values.charterHire}</span>
          <span className="bareboat-overlay early-termination">{values.earlyTermination}</span>
          <span className="bareboat-overlay insured-value">{values.insuredValue}</span>
          <span className="bareboat-overlay insurance-payer">{values.insurancePayer}</span>
          <span className="bareboat-overlay applicable-law">{values.applicableLaw}</span>
          <span className="bareboat-overlay jurisdiction">{values.jurisdiction}</span>
          <BareboatSignature className="page-one-charterer-signatory" name={values.chartererSignatory} />
          <BareboatSignature className="page-one-owner-signatory" functionLabel={values.ownerSignatoryFunction} name={values.ownerSignatory} signatureUrl={values.ownerSignatureUrl} />
        </>
      ) : null}
      {page === 4 ? (
        <>
          <span className="bareboat-overlay signature-statement">{values.signatureStatement}</span>
          <BareboatSignature className="page-four-charterer-signatory" name={values.chartererSignatory} />
          <BareboatSignature className="page-four-owner-signatory" functionLabel={values.ownerSignatoryFunction} name={values.ownerSignatory} signatureUrl={values.ownerSignatureUrl} />
        </>
      ) : null}
    </div>
  );
}

function BimcoPreview({ page, values }: { page: number; values: Record<string, string> }) {
  if (page > 4) {
    return (
      <div className="project-contract-pdf-continuation">
        <FileText aria-hidden="true" size={34} />
        <strong>{`BIMCO · Partie II · page ${page - 4}`}</strong>
        <span>Les clauses et annexes reprennent sans modification le document P144 de référence.</span>
      </div>
    );
  }
  return (
    <div className="project-contract-page project-bimco-page">
      <img alt={`Aperçu BIMCO, page ${page}`} src={BIMCO_PAGE_URLS[page - 1]} />
      {BIMCO_POSITIONED_VALUES.filter((field) => field.page === page).map((field) => values[field.key] ? (
        <span
          className="bimco-overlay"
          key={field.key}
          style={{ height: `${field.height}%`, left: `${field.left}%`, top: `${field.top}%`, width: `${field.width}%` }}
        >
          {values[field.key]}
        </span>
      ) : null)}
    </div>
  );
}

export function ProjectContractPreview(props: ProjectContractPreviewProps) {
  const contractType = normalizeProjectContractType(props.form.contractType);
  const pageCount = contractType === BIMCO_CONTRACT_TYPE
    ? 29
    : contractType === TOWAGE_CONTRACT_TYPE
      ? 6
      : contractType === BAREBOAT_CONTRACT_TYPE
        ? 4
        : 1;
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [contractType]);
  const currentPage = Math.min(page, pageCount);
  const bimcoValues = useMemo(() => buildBimcoValues(props), [props]);
  const towageValues = useMemo(() => buildTowageValues(props), [props]);
  const bareboatValues = useMemo(() => buildBareboatValues(props), [props]);
  const completedBimcoFields = BIMCO_P144_FIELDS.filter((field) => bimcoValues[field.key]?.trim()).length;
  const basicCompletion = [props.form.title, props.form.clientId, props.form.primaryVesselId, props.form.deliveryAt, props.form.redeliveryAt]
    .filter(Boolean).length;
  const completion = contractType === BIMCO_CONTRACT_TYPE
    ? Math.round((completedBimcoFields / 34) * 100)
    : contractType === TOWAGE_CONTRACT_TYPE
      ? Math.round(((basicCompletion + Object.values(towageValues).filter((value) => String(value).trim()).length) / 27) * 100)
      : contractType === BAREBOAT_CONTRACT_TYPE
        ? Math.round((Object.values(bareboatValues).filter((value) => String(value).trim()).length / Object.keys(bareboatValues).length) * 100)
      : Math.round(((basicCompletion + [props.form.description, props.form.charterHire, props.form.mobilisationFee, props.form.supplytimeData.box23_payment].filter(Boolean).length) / 9) * 100);
  const safeCompletion = Math.max(0, Math.min(100, completion));
  const checklist = contractType === BIMCO_CONTRACT_TYPE
    ? BIMCO_P144_GROUPS.map((group) => ({
        complete: group.fields.every((field) => Boolean(bimcoValues[field.key]?.trim())),
        label: group.label,
      }))
    : contractType === TOWAGE_CONTRACT_TYPE
      ? [
          { label: 'Parties', complete: Boolean(props.form.clientId && props.form.ownerIdentity) },
          { label: 'Moyens nautiques', complete: Boolean(props.towedAsset?.name && props.form.primaryVesselId) },
          { label: 'Voyage & créneaux', complete: Boolean(props.form.deliveryPort && props.form.redeliveryPort && props.form.supplytimeData.departure_window && props.form.supplytimeData.connection_time && props.form.supplytimeData.disconnection_time) },
          { label: 'Prix & paiement', complete: Boolean(props.form.charterHire && props.form.supplytimeData.box23_payment) },
          { label: 'Conditions particulières', complete: Boolean(props.form.supplytimeData.special_conditions) },
          { label: 'Signatures', complete: Boolean(towageValues.ownerSignatory && towageValues.chartererSignatory) },
        ]
      : contractType === BAREBOAT_CONTRACT_TYPE
        ? [
            { label: 'Parties', complete: Boolean(props.form.clientId && props.form.ownerIdentity) },
            { label: 'Navire & titres', complete: Boolean(props.form.primaryVesselId && bareboatValues.lastAdminVisit && bareboatValues.navigationTitles) },
            { label: 'Livraison & durée', complete: Boolean(props.form.deliveryAt && props.form.redeliveryAt && bareboatValues.minimumDuration) },
            { label: 'Conditions financières', complete: Boolean(props.form.charterHire && bareboatValues.insuredValue) },
            { label: 'Loi & juridiction', complete: Boolean(bareboatValues.applicableLaw && bareboatValues.jurisdiction) },
            { label: 'Signatures', complete: Boolean(bareboatValues.ownerSignatory && bareboatValues.chartererSignatory) },
          ]
      : [
          { label: 'Identification', complete: Boolean(props.form.title && props.form.clientId) },
          { label: 'Périmètre', complete: Boolean(props.form.description && props.form.operationArea) },
          { label: 'Planning', complete: Boolean(props.form.deliveryAt && props.form.redeliveryAt) },
          { label: 'Conditions commerciales', complete: Boolean(props.form.charterHire) },
          { label: 'Validation', complete: false },
        ];

  function changePage(nextPage: number) {
    setPage(Math.max(1, Math.min(pageCount, nextPage)));
  }

  return (
    <div className="project-contract-preview-shell">
      <section className="project-document-preview" aria-label="Aperçu du document généré">
        <header>
          <strong>Aperçu du document généré</strong>
          <div>
            <button aria-label="Page précédente" disabled={currentPage === 1} onClick={() => changePage(currentPage - 1)} type="button"><ChevronLeft aria-hidden="true" size={14} /></button>
            <span>{`${currentPage} / ${pageCount}`}</span>
            <button aria-label="Page suivante" disabled={currentPage === pageCount} onClick={() => changePage(currentPage + 1)} type="button"><ChevronRight aria-hidden="true" size={14} /></button>
            <select aria-label="Zoom de l’aperçu" defaultValue="85"><option value="70">70 %</option><option value="85">85 %</option><option value="100">100 %</option></select>
            <button aria-label="Actualiser l’aperçu" type="button"><RefreshCw aria-hidden="true" size={14} /> Actualiser</button>
          </div>
        </header>
        <div className="project-document-preview-canvas">
          {contractType === COMMERCIAL_OFFER_CONTRACT_TYPE ? <OfferPreview {...props} /> : null}
          {contractType === TOWAGE_CONTRACT_TYPE ? <TowagePreview {...props} page={currentPage} /> : null}
          {contractType === BAREBOAT_CONTRACT_TYPE ? <BareboatPreview page={currentPage} values={bareboatValues} /> : null}
          {contractType === BIMCO_CONTRACT_TYPE ? <BimcoPreview page={currentPage} values={bimcoValues} /> : null}
        </div>
      </section>
      <aside className="project-contract-completeness" aria-label="Complétude du document">
        <strong>Complétude</strong>
        <div aria-label={`${safeCompletion} % complété`} className="project-contract-progress-ring" style={{ '--completion': `${safeCompletion * 3.6}deg` } as React.CSSProperties}><span>{safeCompletion} %</span></div>
        <b>Champs obligatoires</b>
        <small>{`${checklist.filter((item) => item.complete).length} / ${checklist.length} sections complétées`}</small>
        <ul>{checklist.map((item) => <li className={item.complete ? 'is-complete' : undefined} key={item.label}>{item.complete ? <CheckCircle2 aria-hidden="true" size={14} /> : <Circle aria-hidden="true" size={14} />}<span>{item.label}</span></li>)}</ul>
        <p><FileText aria-hidden="true" size={14} /> Document généré et conservé dans SeaPilot.</p>
      </aside>
    </div>
  );
}
