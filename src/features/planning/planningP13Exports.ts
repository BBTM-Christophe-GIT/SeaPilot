import type { PlanningOverview } from './planningQueries';
import type { PlanningP13Data, PlanningWorkRestCheck } from './planningP13';
import { buildPlanningExportRows, formatPlanningPerson } from './planningModel';

export type PlanningExportFormat = 'xlsx' | 'pdf' | 'ics';
export type PlanningExportKind = 'schedule' | 'sailor' | 'crew_list' | 'handover_sheet' | 'anomalies' | 'work_rest';

export interface PlanningExportContext {
  overview: PlanningOverview;
  data: PlanningP13Data;
  checks: PlanningWorkRestCheck[];
  startsOn: string;
  endsOn: string;
  personIds?: number[];
  vesselIds?: number[];
}

interface PlanningExportTable {
  name: string;
  columns: string[];
  rows: Array<Array<string | number>>;
}

export interface PlanningGeneratedExport {
  blob: Blob;
  fileName: string;
}

const EXPORT_LABELS: Record<PlanningExportKind, string> = {
  schedule: 'planning',
  sailor: 'marins',
  crew_list: 'liste-equipage',
  handover_sheet: 'feuille-releve',
  anomalies: 'anomalies',
  work_rest: 'travail-repos',
};

function within(startsOn: string, endsOn: string, rangeStart: string, rangeEnd: string): boolean {
  return startsOn <= rangeEnd && endsOn >= rangeStart;
}

function selected(id: number | null, ids?: number[]): boolean {
  return !ids || ids.length === 0 || (id !== null && ids.includes(id));
}

function filteredAssignments(context: PlanningExportContext) {
  return context.overview.assignments.filter((assignment) => selected(assignment.crewPersonId, context.personIds)
    && selected(assignment.vesselId, context.vesselIds)
    && within(assignment.startsOn, assignment.endsOn, context.startsOn, context.endsOn));
}

function tablesFor(kind: PlanningExportKind, context: PlanningExportContext): PlanningExportTable[] {
  const { overview, data, checks, startsOn, endsOn } = context;
  if (kind === 'sailor') {
    const selectedVesselNames = new Set(overview.vessels.filter((vessel) => selected(vessel.id, context.vesselIds)).map((vessel) => vessel.name));
    const rows = overview.people
      .filter((person) => selected(person.id, context.personIds))
      .flatMap((person) => buildPlanningExportRows(overview, formatPlanningPerson(person), { start: startsOn, end: endsOn }))
      .filter((row) => !context.vesselIds || context.vesselIds.length === 0 || selectedVesselNames.has(row.vessel));
    return [{
      name: 'Marins',
      columns: ['Date', 'Marin', 'Jour travaillé', 'Statut', 'Fonction', 'Navire', 'Bordée', 'Annotation', 'Source'],
      rows: rows.map((row) => [row.date, row.person, row.worked, row.status, row.functionLabel, row.vessel, row.watchGroup, row.comments, row.source]),
    }];
  }
  if (kind === 'crew_list') {
    return [{
      name: 'Équipage',
      columns: ['Navire', 'Marin', 'Fonction', 'Début', 'Fin', 'Statut', 'Bordée'],
      rows: filteredAssignments(context)
        .filter((assignment) => assignment.confirmationStatus !== 'cancelled')
        .map((assignment) => [assignment.vesselName, assignment.crewName, assignment.assignmentRole, assignment.startsOn, assignment.endsOn, assignment.confirmationStatus, assignment.watchGroup]),
    }];
  }
  if (kind === 'handover_sheet') {
    return [{
      name: 'Relèves',
      columns: ['Navire', 'Date', 'Lieu', 'Fonction', 'Sortant', 'Entrant', 'Durée (min)', 'Statut', 'Commentaires'],
      rows: overview.handovers.filter((handover) => selected(handover.vesselId, context.vesselIds)
        && handover.handoverAt.slice(0, 10) >= startsOn && handover.handoverAt.slice(0, 10) <= endsOn)
        .flatMap((handover) => handover.positions.filter((position) => selected(position.outgoingPersonId, context.personIds) || selected(position.incomingPersonId, context.personIds)).map((position) => [
          overview.vessels.find((vessel) => vessel.id === handover.vesselId)?.name || `Navire #${handover.vesselId}`,
          handover.handoverAt,
          handover.location,
          position.functionLabel,
          overview.people.find((person) => person.id === position.outgoingPersonId)?.lastName || '',
          overview.people.find((person) => person.id === position.incomingPersonId)?.lastName || '',
          handover.durationMinutes,
          handover.status,
          position.comments || handover.comments,
        ])),
    }];
  }
  if (kind === 'anomalies') {
    return [{
      name: 'Anomalies',
      columns: ['Type', 'Sévérité', 'Titre', 'Description', 'Début', 'Fin', 'Priorité', 'Statut', 'Responsable'],
      rows: data.p12.conflictCases.filter((item) => selected(item.personId, context.personIds) && selected(item.vesselId, context.vesselIds)
        && within(item.startsOn, item.endsOn, startsOn, endsOn)).map((item) => [
        item.conflictType, item.severity, item.title, item.description, item.startsOn, item.endsOn, item.priority, item.status, item.ownerName,
      ]),
    }];
  }
  if (kind === 'work_rest') {
    return [{
      name: 'Travail et repos',
      columns: ['Marin', 'Navire', 'Date', 'Politique', 'Contrôle', 'Valeur', 'Seuil', 'Unité', 'Résultat', 'Source'],
      rows: checks.filter((check) => selected(check.personId, context.personIds) && selected(check.vesselId, context.vesselIds)
        && check.date >= startsOn && check.date <= endsOn).map((check) => [
        check.personName, check.vesselName, check.date, check.policyName, check.ruleLabel, check.value ?? '', check.threshold ?? '', check.unit, check.status, check.dataSource,
      ]),
    }];
  }
  return [
    {
      name: 'Affectations',
      columns: ['Navire', 'Marin', 'Fonction', 'Début', 'Fin', 'Statut', 'Responsable'],
      rows: filteredAssignments(context).map((assignment) => [
        assignment.vesselName, assignment.crewName, assignment.assignmentRole, assignment.startsAt || assignment.startsOn, assignment.endsAt || assignment.endsOn, assignment.confirmationStatus, assignment.captainName,
      ]),
    },
    {
      name: 'Opérations',
      columns: ['Titre', 'Type', 'Navire', 'Début', 'Fin', 'Statut', 'Responsable'],
      rows: overview.projects.filter((project) => selected(project.primaryVesselId, context.vesselIds)
        && within(project.startsOn, project.endsOn, startsOn, endsOn)).map((project) => [
        project.title, project.eventType, project.primaryVesselName, project.startsOn, project.endsOn, project.status, project.responsibleName,
      ]),
    },
  ];
}

function xmlEscape(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function excelColumn(index: number): string {
  let result = '';
  let value = index + 1;
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function worksheetXml(table: PlanningExportTable): string {
  const rows = [table.columns, ...table.rows];
  const body = rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((cell, columnIndex) => {
    const reference = `${excelColumn(columnIndex)}${rowIndex + 1}`;
    return typeof cell === 'number'
      ? `<c r="${reference}"><v>${cell}</v></c>`
      : `<c r="${reference}" t="inlineStr"><is><t>${xmlEscape(cell)}</t></is></c>`;
  }).join('')}</row>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

async function xlsxBlob(tables: PlanningExportTable[]): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${tables.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`);
  zip.folder('_rels')!.file('.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  zip.folder('xl')!.file('workbook.xml', `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${tables.map((table, index) => `<sheet name="${xmlEscape(table.name.slice(0, 31))}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>`);
  zip.folder('xl')!.folder('_rels')!.file('workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${tables.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}</Relationships>`);
  const worksheets = zip.folder('xl')!.folder('worksheets')!;
  tables.forEach((table, index) => worksheets.file(`sheet${index + 1}.xml`, worksheetXml(table)));
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

async function pdfBlob(kind: PlanningExportKind, tables: PlanningExportTable[]): Promise<Blob> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const document = new jsPDF({ compress: true, orientation: 'landscape', unit: 'mm', format: 'a4' });
  let cursor = 16;
  document.setFontSize(15);
  document.text(`SeaPilot · ${EXPORT_LABELS[kind]}`, 14, 10);
  for (const table of tables) {
    document.setFontSize(11);
    document.text(table.name, 14, cursor);
    autoTable(document, { head: [table.columns], body: table.rows, startY: cursor + 3, styles: { fontSize: 7, cellPadding: 1.5 }, margin: { left: 10, right: 10 } });
    cursor = ((document as typeof document & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || cursor + 20) + 8;
    if (cursor > 180) {
      document.addPage();
      cursor = 16;
    }
  }
  return document.output('blob');
}

function icsEscape(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll(';', '\\;').replaceAll(',', '\\,').replaceAll('\n', '\\n');
}

function icsDate(value: string, end = false): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const compact = value.replaceAll('-', '');
    if (!end) return compact;
    const date = new Date(`${value}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10).replaceAll('-', '');
  }
  return new Date(value).toISOString().replaceAll('-', '').replaceAll(':', '').replace('.000', '');
}

function icsBlob(kind: PlanningExportKind, context: PlanningExportContext): Blob {
  const events: Array<{ uid: string; title: string; description: string; start: string; end: string }> = [];
  if (kind === 'handover_sheet' || kind === 'schedule') {
    for (const handover of context.overview.handovers.filter((item) => selected(item.vesselId, context.vesselIds)
      && item.handoverAt.slice(0, 10) >= context.startsOn && item.handoverAt.slice(0, 10) <= context.endsOn
      && item.positions.some((position) => selected(position.outgoingPersonId, context.personIds) || selected(position.incomingPersonId, context.personIds)))) {
      events.push({ uid: `handover-${handover.id}@seapilot`, title: `Relève · ${handover.location}`, description: handover.comments, start: handover.handoverAt, end: new Date(Date.parse(handover.handoverAt) + handover.durationMinutes * 60_000).toISOString() });
    }
  }
  if (kind === 'crew_list' || kind === 'schedule' || kind === 'sailor') {
    for (const assignment of filteredAssignments(context)) {
      events.push({ uid: `assignment-${assignment.id}@seapilot`, title: `${assignment.crewName} · ${assignment.vesselName}`, description: `${assignment.assignmentRole} · ${assignment.comments}`, start: assignment.startsAt || assignment.startsOn, end: assignment.endsAt || assignment.endsOn });
    }
  }
  if (kind === 'anomalies') {
    for (const conflict of context.data.p12.conflictCases.filter((item) => selected(item.personId, context.personIds)
      && selected(item.vesselId, context.vesselIds) && within(item.startsOn, item.endsOn, context.startsOn, context.endsOn))) {
      events.push({ uid: `conflict-${conflict.id}@seapilot`, title: conflict.title, description: conflict.description, start: conflict.startsOn, end: conflict.endsOn });
    }
  }
  if (kind === 'work_rest') {
    for (const check of context.checks.filter((item) => selected(item.personId, context.personIds)
      && selected(item.vesselId, context.vesselIds) && item.status !== 'compliant' && item.date >= context.startsOn && item.date <= context.endsOn)) {
      events.push({ uid: `rest-${check.id}@seapilot`, title: `${check.ruleLabel} · ${check.personName}`, description: check.detail, start: check.date, end: check.date });
    }
  }
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SeaPilot//Planning P1.3//FR', 'CALSCALE:GREGORIAN'];
  for (const event of events) {
    lines.push('BEGIN:VEVENT', `UID:${event.uid}`, `DTSTAMP:${icsDate(new Date().toISOString())}`, `DTSTART${event.start.length === 10 ? ';VALUE=DATE' : ''}:${icsDate(event.start)}`, `DTEND${event.end.length === 10 ? ';VALUE=DATE' : ''}:${icsDate(event.end, event.end.length === 10)}`, `SUMMARY:${icsEscape(event.title)}`, `DESCRIPTION:${icsEscape(event.description)}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return new Blob([`${lines.join('\r\n')}\r\n`], { type: 'text/calendar;charset=utf-8' });
}

export async function generatePlanningExport(kind: PlanningExportKind, format: PlanningExportFormat, context: PlanningExportContext): Promise<PlanningGeneratedExport> {
  const tables = tablesFor(kind, context);
  const blob = format === 'xlsx' ? await xlsxBlob(tables) : format === 'pdf' ? await pdfBlob(kind, tables) : icsBlob(kind, context);
  return { blob, fileName: `${EXPORT_LABELS[kind]}-${context.startsOn}-${context.endsOn}.${format}` };
}
