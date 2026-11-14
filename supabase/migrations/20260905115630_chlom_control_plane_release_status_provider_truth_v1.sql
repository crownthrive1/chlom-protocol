-- CHLOM control-plane release status provider-truth projection v1
--
-- Purpose:
--   Remove stale hard-coded gateway version/dispatcher claims from
--   public.chlom_control_plane_release_status_v1(). The status projection now
--   reads the latest ACTIVE, provider-read-back deployment record and verifies
--   that the declared dispatcher procedure exists before reporting it.
--
-- Safety / authority:
--   * read-only projection repair; no provider deployment is performed here
--   * no credential, rights, economic, D3, merge, or certification authority
--   * preserves SECURITY DEFINER and fixed search_path
--   * if current provider evidence is absent or the dispatcher contract is
--     unknown/missing, the projection fails closed to UNKNOWN/UNAVAILABLE

create or replace function public.chlom_control_plane_release_status_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'chlom_protocol', 'public'
as $function$
declare
  v_canary chlom_protocol.api_idempotency_records_v1%rowtype;
  v_gateway chlom_protocol.gateway_deployment_versions_v1%rowtype;
  v_gateway_found boolean := false;
  v_gateway_version text := 'UNKNOWN';
  v_dispatcher_contract text;
  v_database_dispatch text;
  v_dispatch_present boolean := false;
  v_dail jsonb;
  v_protocol jsonb;
  v_active_operator_count bigint;
  v_dispatch_count bigint;
  v_idempotency_count bigint;
begin
  select r.* into v_canary
  from chlom_protocol.api_idempotency_records_v1 r
  where r.action='control_plane_canary'
  order by r.recorded_at desc
  limit 1;

  -- Current executable/provider truth wins. Only an ACTIVE deployment with
  -- provider readback may drive the release-status identity projection.
  select g.* into v_gateway
  from chlom_protocol.gateway_deployment_versions_v1 g
  where g.function_slug='chlom-control-plane-v1'
    and g.provider_state='ACTIVE'
    and g.provider_readback
  order by g.version desc, g.recorded_at desc
  limit 1;
  v_gateway_found := found;

  if v_gateway_found then
    v_gateway_version := coalesce(
      nullif(v_gateway.evidence->>'gateway_version',''),
      nullif(v_gateway.evidence#>>'{gateway,version}',''),
      'UNKNOWN'
    );
    v_dispatcher_contract := nullif(v_gateway.evidence->>'dispatcher_contract','');

    v_database_dispatch := case v_dispatcher_contract
      when 'ct.chlom.authenticated-control-plane-dispatch.v1'
        then 'public.chlom_api_dispatch_v1(text,jsonb,text)'
      when 'ct.chlom.authenticated-control-plane-dispatch.v2'
        then 'public.chlom_api_dispatch_v2(text,jsonb,text)'
      when 'ct.chlom.authenticated-control-plane-dispatch.v3'
        then 'public.chlom_api_dispatch_v3(text,jsonb,text)'
      else null
    end;

    if v_database_dispatch is not null then
      v_dispatch_present := to_regprocedure(v_database_dispatch) is not null;
    end if;
  end if;

  select count(*) into v_active_operator_count
  from chlom_protocol.current_api_operators_v1 o
  where o.active;

  select count(*) into v_dispatch_count
  from chlom_protocol.api_dispatch_receipts_v1;

  select count(*) into v_idempotency_count
  from chlom_protocol.api_idempotency_records_v1;

  v_dail:=public.chlom_dail_assurance_status_v4();
  v_protocol:=public.chlom_protocol_status_v1();

  return jsonb_build_object(
    'ok',true,
    'contract','ct.chlom.control-plane-release-status.v1',
    'service','CHLOM authenticated control plane',
    'canonical_expansion','Compliance Hybrid Licensing and Ownership Model',
    'production_control_plane',true,
    'gateway',jsonb_build_object(
      'slug','chlom-control-plane-v1',
      'version',v_gateway_version,
      'jwt_required',case when v_gateway_found then v_gateway.verify_jwt else null end,
      'database_dispatch',case when v_dispatch_present then v_database_dispatch else 'UNAVAILABLE' end,
      'database_dispatch_present',v_dispatch_present,
      'database_capabilities','public.chlom_api_capabilities_v1()',
      'registry_version',case when v_gateway_found then v_gateway.version else null end,
      'provider',case when v_gateway_found then v_gateway.provider else null end,
      'provider_state',case when v_gateway_found then v_gateway.provider_state else 'UNKNOWN' end,
      'provider_readback',case when v_gateway_found then v_gateway.provider_readback else false end,
      'provider_function_id',case when v_gateway_found then v_gateway.evidence->>'provider_function_id' else null end,
      'provider_function_version',case when v_gateway_found then v_gateway.evidence->'provider_function_version' else null end,
      'dispatcher_contract',v_dispatcher_contract,
      'source_sha256',case when v_gateway_found then v_gateway.source_sha256 else null end,
      'deployment_manifest_sha256',case when v_gateway_found then v_gateway.deployment_manifest_sha256 else null end,
      'signed_session_canary_state',case when v_gateway_found then v_gateway.signed_session_canary_state else 'UNKNOWN' end,
      'unauthenticated_boundary_state',case when v_gateway_found then v_gateway.unauthenticated_boundary_state else 'UNKNOWN' end,
      'recorded_at',case when v_gateway_found then v_gateway.recorded_at else null end,
      'projection_state',case
        when not v_gateway_found then 'HOLD_PROVIDER_READBACK_UNAVAILABLE'
        when v_gateway_version='UNKNOWN' then 'HOLD_GATEWAY_VERSION_UNRESOLVED'
        when not v_dispatch_present then 'HOLD_DISPATCHER_UNAVAILABLE'
        else 'CURRENT_PROVIDER_READBACK'
      end,
      'exact_provider_identity_bound',(
        v_gateway_found
        and v_gateway_version<>'UNKNOWN'
        and v_gateway.provider_state='ACTIVE'
        and v_gateway.provider_readback
        and v_dispatch_present
      )
    ),
    'operator_registry',jsonb_build_object(
      'active_operator_count',v_active_operator_count,
      'append_only',true,
      'raw_credentials_recorded',false
    ),
    'dispatch',jsonb_build_object(
      'receipt_count',v_dispatch_count,
      'idempotency_record_count',v_idempotency_count,
      'idempotency_enforced_for_mutations',true,
      'conflicting_key_reuse_fails_closed',true
    ),
    'latest_control_plane_canary',case when v_canary.record_hash is null then
      jsonb_build_object('state','NOT_YET_RECORDED')
    else jsonb_build_object(
      'state',coalesce(v_canary.result->>'state','RECORDED'),
      'contract',v_canary.result->>'contract',
      'record_hash',v_canary.record_hash,
      'request_sha256',v_canary.request_sha256,
      'result_sha256',v_canary.result_sha256,
      'dispatch_receipt_id',v_canary.dispatch_receipt_id,
      'dail_sequence_id',v_canary.dail_sequence_id,
      'dail_event_hash',v_canary.dail_event_hash,
      'recorded_at',v_canary.recorded_at
    ) end,
    'dail',v_dail,
    'protocol',jsonb_build_object(
      'contract',v_protocol->>'contract',
      'production_control_plane',coalesce((v_protocol->>'production_control_plane')::boolean,false),
      'external_l1_state',v_protocol->>'external_l1_state',
      'money_movement_count',coalesce((v_protocol->>'money_movement_count')::bigint,0),
      'external_production_mint_confirmed_count',coalesce((v_protocol->>'external_production_mint_confirmed_count')::bigint,0)
    ),
    'explicitly_excluded_actions',jsonb_build_array(
      'external_money_movement','production_token_mint_confirmation','tokenomics_activation',
      'validator_activation','public_chain_anchor_confirmation','legal_title_adjudication'
    ),
    'external_execution_enabled',false,
    'observed_at',clock_timestamp()
  );
end
$function$;

comment on function public.chlom_control_plane_release_status_v1()
is 'CHLOM authenticated control-plane status projection. Gateway identity is derived from the latest ACTIVE provider-read-back deployment registry record and fails closed when current provider identity cannot be resolved.';
