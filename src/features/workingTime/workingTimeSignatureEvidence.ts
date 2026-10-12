import type { WorkingTimeValidationEvent, WorkingTimeWorkspaceRegister } from './workingTimeQueries';

export function workingTimeCurrentValidationEvents(
  events: WorkingTimeValidationEvent[],
  registerId: number,
): WorkingTimeValidationEvent[] {
  const ordered = events.filter((event) => event.registerId === registerId)
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt) || right.id - left.id);
  const reopeningIndex = ordered.findIndex((event) => event.eventType === 'reopened' || event.newStatus === 'reopened');
  return reopeningIndex < 0 ? ordered : ordered.slice(0, reopeningIndex);
}

export function workingTimeRegisterSignatureSnapshots(
  register: WorkingTimeWorkspaceRegister,
  currentEvents: WorkingTimeValidationEvent[],
) {
  return {
    subject: register.status === 'submitted' || register.status === 'validated'
      ? currentEvents.find((event) => event.eventType === 'sailor_signed')?.signatureSnapshot || null
      : null,
    approver: register.status === 'validated'
      ? currentEvents.find((event) => event.eventType === 'captain_validated')?.signatureSnapshot || null
      : null,
  };
}
