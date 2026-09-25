-- Runs with plain PostgreSQL, no pgTAP extension required. Every fixture rolls back.
begin;
insert into auth.users(id,email) values
 ('7b000000-0000-0000-0000-000000000001','drive-admin@example.invalid'),
 ('7b000000-0000-0000-0000-000000000002','drive-captain@example.invalid'),
 ('7b000000-0000-0000-0000-000000000003','drive-marin@example.invalid'),
 ('7b000000-0000-0000-0000-000000000004','drive-direction@example.invalid');
insert into public.profiles(id,email,display_name,active_company_id)
select u.id,u.email,'Drive test',c.id from auth.users u cross join public.companies c
 where u.id::text like '7b000000-%' and c.code='bbtm';
insert into public.user_roles(user_id,company_id,role_key)
select v.id::uuid,c.id,v.role from (values
 ('7b000000-0000-0000-0000-000000000001','admin'),
 ('7b000000-0000-0000-0000-000000000002','capitaine'),
 ('7b000000-0000-0000-0000-000000000003','marin'),
 ('7b000000-0000-0000-0000-000000000004','direction')) v(id,role)
 cross join public.companies c where c.code='bbtm';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','7b000000-0000-0000-0000-000000000001',true);
do $$
declare source public.procedures; pdf public.published_procedures; retried public.published_procedures; scope jsonb; profile text; changed integer;
begin
 insert into public.procedures(procedure_code,title,status,source_label,theme,document_number,version_label,source_google_drive_path,source_file_name,source_mime_type,source_size_bytes)
 values('TST 987654-A','Test conversion','draft','test','TST','987654','A','TST 987654 A - Test conversion.docx','TST 987654 A - Test conversion.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document',100)
 returning * into source;
 if public.procedure_drive_scope('write')->>'directory' <> 'Procedures' then raise exception 'Admin write scope invalid'; end if;
 scope := public.procedure_drive_scope('publish',source.id);
 if scope->>'pdfName' <> 'TST 987654 A - Test conversion.pdf' then raise exception 'Filename differs from UI'; end if;
 begin
  perform public.publish_procedure_drive(source.id,'../outside.pdf',100,repeat('a',64));
  raise exception 'Traversal published';
 exception when raise_exception then if sqlerrm <> 'Recu PDF invalide' then raise; end if; end;
 pdf := public.publish_procedure_drive(source.id,scope->>'pdfName',100,repeat('a',64));
 retried := public.publish_procedure_drive(source.id,scope->>'pdfName',100,repeat('a',64));
 begin
  update public.published_procedures set mime_type=null where id=pdf.id;
  raise exception 'Incomplete receipt accepted';
 exception when check_violation or insufficient_privilege then null; end;
 if retried.id <> pdf.id then raise exception 'Retry duplicated publication'; end if;
 if (select status from public.procedures where id=source.id) <> 'published' then raise exception 'Lifecycle not published'; end if;
 begin
  perform public.publish_procedure_drive(source.id,scope->>'pdfName',101,repeat('b',64));
  raise exception 'Conflicting receipt accepted';
 exception when raise_exception then if sqlerrm <> 'Cette version PDF existe deja. Changez la version du document.' then raise; end if; end;
 perform set_config('request.jwt.claim.sub','7b000000-0000-0000-0000-000000000004',true);
 if public.procedure_drive_scope('open',source.id)->>'path' <> source.source_google_drive_path then raise exception 'Direction cannot open source'; end if;
 foreach profile in array array['7b000000-0000-0000-0000-000000000002','7b000000-0000-0000-0000-000000000003'] loop
  perform set_config('request.jwt.claim.sub',profile,true);
  if exists(select 1 from public.procedures where id=source.id) then raise exception 'Reader sees private source'; end if;
  if not exists(select 1 from public.published_procedures where id=pdf.id) then raise exception 'Reader cannot see published PDF'; end if;
  scope := public.procedure_drive_scope('read',null,pdf.id);
  if scope->>'directory' <> 'Procedures PDF' or scope->>'sha256' <> repeat('a',64) then raise exception 'Wrong PDF scope'; end if;
  begin perform public.procedure_drive_scope('write'); raise exception 'Reader writes source'; exception when insufficient_privilege then null; end;
  begin perform public.procedure_drive_scope('open',source.id); raise exception 'Reader opens source'; exception when insufficient_privilege then null; end;
  begin perform public.procedure_drive_scope('publish',source.id); raise exception 'Reader converts source'; exception when insufficient_privilege then null; end;
  begin perform public.procedure_drive_scope('write',null,pdf.id); raise exception 'Reader writes PDF'; exception when insufficient_privilege then null; end;
  begin perform public.publish_procedure_drive(source.id,pdf.file_name,100,repeat('a',64)); raise exception 'Reader publishes'; exception when insufficient_privilege then null; end;
  update public.published_procedures set title='Tampered' where id=pdf.id;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Reader changes publication'; end if;
  delete from public.published_procedures where id=pdf.id;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Reader deletes publication'; end if;
 end loop;
 if public.procedure_drive_path_valid('../x.docx') or public.procedure_drive_path_valid('NUL.docx') or public.procedure_drive_path_valid('macro.docm') then raise exception 'Unsafe path accepted'; end if;
 if has_function_privilege('anon','public.procedure_drive_scope(text,bigint,bigint)','execute') then raise exception 'Anonymous RPC allowed'; end if;
end;
$$;
rollback;

