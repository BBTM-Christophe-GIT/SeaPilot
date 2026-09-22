import { getHrEnimClassification } from '../humanResources/peopleQueries';
import { getAllPlanningCrewEvents } from './planningModel';
import { planningEventFunctionOnDate } from './planningFunctions';
import type { PlanningOverview } from './planningQueries';
import type { SilaeData } from './planningSilae';

// Demonstration data only. The authenticated export always reads RH values
// through planningSilaeQueries and never synthesizes an employee number.
// Explicit SILAE classification overrides apply in the shared export model.
export function buildPlanningSilaePreviewData(overview: PlanningOverview): SilaeData {
  return {
    people: overview.people.map((person) => {
      const classification = getHrEnimClassification(person.functionLabel);
      return { ...person, employeeNumber: `DEMO-${person.id}`, enimFunctionCode: classification.functionCode, enimCategory: classification.category === null ? '' : String(classification.category) };
    }),
    vessels: overview.vessels.map((vessel) => ({ ...vessel, registrationNumber: vessel.registrationNumber || '' })),
    sources: getAllPlanningCrewEvents(overview)
      .filter((event) => event.kind !== 'annualReview' && event.confirmationStatus !== 'cancelled')
      .flatMap((event) => [
        { personId: event.personId, vesselId: event.vesselId, startsOn: event.startsOn, endsOn: event.endsOn, status: event.status, functionLabel: event.functionLabel, priority: event.kind === 'day' ? 3 : event.kind === 'assignment' ? 2 : 1, sourceId: event.assignmentId || undefined },
        ...[...new Set([...Object.keys(event.dailyStatuses || {}), ...Object.keys(event.dailyFunctionLabels || {})])]
          .filter((date) => date >= event.startsOn && date <= event.endsOn)
          .map((date) => ({ personId: event.personId, vesselId: event.vesselId, startsOn: date, endsOn: date,
            status: event.dailyStatuses?.[date] || event.status, functionLabel: planningEventFunctionOnDate(event, date),
            priority: 3, parentAssignmentId: event.assignmentId || undefined })),
      ]),
  };
}
