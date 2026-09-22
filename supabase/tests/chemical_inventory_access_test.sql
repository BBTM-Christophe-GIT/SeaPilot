-- Real Auth/RLS fixtures, independent of the administrator's simulated profile.
begin;
do $test$
declare
  company bigint; vessel bigint; actor uuid; role_name text; i integer:=0; product uuid;
  foreign_vessel bigint; foreign_company bigint; foreign_product uuid; file_id uuid; path text; affected integer;
begin
  select id into strict company from public.companies where code='bbtm';
  select id into strict vessel from public.vessels where company_id=company and name='GOURY' and active;
  select id into foreign_company from public.companies where id<>company limit 1;
  if foreign_company is null then
    insert into public.companies(code,name,active) values('chemical-fixture','Chemical fixture',true) returning id into foreign_company;
  end if;
  insert into public.vessels(name,company_id,asset_kind,active) values('CHEMICAL FIXTURE',foreign_company,'vessel',true) returning id into foreign_vessel;
  insert into public.chemical_products(company_id,vessel_id,product_type) values(foreign_company,foreign_vessel,'Foreign fixture') returning id into foreign_product;
  foreach role_name in array array['admin','direction','armement','capitaine','marin'] loop
    i:=i+1;
    actor:=('cae00000-0000-4000-8000-00000000000' || i)::uuid;
    insert into auth.users(id,email) values(actor,'chemicals-' || role_name || '@example.invalid');
    insert into public.profiles(id,email,display_name,active_company_id) values(actor,'chemicals-' || role_name || '@example.invalid','Chemical fixture',company);
    insert into public.company_memberships(company_id,user_id,active) values(company,actor,true) on conflict(company_id,user_id) do update set active=true;
    insert into public.user_roles(user_id,company_id,role_key) values(actor,company,role_name);
    perform set_config('request.jwt.claim.sub',actor::text,true);
    perform set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    assert public.chemical_has_access(company), 'Profile cannot access chemicals';
    assert not public.chemical_has_access(foreign_company), 'Cross-company access';
    assert not exists(select 1 from public.chemical_products where id=foreign_product), 'Foreign inventory leaked';
    begin
      perform public.chemical_drive_scope(foreign_product);
      raise exception 'Foreign Drive scope accepted';
    exception when insufficient_privilege then null; end;
    assert (select count(*)=10 from public.chemical_products where source_ref like 'goury-inventory-pdf-20260922-%'), 'Source inventory not readable';
    assert (select sum(stock_litres)=130 from public.chemical_products where source_ref like 'goury-inventory-pdf-20260922-%'), 'Source stock mismatch';
    assert (select count(*)=14 and count(stock_litres)=0 from public.chemical_products where source_ref like 'landemer-capture-20260922-%'), 'LANDEMER missing or unknown stock lost';
    assert exists(select 1 from public.chemical_available_vessels() where name='LANDEMER'), 'Field profile cannot filter the fleet';
    insert into public.chemical_products(company_id,vessel_id,product_type,pictograms,stock_litres)
    values(company,vessel,'Fixture ' || role_name,array['GHS02','GHS07'],4.5) returning id into product;
    update public.chemical_products set stock_litres=0 where id=product and version=1;
    assert (select version=2 and stock_litres=0 from public.chemical_products where id=product), 'Zero or revision lost';
    update public.chemical_products set stock_litres=99 where id=product and version=1;
    get diagnostics affected = row_count;
    assert affected=0, 'Stale revision overwrote stock';
    begin
      update public.chemical_products set stock_litres=-1 where id=product;
      raise exception 'Negative stock accepted';
    exception when check_violation then null; end;
    begin
      update public.chemical_products set pictograms=array['UNKNOWN'] where id=product;
      raise exception 'Invalid pictogram accepted';
    exception when check_violation then null; end;
    begin
      update public.chemical_products set vessel_id=foreign_vessel where id=product;
      raise exception 'Cross-company vessel accepted';
    exception when check_violation or insufficient_privilege then null; end;
    file_id:=gen_random_uuid(); path:=(public.chemical_drive_scope(product)->>'folder') || '/' || file_id || '-test.pdf';
    assert public.chemical_drive_scope(product)->>'directory'='Produits Chimiques', 'Incorrect Drive module directory';
    insert into public.chemical_attachments(id,company_id,product_id,drive_path,file_name,mime_type,size_bytes,sha256)
    values(file_id,company,product,path,'test.pdf','application/pdf',4,repeat('a',64));
    assert exists(select 1 from public.chemical_attachments where id=file_id), 'Attachment not readable';
    assert public.chemical_drive_scope(product,file_id)->>'path'=path, 'Exact Drive file not authorized';
    assert public.chemical_drive_scope(product,file_id)->>'sha256'=repeat('a',64), 'Drive hash not returned';
    begin
      insert into public.chemical_attachments(company_id,product_id,drive_path,file_name,mime_type,size_bytes,sha256)
      values(company,product,'Other vessel/' || product || '/missing.pdf','missing.pdf','application/pdf',4,repeat('a',64));
      raise exception 'Arbitrary Drive path accepted';
    exception when insufficient_privilege then null; end;
    begin
      perform public.chemical_drive_scope(product,gen_random_uuid());
      raise exception 'Unregistered file read accepted';
    exception when insufficient_privilege then null; end;
    begin
      perform public.chemical_drive_scope(gen_random_uuid(),file_id);
      raise exception 'Attachment from wrong product accepted';
    exception when insufficient_privilege then null; end;
    delete from public.chemical_attachments where id=file_id;
    assert not exists(select 1 from public.chemical_attachments where id=file_id), 'Attachment cannot be removed';
    update public.chemical_products set deleted_at=now() where id=product and version=2;
    assert not exists(select 1 from public.chemical_products where id=product and deleted_at is null), 'Product cannot be deleted';
    begin
      perform public.chemical_drive_scope(product,file_id);
      raise exception 'Archived Drive file remains accessible';
    exception when insufficient_privilege then null; end;
    execute 'reset role';
  end loop;
  update public.role_module_permissions set is_visible=false where module_key='chemicals' and role_key='marin';
  execute 'set local role authenticated';
  assert not public.chemical_has_access(company), 'Revoked navigation permission still permits database access';
  assert not exists(select 1 from public.chemical_products), 'Revoked profile reads inventory';
  begin
    perform public.chemical_drive_scope((select id from public.chemical_products limit 1));
    raise exception 'Revoked profile reads Drive scope';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  update public.role_module_permissions set is_visible=true where module_key='chemicals' and role_key='marin';
  update public.company_memberships set active=false where company_id=company and user_id=actor;
  execute 'set local role authenticated';
  assert not public.chemical_has_access(company), 'Inactive membership still has access';
  execute 'reset role';
  execute 'set local role anon';
  begin
    perform 1 from public.chemical_products;
    raise exception 'Anonymous read accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.chemical_drive_scope(product,file_id);
    raise exception 'Anonymous Drive scope accepted';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
end $test$;
select 'PASS: five real role fixtures; both imports; stock validation; concurrency; CRUD; Drive metadata and exact file scope; anonymous, revoked, archived and cross-company access denied' as result;
rollback;
