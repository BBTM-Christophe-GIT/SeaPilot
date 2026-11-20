import type { OrgMember, OrgOfficeRole, OrgSection } from './organigrammeModel';
import { ORG_CARD_COLORS, type OrgCardColor } from './organigrammeCardColors';

export interface OrgBounds { x: number; y: number; width: number; height: number }
export interface OrgCrewCard { personId: number; name: string; watchId: number | null }
export interface OrgTextLine { text: string; size: number; bold: boolean }
export interface OrgBox extends OrgBounds { image?: string; portraitSize?: number; mediaKind?: 'portrait' | 'vessel'; crew?: OrgCrewCard; vesselId?: number; officeRoles?: OrgOfficeRole[]; dpaBadge?: boolean; person?: { id: number; name: string }; cardColor?: OrgCardColor; tone: 'navy' | 'teal' | 'white' | 'leader' | 'support' | 'dpa'; lines: OrgTextLine[] }
export interface OrgWatchArea extends OrgBounds { watchId: number }
export interface OrgLine { x1: number; y1: number; x2: number; y2: number; dashed?: boolean; relationship?: 'armement' | 'dpa' }
export interface OrgDiagram { width: number; height: number; boxes: OrgBox[]; lines: OrgLine[]; watches?: OrgWatchArea[]; legend?: { label: string; line: OrgLine }[] }
export const ORG_COLORS = { navy: '#12364b', teal: '#e5f2f2', white: '#ffffff', leader: '#dc640c', support: '#edf0f3', dpa: '#fbe9eb', dpaInk: '#a1263c', hierarchy: '#647180', ink: '#18394c', muted: '#526978', line: '#9bb7c2', border: '#ccdce3' };
export const orgBoxFill = (box: OrgBox) => box.cardColor ? ORG_CARD_COLORS[box.cardColor].fill : ORG_COLORS[box.tone];
export const orgBoxTextColor = (box: OrgBox, bold: boolean) => !box.cardColor && (box.tone === 'navy' || box.tone === 'leader') ? '#ffffff' : bold ? ORG_COLORS.ink : ORG_COLORS.muted;
export const orgLineColor = (line: OrgLine) => line.relationship === 'dpa' ? ORG_COLORS.dpaInk : line.relationship === 'armement' ? ORG_COLORS.hierarchy : ORG_COLORS.line;
export const ORG_DPA_BADGE_LABEL = 'Designated Person Ashore';
export const ORG_DPA_BADGE_FONT_SIZE = 11;
const DPA_BADGE_HEIGHT = 22;
const FLEET_LINE_GAP = 9;
const CREW_CARD_GAP = 12;
type Point = [x: number, y: number];
type Relationship = NonNullable<OrgLine['relationship']>;
type RelationshipTargets = Partial<Record<Relationship, Point[]>>;
interface SectionDiagram extends OrgDiagram { targets?: RelationshipTargets }

function hasDpaBadge(person: OrgMember, office: boolean) {
  return office && Boolean(person.officeRoles?.includes('dpa') && person.functionLabel.trim());
}

function cardFunction(person: OrgMember, office: boolean) {
  if (!hasDpaBadge(person, office)) return person.functionLabel;
  return person.functionLabel
    .replace(/(?:\s*[·;/|,]\s*|\s+[-–—]\s+)?(?:\(\s*)?\b(?:DPA|Designated Person Ashore|Personne désignée à terre)\b(?:\s*\))?/giu, '')
    .replace(/^[\s·;/|,–—-]+|[\s·;/|,–—-]+$/g, '').replace(/\s+/g, ' ');
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
    { text: cardFunction(person, office), size: 11, bold: false },
    { text: person.detail, size: 10, bold: false },
    { text: person.email || '', size: 10, bold: false },
    { text: person.phone || '', size: 10, bold: false },
  ].flatMap((line) => wrapOrgText(line.text, Math.floor(width / (line.size * .62))).filter(Boolean).map((text) => ({ ...line, text })));
}
const textHeight = (lines: OrgBox['lines']) => lines.reduce((total, line) => total + line.size + 5, 0);

/** One size for every person in a category, including cards without a portrait. */
function categoryCardMetrics(members: OrgMember[], office = false): CardMetrics {
  const hasPhotos = members.some((person) => person.photoUrl);
  const heightFor = (size: number) => Math.max(64, ...members.map((person) => (
    24 + Math.max(person.photoUrl ? size : 0, textHeight(memberLines(person, size, office))) + (hasDpaBadge(person, office) ? DPA_BADGE_HEIGHT : 0)
  )));
  const portraitSize = hasPhotos ? Math.min(80, heightFor(64) - 24) : 0;
  return { height: heightFor(portraitSize), portraitSize };
}

function memberCard(person: OrgMember, x: number, y: number, metrics: CardMetrics, office = false): OrgBox {
  return { x, y, width: 248, height: metrics.height, lines: memberLines(person, metrics.portraitSize, office),
    tone: office && person.officeRoles?.includes('dpa') ? 'dpa' : office && person.rank === '1' ? 'leader' : office && person.rank === 'support' ? 'support' : 'white',
    ...(office && person.officeRoles?.length ? { officeRoles: person.officeRoles } : {}),
    ...(hasDpaBadge(person, office) ? { dpaBadge: true } : {}),
    ...(person.id > 0 ? { person: { id: person.id, name: person.name } } : {}),
    ...(person.cardColor ? { cardColor: person.cardColor } : {}),
    ...(person.watchId === undefined ? {} : { crew: { personId: person.id, name: person.name, watchId: person.watchId } }),
    ...(person.photoUrl ? { image: person.photoUrl, mediaKind: 'portrait' as const, portraitSize: metrics.portraitSize } : {}),
  };
}

function layoutSection(section: OrgSection, showVessels: boolean, relationshipSources: readonly Relationship[] = [], sharedHeadingHeight?: number, sharedMetrics?: CardMetrics): SectionDiagram {
  const diagram: SectionDiagram = { width: 320, height: 40, boxes: [], lines: [] };
  let y = 24;
  const columnWidth = 270;
  const columns = section.columns.length ? section.columns : [{ key: 'empty', label: 'Aucune bordée', members: [] }];
  const metrics = sharedMetrics ?? categoryCardMetrics(columns.flatMap((column) => column.members));
  const sectionWidth = columns.length * columnWidth - 22;
  diagram.width = Math.max(diagram.width, sectionWidth + 48);
  const isVessel = section.kind === 'vessel';
  const hasHeading = !isVessel || showVessels;
  const connectDpa = relationshipSources.includes('dpa');
  const crewPorts: Point[] = [];
  let dpaHeadingBottom: Point | undefined;
  const dpaStyle = { relationship: 'dpa', dashed: true } as const;
  if (hasHeading) {
    const headingWidth = Math.min(sectionWidth, 440);
    const headingLines = wrapOrgText(section.label, isVessel ? 20 : 26).map((text) => ({ text, size: 16, bold: true }));
    const headingHeight = sharedHeadingHeight ?? Math.max(isVessel ? 64 : 0, 24 + headingLines.length * 20);
    diagram.boxes.push({ x: 24 + (sectionWidth - headingWidth) / 2, y, width: headingWidth, height: headingHeight, tone: 'navy', lines: headingLines, ...(isVessel ? { image: section.iconDataUrl, mediaKind: 'vessel' as const, vesselId: section.vesselId } : {}) });
    const middle = 24 + sectionWidth / 2;
    for (const relationship of relationshipSources) {
      const offset = relationship === 'dpa' ? -FLEET_LINE_GAP / 2 : relationshipSources.length > 1 ? FLEET_LINE_GAP / 2 : 0;
      const portX = middle + offset;
      (diagram.targets ??= {})[relationship] = [[portX, y]];
      if (relationship === 'dpa') dpaHeadingBottom = [portX, y + headingHeight];
    }
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
    const dpaX = center - FLEET_LINE_GAP;
    if (hasHeading) diagram.lines.push({ x1: center, y1: y - 16, x2: center, y2: y });
    if (showColumnHeaders) diagram.boxes.push({ x, y, width: 248, height: headerHeight, tone: 'teal', lines: headerLines[index].map((text) => ({ text, size: 13, bold: true })) });
    let cardY = y + headerHeight + (showColumnHeaders ? (connectDpa ? 20 : 18) : 0);
    const members = column.members.length ? column.members : [{ id: -1, name: 'Bordée à composer', functionLabel: '', detail: '' }];
    const dpaColumn = connectDpa && column.members.some((person) => person.id > 0);
    if (dpaColumn) crewPorts.push([dpaX, y]);
    let previousBottom = showColumnHeaders ? y + headerHeight : undefined;
    let previousDpaBottom = previousBottom;
    members.forEach((person) => {
      const { height } = metrics;
      if (isVessel) {
        if (previousBottom !== undefined) addPath(diagram.lines, [[center, previousBottom], [center, cardY]], {});
      } else if (showColumnHeaders) {
        diagram.lines.push({ x1: x - 9, y1: y + headerHeight / 2, x2: x - 9, y2: cardY + height / 2 });
        diagram.lines.push({ x1: x - 9, y1: cardY + height / 2, x2: x, y2: cardY + height / 2 });
      }
      if (dpaColumn && person.id > 0) {
        if (previousDpaBottom !== undefined) addPath(diagram.lines, [[dpaX, previousDpaBottom], [dpaX, cardY]], dpaStyle);
        previousDpaBottom = cardY + height;
      }
      diagram.boxes.push(memberCard(person, x, cardY, metrics));
      previousBottom = cardY + height;
      cardY += height + CREW_CARD_GAP;
    });
    if (showColumnHeaders && !isVessel) diagram.lines.push({ x1: x - 9, y1: y + headerHeight / 2, x2: x, y2: y + headerHeight / 2 });
    bottom = Math.max(bottom, cardY);
  });
  if (crewPorts.length) {
    if (dpaHeadingBottom) {
      const [x, bottomY] = dpaHeadingBottom;
      const branchY = bottomY + 10;
      addPath(diagram.lines, [[x, bottomY], [x, branchY]], dpaStyle);
      connectBranches(diagram.lines, x, branchY, crewPorts, dpaStyle);
    } else {
      (diagram.targets ??= {}).dpa = crewPorts;
    }
  }
  const watchAreas = columns.flatMap((column, index) => column.watchId === undefined ? [] : [
    { watchId: column.watchId, x: 24 + index * columnWidth, y, width: 248, height: bottom - y - CREW_CARD_GAP },
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
    const branchY = supportY - 24;
    let railY = branchY;
    let cardY = supportY;
    people.forEach((person) => {
      const box = memberCard(person, x, cardY, metrics, true);
      diagram.boxes.push(box);
      const approachY = cardY - 12;
      const cardCenter = x + box.width / 2;
      addPath(diagram.lines, [[railX, railY], [railX, approachY], [cardCenter, approachY], [cardCenter, cardY]], { dashed: true });
      railY = approachY;
      cardY += box.height + 18;
    });
    if (people.length) addPath(diagram.lines, [[middle, branchY], [railX, branchY]], { dashed: true });
    supportBottom = Math.max(supportBottom, cardY);
  });
  diagram.height = Math.max(y, supportBottom + 24);
  return { ...diagram, rails: { left: sideWidth + 12, right: width - sideWidth - 12 } };
}

function addPath(lines: OrgLine[], points: Point[], style: Pick<OrgLine, 'relationship' | 'dashed'>) {
  points.slice(1).forEach(([x2, y2], index) => {
    const [x1, y1] = points[index];
    if (x1 !== x2 || y1 !== y2) lines.push({ x1, y1, x2, y2, ...style });
  });
}

function connectBranches(lines: OrgLine[], fromX: number, branchY: number, targets: Point[], style: Pick<OrgLine, 'relationship' | 'dashed'>) {
  const xs = [fromX, ...targets.map(([x]) => x)];
  addPath(lines, [[Math.min(...xs), branchY], [Math.max(...xs), branchY]], style);
  targets.forEach(([x, y]) => addPath(lines, [[x, branchY], [x, y]], style));
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
  addPath(diagram.lines, [direct, ...detours].find((path) => pathClearsCards(path, cards)) ?? direct, { relationship: 'dpa' });
}

function addOfficeRelationships(diagram: OrgDiagram, rails: OfficeRails, targets: RelationshipTargets) {
  const president = diagram.boxes.find((box) => box.officeRoles?.includes('president'));
  const dpa = diagram.boxes.find((box) => box.officeRoles?.includes('dpa'));
  const captain = diagram.boxes.find((box) => box.officeRoles?.includes('armementCaptain'));
  if (dpa && president && dpa !== president) connectDpaAndPresident(diagram, dpa, president, rails);

  const fleetRoles = ([{ box: captain, relationship: 'armement' }, { box: dpa, relationship: 'dpa' }] as const)
    .flatMap(({ box, relationship }) => box && targets[relationship]?.length ? [{
      x: box.x + box.width / 2 + (captain === dpa ? (relationship === 'armement' ? FLEET_LINE_GAP / 2 : -FLEET_LINE_GAP / 2) : 0),
      y: box.y + box.height,
      relationship,
      targets: targets[relationship],
    }] : []).sort((a, b) => a.x - b.x);
  if (!fleetRoles.length) return;

  const targetTop = Math.min(...fleetRoles.flatMap((route) => route.targets.map(([, y]) => y)));
  const routes = fleetRoles.map((role, index) => ({ ...role,
    offset: (index - (fleetRoles.length - 1) / 2) * FLEET_LINE_GAP,
    bendY: role.y + 10,
    laneY: targetTop - 32 + index * FLEET_LINE_GAP,
  }));
  const entrance = (route: typeof routes[number], railX: number): Point[] => [
    [route.x, route.y], [route.x, route.bendY], [railX, route.bendY], [railX, route.laneY],
  ];
  const sourceCenter = routes.reduce((sum, route) => sum + route.x, 0) / routes.length;
  const targetCenter = routes.reduce((sum, route) => sum + route.targets[0][0], 0) / routes.length;
  const singleTarget = routes.every((route) => route.targets.length === 1);
  const centers = singleTarget ? [targetCenter, sourceCenter, rails.left, rails.right] : [sourceCenter, rails.left, rails.right];
  // A lower office tier can force the two paths to run on opposite sides.
  const outerRails = [rails.left, rails.right];
  const railOptions = [...centers.map((center) => routes.map((route) => center + route.offset)), outerRails];
  const railXs = railOptions.find((xs) => {
    const [left, right] = routes;
    const overlapping = right && left.bendY === right.bendY && Math.max(left.x, xs[0]) > Math.min(right.x, xs[1]);
    return !overlapping && routes.every((route, index) => pathClearsCards(entrance(route, xs[index]), diagram.boxes));
  }) ?? outerRails;
  const fleetLines: OrgLine[] = [];

  routes.forEach((route, index) => {
    const { relationship, laneY } = route;
    const railX = railXs[index];
    const style = { relationship, dashed: true };
    addPath(fleetLines, entrance(route, railX), style);
    connectBranches(fleetLines, railX, laneY, route.targets, style);
  });

  // At crossings between two branches, leave a gap in the grey line so the paths read independently.
  const dpaLines = fleetLines.filter((line) => line.relationship === 'dpa');
  for (const line of fleetLines) {
    diagram.lines.push(...(line.relationship === 'armement' ? separateCrossings(line, dpaLines) : [line]));
  }
}

function separateCrossings(line: OrgLine, dpaLines: OrgLine[]): OrgLine[] {
  const horizontal = line.y1 === line.y2;
  const fixed = horizontal ? line.y1 : line.x1;
  const from = horizontal ? line.x1 : line.y1;
  const to = horizontal ? line.x2 : line.y2;
  const direction = Math.sign(to - from);
  const gap = 3;
  const crossings = [...new Set(dpaLines.flatMap((red) => {
    if ((red.y1 === red.y2) === horizontal) return [];
    const crossing = horizontal ? red.x1 : red.y1;
    const ends = horizontal ? [red.y1, red.y2] : [red.x1, red.x2];
    return crossing > Math.min(from, to) + gap && crossing < Math.max(from, to) - gap
      && fixed >= Math.min(...ends) && fixed <= Math.max(...ends) ? [crossing] : [];
  }))].sort((a, b) => (a - b) * direction);
  if (!crossings.length) return [line];

  const segment = (a: number, b: number) => horizontal ? { ...line, x1: a, x2: b } : { ...line, y1: a, y2: b };
  const segments: OrgLine[] = [];
  let start = from;
  for (const crossing of crossings) {
    if ((crossing - start) * direction > gap) segments.push(segment(start, crossing - direction * gap));
    start = crossing + direction * gap;
  }
  segments.push(segment(start, to));
  return segments;
}

function addRelationshipLegend(diagram: OrgDiagram) {
  const hierarchy = diagram.lines.some((line) => line.relationship === 'armement');
  const dpa = diagram.lines.some((line) => line.relationship === 'dpa');
  if (!hierarchy && !dpa) return;

  const inset = 28;
  for (const box of diagram.boxes) box.y += inset;
  for (const line of diagram.lines) { line.y1 += inset; line.y2 += inset; }
  for (const watch of diagram.watches ?? []) watch.y += inset;
  diagram.height += inset;
  diagram.legend = [];
  const item = (x: number, relationship: OrgLine['relationship'], dashed: boolean, label: string) => ({
    label, line: { x1: x, x2: x + 28, y1: 24, y2: 24, relationship, dashed },
  });
  if (hierarchy) diagram.legend.push(item(24, 'armement', true, 'Lien hiérarchique'));
  if (dpa) diagram.legend.push(item(hierarchy ? 182 : 24, 'dpa', diagram.lines.some((line) => line.relationship === 'dpa' && line.dashed), 'Accès direct au Président via le DPA'));
}

/** All vessels occupy one horizontal row. External advisers sit alongside the office hierarchy. */
export function layoutOrganigramme(sections: OrgSection[], showVessels = true): OrgDiagram {
  const vessels = sections.filter((section) => section.kind === 'vessel');
  const fleetMetrics = categoryCardMetrics(vessels.flatMap((section) => section.columns.flatMap((column) => column.members)));
  const headingHeight = Math.max(64, ...vessels.map((section) => 24 + wrapOrgText(section.label, 20).length * 20));
  const rows: SectionDiagram[][] = [];
  const office = sections.find((section) => section.kind === 'office');
  const hierarchy = office ? layoutOffice(office) : null;
  const external = sections.find((section) => section.kind === 'external');
  const hasDpa = hierarchy?.boxes.some((box) => box.officeRoles?.includes('dpa'));
  const hasArmement = hierarchy?.boxes.some((box) => box.officeRoles?.includes('armementCaptain'));
  const dpaSources: Relationship[] = hasDpa ? ['dpa'] : [];
  let fleetRowAdded = false;
  for (const section of sections) {
    if (section.kind === 'office' && hierarchy) {
      const advisers = external ? layoutSection({ ...external, columns: [{ key: 'external', label: '', members: external.columns.flatMap((column) => column.members) }] }, showVessels) : null;
      rows.push(advisers ? [advisers, hierarchy] : [hierarchy]);
    } else if (section.kind === 'external' && office) continue;
    else if (section.kind === 'vessel') {
      if (!fleetRowAdded) {
        fleetRowAdded = true;
        rows.push(vessels.map((vessel) => {
          const sources: Relationship[] = vessel.columns.some((column) => column.members.some((person) => person.id > 0)) ? [...dpaSources] : [];
          if (showVessels && hasArmement) sources.push('armement');
          return layoutSection(vessel, showVessels, sources, headingHeight, fleetMetrics);
        }));
      }
    } else rows.push([layoutSection(section, showVessels, section.kind === 'functions' ? dpaSources : [])]);
  }
  const gap = 24;
  const rowWidths = rows.map((row) => row.reduce((width, section) => width + section.width, 0) + (row.length - 1) * gap);
  const watches: OrgWatchArea[] = [];
  const diagram: OrgDiagram = { width: Math.max(320, ...rowWidths), height: 80, boxes: [], lines: [], watches };
  const targets: RelationshipTargets = {};
  let officeRails: OfficeRails | undefined;
  let y = 0;
  rows.forEach((row, index) => {
    if (row.some((section) => section.targets)) y += 48;
    let x = (diagram.width - rowWidths[index]) / 2;
    row.forEach((section) => {
      if (hierarchy && section === hierarchy) officeRails = { left: x + hierarchy.rails.left, right: x + hierarchy.rails.right };
      diagram.boxes.push(...section.boxes.map((box) => ({ ...box, x: box.x + x, y: box.y + y })));
      diagram.lines.push(...section.lines.map((line) => ({ ...line, x1: line.x1 + x, x2: line.x2 + x, y1: line.y1 + y, y2: line.y2 + y })));
      watches.push(...(section.watches ?? []).map((watch) => ({ ...watch, x: watch.x + x, y: watch.y + y })));
      for (const relationship of ['armement', 'dpa'] as const) {
        const points = section.targets?.[relationship];
        if (points) (targets[relationship] ??= []).push(...points.map(([portX, portY]): Point => [portX + x, portY + y]));
      }
      x += section.width + gap;
    });
    y += Math.max(...row.map((section) => section.height));
  });
  diagram.height = Math.max(80, y);
  if (officeRails) addOfficeRelationships(diagram, officeRails, targets);
  addRelationshipLegend(diagram);
  return diagram;
}

export function orgBoxMedia(box: OrgBox) {
  const vessel = box.mediaKind === 'vessel';
  const size = box.portraitSize ?? 64;
  return { x: box.x + 12, y: box.y + (orgBoxBodyHeight(box) - (vessel ? 42 : size)) / 2, width: vessel ? 64 : size, height: vessel ? 42 : size };
}
const orgBoxBodyHeight = (box: OrgBox) => box.height - (box.dpaBadge ? DPA_BADGE_HEIGHT : 0);
export const orgDpaBadge = (box: OrgBox) => box.dpaBadge ? { x: box.x, y: box.y + orgBoxBodyHeight(box), width: box.width, height: DPA_BADGE_HEIGHT } : null;
export const orgBoxTextX = (box: OrgBox) => box.x + (box.width + (box.mediaKind === 'vessel' ? 80 : box.mediaKind === 'portrait' ? (box.portraitSize ?? 64) + 12 : 0)) / 2;
export const orgBoxTextTop = (box: OrgBox) => box.y + (orgBoxBodyHeight(box) - textHeight(box.lines)) / 2;
export const orgImageSource = (source?: string) => source && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(source) ? source : '';
// Shared tiny ship outline for vessels without a catalog illustration.
export const ORG_SHIP_LINES = [[5,12,12,9],[12,9,19,12],[5,12,7,18],[19,12,17,18],[7,18,17,18],[8,10,8,5],[8,5,16,5],[16,5,16,10],[12,5,12,2],[4,21,8,20],[8,20,12,21],[12,21,16,20],[16,20,20,21]];
const escapeXml = (text: string) => text.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!);
const svgLine = (line: OrgLine) => `<line x1="${line.x1}" y1="${line.y1}" x2="${line.x2}" y2="${line.y2}" stroke="${orgLineColor(line)}" stroke-width="${line.relationship ? 2 : 1.5}"${line.dashed ? ' stroke-dasharray="5 4"' : ''}/>`;
export function organigrammeSvg(diagram: OrgDiagram): string {
  const legend = (diagram.legend ?? []).map(({ line, label }) => `${svgLine(line)}<text x="${line.x2 + 8}" y="${line.y2 + 4}" font-family="Arial, sans-serif" font-size="12" fill="${ORG_COLORS.ink}">${escapeXml(label)}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${diagram.width}" height="${diagram.height}" viewBox="0 0 ${diagram.width} ${diagram.height}" role="img" aria-label="Organigramme"><rect width="100%" height="100%" fill="white"/>${legend}${diagram.lines.map(svgLine).join('')}${diagram.boxes.map((box) => {
    let baseline = orgBoxTextTop(box);
    const media = orgBoxMedia(box);
    const source = orgImageSource(box.image);
    const portrait = box.mediaKind === 'portrait';
    const clipId = `portrait-${box.x}-${box.y}`;
    const clip = portrait && source ? `<defs><clipPath id="${clipId}"><circle cx="${media.x + media.width / 2}" cy="${media.y + media.height / 2}" r="${media.width / 2}"/></clipPath></defs>` : '';
    const picture = source ? `${clip}<image href="${source}" x="${media.x}" y="${media.y}" width="${media.width}" height="${media.height}" preserveAspectRatio="xMidYMid ${portrait ? 'slice' : 'meet'}"${portrait ? ` clip-path="url(#${clipId})"` : ''}/>` : box.mediaKind === 'vessel' ? `<g transform="translate(${media.x + 14} ${media.y + 3}) scale(1.5)" stroke="white" stroke-width="1.5" fill="none">${ORG_SHIP_LINES.map(([x1,y1,x2,y2]) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`).join('')}</g>` : '';
    const badge = orgDpaBadge(box);
    const badgeSvg = badge ? `<rect x="${badge.x}" y="${badge.y}" width="${badge.width}" height="${badge.height}" rx="${badge.height / 2}" fill="${ORG_COLORS.dpaInk}"/><text x="${badge.x + badge.width / 2}" y="${badge.y + badge.height / 2 + 4}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${ORG_DPA_BADGE_FONT_SIZE}" font-weight="700" fill="white">${ORG_DPA_BADGE_LABEL}</text>` : '';
    return `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="7" fill="${orgBoxFill(box)}" stroke="${box.tone === 'white' ? ORG_COLORS.border : ORG_COLORS[box.tone]}"/>${picture}${box.lines.map((line) => {
      baseline += line.size + 5;
      const color = orgBoxTextColor(box, line.bold);
      return `<text x="${orgBoxTextX(box)}" y="${baseline - 5}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${line.size}" font-weight="${line.bold ? 700 : 400}" fill="${color}">${escapeXml(line.text)}</text>`;
    }).join('')}${badgeSvg}`;
  }).join('')}</svg>`;
}
