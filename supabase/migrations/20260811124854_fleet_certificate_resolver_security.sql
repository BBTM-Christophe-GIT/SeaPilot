alter function public.resolve_sharepoint_fleet_certificate_links() security invoker;
alter function public.resolve_sharepoint_fleet_certificate_links() set search_path = '';
revoke all on function public.resolve_sharepoint_fleet_certificate_links() from public, anon;
grant execute on function public.resolve_sharepoint_fleet_certificate_links() to authenticated;
