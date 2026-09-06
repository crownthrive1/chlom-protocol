begin;

-- PentaWire exact-provider-contract work is allowed to build and test a
-- deterministic candidate, but it must not become a provider write or release
-- until exact evidence and independent certification exist. This migration
-- repairs the source/runtime materialization gap without manufacturing that
-- evidence or authority.

create or replace function integration_control.penta_factory_materialize_gap_candidate_v1(
  p_work_unit_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'integration_control', 'public', 'extensions'
as $$
declare
  w public.ct_factory_work_units%rowtype;
  br public.ct_factory_build_runs%rowtype;
  rq public.ct_factory_build_requests%rowtype;
  v_service_id text;
  v_safe_service text;
  v_candidate jsonb;
  v_contract jsonb;
  v_manifest jsonb;
  v_report jsonb;
  v_contract_text text;
  v_adapter_text text;
  v_mcp_text text;
  v_test_text text;
  v_contract_sha text;
  v_adapter_sha text;
  v_mcp_sha text;
  v_test_sha text;
  v_manifest_sha text;
  v_report_sha text;
  v_source_count integer := 0;
begin
  if current_user not in ('postgres','service_role') then
    raise exception 'service_role_required' using errcode='42501';
  end if;

  select * into w
  from public.ct_factory_work_units
  where id=p_work_unit_id
  for update;
  if not found then
    raise exception 'factory_work_unit_not_found';
  end if;

  if w.lane <> 'generate' or w.status <> 'passed' then
    raise exception 'penta_wire_candidate_not_materializable';
  end if;

  select * into br
  from public.ct_factory_build_runs
  where id=w.build_run_id;
  if not found then raise exception 'factory_build_run_not_found'; end if;

  select * into rq
  from public.ct_factory_build_requests
  where id=br.build_request_id;
  if not found then raise exception 'factory_build_request_not_found'; end if;

  if rq.source_type <> 'penta_wire_gap' then
    return jsonb_build_object(
      'ok',true,'state','not_applicable','work_unit_id',p_work_unit_id,
      'source_type',rq.source_type,'artifacts_written',0
    );
  end if;

  if coalesce(rq.requirements->>'contract','') <> 'ct.penta.wire.gap-work.v1' then
    raise exception 'penta_wire_gap_contract_invalid';
  end if;
  if coalesce(rq.requirements->>'gap_state','') <> 'exact_provider_contract_required' then
    raise exception 'penta_wire_gap_state_not_materializable';
  end if;
  if coalesce((rq.requirements->>'release_only_after_exact_evidence')::boolean,false) is not true then
    raise exception 'penta_wire_exact_evidence_release_guard_missing';
  end if;
  if coalesce((rq.requirements->>'provider_write')::boolean,true) is not false then
    raise exception 'penta_wire_provider_write_must_be_false';
  end if;
  if coalesce((rq.requirements->>'money_movement')::boolean,true) is not false then
    raise exception 'penta_wire_money_movement_must_be_false';
  end if;
  if coalesce((rq.requirements->>'d3_human_reserved')::boolean,false) is not true then
    raise exception 'penta_wire_d3_reservation_missing';
  end if;

  v_candidate:=coalesce(w.output,'{}'::jsonb);
  if jsonb_typeof(v_candidate) <> 'object'
     or coalesce((v_candidate->>'candidate_only')::boolean,false) is not true
     or not(v_candidate ? 'summary')
     or not(v_candidate ? 'architecture')
     or not(v_candidate ? 'tests')
     or not(v_candidate ? 'security_controls')
     or not(v_candidate ? 'rollback')
     or not(v_candidate ? 'evidence_plan')
     or not(v_candidate ? 'unresolved_dependencies')
     or not(v_candidate ? 'release_recommendation') then
    raise exception 'penta_wire_candidate_schema_incomplete';
  end if;

  -- Fail closed on obvious credential material before copying candidate output
  -- into source artifacts. Vault reference names and descriptions are allowed;
  -- secret-looking values are not.
  if v_candidate::text ~* '(sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----)' then
    raise exception 'penta_wire_candidate_secret_pattern_detected';
  end if;

  v_service_id:=coalesce(rq.requirements->>'service_id','');
  if v_service_id='' then raise exception 'penta_wire_service_id_missing'; end if;
  v_safe_service:=regexp_replace(lower(v_service_id),'[^a-z0-9._-]+','_','g');
  if v_safe_service='' then raise exception 'penta_wire_service_id_invalid'; end if;

  v_contract:=jsonb_build_object(
    'contract','ct.penta.wire.candidate-contract.v1',
    'service_id',v_service_id,
    'request_key',rq.request_key,
    'build_request_id',rq.id,
    'build_run_id',br.id,
    'generate_work_unit_id',w.id,
    'candidate_only',true,
    'exact_evidence_complete',false,
    'independent_certification_complete',false,
    'release_permitted',false,
    'provider_write',false,
    'money_movement',false,
    'authority_ceiling',coalesce(rq.requirements->>'authority_ceiling','D2'),
    'd3_human_reserved',true,
    'generated_candidate',v_candidate
  );
  v_contract_text:=v_contract::text;

  v_adapter_text:=format($ts$
export type PentaWireExactEvidence = Readonly<{
  providerContractVerified: boolean;
  providerReadCanaryVerified: boolean;
  securityTestsPassed: boolean;
  independentCertificateRef?: string;
  authorityCeiling: "D2";
}>;

export const pentaWireCandidate = Object.freeze({
  contract: "ct.penta.wire.fail-closed-read-adapter.v1",
  serviceId: %L,
  candidateOnly: true,
  exactEvidenceComplete: false,
  providerWriteAllowed: false,
  moneyMovementAllowed: false,
  d3HumanReserved: true
} as const);

export function assertPentaWireReleaseReady(evidence: PentaWireExactEvidence): true {
  if (
    !evidence.providerContractVerified ||
    !evidence.providerReadCanaryVerified ||
    !evidence.securityTestsPassed ||
    !evidence.independentCertificateRef ||
    evidence.authorityCeiling !== "D2"
  ) {
    throw new Error("PENTAWIRE_EXACT_EVIDENCE_REQUIRED");
  }
  return true;
}

export async function executeProviderRead(
  _input: unknown,
  evidence: PentaWireExactEvidence
): Promise<never> {
  assertPentaWireReleaseReady(evidence);
  throw new Error("PENTAWIRE_PROVIDER_ADAPTER_NOT_BOUND");
}
$ts$,v_service_id);

  v_mcp_text:=jsonb_build_object(
    'contract','ct.penta.wire.closed-mcp-manifest.v1',
    'service_id',v_service_id,
    'candidate_only',true,
    'exact_evidence_complete',false,
    'enabled_tool_count',0,
    'tools',jsonb_build_array(),
    'release_guard','PENTAWIRE_EXACT_EVIDENCE_REQUIRED'
  )::text;

  v_test_text:=format($ts$
import {
  assertPentaWireReleaseReady,
  pentaWireCandidate
} from "../adapters/%s.candidate.ts";

Deno.test("candidate remains read-only and D3-reserved", () => {
  if (pentaWireCandidate.providerWriteAllowed !== false) throw new Error("provider write enabled");
  if (pentaWireCandidate.d3HumanReserved !== true) throw new Error("D3 reservation lost");
  if (pentaWireCandidate.exactEvidenceComplete !== false) throw new Error("exact evidence fabricated");
});

Deno.test("release fails closed with incomplete exact evidence", () => {
  let blocked=false;
  try {
    assertPentaWireReleaseReady({
      providerContractVerified:false,
      providerReadCanaryVerified:false,
      securityTestsPassed:true,
      authorityCeiling:"D2"
    });
  } catch (error) {
    blocked=String(error).includes("PENTAWIRE_EXACT_EVIDENCE_REQUIRED");
  }
  if (!blocked) throw new Error("release guard failed open");
});
$ts$,v_safe_service);

  v_contract_sha:=encode(extensions.digest(convert_to(v_contract_text,'UTF8'),'sha256'),'hex');
  v_adapter_sha:=encode(extensions.digest(convert_to(v_adapter_text,'UTF8'),'sha256'),'hex');
  v_mcp_sha:=encode(extensions.digest(convert_to(v_mcp_text,'UTF8'),'sha256'),'hex');
  v_test_sha:=encode(extensions.digest(convert_to(v_test_text,'UTF8'),'sha256'),'hex');

  insert into public.ct_factory_artifacts(build_run_id,artifact_type,asset_key,uri,sha256,metadata)
  values
    (br.id,'source_file','provider-contract/'||v_safe_service||'.candidate.json',
      'thrivebase://factory/'||br.id||'/provider-contract/'||v_safe_service||'.candidate.json',v_contract_sha,
      jsonb_build_object('kind','json_document','bytes',octet_length(v_contract_text),'content',v_contract_text,
        'candidate_only',true,'exact_evidence_complete',false,'provider_write',false)),
    (br.id,'source_file','adapters/'||v_safe_service||'.candidate.ts',
      'thrivebase://factory/'||br.id||'/adapters/'||v_safe_service||'.candidate.ts',v_adapter_sha,
      jsonb_build_object('kind','typescript_module','bytes',octet_length(v_adapter_text),'content',v_adapter_text,
        'candidate_only',true,'exact_evidence_complete',false,'provider_write',false)),
    (br.id,'source_file','mcp/'||v_safe_service||'.candidate.tools.json',
      'thrivebase://factory/'||br.id||'/mcp/'||v_safe_service||'.candidate.tools.json',v_mcp_sha,
      jsonb_build_object('kind','mcp_tool_manifest','bytes',octet_length(v_mcp_text),'content',v_mcp_text,
        'candidate_only',true,'exact_evidence_complete',false,'enabled_tool_count',0,'provider_write',false)),
    (br.id,'source_file','tests/'||v_safe_service||'.candidate.contract.test.ts',
      'thrivebase://factory/'||br.id||'/tests/'||v_safe_service||'.candidate.contract.test.ts',v_test_sha,
      jsonb_build_object('kind','deno_test','bytes',octet_length(v_test_text),'content',v_test_text,
        'candidate_only',true,'exact_evidence_complete',false,'provider_write',false))
  on conflict (build_run_id,artifact_type,asset_key) do update
  set uri=excluded.uri,sha256=excluded.sha256,metadata=excluded.metadata;
  get diagnostics v_source_count=row_count;

  v_manifest:=jsonb_build_object(
    'contract','ct.penta.wire.generated-manifest.v1',
    'service_id',v_service_id,
    'candidate_only',true,
    'exact_evidence_complete',false,
    'provider_write',false,
    'files',jsonb_build_array(
      jsonb_build_object('path','provider-contract/'||v_safe_service||'.candidate.json','sha256',v_contract_sha,'kind','json_document'),
      jsonb_build_object('path','adapters/'||v_safe_service||'.candidate.ts','sha256',v_adapter_sha,'kind','typescript_module'),
      jsonb_build_object('path','mcp/'||v_safe_service||'.candidate.tools.json','sha256',v_mcp_sha,'kind','mcp_tool_manifest'),
      jsonb_build_object('path','tests/'||v_safe_service||'.candidate.contract.test.ts','sha256',v_test_sha,'kind','deno_test')
    )
  );
  v_manifest_sha:=encode(extensions.digest(convert_to(v_manifest::text,'UTF8'),'sha256'),'hex');

  insert into public.ct_factory_artifacts(build_run_id,artifact_type,asset_key,uri,sha256,metadata)
  values(br.id,'generated_manifest',v_safe_service||'-candidate-manifest.json',
    'thrivebase://factory/'||br.id||'/generated-manifest/'||v_safe_service,v_manifest_sha,v_manifest)
  on conflict (build_run_id,artifact_type,asset_key) do update
  set uri=excluded.uri,sha256=excluded.sha256,metadata=excluded.metadata;

  v_report:=jsonb_build_object(
    'contract','ct.compiler.v4.penta-wire-gap.v1',
    'compiler','integration_control.penta_factory_materialize_gap_candidate_v1',
    'service_id',v_service_id,
    'candidate_only',true,
    'deterministic',true,
    'source_files',4,
    'exact_evidence_complete',false,
    'independent_certification_complete',false,
    'release_permitted',false,
    'provider_write',false,
    'money_movement',false,
    'authority_expansion',false,
    'd3_human_reserved',true,
    'manifest_sha256',v_manifest_sha
  );
  v_report_sha:=encode(extensions.digest(convert_to(v_report::text,'UTF8'),'sha256'),'hex');

  insert into public.ct_factory_artifacts(build_run_id,artifact_type,asset_key,uri,sha256,metadata)
  values(br.id,'compiler_report',v_safe_service||'-candidate-compiler-report.json',
    'thrivebase://factory/'||br.id||'/compiler-report/'||v_safe_service,v_report_sha,v_report)
  on conflict (build_run_id,artifact_type,asset_key) do update
  set uri=excluded.uri,sha256=excluded.sha256,metadata=excluded.metadata;

  insert into public.ct_factory_events(event_type,entity_type,entity_id,payload)
  values('factory.penta_wire.candidate_materialized','build_run',br.id,jsonb_build_object(
    'work_unit_id',w.id,'build_request_id',rq.id,'service_id',v_service_id,
    'manifest_sha256',v_manifest_sha,'compiler_report_sha256',v_report_sha,
    'source_files',4,'candidate_only',true,'exact_evidence_complete',false,
    'provider_write',false,'money_movement',false,'authority_effect','none',
    'd3_human_reserved',true,'materialized_at',clock_timestamp()
  ));

  return jsonb_build_object(
    'ok',true,'state','candidate_materialized','build_run_id',br.id,
    'work_unit_id',w.id,'service_id',v_service_id,'source_files',4,
    'manifest_sha256',v_manifest_sha,'compiler_report_sha256',v_report_sha,
    'candidate_only',true,'exact_evidence_complete',false,'release_permitted',false,
    'provider_write',false,'money_movement',false,'authority_effect','none'
  );
end
$$;

revoke all on function integration_control.penta_factory_materialize_gap_candidate_v1(uuid) from public;
grant execute on function integration_control.penta_factory_materialize_gap_candidate_v1(uuid) to service_role;

create or replace function integration_control.penta_factory_materialize_gap_candidate_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'integration_control', 'public'
as $$
begin
  if new.lane='generate'
     and new.status='passed'
     and (old.status is distinct from new.status or old.output is distinct from new.output) then
    perform integration_control.penta_factory_materialize_gap_candidate_v1(new.id);
  end if;
  return new;
end
$$;

revoke all on function integration_control.penta_factory_materialize_gap_candidate_trigger_v1() from public;

drop trigger if exists trg_penta_factory_materialize_gap_candidate_v1 on public.ct_factory_work_units;
create trigger trg_penta_factory_materialize_gap_candidate_v1
after update of status,output on public.ct_factory_work_units
for each row
when (new.lane='generate' and new.status='passed')
execute function integration_control.penta_factory_materialize_gap_candidate_trigger_v1();

-- Backfill only already-passed exact-provider PentaWire generate outputs. This
-- does not alter test/package/deploy state and performs no provider action.
do $$
declare r record;
begin
  for r in
    select w.id
    from public.ct_factory_work_units w
    join public.ct_factory_build_runs br on br.id=w.build_run_id
    join public.ct_factory_build_requests rq on rq.id=br.build_request_id
    where w.lane='generate'
      and w.status='passed'
      and rq.source_type='penta_wire_gap'
      and coalesce(rq.requirements->>'contract','')='ct.penta.wire.gap-work.v1'
      and coalesce(rq.requirements->>'gap_state','')='exact_provider_contract_required'
      and coalesce((w.output->>'candidate_only')::boolean,false)=true
  loop
    perform integration_control.penta_factory_materialize_gap_candidate_v1(r.id);
  end loop;
end
$$;

-- Terminalize an unresolved PentaWire deploy lane before a worker can claim it.
-- This is the database-level fail-closed backstop. A subsequent exact-evidence
-- reconciliation must seed a new run; history is preserved rather than rewritten.
create or replace function public.ct_factory_hold_unreleasable_gap_deploys_v1(
  p_limit integer default 16
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $$
declare
  r record;
  v_count integer:=0;
  v_limit integer:=greatest(1,least(coalesce(p_limit,16),64));
begin
  for r in
    select w.id,w.build_run_id,rq.id as build_request_id,
           rq.request_key,rq.requirements->>'service_id' as service_id
    from public.ct_factory_work_units w
    join public.ct_factory_build_runs br on br.id=w.build_run_id
    join public.ct_factory_build_requests rq on rq.id=br.build_request_id
    join public.ct_factory_projects p on p.id=rq.project_id
    where w.lane='deploy'
      and w.status='ready'
      and p.autonomy_enabled=true
      and rq.source_type='penta_wire_gap'
      and coalesce(rq.requirements->>'gap_state','')='exact_provider_contract_required'
      and coalesce((rq.requirements->>'release_only_after_exact_evidence')::boolean,false)=true
    order by rq.priority,rq.created_at,w.ordinal
    for update of w skip locked
    limit v_limit
  loop
    update public.ct_factory_work_units
    set status='hold',
        output=jsonb_build_object(
          'code','PENTAWIRE_EXACT_EVIDENCE_REQUIRED',
          'contract','ct.penta.wire.deploy-hold.v1',
          'service_id',r.service_id,
          'candidate_only',true,
          'exact_evidence_complete',false,
          'provider_write_performed',false,
          'money_movement',false,
          'authority_effect','none',
          'd3_human_reserved',true,
          'retry_mode','new_run_after_exact_evidence',
          'held_at',clock_timestamp()
        ),
        completed_at=clock_timestamp(),
        lease_until=null
    where id=r.id;

    perform public.ct_factory_reconcile_run(r.build_run_id);

    insert into public.ct_factory_events(event_type,entity_type,entity_id,payload)
    values('factory.penta_wire.deploy.held','work_unit',r.id,jsonb_build_object(
      'build_run_id',r.build_run_id,'build_request_id',r.build_request_id,
      'request_key',r.request_key,'service_id',r.service_id,
      'reason','PENTAWIRE_EXACT_EVIDENCE_REQUIRED','provider_write_performed',false,
      'money_movement',false,'authority_effect','none','d3_human_reserved',true,
      'held_at',clock_timestamp()
    ));
    v_count:=v_count+1;
  end loop;

  return jsonb_build_object(
    'ok',true,'held',v_count,'contract','ct.penta.wire.deploy-hold.v1',
    'provider_write_performed',false,'money_movement',false,'authority_effect','none',
    'observed_at',clock_timestamp()
  );
end
$$;

revoke all on function public.ct_factory_hold_unreleasable_gap_deploys_v1(integer) from public;
grant execute on function public.ct_factory_hold_unreleasable_gap_deploys_v1(integer) to service_role;

-- Preserve current factory claim semantics while inserting the release hold
-- before any external worker can receive an unresolved PentaWire deploy unit.
create or replace function public.ct_factory_claim_work(
  p_worker text default 'edge-worker'::text,
  p_lease_seconds integer default 300
)
returns table(
  work_unit_id uuid,
  build_run_id uuid,
  lane text,
  input jsonb,
  project_id uuid,
  build_request_id uuid,
  objective text,
  requirements jsonb
)
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $$
declare
  v_id uuid;
begin
  perform public.ct_factory_hold_unreleasable_gap_deploys_v1(16);

  select w.id into v_id
  from public.ct_factory_work_units w
  join public.ct_factory_build_runs br on br.id=w.build_run_id
  join public.ct_factory_build_requests rq on rq.id=br.build_request_id
  join public.ct_factory_projects p on p.id=rq.project_id
  where w.status='ready'
    and p.autonomy_enabled=true
    and (w.lease_until is null or w.lease_until<clock_timestamp())
    and not public.ct_factory_lane_internal_owned_v1(p.id,w.lane)
    and not (
      w.lane='deploy'
      and rq.source_type='penta_wire_gap'
      and coalesce(rq.requirements->>'gap_state','')='exact_provider_contract_required'
      and coalesce((rq.requirements->>'release_only_after_exact_evidence')::boolean,false)=true
    )
  order by rq.priority asc,rq.created_at asc,w.ordinal asc
  for update of w skip locked
  limit 1;

  if v_id is null then return; end if;

  update public.ct_factory_work_units
  set status='running',attempts=attempts+1,
      started_at=coalesce(started_at,clock_timestamp()),
      lease_until=clock_timestamp()+make_interval(secs=>greatest(30,least(coalesce(p_lease_seconds,300),1800)))
  where id=v_id;

  insert into public.ct_factory_events(event_type,entity_type,entity_id,payload)
  values('factory.work.claimed','work_unit',v_id,jsonb_build_object(
    'worker',p_worker,'internal_owned_lane_excluded',true,
    'penta_wire_release_guard_enforced',true,'claimed_at',clock_timestamp()
  ));

  return query
  select w.id,w.build_run_id,w.lane,w.input,rq.project_id,rq.id,rq.objective,rq.requirements
  from public.ct_factory_work_units w
  join public.ct_factory_build_runs br on br.id=w.build_run_id
  join public.ct_factory_build_requests rq on rq.id=br.build_request_id
  where w.id=v_id;
end
$$;

commit;
