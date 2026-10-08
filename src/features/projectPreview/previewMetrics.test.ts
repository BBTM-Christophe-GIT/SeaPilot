// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import { createPreviewProjects, type PreviewProject } from "./previewModel";
import {
  buildPortfolioMetrics,
  monthRange,
  projectPhase,
} from "./portfolioModel";
import {
  billingExportLines,
  buildBillingSummary,
  createBillingMonth,
  generatePreviewBillingExport,
  getBillingMonth,
} from "./previewBillingModel";

describe("portfolio indicators", () => {
  it("counts unique vessel days across overlaps, includes archives and separates planned from elapsed actual", () => {
    const project = createPreviewProjects()[0];
    const overlapping: PreviewProject = {
      ...project,
      id: "P999",
      archived: true,
      operations: [
        { ...project.operations[0], start: "2026-09-22", end: "2026-09-24" },
      ],
    };
    const metrics = buildPortfolioMetrics(
      [project, overlapping],
      "2026-09-01",
      "2026-09-30",
    );
    const vessel = metrics.vessels[0];
    expect(vessel.days).toBe(8);
    expect(vessel.available).toBe(30);
    expect(vessel.realizedDays).toBe(4);
    expect(vessel.elapsedDays).toBe(27);
    expect(vessel.rate).toBe(27);
    expect(vessel.realizedRate).toBe(15);
    expect(metrics.operationCount).toBe(3);
  });
  it("uses business classification independently of the contract and supports future, historical and vessel filters", () => {
    const projects = createPreviewProjects();
    const october = buildPortfolioMetrics(
      projects,
      "2026-10-01",
      "2026-10-31",
      "Support Démonstration",
    );
    expect(october.vessels).toHaveLength(1);
    expect(october.vessels[0].realizedRate).toBeNull();
    expect(
      october.types.find((item) => item.name === "Travaux sous-marins")?.count,
    ).toBe(1);
    const august = buildPortfolioMetrics(projects, "2026-08-01", "2026-08-31");
    expect(
      august.vessels.find((item) => item.name === "Remorqueur Démonstration")
        ?.days,
    ).toBe(5);
    expect(projectPhase(projects[2])).toBe("Terminé");
    expect(monthRange("2028-02").end).toBe("2028-02-29");
  });
});

describe("monthly billing selection and exports", () => {
  it("excludes missing DPRs by default and only adds explicit complements with operation rate precedence", () => {
    const project = createPreviewProjects()[0];
    const period = createBillingMonth(project, "2026-09");
    const initial = buildBillingSummary(project, period);
    expect(initial.hireRows).toHaveLength(8);
    expect(initial.hireRows.filter((row) => row.included)).toHaveLength(4);
    expect(initial.hire).toBe(58500); // 2 x operation + 1 x standby + 1 x weather
    expect(initial.currencies.EUR).toBe(79250);
    expect(
      buildBillingSummary(project, { ...period, completeMissing: true }).hire,
    ).toBe(130500);
    const modified = {
      ...project,
      operations: project.operations.map((op) => ({
        ...op,
        dailyRateOverride: 100.25,
      })),
    };
    expect(buildBillingSummary(modified, period).hire).toBe(401);
    expect(
      buildBillingSummary(project, {
        ...period,
        periodMode: "custom",
        start: "",
        end: "2026-09-30",
      }).valid,
    ).toBe(false);
  });
  it("isolates months, selections, attachments and currencies without deleting invoice data", () => {
    const project = createPreviewProjects()[0];
    const period = createBillingMonth(project, "2026-09");
    const usd = {
      ...period.expenses[0],
      id: 3,
      currency: "USD",
      amountHt: 120.25,
      attachments: [],
    };
    period.expenses = [
      ...period.expenses.map((line) => ({ ...line, included: false })),
      usd,
    ];
    const summary = buildBillingSummary(project, period);
    expect(summary.currencies).toEqual({ EUR: 76000, USD: 120.25 });
    expect(summary.attachments).toHaveLength(0);
    expect(period.expenses).toHaveLength(3);
    const stored = { ...project, billingMonths: { "2026-09": period } };
    expect(getBillingMonth(stored, "2026-09").expenses).toHaveLength(3);
    expect(getBillingMonth(stored, "2026-10").expenses).toHaveLength(0);
    expect(
      billingExportLines(project, {
        ...period,
        includeHire: false,
        includeServices: false,
      }),
    ).toContain("OPERATIONS / DPR");
    expect(
      buildBillingSummary(project, { ...period, includeExpenses: false })
        .currencies,
    ).toEqual({ EUR: 76000 });
  });
  it("produces a real PDF, merges only selected PDF annexes and bundles selected pieces in ZIP", async () => {
    const project = createPreviewProjects()[0];
    const period = createBillingMonth(project, "2026-09");
    const base = await generatePreviewBillingExport(project, period, "pdf");
    const merged = await generatePreviewBillingExport(
      project,
      period,
      "merged-pdf",
    );
    const basePages = (
      await PDFDocument.load(await base.blob.arrayBuffer())
    ).getPageCount();
    expect(
      (await PDFDocument.load(await merged.blob.arrayBuffer())).getPageCount(),
    ).toBe(basePages + 1);
    const zip = await generatePreviewBillingExport(
      project,
      { ...period, includeExpenses: false },
      "zip",
    );
    const archive = await JSZip.loadAsync(await zip.blob.arrayBuffer());
    expect(Object.keys(archive.files)).toEqual(["releve.pdf"]);
    const withAttachments = await generatePreviewBillingExport(
      project,
      period,
      "zip",
    );
    const files = await JSZip.loadAsync(
      await withAttachments.blob.arrayBuffer(),
    );
    expect(
      Object.keys(files.files).filter((name) => !files.files[name].dir),
    ).toEqual(["releve.pdf", "pieces/90101-Facture avitaillement DEMO.pdf"]);
    await expect(
      generatePreviewBillingExport(project, { ...period, saved: false }, "pdf"),
    ).rejects.toThrow("Enregistre");
  });
});
