import { describe, expect, it, vi } from 'vitest';
import {
  addIsoDateDays,
  fetchHrDocumentExpiryNotifications,
  formatHrDocumentExpiryDate,
  getHrDocumentExpiryWindow,
} from './hrDocumentNotifications';

describe('HR document expiry notifications', () => {
  it('builds an inclusive 40-day calendar window', () => {
    expect(getHrDocumentExpiryWindow('2026-09-03')).toEqual({
      startsOn: '2026-09-03',
      endsOn: '2026-10-13',
    });
    expect(addIsoDateDays('2028-02-20', 40)).toBe('2028-03-31');
  });

  it('loads only the current person documents expiring inside the window', async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        { id: 8, title: 'Visite médicale', expires_on: '2026-09-03' },
        { id: '9', title: 'Capitaine 500', expires_on: '2026-10-13' },
      ],
      error: null,
    });
    const lte = vi.fn().mockReturnValue({ order });
    const gte = vi.fn().mockReturnValue({ lte });
    const eq = vi.fn().mockReturnValue({ gte });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const client = { from } as never;

    await expect(fetchHrDocumentExpiryNotifications(client, 42, '2026-09-03')).resolves.toEqual([
      { documentId: 8, title: 'Visite médicale', expiresOn: '2026-09-03', daysUntilExpiry: 0 },
      { documentId: 9, title: 'Capitaine 500', expiresOn: '2026-10-13', daysUntilExpiry: 40 },
    ]);
    expect(from).toHaveBeenCalledWith('hr_documents');
    expect(select).toHaveBeenCalledWith('id,title,expires_on');
    expect(eq).toHaveBeenCalledWith('person_id', 42);
    expect(gte).toHaveBeenCalledWith('expires_on', '2026-09-03');
    expect(lte).toHaveBeenCalledWith('expires_on', '2026-10-13');
    expect(order).toHaveBeenCalledWith('expires_on', { ascending: true });
  });

  it('formats the expiry date for the French notification label', () => {
    expect(formatHrDocumentExpiryDate('2026-10-13')).toBe('13/10/2026');
  });
});
