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
import type { ClientRecord, VesselRecord } from './projectQueries';
import {
  BIMCO_CONTRACT_TYPE,
  COMMERCIAL_OFFER_CONTRACT_TYPE,
  normalizeProjectContractType,
  TOWAGE_CONTRACT_TYPE,
} from './projectContractOptions';
import { BIMCO_P144_FIELDS, BIMCO_P144_GROUPS } from './projectContractModels';
import bimcoPage01Url from './assets/contract-previews/bimco-p144-page-01.png';
import bimcoPage02Url from './assets/contract-previews/bimco-p144-page-02.png';
import bimcoPage03Url from './assets/contract-previews/bimco-p144-page-03.png';
import bimcoPage04Url from './assets/contract-previews/bimco-p144-page-04.png';
import towagePage01Url from './assets/contract-previews/towage-contract-page-01.png';
import {
  buildCommercialReserves,
  formatProjectDocumentEmitterName,
  type ProjectDocumentEmitter,
} from './projectCommercialOffer';

interface ProjectContractPreviewProps {
  client?: Pick<ClientRecord, 'address' | 'city' | 'country' | 'name' | 'representedBy'>;
  emitter?: ProjectDocumentEmitter;
  form: ProjectWriteInput;
  projectCode: string;
  towedAsset: ProjectTowedAssetWriteInput | null;
  vessel?: Pick<VesselRecord, 'acronym' | 'name'>;
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

function money(value: number | null, currency = 'EUR', unit = ''): string {
  if (value === null) return '';
  const amount = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(value);
  return `${amount} ${currency === 'EUR' ? '€' : currency} HT${unit ? ` / ${unit}` : ''}`;
}

function clientIdentity(client?: ProjectContractPreviewProps['client']): string {
  if (!client) return '';
  return [client.name, client.address, [client.city, client.country].filter(Boolean).join(' ')].filter(Boolean).join('\n');
}

function towedIdentity(asset: ProjectTowedAssetWriteInput | null): string {
  if (!asset) return '';
  return [
    asset.name ? `Nom : ${asset.name}` : '',
    asset.assetType ? `Type : ${asset.assetType}` : '',
    asset.lengthOverallM !== null ? `Longueur hors tout : ${asset.lengthOverallM} m` : '',
    asset.breadthOverallM !== null ? `Largeur hors tout : ${asset.breadthOverallM} m` : '',
    asset.maxDraftM !== null ? `Tirant d’eau max : ${asset.maxDraftM} m` : '',
    asset.lightDisplacementT !== null ? `Déplacement lège : ${asset.lightDisplacementT} T` : '',
    asset.flag ? `Pavillon : ${asset.flag}` : '',
    asset.classificationSociety ? `Classification : ${asset.classificationSociety}` : '',
    asset.registrationNumber ? `N° d’enregistrement : ${asset.registrationNumber}` : '',
    asset.ownerName ? `Propriétaire : ${asset.ownerName}` : '',
  ].filter(Boolean).join('\n');
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

function buildTowageValues({ client, form, projectCode, towedAsset, vessel }: ProjectContractPreviewProps) {
  const saved = form.supplytimeData;
  return {
    projectCode,
    contractDate: longDate(form.startsOn || form.deliveryAt),
    charterer: clientIdentity(client),
    owner: form.ownerIdentity,
    towed: towedIdentity(towedAsset),
    tug: vessel?.name || '',
    conditions: saved.towed_conditions || form.description,
    pickup: form.deliveryPort,
    departure: saved.departure_window || longDate(form.deliveryAt),
    destination: form.redeliveryPort,
    arrival: saved.arrival_window || longDate(form.redeliveryAt),
    connection: saved.connection_time || '',
    disconnection: saved.disconnection_time || '',
    fixedPrice: money(form.charterHire, form.hireCurrency || form.feeCurrency),
    optionalCosts: saved.optional_costs || '',
    payment: saved.box23_payment || '',
    additional: saved.additional_charges || '',
    special: saved.special_conditions || '',
    chartererSignatory: saved.charterer_signatory || client?.representedBy || '',
    ownerSignatory: saved.owner_signatory || '',
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
        <dl><div><dt>NAVIRE</dt><dd>{vessel?.name || '—'}</dd></div><div><dt>PÉRIODE</dt><dd>{[compactDate(form.startsOn), compactDate(form.endsOn)].filter(Boolean).join(' - ') || '—'}</dd></div><div><dt>ROUTE</dt><dd>{[form.deliveryPort, form.redeliveryPort].filter(Boolean).join(' → ') || '—'}</dd></div></dl>
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

function TowagePreview(props: ProjectContractPreviewProps) {
  const values = buildTowageValues(props);
  return (
    <div className="project-contract-page project-towage-page">
      <img alt="Aperçu du contrat de remorquage" src={towagePage01Url} />
      <span className="towage-overlay project-code">{values.projectCode}</span>
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
      <span className="towage-overlay charterer-signatory">{values.chartererSignatory}</span>
      <span className="towage-overlay owner-signatory">{values.ownerSignatory}</span>
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
  const pageCount = contractType === BIMCO_CONTRACT_TYPE ? 29 : contractType === TOWAGE_CONTRACT_TYPE ? 6 : 1;
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [contractType]);
  const currentPage = Math.min(page, pageCount);
  const bimcoValues = useMemo(() => buildBimcoValues(props), [props]);
  const completedBimcoFields = BIMCO_P144_FIELDS.filter((field) => bimcoValues[field.key]?.trim()).length;
  const basicCompletion = [props.form.title, props.form.clientId, props.form.primaryVesselId, props.form.deliveryAt, props.form.redeliveryAt]
    .filter(Boolean).length;
  const completion = contractType === BIMCO_CONTRACT_TYPE
    ? Math.round((completedBimcoFields / 34) * 100)
    : contractType === TOWAGE_CONTRACT_TYPE
      ? Math.round(((basicCompletion + Object.values(buildTowageValues(props)).filter((value) => String(value).trim()).length) / 24) * 100)
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
          { label: 'Voyage & créneaux', complete: Boolean(props.form.deliveryAt && props.form.redeliveryAt && props.form.deliveryPort && props.form.redeliveryPort) },
          { label: 'Prix & paiement', complete: Boolean(props.form.charterHire && props.form.supplytimeData.box23_payment) },
          { label: 'Conditions particulières', complete: Boolean(props.form.supplytimeData.special_conditions) },
          { label: 'Signatures', complete: Boolean(props.form.supplytimeData.owner_signatory && props.form.supplytimeData.charterer_signatory) },
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
          {contractType === TOWAGE_CONTRACT_TYPE ? <TowagePreview {...props} /> : null}
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
