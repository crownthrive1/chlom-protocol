import { GOOGLE_RPC_SUNSET } from "@/lib/chlom/constants";
import { runtimeReadiness } from "@/lib/chlom/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const readiness = runtimeReadiness();
  const ready =
    readiness.apiTokenConfigured &&
    (readiness.googleAnalyticsConfigured ||
      readiness.configuredRpcChains.length > 0);

  return Response.json(
    {
      ok: true,
      service: "CHLOM Chain Evidence Fabric",
      schema: "ct.chlom.chain-evidence-fabric.health.v1",
      status: ready ? "READY" : "CONFIGURATION_HOLD",
      observedAt: new Date().toISOString(),
      readiness,
      boundaries: {
        privateKeysAccepted: false,
        arbitrarySqlAccepted: false,
        arbitraryRpcEndpointAccepted: false,
        rpcReadAllowlist: true,
        chainBroadcastFailClosed: true,
      },
      providerNotice: {
        googleBlockchainRpcStatus: "TRANSITIONAL_DEPRECATED",
        googleBlockchainRpcSunset: GOOGLE_RPC_SUNSET,
        durableGoogleLane: "Blockchain Analytics / BigQuery",
      },
      endpoints: {
        rest: ["/api/v1/rpc", "/api/v1/analytics", "/api/v1/attest"],
        mcp: "/api/mcp",
      },
    },
    {
      status: ready ? 200 : 503,
      headers: { "cache-control": "no-store" },
    },
  );
}
