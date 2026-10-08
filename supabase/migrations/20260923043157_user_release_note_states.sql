-- Release note content is versioned with the client. Only each user's reading state is stored here.
create table public.user_release_note_states (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  note_id text not null check (length(note_id) between 1 and 160),
  presented_at timestamptz not null default now(),
  read_at timestamptz,
  primary key (user_id, note_id)
);

alter table public.user_release_note_states enable row level security;
revoke all on public.user_release_note_states from public, anon, authenticated;
grant select, insert, update on public.user_release_note_states to authenticated;

create policy release_notes_select_own on public.user_release_note_states
  for select to authenticated using ((select auth.uid()) = user_id);
create policy release_notes_insert_own on public.user_release_note_states
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy release_notes_update_own on public.user_release_note_states
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

comment on table public.user_release_note_states is 'Private release note acknowledgements. A row with read_at null means Read later.';
