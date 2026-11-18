import type { OrgMember, OrgOfficeRole, OrgSection } from './organigrammeModel';
import { ORG_CARD_COLORS, type OrgCardColor } from './organigrammeCardColors';

export interface OrgBounds { x: number; y: number; width: number; height: number }
export interface OrgCrewCard { personId: number; name: string; watchId: number | null }
export interface OrgTextLine { text: string; size: number; bold: boolean; highlightDpa?: boolean }
export interface OrgBox extends OrgBounds { image?: string; portraitSize?: number; mediaKind?: 'portrait' | 'vessel'; crew?: OrgCrewCard; vesselId?: number; officeRoles?: OrgOfficeRole[]; person?: { id: number; name: string }; cardColor?: OrgCardColor; tone: 'navy' | 'teal' | 'white' | 'leader' | 'support' | 'dpa'; lines: OrgTextLine[] }
export interface OrgWatchArea extends OrgBounds { watchId: number }
export interface OrgLine { x1: number; y1: number; x2: number; y2: number; dashed?: boolean; relationship?: 'armement' | 'dpa' }
export interface OrgDiagram { width: number; height: number; boxes: OrgBox[]; lines: OrgLine[]; watches?: OrgWatchArea[] }
export const ORG_COLORS = { navy: '#12364b', teal: '#e5f2f2', white: '#ffffff', leader: '#dc640c', support: '#edf0f3', dpa: '#fbe9eb', dpaInk: '#a1263c', ink: '#18394c', muted: '#526978', line: '#9bb7c2', border: '#ccdce3' };
export const orgBoxFill = (box: OrgBox) => box.cardColor ? ORG_CARD_COLORS[box.cardColor].fill : ORG_COLORS[box.tone];
export const orgBoxTextColor = (box: OrgBox, bold: boolean) => !box.cardColor && (box.tone === 'navy' || box.tone === 'leader') ? '#ffffff' : bold ? ORG_COLORS.ink : ORG_COLORS.muted;
export const orgLineColor = (line: OrgLine) => line.relationship === 'dpa' ? ORG_COLORS.dpaInk : line.relationship === 'armement' ? ORG_COLORS.navy : ORG_COLORS.line;

export function orgTextRuns(box: OrgBox, line: OrgTextLine) {
  const color = orgBoxTextColor(box, line.bold);
  const parts = line.highlightDpa ? line.text.split(/(\bDPA\b)/gi) : [line.text];
  return parts.map((text, index) => ({ text, color: index % 2 ? ORG_COLORS.dpaInk : color })).filter((part) => part.text);
}

// Conservative character budget keeps SVG, PNG and PDF text inside the same boxes.
export function wrapOrgText(text: string, max = 27): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').flatMap((word) => word.length > max ? word.match(new RegExp(`.{1,${max}}`, 'gu')) || [] : [word]);
  const lines: string[] = [];
  words.forEach((word) => {
    const last = lines.at(-1);
    if (last && last.length + word.length + 1 <= max) lines[lines.length - 1] += ` ${word}`;
    else lines.push(word);
  });
  return lines;
}

interface CardMetrics { height: number; portraitSize: number }
function memberLines(person: OrgMember, portraitSize: number, office = false): OrgBox['lines'] {
  const width = 248 - 24 - (person.photoUrl ? portraitSize + 12 : 0);
  return [
    { text: person.name, size: office ? 14 : 13, bold: true },
    { text: person.functionLabel, size: 11, bold: false, highlightDpa: office && person.officeRoles?.includes('dpa') },
    { text: person.detail, size: 10, bold: false },
    { text: person.email || '', size: 10, bold: false },
    { text: person.phone || '', size: 10, bold: false },
  ].flatMap((line) => wrapOrgText(line.text, Math.floor(width / (line.size * .62))).filter(Boolean).map((text) => ({ ...line, text })));
}
const textHeight = (lines: OrgBox['lines']) => lines.reduce((total, line) => total + line.size + 5, 0);

/** One size for every person in a category, including cards without a portrait. */
function categoryCardMetrics(members: OrgMember[], office = false): CardMetrics {
  const hasPhotos = members.some((person) => person.photoUrl);
  const heightFor = (size: number) => Math.max(64, hasPhotos ? size + 24 : 0, ...members.map((person) => 24 + textHeight(memberLines(person, size, office))));
  const portraitSize = hasPhotos ? Math.min(80, heightFor(64) - 24) : 0;
  return { height: heightFor(portraitSize), portraitSize };
}

function memberCard(person: OrgMember, x: number, y: number, metrics: CardMetrics, office = false): OrgBox {
  return { x, y, width: 248, height: metrics.height, lines: memberLines(person, metrics.portraitSize, office),
    tone: office && person.officeRoles?.includes('dpa') ? 'dpa' : office && person.rank === '1' ? 'leader' : office && person.rank === 'support' ? 'support' : 'white',
    ...(office && person.officeRoles?.length ? { officeRoles: person.officeRoles } : {}),
    ...(person.id > 0 ? { person: { id: person.id, name: person.name } } : {}),
    ...(person.cardColor ? { cardColor: person.cardColor } : {}),
    ...(person.watchId === undefined ? {} : { crew: { personId: person.id, name: person.name, watchId: person.watchId } }),
    ...(person.photoUrl ? { image: person.photoUrl, mediaKind: 'portrait' as const, portraitSize: metrics.portraitSize } : {}),
  };
}

function layoutSection(section: OrgSection, showVessels: boolean, sharedHeadingHeight?: number, sharedMetrics?: CardMetrics): OrgDiagram {
  const diagram: OrgDiagram = { width: 320, height: 40, boxes: [], lines: [] };
  let y = 24;
  const columnWidth = 270;
  const columns = section.columns.length ? section.columns : [{ key: 'empty', label: 'Aucune bordée', members: [] }];
  const metrics = sharedMetrics ?? categoryCardMetrics(columns.flatMap((column) => column.members));
  const sectionWidth = columns.length * columnWidth - 22;
  diagram.width = Math.max(diagram.width, sectionWidth + 48);
  const hasHeading = section.kind !== 'vessel' || showVessels;
  if (hasHeading) {
    const headingWidth = Math.min(sectionWidth, 440);
    const headingLines = wrapOrgText(section.label, section.kind === 'vessel' ? 20 : 26).map((text) => ({ text, size: 16, bold: true }));
    const headingHeight = sharedHeadingHeight ?? Math.max(section.kind === 'vessel' ? 64 : 0, 24 + headingLines.length * 20);
    diagram.boxes.push({ x: 24 + (sectionWidth - headingWidth) / 2, y, width: headingWidth, height: headingHeight, tone: 'navy', lines: headingLines, ...(section.kind === 'vessel' ? { image: section.iconDataUrl, mediaKind: 'vessel' as const, vesselId: section.vesselId } : {}) });
    const middle = 24 + sectionWidth / 2;
    diagram.lines.push({ x1: middle, y1: y + headingHeight, x2: middle, y2: y + headingHeight + 16 });
    y += headingHeight + 32;
    diagram.lines.push({ x1: 24 + 124, y1: y - 16, x2: 24 + sectionWidth - 124, y2: y - 16 });
  }
  let bottom = y;
  const headerLines = columns.map((column) => wrapOrgText(column.label, 26));
  const showColumnHeaders = columns.some((column) => column.label);
  const headerHeight = showColumnHeaders ? 24 + Math.max(...headerLines.map((lines) => lines.length)) * 17 : 0;
  columns.forEach((column, index) => {
    const x = 24 + index * columnWidth;
    const center = x + 124;
    if (hasHeading) diagram.lines.push({ x1: center, y1: y - 16, x2: center, y2: y });
    if (showColumnHeaders) diagram.boxes.push({ x, y, width: 248, height: headerHeight, tone: 'teal', lines: headerLines[index].map((text) => ({ text, size: 13, bold: true })) });
    let cardY = y + headerHeight + (showColumnHeaders ? 18 : 0);
    const members = column.members.length ? column.members : [{ id: -1, name: 'Bordée à composer', functionLabel: '', detail: '' }];
    members.forEach((person) => {
      const { height } = metrics;
      // A side rail denotes ordered members of a bordée, not invented reporting lines.
      if (showColumnHeaders) {
        diagram.lines.push({ x1: x - 9, y1: y + headerHeight / 2, x2: x - 9, y2: cardY + height / 2 });
        diagram.lines.push({ x1: x - 9, y1: cardY + height / 2, x2: x, y2: cardY + height / 2 });
      }
      diagram.boxes.push(memberCard(person, x, cardY, metrics));
      cardY += height + 12;
    });
    if (showColumnHeaders) diagram.lines.push({ x1: x - 9, y1: y + headerHeight / 2, x2: x, y2: y + headerHeight / 2 });
    bottom = Math.max(bottom, cardY);
  });
  const watchAreas = columns.flatMap((column, index) => column.watchId === undefined ? [] : [
    { watchId: column.watchId, x: 24 + index * columnWidth, y, width: 248, height: bottom - y - 12 },
  ]);
  if (watchAreas.length) diagram.watches = watchAreas;
  y = bottom + 32;
  if (section.kind === 'relations') diagram.lines.forEach((line) => { line.dashed = true; });
  diagram.height = Math.max(80, y);
  return diagram;
}

interface OfficeRails { left: number; right: number }

/** Ranks form vertical tiers; Support remains on lateral branches, outside the reporting tiers. */
function layoutOffice(section: OrgSection): OrgDiagram & { rails: OfficeRails } {
  const members = section.columns.flatMap((column) => column.members);
  const metrics = categoryCardMetrics(members, true);
  const supports = members.filter((person) => person.rank === 'support');
  const tiers = new Map<string, OrgMember[]>();
  members.filter((person) => person.rank !== 'support').forEach((person) => {
    const key = person.rank || '';
    tiers.set(key, [...(tiers.get(key) || []), person]);
  });
  const rows = [...tiers].sort(([a], [b]) => (Number(a) || 99) - (Number(b) || 99));
  const centerWidth = Math.max(518, ...rows.map(([, people]) => people.length * 270 - 22));
  const sideWidth = supports.length ? 294 : 0;
  const width = centerWidth + sideWidth * 2 + 48;
  const middle = width / 2;
  const headingLines = wrapOrgText(section.label, 35).map((text) => ({ text, size: 16, bold: true }));
  const headingHeight = 24 + headingLines.length * 20;
  const diagram: OrgDiagram = { width, height: 80, boxes: [{ x: middle - 220, y: 24, width: 440, height: headingHeight, tone: 'navy', lines: headingLines }], lines: [] };
  let y = 24 + headingHeight + 32;
  let previous: OrgBox[] = [];
  let supportY = y;
  rows.forEach(([rank, people], index) => {
    const rowWidth = people.length * 270 - 22;
    const cards = people.map((person, position) => memberCard(person, middle - rowWidth / 2 + position * 270, y, metrics, true));
    if (previous.length && rank) {
      const fromY = Math.max(...previous.map((box) => box.y + box.height)) + 16;
      previous.forEach((box) => diagram.lines.push({ x1: box.x + 124, y1: box.y + box.height, x2: box.x + 124, y2: fromY }));
      diagram.lines.push({ x1: previous[0].x + 124, y1: fromY, x2: previous.at(-1)!.x + 124, y2: fromY });
      diagram.lines.push({ x1: middle, y1: fromY, x2: middle, y2: y - 16 });
      diagram.lines.push({ x1: cards[0].x + 124, y1: y - 16, x2: cards.at(-1)!.x + 124, y2: y - 16 });
      cards.forEach((box) => diagram.lines.push({ x1: box.x + 124, y1: y - 16, x2: box.x + 124, y2: y }));
    }
    diagram.boxes.push(...cards);
    const bottom = y + Math.max(...cards.map((box) => box.height));
    if (index === 0) supportY = bottom + 38;
    previous = rank ? cards : [];
    y = bottom + 56;
  });
  const sides = [supports.filter((_, index) => index % 2 === 0), supports.filter((_, index) => index % 2 === 1)];
  let supportBottom = supportY;
  sides.forEach((people, side) => {
    const x = side === 0 ? 24 : width - 272;
    const railX = side === 0 ? x + 262 : x - 14;
    let cardY = supportY;
    people.forEach((person) => {
      const box = memberCard(person, x, cardY, metrics, true);
      diagram.boxes.push(box);
      diagram.lines.push({ x1: railX, y1: supportY - 24, x2: railX, y2: cardY + box.height / 2, dashed: true });
      diagram.lines.push({ x1: railX, y1: cardY + box.height / 2, x2: side === 0 ? x + 248 : x, y2: cardY + box.height / 2, dashed: true });
      cardY += box.height + 18;
    });
    if (people.length) diagram.lines.push({ x1: middle, y1: supportY - 24, x2: railX, y2: supportY - 24, dashed: true });
    supportBottom = Math.max(supportBottom, cardY);
  });
  diagram.height = Math.max(y, supportBottom + 24);
  return { ...diagram, rails: { left: sideWidth + 12, right: width - sideWidth - 12 } };
}

type Point = [x: number, y: number];

function addPath(diagram: OrgDiagram, points: Point[], style: Pick<OrgLine, 'relationship' | 'dashed'>) {
  points.slice(1).forEach(([x2, y2], index) => {
    const [x1, y1] = points[index];
    if (x1 !== x2 || y1 !== y2) diagram.lines.push({ x1, y1, x2, y2, ...style });
  });
}

function pathClearsCards(points: Point[], cards: OrgBox[]) {
  return points.slice(1).every(([x2, y2], index) => {
    const [x1, y1] = points[index];
    return cards.every((box) => x1 === x2
      ? x1 <= box.x || x1 >= box.x + box.width || Math.max(y1, y2) <= box.y || Math.min(y1, y2) >= box.y + box.height
      : y1 <= box.y || y1 >= box.y + box.height || Math.max(x1, x2) <= box.x || Math.min(x1, x2) >= box.x + box.width);
  });
}

function connectDpaAndPresident(diagram: OrgDiagram, dpa: OrgBox, president: OrgBox, rails: OfficeRails) {
  const abovePresident = dpa.y + dpa.height <= president.y;
  const belowPresident = president.y + president.height <= dpa.y;
  const dpaX = dpa.x + dpa.width * .42;
  const presidentX = president.x + president.width * .42;
  const dpaY = abovePresident ? dpa.y + dpa.height : dpa.y;
  const presidentY = belowPresident ? president.y + president.height : president.y;
  const laneY = abovePresident || belowPresident ? (dpaY + presidentY) / 2 : Math.min(dpaY, presidentY) - 12;
  const direct: Point[] = [[dpaX, dpaY], [dpaX, laneY], [presidentX, laneY], [presidentX, presidentY]];
  const cards = diagram.boxes.filter((box) => box !== dpa && box !== president);
  const firstBend = dpaY + (abovePresident ? 8 : -8);
  const lastBend = presidentY + (belowPresident ? 8 : -8);
  const detours = [rails.left + 6, rails.right - 6].map((x): Point[] => [
    [dpaX, dpaY], [dpaX, firstBend], [x, firstBend], [x, lastBend], [presidentX, lastBend], [presidentX, presidentY],
  ]);
  addPath(diagram, [direct, ...detours].find((path) => pathClearsCards(path, cards)) ?? direct, { relationship: 'dpa' });
}

function addOfficeRelationships(diagram: OrgDiagram, rails: OfficeRails) {
  const president = diagram.boxes.find((box) => box.officeRoles?.includes('president'));
  const dpa = diagram.boxes.find((box) => box.officeRoles?.includes('dpa'));
  const captain = diagram.boxes.find((box) => box.officeRoles?.includes('armementCaptain'));
  if (dpa && president && dpa !== president) connectDpaAndPresident(diagram, dpa, president, rails);

  const vessels = diagram.boxes.filter((box) => box.vesselId !== undefined);
  if (!vessels.length) return;
  const fleetTop = vessels[0].y;
  const fleetRoles = [
    { box: captain, relationship: 'armement' as const, laneY: fleetTop - 46, outlet: .32, bend: 8 },
    { box: dpa, relationship: 'dpa' as const, laneY: fleetTop - 22, outlet: .68, bend: 12 },
  ];
  for (const { box, relationship, laneY, outlet, bend } of fleetRoles) {
    if (!box) continue;
    const x = box.x + box.width * outlet;
    const y = box.y + box.height;
    const leftSide = x < (rails.left + rails.right) / 2;
    const railX = (leftSide ? rails.left : rails.right) + (relationship === 'dpa' ? 4 : 0);
    const targets = vessels.map((vessel) => ({ x: vessel.x + vessel.width * outlet, y: vessel.y }));
    const xs = [railX, ...targets.map((target) => target.x)];
    const style = { relationship, dashed: true };
    addPath(diagram, [[x, y], [x, y + bend], [railX, y + bend], [railX, laneY]], style);
    addPath(diagram, [[Math.min(...xs), laneY], [Math.max(...xs), laneY]], style);
    targets.forEach((target) => addPath(diagram, [[target.x, laneY], [target.x, target.y]], style));
  }
}

/** All vessels occupy one horizontal row. External advisers sit alongside the office hierarchy. */
export function layoutOrganigramme(sections: OrgSection[], showVessels = true): OrgDiagram {
  const vessels = sections.filter((section) => section.kind === 'vessel');
  const fleetMetrics = categoryCardMetrics(vessels.flatMap((section) => section.columns.flatMap((column) => column.members)));
  const headingHeight = Math.max(64, ...vessels.map((section) => 24 + wrapOrgText(section.label, 20).length * 20));
  const rows: OrgDiagram[][] = [];
  const office = sections.find((section) => section.kind === 'office');
  const hierarchy = office ? layoutOffice(office) : null;
  const external = sections.find((section) => section.kind === 'external');
  let fleetRow: number | undefined;
  for (const section of sections) {
    if (section.kind === 'office' && hierarchy) {
      const advisers = external ? layoutSection({ ...external, columns: [{ key: 'external', label: '', members: external.columns.flatMap((column) => column.members) }] }, showVessels) : null;
      rows.push(advisers ? [advisers, hierarchy] : [hierarchy]);
    } else if (section.kind === 'external' && office) continue;
    else if (section.kind === 'vessel') {
      if (fleetRow === undefined) {
        fleetRow = rows.length;
        rows.push(vessels.map((vessel) => layoutSection(vessel, showVessels, headingHeight, fleetMetrics)));
      }
    } else rows.push([layoutSection(section, showVessels)]);
  }
  const gap = 24;
  const rowWidths = rows.map((row) => row.reduce((width, section) => width + section.width, 0) + (row.length - 1) * gap);
  const watches: OrgWatchArea[] = [];
  const diagram: OrgDiagram = { width: Math.max(320, ...rowWidths), height: 80, boxes: [], lines: [], watches };
  const reserveFleetConnectionSpace = showVessels && hierarchy?.boxes.some((box) => box.officeRoles?.some((role) => role === 'dpa' || role === 'armementCaptain'));
  let officeRails: OfficeRails | undefined;
  let y = 0;
  rows.forEach((row, index) => {
    if (index === fleetRow && reserveFleetConnectionSpace) y += 48;
    let x = (diagram.width - rowWidths[index]) / 2;
    row.forEach((section) => {
      if (hierarchy && section === hierarchy) officeRails = { left: x + hierarchy.rails.left, right: x + hierarchy.rails.right };
      diagram.boxes.push(...section.boxes.map((box) => ({ ...box, x: box.x + x, y: box.y + y })));
      diagram.lines.push(...section.lines.map((line) => ({ ...line, x1: line.x1 + x, x2: line.x2 + x, y1: line.y1 + y, y2: line.y2 + y })));
      watches.push(...(section.watches ?? []).map((watch) => ({ ...watch, x: watch.x + x, y: watch.y + y })));
      x += section.width + gap;
    });
    y += Math.max(...row.map((section) => section.height));
  });
  diagram.height = Math.max(80, y);
  if (officeRails) addOfficeRelationships(diagram, officeRails);
  return diagram;
}

export function orgBoxMedia(box: OrgBox) {
  const vessel = box.mediaKind === 'vessel';
  const size = box.portraitSize ?? 64;
  return { x: box.x + 12, y: box.y + (box.height - (vessel ? 42 : size)) / 2, width: vessel ? 64 : size, height: vessel ? 42 : size };
}
export const orgBoxTextX = (box: OrgBox) => box.x + (box.width + (box.mediaKind === 'vessel' ? 80 : box.mediaKind === 'portrait' ? (box.portraitSize ?? 64) + 12 : 0)) / 2;
export const orgBoxTextTop = (box: OrgBox) => box.y + (box.height - textHeight(box.lines)) / 2;
export const orgImageSource = (source?: string) => source && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(source) ? source : '';
// Shared tiny ship outline for vessels without a catalog illustration.
export const ORG_SHIP_LINES = [[5,12,12,9],[12,9,19,12],[5,12,7,18],[19,12,17,18],[7,18,17,18],[8,10,8,5],[8,5,16,5],[16,5,16,10],[12,5,12,2],[4,21,8,20],[8,20,12,21],[12,21,16,20],[16,20,20,21]];
const escapeXml = (text: string) => text.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!);
export function organigrammeSvg(diagram: OrgDiagram): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${diagram.width}" height="${diagram.height}" viewBox="0 0 ${diagram.width} ${diagram.height}" role="img" aria-label="Organigramme"><rect width="100%" height="100%" fill="white"/>${diagram.lines.map((line) => `<line x1="${line.x1}" y1="${line.y1}" x2="${line.x2}" y2="${line.y2}" stroke="${orgLineColor(line)}" stroke-width="${line.relationship ? 2 : 1.5}"${line.dashed ? ' stroke-dasharray="5 4"' : ''}/>`).join('')}${diagram.boxes.map((box) => {
    let baseline = orgBoxTextTop(box);
    const media = orgBoxMedia(box);
    const source = orgImageSource(box.image);
    const portrait = box.mediaKind === 'portrait';
    const clipId = `portrait-${box.x}-${box.y}`;
    const clip = portrait && source ? `<defs><clipPath id="${clipId}"><circle cx="${media.x + media.width / 2}" cy="${media.y + media.height / 2}" r="${media.width / 2}"/></clipPath></defs>` : '';
    const picture = source ? `${clip}<image href="${source}" x="${media.x}" y="${media.y}" width="${media.width}" height="${media.height}" preserveAspectRatio="xMidYMid ${portrait ? 'slice' : 'meet'}"${portrait ? ` clip-path="url(#${clipId})"` : ''}/>` : box.mediaKind === 'vessel' ? `<g transform="translate(${media.x + 14} ${media.y + 3}) scale(1.5)" stroke="white" stroke-width="1.5" fill="none">${ORG_SHIP_LINES.map(([x1,y1,x2,y2]) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`).join('')}</g>` : '';
    return `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="7" fill="${orgBoxFill(box)}" stroke="${box.tone === 'white' ? ORG_COLORS.border : ORG_COLORS[box.tone]}"/>${picture}${box.lines.map((line) => {
      baseline += line.size + 5;
      const color = orgBoxTextColor(box, line.bold);
      const text = orgTextRuns(box, line).map((run) => run.color === color ? escapeXml(run.text) : `<tspan fill="${run.color}">${escapeXml(run.text)}</tspan>`).join('');
      return `<text x="${orgBoxTextX(box)}" y="${baseline - 5}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${line.size}" font-weight="${line.bold ? 700 : 400}" fill="${color}">${text}</text>`;
    }).join('')}`;
  }).join('')}</svg>`;
}
