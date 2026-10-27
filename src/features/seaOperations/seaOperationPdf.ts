import type { jsPDF } from 'jspdf';
import type { UserOptions } from 'jspdf-autotable';
import type { VesselSeaStateAssessment } from '../fleet/vesselWeatherMatrix';
import type { SeaOperationRecord } from './seaOperationQueries';
import { DIVING_MEDICAL_KIT, SEA_OPERATION_CHECKS, SEA_OPERATION_SECTIONS, SEA_OPERATION_SUPPLY_ITEMS } from './seaOperationModel';
import type { SeaOperationAnswer, SeaOperationCheck } from './seaOperationModel';
import { SEA_RADIO_VERIFIED_ON, seaOperationRadioContacts } from './seaOperationRadio';
import { passagePlanCellData } from './seaOperationPassagePlan';
import { waypointWeatherSnapshot } from './seaOperationWaypointSnapshots';
import { seaOperationWeatherLocation } from './seaOperationWeatherLocation';
import { buildSeaOperationRouteMap } from './seaOperationRouteMapGeometry';
import { assessSeaOperationUkc, isVesselDraftMeters, type SeaOperationUkcLevel } from './seaOperationUkc';
import { seaOperationWaypointDescription } from './seaOperationWaypointDescription';

export const SEA_OPERATION_WORD_TEMPLATE_URL = '/templates/sea-operation/word-header-footer.pdf';
const PAGE_WIDTH = 595.32;
const PAGE_HEIGHT = 841.92;
const LEFT = 49;
const RIGHT = 49;
const TOP = 100;
const BOTTOM = 55;
const WORD_HEADER_HEIGHT = 90;
const WORD_FOOTER_HEIGHT = 26;
const BLUE: [number, number, number] = [21, 96, 130];
const WHITE: [number, number, number] = [255, 255, 255];
const UKC_COLORS: Record<SeaOperationUkcLevel, { foreground: [number, number, number]; background: [number, number, number] }> = {
  danger: { foreground: [162, 27, 27], background: [255, 240, 239] },
  warning: { foreground: [138, 65, 0], background: [255, 242, 223] },
  success: { foreground: [23, 101, 63], background: [234, 247, 239] },
};
const SEA_STATE_COLORS: Record<VesselSeaStateAssessment['tone'], { foreground: [number, number, number]; background: [number, number, number] }> = {
  success: { foreground: [23, 97, 59], background: [234, 247, 239] },
  warning: { foreground: [120, 81, 0], background: [255, 247, 214] },
  danger: { foreground: [161, 38, 40], background: [255, 240, 238] },
  critical: { foreground: [255, 255, 255], background: [24, 33, 50] },
  neutral: { foreground: [70, 80, 95], background: [242, 245, 248] },
};

export interface SeaOperationPdfOptions {
  /** Private RH image resolved and hash-checked by the authorized query helper. */
  signatureImage?: string | null;
  hasUnsavedChanges?: boolean;
  /** Injectable source template bytes for offline rendering and deterministic verification. */
  templateBytes?: Uint8Array;
}
export interface SeaOperationGeneratedPdf { bytes: Uint8Array; filename: string; pageCount: number }

const value = (input: string | null | undefined) => input?.trim() ? input : 'À renseigner';
const answer = (input: SeaOperationAnswer) => input === 'yes' ? 'Oui' : input === 'no' ? 'Non' : 'À renseigner';
// Helvetica/WinAnsi has no U+2032 minute glyph. ASCII apostrophe keeps the
// degree/minute/hemisphere notation readable without corrupting PDF text.
const clean = (input: string) => input.replace(/\u00a0/g, ' ').replace(/[\u2010-\u2015\u2212]/g, '-').replace(/\u202f/g, ' ').replace(/\u2032/g, "'");
const date = (input: string) => input.replace(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2})(.*))?$/, (_match, year, month, day, time, suffix) => `${day}/${month}/${year}${time ? ` à ${time}${suffix || ''}` : ''}`) || 'À renseigner';
function timestamp(input: string | null) {
  if (!input) return 'À renseigner';
  const parsed = new Date(input);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Paris' }) : input;
}
function checkAnswer(check: SeaOperationCheck, input: SeaOperationAnswer) {
  if (input === 'yes') return check.yesLabel || 'Oui';
  if (input === 'no') return check.noLabel || (check.blocking ? 'Non - NE PAS APPAREILLER (NO GO automatique)' : check.justifyNo ? 'Non - justifier et transmettre à l’Armement' : 'Non');
  return 'À renseigner';
}

export function seaOperationPdfFilename(record: SeaOperationRecord): string {
  const safe = (input: string) => Array.from(input).filter((character) => character.charCodeAt(0) >= 32).join('').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\\/:*?"<>|]/g, '-').trim().slice(0, 90);
  return `Operation-en-Mer-${safe(record.draft.project || 'Brouillon')}-${safe(record.draft.vessel.name || 'Navire')}.pdf`;
}

async function loadWordTemplate(): Promise<Uint8Array> {
  const response = await fetch(SEA_OPERATION_WORD_TEMPLATE_URL);
  if (!response.ok) throw new Error('Le modèle Word d’en-tête et de pied de page est indisponible. Le PDF ne peut pas être créé fidèlement.');
  return new Uint8Array(await response.arrayBuffer());
}

/** PDF pages reuse the original Word vector header/footer, including its embedded fonts and cropped logo. */
export async function generateSeaOperationPdf(record: SeaOperationRecord, options: SeaOperationPdfOptions = {}): Promise<SeaOperationGeneratedPdf> {
  const [{ jsPDF: Pdf }, { default: autoTable }, { PDFDocument }, template] = await Promise.all([
    import('jspdf'), import('jspdf-autotable'), import('pdf-lib'), options.templateBytes || loadWordTemplate(),
  ]);
  const form = record.draft;
  const signed = record.status === 'signed';
  const unsaved = Boolean(options.hasUnsavedChanges && !signed);
  const document = new Pdf({ orientation: 'portrait', unit: 'pt', format: [PAGE_WIDTH, PAGE_HEIGHT], compress: true });
  document.setProperties({ title: `GO / NO GO - OPÉRATION EN MER - ${form.project}`, subject: 'OPE-FOR-10-C', author: 'BBTM', creator: 'SeaPilot' });
  let y = TOP;
  const pageWidth = () => document.internal.pageSize.getWidth();
  const pageHeight = () => document.internal.pageSize.getHeight();
  const newPage = (orientation: 'portrait' | 'landscape') => { document.addPage([PAGE_WIDTH, PAGE_HEIGHT], orientation); y = TOP; };
  const page = (space = 25) => { if (y + space > pageHeight() - BOTTOM) { document.addPage(); y = TOP; } };
  const paragraph = (text: string, bold = false) => {
    document.setFont('helvetica', bold ? 'bold' : 'normal'); document.setFontSize(9); document.setTextColor(0, 0, 0);
    const lines = document.splitTextToSize(clean(text), pageWidth() - LEFT - RIGHT) as string[];
    for (const line of lines) { page(13); document.text(line, LEFT, y); y += 12; }
    y += 5;
  };
  const heading = (text: string, minor = false) => {
    page(45); y += minor ? 5 : 9;
    document.setFont('helvetica', 'bold'); document.setFontSize(minor ? 10 : 12); document.setTextColor(...BLUE);
    document.text(clean(text), LEFT, y); y += minor ? 15 : 18;
  };
  const table = (rows: string[][], headers?: string[], widths?: Record<number, { cellWidth: number }>, compact = false, hooks?: Pick<UserOptions, 'didParseCell' | 'didDrawCell' | 'willDrawCell'>) => {
    autoTable(document, {
      startY: y, margin: { top: TOP, bottom: BOTTOM, left: LEFT, right: RIGHT },
      head: headers ? [headers.map(clean)] : undefined, body: rows.map((row) => row.map(clean)), theme: 'grid',
      styles: { font: 'helvetica', fontSize: compact ? 8.5 : 9, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: .35, cellPadding: compact ? 4 : 5, overflow: 'linebreak', valign: 'top' },
      headStyles: { fillColor: [255, 255, 255], textColor: BLUE, fontStyle: 'bold' },
      columnStyles: widths, rowPageBreak: 'avoid', showHead: 'everyPage',
      ...hooks,
    });
    y = ((document as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || y) + 8;
  };
  const fields = (rows: Array<[string, string]>) => table(rows.map(([label, content]) => [label, value(content)]), undefined, { 0: { cellWidth: 170 } });

  paragraph(signed ? `Décision ${form.decision === 'NO_GO' ? 'NO GO' : 'GO'} signée.` : `BROUILLON - décision non signée${unsaved ? ' - modifications non enregistrées' : ''}.`, true);
  if (!unsaved && record.id) paragraph(`Fiche ${record.id} - Version ${record.version}.`);
  heading('À remplir par l’Armement');
  fields([['Projet', form.project], ['Client', form.client], ['Coordonnées du client (information opérationnelle)', form.clientContact], ['Description', form.description]]);
  heading('Personnel spécial à embarquer', true);
  if (form.specialPersonnel.length) table(form.specialPersonnel.map((person) => [value(person.name), value(person.phone)]), ['Prénom NOM', 'N° téléphone']);
  else paragraph('Aucun personnel spécial renseigné.');
  heading('Demande d’Attribution de Poste À Quai (DAPAQ)', true);
  paragraph('Caen, Le Havre, Dieppe et Rouen : DAPAQ préparée dans NOMADE par l’Armement ou le Capitaine. Autres ports : DAPAQ réalisée par mail et transmise à la Capitainerie.');
  fields([
    ['Mode', form.dapaq.method === 'nomade' ? 'NOMADE' : form.dapaq.method === 'email' ? 'Mail à la Capitainerie' : ''],
    ['Réalisée par', form.dapaq.preparedBy === 'armament' ? 'L’Armement' : form.dapaq.preparedBy === 'captain' ? 'Le Capitaine' : form.dapaq.preparedBy === 'agent' ? 'L’agent consignataire' : ''],
    ...(form.dapaq.preparedBy === 'agent' ? [['Agent consignataire', form.dapaq.agentName], ['Coordonnées de l’agent', form.dapaq.agentContact]] as Array<[string, string]> : []),
    ['Port de départ / Quai', `${value(form.vessel.departurePort)} / ${value(form.vessel.departureQuay)}`],
    ['Port d’arrivée / Quai', `${value(form.vessel.arrivalPort)} / ${value(form.vessel.arrivalQuay)}`],
    ['ETD - Date / Heure', date(form.vessel.etd)], ['ETA - Date / Heure', date(form.vessel.eta)],
  ]);
  heading('1 - Informations navire');
  fields([['Navire', form.vessel.name], ['Capitaine', form.vessel.captainName], ['N° immatriculation / IMO', form.vessel.registrationImo],
    ['Port de départ / Quai', `${value(form.vessel.departurePort)} / ${value(form.vessel.departureQuay)}`],
    ['Port à destination / Quai', `${value(form.vessel.arrivalPort)} / ${value(form.vessel.arrivalQuay)}`],
    ['ETD - Date / Heure', date(form.vessel.etd)], ['ETA - Date / Heure', date(form.vessel.eta)]]);
  heading('2 - Inspection avant appareillage');
  paragraph('Toute réponse négative marquée NO GO automatique interdit l’appareillage. Le Capitaine doit trouver une solution afin de pouvoir appareiller et justifier dûment toute situation ne le permettant pas.', true);
  for (const section of SEA_OPERATION_SECTIONS) {
    page(105);
    heading(`${section.id} - ${section.title}`, true);
    if (section.applicability && form.applicability[section.applicability] !== 'yes') {
      paragraph(form.applicability[section.applicability] === 'no' ? 'Non applicable.' : 'Applicabilité à renseigner.');
      continue;
    }
    if (section.applicability) paragraph('Rubrique applicable : Oui.');
    const checks = SEA_OPERATION_CHECKS.filter((check) => check.section === section.id);
    if (checks.length) table(checks.map((check) => [check.label + (check.help ? `\n${check.help}` : ''), checkAnswer(check, form.checks[check.id])
      + (form.justifications[check.id]?.trim() ? `\nJustification : ${form.justifications[check.id]}` : form.checks[check.id] === 'no' && check.justifyNo ? '\nJustification à transmettre à l’Armement : à renseigner.' : '')]), ['Contrôle', 'Réponse / justification'], { 0: { cellWidth: 280 } });
    if (section.id === '2.5' && form.applicability.towing === 'yes') {
      fields([['Besoin d’aller sur le remorqué', answer(form.towedVesselBoarding.required)]]);
      if (form.towedVesselBoarding.required === 'yes') fields([['Ronde de sécurité, zones dangereuses et mesures prises', form.towedVesselBoarding.measures === 'sms' ? 'L’opération ne nécessite pas de mesures autres que celles définies dans le SMS.' : form.towedVesselBoarding.measures === 'specific' ? `Les mesures spécifiques suivantes ont été prises :\n${value(form.towedVesselBoarding.details)}` : '']]);
    }
    if (section.id === '2.7') {
      const labels = { towing: 'Remorquage', pilotage: 'Pilotage', mooring: 'Lamanage', none: 'Le règlement portuaire n’exige pas ces services' };
      fields([['Services à l’arrivée', form.portServices.map((service) => labels[service]).join(' ; ')]]);
      if (form.portServices.some((service) => service !== 'none')) fields([['Services obligatoires prévenus au besoin', form.mandatoryServicesNotified ? 'Confirmé par le Capitaine' : 'Non confirmé']]);
    }
    if (section.id === '2.8') {
      fields([['Délégation à un shipchandler', form.supplies.delegated === 'yes' ? `Oui - ${value(form.supplies.shipchandlerName)}\n${value(form.supplies.shipchandlerContact)}` : form.supplies.delegated === 'no' ? 'Non - Le Capitaine gère l’escale avec l’appui de l’Armement au besoin.' : ''],
        ...(['Approvisionnement', 'Avitaillement'] as const).map((category): [string, string] => [category, SEA_OPERATION_SUPPLY_ITEMS.filter((item) => item.category === category && form.supplies.items.includes(item.id)).map((item) => item.label).join(' ; ') || 'Aucun besoin renseigné dans cette catégorie.']),
        ['Fournisseurs et besoins identifiés', form.supplies.suppliers], ['Comptes clients préparés avec la Direction financière au besoin', form.supplies.customerAccountsPrepared ? 'Confirmé' : 'Non confirmé / sans besoin déclaré']]);
    }
  }
  newPage('landscape');
  heading('3 - Passage Plan');
  fields([['Numéro de la ou des cartes marines', form.charts], ['Tirant d’eau de référence conservé', isVesselDraftMeters(form.vessel.draftMeters) ? `${form.vessel.draftMeters.toLocaleString('fr-FR', { maximumFractionDigits: 20 })} m` : 'Non renseigné - indicateur UKC indisponible']]);
  if (isVesselDraftMeters(form.vessel.draftMeters)) paragraph('Seuils UKC : rouge jusqu’au tirant d’eau inclus ; orange au-delà et jusqu’à +2 m inclus ; vert au-delà de +2 m. Indicateur distinct de la décision du Capitaine.');
  paragraph('ETA : date et heure locale de Paris. Les fiches historiques peuvent conserver une heure seule.');
  paragraph('Positions WGS84 : degrés et minutes décimales, N/S et E/W (Ouest).');
  const routeMap = buildSeaOperationRouteMap(form.waypoints, pageWidth() - LEFT - RIGHT, 190);
  page(routeMap.points.length ? routeMap.height + 65 : 65);
  heading('Carte du parcours', true);
  if (routeMap.points.length) {
    const mapY = y;
    const at = (point: { x: number; y: number }) => ({ x: LEFT + point.x, y: mapY + point.y });
    document.saveGraphicsState();
    document.setFillColor(236, 246, 251); document.setDrawColor(190, 208, 219); document.setLineWidth(.6);
    document.rect(LEFT, mapY, routeMap.width, routeMap.height, 'FD');
    document.setFillColor(226, 233, 220);
    for (const polygon of routeMap.land) {
      if (polygon.length < 3) continue;
      document.path([...polygon.map((point, index) => ({ op: index ? 'l' : 'm', c: [LEFT + point.x, mapY + point.y] })), { op: 'h', c: [] }]);
      document.fill();
    }
    document.setDrawColor(199, 216, 225); document.setLineWidth(.35);
    document.setFont('helvetica', 'normal'); document.setFontSize(6); document.setTextColor(80, 105, 120);
    for (const line of routeMap.grid) {
      const from = at(line.from), to = at(line.to), label = at(line.labelAt);
      document.line(from.x, from.y, to.x, to.y); document.text(clean(line.label), label.x, label.y);
    }
    document.setDrawColor(...BLUE); document.setLineWidth(1.6);
    for (const segment of routeMap.segments) {
      const from = at(segment.from), to = at(segment.to);
      document.line(from.x, from.y, to.x, to.y);
      const dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy);
      if (length >= 24) {
        const x = (from.x + to.x) / 2, centerY = (from.y + to.y) / 2, ux = dx / length, uy = dy / length;
        document.setFillColor(...BLUE);
        document.path([{ op: 'm', c: [x + ux * 4, centerY + uy * 4] },
          { op: 'l', c: [x - ux * 3 - uy * 2.5, centerY - uy * 3 + ux * 2.5] },
          { op: 'l', c: [x - ux * 3 + uy * 2.5, centerY - uy * 3 - ux * 2.5] }, { op: 'h', c: [] }]);
        document.fill();
      }
    }
    const markerGroups = new Map<string, typeof routeMap.points>();
    for (const point of routeMap.points) {
      const key = `${point.x}:${point.y}`;
      markerGroups.set(key, [...(markerGroups.get(key) || []), point]);
    }
    for (const group of markerGroups.values()) {
      const point = group[0], position = at(point);
      const endpoint = group.some((entry) => entry.index === 1 || entry.index === form.waypoints.length);
      const arrival = form.waypoints.length > 1 && group.some((entry) => entry.index === form.waypoints.length);
      const ordinal = group.length > 4 ? `${group[0].index}/.../${group[group.length - 1].index}` : group.map((entry) => entry.index).join('/');
      document.setFont('helvetica', 'bold'); document.setFontSize(7);
      document.setFillColor(...(endpoint ? BLUE : WHITE)); document.setDrawColor(...BLUE); document.setLineWidth(.8);
      if (group.length > 1) {
        const width = Math.min(110, document.getTextWidth(ordinal) + 10);
        const markerX = Math.max(LEFT + 3, Math.min(position.x - width / 2, LEFT + routeMap.width - width - 3));
        document.roundedRect(markerX, position.y - 7, width, 14, 6, 6, 'FD');
        if (arrival) document.roundedRect(markerX - 2, position.y - 9, width + 4, 18, 7, 7, 'S');
        document.setTextColor(...(endpoint ? WHITE : BLUE));
        document.text(ordinal, markerX + width / 2, position.y + 2.4, { align: 'center' });
      } else {
        document.circle(position.x, position.y, 6, 'FD');
        if (arrival) document.circle(position.x, position.y, 8, 'S');
        document.setTextColor(...(endpoint ? WHITE : BLUE));
        document.text(ordinal, position.x, position.y + 2.4, { align: 'center' });
      }
      const labels = group.filter((entry) => entry.label !== String(entry.index)).map((entry) => entry.label);
      if (labels.length) {
        document.setFontSize(7); document.setTextColor(...BLUE);
        const complete = clean(labels.join(' / '));
        let label = complete;
        while (label.length > 1 && document.getTextWidth(label) > 110) label = label.slice(0, -1);
        if (label !== complete) label = `${label.slice(0, -3)}...`;
        const width = document.getTextWidth(label);
        document.text(label, Math.max(LEFT + 4, Math.min(position.x + 10, LEFT + routeMap.width - width - 4)), Math.max(mapY + 10, position.y - 10));
      }
    }
    if (routeMap.scale) {
      const from = at(routeMap.scale.from), to = at(routeMap.scale.to);
      document.setDrawColor(55, 80, 96); document.setLineWidth(1);
      document.line(from.x, from.y, to.x, to.y); document.line(from.x, from.y - 3, from.x, from.y + 3); document.line(to.x, to.y - 3, to.x, to.y + 3);
      document.setFont('helvetica', 'normal'); document.setFontSize(6.5); document.setTextColor(55, 80, 96);
      document.text(clean(routeMap.scale.label), (from.x + to.x) / 2, from.y - 5, { align: 'center' });
    }
    document.setFont('helvetica', 'bold'); document.setFontSize(7); document.setTextColor(55, 80, 96);
    document.text('N', LEFT + routeMap.width - 13, mapY + 12, { align: 'center' });
    document.setDrawColor(55, 80, 96); document.setLineWidth(.8);
    document.line(LEFT + routeMap.width - 13, mapY + 17, LEFT + routeMap.width - 13, mapY + 30);
    document.line(LEFT + routeMap.width - 13, mapY + 17, LEFT + routeMap.width - 16, mapY + 21);
    document.line(LEFT + routeMap.width - 13, mapY + 17, LEFT + routeMap.width - 10, mapY + 21);
    document.restoreGraphicsState();
    y += routeMap.height + 12;
    paragraph('Fond : Natural Earth · Tracé indicatif. Repères numérotés dans l’ordre du tableau ; les positions identiques regroupent leurs numéros.');
  } else paragraph('Aucun waypoint avec une latitude et une longitude valides à placer sur la carte.');
  if (routeMap.invalidCount) paragraph(`${routeMap.invalidCount} waypoint${routeMap.invalidCount > 1 ? 's' : ''} non placé${routeMap.invalidCount > 1 ? 's' : ''} : coordonnées absentes ou invalides. Le tracé est interrompu à ces positions.`);
  const passageRows = form.waypoints.map((point, index) => ({ ...passagePlanCellData(point, { payload: form, allowLiveRadio: !signed, weatherMatrix: form.vessel.weatherMatrix, observations: record.weatherObservations, includeObservations: signed, validatedAt: signed ? record.signedAt : undefined }), description: seaOperationWaypointDescription(point, index) }));
  if (passageRows.some(row => row.ukcPresentation.automatic)) paragraph('UKC précédées de ~ : estimations statiques indicatives. Calcul, sources conservées et limites dans l’annexe UKC par waypoint.');
  // A stable landscape column keeps numbers, status and annex references readable.
  const ukcColumnWidth = 76;
  const descriptionColumnWidth = 95;
  const ukcCards = passageRows.map((row) => {
    const assessment = assessSeaOperationUkc(row.ukcPresentation.rawValue, form.vessel.draftMeters);
    if (!assessment && !row.ukcPresentation.automatic) return undefined;
    document.setFont('helvetica', 'bold'); document.setFontSize(7.5);
    const label = clean(row.ukcPresentation.automatic ? row.ukcPresentation.pdfValue || 'Indisponible' : assessment!.formattedValue);
    const warning = Boolean(assessment && assessment.level !== 'success');
    const maxTextWidth = ukcColumnWidth - 12;
    const inline = document.getTextWidth(label) + (warning ? 8 : 0) <= maxTextWidth;
    const number = assessment ? label.slice(0, -2) : label;
    const lines = inline ? [label] : document.getTextWidth(number) <= maxTextWidth ? [number, 'm'] : document.splitTextToSize(label, maxTextWidth) as string[];
    const valueHeight = 8 + lines.length * 9 + (warning && !inline ? 9 : 0);
    const notes = row.ukcPresentation.automatic ? [row.ukcPresentation.approximate ? 'Indicative' : 'Automatique', 'Annexe UKC'] : [];
    return { assessment, warning, inline, lines, notes, valueHeight, height: valueHeight + (notes.length ? 7 + notes.length * 8 : 0) };
  });
  const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
  const height = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const integer = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
  const metric = (amount: number | null | undefined, unit: string, formatter = decimal) => amount === null || amount === undefined ? '—' : `${formatter.format(amount)} ${unit}`;
  const weatherColumnWidth = 200;
  const weatherCards = form.waypoints.map((point, index) => {
    const forecast = waypointWeatherSnapshot(point);
    const row = passageRows[index];
    document.setFont('helvetica', 'bold'); document.setFontSize(8);
    const indicatorLines = row.hasSeaStateIndicator ? document.splitTextToSize(clean(row.seaState.label), weatherColumnWidth - 34) as string[] : [];
    const indicatorHeight = indicatorLines.length ? indicatorLines.length * 10 + 16 : 0;
    document.setFont('helvetica', 'normal'); document.setFontSize(7.5);
    const message = forecast ? forecast.waves ? '' : forecast.wavesMessage || 'Prévision de houle indisponible.' : 'Prévisions météo non enregistrées pour cette position et cette ETA.';
    const messageLines = message ? document.splitTextToSize(clean(message), weatherColumnWidth - 26) as string[] : [];
    const windLines = forecast?.wind ? [metric(forecast.wind.speedKnots, 'nd') + (forecast.wind.directionDegrees === null ? '' : ` · de ${integer.format(forecast.wind.directionDegrees)}°`)]
      : document.splitTextToSize(clean(forecast?.windMessage || 'Prévision de vent indisponible.'), weatherColumnWidth - 38) as string[];
    const observed = row.observation;
    const observationSummary = !signed ? '' : observed?.status === 'recorded' ? [
      'MESURES APRÈS LE PASSAGE',
      observed.waves ? `${observed.waves.component === 'swell' ? 'Houle Hs' : 'Hs mer totale'} ${metric(observed.waves.heightMeters, 'm', height)} · ${observed.waves.periodKind === 'peak' ? 'Tp' : 'Tm'} ${metric(observed.waves.periodSeconds, 's')}` : 'Hs : aucune mesure proche.',
      observed.wind ? `Vent mesuré : ${metric(observed.wind.speedKnots, 'nd')} · de ${metric(observed.wind.directionDegrees, '°', integer)}` : 'Vent : aucune mesure proche.',
      'Stations, horaires et sources en annexe.',
    ].join('\n') : row.observedWeather;
    const observedLines = observationSummary ? document.splitTextToSize(clean(observationSummary), weatherColumnWidth - 26) as string[] : [];
    const validationLines = signed && record.signedAt ? document.splitTextToSize(clean(`Prévision conservée à la validation du ${new Date(record.signedAt).toLocaleString('fr-FR', { timeZone: 'UTC' })} UTC`), weatherColumnWidth - 26) as string[] : [];
    const locationLines = forecast?.model ? document.splitTextToSize(clean(seaOperationWeatherLocation(forecast)), weatherColumnWidth - 26) as string[] : [];
    return { forecast, messageLines, windLines, indicatorLines, indicatorHeight, observedLines, validationLines, locationLines,
      height: indicatorHeight + (forecast ? 114 + messageLines.length * 10 + windLines.length * 10 : 33 + messageLines.length * 10)
        + (observedLines.length ? observedLines.length * 8 + 14 : 0) + validationLines.length * 8 + locationLines.length * 8 };
  });
  if (passageRows.length) {
    document.setFont('helvetica', 'normal'); document.setFontSize(8.5);
    const first = passageRows[0];
    const textCells: Array<[string, number]> = [[first.waypoint, 45], [first.description, descriptionColumnWidth], [first.latitude, 60], [first.longitude, 60], [first.ukc, ukcColumnWidth], [first.eta, 76], [first.vhf, 96]];
    const firstRowHeight = Math.max(weatherCards[0].height + 10, (ukcCards[0]?.height || 0) + 6, ...textCells.map(([content, width]) => (document.splitTextToSize(clean(content), width - 8) as string[]).length * 8.5 * 1.15 + 8));
    // Keep the repeated header with the first text/card block, even when a missing forecast makes its card shorter.
    page(firstRowHeight + 32);
  }
  if (passageRows.length) table(passageRows.map((row) => [row.waypoint, row.description, row.latitude, row.longitude, row.ukc, row.eta, row.vhf, row.weather, row.denseTraffic]),
    ['Waypoint', 'Description', 'Latitude', 'Longitude', 'UKC', 'ETA - Date / heure', 'Contacts VHF', 'Météo à l’ETA', 'Trafic dense'],
    { 0: { cellWidth: 45 }, 1: { cellWidth: descriptionColumnWidth }, 2: { cellWidth: 60 }, 3: { cellWidth: 60 }, 4: { cellWidth: ukcColumnWidth }, 5: { cellWidth: 76 }, 6: { cellWidth: 96 }, 7: { cellWidth: weatherColumnWidth }, 8: { cellWidth: PAGE_HEIGHT - LEFT - RIGHT - 708 } }, true, {
      didParseCell(cell) {
        if (cell.section === 'head' && cell.column.index === 0) cell.cell.styles.cellPadding = 3;
        if (cell.section !== 'body') return;
        if (cell.column.index === 2 || cell.column.index === 3) cell.cell.styles.fontSize = 7;
        const ukc = ukcCards[cell.row.index];
        if (cell.column.index === 4 && ukc) {
          cell.cell.text = [];
          cell.cell.styles.minCellHeight = ukc.height + 6;
          cell.cell.styles.cellPadding = 0;
        }
        if (cell.column.index === 7) {
          // The cell reserves the measured card height; the vector card is drawn below without rasterizing its text.
          cell.cell.text = [];
          cell.cell.styles.minCellHeight = weatherCards[cell.row.index].height + 10;
          cell.cell.styles.cellPadding = 0;
          cell.cell.styles.fillColor = false;
        }
      },
      willDrawCell(cell) {
        if (cell.section !== 'body' || cell.column.index !== 7) return;
        document.setFillColor(255, 255, 255); document.setDrawColor(209, 220, 230); document.setLineWidth(.6);
        document.roundedRect(cell.cell.x + 5, cell.cell.y + 5, cell.cell.width - 10, weatherCards[cell.row.index].height, 5, 5, 'FD');
      },
      didDrawCell(cell) {
        if (cell.section !== 'body') return;
        const ukc = ukcCards[cell.row.index];
        if (cell.column.index === 4 && ukc) {
          const colors = ukc.assessment ? UKC_COLORS[ukc.assessment.level] : { foreground: [87, 104, 117] as [number, number, number], background: WHITE };
          const x = cell.cell.x + 3, top = cell.cell.y + 4, width = cell.cell.width - 6;
          document.saveGraphicsState();
          document.setFillColor(...colors.background); document.setDrawColor(...colors.foreground); document.setLineWidth(.45);
          if (ukc.assessment) document.roundedRect(x, top, width, ukc.valueHeight, 6, 6, 'FD');
          let textY = top + 10;
          if (ukc.warning) {
            const iconX = ukc.inline ? x + 3 : x + width / 2 - 3;
            const iconY = top + 3;
            document.triangle(iconX + 3, iconY, iconX + 6, iconY + 6, iconX, iconY + 6, 'S');
            document.setFont('helvetica', 'bold'); document.setFontSize(4.7); document.setTextColor(...colors.foreground);
            document.text('!', iconX + 3, iconY + 5, { align: 'center' });
            if (!ukc.inline) textY += 9;
          }
          document.setFont('helvetica', 'bold'); document.setFontSize(7.5); document.setTextColor(...colors.foreground);
          document.text(ukc.lines, x + width / 2 + (ukc.warning && ukc.inline ? 4 : 0), textY, { align: 'center', lineHeightFactor: 1.23 });
          if (ukc.notes.length) {
            document.setFont('helvetica', 'normal'); document.setFontSize(6.5); document.setTextColor(87, 104, 117);
            document.text(ukc.notes, x + width / 2, top + ukc.valueHeight + 10, { align: 'center', lineHeightFactor: 1.23 });
          }
          document.restoreGraphicsState();
          return;
        }
        if (cell.column.index !== 7) return;
        const row = passageRows[cell.row.index];
        const card = weatherCards[cell.row.index];
        const forecast = card.forecast;
        const x = cell.cell.x + 12;
        let top = cell.cell.y + 19;
        document.setFont('helvetica', 'bold'); document.setFontSize(6.5); document.setTextColor(87, 104, 117);
        document.text('MÉTÉO À L’ETA', x, top); top += 10;
        if (card.validationLines.length) {
          document.setFont('helvetica', 'normal'); document.setFontSize(6.5);
          document.text(card.validationLines, x, top, { lineHeightFactor: 1.15 }); top += card.validationLines.length * 8;
        }
        if (card.indicatorLines.length) {
          const colors = SEA_STATE_COLORS[row.seaState.tone];
          document.setFillColor(...colors.background);
          document.roundedRect(x - 1, top - 3, cell.cell.width - 22, card.indicatorHeight - 6, 3, 3, 'F');
          document.setFont('helvetica', 'bold'); document.setFontSize(8); document.setTextColor(...colors.foreground);
          document.text(card.indicatorLines, x + 4, top + 10, { lineHeightFactor: 1.25 });
          top += card.indicatorHeight;
        }
        if (forecast) {
          const metricColumn = (cell.cell.width - 24) / 2;
          document.setFont('helvetica', 'normal'); document.setFontSize(7); document.setTextColor(87, 104, 117);
          document.text('Houle Hs', x, top); document.text('Période moyenne', x + metricColumn, top);
          document.setFont('helvetica', 'bold'); document.setFontSize(13); document.setTextColor(24, 44, 62);
          document.text(metric(forecast.waves?.heightMeters, 'm', height), x, top + 17);
          document.text(metric(forecast.waves?.periodSeconds, 's'), x + metricColumn, top + 17); top += 33;
          document.setFont('helvetica', 'normal'); document.setFontSize(7.5); document.setTextColor(55, 71, 84);
          document.text(`Provenance houle : ${metric(forecast.waves?.directionDegrees, '°', integer)}`, x, top); top += 12;
        }
        if (card.messageLines.length) {
          document.setFont('helvetica', 'normal'); document.setFontSize(7.5); document.setTextColor(70, 80, 95);
          document.text(card.messageLines, x, top, { lineHeightFactor: 1.3 }); top += card.messageLines.length * 10 + 4;
        }
        if (forecast) {
          document.setFillColor(237, 246, 251);
          document.roundedRect(x - 1, top, cell.cell.width - 22, 24 + card.windLines.length * 10, 3, 3, 'F');
          document.setFont('helvetica', 'normal'); document.setFontSize(7); document.setTextColor(55, 95, 119);
          document.text('Vent moyen 10 m', x + 5, top + 12);
          document.setFont('helvetica', forecast.wind ? 'bold' : 'normal'); document.setFontSize(8.5); document.setTextColor(24, 44, 62);
          document.text(card.windLines, x + 5, top + 25, { lineHeightFactor: 1.15 });
          top += 24 + card.windLines.length * 10 + 5;
        }
        if (card.locationLines.length) {
          document.setFont('helvetica', 'normal'); document.setFontSize(6.5); document.setTextColor(55, 71, 84);
          document.text(card.locationLines, x, top, { lineHeightFactor: 1.15 }); top += card.locationLines.length * 8;
        }
        if (card.observedLines.length) {
          document.setDrawColor(209, 220, 230); document.line(x, top, x + cell.cell.width - 24, top); top += 12;
          document.setFont('helvetica', 'normal'); document.setFontSize(6.5); document.setTextColor(55, 71, 84);
          document.text(card.observedLines, x, top, { lineHeightFactor: 1.2 });
        }
      },
    });
  else paragraph('Aucun point de passage renseigné.');
  if (signed && passageRows.some((row) => row.observation?.status === 'recorded')) {
    heading('Mesures officielles après le passage', true);
    paragraph('Annexe ajoutée après la validation. Les mesures des stations proches ne modifient ni la prévision conservée, ni la décision du Capitaine.');
    for (const row of passageRows) if (row.observation?.status === 'recorded') {
      heading(`Waypoint ${row.waypoint} - ETA ${row.eta}`, true);
      paragraph(row.observedWeather);
    }
  }
  if (passageRows.some((row) => row.weatherFootnote || row.radioFootnote)) {
    heading('Sources et horaires du Passage Plan', true);
    for (const row of passageRows) {
      if (row.weatherFootnote) paragraph(`Waypoint ${row.waypoint} - ${row.weatherFootnote}`);
      if (row.radioFootnote) paragraph(`Waypoint ${row.waypoint} - ${row.radioFootnote}`);
    }
  }
  if (passageRows.some(row => row.ukcFootnote)) {
    newPage('landscape');
    heading('Annexe UKC - estimations statiques indicatives', true);
    for (const row of passageRows) if (row.ukcFootnote) {
      heading(`Waypoint ${row.waypoint} - ETA ${row.eta}`, true);
      for (const detail of row.ukcPresentation.details) paragraph(detail);
      for (const url of row.ukcPresentation.sourceUrls) paragraph(`Source : Copernicus Marine Service - ${url}`);
    }
  }
  const radioContacts = signed ? [] : seaOperationRadioContacts(form.waypoints).contacts;
  if (radioContacts.length) {
    heading('Contacts VHF proposés par proximité');
    paragraph(`Annuaire de préparation vérifié le ${date(SEA_RADIO_VERIFIED_ON)}. Repères arrondis à moins de 80 M (centres) ou 10 M (ports) de la route. Ce filtre ne détermine ni une compétence SAR / VTS, ni la portée radio. Annexe indicative, distincte de la décision signée.`);
    table(radioContacts.map((contact) => [contact.name, `Canal ${contact.vhf}`, [contact.phone, contact.mmsi ? `MMSI ${contact.mmsi}` : ''].filter(Boolean).join('\n') || '-', contact.sourceLabel]), ['Contact', 'VHF', 'Téléphone / MMSI', 'Source']);
  }
  newPage('portrait');
  heading('4 - Décision du Capitaine');
  paragraph(form.decision === 'GO' ? 'GO - La mission peut être réalisée.' : form.decision === 'NO_GO' ? 'NO GO - La mission ne peut être réalisée. Transmettre à l’Armement les risques identifiés.' : 'Décision à renseigner.', true);
  if (!signed) paragraph('BROUILLON - cette décision n’a pas été signée.', true);
  fields([['Risques identifiés / informations à transmettre à l’Armement', form.risks], ['Prénom NOM du Capitaine', form.signature.captainName], ['Date / Lieu', `${date(form.signature.date)} / ${value(form.signature.place)}`]]);
  if (form.signature.acknowledged) paragraph(signed ? 'En qualité de Capitaine, je confirme les informations renseignées et signe cette décision.' : 'Attestation cochée dans le brouillon - signature non enregistrée.');
  page(signed ? 260 : 130);
  if (options.signatureImage) {
    page(100); heading(signed ? 'Signature RH du Capitaine' : 'Signature RH préparée - décision non signée', true);
    try {
      const image = document.getImageProperties(options.signatureImage);
      const ratio = Math.min(210 / image.width, 65 / image.height);
      document.addImage(options.signatureImage, image.fileType, LEFT, y, image.width * ratio, image.height * ratio);
      y += image.height * ratio + 12;
    } catch { throw new Error('L’image privée de signature RH ne peut pas être lue. Aucun PDF avec une signature remplacée ne sera produit.'); }
  } else paragraph(signed ? 'Image de signature RH non disponible pour cette fiche historique. La preuve de décision enregistrée figure ci-dessous.' : 'Aucune signature RH apposée - décision non signée.');
  if (signed) fields([['Identité du compte signataire', value(record.signedByName)], ['Capitaine signataire enregistré', value(record.captainName)], ['Horodatage de signature (heure de Paris)', timestamp(record.signedAt)], ['État de la fiche', 'Signée et figée'], ['Identifiant / Version', `${record.id} / ${record.version}`]]);
  if (form.applicability.divingSupport === 'yes') {
    heading('Annexe - Kit médical plongée prévu par le formulaire');
    paragraph('En plus de la dotation médicale réglementaire, tout navire ayant des plongeurs professionnels à bord est équipé en permanence d’une trousse de secours plongée, comme défini dans la division 217 citée par le formulaire.');
    table(DIVING_MEDICAL_KIT.map((item) => [item.article, String(item.quantity), item.detail || 'Unité']), ['Article', 'Quantité', 'Présentation / remarques']);
  }

  let source;
  try { source = await PDFDocument.load(template); } catch { throw new Error('Le modèle Word d’en-tête et de pied de page est invalide.'); }
  if (source.getPageCount() !== 1) throw new Error('Le modèle Word d’en-tête et de pied de page est invalide.');
  // Normalize each crop to a page whose origin is zero; repeated nonzero Form BBoxes render inconsistently across PDF viewers.
  const chromeDocument = await PDFDocument.create();
  const [originalWordPage] = await chromeDocument.embedPdf(source, [0]);
  const headerPage = chromeDocument.addPage([PAGE_WIDTH, WORD_HEADER_HEIGHT]);
  headerPage.drawPage(originalWordPage, { x: 0, y: WORD_HEADER_HEIGHT - PAGE_HEIGHT });
  const footerPage = chromeDocument.addPage([PAGE_WIDTH, WORD_FOOTER_HEIGHT]);
  footerPage.drawPage(originalWordPage, { x: 0, y: 0 });
  const output = await PDFDocument.create();
  const [header, footer] = await output.embedPdf(await chromeDocument.save(), [0, 1]);
  const bodyDocument = await PDFDocument.load(document.output('arraybuffer'));
  const body = await output.embedPdf(bodyDocument, bodyDocument.getPageIndices());
  for (const content of body) {
    const sheet = output.addPage([content.width, content.height]);
    sheet.drawPage(content, { x: 0, y: 0 });
    const x = (content.width - PAGE_WIDTH) / 2;
    // Native-size vector fragments: translate the original chrome without stretching the logo or fonts.
    sheet.drawPage(header, { x, y: content.height - WORD_HEADER_HEIGHT });
    sheet.drawPage(footer, { x, y: 0 });
  }
  output.setTitle(`GO / NO GO - OPÉRATION EN MER - ${form.project}`);
  output.setSubject('OPE-FOR-10-C'); output.setCreator('SeaPilot'); output.setProducer('SeaPilot');
  return { bytes: await output.save(), filename: seaOperationPdfFilename(record), pageCount: output.getPageCount() };
}

export async function exportSeaOperationPdf(record: SeaOperationRecord, options: SeaOperationPdfOptions = {}): Promise<SeaOperationGeneratedPdf> {
  const generated = await generateSeaOperationPdf(record, options);
  const url = URL.createObjectURL(new Blob([new Uint8Array(generated.bytes)], { type: 'application/pdf' }));
  const anchor = window.document.createElement('a');
  anchor.href = url; anchor.download = generated.filename; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return generated;
}
