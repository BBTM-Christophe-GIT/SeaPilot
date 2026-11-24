-- Public SECURITY INVOKER RPCs and LSA RLS policies call explicitly granted
-- helpers in private. EXECUTE alone cannot resolve those helpers without USAGE.
-- Keep private outside the Data API and retain existing function/table ACLs.
grant usage on schema private to authenticated;

notify pgrst, 'reload schema';
