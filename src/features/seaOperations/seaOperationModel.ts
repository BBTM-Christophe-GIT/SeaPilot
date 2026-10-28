import type { SeaOperationWaypointWeather } from './seaOperationWeatherModel';
import { effectiveSeaOperationUkc, waypointRadioSnapshot, waypointUkcSnapshot, waypointWeatherSnapshot } from './seaOperationWaypointSnapshots';
import type { SeaOperationCopernicusEstimate } from './seaOperationCopernicusModel';
import { parseProjectLocationOverlay, type ProjectLocationOverlay } from '../projects/projectLocation';
import { isVesselWeatherMatrix, type VesselWeatherMatrix } from '../fleet/vesselWeatherMatrix';
import { isSeaOperationMapViewport, type SeaOperationMapViewport } from './seaOperationMapViewport';
import type { SeaOperationIsolatedPointIconName } from './seaOperationIsolatedPointIcons';

/** Digital transcription of OPE-FOR-10-C, GO / NO GO – OPÉRATION EN MER. */
export type SeaOperationAnswer = '' | 'yes' | 'no';
export type SeaOperationDecision = 'GO' | 'NO_GO';
export type SeaOperationApplicability = 'towing' | 'cargo' | 'divingSupport' | 'supplies';
export type SeaOperationPortService = 'towing' | 'pilotage' | 'mooring' | 'none';
export type SeaOperationCheckId =
  | 'vesselCondition' | 'stability' | 'provisions' | 'water' | 'fuel'
  | 'operationEquipment' | 'navigationEquipment' | 'seaClosures'
  | 'towingLimits' | 'towingPlan' | 'towingInsurance' | 'towingAuthorization'
  | 'cargoStability' | 'dangerousGoods' | 'cargoLashing' | 'divingMedicalKit'
  | 'crewCredentials' | 'crewRoles' | 'watchesAssigned' | 'standingOrders'
  | 'nauticalDocumentation' | 'navigationNotices' | 'portWorkNotices'
  | 'portRegulations' | 'berthAvailable' | 'weather';

export interface SeaOperationContact { name: string; phone: string }
export interface SeaOperationRadioContactSnapshot {
  id: string;
  kind: 'rescue' | 'port';
  name: string;
  area: string;
  vhf: string;
  phone?: string;
  mmsi?: string;
  source: string;
  sourceLabel: string;
  distanceNm: number;
}
export interface SeaOperationWaypointRadio {
  version: 1;
  latitude: number;
  longitude: number;
  capturedAt: string;
  verifiedOn: string;
  contacts: SeaOperationRadioContactSnapshot[];
}
export interface SeaOperationWaypoint {
  id: string;
  /** Visual metadata accepted only in isolated-point collections, never route waypoints. */
  isolatedPointIcon?: SeaOperationIsolatedPointIconName;
  number: string;
  descriptionVhf: string;
  latitude: string;
  longitude: string;
  ukc: string;
  /** Missing means historical/manual. The automatic estimate never overwrites ukc. */
  ukcMode?: 'manual' | 'automatic';
  ukcForecast?: SeaOperationCopernicusEstimate;
  /** The source permits a time alone when the point is reached on the same day. */
  eta: string;
  /** Missing with a nonempty ETA is historical/manual; a blank unmarked ETA can be calculated. */
  etaMode?: 'automatic' | 'manual';
  denseTraffic: boolean;
  /** Optional captures retain the information consulted for this precise point. */
  weather?: SeaOperationWaypointWeather;
  radio?: SeaOperationWaypointRadio;
}

export interface SeaOperationPayload {
  version: 1;
  /** Manual framing retained with this revision; absence means automatic framing. */
  mapViewport?: SeaOperationMapViewport;
  /** Independent editable project copy; never synchronized after selecting the mission. */
  locationOverlay?: ProjectLocationOverlay;
  /** Optional for compatibility with forms prepared before Planning integration. */
  planning?: { date: string; operationId: string; projectId: string; captainPersonId: string };
  /** Standalone transit: the selected business day identifies the real vessel/captain assignment. */
  transit?: { date: string; captainPersonId: string };
  /** An operational client chosen from the company catalogue when no project client is defined. */
  clientId?: string;
  project: string;
  client: string;
  clientContact: string;
  description: string;
  specialPersonnel: SeaOperationContact[];
  dapaq: {
    method: '' | 'nomade' | 'email' | 's_wing';
    preparedBy: '' | 'armament' | 'captain' | 'agent';
    agentName: string;
    agentContact: string;
  };
  vessel: {
    /** The vessel matrix retained at preparation, never replaced on a signed form. */
    weatherMatrix?: VesselWeatherMatrix | null;
    /** Navires draft retained with this revision, independently of later vessel changes. */
    draftMeters?: number | null;
    id: string;
    name: string;
    registrationImo: string;
    captainName: string;
    departurePort: string;
    departureQuay: string;
    arrivalPort: string;
    arrivalQuay: string;
    etd: string;
    eta: string;
  };
  applicability: Record<SeaOperationApplicability, SeaOperationAnswer>;
  checks: Record<SeaOperationCheckId, SeaOperationAnswer>;
  justifications: Record<SeaOperationCheckId, string>;
  towedVesselBoarding: {
    required: SeaOperationAnswer;
    measures: '' | 'sms' | 'specific';
    details: string;
  };
  portServices: SeaOperationPortService[];
  mandatoryServicesNotified: boolean;
  supplies: {
    delegated: SeaOperationAnswer;
    shipchandlerName: string;
    shipchandlerContact: string;
    items: string[];
    suppliers: string;
    customerAccountsPrepared: boolean;
  };
  charts: string;
  waypoints: SeaOperationWaypoint[];
  decision: '' | SeaOperationDecision;
  risks: string;
  signature: { captainName: string; date: string; place: string; acknowledged: boolean };
}

export interface SeaOperationCheck {
  id: SeaOperationCheckId;
  section: string;
  label: string;
  /** Only explicitly red negative answers in the source automatically prevent departure. */
  blocking?: boolean;
  /** A GO requires Yes; drafts and explicit NO GO may still record No. */
  yesOnly?: boolean;
  justifyNo?: boolean;
  applicability?: SeaOperationApplicability;
  help?: string;
  yesLabel?: string;
  noLabel?: string;
}

export interface SeaOperationSection { id: string; title: string; applicability?: SeaOperationApplicability }

export const SEA_OPERATION_SOURCE = { title: 'GO / NO GO – OPÉRATION EN MER', reference: 'OPE-FOR-10-C' } as const;

/** Historical form content, transcribed without extending its medical requirements. */
export const DIVING_MEDICAL_KIT = [
  { article: 'Oxygène médical', quantity: 1, detail: 'Bouteille à 200 bars d’une capacité suffisante pour atteindre ou attendre les secours. Le formulaire indique : 2 L à 200 bars, avec un débit de 15 L/min, permettent un traitement de 25 min. Robinet avec manodétendeur-débitmètre de 0 à 15 L/min et prises normalisées.' },
  { article: 'Insufflateur manuel avec réservoir à oxygène', quantity: 1, detail: 'Ballon auto-remplisseur à valve unidirectionnelle type Ambu®.' },
  { article: 'Masque facial pour insufflateur manuel, taille 5 adulte', quantity: 1, detail: 'Usage unique.' },
  { article: 'Masque à oxygène à haute concentration adulte avec tubulure', quantity: 1, detail: 'Usage unique.' },
  { article: 'Bouteille d’eau plate d’un litre', quantity: 1, detail: '' },
  { article: 'Plan de secours', quantity: 1, detail: '' },
] as const;

export const SEA_OPERATION_SECTIONS: readonly SeaOperationSection[] = [
  { id: '2.1', title: 'Préparation du navire' },
  { id: '2.2', title: 'Remorquage', applicability: 'towing' },
  { id: '2.3', title: 'Chargement de marchandise', applicability: 'cargo' },
  { id: '2.4', title: 'Navire de support de plongeur', applicability: 'divingSupport' },
  { id: '2.5', title: 'Équipage' },
  { id: '2.6', title: 'Documents nautiques' },
  { id: '2.7', title: 'Services portuaires' },
  { id: '2.8', title: 'Approvisionnement / Avitaillement', applicability: 'supplies' },
  { id: '2.9', title: 'Conditions météo' },
];

export const SEA_OPERATION_CHECKS: readonly SeaOperationCheck[] = [
  { id: 'vesselCondition', section: '2.1', label: 'État général du navire conforme à l’opération', blocking: true },
  { id: 'stability', section: '2.1', label: 'Conditions de stabilité conformes', blocking: true },
  { id: 'provisions', section: '2.1', label: 'Vivres en quantité suffisante', yesOnly: true },
  { id: 'water', section: '2.1', label: 'Eau en quantité suffisante', yesOnly: true },
  { id: 'fuel', section: '2.1', label: 'Gasoil en quantité suffisante', yesOnly: true },
  { id: 'operationEquipment', section: '2.1', label: 'Matériel, gréement, apparaux de levage ou tout autre besoin identifié pour l’opération à bord', justifyNo: true },
  { id: 'navigationEquipment', section: '2.1', label: 'Les équipements critiques pour la navigation ont été vérifiés et sont en nombre suffisant à bord', justifyNo: true },
  { id: 'seaClosures', section: '2.1', label: 'Les tapes de ventilation, ouvertures à la mer et systèmes d’obturation sont vérifiés et en position de mer', justifyNo: true },
  { id: 'towingLimits', section: '2.2', label: 'Les conditions limites de remorquage ont été définies par un expert ou une société de classification', applicability: 'towing', yesLabel: 'Oui, le Capitaine a reçu le document', help: 'Toilette de mer, certificat de partance, etc.' },
  { id: 'towingPlan', section: '2.2', label: 'Le plan de remorquage a été réalisé et communiqué à bord', applicability: 'towing' },
  { id: 'towingInsurance', section: '2.2', label: 'L’attestation d’assurance a été transmise au Capitaine', applicability: 'towing' },
  { id: 'towingAuthorization', section: '2.2', label: 'La Capitainerie a autorisé le mouvement', applicability: 'towing', justifyNo: true },
  { id: 'cargoStability', section: '2.3', label: 'Le chargement est conforme à la stabilité', applicability: 'cargo', justifyNo: true },
  { id: 'dangerousGoods', section: '2.3', label: 'La cargaison est-elle composée de matières dangereuses ?', applicability: 'cargo', yesLabel: 'Oui, les FDS sont à bord et les mesures de sécurité ont été mises en œuvre' },
  { id: 'cargoLashing', section: '2.3', label: 'Le saisissage a été vérifié', applicability: 'cargo', justifyNo: true },
  { id: 'divingMedicalKit', section: '2.4', label: 'La dotation médicale réglementaire a été augmentée du kit défini dans la division 217', applicability: 'divingSupport', blocking: true, help: 'En plus de la dotation médicale réglementaire, tout navire ayant des plongeurs professionnels à bord est équipé en permanence d’une trousse de secours plongée.' },
  { id: 'crewCredentials', section: '2.5', label: 'L’équipage est en nombre suffisant et à jour de ses brevets, certificats et visites médicales', blocking: true },
  { id: 'crewRoles', section: '2.5', label: 'L’équipage connaît la manœuvre et les rôles ont été définis', blocking: true },
  { id: 'watchesAssigned', section: '2.5', label: 'Les différents quarts ont été définis et attribués par le Capitaine', blocking: true },
  // This positive attestation is printed in red in the source; its meaning is an affirmation, not a departure prohibition.
  { id: 'standingOrders', section: '2.5', label: 'Le Capitaine atteste que tout marin réalisant un quart à la passerelle a pris connaissance des Ordres Permanents du Capitaine', yesOnly: true },
  { id: 'nauticalDocumentation', section: '2.6', label: 'La documentation nautique est à jour', blocking: true },
  { id: 'navigationNotices', section: '2.6', label: 'Les Groupes d’Avis aux Navigateurs pertinents ont été vérifiés', blocking: true },
  { id: 'portWorkNotices', section: '2.6', label: 'Les avis aux usagers détaillant les travaux dans les ports de départ et d’arrivée pouvant perturber la manœuvre ont été vérifiés', blocking: true },
  { id: 'portRegulations', section: '2.7', label: 'Le Capitaine a pris connaissance de la réglementation portuaire dans le port d’arrivée', blocking: true },
  { id: 'berthAvailable', section: '2.7', label: 'Le Capitaine s’est assuré de la disponibilité d’un poste à quai', blocking: true },
  { id: 'weather', section: '2.9', label: 'Les conditions météo sont conformes aux limites opérationnelles définies', blocking: true },
];

export const SEA_OPERATION_SUPPLY_ITEMS = [
  { id: 'spareParts', label: 'Pièces détachées', category: 'Approvisionnement' },
  { id: 'materials', label: 'Petit matériel, matériaux', category: 'Approvisionnement' },
  { id: 'filters', label: 'Filtres', category: 'Approvisionnement' },
  { id: 'tools', label: 'Outils', category: 'Approvisionnement' },
  { id: 'chemicals', label: 'Produits chimiques (peinture, etc.)', category: 'Approvisionnement' },
  { id: 'provisions', label: 'Vivres', category: 'Avitaillement' },
  { id: 'drinkingWater', label: 'Eau potable', category: 'Avitaillement' },
  { id: 'hygiene', label: 'Produits d’hygiène', category: 'Avitaillement' },
  { id: 'cleaning', label: 'Produits ménagers', category: 'Avitaillement' },
  { id: 'fuel', label: 'Carburant', category: 'Avitaillement' },
] as const;

export function emptySeaOperationWaypoint(id: string = globalThis.crypto.randomUUID()): SeaOperationWaypoint {
  return { id, number: '', descriptionVhf: '', latitude: '', longitude: '', ukc: '', eta: '', denseTraffic: false };
}

/** The operation's business day follows the same Paris calendar as Planning. */
export function seaOperationToday(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map((type) => parts.find((part) => part.type === type)!.value).join('-');
}

/** Every call creates independent objects; an unanswered control is never a positive response. */
export function emptySeaOperation(): SeaOperationPayload {
  return {
    version: 1, project: '', client: '', clientContact: '', description: '', specialPersonnel: [],
    dapaq: { method: '', preparedBy: '', agentName: '', agentContact: '' },
    vessel: { id: '', name: '', registrationImo: '', captainName: '', departurePort: '', departureQuay: '', arrivalPort: '', arrivalQuay: '', etd: '', eta: '' },
    applicability: { towing: '', cargo: '', divingSupport: '', supplies: '' },
    checks: Object.fromEntries(SEA_OPERATION_CHECKS.map(({ id }) => [id, ''])) as Record<SeaOperationCheckId, SeaOperationAnswer>,
    justifications: Object.fromEntries(SEA_OPERATION_CHECKS.map(({ id }) => [id, ''])) as Record<SeaOperationCheckId, string>,
    towedVesselBoarding: { required: '', measures: '', details: '' },
    portServices: [], mandatoryServicesNotified: false,
    supplies: { delegated: '', shipchandlerName: '', shipchandlerContact: '', items: [], suppliers: '', customerAccountsPrepared: false },
    charts: '', waypoints: [], decision: '', risks: '',
    signature: { captainName: '', date: seaOperationToday(), place: '', acknowledged: false },
  };
}

/** Requested starting answers apply only to a new mission, never to restored or signed records. */
export function newSeaOperation(): SeaOperationPayload {
  const draft = emptySeaOperation();
  for (const check of SEA_OPERATION_CHECKS) draft.checks[check.id] = 'yes';
  draft.applicability = { towing: 'no', cargo: 'no', divingSupport: 'no', supplies: 'no' };
  draft.towedVesselBoarding.required = 'yes';
  draft.supplies.delegated = 'yes';
  return draft;
}

/** Transit is a virtual choice, never a synthetic Projects row or project identifier. */
export function createTransitSeaOperation(date: string = seaOperationToday()): SeaOperationPayload {
  return { ...newSeaOperation(), project: 'Transit', transit: { date, captainPersonId: '' } };
}

/** A changed ETD does not silently change the business day used for captain permissions. */
export function seaOperationContextDate(payload: Pick<SeaOperationPayload, 'planning' | 'transit'>): string | undefined {
  return payload.transit?.date ?? payload.planning?.date;
}

export function seaOperationProjectId(payload: Pick<SeaOperationPayload, 'planning' | 'transit'>): string | undefined {
  return payload.transit ? '' : payload.planning?.projectId;
}

export function isSeaOperationCheckActive(check: SeaOperationCheck, payload: SeaOperationPayload): boolean {
  return !check.applicability || payload.applicability[check.applicability] === 'yes';
}

export function getActiveSeaOperationChecks(payload: SeaOperationPayload): SeaOperationCheck[] {
  return SEA_OPERATION_CHECKS.filter((check) => isSeaOperationCheckActive(check, payload));
}

function hasText(value: string): boolean { return value.trim().length > 0; }
function validDate(value: string): boolean { return Number.isFinite(Date.parse(value)); }
function validCalendarDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && validDate(value)
    && new Date(value).toISOString().slice(0, 10) === value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function hasStringFields(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  return isObject(value) && fields.every((field) => typeof value[field] === 'string');
}
function isAnswer(value: unknown): value is SeaOperationAnswer { return value === '' || value === 'yes' || value === 'no'; }
function isOptionalIdentifier(value: unknown): value is string {
  return typeof value === 'string' && (value === '' || /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n);
}

/** Reject malformed JSON instead of treating truthy or unknown values as confirmations. */
export function isSeaOperationPayload(value: unknown): value is SeaOperationPayload {
  if (!hasStringFields(value, ['project', 'client', 'clientContact', 'description', 'charts', 'risks']) || value.version !== 1) return false;
  if (value.mapViewport !== undefined && !isSeaOperationMapViewport(value.mapViewport)) return false;
  if (value.planning !== undefined && !hasStringFields(value.planning, ['date', 'operationId', 'projectId', 'captainPersonId'])) return false;
  if (value.transit !== undefined && (value.planning !== undefined || !hasStringFields(value.transit, ['date', 'captainPersonId'])
    || !validCalendarDate(value.transit.date as string) || Number((value.transit.date as string).slice(0, 4)) < 1000
    || !isOptionalIdentifier(value.transit.captainPersonId) || Object.keys(value.transit).length !== 2)) return false;
  if (value.clientId !== undefined && !isOptionalIdentifier(value.clientId)) return false;
  if (value.locationOverlay !== undefined) {
    try { if (!parseProjectLocationOverlay(value.locationOverlay)) return false; } catch { return false; }
  }
  if (!['', 'GO', 'NO_GO'].includes(value.decision as string)) return false;
  if (!hasStringFields(value.vessel, ['id', 'name', 'registrationImo', 'captainName', 'departurePort', 'departureQuay', 'arrivalPort', 'arrivalQuay', 'etd', 'eta'])) return false;
  if (value.vessel.weatherMatrix !== undefined && value.vessel.weatherMatrix !== null && !isVesselWeatherMatrix(value.vessel.weatherMatrix)) return false;
  if (value.vessel.draftMeters !== undefined && value.vessel.draftMeters !== null
    && (typeof value.vessel.draftMeters !== 'number' || !Number.isFinite(value.vessel.draftMeters) || value.vessel.draftMeters <= 0 || value.vessel.draftMeters > 50)) return false;
  if (!hasStringFields(value.dapaq, ['agentName', 'agentContact']) || !['', 'nomade', 'email', 's_wing'].includes(value.dapaq.method as string)
    || !['', 'armament', 'captain', 'agent'].includes(value.dapaq.preparedBy as string)) return false;
  if (!isObject(value.applicability) || !['towing', 'cargo', 'divingSupport', 'supplies'].every((key) => isAnswer(value.applicability && (value.applicability as Record<string, unknown>)[key]))) return false;
  if (!isObject(value.checks) || !SEA_OPERATION_CHECKS.every((check) => isAnswer((value.checks as Record<string, unknown>)[check.id]))) return false;
  if (!hasStringFields(value.justifications, SEA_OPERATION_CHECKS.map((check) => check.id))) return false;
  if (!Array.isArray(value.specialPersonnel) || !value.specialPersonnel.every((contact) => hasStringFields(contact, ['name', 'phone']))) return false;
  if (!hasStringFields(value.towedVesselBoarding, ['details']) || !isAnswer(value.towedVesselBoarding.required)
    || !['', 'sms', 'specific'].includes(value.towedVesselBoarding.measures as string)) return false;
  if (!Array.isArray(value.portServices) || !value.portServices.every((service) => ['towing', 'pilotage', 'mooring', 'none'].includes(service))
    || typeof value.mandatoryServicesNotified !== 'boolean') return false;
  if (!hasStringFields(value.supplies, ['shipchandlerName', 'shipchandlerContact', 'suppliers']) || !isAnswer(value.supplies.delegated)
    || typeof value.supplies.customerAccountsPrepared !== 'boolean' || !Array.isArray(value.supplies.items)
    || !value.supplies.items.every((item) => SEA_OPERATION_SUPPLY_ITEMS.some((known) => known.id === item))) return false;
  if (!hasStringFields(value.signature, ['captainName', 'date', 'place']) || typeof value.signature.acknowledged !== 'boolean') return false;
  const ukcReference = { projectId: value.transit ? '' : isObject(value.planning) ? value.planning.projectId as string : undefined,
    ...(value.transit ? { transit: { date: (value.transit as Record<string, string>).date, vesselId: value.vessel.id as string } } : {}),
    vesselId: value.vessel.id as string, draftMeters: value.vessel.draftMeters as number | null | undefined };
  const validWaypoints = Array.isArray(value.waypoints) && value.waypoints.every((point) => hasStringFields(point, ['id', 'number', 'descriptionVhf', 'latitude', 'longitude', 'ukc', 'eta']) && !Object.hasOwn(point, 'isolatedPointIcon') && typeof point.denseTraffic === 'boolean'
    && (point.etaMode === undefined || point.etaMode === 'manual' || point.etaMode === 'automatic')
    && (point.ukcMode === undefined || point.ukcMode === 'manual' || point.ukcMode === 'automatic')
    && (point.ukcForecast === undefined || point.ukcMode === 'automatic' && Boolean(waypointUkcSnapshot(point as unknown as SeaOperationWaypoint, ukcReference)))
    && (point.weather === undefined || Boolean(waypointWeatherSnapshot(point as unknown as SeaOperationWaypoint)))
    && (point.radio === undefined || Boolean(waypointRadioSnapshot(point as unknown as SeaOperationWaypoint))));
  if (!validWaypoints) return false;
  if (value.locationOverlay !== undefined) {
    const overlay = parseProjectLocationOverlay(value.locationOverlay)!;
    const identities = (value.waypoints as SeaOperationWaypoint[]).map(point => point.id);
    identities.push(...overlay.points.map(point => point.id), ...overlay.zones.map(zone => zone.id));
    if (new Set(identities).size !== identities.length) return false;
  }
  return true;
}

/**
 * Drafts may remain incomplete. GO requires a completed applicable form; NO GO may
 * record an interrupted inspection, with an identified mission, vessel, reason and captain.
 * Signed-row immutability and the actor's right to sign are enforced by the database.
 */
export function validateSeaOperation(
  payload: SeaOperationPayload,
  decision: SeaOperationDecision | 'DRAFT' = payload.decision || 'DRAFT',
): string[] {
  if (!isSeaOperationPayload(payload)) return ['Le formulaire contient des données invalides ou une version non prise en charge.'];
  const errors: string[] = [];
  const requireText = (value: string, label: string) => { if (!hasText(value)) errors.push(`${label} ${/^(Les |Le prénom et le nom )/.test(label) ? 'sont obligatoires' : 'est obligatoire'}.`); };

  for (const [value, label] of [[payload.vessel.etd, 'L’ETD'], [payload.vessel.eta, 'L’ETA']] as const) {
    if (value && !validDate(value)) errors.push(`${label} doit être une date et une heure valides.`);
  }
  if (payload.vessel.etd && payload.vessel.eta && validDate(payload.vessel.etd) && validDate(payload.vessel.eta)
    && Date.parse(payload.vessel.eta) < Date.parse(payload.vessel.etd)) errors.push('L’ETA ne peut pas précéder l’ETD.');
  if (payload.portServices.includes('none') && payload.portServices.length > 1) errors.push('L’absence de service portuaire ne peut pas être combinée avec un service.');
  if (decision === 'DRAFT') return errors;

  requireText(payload.project, 'Le projet');
  requireText(payload.vessel.id, 'Le navire');
  requireText(payload.vessel.name, 'Le nom du navire');
  requireText(payload.signature.captainName, 'Le prénom et le nom du Capitaine signataire');
  requireText(payload.signature.date, 'La date de signature');
  if (payload.signature.date && !validCalendarDate(payload.signature.date)) errors.push('La date de signature doit être valide.');
  requireText(payload.signature.place, 'Le lieu de signature');
  if (!payload.signature.acknowledged) errors.push('Le Capitaine doit confirmer sa signature et sa décision.');
  if (decision === 'NO_GO') {
    requireText(payload.risks, 'La description des risques ou du motif de NO GO à transmettre à l’Armement');
    return errors;
  }

  requireText(payload.client, 'Le client');
  requireText(payload.clientContact, 'Les coordonnées du client');
  requireText(payload.description, 'La description de l’opération');
  requireText(payload.vessel.registrationImo, 'L’immatriculation ou le numéro IMO');
  requireText(payload.vessel.captainName, 'Le Capitaine');
  requireText(payload.vessel.departurePort, 'Le port de départ');
  requireText(payload.vessel.departureQuay, 'Le quai de départ');
  requireText(payload.vessel.arrivalPort, 'Le port d’arrivée');
  requireText(payload.vessel.arrivalQuay, 'Le quai d’arrivée');
  requireText(payload.vessel.etd, 'L’ETD');
  requireText(payload.vessel.eta, 'L’ETA');
  if (!payload.dapaq.method) errors.push('Le mode de réalisation de la DAPAQ est obligatoire.');
  if (!payload.dapaq.preparedBy) errors.push('Le responsable de la DAPAQ est obligatoire.');
  if (payload.dapaq.method === 'nomade' && payload.dapaq.preparedBy === 'agent') errors.push('La DAPAQ dans NOMADE doit être préparée par l’Armement ou le Capitaine.');
  if (payload.dapaq.preparedBy === 'agent') {
    requireText(payload.dapaq.agentName, 'Le nom de l’agent consignataire');
    requireText(payload.dapaq.agentContact, 'Les coordonnées de l’agent consignataire');
  }
  payload.specialPersonnel.forEach((contact, index) => {
    requireText(contact.name, `Le nom du personnel spécial n° ${index + 1}`);
    requireText(contact.phone, `Le téléphone du personnel spécial n° ${index + 1}`);
  });
  const applicabilityLabels: Record<SeaOperationApplicability, string> = {
    towing: 'Le cas du remorquage', cargo: 'Le cas du chargement de marchandise',
    divingSupport: 'Le cas du support de plongeur', supplies: 'Le besoin d’approvisionnement / avitaillement',
  };
  (Object.keys(applicabilityLabels) as SeaOperationApplicability[]).forEach((key) => {
    if (!payload.applicability[key]) errors.push(`${applicabilityLabels[key]} doit être renseigné.`);
  });
  for (const check of getActiveSeaOperationChecks(payload)) {
    const answer = payload.checks[check.id];
    if (!answer || (check.yesOnly && answer !== 'yes')) errors.push(`À confirmer : ${check.label}.`);
    if (answer === 'no' && check.blocking) errors.push(`NO GO automatique : ${check.label}.`);
    if (answer === 'no' && check.justifyNo && !hasText(payload.justifications[check.id])) errors.push(`Une justification à transmettre à l’Armement est obligatoire : ${check.label}.`);
  }
  if (payload.applicability.towing === 'yes') {
    if (!payload.towedVesselBoarding.required) errors.push('Le besoin d’aller sur le remorqué doit être renseigné.');
    if (payload.towedVesselBoarding.required === 'yes') {
      if (!payload.towedVesselBoarding.measures) errors.push('Les mesures de sécurité sur le remorqué doivent être renseignées.');
      if (payload.towedVesselBoarding.measures === 'specific') requireText(payload.towedVesselBoarding.details, 'Le détail des mesures spécifiques sur le remorqué');
    }
  }
  if (payload.portServices.length === 0) errors.push('Les services portuaires requis ou l’absence de besoin doivent être renseignés.');
  if (payload.portServices.some((service) => service !== 'none') && !payload.mandatoryServicesNotified) errors.push('Le Capitaine doit confirmer que les services portuaires obligatoires ont été prévenus.');
  if (payload.applicability.supplies === 'yes') {
    if (!payload.supplies.delegated) errors.push('La prise en charge de l’approvisionnement / avitaillement doit être renseignée.');
    if (payload.supplies.delegated === 'yes') {
      requireText(payload.supplies.shipchandlerName, 'Le nom du shipchandler');
      requireText(payload.supplies.shipchandlerContact, 'Les coordonnées du shipchandler');
    }
    if (payload.supplies.items.length === 0) errors.push('Au moins un besoin d’approvisionnement / avitaillement doit être identifié.');
    if (payload.supplies.delegated === 'no') requireText(payload.supplies.suppliers, 'La liste des fournisseurs');
  }
  requireText(payload.charts, 'Le numéro de la ou des cartes marines');
  if (payload.waypoints.length === 0) errors.push('Le Passage Plan doit comporter au moins un point.');
  payload.waypoints.forEach((point, index) => {
    const fields = [
      [point.number, 'Le numéro'], [point.descriptionVhf, 'La description'],
      [point.latitude, 'La latitude'], [point.longitude, 'La longitude'], [effectiveSeaOperationUkc(payload, point), 'L’UKC'], [point.eta, 'L’ETA'],
    ] as const;
    for (const [value, label] of fields) requireText(value, `${label} du point n° ${index + 1}`);
    if (point.eta && !/^([01]\d|2[0-3]):[0-5]\d$/.test(point.eta) && !validDate(point.eta)) errors.push(`L’ETA du point n° ${index + 1} doit être une date et une heure valides, ou une heure au format HH:mm.`);
  });
  return errors;
}

export interface SeaOperationAssessment {
  status: 'GO' | 'NO_GO' | 'incomplete';
  activeChecks: SeaOperationCheck[];
  blockingChecks: SeaOperationCheck[];
  unansweredChecks: SeaOperationCheck[];
  missingJustifications: SeaOperationCheck[];
  completedChecks: number;
  totalChecks: number;
  validationErrors: string[];
  complete: boolean;
  canGo: boolean;
}

export function getSeaOperationAssessment(payload: SeaOperationPayload): SeaOperationAssessment {
  const activeChecks = getActiveSeaOperationChecks(payload);
  const blockingChecks = activeChecks.filter((check) => check.blocking && payload.checks[check.id] === 'no');
  const unansweredChecks = activeChecks.filter((check) => !payload.checks[check.id] || (check.yesOnly && payload.checks[check.id] !== 'yes'));
  const missingJustifications = activeChecks.filter((check) => check.justifyNo && payload.checks[check.id] === 'no' && !hasText(payload.justifications[check.id]));
  const validationErrors = validateSeaOperation(payload, 'GO');
  const complete = validationErrors.length === 0;
  return {
    status: blockingChecks.length ? 'NO_GO' : complete ? 'GO' : 'incomplete',
    activeChecks, blockingChecks, unansweredChecks, missingJustifications,
    completedChecks: activeChecks.length - unansweredChecks.length, totalChecks: activeChecks.length,
    validationErrors, complete, canGo: complete,
  };
}
