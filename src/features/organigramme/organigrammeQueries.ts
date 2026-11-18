import type { SupabaseClient } from '@supabase/supabase-js';
import { PRIMARY_ORG_CHART, type OrgCategory, type OrgChart, type OrgData, type OrgLink, type OrgSupportDraft } from './organigrammeModel';
import { loadPeoplePortraits } from '../humanResources/portraitMedia';
import { loadOrgVesselIcons } from './organigrammeMedia';

export async function fetchOrganigramme(client: SupabaseClient, asOf: string, chartId = PRIMARY_ORG_CHART.id): Promise<OrgData> {
  const { data, error } = await client.rpc('organigramme_snapshot_v3', { p_chart_id: chartId, p_as_of: asOf });
  if (error) throw new Error('Impossible de charger l’organigramme. Vérifiez vos droits et réessayez.', { cause: error });
  if (!data || data.chartId !== chartId || !Array.isArray(data.charts) || !data.charts.some((chart: OrgChart) => chart.id === chartId) || !Array.isArray(data.people) || !Array.isArray(data.vessels) || !Array.isArray(data.memberships) || !Array.isArray(data.support) || !Array.isArray(data.watches)) throw new Error('Les données de l’organigramme sont indisponibles.');
  const snapshot = { ...data, asOf } as OrgData;
  const [people, vessels] = await Promise.all([loadPeoplePortraits(client, snapshot.people), loadOrgVesselIcons(snapshot.vessels)]);
  // Keep the HR function intact for inherited vessel roles. Office responsibilities
  // are resolved only where they are displayed, including the contact lists.
  return { ...snapshot, vessels, people };
}

export async function createOrgChart(client: SupabaseClient, name: string, sourceChartId?: number): Promise<OrgChart> {
  const trimmedName = name.trim();
  const { data, error } = sourceChartId === undefined
    ? await client.rpc('create_organigramme_chart', { p_name: trimmedName })
    : await client.rpc('duplicate_organigramme_chart', { p_chart_id: sourceChartId, p_name: trimmedName });
  if (error?.code === '23505') throw new Error('Un organigramme porte déjà ce nom.');
  if (error || !Number.isSafeInteger(Number(data)) || Number(data) <= 0) {
    throw new Error(sourceChartId === undefined ? 'Impossible de créer cet organigramme.' : 'Impossible de dupliquer cet organigramme.', { cause: error });
  }
  return { id: Number(data), name: trimmedName };
}

export async function renameOrgChart(client: SupabaseClient, chartId: number, name: string): Promise<OrgChart> {
  const trimmedName = name.trim();
  const { error } = await client.rpc('rename_organigramme_chart', { p_chart_id: chartId, p_name: trimmedName });
  if (error?.code === '23505') throw new Error('Un organigramme porte déjà ce nom.');
  if (error) throw new Error('Impossible de renommer cet organigramme.', { cause: error });
  return { id: chartId, name: trimmedName };
}

export async function saveOrgEmergencyDefault(client: SupabaseClient, ids: number[]): Promise<void> {
  const { error } = await client.rpc('save_organigramme_emergency_default', { p_person_ids: ids });
  if (error) throw new Error('Impossible d’enregistrer la liste d’urgence par défaut. Réessayez.', { cause: error });
}

export async function saveOrgSupport(client: SupabaseClient, chartId: number, entry: OrgSupportDraft): Promise<void> {
  const { error } = await client.rpc('save_organigramme_responsibility', { p_chart_id: chartId, p_id: entry.id ?? null, p_person_id: entry.personId, p_name: entry.name.trim(), p_function_label: entry.functionLabel.trim(), p_category: entry.category, p_position: entry.position, p_rank: entry.rank || null });
  if (error) throw new Error('Impossible d’enregistrer cet intervenant.', { cause: error });
}

export interface OrgWatchDraft { id: number | null; vesselId: number; name: string; revision?: number; members: Array<{ personId: number; functionLabel: string }> }
export async function saveOrgWatch(client: SupabaseClient, chartId: number, watch: OrgWatchDraft): Promise<number> {
  const { data, error } = await client.rpc('save_organigramme_watch', {
    p_chart_id: chartId, p_id: watch.id, p_vessel_id: watch.vesselId, p_name: watch.name.trim(), p_members: watch.members,
    ...(watch.revision === undefined ? {} : { p_revision: watch.revision }),
  });
  if (error?.code === '40001') throw new Error('Cette bordée a été modifiée. Rechargez sa composition avant de l’enregistrer.', { cause: error });
  if (error) throw new Error('Impossible d’enregistrer la bordée. Vérifiez son nom et les affectations des personnes sélectionnées, puis actualisez.', { cause: error });
  return Number(data);
}
export async function deleteOrgWatch(client: SupabaseClient, chartId: number, id: number, revision?: number): Promise<void> {
  const query = client.from('organigramme_watches').delete().eq('chart_id', chartId).eq('id', id);
  const { data, error } = await (revision === undefined ? query : query.eq('revision', revision)).select('id').maybeSingle();
  if (error || !data) throw new Error('Impossible de supprimer cette bordée. Actualisez sa composition avant de réessayer.', { cause: error });
}
export async function deleteOrgSupport(client: SupabaseClient, chartId: number, id: number): Promise<void> {
  const { error } = await client.from('organigramme_support').delete().eq('chart_id', chartId).eq('id', id);
  if (error) throw new Error('Impossible de supprimer cet intervenant.', { cause: error });
}

export async function saveOrgCategory(client: SupabaseClient, chartId: number, key: OrgCategory, label: string): Promise<void> {
  const { error } = await client.rpc('save_organigramme_category', { p_chart_id: chartId, p_key: key, p_label: label.trim() });
  if (error) throw new Error('Impossible de renommer cette catégorie.', { cause: error });
}
export async function saveOrgLink(client: SupabaseClient, chartId: number, link: Omit<OrgLink, 'id'> & { id?: number }): Promise<void> {
  const { error } = await client.rpc('save_organigramme_link', { p_chart_id: chartId, p_id: link.id ?? null, p_source: link.sourceCategory, p_kind: link.targetKind, p_key: link.targetKey, p_section: link.targetSection, p_label: link.label.trim() });
  if (error) throw new Error('Impossible d’enregistrer ce lien. Vérifiez la cible et les éventuels doublons.', { cause: error });
}
export async function deleteOrgLink(client: SupabaseClient, chartId: number, id: number): Promise<void> {
  const { error } = await client.from('organigramme_links').delete().eq('chart_id', chartId).eq('id', id);
  if (error) throw new Error('Impossible de supprimer ce lien.', { cause: error });
}
