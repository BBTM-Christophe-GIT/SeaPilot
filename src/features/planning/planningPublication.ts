import type { PlanningDateRange } from './planningModel';
import type {
  PlanningPublicationAction,
  PlanningPublicationRecord,
  PlanningPublicationStatus,
} from './planningQueries';

const STATUS_LABELS: Record<PlanningPublicationStatus, string> = {
  preparation: 'En préparation',
  pending_validation: 'À valider',
  validated: 'Validé',
  published: 'Publié',
  modified_after_publication: 'Modifié après publication',
  archived: 'Archivé',
};

export function planningPublicationStatusLabel(status: PlanningPublicationStatus): string {
  return STATUS_LABELS[status];
}

export function isPlanningPublicationLocked(publication: PlanningPublicationRecord | null): boolean {
  return Boolean(publication?.lockedAt);
}

export function planningPublicationActions(
  publication: PlanningPublicationRecord | null,
): PlanningPublicationAction[] {
  if (!publication || publication.status === 'preparation' || publication.status === 'modified_after_publication') {
    return ['submit'];
  }
  if (publication.status === 'pending_validation') return ['validate', 'reopen'];
  if (publication.status === 'validated') return ['publish', 'reopen'];
  if (publication.status === 'published') return ['reopen'];
  return [];
}

export function findPlanningPublication(
  publications: PlanningPublicationRecord[],
  range: PlanningDateRange,
  vesselId: number | null,
): PlanningPublicationRecord | null {
  const candidates = publications.filter((publication) => {
    const overlaps = publication.startsOn <= range.end && publication.endsOn >= range.start;
    const scopeMatches = vesselId === null
      ? publication.vesselId === null
      : publication.vesselId === null || publication.vesselId === vesselId;
    return overlaps && scopeMatches;
  });

  return [...candidates].sort((left, right) => {
    const lockPriority = Number(isPlanningPublicationLocked(right)) - Number(isPlanningPublicationLocked(left));
    if (lockPriority) return lockPriority;
    const exactScopePriority = Number(right.vesselId === vesselId) - Number(left.vesselId === vesselId);
    if (exactScopePriority) return exactScopePriority;
    const exactRangePriority = Number(right.startsOn === range.start && right.endsOn === range.end)
      - Number(left.startsOn === range.start && left.endsOn === range.end);
    if (exactRangePriority) return exactRangePriority;
    return right.updatedAt.localeCompare(left.updatedAt);
  })[0] || null;
}
