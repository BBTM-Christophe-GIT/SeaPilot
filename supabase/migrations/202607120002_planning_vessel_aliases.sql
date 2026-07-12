update public.vessels
set acronym = 'YARD',
    updated_at = now()
where public.normalize_import_label(name) = 'yard le havre'
  and nullif(trim(acronym), '') is null;
