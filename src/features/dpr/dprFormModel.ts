export type DprStatus = 'draft' | 'submitted' | 'validated' | 'reopened';
export type IncidentCategory = 'person' | 'equipment' | 'environment';
export type IncidentLevel = 'T0' | 'T1' | 'T2';
export type CrewFunction = 'captain' | 'chief-engineer' | 'second-captain' | 'execution';
export type DprFileKind = 'pdf' | 'photo' | 'attachment';

export interface DprCrewMemberInput {
  personId: number;
  crewFunction: CrewFunction;
  rosterGroup: string;
  displayName: string;
  displayOrder: number;
}

export interface DprOtherPersonInput {
  personId: number | null;
  displayName: string;
  displayOrder: number;
}

export interface DprIncidentInput {
  category: IncidentCategory;
  level: IncidentLevel;
  notes: string;
}

export interface DprFormPayload {
  reportDate: string;
  projectId: number | null;
  unlistedProjectName: string;
  vesselId: number | null;
  description: string;
  qhseNote: string;
  metrics: {
    fuelConsumedLiters: string;
    fuelOnBoardLiters: string;
  };
  crewMembers: DprCrewMemberInput[];
  otherPeople: DprOtherPersonInput[];
  incidents: DprIncidentInput[];
  hseActions: {
    tbtPerformed: boolean;
    tbtTheme: string;
    hseVisitPerformed: boolean;
    hseAuditPerformed: boolean;
    goodPracticesCount: string;
    dangerousSituationsCount: string;
    stopWorkCount: string;
  };
  emergencyExercises: Array<{ key: string; notes: string }>;
  portCalls: Array<{
    portName: string;
    arrivalAt: string;
    departureAt: string;
    displayOrder: number;
    reasons: string[];
  }>;
  supplies: {
    fuelM3: string;
    oilLiters: string;
    waterM3: string;
  };
  wasteRecords: Array<{ key: string; quantity: string; unit: 'kg' | 'l' }>;
}

export const INCIDENT_CATEGORIES: Array<{ key: IncidentCategory; label: string }> = [
  { key: 'person', label: 'Incident sur personne' },
  { key: 'equipment', label: 'Incident sur matériel' },
  { key: 'environment', label: 'Incident - environnement' },
];

export const EMPTY_DPR_PAYLOAD: DprFormPayload = {
  reportDate: '',
  projectId: null,
  unlistedProjectName: '',
  vesselId: null,
  description: '',
  qhseNote: '',
  metrics: { fuelConsumedLiters: '', fuelOnBoardLiters: '' },
  crewMembers: [],
  otherPeople: [],
  incidents: INCIDENT_CATEGORIES.map(({ key }) => ({ category: key, level: 'T0', notes: '' })),
  hseActions: {
    tbtPerformed: false,
    tbtTheme: '',
    hseVisitPerformed: false,
    hseAuditPerformed: false,
    goodPracticesCount: '0',
    dangerousSituationsCount: '0',
    stopWorkCount: '0',
  },
  emergencyExercises: [],
  portCalls: [{ portName: '', arrivalAt: '', departureAt: '', displayOrder: 0, reasons: [] }],
  supplies: { fuelM3: '', oilLiters: '', waterM3: '' },
  wasteRecords: [
    { key: 'black-bin', quantity: '', unit: 'kg' },
    { key: 'recyclable', quantity: '', unit: 'kg' },
    { key: 'bilge-water-oil', quantity: '', unit: 'l' },
    { key: 'wastewater', quantity: '', unit: 'l' },
  ],
};

function isNegative(value: string): boolean {
  if (!value.trim()) return false;
  const number = Number(value.replace(',', '.'));
  return Number.isFinite(number) && number < 0;
}

export function validateDprPayload(payload: DprFormPayload, forSubmission = false): string[] {
  const errors: string[] = [];
  if (!payload.reportDate) errors.push('La date du DPR est obligatoire.');
  if (payload.projectId !== null && payload.unlistedProjectName.trim()) {
    errors.push('Choisissez un projet référencé ou saisissez un projet hors liste, pas les deux.');
  }
  if (payload.hseActions.tbtPerformed && !payload.hseActions.tbtTheme.trim()) {
    errors.push('Le thème du TBT est obligatoire lorsque le TBT est coché.');
  }
  if (payload.portCalls.some((call) => call.arrivalAt && call.departureAt && call.departureAt < call.arrivalAt)) {
    errors.push("L'appareillage ne peut pas précéder l'accostage.");
  }
  const numericValues = [
    payload.metrics.fuelConsumedLiters,
    payload.metrics.fuelOnBoardLiters,
    payload.hseActions.goodPracticesCount,
    payload.hseActions.dangerousSituationsCount,
    payload.hseActions.stopWorkCount,
    payload.supplies.fuelM3,
    payload.supplies.oilLiters,
    payload.supplies.waterM3,
    ...payload.wasteRecords.map((record) => record.quantity),
  ];
  if (numericValues.some(isNegative)) errors.push('Les quantités et compteurs ne peuvent pas être négatifs.');
  if (new Set(payload.crewMembers.map((member) => `${member.personId}:${member.crewFunction}`)).size !== payload.crewMembers.length) {
    errors.push("Une personne ne peut apparaître deux fois avec la même fonction.");
  }
  if (forSubmission) {
    if (payload.projectId === null && !payload.unlistedProjectName.trim()) errors.push('Le projet est obligatoire avant soumission.');
    if (payload.vesselId === null) errors.push('Le navire est obligatoire avant soumission.');
    if (!payload.description.trim()) errors.push('La description de la journée est obligatoire avant soumission.');
  }
  return errors;
}

export function numberInput(value: string): string {
  return value.trim() ? String(Number(value.replace(',', '.'))) : '';
}
