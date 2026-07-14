import type { SupabaseClient } from '@supabase/supabase-js';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchPlanningAssistantAccess } from './planningP21Access';
import { usePlanningAssistantAccess } from './usePlanningAssistantAccess';

vi.mock('./planningP21Access', () => ({ fetchPlanningAssistantAccess: vi.fn() }));

const client = {} as SupabaseClient;

function AccessProbe({ enabled, eligible }: { enabled: boolean; eligible: boolean }) {
  const { access, isLoading } = usePlanningAssistantAccess(client, enabled, eligible);
  return <span>{isLoading ? 'loading' : `${access.hasAccess}:${access.accessMode}`}</span>;
}

describe('usePlanningAssistantAccess', () => {
  beforeEach(() => {
    vi.mocked(fetchPlanningAssistantAccess).mockResolvedValue({ hasAccess: true, accessMode: 'pilot', expiresOn: '2026-12-31', canManagePilots: false });
  });

  it('performs no access request while the feature flag is disabled', () => {
    render(<AccessProbe enabled={false} eligible />);
    expect(screen.getByText('false:none')).toBeInTheDocument();
    expect(fetchPlanningAssistantAccess).not.toHaveBeenCalled();
  });

  it('performs no access request for roles outside the pilot perimeter', () => {
    render(<AccessProbe enabled eligible={false} />);
    expect(screen.getByText('false:none')).toBeInTheDocument();
    expect(fetchPlanningAssistantAccess).not.toHaveBeenCalled();
  });

  it('uses the server response for an eligible user when the flag is enabled', async () => {
    render(<AccessProbe enabled eligible />);
    await waitFor(() => expect(screen.getByText('true:pilot')).toBeInTheDocument());
    expect(fetchPlanningAssistantAccess).toHaveBeenCalledWith(client);
  });
});
