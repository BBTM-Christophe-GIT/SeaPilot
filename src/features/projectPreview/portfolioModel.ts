import { compareFleetAssets } from "../fleet/fleetDisplay";
import { PREVIEW_DATE, type PreviewProject } from "./previewModel";
import { previewDprs } from "./previewBillingModel";

export const PREVIEW_VESSELS = [
  { name: "M/V Démonstration", short: "M/V Démonstration", lengthOverall: 32 },
  {
    name: "Remorqueur Démonstration",
    short: "Remorqueur Démo",
    lengthOverall: 24,
  },
  { name: "Support Démonstration", short: "Support Démo", lengthOverall: 19 },
].sort(compareFleetAssets);
export const OPERATION_TYPES = [
  "Antipollution",
  "Affrètement coque nue",
  "Bouées & balisage",
  "Remorquage",
  "Assistance offshore",
  "Travaux sous-marins",
] as const;
export type OperationType = (typeof OPERATION_TYPES)[number];
export const OPERATION_COLORS = [
  "#1769d4",
  "#2a9e96",
  "#e8aa43",
  "#8a70c6",
  "#6294c1",
  "#d78068",
];

export function datesBetween(start: string, end: string): string[] {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(start) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(end) ||
    end < start
  )
    return [];
  const first = new Date(`${start}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);
  if (!Number.isFinite(first.getTime()) || !Number.isFinite(last.getTime()))
    return [];
  const result: string[] = [];
  for (
    let date = first.getTime();
    date <= last.getTime() && result.length < 3660;
    date += 86400000
  )
    result.push(new Date(date).toISOString().slice(0, 10));
  return result;
}
export function monthRange(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) return { start: "", end: "" };
  const [year, part] = month.split("-").map(Number);
  if (part < 1 || part > 12) return { start: "", end: "" };
  return {
    start: `${month}-01`,
    end: new Date(Date.UTC(year, part, 0)).toISOString().slice(0, 10),
  };
}
export function projectPhase(project: PreviewProject, today = PREVIEW_DATE) {
  return project.start > today
    ? "À venir"
    : project.end < today
      ? "Terminé"
      : "En cours";
}
export function projectOperationType(project: PreviewProject): OperationType {
  return (
    project.operationType ||
    (project.contract.includes("coque nue")
      ? "Affrètement coque nue"
      : project.contract.includes("remorquage")
        ? "Remorquage"
        : "Assistance offshore")
  );
}

/** A vessel-day is counted once even when two projects overlap; archives retain their contribution. */
export function buildPortfolioMetrics(
  projects: PreviewProject[],
  start: string,
  end: string,
  vesselFilter = "",
) {
  const calendarDays = datesBetween(start, end).length;
  const elapsedDays = datesBetween(
    start,
    end < PREVIEW_DATE ? end : PREVIEW_DATE,
  ).length;
  const dprs = projects.flatMap(previewDprs);
  const vessels = PREVIEW_VESSELS.filter(
    (vessel) => !vesselFilter || vessel.name === vesselFilter,
  ).map((vessel) => {
    const occupied = new Set<string>();
    for (const project of projects)
      for (const operation of project.operations) {
        if (operation.vessel !== vessel.name) continue;
        for (const day of datesBetween(
          operation.start > start ? operation.start : start,
          operation.end < end ? operation.end : end,
        ))
          occupied.add(day);
      }
    const realized = new Set(
      dprs
        .filter(
          (dpr) =>
            dpr.vessel === vessel.name && dpr.date >= start && dpr.date <= end,
        )
        .map((dpr) => dpr.date),
    );
    return {
      ...vessel,
      days: occupied.size,
      available: calendarDays,
      rate: calendarDays ? Math.round((occupied.size / calendarDays) * 100) : 0,
      realizedDays: realized.size,
      elapsedDays,
      realizedRate: elapsedDays
        ? Math.round((realized.size / elapsedDays) * 100)
        : null,
    };
  });
  const types = OPERATION_TYPES.map((name, index) => ({
    name,
    count: 0,
    fill: OPERATION_COLORS[index],
  }));
  for (const project of projects)
    for (const operation of project.operations) {
      if (
        operation.start > end ||
        operation.end < start ||
        (vesselFilter && operation.vessel !== vesselFilter)
      )
        continue;
      const item = types.find(
        (type) =>
          type.name === (operation.type || projectOperationType(project)),
      );
      if (item) item.count++;
    }
  const operationCount = types.reduce((sum, type) => sum + type.count, 0);
  return {
    vessels,
    calendarDays,
    operationCount,
    types: types.map((type) => ({
      ...type,
      share: operationCount
        ? Math.round((type.count / operationCount) * 100)
        : 0,
    })),
  };
}

export function extraPreviewProjects(): PreviewProject[] {
  return [
    [
      "P903",
      "Pose de bouées · rade de Brest",
      "Bouées & balisage",
      "Support Démonstration",
      "2026-09-12",
      "2026-09-18",
      4200,
    ],
    [
      "P904",
      "Veille antipollution",
      "Antipollution",
      "M/V Démonstration",
      "2026-09-01",
      "2026-09-15",
      12000,
    ],
    [
      "P905",
      "Mise à disposition côtière",
      "Affrètement coque nue",
      "Support Démonstration",
      "2026-09-21",
      "2026-10-04",
      4500,
    ],
    [
      "P906",
      "Convoyage · Manche Ouest",
      "Remorquage",
      "Remorqueur Démonstration",
      "2026-09-20",
      "2026-09-29",
      8000,
    ],
  ].map(([id, title, type, vessel, start, end, rate], index) => ({
    id: String(id),
    title: String(title),
    operationType: type as OperationType,
    client: [
      "Port Démonstration",
      "Énergie Marine Démo",
      "Client Littoral Démonstration",
      "Chantier Démonstration",
    ][index],
    vessel: String(vessel),
    start: String(start),
    end: String(end),
    status: "Validé",
    archived: false,
    contract:
      type === "Affrètement coque nue"
        ? "Affrètement coque nue"
        : type === "Remorquage"
          ? "Contrat de remorquage"
          : "BIMCO / SUPPLYTIME 2017",
    owner: "Armateur Démonstration",
    port: "Brest",
    dailyRate: Number(rate),
    description: `Mission de démonstration : ${String(type).toLocaleLowerCase("fr")}.`,
    operations: [
      {
        id: 1,
        name: String(title),
        type: type as OperationType,
        vessel: String(vessel),
        start: String(start),
        end: String(end),
        status: "Validé",
        port: "Brest",
      },
    ],
    documents: [],
    events: [
      {
        id: 1,
        date: String(start),
        label: "Projet créé",
        detail: String(title),
      },
    ],
    billing: [],
  }));
}
