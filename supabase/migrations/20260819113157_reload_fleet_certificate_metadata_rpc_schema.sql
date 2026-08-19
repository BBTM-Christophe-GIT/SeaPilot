-- The metadata RPC was created by the preceding release, but PostgREST kept an
-- older schema cache and returned PGRST202/404 for valid calls. Force the API
-- layer to discover the function and its date parameters immediately.
notify pgrst, 'reload schema';
