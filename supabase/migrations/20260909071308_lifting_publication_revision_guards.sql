-- Treat omitted revision tokens as conflicts and bind metadata to the uploaded PDF size.
do $patch$
declare definition text;
begin
  select pg_get_functiondef('public.save_lifting_inspection_entry(bigint,bigint,integer,text,jsonb,text)'::regprocedure) into definition;
  definition := replace(definition,'r.revision <> p_revision','r.revision is distinct from p_revision');
  execute definition;
  select pg_get_functiondef('public.publish_lifting_inspection(bigint,integer,text,text,bigint)'::regprocedure) into definition;
  definition := replace(definition,'r.revision<>p_revision','r.revision is distinct from p_revision');
  definition := replace(definition,'metadata->>''mimetype''=''application/pdf''','metadata->>''mimetype''=''application/pdf'' and (metadata->>''size'')::bigint=p_file_size');
  execute definition;
end $patch$;
