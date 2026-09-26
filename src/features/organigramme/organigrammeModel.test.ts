import { describe, expect, it } from 'vitest';
import { buildOrganigramme, orgLocalDate, resolveMemberships, type OrgOptions } from './organigrammeModel';
import { layoutOrganigramme, organigrammeSvg, paginateOrganigramme, wrapOrgText } from './organigrammeDiagram';
import { ORG_DEMO, ORG_LINKS_DEMO } from './organigrammeFixtures';
import { canAccessModule } from '../permissions/moduleAccess';
import { getVisibleModulesForPermissions } from '../permissions/navigationPermissions';

const options: OrgOptions = { view: 'vessels', vesselIds: [], includeOffice: true, includeExternal: true, includeUnassigned: true, showVessels: true };
describe('organigramme', () => {
  it('keeps category, group and person links after renaming their source and target categories', () => {
    const data = { ...ORG_LINKS_DEMO, categoryLabels: { external: 'Partenaires', office: 'Gouvernance' } };
    const sections = buildOrganigramme(data, options);
    const relations = sections.find((section) => section.key === 'relations-external')!;
    expect(relations.label).toBe('Partenaires · Liens');
    expect(relations.columns.map((column) => column.members[0].name)).toEqual(['Gouvernance', 'Bordée 1', 'Élodie MARTIN']);
    expect(organigrammeSvg(layoutOrganigramme(sections))).toContain('stroke-dasharray');
    expect(paginateOrganigramme(sections, true).at(-1)?.boxes.flatMap((box) => box.lines.map((line) => line.text))).toContain('Référente opérationnelle');
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
  it('replaces stale permanent rows when a sailor moves to a dated assignment', () => {
    const data = { ...ORG_DEMO, memberships: [...ORG_DEMO.memberships, { personId: 2, vesselId: 2, watchGroup: 'Bordée 2', functionLabel: 'Capitaine', source: 'board' as const }] };
    expect(resolveMemberships(data).filter((row) => row.personId === 2)).toHaveLength(1);
    expect(resolveMemberships(data).find((row) => row.personId === 2)?.vesselId).toBe(1);
  });
  it('uses day then assignment then period then board, without duplicated memberships', () => {
    const row = ORG_DEMO.memberships[0];
    const resolved = resolveMemberships({ ...ORG_DEMO, memberships: [row, row, { ...row, source: 'period' }, { ...row, source: 'day', vesselId: 2 }] });
    expect(resolved).toEqual([{ ...row, source: 'day', vesselId: 2 }]);
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
  it('paginates large rosters without losing, truncating or duplicating person cards', () => {
    const members = Array.from({ length: 45 }, (_, index) => ({ id: index, name: `Marin ${index}`, functionLabel: 'Matelot polyvalent', detail: 'Navire avec un nom très long · Bordée 1' }));
    const pages = paginateOrganigramme([{ key: 'test', kind: 'vessel', label: 'Navire de test', columns: [{ key: 'watch', label: 'Bordée 1', members }] }], true);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.every((page) => page.height <= 520)).toBe(true);
    const names = pages.flatMap((page) => page.boxes.flatMap((box) => box.lines.map((line) => line.text))).filter((text) => text.startsWith('Marin '));
    expect(names).toEqual(members.map((person) => person.name));
    pages.forEach((page) => page.boxes.forEach((box) => { expect(box.x + box.width).toBeLessThanOrEqual(page.width); expect(box.y + box.height).toBeLessThanOrEqual(page.height); }));
  });
  it('uses Paris calendar dates around midnight', () => { expect(orgLocalDate(new Date('2026-09-25T23:30:00Z'))).toBe('2026-09-26'); });
  it.each(['admin', 'direction', 'armement', 'capitaine', 'marin'] as const)('protects %s even against a stale navigation grant', (role) => {
    const allowed = ['admin', 'direction'].includes(role);
    expect(canAccessModule([role], 'organigramme')).toBe(allowed);
    expect(getVisibleModulesForPermissions([role], [{ moduleKey: 'organigramme', roleKey: role, isVisible: true }]).length).toBe(allowed ? 1 : 0);
  });
});
