import { describe, expect, it } from 'vitest';
import { buildOrganigramme, orgAllTargets, orgLocalDate, orgPopulatedVessels, resolveMemberships, type OrgOptions } from './organigrammeModel';
import { layoutOrganigramme, organigrammeSvg, wrapOrgText } from './organigrammeDiagram';
import { ORG_DEMO, ORG_LINKS_DEMO, ORG_HIERARCHY_DEMO, ORG_VESSEL_FILTER_DEMO } from './organigrammeFixtures';
import { canAccessModule } from '../permissions/moduleAccess';
import { getVisibleModulesForPermissions } from '../permissions/navigationPermissions';

const options: OrgOptions = { view: 'vessels', vesselIds: null, includeOffice: true, includeExternal: true, includeUnassigned: true, showVessels: true };
describe('organigramme', () => {
  it.each(['vessels', 'watches', 'functions'] as const)('filters multiple vessels and hides empty ships in the %s view', (view) => {
    const data = ORG_VESSEL_FILTER_DEMO;
    expect(orgPopulatedVessels(data).map((vessel) => vessel.name)).toEqual(['GOURY', 'NAVIRE CÔTIER', 'LE ROZEL']);
    const selected = { ...options, view, vesselIds: [2, 1, 4], includeOffice: false, includeExternal: false };
    const sections = buildOrganigramme(data, selected);
    const svg = organigrammeSvg(layoutOrganigramme(sections));
    expect(svg).toContain('GOURY'); expect(svg).toContain('LE ROZEL');
    expect(svg).not.toContain('NAVIRE CÔTIER'); expect(svg).not.toContain('NAVIRE VIDE');
    expect(svg).not.toContain('Bordée vide'); expect(svg).not.toContain('Chloé GARCIA');
    expect(sections.some((section) => section.kind === 'unassigned')).toBe(false);
    if (view === 'vessels') expect(sections.map((section) => section.label)).toEqual(['GOURY', 'LE ROZEL']);
    expect(buildOrganigramme(data, { ...selected, vesselIds: [] })).toEqual([]);
    expect(buildOrganigramme(data, { ...selected, vesselIds: [4] })).toEqual([]);
    const all = organigrammeSvg(layoutOrganigramme(buildOrganigramme(data, { ...selected, vesselIds: null })));
    expect(all).toContain('NAVIRE CÔTIER'); expect(all).not.toContain('NAVIRE VIDE');
  });
  it('hides links to empty vessels but keeps their categories and watches available in the editor', () => {
    const data = { ...ORG_VESSEL_FILTER_DEMO, links: [{ id: 40, sourceCategory: 'external' as const, targetKind: 'category' as const, targetKey: 'vessel-4', targetSection: '', label: 'Lien vers le navire vide' }] };
    const sections = buildOrganigramme(data, options);
    expect(sections.some((section) => section.kind === 'relations')).toBe(false);
    const targets = orgAllTargets(data);
    expect(targets.some((target) => target.kind === 'category' && target.key === 'vessel-4')).toBe(true);
    expect(targets.some((target) => target.kind === 'group' && target.section === 'vessel-4' && target.key === '4-Bordée vide')).toBe(true);
    expect(data.links).toHaveLength(1);
  });
  it('keeps category, group and person links after renaming their source and target categories', () => {
    const data = { ...ORG_LINKS_DEMO, categoryLabels: { external: 'Partenaires', office: 'Gouvernance' } };
    const sections = buildOrganigramme(data, options);
    const relations = sections.find((section) => section.key === 'relations-external')!;
    expect(relations.label).toBe('Partenaires · Liens');
    expect(relations.columns.map((column) => column.members[0].name)).toEqual(['Gouvernance', 'Bordée 1', 'Élodie MARTIN']);
    expect(organigrammeSvg(layoutOrganigramme(sections))).toContain('stroke-dasharray');
    expect(layoutOrganigramme(sections).boxes.flatMap((box) => box.lines.map((line) => line.text))).toContain('Référente opérationnelle');
  });
  it('follows a linked person after a name change and vessel transfer without changing the saved link', () => {
    const data = { ...ORG_LINKS_DEMO, people: ORG_DEMO.people.map((person) => person.id === 2 ? { ...person, name: 'Nouveau nom' } : person), memberships: ORG_DEMO.memberships.map((row) => row.personId === 2 ? { ...row, vesselId: 2 } : row) };
    const target = buildOrganigramme(data, options).find((section) => section.kind === 'relations')!.columns.find((column) => column.key === 'link-3')!.members[0];
    expect(target.name).toBe('Nouveau nom'); expect(target.detail).toContain('LE ROZEL'); expect(target.detail).not.toContain('GOURY');
  });
  it('hides filtered or unavailable link endpoints and excludes vessel names from relations in both views', () => {
    const data = { ...ORG_LINKS_DEMO, links: [...ORG_LINKS_DEMO.links!, { id: 4, sourceCategory: 'external' as const, targetKind: 'category' as const, targetKey: 'vessel-1', targetSection: '', label: 'Navire' }] };
    for (const view of ['vessels', 'functions'] as const) {
      const svg = organigrammeSvg(layoutOrganigramme(buildOrganigramme(data, { ...options, view, showVessels: false }), false));
      expect(svg).not.toContain('GOURY'); expect(svg).not.toContain('LE ROZEL'); expect(svg).toContain('Référente opérationnelle');
    }
    expect(buildOrganigramme(data, { ...options, includeExternal: false }).some((section) => section.kind === 'relations')).toBe(false);
    const filtered = buildOrganigramme(data, { ...options, vesselIds: [2], includeOffice: false });
    expect(filtered.some((section) => section.kind === 'relations')).toBe(false);
    expect(data.links).toHaveLength(4);
  });
  it('keeps ship, watch and HR function ordering, with captain first', () => {
    const sections = buildOrganigramme({ ...ORG_DEMO, memberships: [...ORG_DEMO.memberships].reverse(), vessels: [...ORG_DEMO.vessels].reverse() }, options);
    expect(sections.map((section) => section.label)).toEqual(['Direction & Administration', 'GOURY', 'LE ROZEL', 'Sans affectation', 'Intervenants externes']);
    expect(sections[1].columns[0].members.map((person) => person.functionLabel)).toEqual(['Capitaine', 'Chef Mécanicien', '2nd Capitaine', 'Matelot polyvalent']);
    expect(sections[1].columns.map((column) => column.label)).toEqual(['Bordée 1', 'Bordée 2']);
  });
  it('ignores every Planning source and deduplicates only manually saved compositions', () => {
    const row = ORG_DEMO.memberships[0];
    const resolved = resolveMemberships({ ...ORG_DEMO, memberships: [row, row,
      ...(['board','day','assignment','period'] as const).map((source) => ({ ...row, source, vesselId: 2 })),
    ] });
    expect(resolved).toEqual([row]);
    expect(resolveMemberships({ ...ORG_DEMO, memberships: [{ ...row, source: 'board' }] })).toEqual([]);
  });
  it('follows the current HR function when a watch member has no override', () => {
    const data = { ...ORG_DEMO, memberships: [{ ...ORG_DEMO.memberships[0], functionLabel: '' }] };
    const first = buildOrganigramme(data, options).find((section) => section.kind === 'vessel')!.columns[0].members[0];
    const changed = { ...data, people: data.people.map((person) => person.id === first.id ? { ...person, functionLabel: 'Chef Mécanicien' } : person) };
    expect(first.functionLabel).toBe('Capitaine');
    expect(buildOrganigramme(changed, options).find((section) => section.kind === 'vessel')!.columns[0].members[0].functionLabel).toBe('Chef Mécanicien');
    expect(data.memberships[0].functionLabel).toBe('');
  });
  it('groups people awaiting composition by function instead of one long column', () => {
    const section = buildOrganigramme({ ...ORG_DEMO, memberships: [] }, options).find((item) => item.kind === 'unassigned')!;
    expect(section.columns.length).toBeGreaterThan(1);
    expect(section.columns[0].label).toBe('Capitaine');
    expect(section.columns.flatMap((column) => column.members)).toHaveLength(ORG_DEMO.people.filter((person) => person.population !== 'sedentary').length);
  });
  it('groups the same watch across ships, ordered by vessel length and captain first', () => {
    const sections = buildOrganigramme(ORG_DEMO, { ...options, view: 'watches' });
    const watches = sections.filter((section) => section.kind === 'watch');
    expect(watches.map((section) => section.label)).toEqual(['Bordée 1', 'Bordée 2']);
    expect(watches[0].columns.map((column) => column.label)).toEqual(['GOURY', 'LE ROZEL']);
    expect(watches[0].columns[0].members[0].functionLabel).toBe('Capitaine');
    expect(watches[1].columns[1].members).toEqual([]);
    const hidden = organigrammeSvg(layoutOrganigramme(buildOrganigramme(ORG_LINKS_DEMO, { ...options, view: 'watches', showVessels: false }), false));
    expect(hidden).not.toContain('GOURY'); expect(hidden).not.toContain('LE ROZEL');
    expect(hidden).toContain('Bordée 1'); expect(hidden).toContain('Assistance technique');
  });
  it('places rank 1 above rank 2 and rank 4, with Support on separate lateral branches', () => {
    const diagram = layoutOrganigramme(buildOrganigramme(ORG_HIERARCHY_DEMO, options));
    const card = (name: string) => diagram.boxes.find((box) => box.lines.some((line) => line.text === name))!;
    const head = card('Camille DUMONT'); const second = card('Jules ROUX'); const fourth = card('Noé THOMAS');
    expect(head.y + head.height).toBeLessThan(second.y);
    expect(second.y).toBe(card('Morgan LEROY').y);
    expect(second.y + second.height).toBeLessThan(fourth.y);
    for (const name of ['Louise FAURE', 'Alexis DUPONT']) {
      const support = card(name);
      expect(support.lines.some((line) => line.text === 'Support')).toBe(true);
      expect(support.x + support.width < second.x || support.x > card('Morgan LEROY').x + 248).toBe(true);
    }
    diagram.boxes.forEach((box, index) => diagram.boxes.slice(index + 1).forEach((other) => expect(box.x >= other.x + other.width || other.x >= box.x + box.width || box.y >= other.y + other.height || other.y >= box.y + box.height).toBe(true)));
  });
  it('retains simultaneous vessels but deduplicates people in the function view', () => {
    const data = { ...ORG_DEMO, memberships: [...ORG_DEMO.memberships, { ...ORG_DEMO.memberships[0], vesselId: 2 }] };
    const captains = buildOrganigramme(data, { ...options, view: 'functions' }).find((section) => section.key === 'functions')!.columns[0];
    expect(captains.members.filter((person) => person.id === 2)).toHaveLength(1);
    expect(captains.members.find((person) => person.id === 2)?.detail).toContain('LE ROZEL');
  });
  it('removes vessel names completely from image content when unchecked', () => {
    for (const view of ['vessels', 'functions'] as const) {
      const sections = buildOrganigramme(ORG_DEMO, { ...options, view, showVessels: false });
      const svg = organigrammeSvg(layoutOrganigramme(sections, false));
      expect(svg).not.toContain('GOURY'); expect(svg).not.toContain('LE ROZEL');
      expect(svg).toContain('Élodie MARTIN'); expect(svg).toContain('Bordée 1');
    }
  });
  it('applies vessel and section filters consistently, without other unassigned people', () => {
    const sections = buildOrganigramme(ORG_DEMO, { ...options, vesselIds: [2], includeOffice: false, includeExternal: false });
    expect(sections.map((section) => section.label)).toEqual(['LE ROZEL']);
  });
  it('updates linked office names and avoids duplicating the default office record', () => {
    const sections = buildOrganigramme({ ...ORG_DEMO, support: [{ id: 4, personId: 1, name: 'Ancien nom', functionLabel: 'Président · RH', category: 'office', position: 1 }] }, options);
    const members = sections[0].columns.flatMap((column) => column.members);
    expect(members.filter((person) => person.id === 1)).toEqual([{ id: 1, name: 'Camille DUMONT', functionLabel: 'Président · RH', detail: '' }]);
  });
  it('escapes untrusted names in SVG and wraps long words', () => {
    const sections = buildOrganigramme({ ...ORG_DEMO, people: ORG_DEMO.people.map((person) => ({ ...person, name: '<script>& "Nom"' })) }, options);
    const svg = organigrammeSvg(layoutOrganigramme(sections));
    expect(svg).not.toContain('<script>'); expect(svg).toContain('&lt;script&gt;');
    expect(wrapOrgText('A'.repeat(100)).every((line) => line.length <= 27)).toBe(true);
  });
  it('places the entire fleet on one row, with watches below and no overlapping sections', () => {
    const sections = buildOrganigramme(ORG_LINKS_DEMO, options);
    const vessel = sections.find((section) => section.kind === 'vessel')!;
    const fleet = Array.from({ length: 8 }, (_, index) => ({ ...vessel, key: `ship-${index}`, label: `Navire ${index}`, columns: index % 2 ? vessel.columns : vessel.columns.slice(0, 1) }));
    const diagram = layoutOrganigramme([sections[0], ...fleet, ...sections.filter((section) => section.kind === 'external' || section.kind === 'relations')]);
    const headings = diagram.boxes.filter((box) => box.tone === 'navy' && box.lines[0].text.startsWith('Navire '));
    expect(headings).toHaveLength(8);
    expect(new Set(headings.map((box) => box.y)).size).toBe(1);
    headings.slice(1).forEach((box, index) => expect(box.x).toBeGreaterThan(headings[index].x + headings[index].width));
    const otherHeadings = diagram.boxes.filter((box) => box.tone === 'navy' && !box.lines[0].text.startsWith('Navire '));
    expect(otherHeadings[0].y).toBeLessThan(headings[0].y);
    expect(otherHeadings[1].y).toBeLessThan(headings[0].y);
    // Every card fits in the sheet and all blocks are disjoint, including the shortest crew.
    diagram.boxes.forEach((box, index) => {
      expect(box.x + box.width).toBeLessThanOrEqual(diagram.width);
      expect(box.y + box.height).toBeLessThanOrEqual(diagram.height);
      diagram.boxes.slice(index + 1).forEach((other) => expect(box.x >= other.x + other.width || other.x >= box.x + box.width || box.y >= other.y + other.height || other.y >= box.y + box.height).toBe(true));
    });
  });
  it('keeps watch headings aligned even with wrapped vessel names, including when ships are hidden', () => {
    const vessels = buildOrganigramme(ORG_DEMO, options).filter((section) => section.kind === 'vessel');
    vessels[1].label = 'Navire avec un nom particulièrement long';
    for (const show of [true, false]) {
      const diagram = layoutOrganigramme(vessels, show);
      const watches = diagram.boxes.filter((box) => box.tone === 'teal');
      expect(new Set(watches.map((box) => box.y)).size).toBe(1);
      if (!show) expect(diagram.boxes.some((box) => box.tone === 'navy')).toBe(false);
    }
  });
  it('keeps large rosters complete without losing, truncating or duplicating person cards', () => {
    const members = Array.from({ length: 45 }, (_, index) => ({ id: index, name: `Marin ${index}`, functionLabel: 'Matelot polyvalent', detail: 'Navire avec un nom très long · Bordée 1' }));
    const diagram = layoutOrganigramme([{ key: 'test', kind: 'vessel', label: 'Navire de test', columns: [{ key: 'watch', label: 'Bordée 1', members }] }], true);
    const names = diagram.boxes.flatMap((box) => box.lines.map((line) => line.text)).filter((text) => text.startsWith('Marin '));
    expect(names).toEqual(members.map((person) => person.name));
    diagram.boxes.forEach((box) => { expect(box.x + box.width).toBeLessThanOrEqual(diagram.width); expect(box.y + box.height).toBeLessThanOrEqual(diagram.height); });
  });
  it('uses Paris calendar dates around midnight', () => { expect(orgLocalDate(new Date('2026-09-25T23:30:00Z'))).toBe('2026-09-26'); });
  it.each(['admin', 'direction', 'armement', 'capitaine', 'marin'] as const)('protects %s even against a stale navigation grant', (role) => {
    const allowed = ['admin', 'direction'].includes(role);
    expect(canAccessModule([role], 'organigramme')).toBe(allowed);
    expect(getVisibleModulesForPermissions([role], [{ moduleKey: 'organigramme', roleKey: role, isVisible: true }]).length).toBe(allowed ? 1 : 0);
  });
});
