-- Supabase's default ACL grants more table privileges than this preference needs.
-- Only SELECT/INSERT/UPDATE are exposed, and all three remain subject to RLS.
revoke all on public.organigramme_emergency_defaults from authenticated;
grant select, insert, update on public.organigramme_emergency_defaults to authenticated;
