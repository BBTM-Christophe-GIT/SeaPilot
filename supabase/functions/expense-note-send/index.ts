import { createClient } from '@supabase/supabase-js';
import { createExpenseSendHandler } from './handler.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
Deno.serve(createExpenseSendHandler({
  userClient: (authorization) => createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } }),
  admin: createClient(url, serviceKey, { auth: { persistSession: false } }),
  fetch,
}));
