import { createClient } from 'npm:@supabase/supabase-js@2.108.2';
import { createPlanningCalendarHandler } from './handler.ts';
import type { PlanningCalendarFeed } from './ics.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const serviceClient = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  : null;

// Calendar clients cannot send a Supabase session. This function authenticates
// the read-only capability itself; platform verify_jwt must therefore be false.
Deno.serve(createPlanningCalendarHandler({
  async getFeed(tokenHash) {
    if (!serviceClient) throw new Error('Service unavailable.');
    const { data, error } = await serviceClient.rpc('planning_calendar_feed', { p_token_hash: tokenHash });
    if (error) throw new Error('Service unavailable.');
    return data as PlanningCalendarFeed | null;
  },
}));
