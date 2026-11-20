import { fleetMainFuelCapacityLiters } from './fleetFuel';
import type { FleetVessel } from './fleetQueries';

export type FleetListLanguage = 'fr' | 'en';

interface FleetListColumn {
  key: string;
  labels: Record<FleetListLanguage, string>;
  weight: number;
  value: (vessel: FleetVessel, language: FleetListLanguage) => string;
}

const numberFormats = {
  fr: new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 }),
  en: new Intl.NumberFormat('en-GB', { maximumFractionDigits: 3 }),
};

const englishVesselTypes: Readonly<Record<string, string>> = {
  'navire de charge': 'Cargo vessel',
  'navire à passagers': 'Passenger vessel',
  'navire de servitude': 'Workboat',
  'navire de travail': 'Workboat',
  'navire de pêche': 'Fishing vessel',
  remorqueur: 'Tug',
  vedette: 'Launch',
  barge: 'Barge',
  navire: 'Vessel',
};

const englishFlags: Readonly<Record<string, string>> = {
  france: 'France',
  'royaume-uni': 'United Kingdom',
  belgique: 'Belgium',
  'pays-bas': 'Netherlands',
  allemagne: 'Germany',
  espagne: 'Spain',
  italie: 'Italy',
  norvège: 'Norway',
};

function sourceText(value: string | undefined): string {
  const clean = value?.trim() ?? '';
  return /^[-–—]$/.test(clean) ? '' : clean;
}

function localizedText(value: string, language: FleetListLanguage, translations: Readonly<Record<string, string>>): string {
  const clean = sourceText(value);
  const key = clean.toLocaleLowerCase('fr');
  return language === 'en' && Object.hasOwn(translations, key) ? translations[key] : clean;
}

function numeric(value: number | null | undefined, language: FleetListLanguage, unit = ''): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? [numberFormats[language].format(value).replaceAll('\u202f', ' '), unit].filter(Boolean).join(' ')
    : '';
}

function measuredText(value: string, language: FleetListLanguage, unit: 'm' | 'GT'): string {
  const clean = sourceText(value);
  const match = clean.match(/^([0-9]+(?:[.,][0-9]+)?)\s*(m|GT|UMS)?$/i);
  if (!match || (match[2] && (match[2].toLowerCase() === 'm') !== (unit === 'm'))) return clean;
  return numeric(Number(match[1].replace(',', '.')), language, unit === 'GT' && language === 'fr' ? 'UMS' : unit);
}

function column<Key extends string>(
  key: Key,
  fr: string,
  en: string,
  weight: number,
  value: FleetListColumn['value'],
): FleetListColumn & { key: Key } {
  return { key, labels: { fr, en }, weight, value };
}

export const FLEET_LIST_COLUMNS = [
  column('typeLabel', 'Type de navire', 'Vessel type', 1.35, (vessel, language) =>
    localizedText(sourceText(vessel.typeLabel) || vessel.unitTypeLabel, language, englishVesselTypes)),
  column('flagState', 'Pavillon', 'Flag', 1, (vessel, language) => localizedText(vessel.flagState, language, englishFlags)),
  column('registrationPort', 'Port d’immatriculation', 'Port of registry', 1.25, vessel => sourceText(vessel.registrationPort)),
  column('registrationNumber', 'Immatriculation', 'Registration no.', 1.1, vessel => sourceText(vessel.registrationNumber)),
  column('imoNumber', 'N° IMO', 'IMO number', 0.9, vessel => sourceText(vessel.imoNumber)),
  column('callSign', 'Indicatif radio', 'Call sign', 0.9, vessel => sourceText(vessel.callSign)),
  column('mmsi', 'MMSI', 'MMSI', 1, vessel => sourceText(vessel.mmsi)),
  column('builtYear', 'Année de construction', 'Year built', 1, vessel => vessel.builtYear == null ? '' : String(vessel.builtYear)),
  column('classificationLabel', 'Classification', 'Classification', 1.3, vessel => sourceText(vessel.classificationLabel)),
  column('navigationCategory', 'Catégorie de navigation', 'Navigation category', 1.35, (vessel, language) => {
    const category = sourceText(vessel.navigationCategory);
    return language === 'en' ? category.replace(/^cat[ée]gorie\b/i, 'Category') : category;
  }),
  column('lengthOverall', 'Longueur hors tout', 'Length overall', 1.05, (vessel, language) => measuredText(vessel.lengthOverall, language, 'm')),
  column('beamOverallM', 'Largeur hors tout', 'Beam overall', 1.05, (vessel, language) => numeric(vessel.beamOverallM, language, 'm')),
  column('draftMeters', 'Tirant d’eau', 'Draught', 0.95, (vessel, language) => numeric(vessel.draftMeters, language, 'm')),
  column('grossTonnage', 'Jauge brute', 'Gross tonnage', 1, (vessel, language) => measuredText(vessel.grossTonnage, language, 'GT')),
  column('lightshipTonnes', 'Déplacement lège', 'Lightship displacement', 1.1, (vessel, language) => numeric(vessel.lightshipTonnes, language, 't')),
  column('deadweightTonnes', 'Port en lourd', 'Deadweight', 1, (vessel, language) => numeric(vessel.deadweightTonnes, language, 't')),
  column('mainEngine', 'Moteur principal', 'Main engine', 1.45, vessel => sourceText(vessel.mainEngine)),
  column('mainEnginePowerKw', 'Puissance moteur', 'Engine power', 1.05, (vessel, language) => numeric(vessel.mainEnginePowerKw, language, 'kW')),
  column('bowThrusterPowerKw', 'Propulseur d’étrave', 'Bow thruster', 1.1, (vessel, language) => numeric(vessel.bowThrusterPowerKw, language, 'kW')),
  column('maxSpeedKnots', 'Vitesse maximale', 'Max. speed', 1, (vessel, language) => numeric(vessel.maxSpeedKnots, language, language === 'fr' ? 'nd' : 'kn')),
  column('bollardPullTonnes', 'Traction au point fixe', 'Bollard pull', 1, (vessel, language) => numeric(vessel.bollardPullTonnes, language, 't')),
  column('fuelCapacity', 'Capacité carburant', 'Fuel capacity', 1.1, (vessel, language) => numeric(fleetMainFuelCapacityLiters(vessel), language, 'L')),
  column('safeManning', 'Effectif minimal', 'Minimum safe manning', 1.1, (vessel, language) =>
    numeric(vessel.safeManning, language) || sourceText(vessel.crewMembers)),
  column('maxPeople', 'Personnes à bord (max.)', 'Max. persons on board', 1.15, (vessel, language) => numeric(vessel.maxPeople, language)),
] as const;

export type FleetListColumnKey = typeof FLEET_LIST_COLUMNS[number]['key'];

export const DEFAULT_FLEET_LIST_COLUMNS: FleetListColumnKey[] = [
  'typeLabel', 'flagState', 'registrationNumber', 'lengthOverall', 'maxSpeedKnots', 'maxPeople',
];
