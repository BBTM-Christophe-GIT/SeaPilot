import { fleetMainFuelCapacityLiters } from './fleetFuel';
import type { FleetVessel } from './fleetQueries';

export type FleetBrochureLanguage = 'fr' | 'en';
export type FleetFieldLabel = { id: string; label: string; labelEn?: string };
export type FleetLayout = Array<FleetFieldLabel & { fields: FleetFieldLabel[] }>;
export type FleetBrochureCoverSettings = {
  fr?: { missionsTitle?: string };
  en?: {
    missionsTitle?: string;
    subtitle?: string;
    summary?: string;
    operations?: string[];
    fieldValues?: Record<string, string>;
  };
};

type FieldValue = string | number | null | undefined;
type FieldDefinition = FleetFieldLabel & {
  value: (vessel: FleetVessel, language: FleetBrochureLanguage) => FieldValue;
  wide: boolean;
  brochure: boolean;
};

export type FleetLayoutField = FleetFieldLabel & Pick<FieldDefinition, 'wide' | 'brochure'> & { value: FieldValue };
export type FleetLayoutSection = FleetFieldLabel & { fields: FleetLayoutField[] };

export function hasFleetFieldValue(value: FieldValue): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  const text = value?.trim();
  return Boolean(text && text !== '—' && text !== '-');
}

function unit(value: FieldValue, suffix: string, language: FleetBrochureLanguage): string | null {
  if (!hasFleetFieldValue(value)) return null;
  const number = typeof value === 'number' ? new Intl.NumberFormat(language, { useGrouping: false, maximumFractionDigits: 4 }).format(value) : value;
  return `${number} ${suffix}`;
}

function field(id: string, label: string, labelEn: string, value: FieldDefinition['value'], { wide = false, brochure = true } = {}): FieldDefinition {
  return { id, label, labelEn, value, wide, brochure };
}

const internal = { brochure: false };
const wide = { wide: true };
const categories = [
  {
    id: 'identity', label: 'Identification maritime', labelEn: 'Vessel identification', fields: [
      field('assetType', 'Type d’actif', 'Asset type', () => 'Navire', internal),
      field('unitTypeLabel', 'Type source', 'Source type', v => v.unitTypeLabel, internal),
      field('registrationNumber', 'Immatriculation', 'Registration number', v => v.registrationNumber),
      field('imoNumber', 'Numéro IMO', 'IMO number', v => v.imoNumber),
      field('registrationPort', 'Port d’immatriculation', 'Port of registry', v => v.registrationPort),
      field('callSign', 'Indicatif d’appel', 'Call sign', v => v.callSign),
      field('mmsi', 'MMSI', 'MMSI', v => v.mmsi),
      field('flagState', 'Pavillon', 'Flag', (v, language) => language === 'en' && v.flagState === 'France' ? 'French' : v.flagState),
      field('acronym', 'Acronyme', 'Acronym', v => v.acronym, internal),
    ],
  },
  {
    id: 'dimensions', label: 'Dimensions et tonnage', labelEn: 'Dimensions and tonnage', fields: [
      field('lengthOverall', 'Longueur hors tout', 'Length overall', (v, language) =>
        v.lengthOverall?.replace(/(\d)[.,](?=\d)/g, (_, digit: string) => digit + (language === 'fr' ? ',' : '.'))),
      field('beamOverallM', 'Largeur hors tout', 'Beam overall', (v, l) => unit(v.beamOverallM, 'm', l)),
      field('draftMeters', 'Tirant d’eau', 'Draught', (v, l) => unit(v.draftMeters, 'm', l)),
      field('grossTonnage', 'Jauge brute', 'Gross tonnage', (v, l) => unit(v.grossTonnage, l === 'fr' ? 'UMS' : 'GT', l)),
      field('netTonnage', 'Jauge nette', 'Net tonnage', v => v.netTonnage),
      field('summerFreeboardMm', 'Hauteur du Franc Bord - Été', 'Summer freeboard', (v, l) => unit(v.summerFreeboardMm, 'mm', l)),
      field('deadweightTonnes', 'Port en lourd', 'Deadweight', (v, l) => unit(v.deadweightTonnes, 't', l)),
      field('lightshipTonnes', 'Déplacement lège', 'Lightship displacement', (v, l) => unit(v.lightshipTonnes, 't', l)),
      field('builtYear', 'Année de construction', 'Year built', v => v.builtYear),
    ],
  },
  {
    id: 'propulsion', label: 'Propulsion et performances', labelEn: 'Propulsion and performance', fields: [
      field('mainEnginePowerKw', 'Puissance moteur', 'Engine power', (v, l) => unit(v.mainEnginePowerKw, 'kW', l)),
      field('bowThrusterPowerKw', 'Propulseur d’étrave', 'Bow thruster', (v, l) => unit(v.bowThrusterPowerKw, 'kW', l)),
      field('maxSpeedKnots', 'Vitesse maximale', 'Maximum speed', (v, l) => unit(v.maxSpeedKnots, l === 'fr' ? 'nœuds' : 'knots', l)),
      field('bollardPullTonnes', 'Traction', 'Bollard pull', (v, l) => unit(v.bollardPullTonnes, 't', l)),
      field('mainEngine', 'Moteur principal', 'Main engine', v => v.mainEngine),
      field('gensets', 'Groupes électrogènes', 'Generator sets', v => v.gensets),
      field('rangeDescription', 'Autonomie', 'Endurance', v => v.rangeDescription, wide),
    ],
  },
  {
    id: 'navigation', label: 'Navigation et conformité', labelEn: 'Navigation and compliance', fields: [
      field('classificationLabel', 'Classification', 'Classification', v => v.classificationLabel),
      field('navigationCategory', 'Navigation', 'Navigation category', v => v.navigationCategory),
      field('liabilityInsurer', 'Assureur RC (P&I)', 'P&I insurer', v => v.liabilityInsurer, { ...wide, ...internal }),
    ],
  },
  {
    id: 'crew', label: 'Équipage et sécurité', labelEn: 'Crew and safety', fields: [
      field('maxPeople', 'Capacité maximale', 'Maximum persons on board', v => v.maxPeople),
      field('safeManning', 'Effectif minimal', 'Minimum safe manning', v => v.safeManning ?? v.crewMembers),
      field('medicalDotation', 'Dotation médicale', 'Medical supplies', v => v.medicalDotation, internal),
      field('medicalEmergencyBag', "Sac Médical d'Urgence", 'Emergency medical bag', v => v.medicalEmergencyBag ? 'Oui' : 'Non', internal),
    ],
  },
  {
    id: 'equipment', label: 'Équipements et emménagements', labelEn: 'Equipment and accommodation', fields: [
      field('deckEquipment', 'Équipements de pont', 'Deck equipment', v => v.deckEquipment, wide),
      field('electronicsCommunications', 'Navigation & communications', 'Navigation and communications', v => v.electronicsCommunications, wide),
      field('accommodation', 'Emménagements', 'Accommodation', v => v.accommodation, wide),
    ],
  },
  {
    id: 'capacities', label: 'Capacités', labelEn: 'Capacities', fields: [
      field('fuelCapacity', 'Carburant', 'Fuel', (v, l) => unit(fleetMainFuelCapacityLiters(v), 'L', l), wide),
      field('otherCapacities', 'Autres capacités', 'Other capacities', (v, l) =>
        v.capacitySections?.flatMap(section => section.tanks.map(tank =>
          `${section.name} · ${tank.name} : ${unit(tank.capacityLiters, 'L', l)}`,
        )).join('\n'), wide),
    ],
  },
];

export const DEFAULT_FLEET_LAYOUT: FleetLayout = categories.map(({ id, label, labelEn, fields }) => ({
  id, label, labelEn, fields: fields.map(({ id: fieldId, label: fieldLabel, labelEn: fieldLabelEn }) => ({
    id: fieldId, label: fieldLabel, labelEn: fieldLabelEn,
  })),
}));

const fieldsById = new Map(categories.flatMap(category => category.fields).map(entry => [entry.id, entry]));
const categoriesById = new Map(DEFAULT_FLEET_LAYOUT.map(entry => [entry.id, entry]));

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function labelValue(value: unknown, max = 100): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function normalizeFleetLayout(raw: unknown): FleetLayout {
  if (!Array.isArray(raw)) return DEFAULT_FLEET_LAYOUT;
  const result: FleetLayout = [];
  const usedCategories = new Set<string>();
  const usedFields = new Set<string>();

  for (const rawCategory of raw) {
    const parsed = record(rawCategory);
    const definition = categoriesById.get(String(parsed?.id));
    if (!definition || usedCategories.has(definition.id)) continue;
    usedCategories.add(definition.id);
    const entries: FleetFieldLabel[] = [];
    for (const rawField of Array.isArray(parsed?.fields) ? parsed.fields : []) {
      const parsedField = record(rawField);
      const defaultField = fieldsById.get(String(parsedField?.id));
      if (!defaultField || usedFields.has(defaultField.id)) continue;
      usedFields.add(defaultField.id);
      entries.push({ id: defaultField.id, label: labelValue(parsedField?.label) || defaultField.label,
        ...(labelValue(parsedField?.labelEn) ? { labelEn: labelValue(parsedField?.labelEn) } : {}),
      });
    }
    result.push({ id: definition.id, label: labelValue(parsed?.label) || definition.label,
      ...(labelValue(parsed?.labelEn) ? { labelEn: labelValue(parsed?.labelEn) } : {}), fields: entries,
    });
  }

  for (const definition of DEFAULT_FLEET_LAYOUT) {
    const missing = definition.fields.filter(entry => !usedFields.has(entry.id));
    const existing = result.find(entry => entry.id === definition.id);
    if (existing) existing.fields.push(...missing);
    else result.push({ ...definition, fields: missing });
  }
  return result;
}

export function getFleetLayoutSections(
  vessel: FleetVessel, layout: FleetLayout = DEFAULT_FLEET_LAYOUT, language: FleetBrochureLanguage = 'fr',
): FleetLayoutSection[] {
  return layout.map(section => ({
    ...section,
    label: language === 'en' ? section.labelEn || categoriesById.get(section.id)?.labelEn || section.label : section.label,
    fields: section.fields.flatMap(entry => {
      const definition = fieldsById.get(entry.id);
      if (!definition) return [];
      const override = language === 'en' ? vessel.brochureCover?.en?.fieldValues?.[entry.id] : undefined;
      return [{
        ...entry, label: language === 'en' ? entry.labelEn || definition.labelEn || entry.label : entry.label,
        value: override || definition.value(vessel, language), wide: definition.wide, brochure: definition.brochure,
      }];
    }),
  }));
}

export function hasValidEnglishBrochureMissions(operations: string[] = []): boolean {
  const filled = operations.map(operation => operation.trim()).filter(Boolean);
  return filled.length <= 24 && filled.every(operation => operation.length <= 100);
}

export function normalizeFleetBrochureCover(input: unknown): FleetBrochureCoverSettings {
  const parsed = record(input);
  const fr = record(parsed?.fr);
  const en = record(parsed?.en);
  const frTitle = labelValue(fr?.missionsTitle);
  const englishText = {
    subtitle: labelValue(en?.subtitle),
    summary: labelValue(en?.summary, 500),
    missionsTitle: labelValue(en?.missionsTitle),
  };
  const operations = Array.isArray(en?.operations) ? en.operations.map(value => labelValue(value)).filter(Boolean).slice(0, 24) : [];
  const fieldValues = Object.fromEntries(Object.entries(record(en?.fieldValues) ?? {}).flatMap(([id, value]) => {
    const cleaned = labelValue(value, 6000);
    return fieldsById.has(id) && cleaned ? [[id, cleaned]] : [];
  }));
  const translation = {
    ...Object.fromEntries(Object.entries(englishText).filter(([, value]) => value)),
    ...(operations.length ? { operations } : {}),
    ...(Object.keys(fieldValues).length ? { fieldValues } : {}),
  };
  return { ...(frTitle ? { fr: { missionsTitle: frTitle } } : {}), ...(Object.keys(translation).length ? { en: translation } : {}) };
}

const englishDefaults: Record<string, { subtitle: string; summary: string; operations: string[] }> = {
  GOURY: {
    subtitle: 'Offshore surveillance and support vessel',
    summary: 'Support for your offshore works and subsea operations.',
    operations: ['Area surveillance', 'Offshore assistance', 'ROV support', 'Equipment transport'],
  },
  'HIRONDELLE DE LA MANCHE': {
    subtitle: 'Crew transfer vessel',
    summary: 'Connecting the port and your work sites in the English Channel.',
    operations: ['Crew transfer', 'Survey support', 'Diving support', 'Area surveillance'],
  },
};

export function getFleetBrochureCover(vessel: FleetVessel, language: FleetBrochureLanguage = 'fr') {
  if (language === 'en') {
    const override = vessel.brochureCover?.en;
    const fallback = englishDefaults[vessel.name.trim().toUpperCase()];
    return {
      subtitle: override?.subtitle || fallback?.subtitle || 'Work vessel',
      summary: override?.summary || fallback?.summary || '',
      missionsTitle: override?.missionsTitle || 'Missions',
      operations: override?.operations?.length ? override.operations : fallback?.operations || [],
    };
  }
  return {
    subtitle: vessel.brochureSubtitle || vessel.typeLabel || 'Navire',
    summary: vessel.brochureSummary || '',
    missionsTitle: vessel.brochureCover?.fr?.missionsTitle || 'Missions',
    operations: vessel.brochureOperations ?? [],
  };
}
