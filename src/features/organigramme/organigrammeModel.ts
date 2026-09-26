import { compareFleetAssets } from '../fleet/fleetDisplay';
import { compareHrFunctionLabels, normalizeHrFunctionLabel } from '../humanResources/peopleQueries';

export const ORGANIGRAMME_REFERENCE = 'REP 03-B';
export const ORGANIGRAMME_SOURCE = '87-Organigramme.docx';
export type OrganigrammeView = 'vessels' | 'functions';
export const ORG_CATEGORY_LABELS = { office: 'Direction & Administration', external: 'Intervenants externes', functions: 'Équipages par fonction', unassigned: 'Sans affectation' };
export type OrgCategory = keyof typeof ORG_CATEGORY_LABELS;
export interface OrgLink { id: number; sourceCategory: OrgCategory; targetKind: 'category' | 'group' | 'person'; targetKey: string; targetSection: string; label: string }
export interface OrgTarget { kind: OrgLink['targetKind']; key: string; section: string; name: string; context: string }
export const orgTargetValue = (target: OrgTarget) => JSON.stringify([target.kind, target.section, target.key]);
export const orgCategoryLabel = (data: Pick<OrgData, 'categoryLabels'>, key: OrgCategory) => data.categoryLabels?.[key] || ORG_CATEGORY_LABELS[key];
export interface OrgPerson { id: number; name: string; functionLabel: string; population: string }
export interface OrgVessel { id: number; name: string; lengthOverall: string | number | null }
export interface OrgMembership { personId: number; vesselId: number; watchGroup: string; functionLabel: string; source: 'board' | 'assignment' | 'period' | 'day' }
export interface OrgSupport { id: number; personId: number | null; name: string; functionLabel: string; category: 'office' | 'external'; position: number }
export interface OrgData { people: OrgPerson[]; vessels: OrgVessel[]; memberships: OrgMembership[]; support: OrgSupport[]; asOf: string; categoryLabels?: Partial<Record<OrgCategory, string>>; links?: OrgLink[] }
export interface OrgMember { id: number; name: string; functionLabel: string; detail: string }
export interface OrgColumn { key: string; label: string; members: OrgMember[] }
export interface OrgSection { key: string; label: string; kind: 'vessel' | 'office' | 'external' | 'unassigned' | 'functions' | 'relations'; columns: OrgColumn[] }
export interface OrgOptions { view: OrganigrammeView; vesselIds: number[]; includeOffice: boolean; includeExternal: boolean; includeUnassigned: boolean; showVessels: boolean }

const sourceOrder = { day: 0, assignment: 1, period: 2, board: 3 };
const compareMembers = (a: OrgMember, b: OrgMember) => compareHrFunctionLabels(a.functionLabel, b.functionLabel) || a.name.localeCompare(b.name, 'fr');

/** Dated memberships supersede permanent rows for that person; overlapping vessels remain visible. */
export function resolveMemberships(data: OrgData): OrgMembership[] {
  const priorities = new Map<number, number>();
  const people = new Set(data.people.map((person) => person.id));
  const vessels = new Set(data.vessels.map((vessel) => vessel.id));
  const candidates = data.memberships.filter((row) => people.has(row.personId) && vessels.has(row.vesselId));
  candidates.forEach((row) => priorities.set(row.personId, Math.min(priorities.get(row.personId) ?? 4, sourceOrder[row.source])));
  const unique = new Map<string, OrgMembership>();
  candidates.forEach((row) => {
    if (sourceOrder[row.source] !== priorities.get(row.personId)) return;
    const normalized = { ...row, watchGroup: row.watchGroup.trim() || 'Bordée non renseignée' };
    unique.set(`${row.personId}:${row.vesselId}:${normalized.watchGroup}`, normalized);
  });
  return [...unique.values()];
}

export function buildOrganigramme(data: OrgData, options: OrgOptions): OrgSection[] {
  const people = new Map(data.people.map((person) => [person.id, person]));
  const vessels = [...data.vessels].sort(compareFleetAssets).filter((vessel) => !options.vesselIds.length || options.vesselIds.includes(vessel.id));
  const vesselById = new Map(vessels.map((vessel) => [vessel.id, vessel]));
  const memberships = resolveMemberships(data);
  const rows = memberships.filter((row) => vesselById.has(row.vesselId));
  const member = (person: OrgPerson, role = person.functionLabel, detail = ''): OrgMember => ({ id: person.id, name: person.name, functionLabel: normalizeHrFunctionLabel(role || person.functionLabel) || 'Fonction non renseignée', detail });
  const sections: OrgSection[] = [];
  if (options.includeOffice) {
    const office = data.people.filter((person) => person.population === 'sedentary');
    const support = data.support.filter((entry) => entry.category === 'office').sort((a, b) => a.position - b.position);
    const replaced = new Set(support.flatMap((entry) => entry.personId === null ? [] : [entry.personId]));
    const members = [...office.filter((person) => !replaced.has(person.id)).map((person) => member(person)), ...support.map((entry) => ({ id: entry.personId ?? -entry.id, name: people.get(entry.personId ?? -1)?.name || entry.name, functionLabel: entry.functionLabel, detail: '' }))].sort((a, b) => Number(b.functionLabel.startsWith('Président')) - Number(a.functionLabel.startsWith('Président')));
    if (members.length) sections.push({ key: 'office', label: 'Direction & Administration', kind: 'office', columns: members.map((person) => ({ key: `office-${person.id}`, label: '', members: [person] })) });
  }
  if (options.view === 'vessels') {
    vessels.forEach((vessel) => {
      const groups = new Map<string, OrgMember[]>();
      rows.filter((row) => row.vesselId === vessel.id).forEach((row) => {
        const person = people.get(row.personId)!;
        const members = groups.get(row.watchGroup) || [];
        members.push(member(person, row.functionLabel));
        groups.set(row.watchGroup, members);
      });
      sections.push({ key: `vessel-${vessel.id}`, label: vessel.name, kind: 'vessel', columns: [...groups].sort(([a], [b]) => a.localeCompare(b, 'fr', { numeric: true })).map(([label, members]) => ({ key: `${vessel.id}-${label}`, label, members: members.sort(compareMembers) })) });
    });
  } else {
    const byFunction = new Map<string, Map<number, OrgMember>>();
    rows.forEach((row) => {
      const person = people.get(row.personId)!;
      const role = normalizeHrFunctionLabel(row.functionLabel || person.functionLabel) || 'Fonction non renseignée';
      const members = byFunction.get(role) || new Map<number, OrgMember>();
      const detail = options.showVessels ? `${vesselById.get(row.vesselId)!.name} · ${row.watchGroup}` : row.watchGroup;
      const previous = members.get(person.id);
      const details = new Set([...(previous?.detail.split(' / ') || []), detail]);
      members.set(person.id, member(person, role, [...details].join(' / ')));
      byFunction.set(role, members);
    });
    if (byFunction.size) sections.push({ key: 'functions', label: 'Équipages par fonction', kind: 'functions', columns: [...byFunction].sort(([a], [b]) => compareHrFunctionLabels(a, b)).map(([label, members]) => ({ key: label, label, members: [...members.values()].sort(compareMembers) })) });
  }
  if (options.includeUnassigned && !options.vesselIds.length) {
    const assigned = new Set(memberships.map((row) => row.personId));
    const remaining = data.people.filter((person) => person.population !== 'sedentary' && !assigned.has(person.id));
    if (remaining.length) sections.push({ key: 'unassigned', label: 'Sans affectation', kind: 'unassigned', columns: [{ key: 'unassigned', label: 'Effectifs à affecter', members: remaining.map((person) => member(person)).sort(compareMembers) }] });
  }
  if (options.includeExternal) {
    const members = data.support.filter((entry) => entry.category === 'external').sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'fr')).map((entry) => ({ id: -entry.id, name: entry.name, functionLabel: entry.functionLabel, detail: '' }));
    if (members.length) sections.push({ key: 'external', label: 'Intervenants externes', kind: 'external', columns: members.map((person) => ({ key: `external-${person.id}`, label: '', members: [person] })) });
  }
  sections.forEach((section) => {
    if (section.key in ORG_CATEGORY_LABELS) section.label = orgCategoryLabel(data, section.key as OrgCategory);
  });
  const targets = orgTargetsFromSections(sections, options.showVessels);
  const relations: OrgSection[] = [];
  for (const source of sections) {
    const columns = (data.links || []).filter((link) => link.sourceCategory === source.key).flatMap((link): OrgColumn[] => {
      const target = targets.find((item) => item.kind === link.targetKind && item.key === link.targetKey && item.section === link.targetSection);
      if (!target) return [];
      return [{ key: `link-${link.id}`, label: link.label || 'En lien avec', members: [{ id: 0, name: target.name, functionLabel: { category: 'Grande catégorie', group: 'Groupe', person: 'Personne / intervenant' }[target.kind], detail: target.context }] }];
    });
    if (columns.length) relations.push({ key: `relations-${source.key}`, label: `${source.label} · Liens`, kind: 'relations', columns });
  }
  return [...sections, ...relations];
}

/** Node identities never depend on display names or the position of a person in a bordée. */
export function orgTargetsFromSections(sections: OrgSection[], showVessels = true): OrgTarget[] {
  const targets = new Map<string, OrgTarget>();
  const add = (target: OrgTarget) => {
    const key = orgTargetValue(target);
    const previous = targets.get(key);
    targets.set(key, previous ? { ...target, context: [...new Set([previous.context, target.context])].filter(Boolean).join(' / ') } : target);
  };
  sections.filter((section) => section.kind !== 'relations').forEach((section) => {
    const context = section.kind === 'vessel' && !showVessels ? '' : section.label;
    if (context) add({ kind: 'category', key: section.key, section: '', name: context, context: '' });
    section.columns.forEach((column) => {
      if (column.label) add({ kind: 'group', key: column.key, section: section.key, name: column.label, context });
      column.members.forEach((person) => add({ kind: 'person', key: String(person.id), section: '', name: person.name, context: [context, column.label].filter(Boolean).join(' · ') }));
    });
  });
  return [...targets.values()];
}

export function orgAllTargets(data: OrgData): OrgTarget[] {
  const options: OrgOptions = { view: 'vessels', vesselIds: [], includeOffice: true, includeExternal: true, includeUnassigned: true, showVessels: true };
  const sections = buildOrganigramme({ ...data, links: [] }, options);
  const functions = buildOrganigramme({ ...data, links: [] }, { ...options, view: 'functions' }).filter((section) => section.kind === 'functions');
  const targets = orgTargetsFromSections([...sections, ...functions]);
  // Empty categories remain available for future links.
  (Object.keys(ORG_CATEGORY_LABELS) as OrgCategory[]).forEach((key) => {
    if (!targets.some((target) => target.kind === 'category' && target.key === key)) targets.push({ kind: 'category', key, section: '', name: orgCategoryLabel(data, key), context: '' });
  });
  return targets;
}

export function orgLocalDate(now = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(now);
}
