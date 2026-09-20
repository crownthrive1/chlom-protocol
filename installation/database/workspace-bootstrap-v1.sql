-- CHLOM LEX isolated workspace bootstrap, contract v1.
-- Run once as postgres in a NEW authorized Supabase project. Never run against
-- an existing CrownThrive/CHLOM installation. This transaction fails on collisions.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

do $$
begin
  if to_regclass('auth.users') is null or to_regprocedure('auth.uid()') is null then
    raise exception 'SUPABASE_AUTH_REQUIRED';
  end if;
  if to_regnamespace('chlom_protocol') is not null
     or to_regnamespace('chlom_workspace_private') is not null
     or to_regclass('public.chlom_lex_drafts_v1') is not null
     or to_regclass('public.chlom_lex_events_v1') is not null
     or exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                where n.nspname='public' and (p.proname like 'chlom_lex_%' or p.proname like 'chlom_api_%')) then
    raise exception 'EXISTING_CHLOM_INSTALLATION: use a reviewed upgrade instead';
  end if;
end $$;

create schema chlom_workspace_private;
revoke all on schema chlom_workspace_private from public, anon, authenticated;
grant usage on schema chlom_workspace_private to authenticated;

create table public.chlom_lex_drafts_v1 (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('asset','license')),
  title text not null check (length(btrim(title)) between 1 and 160),
  payload jsonb not null check (jsonb_typeof(payload)='object' and octet_length(payload::text)<=65536),
  revision integer not null default 1 check (revision>0),
  state text not null default 'DRAFT' check (state in ('DRAFT','ARCHIVED')),
  -- Retain the client shape; canonical review is not installed here.
  review_case_id uuid check (review_case_id is null),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create table public.chlom_lex_events_v1 (
  event_id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.chlom_lex_drafts_v1(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('DRAFT_SAVED','ARCHIVED')),
  revision integer not null check (revision>0),
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  snapshot jsonb not null check (jsonb_typeof(snapshot)='object'),
  review_case_id uuid check (review_case_id is null),
  created_at timestamptz not null default clock_timestamp(),
  unique (draft_id,revision)
);
create index chlom_workspace_drafts_owner_updated on public.chlom_lex_drafts_v1(user_id,updated_at desc);
create index chlom_workspace_events_owner_created on public.chlom_lex_events_v1(user_id,created_at desc);
alter table public.chlom_lex_drafts_v1 enable row level security;
alter table public.chlom_lex_events_v1 enable row level security;
create policy chlom_workspace_draft_owner_read on public.chlom_lex_drafts_v1
  for select to authenticated using (user_id=(select auth.uid()));
create policy chlom_workspace_event_owner_read on public.chlom_lex_events_v1
  for select to authenticated using (user_id=(select auth.uid()));
revoke all on public.chlom_lex_drafts_v1, public.chlom_lex_events_v1 from public,anon,authenticated,service_role;
grant select on public.chlom_lex_drafts_v1, public.chlom_lex_events_v1 to authenticated;

-- Only this narrowly scoped private routine can write. All caller-supplied IDs
-- are checked against auth.uid(); clients cannot grant authority or edit events.
create function chlom_workspace_private.save_draft(
  p_id uuid,p_kind text,p_title text,p_payload jsonb,
  p_expected_revision integer default 0,p_archive boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_row public.chlom_lex_drafts_v1%rowtype;
  v_hash text;
  v_event uuid;
begin
  if v_uid is null then raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED'; end if;
  if not exists (select 1 from auth.users where id=v_uid) then
    raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED';
  end if;
  if p_kind is null or p_kind not in ('asset','license')
     or length(btrim(coalesce(p_title,''))) not between 1 and 160
     or p_payload is null or jsonb_typeof(p_payload)<>'object'
     or octet_length(p_payload::text)>65536
     or p_expected_revision is null or p_expected_revision<0 or p_archive is null then
    raise exception using errcode='22023',message='INVALID_DRAFT';
  end if;
  -- Serialize per-account writes so concurrent calls cannot bypass the caps.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text,0));
  if (select count(*) from public.chlom_lex_events_v1
      where user_id=v_uid and created_at>clock_timestamp()-interval '1 minute')>=30 then
    raise exception using errcode='54000',message='WORKSPACE_RATE_LIMIT';
  end if;
  if p_id is null then
    if p_expected_revision<>0 or p_archive then
      raise exception using errcode='22023',message='INVALID_NEW_DRAFT';
    end if;
    if (select count(*) from public.chlom_lex_drafts_v1 where user_id=v_uid)>=1000 then
      raise exception using errcode='54000',message='WORKSPACE_RECORD_LIMIT';
    end if;
    insert into public.chlom_lex_drafts_v1(user_id,kind,title,payload)
      values(v_uid,p_kind,btrim(p_title),p_payload) returning * into v_row;
  else
    select * into v_row from public.chlom_lex_drafts_v1 where id=p_id and user_id=v_uid for update;
    if not found then raise exception using errcode='42501',message='DRAFT_NOT_ACCESSIBLE'; end if;
    if v_row.revision<>p_expected_revision then
      raise exception using errcode='40001',message='DRAFT_REVISION_CONFLICT';
    end if;
    if v_row.kind<>p_kind then raise exception using errcode='22023',message='DRAFT_KIND_IMMUTABLE'; end if;
    update public.chlom_lex_drafts_v1 set title=btrim(p_title),payload=p_payload,
      revision=revision+1,state=case when p_archive then 'ARCHIVED' else 'DRAFT' end,
      updated_at=clock_timestamp() where id=p_id and user_id=v_uid returning * into v_row;
  end if;
  v_hash:=encode(pg_catalog.sha256(convert_to(p_payload::text,'UTF8')),'hex');
  insert into public.chlom_lex_events_v1(draft_id,user_id,event_type,revision,payload_sha256,snapshot)
    values(v_row.id,v_uid,case when p_archive then 'ARCHIVED' else 'DRAFT_SAVED' end,
           v_row.revision,v_hash,to_jsonb(v_row)) returning event_id into v_event;
  return jsonb_build_object('ok',true,'draft',to_jsonb(v_row),'event_id',v_event,
    'payload_sha256',v_hash,'authority_created',false,'publicly_listed',false);
end $$;
revoke all on function chlom_workspace_private.save_draft(uuid,text,text,jsonb,integer,boolean)
  from public,anon,authenticated,service_role;
grant execute on function chlom_workspace_private.save_draft(uuid,text,text,jsonb,integer,boolean) to authenticated;

create function public.chlom_lex_save_draft_v1(
  p_id uuid,p_kind text,p_title text,p_payload jsonb,
  p_expected_revision integer default 0,p_archive boolean default false
) returns jsonb language sql security invoker set search_path = '' as $$
  select chlom_workspace_private.save_draft(p_id,p_kind,p_title,p_payload,p_expected_revision,p_archive);
$$;
revoke all on function public.chlom_lex_save_draft_v1(uuid,text,text,jsonb,integer,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.chlom_lex_save_draft_v1(uuid,text,text,jsonb,integer,boolean) to authenticated;

create function public.chlom_lex_install_capabilities_v1()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('installation','isolated_workspace','schema_version',1,
    'private_drafts',true,'private_activity',true,'canonical_review',false,
    'canonical_operator',false,'public_catalog',false,'public_resolver',false,
    'token_issuance',false,'payment_execution',false,'authority_created',false);
$$;
revoke all on function public.chlom_lex_install_capabilities_v1() from public,anon,authenticated,service_role;
grant execute on function public.chlom_lex_install_capabilities_v1() to anon,authenticated;

-- Explicitly unavailable endpoints preserve API diagnostics without manufacturing
-- canonical registry records, licenses, catalog inventory, or review authority.
create function public.chlom_lex_public_offers_v1()
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin raise exception using errcode='0A000',message='CAPABILITY_NOT_INSTALLED: public_catalog'; end $$;
create function public.chlom_lex_request_review_v1(p_id uuid,p_expected_revision integer,p_message text default '')
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin raise exception using errcode='0A000',message='CAPABILITY_NOT_INSTALLED: canonical_review'; end $$;
create function public.chlom_api_dispatch_v3(p_action text,p_payload jsonb default '{}',p_idempotency_key text default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin raise exception using errcode='0A000',message='CAPABILITY_NOT_INSTALLED: canonical_operator'; end $$;
revoke all on function public.chlom_lex_public_offers_v1() from public,anon,authenticated,service_role;
revoke all on function public.chlom_lex_request_review_v1(uuid,integer,text) from public,anon,authenticated,service_role;
revoke all on function public.chlom_api_dispatch_v3(text,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.chlom_lex_public_offers_v1() to anon,authenticated;
grant execute on function public.chlom_lex_request_review_v1(uuid,integer,text) to authenticated;
grant execute on function public.chlom_api_dispatch_v3(text,jsonb,text) to authenticated;

notify pgrst,'reload schema';
commit;
