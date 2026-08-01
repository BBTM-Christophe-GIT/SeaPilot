import type { DprReportRecord } from './dprQueries.ts';

export interface GeneratedDprDocument {
  blob: Blob;
  filename: string;
}

export interface DprArchiveProgress {
  completed: number;
  total: number;
  report: DprReportRecord;
}

function safeSegment(value: string): string {
  return value.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-') || 'DPR';
}

export function dprArchiveFilename(reports: DprReportRecord[]): string {
  const vessels = new Set(reports.map((report) => safeSegment(report.vesselName || 'Sans-navire')));
  const projects = new Set(reports.map((report) => safeSegment(report.projectCode || report.unlistedProjectName || 'Sans-projet')));
  const dates = reports.map((report) => report.reportDate).filter(Boolean).sort();
  const vessel = vessels.size === 1 ? [...vessels][0] : 'Multi-navires';
  const project = projects.size === 1 ? [...projects][0] : 'Multi-projets';
  const period = dates.length ? `${dates[0]}_${dates[dates.length - 1]}` : 'Sans-date';
  return `${vessel}_${project}_DPR_${period}.zip`;
}

export async function generateDprArchive(
  reports: DprReportRecord[],
  generate: (report: DprReportRecord) => Promise<GeneratedDprDocument>,
  onProgress?: (progress: DprArchiveProgress) => void,
): Promise<GeneratedDprDocument> {
  if (!reports.length) throw new Error('Aucun DPR sélectionné.');

  const { default: JSZip } = await import('jszip');
  const archive = new JSZip();

  for (const [index, report] of reports.entries()) {
    const generated = await generate(report);
    const prefix = String(index + 1).padStart(String(reports.length).length, '0');
    archive.file(`${prefix}-${generated.filename}`, generated.blob);
    onProgress?.({ completed: index + 1, total: reports.length, report });
  }

  return {
    blob: await archive.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } }),
    filename: dprArchiveFilename(reports),
  };
}
