import { describe, expect, it } from 'vitest';
import { layoutOrganigramme, ORG_COLORS, orgBoxFill, orgBoxMedia, orgBoxTextColor, orgBoxTextTop, orgBoxTextX, organigrammeSvg } from './organigrammeDiagram';
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

  it('connects both roles to each displayed vessel at distinct dashed ports and links the DPA and president in solid red', () => {
    const diagram = layoutOrganigramme(buildOrganigramme(ORG_GOVERNANCE_DEMO, options));
    const vessels = diagram.boxes.filter((box) => box.vesselId !== undefined);
    expect(vessels.map((box) => box.vesselId)).toEqual([1, 3]);
    const dpa = diagram.boxes.find((box) => box.officeRoles?.includes('dpa'))!;
    const president = diagram.boxes.find((box) => box.officeRoles?.includes('president'))!;
    const armement = diagram.boxes.find((box) => box.officeRoles?.includes('armementCaptain'))!;
    expect(orgBoxFill(dpa)).toBe(ORG_COLORS.dpa);
    for (const ship of vessels) {
      const incoming = diagram.lines.filter((line) => line.y2 === ship.y && line.x2 > ship.x && line.x2 < ship.x + ship.width && line.dashed && line.relationship);
      expect(incoming.map((line) => line.relationship)).toEqual(['armement', 'dpa']);
      expect(new Set(incoming.map((line) => line.x2)).size).toBe(2);
    }
    expect(diagram.lines.some((line) => line.relationship === 'armement' && line.y1 === armement.y + armement.height)).toBe(true);
    expect(diagram.lines.some((line) => line.relationship === 'dpa' && line.dashed && line.y1 === dpa.y + dpa.height)).toBe(true);
    expect(diagram.lines.some((line) => line.relationship === 'dpa' && !line.dashed && line.y1 === dpa.y)).toBe(true);
    expect(diagram.lines.some((line) => line.relationship === 'dpa' && !line.dashed && line.y2 === president.y + president.height)).toBe(true);
    const svg = organigrammeSvg(diagram);
    expect(svg).toContain(`<tspan fill="${ORG_COLORS.dpaInk}">DPA</tspan>`);
    expect(svg).toContain(`stroke="${ORG_COLORS.navy}" stroke-width="2" stroke-dasharray="5 4"`);
    expect(svg).toContain(`stroke="${ORG_COLORS.dpaInk}" stroke-width="2" stroke-dasharray="5 4"`);
    expect(svg).toContain(`stroke="${ORG_COLORS.dpaInk}" stroke-width="2"/>`);
  });

  it('omits relations with missing or ambiguous endpoints, and ignores DPA assistants', () => {
    const withoutVessels = layoutOrganigramme(buildOrganigramme(ORG_GOVERNANCE_DEMO, { ...options, showVessels: false }), false);
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

  it('uses a saved pastel for each person and keeps leader and DPA text legible', () => {
    const data = { ...ORG_GOVERNANCE_DEMO, cardColors: { 1: 'blue', 2: 'green', 11: 'lavender' } as const };
    const diagram = layoutOrganigramme(buildOrganigramme(data, options));
    const president = diagram.boxes.find((box) => box.person?.id === 1)!;
    const captain = diagram.boxes.find((box) => box.person?.id === 2)!;
    const dpa = diagram.boxes.find((box) => box.person?.id === 11)!;
    expect(orgBoxFill(president)).toBe(ORG_CARD_COLORS.blue.fill);
    expect(orgBoxTextColor(president, true)).toBe(ORG_COLORS.ink);
    expect(orgBoxFill(captain)).toBe(ORG_CARD_COLORS.green.fill);
    expect(orgBoxFill(dpa)).toBe(ORG_CARD_COLORS.lavender.fill);
    expect(organigrammeSvg(diagram)).toContain(`<tspan fill="${ORG_COLORS.dpaInk}">DPA</tspan>`);
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
