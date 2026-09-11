import { getHrEnimClassification, normalizeHrFunctionLabel } from '../humanResources/peopleQueries';
import { addPlanningDays, inclusivePlanningDayCount, isPlanningDate, todayPlanningDate } from './planningDates';
import { isSedentaryPlanningFunction, normalizePlanningText } from './planningModel';

export interface SilaePerson {
  id: number;
  firstName: string;
  lastName: string;
  employeeNumber: string;
  enimFunctionCode: string;
  enimCategory: string;
  functionLabel: string;
  gradeLabel: string;
  roleLabel: string;
  hiredOn: string;
  departedOn: string;
  active: boolean;
}

export interface SilaeSource {
  personId: number | null;
  startsOn: string;
  endsOn: string;
  status: string;
  vesselId: number | null;
  priority: number;
  functionLabel?: string;
}

export interface SilaeData {
  people: SilaePerson[];
  vessels: { id: number; name: string; registrationNumber: string }[];
  sources: SilaeSource[];
}

export interface SilaePeriod {
  startsOn: string;
  endsOn: string;
  state: 'sea' | 'rest';
  vesselId: number | null;
  registrationNumber: string;
  functionLabel: string;
  enimFunctionCode: string;
  enimCategory: string;
  seaDays: number;
  embarkedDays: number;
}

export interface SilaeEmployeeExport {
  person: SilaePerson;
  periods: SilaePeriod[];
  issues: string[];
}

export const SILAE_GROUP_COLUMNS = ['ID_Ligne', 'DtDeb', 'DtFin', 'JrsMer', 'JrsEmbarque', 'NumNavire', 'Genre', 'Fonction', 'Position', 'NbjPos15', 'ValPos15', 'Categ', 'Taux ENIM', 'NbPart', 'JrsNonExo', 'HrsNonExo'] as const;

export function silaePersonName(person: SilaePerson): string {
  return `${person.lastName.trim().toLocaleUpperCase('fr-FR')} ${person.firstName.trim()}`.trim();
}

export function isSilaeEligible(person: SilaePerson, today = todayPlanningDate()): boolean {
  const labels = `${person.functionLabel} ${person.gradeLabel} ${person.roleLabel}`;
  const normalized = normalizePlanningText(labels);
  const adam = normalizePlanningText(person.firstName) === 'ADAM' && normalizePlanningText(person.lastName) === 'DEBORDEAUX';
  // Eligibility is evaluated today, even when exporting an earlier month.
  // A recorded future departure may already have flipped the legacy active
  // flag. An inactive record without that evidence remains excluded.
  const employed = person.active || Boolean(person.hiredOn && person.departedOn >= today);
  return employed && (!person.hiredOn || person.hiredOn <= today)
    && (!person.departedOn || person.departedOn >= today)
    && !adam && !isSedentaryPlanningFunction(labels)
    && !['SEDENTAIRE', 'DIRECTION', 'YARDMANAGER'].some((key) => normalized.includes(key));
}

export function silaeMonthRange(month: string): { start: string; end: string; days: number } {
  const start = `${month}-01`;
  if (!/^\d{4}-\d{2}$/.test(month) || !isPlanningDate(start)) throw new Error('Sélectionnez un mois et une année valides.');
  const [year, number] = month.split('-').map(Number);
  const days = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return { start, end: `${month}-${days}`, days };
}

function silaeState(status: string): SilaePeriod['state'] | null {
  const key = normalizePlanningText(status);
  if (['ENMER', 'ATERRE', 'EMBARQUE', 'EMBARQUEMENT', 'TRAVAILLE'].includes(key)) return 'sea';
  if (['REPOS', 'ENREPOS', 'CONGE', 'CONGES', 'CONGEPAYE', 'CONGESPAYES', 'VACANCE', 'VACANCES', 'DEBARQUE', 'DEBARQUEMENT'].includes(key)) return 'rest';
  return null;
}

export function buildSilaeEmployee(data: SilaeData, person: SilaePerson, month: string): SilaeEmployeeExport {
  const range = silaeMonthRange(month);
  const issues = new Set<string>();
  const periods: SilaePeriod[] = [];
  const start = person.hiredOn > range.start ? person.hiredOn : range.start;
  const end = person.departedOn && person.departedOn < range.end ? person.departedOn : range.end;
  if ((person.hiredOn && !isPlanningDate(person.hiredOn)) || (person.departedOn && !isPlanningDate(person.departedOn))) {
    return { person, periods, issues: ['Date d’embauche ou de départ RH invalide.'] };
  }
  if (start > end) return { person, periods, issues: ['Aucune période d’emploi pendant le mois sélectionné.'] };
  if (!person.employeeNumber.trim()) issues.add('Matricule RH manquant.');
  if (!person.firstName.trim() || !person.lastName.trim()) issues.add('Nom ou prénom RH manquant.');
  const sources = data.sources.filter((source) => source.personId === person.id && source.startsOn <= range.end);
  const shipExists = (id: number | null) => data.vessels.some((vessel) => vessel.id === id && vessel.registrationNumber);
  // Rest retains its explicit ship, then the latest known ship, then the first
  // ship of this month. No current-board fallback: it could rewrite history.
  function restingShip(date: string): number | null {
    const previous = sources.filter((source) => source.startsOn <= date && shipExists(source.vesselId))
      .sort((a, b) => b.endsOn.localeCompare(a.endsOn) || b.priority - a.priority);
    const next = sources.filter((source) => source.startsOn >= date && source.startsOn <= range.end && shipExists(source.vesselId))
      .sort((a, b) => a.startsOn.localeCompare(b.startsOn) || b.priority - a.priority);
    const candidates = previous.length ? previous : next;
    const best = candidates[0];
    if (!best) return null;
    const boundary = previous.length ? best.endsOn : best.startsOn;
    const ids = new Set(candidates.filter((source) => (previous.length ? source.endsOn : source.startsOn) === boundary && source.priority === best.priority).map((source) => source.vesselId));
    return ids.size === 1 ? best.vesselId : null;
  }
  for (let date = start; date <= end; date = addPlanningDays(date, 1)) {
    const candidates = sources.filter((source) => source.startsOn <= date && source.endsOn >= date);
    // A dated planning function overrides the RH function only on its dates.
    // Blank / legacy Équipage values and absences carry no function override.
    const functions = candidates.filter((source) => source.functionLabel?.trim() && normalizePlanningText(source.functionLabel) !== 'EQUIPAGE');
    const functionPriority = Math.max(...functions.map((source) => source.priority));
    const labels = new Set(functions.filter((source) => source.priority === functionPriority).map((source) => normalizeHrFunctionLabel(source.functionLabel!)));
    if (labels.size > 1) {
      issues.add(`Fonctions contradictoires le ${date.split('-').reverse().join('/')}.`);
      continue;
    }
    const plannedFunction = [...labels][0];
    const functionLabel = plannedFunction || normalizeHrFunctionLabel(person.functionLabel);
    const classification = plannedFunction ? getHrEnimClassification(plannedFunction) : null;
    const enimFunctionCode = classification ? classification.functionCode : person.enimFunctionCode;
    const enimCategory = classification ? classification.category === null ? '' : String(classification.category) : person.enimCategory;
    if (plannedFunction && !enimFunctionCode) issues.add(`Code Fonction ENIM inconnu pour la fonction planifiée « ${plannedFunction} ».`);
    else if (!enimFunctionCode.trim()) issues.add('Code Fonction ENIM manquant.');
    if (!enimCategory.trim()) issues.add('Catégorie ENIM manquante.');
    const priority = Math.max(...candidates.map((source) => source.priority));
    // In SeaPilot rest is implicit outside assignments. The supplied AUGUIN
    // example explicitly covers these gaps (1–2, 11–18 and 29–31 August).
    const effective = candidates.length ? candidates.filter((source) => source.priority === priority)
      : [{ status: 'Repos', vesselId: restingShip(date) }];
    const values = effective.map((source) => ({ state: silaeState(source.status), vesselId: source.vesselId }));
    if (values.some((value) => !value.state)) {
      effective.filter((source) => !silaeState(source.status)).forEach((source) => issues.add(`Statut à préciser pour SILAE : ${source.status || 'non renseigné'}.`));
      continue;
    }
    const resolved = values.map((value) => ({ ...value, vesselId: value.state === 'rest' && !shipExists(value.vesselId) ? restingShip(date) : value.vesselId }));
    if (new Set(resolved.map((value) => `${value.state}:${value.vesselId}`)).size > 1) {
      issues.add(`Planning contradictoire le ${date.split('-').reverse().join('/')}.`);
      continue;
    }
    const { state, vesselId } = resolved[0];
    const registrationNumber = data.vessels.find((vessel) => vessel.id === vesselId)?.registrationNumber || '';
    if (!registrationNumber) issues.add('Navire ou immatriculation manquant pour une période.');
    const previous = periods.at(-1);
    if (previous && previous.state === state && previous.vesselId === vesselId && previous.functionLabel === functionLabel
      && previous.enimFunctionCode === enimFunctionCode && previous.enimCategory === enimCategory && addPlanningDays(previous.endsOn, 1) === date) {
      previous.endsOn = date;
      previous.embarkedDays += 1;
      if (state === 'sea') previous.seaDays += 1;
    } else {
      periods.push({ startsOn: date, endsOn: date, state: state!, vesselId, registrationNumber, functionLabel, enimFunctionCode, enimCategory, seaDays: state === 'sea' ? 1 : 0, embarkedDays: 1 });
    }
  }
  if (range.days === 31) {
    const rest = [...periods].reverse().find((period) => period.state === 'rest');
    if (rest) rest.embarkedDays -= 1;
    else issues.add('Mois de 31 jours sans repos : règle de retrait à préciser.');
  } else if (range.days === 28) {
    const sea = [...periods].reverse().find((period) => period.state === 'sea');
    if (sea) sea.seaDays += 2;
    else issues.add('Février sans travail : règle des 2 jours à préciser.');
  } else if (range.days === 29) {
    issues.add('Février de 29 jours : règle de normalisation à préciser.');
  }
  const coveredDays = periods.reduce((sum, period) => sum + inclusivePlanningDayCount(period.startsOn, period.endsOn), 0);
  if (coveredDays !== inclusivePlanningDayCount(start, end) && !issues.size) issues.add('Le planning ne couvre pas toute la période d’emploi.');
  return { person, periods, issues: [...issues] };
}

export function buildSilaeRows(employees: SilaeEmployeeExport[]): string[][] {
  if (!employees.length) throw new Error('Sélectionnez au moins un marin.');
  if (employees.some((employee) => employee.issues.length)) throw new Error('Corrigez les points signalés ou modifiez la sélection des marins.');
  if (employees.some((employee) => !employee.periods.length)) throw new Error('Un marin sélectionné n’a aucune période à exporter.');
  if (employees.some((employee) => !isSilaeEligible(employee.person))) throw new Error('La sélection contient un marin non éligible.');
  const numbers = employees.map(({ person }) => person.employeeNumber.trim());
  if (new Set(numbers).size !== numbers.length) throw new Error('Plusieurs marins sélectionnés ont le même matricule RH.');
  if (new Set(employees.map(({ person }) => person.id)).size !== employees.length) throw new Error('Un marin est sélectionné plusieurs fois.');
  // The supplied template has 30 groups. Extend it when 31 daily periods are
  // needed instead of truncating the sailor's month.
  const groupCount = Math.max(30, ...employees.map((employee) => employee.periods.length));
  const headers = ['Matricule', 'Salarié', ...Array.from({ length: groupCount }, (_, i) => SILAE_GROUP_COLUMNS.map((column) => `${column} ${i + 1}`)).flat()];
  const rows = employees.map(({ person, periods }) => {
    const cells = periods.flatMap((period) => [
      '', period.startsOn.split('-').reverse().join(''), period.endsOn.split('-').reverse().join(''),
      period.state === 'rest' ? '' : String(period.seaDays), String(period.embarkedDays), period.registrationNumber, '01', period.enimFunctionCode,
      period.state === 'sea' ? '00' : '57', '', '', period.enimCategory, 'COMPL07', '', '', '',
    ]);
    return [person.employeeNumber, silaePersonName(person), ...cells, ...Array<string>(headers.length - 2 - cells.length).fill('')];
  });
  return [headers, ...rows];
}
