-- A public application logo is shared by login and every authenticated profile.
-- Only active administrators of the immutable BBTM owner company may change it.
create schema application_branding_private;
revoke all on schema application_branding_private from public, anon, authenticated;
grant usage on schema application_branding_private to authenticated;

create table application_branding_private.settings (
  singleton boolean primary key default true check (singleton),
  owner_company_id bigint not null references public.companies(id) on delete restrict,
  logo_path text,
  revision integer not null default 0 check (revision >= 0),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz
);
create index application_branding_owner_idx on application_branding_private.settings(owner_company_id);
create index application_branding_updated_by_idx on application_branding_private.settings(updated_by);
alter table application_branding_private.settings enable row level security;
revoke all on application_branding_private.settings from public, anon, authenticated;
insert into application_branding_private.settings(singleton, owner_company_id)
values (true, (select id from public.companies where code = 'bbtm'));

create function application_branding_private.preserve_owner()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.singleton is distinct from old.singleton or new.owner_company_id is distinct from old.owner_company_id then
    raise exception 'APPLICATION_BRANDING_OWNER_IMMUTABLE' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function application_branding_private.preserve_owner() from public, anon, authenticated;
create trigger application_branding_owner_immutable before update on application_branding_private.settings
for each row execute function application_branding_private.preserve_owner();

create function application_branding_private.can_manage()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from application_branding_private.settings s
    join public.companies c on c.id = s.owner_company_id and c.active
    where s.singleton and public.has_company_role(s.owner_company_id, array['admin'])
  );
$$;
revoke all on function application_branding_private.can_manage() from public, anon, authenticated;
grant execute on function application_branding_private.can_manage() to authenticated;

-- Intentional anonymous projection: no company identifiers or administrator UUIDs.
create function public.get_application_branding()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'logoPath', s.logo_path, 'revision', s.revision,
    'canManage', application_branding_private.can_manage(), 'updatedAt', s.updated_at
  ) from application_branding_private.settings s where s.singleton;
$$;
revoke all on function public.get_application_branding() from public, anon, authenticated;
grant execute on function public.get_application_branding() to anon, authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('application-branding', 'application-branding', true, 2097152, array['image/png', 'image/jpeg', 'image/webp']);

create function application_branding_private.storage_access(p_path text, p_owner text, p_operation text)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare current_path text; owned_path boolean;
begin
  if not application_branding_private.can_manage() then return false; end if;
  owned_path := p_owner = auth.uid()::text and p_path ~ (
    '^logos/' || auth.uid()::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](png|jpg|webp)$'
  );
  if p_operation = 'insert' then return coalesce(owned_path, false); end if;
  if p_operation = 'read' then
    select logo_path into current_path from application_branding_private.settings where singleton;
    return coalesce(owned_path or p_path = current_path, false);
  end if;
  if p_operation = 'delete' and owned_path then
    -- Serialize cleanup with publication so a concurrent save cannot lose its image.
    select logo_path into current_path from application_branding_private.settings where singleton for share;
    return current_path is distinct from p_path;
  end if;
  return false;
end $$;
revoke all on function application_branding_private.storage_access(text, text, text) from public, anon, authenticated;
grant execute on function application_branding_private.storage_access(text, text, text) to authenticated;

create policy application_branding_read on storage.objects for select to authenticated
using (bucket_id = 'application-branding' and application_branding_private.storage_access(name, owner_id, 'read'));
create policy application_branding_insert on storage.objects for insert to authenticated
with check (bucket_id = 'application-branding' and application_branding_private.storage_access(name, owner_id, 'insert'));
create policy application_branding_delete on storage.objects for delete to authenticated
using (bucket_id = 'application-branding' and application_branding_private.storage_access(name, owner_id, 'delete'));

-- Public image serving bypasses object SELECT RLS; object metadata/listing does not.
create policy application_branding_anon_guard on storage.objects as restrictive for all to anon
using (bucket_id <> 'application-branding') with check (bucket_id <> 'application-branding');
create policy application_branding_read_guard on storage.objects as restrictive for select to authenticated
using (bucket_id <> 'application-branding' or application_branding_private.storage_access(name, owner_id, 'read'));
create policy application_branding_insert_guard on storage.objects as restrictive for insert to authenticated
with check (bucket_id <> 'application-branding' or application_branding_private.storage_access(name, owner_id, 'insert'));
create policy application_branding_update_guard on storage.objects as restrictive for update to authenticated
using (bucket_id <> 'application-branding') with check (bucket_id <> 'application-branding');
create policy application_branding_delete_guard on storage.objects as restrictive for delete to authenticated
using (bucket_id <> 'application-branding' or application_branding_private.storage_access(name, owner_id, 'delete'));

create function application_branding_private.save_logo(p_logo_path text, p_expected_revision integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target application_branding_private.settings; object_row storage.objects; expected_mime text;
begin
  if not application_branding_private.can_manage() then
    raise exception 'APPLICATION_BRANDING_PERMISSION_DENIED' using errcode = '42501';
  end if;
  select * into target from application_branding_private.settings where singleton for update;
  if p_expected_revision is null or target.revision is distinct from p_expected_revision then
    raise exception 'APPLICATION_BRANDING_REVISION_CHANGED' using errcode = '40001';
  end if;
  if p_logo_path is not null then
    if p_logo_path !~ ('^logos/' || auth.uid()::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](png|jpg|webp)$') then
      raise exception 'APPLICATION_BRANDING_INVALID_LOGO' using errcode = '22023';
    end if;
    expected_mime := case split_part(p_logo_path, '.', 2) when 'png' then 'image/png' when 'jpg' then 'image/jpeg' when 'webp' then 'image/webp' end;
    select * into object_row from storage.objects where bucket_id = 'application-branding' and name = p_logo_path for share;
    if object_row.id is null or object_row.owner_id is distinct from auth.uid()::text
      or object_row.metadata->>'mimetype' is distinct from expected_mime
      or not (case when coalesce(object_row.metadata->>'size', '') ~ '^[0-9]{1,10}$'
        then (object_row.metadata->>'size')::bigint between 1 and 2097152 else false end) then
      raise exception 'APPLICATION_BRANDING_INVALID_LOGO' using errcode = '22023';
    end if;
  end if;
  update application_branding_private.settings set logo_path = p_logo_path,
    revision = revision + 1, updated_by = auth.uid(), updated_at = clock_timestamp() where singleton;
  return public.get_application_branding();
end $$;
revoke all on function application_branding_private.save_logo(text, integer) from public, anon, authenticated;
grant execute on function application_branding_private.save_logo(text, integer) to authenticated;

create function public.save_application_logo(p_logo_path text, p_expected_revision integer)
returns jsonb language sql security invoker set search_path = '' as $$
  select application_branding_private.save_logo(p_logo_path, p_expected_revision);
$$;
revoke all on function public.save_application_logo(text, integer) from public, anon, authenticated;
grant execute on function public.save_application_logo(text, integer) to authenticated;

comment on table application_branding_private.settings is 'One global application logo; the immutable BBTM owner company controls publication.';
notify pgrst, 'reload schema';
