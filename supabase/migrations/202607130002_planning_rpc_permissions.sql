revoke execute on function public.planning_assignment_overview() from anon;
revoke all on function public.planning_assignment_overview() from public;
grant execute on function public.planning_assignment_overview() to authenticated;

comment on function public.planning_assignment_overview() is
  'Vue Planning filtrée selon les rôles et le collaborateur courant. Exécution réservée aux sessions authentifiées.';
