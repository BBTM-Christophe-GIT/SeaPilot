import { describe, expect, it, vi } from 'vitest';
import { deletePersonalVehicle, fetchPersonalVehicles, savePersonalVehicle } from './expenseVehicleQueries';

const row = { id: 'vehicle-id', vehicle: 'Peugeot 308', fiscal_power: '6 CV', fuel: 'diesel' };
describe('personal vehicle persistence', () => {
  it('maps persisted values after reloading the vehicle book', async () => {
    const query = { select: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), then: (resolve: (result: unknown) => unknown) => resolve({ data: [row], error: null }) };
    const from = vi.fn(() => query);
    expect(await fetchPersonalVehicles({ from } as never)).toEqual([{ id: row.id, vehicle: row.vehicle, fiscalPower: '6 CV', fuel: 'diesel' }]);
    expect(from).toHaveBeenCalledWith('expense_personal_vehicles');
  });
  it('sends only editable fields on create/update, leaving ownership to the server', async () => {
    const query = { insert: vi.fn().mockReturnThis(), update: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: row, error: null }) };
    const client = { from: () => query } as never;
    const draft = { vehicle: ' Peugeot 308 ', fiscalPower: '6 CV ', fuel: 'diesel' as const };
    await savePersonalVehicle(client, draft);
    expect(query.insert).toHaveBeenCalledWith({ vehicle: 'Peugeot 308', fiscal_power: '6 CV', fuel: 'diesel' });
    await savePersonalVehicle(client, draft, row.id);
    expect(query.eq).toHaveBeenCalledWith('id', row.id);
    expect(query.update).toHaveBeenCalledWith({ vehicle: 'Peugeot 308', fiscal_power: '6 CV', fuel: 'diesel' });
  });
  it('does not report a denied or missing deletion as successful', async () => {
    const query = { delete: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null, error: new Error('Not found') }) };
    await expect(deletePersonalVehicle({ from: () => query } as never, row.id)).rejects.toThrow('Not found');
  });
});
