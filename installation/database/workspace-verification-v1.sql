-- Read-only post-install verification. All passed values must be true.
select 'draft RLS' as check_name, relrowsecurity as passed
from pg_class where oid='public.chlom_lex_drafts_v1'::regclass
union all select 'event RLS',relrowsecurity from pg_class where oid='public.chlom_lex_events_v1'::regclass
union all select 'anonymous cannot read drafts',not has_table_privilege('anon','public.chlom_lex_drafts_v1','SELECT')
union all select 'anonymous cannot read events',not has_table_privilege('anon','public.chlom_lex_events_v1','SELECT')
union all select 'authenticated can read drafts',has_table_privilege('authenticated','public.chlom_lex_drafts_v1','SELECT')
union all select 'authenticated cannot write drafts',not has_table_privilege('authenticated','public.chlom_lex_drafts_v1','INSERT,UPDATE,DELETE,TRUNCATE')
union all select 'authenticated cannot write events',not has_table_privilege('authenticated','public.chlom_lex_events_v1','INSERT,UPDATE,DELETE,TRUNCATE')
union all select 'anonymous cannot save',not has_function_privilege('anon','public.chlom_lex_save_draft_v1(uuid,text,text,jsonb,integer,boolean)','EXECUTE')
union all select 'authenticated can save',has_function_privilege('authenticated','public.chlom_lex_save_draft_v1(uuid,text,text,jsonb,integer,boolean)','EXECUTE')
union all select 'public wrapper is invoker',not prosecdef from pg_proc where oid='public.chlom_lex_save_draft_v1(uuid,text,text,jsonb,integer,boolean)'::regprocedure
union all select 'private writer is definer with empty search path',prosecdef and proconfig @> array['search_path=""']
from pg_proc where oid='chlom_workspace_private.save_draft(uuid,text,text,jsonb,integer,boolean)'::regprocedure
union all select 'isolated capability contract',public.chlom_lex_install_capabilities_v1() @>
  '{"installation":"isolated_workspace","private_drafts":true,"canonical_review":false,"canonical_operator":false,"public_catalog":false,"token_issuance":false,"payment_execution":false}'::jsonb;
