import { orgRankLabel, type OrgMember, type OrgSection } from './organigrammeModel';

export interface OrgBox { x: number; y: number; width: number; height: number; tone: 'navy' | 'teal' | 'white' | 'leader' | 'support'; lines: Array<{ text: string; size: number; bold: boolean }> }
export interface OrgLine { x1: number; y1: number; x2: number; y2: number; dashed?: boolean }
export interface OrgDiagram { width: number; height: number; boxes: OrgBox[]; lines: OrgLine[] }
export const ORG_COLORS = { navy: '#12364b', teal: '#e5f2f2', white: '#ffffff', leader: '#dc640c', support: '#edf0f3', ink: '#18394c', muted: '#526978', line: '#9bb7c2', border: '#ccdce3' };
export const orgBoxTextColor = (box: OrgBox, bold: boolean) => box.tone === 'navy' || box.tone === 'leader' ? '#ffffff' : bold ? ORG_COLORS.ink : ORG_COLORS.muted;

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

function layoutSection(section: OrgSection, showVessels: boolean, sharedHeadingHeight?: number): OrgDiagram {
  const diagram: OrgDiagram = { width: 320, height: 40, boxes: [], lines: [] };
  let y = 24;
  const columnWidth = 270;
  const columns = section.columns.length ? section.columns : [{ key: 'empty', label: 'Aucune bordée', members: [] }];
  const sectionWidth = columns.length * columnWidth - 22;
  diagram.width = Math.max(diagram.width, sectionWidth + 48);
  const hasHeading = section.kind !== 'vessel' || showVessels;
  if (hasHeading) {
    const headingWidth = Math.min(sectionWidth, 440);
    const headingLines = wrapOrgText(section.label, 26).map((text) => ({ text, size: 16, bold: true }));
    const headingHeight = sharedHeadingHeight ?? 24 + headingLines.length * 20;
    diagram.boxes.push({ x: 24 + (sectionWidth - headingWidth) / 2, y, width: headingWidth, height: headingHeight, tone: 'navy', lines: headingLines });
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
      const lines = [
        ...wrapOrgText(person.name).map((text) => ({ text, size: 13, bold: true })),
        ...wrapOrgText(person.functionLabel, 32).filter(Boolean).map((text) => ({ text, size: 11, bold: false })),
        ...wrapOrgText(person.detail, 32).filter(Boolean).map((text) => ({ text, size: 10, bold: false })),
      ];
      const height = 24 + lines.reduce((total, line) => total + line.size + 5, 0);
      // A side rail denotes ordered members of a bordée, not invented reporting lines.
      if (showColumnHeaders) {
        diagram.lines.push({ x1: x - 9, y1: y + headerHeight / 2, x2: x - 9, y2: cardY + height / 2 });
        diagram.lines.push({ x1: x - 9, y1: cardY + height / 2, x2: x, y2: cardY + height / 2 });
      }
      diagram.boxes.push({ x, y: cardY, width: 248, height, tone: 'white', lines });
      cardY += height + 12;
    });
    if (showColumnHeaders) diagram.lines.push({ x1: x - 9, y1: y + headerHeight / 2, x2: x, y2: y + headerHeight / 2 });
    bottom = Math.max(bottom, cardY);
  });
  y = bottom + 32;
  if (section.kind === 'relations') diagram.lines.forEach((line) => { line.dashed = true; });
  diagram.height = Math.max(80, y);
  return diagram;
}

function officeCard(person: OrgMember, x: number, y: number): OrgBox {
  const lines = [
    ...wrapOrgText(person.name).map((text) => ({ text, size: 14, bold: true })),
    ...wrapOrgText(person.functionLabel, 32).filter(Boolean).map((text) => ({ text, size: 11, bold: false })),
    { text: orgRankLabel(person.rank), size: 10, bold: true },
  ];
  return { x, y, width: 248, height: 24 + lines.reduce((total, line) => total + line.size + 5, 0), tone: person.rank === '1' ? 'leader' : person.rank === 'support' ? 'support' : 'white', lines };
}

/** Ranks form vertical tiers; Support remains on lateral branches, outside the reporting tiers. */
function layoutOffice(section: OrgSection): OrgDiagram {
  const members = section.columns.flatMap((column) => column.members);
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
    const cards = people.map((person, position) => officeCard(person, middle - rowWidth / 2 + position * 270, y));
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
      const box = officeCard(person, x, cardY);
      diagram.boxes.push(box);
      diagram.lines.push({ x1: railX, y1: supportY - 24, x2: railX, y2: cardY + box.height / 2, dashed: true });
      diagram.lines.push({ x1: railX, y1: cardY + box.height / 2, x2: side === 0 ? x + 248 : x, y2: cardY + box.height / 2, dashed: true });
      cardY += box.height + 18;
    });
    if (people.length) diagram.lines.push({ x1: middle, y1: supportY - 24, x2: railX, y2: supportY - 24, dashed: true });
    supportBottom = Math.max(supportBottom, cardY);
  });
  diagram.height = Math.max(y, supportBottom + 24);
  return diagram;
}

/** All vessels occupy one horizontal row. External advisers sit alongside the office hierarchy. */
export function layoutOrganigramme(sections: OrgSection[], showVessels = true): OrgDiagram {
  const vessels = sections.filter((section) => section.kind === 'vessel');
  const headingHeight = Math.max(44, ...vessels.map((section) => 24 + wrapOrgText(section.label, 26).length * 20));
  const rows: OrgDiagram[][] = [];
  const office = sections.find((section) => section.kind === 'office');
  const external = sections.find((section) => section.kind === 'external');
  let fleetPlaced = false;
  for (const section of sections) {
    if (section.kind === 'office') {
      const hierarchy = layoutOffice(section);
      const advisers = external ? layoutSection({ ...external, columns: [{ key: 'external', label: '', members: external.columns.flatMap((column) => column.members) }] }, showVessels) : null;
      rows.push(advisers ? [advisers, hierarchy] : [hierarchy]);
    } else if (section.kind === 'external' && office) continue;
    else if (section.kind === 'vessel') {
      if (!fleetPlaced) rows.push(vessels.map((vessel) => layoutSection(vessel, showVessels, headingHeight)));
      fleetPlaced = true;
    } else rows.push([layoutSection(section, showVessels)]);
  }
  const gap = 24;
  const rowWidths = rows.map((row) => row.reduce((width, section) => width + section.width, 0) + (row.length - 1) * gap);
  const diagram: OrgDiagram = { width: Math.max(320, ...rowWidths), height: 80, boxes: [], lines: [] };
  let y = 0;
  rows.forEach((row, index) => {
    let x = (diagram.width - rowWidths[index]) / 2;
    row.forEach((section) => {
      diagram.boxes.push(...section.boxes.map((box) => ({ ...box, x: box.x + x, y: box.y + y })));
      diagram.lines.push(...section.lines.map((line) => ({ ...line, x1: line.x1 + x, x2: line.x2 + x, y1: line.y1 + y, y2: line.y2 + y })));
      x += section.width + gap;
    });
    y += Math.max(...row.map((section) => section.height));
  });
  diagram.height = Math.max(80, y);
  return diagram;
}

const escapeXml = (text: string) => text.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!);
export function organigrammeSvg(diagram: OrgDiagram): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${diagram.width}" height="${diagram.height}" viewBox="0 0 ${diagram.width} ${diagram.height}" role="img" aria-label="Organigramme"><rect width="100%" height="100%" fill="white"/>${diagram.lines.map((line) => `<line x1="${line.x1}" y1="${line.y1}" x2="${line.x2}" y2="${line.y2}" stroke="${ORG_COLORS.line}" stroke-width="1.5"${line.dashed ? ' stroke-dasharray="5 4"' : ''}/>`).join('')}${diagram.boxes.map((box) => {
    let baseline = box.y + 14;
    return `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="7" fill="${ORG_COLORS[box.tone]}" stroke="${box.tone === 'white' ? ORG_COLORS.border : ORG_COLORS[box.tone]}"/>${box.lines.map((line) => {
      baseline += line.size + 5;
      return `<text x="${box.x + box.width / 2}" y="${baseline - 5}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${line.size}" font-weight="${line.bold ? 700 : 400}" fill="${orgBoxTextColor(box, line.bold)}">${escapeXml(line.text)}</text>`;
    }).join('')}`;
  }).join('')}</svg>`;
}
