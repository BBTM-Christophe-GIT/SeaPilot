import type { SupabaseClient } from '@supabase/supabase-js';
import type { Fuel } from './expenseNoteModel';

export interface ExpenseVehicleDraft { vehicle: string; fiscalPower: string; fuel: Fuel }
export interface ExpensePersonalVehicle extends ExpenseVehicleDraft { id: string; isDefault: boolean }
interface VehicleRow { id: string; vehicle: string; fiscal_power: string; fuel: Fuel; is_default: boolean }
const columns = 'id,vehicle,fiscal_power,fuel,is_default';
const toVehicle = (row: VehicleRow): ExpensePersonalVehicle => ({ id: row.id, vehicle: row.vehicle, fiscalPower: row.fiscal_power, fuel: row.fuel, isDefault: row.is_default === true });

export const PREVIEW_VEHICLES: ExpensePersonalVehicle[] = [
  { id: 'demo-diesel', vehicle: 'Peugeot 308', fiscalPower: '6 CV', fuel: 'diesel', isDefault: true },
  { id: 'demo-electric', vehicle: 'Renault Mégane E-Tech', fiscalPower: '4 CV', fuel: 'electric', isDefault: false },
];

export async function setDefaultPersonalVehicle(client: SupabaseClient, id: string | null): Promise<void> {
  const { error } = await client.rpc('set_expense_default_vehicle', { p_vehicle_id: id });
  if (error) throw error;
}

export async function fetchPersonalVehicles(client: SupabaseClient): Promise<ExpensePersonalVehicle[]> {
  const { data, error } = await client.from('expense_personal_vehicles').select(columns).order('vehicle').order('id');
  if (error) throw error;
  return (data || []).map(toVehicle);
}

export async function savePersonalVehicle(client: SupabaseClient, draft: ExpenseVehicleDraft, id?: string): Promise<ExpensePersonalVehicle> {
  // Owner and company are server defaults; the browser cannot assign them.
  const values = { vehicle: draft.vehicle.trim(), fiscal_power: draft.fiscalPower.trim(), fuel: draft.fuel };
  const table = client.from('expense_personal_vehicles');
  const query = id ? table.update(values).eq('id', id) : table.insert(values);
  const { data, error } = await query.select(columns).single();
  if (error) throw error;
  return toVehicle(data as VehicleRow);
}

export async function deletePersonalVehicle(client: SupabaseClient, id: string): Promise<void> {
  const { data, error } = await client.from('expense_personal_vehicles').delete().eq('id', id).select('id').single();
  if (error) throw error;
  if (!data) throw new Error('Ce véhicule est indisponible.');
}
