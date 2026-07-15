import { addPlanningDays } from './planningDates';
import type { PlanningOverview, PlanningPerson } from './planningQueries';

function previewPerson(
  id: number,
  firstName: string,
  lastName: string,
  functionLabel: string,
): PlanningPerson {
  return {
    id,
    firstName,
    lastName,
    functionLabel,
    gradeLabel: functionLabel,
    roleLabel: 'Marin',
    contractType: 'CDI',
    hiredOn: '2024-01-01',
    departedOn: '',
    active: true,
  };
}

export function createPlanningPreviewOverview(anchorDate: string): PlanningOverview {
  const people = [
    previewPerson(101, 'Pierre', 'LEPRETRE', 'Capitaine'),
    previewPerson(102, 'Pierre', 'HARACHE', 'Chef mecanicien'),
    previewPerson(103, 'Boris', 'BROT', 'Second capitaine'),
    previewPerson(104, 'Emilien', 'LAFFAITEUR', 'Matelot'),
    previewPerson(105, 'Alexandre', 'ROUPSARD', 'Mecanicien'),
    previewPerson(106, 'David', 'FIDELIN', 'Capitaine'),
    previewPerson(107, 'Mathieu', 'RIDARD', 'Chef mecanicien'),
    previewPerson(108, 'Nicolas', 'BOUVILLE', 'Matelot'),
    previewPerson(109, 'Adrien', 'BOIS', 'Mecanicien'),
    previewPerson(110, 'Matthieu', 'DURAND', 'Matelot'),
    previewPerson(111, 'Sophie', 'HAMEL', 'Marin disponible'),
    previewPerson(112, 'Julien', 'LECOCQ', 'Marin disponible'),
  ];
  const firstWatchStart = addPlanningDays(anchorDate, -14);
  const firstWatchEnd = addPlanningDays(anchorDate, 14);
  const secondWatchStart = addPlanningDays(anchorDate, 15);
  const secondWatchEnd = addPlanningDays(anchorDate, 43);
  const officeStart = addPlanningDays(anchorDate, -10);
  const officeEnd = addPlanningDays(anchorDate, 10);

  return {
    vessels: [
      { id: 1, name: 'GOURY', acronym: 'GY', active: true },
      { id: 2, name: 'ARMEMENT - CHERBOURG', acronym: 'ARM', active: true },
      { id: 3, name: 'NAVIRES SANS EQUIPAGE', acronym: 'VIDE', active: true },
    ],
    people,
    assignments: [
      ...[101, 102, 103, 104, 105].map((personId, index) => ({
        id: 1000 + index,
        vesselId: 1,
        vesselName: 'GOURY',
        captainPersonId: 101,
        captainName: 'Pierre LEPRETRE',
        crewPersonId: personId,
        crewName: `${people.find((person) => person.id === personId)?.firstName} ${people.find((person) => person.id === personId)?.lastName}`,
        startsOn: firstWatchStart,
        endsOn: firstWatchEnd,
        startsAt: `${firstWatchStart}T08:00:00Z`,
        endsAt: `${firstWatchEnd}T18:00:00Z`,
        assignmentRole: people.find((person) => person.id === personId)?.functionLabel || 'Équipage',
        statusLabel: 'En Mer',
        confirmationStatus: 'confirmed' as const,
        watchGroup: 'Bordée 1',
        comments: 'Embarqué',
        sourceLabel: 'preview',
      })),
      ...[106, 107, 108, 109, 110].map((personId, index) => ({
        id: 1100 + index,
        vesselId: 1,
        vesselName: 'GOURY',
        captainPersonId: 106,
        captainName: 'David FIDELIN',
        crewPersonId: personId,
        crewName: `${people.find((person) => person.id === personId)?.firstName} ${people.find((person) => person.id === personId)?.lastName}`,
        startsOn: secondWatchStart,
        endsOn: secondWatchEnd,
        startsAt: `${secondWatchStart}T08:00:00Z`,
        endsAt: `${secondWatchEnd}T18:00:00Z`,
        assignmentRole: people.find((person) => person.id === personId)?.functionLabel || 'Équipage',
        statusLabel: 'En Mer',
        confirmationStatus: 'confirmed' as const,
        watchGroup: 'Bordée 2',
        comments: 'Embarqué',
        sourceLabel: 'preview',
      })),
      {
        id: 1200,
        vesselId: 2,
        vesselName: 'ARMEMENT - CHERBOURG',
        captainPersonId: null,
        captainName: '',
        crewPersonId: 103,
        crewName: 'Boris BROT',
        startsOn: officeStart,
        endsOn: officeEnd,
        startsAt: `${officeStart}T08:00:00Z`,
        endsAt: `${officeEnd}T18:00:00Z`,
        assignmentRole: 'Opération spéciale',
        statusLabel: 'À Terre',
        confirmationStatus: 'provisional',
        watchGroup: 'Équipe bureau',
        comments: 'Opération spéciale',
        sourceLabel: 'preview',
      },
    ],
    days: [],
    periods: [],
    projects: [
      {
        id: 2001,
        title: 'AFFECTATION NAVIRE GOURY',
        startsOn: addPlanningDays(anchorDate, -14),
        endsOn: addPlanningDays(anchorDate, 43),
        description: 'Projet de démonstration de la vue flotte.',
        clientName: 'BBTM',
        primaryVesselId: 1,
        primaryVesselName: 'GOURY',
        secondaryVesselId: null,
        secondaryVesselName: '',
        eventType: 'operation',
        responsibleName: 'Christophe Admin',
        status: 'En cours',
        sourceLabel: 'preview',
      },
    ],
    certificates: [],
    hrDocuments: [],
    rules: [],
    publications: [],
    versions: [],
    history: [
      {
        id: 3001,
        entityKind: 'preview',
        entityId: 2001,
        action: 'created',
        payload: {},
        changedBy: 'preview',
        changedByName: 'Préversion SeaPilot',
        changedAt: `${anchorDate}T08:00:00Z`,
        vesselId: 1,
        startsOn: firstWatchStart,
        endsOn: secondWatchEnd,
        summary: 'Jeu de données de démonstration chargé.',
      },
    ],
    handovers: [],
    derogations: [],
    derogationHistory: [],
  };
}
