import type { SupabaseClient } from '@supabase/supabase-js';
import type { Fuel } from './expenseNoteModel';

export interface ExpenseVehicleDraft { vehicle: string; fiscalPower: string; fuel: Fuel }
export interface ExpensePersonalVehicle extends ExpenseVehicleDraft { id: string }
interface VehicleRow { id: string; vehicle: string; fiscal_power: string; fuel: Fuel }
const columns = 'id,vehicle,fiscal_power,fuel';
const toVehicle = (row: VehicleRow): ExpensePersonalVehicle => ({ id: row.id, vehicle: row.vehicle, fiscalPower: row.fiscal_power, fuel: row.fuel });

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
