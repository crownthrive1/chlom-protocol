import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CANARY_CONTRACT = "ct.chlom.signed-session-http-canary.v1";
const GATEWAY_CONTRACT = "ct.chlom.authenticated-control-plane-gateway.v1";
const GATEWAY_VERSION = "1.1.0";
const DISPATCHER_CONTRACT = "ct.chlom.authenticated-control-plane-dispatch.v3";
const FOUNDER_EMAIL = "contact@crownthrive.com";
const FOUNDER_SUBJECT_ID = "ct.subject.founder.kavonte-jones-sr";
const PROVIDER_FUNCTION_ID = "9e5785d8-3ae6-49d3-8626-4ecc690784fa";
const PROVIDER_FUNCTION_VERSION = 4;
const PROVIDER_BUNDLE_SHA256 = "b1426595021a29106b7f10e344527a390af1f1ed36becb645ed5c1dcddaad540";
const GATEWAY_URL = `${SUPABASE_URL}/functions/v1/chlom-control-plane-v1`;

function response(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, max-age=0",
      "pragma": "no-cache",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
      "x-chlom-canary-contract": CANARY_CONTRACT,
    },
  });
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return hex(new Uint8Array(digest));
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

function validRunKey(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{16,160}$/.test(value);
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { code: "NON_JSON_RESPONSE", body_sha256: await sha256(text) };
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function nestedRecord(value: unknown, key: string): Record<string, unknown> {
  return asRecord(asRecord(value)[key]);
}

async function callGateway(
  method: "GET" | "POST",
  path: string,
  accessToken: string,
  body?: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<{ status: number; body: unknown; bodySha256: string }> {
  const headers: Record<string, string> = {
    "authorization": `Bearer ${accessToken}`,
    "origin": "https://crownthrive.com",
    "accept": "application/json",
    "x-correlation-id": `ctcorr:chlom-signed-session:${crypto.randomUUID()}`,
  };
  if (body) headers["content-type"] = "application/json";
  if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const parsed = await readJson(res);
  return {
    status: res.status,
    body: parsed,
    bodySha256: await sha256(canonicalJson(parsed)),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return response({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return response({ ok: false, code: "CANARY_RUNTIME_NOT_CONFIGURED" }, 500);
  }

  const oneUseToken = req.headers.get("x-chlom-canary-token")?.trim() ?? "";
  if (!/^[0-9a-f]{64}$/.test(oneUseToken)) {
    return response({ ok: false, code: "ONE_USE_CANARY_TOKEN_REQUIRED" }, 401);
  }

  let input: Record<string, unknown>;
  try {
    const parsed = await req.json();
    input = asRecord(parsed);
  } catch {
    return response({ ok: false, code: "INVALID_JSON" }, 400);
  }
  const runKey = input.run_key;
  if (!validRunKey(runKey)) return response({ ok: false, code: "RUN_KEY_INVALID" }, 400);

  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const tokenSha256 = await sha256(oneUseToken);
  const { data: consumed, error: consumeError } = await service.rpc(
    "chlom_consume_signed_session_canary_token_v1",
    { p_run_key: runKey, p_token_sha256: tokenSha256, p_consumer_contract: CANARY_CONTRACT },
  );
  if (consumeError || !asRecord(consumed).ok) {
    return response({ ok: false, code: "ONE_USE_CANARY_TOKEN_REJECTED" }, 403);
  }

  let syntheticUserId = "";
  let founderAccessToken = "";
  let founderSessionCreated = false;
  let founderSessionRevocationRequested = false;
  let unauthorizedUserCreated = false;
  let unauthorizedUserDeleted = false;

  try {
    const { data: linkData, error: linkError } = await service.auth.admin.generateLink({
      type: "magiclink",
      email: FOUNDER_EMAIL,
    });
    if (linkError) throw new Error(`FOUNDER_LINK_GENERATION_FAILED:${linkError.code ?? "UNKNOWN"}`);
    const hashedToken = linkData?.properties?.hashed_token;
    if (!hashedToken) throw new Error("FOUNDER_LINK_HASH_MISSING");

    const { data: founderAuth, error: verifyError } = await anon.auth.verifyOtp({
      token_hash: hashedToken,
      type: "email",
    });
    if (verifyError || !founderAuth.session?.access_token || !founderAuth.user?.id) {
      throw new Error(`FOUNDER_SESSION_CREATION_FAILED:${verifyError?.code ?? "UNKNOWN"}`);
    }
    founderAccessToken = founderAuth.session.access_token;
    founderSessionCreated = true;
    const founderUserId = founderAuth.user.id;

    const capabilities = await callGateway("GET", "/capabilities", founderAccessToken);

    const assetId = `ct.asset.chlom-signed-session-canary.${runKey}`;
    const idempotencyKey = `${runKey}.mutation`;
    const assetFingerprint = await sha256(`${assetId}|1.0.0|${PROVIDER_BUNDLE_SHA256}`);
    const mutationBody = {
      action: "register_asset_binding",
      payload: {
        canonical_asset_id: assetId,
        asset_version_ref: "1.0.0",
        asset_class: "SIGNED_SESSION_HTTP_CANARY",
        fingerprint_sha256: assetFingerprint,
        source_system: "CHLOM_SIGNED_SESSION_HTTP_CANARY",
        source_ref: runKey,
        binding_state: "VERIFIED_FOR_WORKFLOW",
        legal_effect: "SYNTHETIC_CANARY_NO_LEGAL_EFFECT",
        evidence: {
          synthetic: true,
          provider_http_session: true,
          public_asset: false,
          money_movement: false,
          external_chain_transaction: false,
        },
      },
    };
    const firstMutation = await callGateway("POST", "/dispatch", founderAccessToken, mutationBody, idempotencyKey);
    const replayMutation = await callGateway("POST", "/dispatch", founderAccessToken, mutationBody, idempotencyKey);

    const syntheticEmail = `chlom-canary-${crypto.randomUUID()}@crownthrive.invalid`;
    const syntheticPassword = `${crypto.randomUUID()}aA1!${crypto.randomUUID()}`;
    const { data: createdUser, error: createError } = await service.auth.admin.createUser({
      email: syntheticEmail,
      password: syntheticPassword,
      email_confirm: true,
      user_metadata: { purpose: "CHLOM_UNAUTHORIZED_OPERATOR_CANARY", run_key: runKey },
    });
    if (createError || !createdUser.user?.id) {
      throw new Error(`UNAUTHORIZED_USER_CREATION_FAILED:${createError?.code ?? "UNKNOWN"}`);
    }
    syntheticUserId = createdUser.user.id;
    unauthorizedUserCreated = true;

    const syntheticClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: syntheticAuth, error: syntheticAuthError } = await syntheticClient.auth.signInWithPassword({
      email: syntheticEmail,
      password: syntheticPassword,
    });
    if (syntheticAuthError || !syntheticAuth.session?.access_token) {
      throw new Error(`UNAUTHORIZED_USER_SESSION_FAILED:${syntheticAuthError?.code ?? "UNKNOWN"}`);
    }
    const unauthorized = await callGateway(
      "POST",
      "/dispatch",
      syntheticAuth.session.access_token,
      mutationBody,
      `${runKey}.unauthorized`,
    );

    const firstEnvelope = nestedRecord(firstMutation.body, "data");
    const replayEnvelope = nestedRecord(replayMutation.body, "data");
    const firstResult = nestedRecord(firstEnvelope, "result");
    const bindingId = String(firstResult.binding_id ?? "");
    const dispatchReceiptId = String(firstEnvelope.dispatch_receipt_id ?? "");
    const idempotencyResponseSha256 = String(firstEnvelope.idempotency_response_sha256 ?? "");
    const idempotentReplayVerified = replayEnvelope.idempotent_replay === true &&
      String(replayEnvelope.dispatch_receipt_id ?? "") === dispatchReceiptId &&
      String(replayEnvelope.idempotency_response_sha256 ?? "") === idempotencyResponseSha256;

    const { data: exactReadback, error: readbackError } = await service.rpc(
      "chlom_signed_session_canary_readback_v1",
      { p_run_key: runKey, p_canonical_asset_id: assetId },
    );
    if (readbackError) throw new Error(`CANARY_READBACK_FAILED:${readbackError.code ?? "UNKNOWN"}`);
    const readback = asRecord(exactReadback);

    const { error: syntheticDeleteError } = await service.auth.admin.deleteUser(syntheticUserId, false);
    unauthorizedUserDeleted = !syntheticDeleteError;
    syntheticUserId = unauthorizedUserDeleted ? "" : syntheticUserId;

    const { error: founderSignOutError } = await service.auth.admin.signOut(founderAccessToken, "local");
    founderSessionRevocationRequested = !founderSignOutError;
    founderAccessToken = "";

    const unauthorizedDenied = unauthorized.status === 403;
    const duplicateDomainMutations = Number(readback.duplicate_domain_mutations ?? -1);
    const pass = capabilities.status === 200 && firstMutation.status === 200 && replayMutation.status === 200 &&
      idempotentReplayVerified && readback.ok === true && duplicateDomainMutations === 0 &&
      unauthorizedUserCreated && unauthorizedDenied && unauthorizedUserDeleted && founderSessionCreated &&
      founderSessionRevocationRequested;

    const sanitized = {
      run_key: runKey,
      result: pass ? "PASS" : "FAIL",
      founder_subject_id: FOUNDER_SUBJECT_ID,
      founder_user_id: founderUserId,
      gateway_contract: GATEWAY_CONTRACT,
      gateway_version: GATEWAY_VERSION,
      dispatcher_contract: DISPATCHER_CONTRACT,
      provider_function_id: PROVIDER_FUNCTION_ID,
      provider_function_version: PROVIDER_FUNCTION_VERSION,
      provider_bundle_sha256: PROVIDER_BUNDLE_SHA256,
      founder_capabilities_http_status: capabilities.status,
      founder_capabilities_sha256: capabilities.bodySha256,
      founder_mutation_http_status: firstMutation.status,
      founder_mutation_sha256: firstMutation.bodySha256,
      founder_replay_http_status: replayMutation.status,
      founder_replay_sha256: replayMutation.bodySha256,
      binding_id: bindingId,
      dispatch_receipt_id: dispatchReceiptId,
      idempotency_response_sha256: idempotencyResponseSha256,
      idempotent_replay_verified: idempotentReplayVerified,
      duplicate_domain_mutations: duplicateDomainMutations,
      unauthorized_user_created: unauthorizedUserCreated,
      unauthorized_dispatch_http_status: unauthorized.status,
      unauthorized_denial_verified: unauthorizedDenied,
      unauthorized_user_deleted: unauthorizedUserDeleted,
      founder_session_created: founderSessionCreated,
      founder_session_revocation_requested: founderSessionRevocationRequested,
      raw_tokens_returned: false,
      external_execution_enabled: false,
      evidence: {
        canary_contract: CANARY_CONTRACT,
        canary_token_consumed: readback.canary_token_consumed === true,
        binding_record_sha256: readback.binding_record_sha256,
        dispatch_result_sha256: readback.dispatch_result_sha256,
        provider_session_created_by: "GOTRUE_MAGIC_LINK_GENERATE_AND_VERIFY",
        founder_email_sha256: await sha256(FOUNDER_EMAIL.toLowerCase()),
        synthetic_user_email_persisted: false,
        synthetic_password_persisted: false,
        raw_auth_material_persisted: false,
      },
    };

    const { data: receipt, error: receiptError } = await service.rpc(
      "chlom_record_signed_session_canary_v1",
      { p_input: sanitized },
    );
    if (receiptError) throw new Error(`CANARY_RECEIPT_FAILED:${receiptError.code ?? "UNKNOWN"}`);

    return response({
      ok: pass,
      contract: CANARY_CONTRACT,
      result: pass ? "PASS" : "FAIL",
      run_key: runKey,
      founder_session_created: founderSessionCreated,
      founder_session_revocation_requested: founderSessionRevocationRequested,
      founder_capabilities_http_status: capabilities.status,
      founder_mutation_http_status: firstMutation.status,
      founder_replay_http_status: replayMutation.status,
      unauthorized_dispatch_http_status: unauthorized.status,
      unauthorized_denial_verified: unauthorizedDenied,
      unauthorized_user_deleted: unauthorizedUserDeleted,
      idempotent_replay_verified: idempotentReplayVerified,
      duplicate_domain_mutations: duplicateDomainMutations,
      binding_id: bindingId,
      dispatch_receipt_id: dispatchReceiptId,
      receipt: receipt,
      raw_tokens_returned: false,
      external_execution_enabled: false,
    }, pass ? 200 : 409);
  } catch (error) {
    if (syntheticUserId) {
      try {
        const { error: cleanupError } = await service.auth.admin.deleteUser(syntheticUserId, false);
        unauthorizedUserDeleted = !cleanupError;
      } catch {
        // Best-effort cleanup; no secret material is logged.
      }
    }
    if (founderAccessToken) {
      try {
        const { error: signOutError } = await service.auth.admin.signOut(founderAccessToken, "local");
        founderSessionRevocationRequested = !signOutError;
      } catch {
        // Best-effort session revocation; no token is logged.
      }
    }
    console.error("CHLOM signed-session canary failed", error instanceof Error ? error.message.split(":")[0] : "UNKNOWN");
    return response({
      ok: false,
      contract: CANARY_CONTRACT,
      code: error instanceof Error ? error.message.split(":")[0] : "CANARY_FAILED",
      run_key: runKey,
      founder_session_created: founderSessionCreated,
      founder_session_revocation_requested: founderSessionRevocationRequested,
      unauthorized_user_created: unauthorizedUserCreated,
      unauthorized_user_deleted: unauthorizedUserDeleted,
      raw_tokens_returned: false,
      external_execution_enabled: false,
    }, 500);
  }
});
