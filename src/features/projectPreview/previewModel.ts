import { extraPreviewProjects, type OperationType } from "./portfolioModel";
import type { PreviewBillingMonth } from "./previewBillingModel";

export type PreviewTab =
  | "overview"
  | "contract"
  | "operations"
  | "billing"
  | "documents"
  | "history";
export type PreviewStatus = "Non validé" | "Validé" | "Facturé";
export interface PreviewOperation {
  id: number;
  name: string;
  vessel: string;
  start: string;
  end: string;
  status: PreviewStatus;
  port: string;
  type?: OperationType;
  dailyRateOverride?: number;
}
export interface PreviewDocument {
  id: number;
  name: string;
  category: string;
  date: string;
  origin: string;
  file?: File;
}
export interface PreviewEvent {
  id: number;
  date: string;
  label: string;
  detail: string;
}
export interface PreviewBillingLine {
  id: number;
  label: string;
  quantity: number;
  price: number;
  included: boolean;
  category: string;
}
export interface PreviewProject {
  id: string;
  title: string;
  client: string;
  vessel: string;
  start: string;
  end: string;
  status: PreviewStatus;
  archived: boolean;
  contract: string;
  owner: string;
  port: string;
  dailyRate: number;
  description: string;
  operations: PreviewOperation[];
  documents: PreviewDocument[];
  events: PreviewEvent[];
  billing: PreviewBillingLine[];
  operationType?: OperationType;
  billingMonths?: Record<string, PreviewBillingMonth>;
}

export const PREVIEW_DATE = "2026-09-27";
export const PREVIEW_CONTRACTS = [
  "BIMCO / SUPPLYTIME 2017",
  "Contrat de remorquage",
  "Affrètement coque nue",
  "Affrètement à temps",
];
export const DOCUMENT_CATEGORIES = [
  "Contrat",
  "Offre commerciale",
  "Opérations",
  "Certificat",
  "Facturation",
  "Autre",
];
export const money = (value: number) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
export const dateLabel = (value: string) => {
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("fr-FR", {
        day: "numeric",
        month: "short",
      }).format(date)
    : "—";
};
export const periodLabel = (start: string, end: string) =>
  `${dateLabel(start)} – ${dateLabel(end)} ${end.slice(0, 4)}`;
export const billingTotal = (lines: PreviewBillingLine[]) =>
  lines.reduce(
    (sum, line) => sum + (line.included ? line.quantity * line.price : 0),
    0,
  );
export const missingContractFields = (project: PreviewProject) =>
  [
    !project.owner.trim() && "Armateur",
    !project.port.trim() && "Port de livraison",
  ].filter(Boolean) as string[];

export function createPreviewProjects(): PreviewProject[] {
  return [
    {
      id: "P901",
      title: "Campagne Atlantique",
      client: "Affréteur Démonstration",
      vessel: "M/V Démonstration",
      start: "2026-09-21",
      end: "2026-10-09",
      status: "Non validé",
      archived: false,
      contract: PREVIEW_CONTRACTS[0],
      owner: "",
      port: "",
      dailyRate: 18000,
      description:
        "Assistance maritime et support ROV pour une campagne en Atlantique. Deux rotations, avec mobilisation à Brest.",
      operations: [
        {
          id: 1,
          name: "Rotation 01",
          vessel: "M/V Démonstration",
          start: "2026-09-21",
          end: "2026-09-25",
          status: "Validé",
          port: "Brest",
        },
        {
          id: 2,
          name: "Rotation 02",
          vessel: "M/V Démonstration",
          start: "2026-09-28",
          end: "2026-10-09",
          status: "Non validé",
          port: "Brest",
        },
      ],
      documents: [
        {
          id: 1,
          name: "Plan de campagne v2.pdf",
          category: "Opérations",
          date: "2026-09-25",
          origin: "Ajouté au projet",
        },
        {
          id: 2,
          name: "Offre commerciale FR.pdf",
          category: "Offre commerciale",
          date: "2026-09-18",
          origin: "Émis dans SeaPilot",
        },
        {
          id: 3,
          name: "Certificat du navire.pdf",
          category: "Certificat",
          date: "2026-09-15",
          origin: "Archives historiques",
        },
        {
          id: 4,
          name: "Instructions de mobilisation.pdf",
          category: "Opérations",
          date: "2026-09-20",
          origin: "Archives historiques",
        },
      ],
      events: [
        {
          id: 3,
          date: "2026-09-25",
          label: "Document ajouté",
          detail: "Plan de campagne v2.pdf",
        },
        {
          id: 2,
          date: "2026-09-24",
          label: "Opération modifiée",
          detail: "Rotation 02 — dates mises à jour",
        },
        {
          id: 1,
          date: "2026-09-21",
          label: "Projet créé",
          detail: "Projet P901 — Campagne Atlantique",
        },
      ],
      billing: [
        {
          id: 1,
          label: "Loyer d’affrètement · journées avec DPR",
          quantity: 5,
          price: 18000,
          included: true,
          category: "Loyer",
        },
        {
          id: 2,
          label: "Mobilisation du navire",
          quantity: 1,
          price: 15000,
          included: true,
          category: "Prestation BBTM",
        },
        {
          id: 3,
          label: "Assistance technique",
          quantity: 2,
          price: 1250,
          included: true,
          category: "Prestation BBTM",
        },
        {
          id: 4,
          label: "Avitaillement · fournisseur de démonstration",
          quantity: 1,
          price: 2800,
          included: true,
          category: "Frais refacturable",
        },
      ],
    },
    {
      id: "P902",
      title: "Inspection côtière",
      operationType: "Travaux sous-marins",
      client: "Client Littoral Démonstration",
      vessel: "Support Démonstration",
      start: "2026-10-05",
      end: "2026-10-12",
      status: "Validé",
      archived: false,
      contract: PREVIEW_CONTRACTS[2],
      owner: "Armateur Démonstration",
      port: "Cherbourg",
      dailyRate: 4500,
      description:
        "Inspection des ouvrages côtiers et assistance aux équipes de plongée.",
      operations: [
        {
          id: 1,
          name: "Inspection des ouvrages",
          vessel: "Support Démonstration",
          start: "2026-10-05",
          end: "2026-10-12",
          status: "Validé",
          port: "Cherbourg",
        },
      ],
      documents: [
        {
          id: 1,
          name: "Contrat coque nue.pdf",
          category: "Contrat",
          date: "2026-09-24",
          origin: "Émis dans SeaPilot",
        },
      ],
      events: [
        {
          id: 1,
          date: "2026-09-24",
          label: "Contrat préparé",
          detail: "Affrètement coque nue — livraison à Cherbourg",
        },
      ],
      billing: [],
    },
    {
      id: "P898",
      title: "Remorquage Manche",
      client: "Chantier Démonstration",
      vessel: "Remorqueur Démonstration",
      start: "2026-08-12",
      end: "2026-08-16",
      status: "Facturé",
      archived: true,
      contract: PREVIEW_CONTRACTS[1],
      owner: "Armateur Démonstration",
      port: "Le Havre",
      dailyRate: 8000,
      description: "Remorquage d’une barge entre Le Havre et Cherbourg.",
      operations: [
        {
          id: 1,
          name: "Convoyage de la barge",
          vessel: "Remorqueur Démonstration",
          start: "2026-08-12",
          end: "2026-08-16",
          status: "Validé",
          port: "Le Havre",
        },
      ],
      documents: [
        {
          id: 1,
          name: "Contrat de remorquage.pdf",
          category: "Contrat",
          date: "2026-08-10",
          origin: "Archives historiques",
        },
      ],
      events: [
        {
          id: 1,
          date: "2026-08-31",
          label: "Projet archivé",
          detail: "Mission terminée · documents conservés",
        },
      ],
      billing: [],
    },
    ...extraPreviewProjects(),
  ];
}

export function newPreviewProject(projects: PreviewProject[]): PreviewProject {
  const id = `P${Math.max(...projects.map((project) => Number(project.id.slice(1)))) + 1}`;
  return {
    id,
    title: "",
    client: "",
    vessel: "M/V Démonstration",
    start: PREVIEW_DATE,
    end: "2026-10-09",
    status: "Non validé",
    archived: false,
    contract: PREVIEW_CONTRACTS[0],
    owner: "",
    port: "",
    dailyRate: 0,
    description: "",
    operations: [],
    documents: [],
    events: [],
    billing: [],
  };
}

export function addPreviewEvent(
  project: PreviewProject,
  label: string,
  detail: string,
): PreviewProject {
  return {
    ...project,
    events: [
      {
        id: Math.max(0, ...project.events.map((event) => event.id)) + 1,
        date: PREVIEW_DATE,
        label,
        detail,
      },
      ...project.events,
    ],
  };
}

/** Synthetic PDF only: no imports from production queries, auth or document emitters. */
export async function buildPreviewPdf(
  project: PreviewProject,
  title: string,
  lines: string[],
): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF();
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(22);
  pdf.setTextColor(11, 34, 66);
  pdf.text("SeaPilot", 20, 24);
  pdf.setFontSize(10);
  pdf.setTextColor(110);
  pdf.text("DEMONSTRATION - DOCUMENT SANS VALEUR CONTRACTUELLE", 20, 34);
  pdf.setTextColor(11, 34, 66);
  pdf.setFontSize(17);
  pdf.text(title, 20, 53);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  let y = 68;
  for (const line of [
    `${project.id} - ${project.title}`,
    `Client : ${project.client}`,
    `Navire : ${project.vessel}`,
    "",
    ...lines,
  ]) {
    const wrapped = pdf.splitTextToSize(
      line.replace(/\u202f|\u00a0/g, " "),
      165,
    ) as string[];
    for (const part of wrapped) {
      if (y > 270) {
        pdf.addPage();
        y = 22;
      }
      pdf.text(part, 20, y);
      y += 7;
    }
  }
  return pdf.output("blob");
}

export function downloadPreviewBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
