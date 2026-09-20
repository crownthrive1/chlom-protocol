/** Public CHLOM projections. Never return arbitrary upstream fields. */
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const state = value => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,120}$/.test(value) ? value : null;
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const stamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T[0-9:.+Z-]{8,30}$/.test(value) && Number.isFinite(Date.parse(value)) ? value : null;
function fields(value, keys, transform) {
  const source = object(value);
  return Object.fromEntries(keys.map(key => [key, transform(source[key])]));
}
export function sanitizeDail(value) {
  const source = object(value);
  return {
    ...fields(source, ['integrity_state','public_chain_anchor_state'], state),
    verified_prefix_ok: source.verified_prefix_ok === true,
    ...fields(source, ['sequence_span_lag','current_head_sequence_id','verified_through_sequence_id'], count),
  };
}
export function sanitizeProtocol(value) {
  const source = object(value);
  if (source.contract !== 'ct.chlom.protocol-status.v2') return null;
  return {
    contract: source.contract,
    production_control_plane: source.production_control_plane === true,
    external_l1_state: state(source.external_l1_state),
    ...fields(source, ['ownership_interest_count','rights_instrument_count','dla_version_count','lex_offer_count',
      'agreement_count','entitlement_count','tokenized_object_count','external_production_mint_confirmed_count',
      'settlement_preview_count','money_movement_count','open_review_case_count','wallet_snapshot_count',
      'open_remedy_case_count','policy_pack_count','production_zk_circuit_count','verified_production_zk_proof_count',
      'tokenomics_authorized_count','tokenomics_issuance_executed_count','public_authority_node_count',
      'external_action_confirmed_count'], count),
    dail: sanitizeDail(source.dail), observed_at: stamp(source.observed_at),
  };
}
export function sanitizeControlPlane(value) {
  const source = object(value);
  if (source.contract !== 'ct.chlom.public-control-plane-status.v1') return null;
  const gateway = object(source.authenticated_gateway);
  return {
    ok: source.ok === true, contract: source.contract,
    ...fields(source, ['release_state','release_version'], state),
    boundaries: fields(source.boundaries, ['internal_control_plane','native_runtime','validator_network',
      'external_money_movement','production_token_mint','legal_title_adjudication'], state),
    authenticated_gateway: {slug: state(gateway.slug), verify_jwt: gateway.verify_jwt === true,
      anonymous_access_state: state(gateway.anonymous_access_state)},
    dail: sanitizeDail(source.dail), external_execution_enabled: source.external_execution_enabled === true,
    observed_at: stamp(source.observed_at),
  };
}
export function sanitizeWallet(value) {
  const source = object(value);
  if (source.contract !== 'ct.wallet.production-status.v3') return null;
  const external = object(source.external_wallet), agent = object(source.agent_wallet), checkout = object(source.stablecoin_checkout);
  return {
    contract: source.contract,
    ...fields(source, ['environment','production_state','enforcement_state'], state),
    fail_closed: source.fail_closed === true,
    inventory: fields(source.inventory, ['active_wallets','verified_internal_accounts','service_bindings','gate_receipts'], count),
    external_wallet: {state: state(external.state),wallet_services_state: state(external.wallet_services_state),
      required: external.required === true,user_approval_required: external.user_approval_required === true},
    agent_wallet: {...fields(agent,['health_state','runner_state'],state),fresh: agent.fresh === true,
      max_unattended_value_minor: count(agent.max_unattended_value_minor)},
    stablecoin_checkout: {state: state(checkout.state),crypto_offered: checkout.crypto_offered === true},
    observed_at: stamp(source.observed_at),
  };
}
export function sanitizeMesh(value) {
  const source = object(value);
  if (source.contract !== 'ct.chlom.mesh.status.v2') return null;
  return {
    contract: source.contract,
    ...fields(source,['status','decision','release_readiness'],state),
    all_binding_gates_clear: source.all_binding_gates_clear === true,
    binding_summary: fields(source.binding_summary,['total','operational','pending','held','degraded','deactivated','other'],count),
    latest_heartbeat: {...fields(source.latest_heartbeat,['state'],state),
      ...fields(source.latest_heartbeat,['binding_count','hold_count','degraded_count'],count),
      observed_at: stamp(object(source.latest_heartbeat).observed_at)},
  };
}
export function sanitizeIdentity(value, expectedId) {
  const source = object(value), identity = object(source.identity);
  if (identity.public_id !== expectedId) return null;
  const text = value => typeof value === 'string' ? value.slice(0,512) : null;
  const keys = Array.isArray(identity.public_keys) ? identity.public_keys.slice(0,16).map(entry => {
    const key = object(entry), jwk = object(key.public_jwk);
    return {...fields(key,['key_id','purpose','algorithm','state'],text),
      public_jwk: Object.fromEntries(['kty','use','alg','kid','crv','x','y','n','e']
        .filter(name => typeof jwk[name] === 'string' && jwk[name].length <= 2048).map(name => [name,jwk[name]]))};
  }) : [];
  const lineage = Array.isArray(source.public_lineage) ? source.public_lineage.slice(0,25)
    .filter(entry => entry?.entity_type === 'public_identity' && entry?.entity_id === expectedId)
    .map(entry => fields(entry,['event_id','event_type','schema_version','entity_type','entity_id','entity_version',
      'payload_sha256','previous_event_hash','event_hash','chain_anchor_state','created_at'],text)) : [];
  return {resolver:'CHLOM Public Identity Resolver',identity:{public_id:expectedId,
    ...fields(identity,['did','display_name','state'],text),public_keys:keys},public_lineage:lineage};
}
