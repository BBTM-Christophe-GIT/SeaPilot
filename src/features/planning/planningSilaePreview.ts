import { getHrEnimClassification } from '../humanResources/peopleQueries';
import { getAllPlanningCrewEvents } from './planningModel';
import type { PlanningOverview } from './planningQueries';
import type { SilaeData } from './planningSilae';

// Demonstration data only. The authenticated export always reads RH values
// through planningSilaeQueries and never synthesizes an employee number/code.
export function buildPlanningSilaePreviewData(overview: PlanningOverview): SilaeData {
  return {
    people: overview.people.map((person) => {
      const classification = getHrEnimClassification(person.functionLabel);
      return { ...person, employeeNumber: `DEMO-${person.id}`, enimFunctionCode: classification.functionCode, enimCategory: classification.category === null ? '' : String(classification.category) };
    }),
    vessels: overview.vessels.map((vessel) => ({ ...vessel, registrationNumber: vessel.registrationNumber || '' })),
    sources: getAllPlanningCrewEvents(overview)
      .filter((event) => event.kind !== 'annualReview' && event.confirmationStatus !== 'cancelled')
      .map((event) => ({ personId: event.personId, vesselId: event.vesselId, startsOn: event.startsOn, endsOn: event.endsOn, status: event.status, priority: event.kind === 'day' ? 3 : event.kind === 'assignment' ? 2 : 1 })),
  };
}
