import { describe, expect, it } from 'vitest';
import { layoutOrganigramme, orgBoxMedia, orgBoxTextTop, orgBoxTextX, organigrammeSvg } from './organigrammeDiagram';
import { buildOrganigramme, type OrgMember, type OrgSection } from './organigrammeModel';
import { ORG_HIERARCHY_DEMO } from './organigrammeFixtures';

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
