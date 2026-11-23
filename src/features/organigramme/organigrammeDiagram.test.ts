import { describe, expect, it } from 'vitest';
import { layoutOrganigramme, ORG_COLORS, ORG_DPA_BADGE_LABEL, orgBoxFill, orgBoxMedia, orgBoxTextColor, orgBoxTextTop, orgBoxTextX, orgDpaBadge, organigrammeSvg } from './organigrammeDiagram';
import { buildOrganigramme, type OrgMember, type OrgOptions, type OrgSection } from './organigrammeModel';
import { ORG_GOVERNANCE_DEMO, ORG_HIERARCHY_DEMO } from './organigrammeFixtures';
import { ORG_CARD_COLORS } from './organigrammeCardColors';
import { orgContactPeople } from './organigrammeContacts';

const portrait = 'data:image/png;base64,iVBORw0KGgo=';
const members: OrgMember[] = [
  { id: 1, name: 'Alex MARTIN', functionLabel: 'Président', detail: '', rank: '1', photoUrl: portrait },
  { id: 2, name: 'Christophe MINASSIAN', functionLabel: 'Directeur QHSE / RSE · Responsable projets EMR · DPA', detail: '', rank: '2', photoUrl: portrait },
  { id: 3, name: 'Julien LECOCQ', functionLabel: 'Capitaine d’Armement · Superintendant Technique', detail: '', rank: '2' },
  { id: 4, name: 'Louise FAURE', functionLabel: 'Support', detail: '', rank: 'support', photoUrl: portrait },
];

describe('category card geometry', () => {
  it.each(['office', 'external', 'functions', 'unassigned', 'vessel'] as const)('uses equal cards and larger circular portraits throughout %s', (kind) => {
    const section: OrgSection = { key: kind, kind, label: 'Catégorie', columns: members.map((member) => ({ key: String(member.id), label: '', members: [member] })) };
    const diagram = layoutOrganigramme([section]);
    const cards = diagram.boxes.filter((box) => box.tone !== 'navy');
    expect(cards).toHaveLength(members.length);
    expect(new Set(cards.map((box) => `${box.width}:${box.height}`)).size).toBe(1);
    const photos = cards.filter((box) => box.mediaKind === 'portrait');
    expect(new Set(photos.map((box) => orgBoxMedia(box).width)).size).toBe(1);
    expect(orgBoxMedia(photos[0]).width).toBe(80);
    cards.forEach((box) => {
      const top = orgBoxTextTop(box);
      expect(top).toBeGreaterThanOrEqual(box.y + 12);
      expect(top + box.lines.reduce((height, line) => height + line.size + 5, 0)).toBeLessThanOrEqual(box.y + box.height - 12);
      if (box.mediaKind === 'portrait') {
        const media = orgBoxMedia(box);
        expect(media.width).toBe(media.height);
        expect(media.y + media.height / 2).toBe(box.y + box.height / 2);
        box.lines.forEach((line) => expect(orgBoxTextX(box) - line.text.length * line.size * .62 / 2).toBeGreaterThanOrEqual(media.x + media.width + 12));
      }
    });
    diagram.boxes.forEach((box, index) => diagram.boxes.slice(index + 1).forEach((other) => {
      expect(box.x >= other.x + other.width || other.x >= box.x + box.width || box.y >= other.y + other.height || other.y >= box.y + box.height).toBe(true);
    }));
    const svg = organigrammeSvg(diagram);
    expect((svg.match(/<clipPath /g) || []).length).toBe(3);
    expect((svg.match(/preserveAspectRatio="xMidYMid slice"/g) || []).length).toBe(3);
  });

  it('keeps fleet cards equal across ships and recalculates after removing optional content', () => {
    const data = { ...ORG_HIERARCHY_DEMO, people: ORG_HIERARCHY_DEMO.people.map((person) => ({ ...person, photoUrl: portrait })) };
    const options = { view: 'functions' as const, vesselIds: null, includeOffice: true, includeExternal: true, includeUnassigned: true, showVessels: true, showEmails: true, showPhones: true };
    const full = layoutOrganigramme(buildOrganigramme(data, options).filter((section) => section.kind === 'office'));
    const compact = layoutOrganigramme(buildOrganigramme(data, { ...options, showPhotos: false, showFunctions: false, showEmails: false, showPhones: false }).filter((section) => section.kind === 'office'));
    expect(compact.boxes[1].height).toBeLessThan(full.boxes[1].height);
    expect(new Set(compact.boxes.filter((box) => box.tone !== 'navy').map((box) => box.height)).size).toBe(1);
    const fleet = layoutOrganigramme(buildOrganigramme(data, { ...options, view: 'vessels' }).filter((section) => section.kind === 'vessel'));
    expect(new Set(fleet.boxes.filter((box) => box.tone === 'white').map((box) => `${box.width}:${box.height}`)).size).toBe(1);
    expect(new Set(fleet.boxes.filter((box) => box.mediaKind === 'portrait').map((box) => box.portraitSize)).size).toBe(1);
  });
});

describe('governance relationships and person card colors', () => {
  const options: OrgOptions = { view: 'vessels', vesselIds: [1, 3], includeOffice: true, includeExternal: true, includeUnassigned: true, showVessels: true };

  it.each([{ ids: [1] }, { ids: [1, 3] }])('connects both roles on distinct parallel lines with selected vessels $ids', ({ ids }) => {
    const diagram = layoutOrganigramme(buildOrganigramme(ORG_GOVERNANCE_DEMO, { ...options, vesselIds: ids }));
    const vessels = diagram.boxes.filter((box) => box.vesselId !== undefined);
    expect(vessels.map((box) => box.vesselId)).toEqual(ids);
    const dpa = diagram.boxes.find((box) => box.officeRoles?.includes('dpa'))!;
    const president = diagram.boxes.find((box) => box.officeRoles?.includes('president'))!;
    const armement = diagram.boxes.find((box) => box.officeRoles?.includes('armementCaptain'))!;
    expect(orgBoxFill(dpa)).toBe(ORG_COLORS.dpa);
    const badge = orgDpaBadge(dpa)!;
    expect(badge).toMatchObject({ x: dpa.x, width: dpa.width });
    expect(badge.y + badge.height).toBe(dpa.y + dpa.height);
    expect(dpa.lines.map((line) => line.text).join(' ')).not.toMatch(/\bDPA\b/);
    for (const ship of vessels) {
      const incoming = diagram.lines.filter((line) => line.y2 === ship.y && line.x2 > ship.x && line.x2 < ship.x + ship.width && line.dashed && line.relationship);
      expect(incoming.map((line) => line.relationship).sort()).toEqual(['armement', 'dpa']);
      expect(Math.abs(incoming[0].x2 - incoming[1].x2)).toBe(9);
    }
    const verticals = diagram.lines.filter((line) => line.dashed && line.x1 === line.x2);
    expect(verticals.some((line) => line.relationship === 'armement' && verticals.some((red) =>
      red.relationship === 'dpa' && Math.abs(line.x1 - red.x1) === 9 && Math.min(line.y2, red.y2) - Math.max(line.y1, red.y1) > 30,
    ))).toBe(true);
    expect(diagram.lines.some((line) => line.relationship === 'armement' && line.y1 === armement.y + armement.height)).toBe(true);
    expect(diagram.lines.some((line) => line.relationship === 'dpa' && line.dashed && line.y1 === dpa.y + dpa.height)).toBe(true);
    const bends = [dpa, armement].map((card) => diagram.lines.find((line) => line.dashed && line.relationship &&
      line.x1 === card.x + card.width / 2 && line.x1 === line.x2 && line.y1 === card.y + card.height)?.y2);
    expect(bends[0]).toBeDefined();
    expect(bends[0]).toBe(bends[1]);
    expect(diagram.lines.some((line) => line.relationship === 'dpa' && !line.dashed && line.y1 === dpa.y)).toBe(true);
    expect(diagram.lines.some((line) => line.relationship === 'dpa' && !line.dashed && line.y2 === president.y + president.height)).toBe(true);
    const svg = organigrammeSvg(diagram);
    expect(svg).toContain(ORG_DPA_BADGE_LABEL);
    expect(svg).toContain('Lien hiérarchique');
    expect(svg).toContain('Accès direct au Président via le DPA');
    expect(svg).toContain(`stroke="${ORG_COLORS.hierarchy}" stroke-width="2" stroke-dasharray="5 4"`);
    expect(svg).toContain(`stroke="${ORG_COLORS.dpaInk}" stroke-width="2" stroke-dasharray="5 4"`);
    expect(svg).toContain(`stroke="${ORG_COLORS.dpaInk}" stroke-width="2"/>`);
  });

  it('omits relations with missing or ambiguous endpoints, and ignores DPA assistants', () => {
    const withoutVessels = layoutOrganigramme(buildOrganigramme(ORG_GOVERNANCE_DEMO, { ...options, vesselIds: [] }));
    expect(withoutVessels.lines.filter((line) => line.relationship).every((line) => line.relationship === 'dpa' && !line.dashed)).toBe(true);
    expect(withoutVessels.lines.some((line) => line.relationship === 'dpa')).toBe(true);
    const withoutOffice = layoutOrganigramme(buildOrganigramme(ORG_GOVERNANCE_DEMO, { ...options, includeOffice: false }));
    expect(withoutOffice.lines.some((line) => line.relationship)).toBe(false);
    const additionalRole = { id: 102, personId: null, name: 'Autre personne', functionLabel: 'Adjointe DPA', category: 'office' as const, position: 3 };
    const withAssistant = { ...ORG_GOVERNANCE_DEMO, support: [...ORG_GOVERNANCE_DEMO.support, additionalRole] };
    expect(layoutOrganigramme(buildOrganigramme(withAssistant, options)).boxes.filter((box) => box.tone === 'dpa')).toHaveLength(1);
    const ambiguous = { ...ORG_GOVERNANCE_DEMO, support: [...ORG_GOVERNANCE_DEMO.support, { ...additionalRole, functionLabel: 'Personne désignée à terre' }] };
    const diagram = layoutOrganigramme(buildOrganigramme(ambiguous, options));
    expect(diagram.boxes.some((box) => box.tone === 'dpa')).toBe(false);
    expect(diagram.lines.some((line) => line.relationship === 'dpa')).toBe(false);
    expect(diagram.lines.some((line) => line.relationship === 'armement')).toBe(true);
  });

  it('aligns the bends around a lower office tier and connects support cards at the center of their top edge', () => {
    const data = { ...ORG_GOVERNANCE_DEMO, support: [...ORG_GOVERNANCE_DEMO.support, {
      id: 100, personId: null, name: 'Responsable de chantier', functionLabel: 'Maintenance', category: 'office' as const, rank: '4' as const, position: 1,
    }] };
    const diagram = layoutOrganigramme(buildOrganigramme(data, options));
    const lowerTier = diagram.boxes.find((box) => box.lines.some((line) => line.text === 'Responsable de chantier'))!;
    const support = diagram.boxes.find((box) => box.tone === 'support')!;
    const topCenter = support.x + support.width / 2;
    expect(diagram.lines).toContainEqual({ x1: topCenter, y1: support.y - 12, x2: topCenter, y2: support.y, dashed: true });
    expect(diagram.lines.some((line) => line.dashed && line.y1 === line.y2 &&
      line.y2 > support.y && line.y2 < support.y + support.height &&
      [line.x1, line.x2].some((x) => x === support.x || x === support.x + support.width))).toBe(false);
    const runs = diagram.lines.filter((line) => line.dashed && line.relationship && line.x1 === line.x2 &&
      line.y1 < lowerTier.y && line.y2 > lowerTier.y + lowerTier.height);
    expect(runs.map((line) => line.relationship).sort()).toEqual(['armement', 'dpa']);
    expect(runs[0].y1).toBe(runs[1].y1);
    expect(runs.every((line) => line.x1 < lowerTier.x || line.x1 > lowerTier.x + lowerTier.width)).toBe(true);
  });

  it.each([
    { view: 'vessels', showVessels: true, showWatches: true },
    { view: 'vessels', showVessels: false, showWatches: true },
    { view: 'vessels', showVessels: false, showWatches: false },
    { view: 'functions', showVessels: false, showWatches: false },
  ] as const)('reaches every assigned card by its top edge in $view (vessels $showVessels / watches $showWatches)', (visibility) => {
    const data = {
      ...ORG_GOVERNANCE_DEMO,
      people: [...ORG_GOVERNANCE_DEMO.people, { id: 30, name: 'Marin sans affectation', functionLabel: 'Matelot', population: 'offshore' }],
      memberships: [...ORG_GOVERNANCE_DEMO.memberships, { personId: 2, vesselId: 3, watchGroup: 'Bordée 1', functionLabel: 'Capitaine', source: 'manual' as const }],
    };
    const diagram = layoutOrganigramme(buildOrganigramme(data, { ...options, vesselIds: null, ...visibility }), visibility.showVessels);
    const red = diagram.lines.filter((line) => line.dashed && line.relationship === 'dpa');
    const assigned = diagram.boxes.filter((box) => box.person && box.person.id >= 2 && box.person.id <= 10);
    expect(assigned).toHaveLength(visibility.view === 'functions' ? 9 : 10);
    for (const card of assigned) {
      const top = red.find((line) => line.y2 === card.y && line.x2 > card.x && line.x2 < card.x + card.width);
      expect(top).toBeDefined();
      expect(top?.x1).toBe(top?.x2);
      if (visibility.view === 'functions') continue;
      const next = assigned.find((other) => other.x === card.x && other.y === card.y + card.height + 12);
      if (next) {
        const gap = diagram.lines.filter((line) => line.y1 === card.y + card.height && line.y2 === next.y &&
          line.x1 === line.x2 && line.x2 > card.x && line.x2 < card.x + card.width);
        expect(gap.map((line) => line.relationship)).toEqual([undefined, 'dpa']);
        expect(gap[0].x2).toBe(card.x + card.width / 2);
        expect(gap[1].x2).toBe(top!.x2);
      }
      expect(diagram.lines.some((line) => line.y1 === line.y2 && line.y2 > card.y && line.y2 < card.y + card.height &&
        [line.x1, line.x2].some((x) => x === card.x || x === card.x + card.width))).toBe(false);
    }
    const unconnected = diagram.boxes.filter((box) => box.person?.id === 30 || box.lines.some((line) => line.text === 'Bordée à composer'));
    expect(unconnected.length).toBeGreaterThan(0);
    for (const card of unconnected) {
      expect(red.some((line) => [line.y1, line.y2].some((y) => y >= card.y && y <= card.y + card.height) &&
        [line.x1, line.x2].some((x) => x >= card.x && x <= card.x + card.width))).toBe(false);
    }
  });

  it('uses a saved pastel for each person and keeps leader and DPA text legible', () => {
    const data = { ...ORG_GOVERNANCE_DEMO, cardColors: { 1: 'blue', 2: 'green', 11: 'lavender' } as const };
    const diagram = layoutOrganigramme(buildOrganigramme(data, options));
    const president = diagram.boxes.find((box) => box.person?.id === 1)!;
    const captain = diagram.boxes.find((box) => box.person?.id === 2)!;
    const dpa = diagram.boxes.find((box) => box.person?.id === 11)!;
    expect(orgBoxFill(president)).toBe(ORG_CARD_COLORS.blue.fill);
    expect(orgBoxTextColor(president, { bold: true })).toBe(ORG_COLORS.ink);
    expect(orgBoxFill(captain)).toBe(ORG_CARD_COLORS.green.fill);
    expect(orgBoxFill(dpa)).toBe(ORG_CARD_COLORS.lavender.fill);
    expect(organigrammeSvg(diagram)).toContain(ORG_DPA_BADGE_LABEL);
    expect(diagram.boxes.find((box) => box.officeRoles?.includes('armementCaptain'))?.person).toBeUndefined();
  });

  it('shows temporary functions in diagram cards and groups without changing role connections or the directory', () => {
    const data = { ...ORG_GOVERNANCE_DEMO, temporaryFunctions: { 11: 'Mission temporaire', 2: 'Chef de quart invité' } };
    const sections = buildOrganigramme(data, { ...options, view: 'functions' });
    expect(sections.find((section) => section.kind === 'functions')?.columns.find((column) => column.key === 'Chef de quart invité')?.members.map((member) => member.id)).toEqual([2]);
    const diagram = layoutOrganigramme(buildOrganigramme(data, options));
    const svg = organigrammeSvg(diagram);
    expect(svg).toContain('Mission temporaire');
    expect(svg).toContain('Chef de quart invité');
    expect(diagram.boxes.find((box) => box.person?.id === 11)?.tone).toBe('dpa');
    expect(diagram.lines.some((line) => line.relationship === 'dpa' && line.dashed)).toBe(true);
    expect(orgContactPeople(data).find((person) => person.id === 11)?.functionLabel).toContain('DPA');
    expect(orgContactPeople(data).find((person) => person.id === 2)?.functionLabel).toBe('Capitaine');
    const noFunctions = layoutOrganigramme(buildOrganigramme(data, { ...options, showFunctions: false }));
    expect(organigrammeSvg(noFunctions)).not.toMatch(/Mission temporaire|Chef de quart invité/);
    expect(noFunctions.lines.some((line) => line.relationship === 'dpa' && line.dashed)).toBe(true);
  });
});
