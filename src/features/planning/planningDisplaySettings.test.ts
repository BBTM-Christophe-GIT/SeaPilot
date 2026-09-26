import { describe, expect, it, vi } from 'vitest';
import { fetchPlanningDisplaySettings, savePlanningDisplaySettings } from './planningDisplaySettings';

describe('personal active filter', () => {
  it.each([[false, true, true], [true, false, false], [true, null, true], [false, null, false]])(
    'resolves company %s and personal %s as %s', async (company, personal, expected) => {
      const client = { from: vi.fn((table) => ({ select: () => ({ maybeSingle: async () => ({
        data: table === 'planning_display_settings' ? { active_filter_enabled: company } : personal === null ? null : { active_filter_enabled: personal }, error: null,
      }) }) })) };
      expect(await fetchPlanningDisplaySettings(client as never, true)).toEqual({ activeFilterEnabled: expected });
      expect(await fetchPlanningDisplaySettings(client as never)).toEqual({ activeFilterEnabled: company });
    },
  );
  it('saves a personal choice through the personal RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { active_filter_enabled: false }, error: null });
    await savePlanningDisplaySettings({ rpc } as never, { activeFilterEnabled: false }, true);
    expect(rpc).toHaveBeenCalledWith('planning_save_personal_display_settings', { p_active_filter_enabled: false });
  });
});
