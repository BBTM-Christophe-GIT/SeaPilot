import {
  buildPreviewPdf,
  PREVIEW_DATE,
  type PreviewDocument,
  type PreviewProject,
} from "./previewModel";
import { datesBetween, monthRange } from "./portfolioModel";

export type HireMode = "operation" | "standby" | "weather";
export interface PreviewDpr {
  id: string;
  date: string;
  vessel: string;
  mode: HireMode;
  amount: number | null;
  arrival: string;
  departure: string;
  fuelLiters: number;
}
export interface PreviewExpense {
  id: number;
  supplier: string;
  specialties: string;
  invoiceDate: string;
  invoiceNumber: string;
  amountHt: number;
  amountTtc: number | null;
  currency: string;
  quantity: number | null;
  unit: string;
  comments: string;
  dprId: string;
  included: boolean;
  attachments: PreviewDocument[];
}
export interface PreviewService {
  id: number;
  category: string;
  description: string;
  price: number;
  quantity: number;
  included: boolean;
}
export interface PreviewBillingMonth {
  month: string;
  saved: boolean;
  clientReference: string;
  invoiceNumber: string;
  invoiceIssuedOn: string;
  invoiceSentOn: string;
  paymentDueOn: string;
  paidOn: string;
  comments: string;
  periodMode: "month" | "custom";
  start: string;
  end: string;
  vessel: string;
  completeMissing: boolean;
  includeHire: boolean;
  includeExpenses: boolean;
  includeServices: boolean;
  excludedDays: string[];
  rates: { operation: number; standby: number; weather: number };
  expenses: PreviewExpense[];
  services: PreviewService[];
}
export const SERVICE_CATALOG = [
  {
    category: "Mobilisation du navire",
    description: "Préparation et mobilisation pour la mission.",
    price: 15000,
  },
  {
    category: "Spread antipollution",
    description: "Mise à disposition des équipements antipollution.",
    price: 850,
  },
  {
    category: "Assistance technique",
    description: "Intervention de l’équipe technique.",
    price: 1250,
  },
  {
    category: "Démobilisation",
    description: "Retour et remise en configuration.",
    price: 7000,
  },
];
export const HIRE_LABELS: Record<HireMode, string> = {
  operation: "24/24 Operation",
  standby: "Stand-by",
  weather: "Stand-by météo",
};
export function currencyAmount(value: number, currency = "EUR") {
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

/** Stable fictitious DPRs. Future days and selected gaps intentionally have no report. */
export function previewDprs(project: PreviewProject): PreviewDpr[] {
  const records = new Map<string, PreviewDpr>();
  project.operations.forEach((operation) => {
    datesBetween(operation.start, operation.end).forEach((date, index) => {
      if (date > PREVIEW_DATE || index % 5 === 4) return;
      const id = `${project.id}:${operation.vessel}:${date}`;
      records.set(id, {
        id,
        date,
        vessel: operation.vessel,
        mode:
          index % 7 === 3
            ? "weather"
            : index % 7 === 2
              ? "standby"
              : "operation",
        amount: null,
        arrival: "06:00",
        departure: "18:00",
        fuelLiters: 750 + index * 35,
      });
    });
  });
  return [...records.values()].sort((a, b) => a.date.localeCompare(b.date));
}
export function createBillingMonth(
  project: PreviewProject,
  month: string,
): PreviewBillingMonth {
  const range = monthRange(month);
  const sample = project.id === "P901" && month === "2026-09";
  return {
    month,
    saved: sample || project.archived,
    clientReference: sample ? "CMD-DEMO-2026-091" : "",
    invoiceNumber: "",
    invoiceIssuedOn: "",
    invoiceSentOn: "",
    paymentDueOn: "",
    paidOn: "",
    comments: "",
    periodMode: "month",
    ...range,
    vessel: "",
    completeMissing: false,
    includeHire: true,
    includeExpenses: true,
    includeServices: true,
    excludedDays: [],
    rates: {
      operation: project.dailyRate,
      standby: project.dailyRate * 0.75,
      weather: project.dailyRate * 0.5,
    },
    services: sample
      ? [
          { id: 1, ...SERVICE_CATALOG[0], quantity: 1, included: true },
          { id: 2, ...SERVICE_CATALOG[2], quantity: 2, included: true },
        ]
      : [],
    expenses: sample
      ? [
          {
            id: 1,
            supplier: "Avitaillement Atlantique Démo",
            specialties: "Carburant",
            invoiceDate: "2026-09-23",
            invoiceNumber: "FA-2026-0912",
            amountHt: 2800,
            amountTtc: 3360,
            currency: "EUR",
            quantity: 2000,
            unit: "L",
            comments: "Avitaillement pendant la première rotation.",
            dprId: "",
            included: true,
            attachments: [
              {
                id: 90101,
                name: "Facture avitaillement DEMO.pdf",
                category: "Facturation",
                date: "2026-09-23",
                origin: "Justificatif fournisseur · démonstration",
              },
            ],
          },
          {
            id: 2,
            supplier: "Port Démonstration",
            specialties: "Frais portuaires",
            invoiceDate: "2026-09-25",
            invoiceNumber: "PORT-256",
            amountHt: 450,
            amountTtc: 540,
            currency: "EUR",
            quantity: 1,
            unit: "Unité",
            comments: "",
            dprId: "",
            included: true,
            attachments: [],
          },
        ]
      : [],
  };
}
export function getBillingMonth(project: PreviewProject, month: string) {
  return project.billingMonths?.[month] || createBillingMonth(project, month);
}
export function billingRange(period: PreviewBillingMonth) {
  return period.periodMode === "month"
    ? monthRange(period.month)
    : { start: period.start, end: period.end };
}
export interface PreviewHireRow {
  key: string;
  date: string;
  vessel: string;
  mode: HireMode;
  amount: number;
  origin: string;
  missing: boolean;
  future: boolean;
  included: boolean;
  report?: PreviewDpr;
}

export function buildBillingSummary(
  project: PreviewProject,
  period: PreviewBillingMonth,
) {
  const range = billingRange(period);
  const valid =
    !!range.start &&
    !!range.end &&
    range.start <= range.end &&
    datesBetween(range.start, range.end).length > 0;
  const dprs = previewDprs(project);
  const rows = new Map<string, PreviewHireRow>();
  if (valid)
    for (const operation of project.operations) {
      if (period.vessel && operation.vessel !== period.vessel) continue;
      for (const date of datesBetween(
        operation.start > range.start ? operation.start : range.start,
        operation.end < range.end ? operation.end : range.end,
      )) {
        const key = `${operation.vessel}:${date}`;
        const report = dprs.find(
          (dpr) => dpr.date === date && dpr.vessel === operation.vessel,
        );
        const mode = report?.mode || "operation";
        const amount =
          report?.amount ?? operation.dailyRateOverride ?? period.rates[mode];
        rows.set(key, {
          key,
          date,
          vessel: operation.vessel,
          mode,
          amount,
          report,
          origin:
            report?.amount != null
              ? "Montant du DPR"
              : operation.dailyRateOverride != null
                ? "Tarif de l’opération"
                : `Tarif contractuel · ${HIRE_LABELS[mode]}`,
          missing: !report,
          future: date > PREVIEW_DATE,
          included:
            !period.excludedDays.includes(key) &&
            (!!report || period.completeMissing),
        });
      }
    }
  const hireRows = [...rows.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || a.vessel.localeCompare(b.vessel),
  );
  const hire = period.includeHire
    ? hireRows
        .filter((row) => row.included)
        .reduce((sum, row) => sum + row.amount, 0)
    : 0;
  const services = period.includeServices
    ? period.services
        .filter((line) => line.included)
        .reduce((sum, line) => sum + line.price * line.quantity, 0)
    : 0;
  const currencies: Record<string, number> = { EUR: hire + services };
  const expensesByCurrency: Record<string, number> = {};
  if (period.includeExpenses)
    for (const expense of period.expenses.filter((line) => line.included)) {
      currencies[expense.currency] =
        (currencies[expense.currency] || 0) + expense.amountHt;
      expensesByCurrency[expense.currency] =
        (expensesByCurrency[expense.currency] || 0) + expense.amountHt;
    }
  const attachments = period.includeExpenses
    ? period.expenses
        .filter((expense) => expense.included)
        .flatMap((expense) => expense.attachments)
    : [];
  return {
    valid,
    ...range,
    hireRows,
    hire,
    services,
    currencies,
    expensesByCurrency,
    attachments,
    missing: hireRows.filter((row) => row.missing),
    missingDocuments: period.expenses.filter(
      (expense) => expense.included && !expense.attachments.length,
    ).length,
  };
}

export function billingExportLines(
  project: PreviewProject,
  period: PreviewBillingMonth,
) {
  const summary = buildBillingSummary(project, period);
  const lines = [
    `Période : ${summary.start} au ${summary.end}`,
    `Référence client : ${period.clientReference || "Non renseignée"}`,
    `Navire : ${period.vessel || "Tous les navires du projet"}`,
    "",
    "OPERATIONS / DPR",
  ];
  summary.hireRows
    .filter((row) => row.included)
    .forEach((row) =>
      lines.push(
        `${row.date} | ${row.vessel} | ${HIRE_LABELS[row.mode]}${row.missing ? " - Complément sans DPR" : ""}${period.includeHire ? ` | ${currencyAmount(row.amount)}` : ""}`,
      ),
    );
  if (period.includeExpenses) {
    lines.push("", "FRAIS REFACTURABLES");
    period.expenses
      .filter((expense) => expense.included)
      .forEach((expense) =>
        lines.push(
          `${expense.invoiceDate} | ${expense.supplier} | ${expense.invoiceNumber} | ${currencyAmount(expense.amountHt, expense.currency)}`,
        ),
      );
  }
  if (period.includeServices) {
    lines.push("", "PRESTATIONS BBTM");
    period.services
      .filter((line) => line.included)
      .forEach((line) =>
        lines.push(
          `${line.category} | ${line.description} | ${line.quantity} x ${currencyAmount(line.price)} = ${currencyAmount(line.quantity * line.price)}`,
        ),
      );
  }
  lines.push(
    "",
    ...Object.entries(summary.currencies).map(
      ([currency, amount]) =>
        `TOTAL HT ${currency} : ${currencyAmount(amount, currency)}`,
    ),
    "",
    period.comments,
  );
  return lines;
}

export async function generatePreviewBillingExport(
  project: PreviewProject,
  period: PreviewBillingMonth,
  format: "pdf" | "merged-pdf" | "zip",
) {
  const summary = buildBillingSummary(project, period);
  if (!summary.valid) throw new Error("Vérifie les dates de début et de fin.");
  if (!period.saved)
    throw new Error(
      "Enregistre les paramètres du mois avant de générer le document.",
    );
  const base = await buildPreviewPdf(
    project,
    "Éléments de facturation — démonstration",
    billingExportLines(project, period),
  );
  if (format === "pdf")
    return { blob: base, fileName: `DEMO-${project.id}-${period.month}.pdf` };
  const attachments = await Promise.all(
    summary.attachments.map(async (document) => ({
      document,
      blob:
        document.file ||
        (await buildPreviewPdf(project, document.name, [
          "Justificatif fournisseur fictif.",
        ])),
    })),
  );
  const fileName = `DEMO-${project.id}-${period.month}`;
  if (format === "zip") {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    zip.file("releve.pdf", await base.arrayBuffer());
    for (const { document, blob } of attachments) {
      zip.file(
        `pieces/${document.id}-${document.name.replace(/[\\/]/g, "-")}`,
        await blob.arrayBuffer(),
      );
    }
    return {
      blob: await zip.generateAsync({ type: "blob" }),
      fileName: `${fileName}.zip`,
    };
  }
  const { PDFDocument } = await import("pdf-lib");
  const merged = await PDFDocument.load(await base.arrayBuffer());
  for (const { document, blob } of attachments) {
    if (
      !(
        document.file?.type === "application/pdf" ||
        (!document.file && /\.pdf$/i.test(document.name))
      )
    )
      continue;
    try {
      const source = await PDFDocument.load(await blob.arrayBuffer());
      (await merged.copyPages(source, source.getPageIndices())).forEach(
        (page) => merged.addPage(page),
      );
    } catch {
      throw new Error(
        `L’annexe « ${document.name} » est illisible ou protégée. Utilise le ZIP pour conserver toutes les pièces.`,
      );
    }
  }
  const bytes = await merged.save();
  return {
    blob: new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
    fileName: `${fileName}-avec-annexes.pdf`,
  };
}
