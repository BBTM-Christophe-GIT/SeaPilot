import { compareFleetAssets } from '../fleet/fleetDisplay';
import { compareHrFunctionLabels, normalizeHrFunctionLabel } from '../humanResources/peopleQueries';

export const ORGANIGRAMME_REFERENCE = 'REP 03-B';
export const ORGANIGRAMME_SOURCE = '87-Organigramme.pdf';
export type OrganigrammeView = 'vessels' | 'functions';
export const ORG_VIEW_LABELS: Record<OrganigrammeView, string> = { vessels: 'Par navire et bordée', functions: 'Par fonction' };
export type OrgRank = '' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'support';
export const orgRankLabel = (rank?: OrgRank | null) => rank === 'support' ? 'Support' : rank ? `Rang ${rank}` : 'Rang à définir';
export const ORG_CATEGORY_LABELS = { office: 'Direction & Administration', external: 'Intervenants externes', functions: 'Équipages par fonction', unassigned: 'Sans affectation' };
export type OrgCategory = keyof typeof ORG_CATEGORY_LABELS;
export interface OrgLink { id: number; sourceCategory: OrgCategory; targetKind: 'category' | 'group' | 'person'; targetKey: string; targetSection: string; label: string }
export interface OrgTarget { kind: OrgLink['targetKind']; key: string; section: string; name: string; context: string }
export const orgTargetValue = (target: OrgTarget) => JSON.stringify([target.kind, target.section, target.key]);
export const orgCategoryLabel = (data: Pick<OrgData, 'categoryLabels'>, key: OrgCategory) => data.categoryLabels?.[key] || ORG_CATEGORY_LABELS[key];
export interface OrgPerson { photoPath?: string; photoUrl?: string; photoUnavailable?: boolean; id: number; name: string; firstName?: string; lastName?: string; functionLabel: string; population: string; email?: string | null; phone?: string | null }
export interface OrgVessel { iconUrl?: string; iconDataUrl?: string; id: number; name: string; lengthOverall: string | number | null }
export interface OrgMembership { personId: number; vesselId: number; watchGroup: string; functionLabel: string; source: 'manual' | 'board' | 'assignment' | 'period' | 'day' }
export interface OrgWatch { id: number; vesselId: number; name: string }
export interface OrgSupport { id: number; personId: number | null; name: string; functionLabel: string; category: 'office' | 'external'; position: number; rank?: OrgRank | null }
export type OrgSupportDraft = Omit<OrgSupport, 'id'> & { id?: number };
export interface OrgData { people: OrgPerson[]; vessels: OrgVessel[]; memberships: OrgMembership[]; support: OrgSupport[]; watches?: OrgWatch[]; asOf: string; categoryLabels?: Partial<Record<OrgCategory, string>>; links?: OrgLink[] }
export interface OrgMember { photoUrl?: string; email?: string; phone?: string; id: number; name: string; functionLabel: string; detail: string; rank?: OrgRank | null }
export interface OrgColumn { key: string; label: string; members: OrgMember[]; vesselId?: number }
export interface OrgSection { iconDataUrl?: string; key: string; label: string; kind: 'vessel' | 'office' | 'external' | 'unassigned' | 'functions' | 'relations'; columns: OrgColumn[] }
// null selects the whole fleet; an empty array explicitly selects no vessels.
export interface OrgOptions { view: OrganigrammeView; vesselIds: number[] | null; includeOffice: boolean; includeExternal: boolean; includeUnassigned: boolean; showVessels: boolean; showPhotos?: boolean; showEmails?: boolean; showPhones?: boolean; showFunctions?: boolean; showWatches?: boolean }

const compareMembers = (a: OrgMember, b: OrgMember) => compareHrFunctionLabels(a.functionLabel, b.functionLabel) || a.name.localeCompare(b.name, 'fr');

/** Only explicitly saved organization-chart memberships are eligible. Planning rows are ignored. */
export function resolveMemberships(data: OrgData): OrgMembership[] {
  const people = new Set(data.people.map((person) => person.id));
  const vessels = new Set(data.vessels.map((vessel) => vessel.id));
  const candidates = data.memberships.filter((row) => row.source === 'manual' && people.has(row.personId) && vessels.has(row.vesselId));
  const unique = new Map<string, OrgMembership>();
  candidates.forEach((row) => {
    const normalized = { ...row, watchGroup: row.watchGroup.trim() || 'Bordée non renseignée' };
    unique.set(`${row.personId}:${row.vesselId}:${normalized.watchGroup}`, normalized);
  });
  return [...unique.values()];
}

/** Empty saved watches and unavailable people do not make a vessel populated. */
export function orgPopulatedVessels(data: OrgData, memberships = resolveMemberships(data)): OrgVessel[] {
  const populated = new Set(memberships.map((row) => row.vesselId));
  return [...data.vessels].filter((vessel) => populated.has(vessel.id)).sort(compareFleetAssets);
}

/** Also expose sedentary people without a configured responsibility so their rank can be edited. */
export function orgOfficeResponsibilities(data: OrgData): OrgSupportDraft[] {
  const configured = data.support.filter((entry) => entry.category === 'office');
  const replaced = new Set(configured.map((entry) => entry.personId));
  const defaults: OrgSupportDraft[] = data.people.filter((person) => person.population === 'sedentary' && !replaced.has(person.id)).map((person) => ({ personId: person.id, name: person.name, functionLabel: person.functionLabel, category: 'office', position: 0, rank: '' }));
  return [...configured, ...defaults].sort((a, b) => (Number(a.rank) || 99) - (Number(b.rank) || 99) || a.position - b.position || a.name.localeCompare(b.name, 'fr'));
}

export function buildOrganigramme(data: OrgData, options: OrgOptions): OrgSection[] {
  const people = new Map(data.people.map((person) => [person.id, person]));
  const memberships = resolveMemberships(data);
  const vessels = orgPopulatedVessels(data, memberships).filter((vessel) => options.vesselIds === null || options.vesselIds.includes(vessel.id));
  const vesselById = new Map(vessels.map((vessel) => [vessel.id, vessel]));
  const rows = memberships.filter((row) => vesselById.has(row.vesselId));
  const contacts = (person?: OrgPerson) => ({
    ...(options.showEmails && person?.email?.trim() ? { email: person.email.trim() } : {}),
    ...(options.showPhones && person?.phone?.trim() ? { phone: person.phone.trim() } : {}),
  });
  const member = (person: OrgPerson, role = person.functionLabel, detail = ''): OrgMember => ({ id: person.id, name: person.name, photoUrl: options.showPhotos !== false ? person.photoUrl : undefined, functionLabel: normalizeHrFunctionLabel(role || person.functionLabel) || 'Fonction non renseignée', detail, ...contacts(person) });
  const sections: OrgSection[] = [];
  if (options.includeOffice) {
    const members = orgOfficeResponsibilities(data).map((entry) => ({ id: entry.personId ?? -entry.id!, name: people.get(entry.personId ?? -1)?.name || entry.name, functionLabel: entry.functionLabel, detail: '', rank: entry.rank, photoUrl: options.showPhotos !== false ? people.get(entry.personId ?? -1)?.photoUrl : undefined, ...contacts(people.get(entry.personId ?? -1)) }));
    if (members.length) sections.push({ key: 'office', label: 'Direction & Administration', kind: 'office', columns: members.map((person) => ({ key: `office-${person.id}`, label: '', members: [person] })) });
  }
  if (options.view === 'vessels') {
    vessels.forEach((vessel) => {
      const groups = new Map<string, OrgMember[]>();
      (data.watches || []).filter((watch) => watch.vesselId === vessel.id).forEach((watch) => groups.set(watch.name, []));
      rows.filter((row) => row.vesselId === vessel.id).forEach((row) => {
        const person = people.get(row.personId)!;
        const members = groups.get(row.watchGroup) || [];
        members.push(member(person, row.functionLabel));
        groups.set(row.watchGroup, members);
      });
      sections.push({ key: `vessel-${vessel.id}`, label: vessel.name, iconDataUrl: vessel.iconDataUrl, kind: 'vessel', columns: [...groups].sort(([a], [b]) => a.localeCompare(b, 'fr', { numeric: true })).map(([label, members]) => ({ key: `${vessel.id}-${label}`, label, members: members.sort(compareMembers) })) });
    });
  } else {
    const byFunction = new Map<string, Map<number, OrgMember>>();
    rows.forEach((row) => {
      const person = people.get(row.personId)!;
      const role = normalizeHrFunctionLabel(row.functionLabel || person.functionLabel) || 'Fonction non renseignée';
      const members = byFunction.get(role) || new Map<number, OrgMember>();
      const detail = [options.showVessels ? vesselById.get(row.vesselId)!.name : '', options.showWatches !== false ? row.watchGroup : ''].filter(Boolean).join(' · ');
      const previous = members.get(person.id);
      const details = new Set([...(previous?.detail.split(' / ') || []), detail]);
      members.set(person.id, member(person, role, [...details].join(' / ')));
      byFunction.set(role, members);
    });
    if (byFunction.size) sections.push({ key: 'functions', label: 'Équipages par fonction', kind: 'functions', columns: [...byFunction].sort(([a], [b]) => compareHrFunctionLabels(a, b)).map(([label, members]) => ({ key: label, label, members: [...members.values()].sort(compareMembers) })) });
  }
  if (options.includeUnassigned && options.vesselIds === null) {
    const assigned = new Set(memberships.map((row) => row.personId));
    const remaining = data.people.filter((person) => person.population !== 'sedentary' && !assigned.has(person.id));
    const groups = new Map<string, OrgMember[]>();
    remaining.forEach((person) => {
      const item = member(person);
      groups.set(item.functionLabel, [...(groups.get(item.functionLabel) || []), item]);
    });
    if (remaining.length) sections.push({ key: 'unassigned', label: 'Sans affectation', kind: 'unassigned', columns: [...groups].sort(([a], [b]) => compareHrFunctionLabels(a, b)).map(([label, members]) => ({ key: label, label, members: members.sort(compareMembers) })) });
  }
  if (options.includeExternal) {
    const members = data.support.filter((entry) => entry.category === 'external').sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'fr')).map((entry) => ({ id: -entry.id, name: entry.name, functionLabel: entry.functionLabel, detail: '', photoUrl: options.showPhotos !== false ? people.get(entry.personId ?? -1)?.photoUrl : undefined, ...contacts(people.get(entry.personId ?? -1)) }));
    if (members.length) sections.push({ key: 'external', label: 'Intervenants externes', kind: 'external', columns: members.map((person) => ({ key: `external-${person.id}`, label: '', members: [person] })) });
  }
  sections.forEach((section) => {
    if (section.key in ORG_CATEGORY_LABELS) section.label = orgCategoryLabel(data, section.key as OrgCategory);
    // Hide content after sorting/grouping, before resolving visible relation targets.
    section.columns.forEach((column) => {
      if ((section.kind === 'vessel' && options.showWatches === false) || (['functions', 'unassigned'].includes(section.kind) && options.showFunctions === false)) column.label = '';
      if (options.showFunctions === false) column.members.forEach((person) => { person.functionLabel = ''; });
    });
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
  const options: OrgOptions = { view: 'vessels', vesselIds: null, includeOffice: true, includeExternal: true, includeUnassigned: true, showVessels: true };
  const sections = buildOrganigramme({ ...data, links: [] }, options);
  const functions = buildOrganigramme({ ...data, links: [] }, { ...options, view: 'functions' }).filter((section) => section.kind === 'functions');
  // Editing links must still allow targets whose crews have not been composed yet.
  const vessels: OrgSection[] = [...data.vessels].sort(compareFleetAssets).map((vessel) => sections.find((section) => section.key === `vessel-${vessel.id}`) || {
    key: `vessel-${vessel.id}`, label: vessel.name, iconDataUrl: vessel.iconDataUrl, kind: 'vessel',
    columns: (data.watches || []).filter((watch) => watch.vesselId === vessel.id).sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true })).map((watch) => ({ key: `${vessel.id}-${watch.name}`, label: watch.name, members: [] })),
  });
  const targets = orgTargetsFromSections([...sections.filter((section) => section.kind !== 'vessel'), ...vessels, ...functions]);
  // Empty categories remain available for future links.
  (Object.keys(ORG_CATEGORY_LABELS) as OrgCategory[]).forEach((key) => {
    if (!targets.some((target) => target.kind === 'category' && target.key === key)) targets.push({ kind: 'category', key, section: '', name: orgCategoryLabel(data, key), context: '' });
  });
  return targets;
}

export function orgLocalDate(now = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(now);
}
