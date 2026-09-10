-- Additional illustrations must not replace a vessel's existing primary photo.
alter table public.vessels
  add column if not exists illustration_storage_bucket text,
  add column if not exists illustration_storage_path text,
  add column if not exists illustration_thumbnail_url text;

comment on column public.vessels.illustration_storage_bucket is 'Private storage bucket for the additional fleet illustration; independent of photo_*.';
comment on column public.vessels.illustration_storage_path is 'Original illustration retained for reuse. Never download this original for a filter icon.';
comment on column public.vessels.illustration_thumbnail_url is 'Content-addressed small WebP URL for fleet filters. Original photographs remain in photo_*.';

-- Repair the nine images imported by the first preview. These previous values
-- come from the pre-import backup. Exact current-path matching avoids replacing
-- any primary photograph that has since been edited by a user. Other tenants,
-- archived vessels and any other photo paths are untouched.
with imported(name, acronym, filename, previous_url, previous_bucket, previous_path) as (
  values
    ('GOURY', 'GRY', 'bbtm-goury-14680d2f35fe1ac9.png', '/vessels/goury.jpg', null::text, null::text),
    ('HIRONDELLE DE LA MANCHE', 'HIR', 'bbtm-hirondelle-de-la-manche-37c0a9505d6d5ff1.png', null, null, null),
    ('HOLENN EUSA', 'HE', 'bbtm-holenn-eusa-d950a44236614b3f.png', null, null, null),
    ('KROKDUR', 'KDR', 'bbtm-krokdur-978a66cf8d091b32.png', null, 'fleet-media', '1/3/989a5d1f-bf44-4501-92fd-a9940fc18484.jpg'),
    ('LANDEMER', 'LDM', 'bbtm-landemer-a0bbe566c9dbb524.png', null, null, null),
    ('LE ROZEL', 'RZL', 'bbtm-le-rozel-1dca05bb04b44aa1.png', null, null, null),
    ('SUROIT', 'SUR', 'bbtm-suroit-13ffa6ebf761175a.png', null, 'fleet-media', '1/4/5badae95-fada-4106-ae73-f87c5d4e8c34.png'),
    ('BBTM TENDER 1', 'TND', 'bbtm-tender-1-7c49e13a038c3c43.png', null, null, null),
    ('YARD - Le Havre', 'YRD', 'bbtm-yard-le-havre-8983f2bb031561aa.png', null, null, null)
)
update public.vessels v
set illustration_storage_bucket = v.photo_storage_bucket,
    illustration_storage_path = v.photo_storage_path,
    photo_url = imported.previous_url,
    photo_storage_bucket = imported.previous_bucket,
    photo_storage_path = imported.previous_path,
    updated_at = now()
from imported, public.companies c
where v.company_id = c.id and c.code = 'bbtm'
  and v.active and v.name = imported.name and v.acronym = imported.acronym
  and v.photo_url is null and v.photo_storage_bucket = 'fleet-media'
  and v.photo_storage_path = v.company_id::text || '/' || v.id::text || '/' || imported.filename
  and v.illustration_storage_path is null;

-- lifting_available_vessels returns SETOF vessels: the existing permission-
-- scoped RPC exposes the new metadata without changing any grants or RLS.
notify pgrst, 'reload schema';
