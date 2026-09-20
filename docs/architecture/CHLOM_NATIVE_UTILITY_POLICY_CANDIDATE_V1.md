# CHLOM native utility and policy candidate v1

These are CHLOM CORE modules in `substrate/chlom-l1`, independent of the LEX application. They are tested native FRAME source, not a deployed chain or activated economy. They retain the workspace's exact Polkadot SDK tag. New crates reference the repository LICENSE; they do not inherit the historical Apache metadata from older crates.

## Resource units and service access

`pallet-chlom-utility` implements per-account, per-resource **nontransferable accounting units**. There is no ticker, exchange rate, token sale, transfer, balance withdrawal or payment dispatch. An account's invariant is:

`allocated = available + reserved + consumed`

Only `UtilityOrigin` may allocate units and approve or revoke service versions. The test runtime uses `EnsureRoot`; a deployment must choose and ratify its actual approval origin. Each allocation includes a nonzero approval provenance commitment. A hash is evidence linkage, not independent proof that legal approval exists.

Service terms are immutable `(service_id, version)` records with a resource identifier, integer cost per action, approval hash and block-number effective interval. Versions start at one, increase consecutively and cannot move effective start times backwards. Approval cannot be backdated. Future scheduling preserves the current version until the new start block. The latest applicable version takes precedence; expiry or revocation does not silently revive older overlapping terms. Stored history is bounded by runtime configuration, with no automatic deletion; expanding capacity requires a reviewed runtime change.

Signed accounts can:

| Call | Effect |
| --- | --- |
| `reserve(operation_id, service_id, version, quantity)` | Require the current active approved version, compute cost with checked integer multiplication, and move available units to reserved units. |
| `consume(operation_id, reservation_id)` | Close the caller's reservation once and move its reserved units to consumed units. |
| `release(operation_id, reservation_id)` | Close the caller's reservation once and restore its reserved units to available units. |

The reservation locks the approved price and resource at reservation time. A later price change does not reprice it. Consumption still requires that its original service terms have not expired or been revoked. Release remains available after expiry/revocation, so units cannot become stranded solely because the service was stopped. These account-authorized consumption records do not prove delivery of an external service. A production service must bind its own authorization and fulfillment checks to the reservation receipt.

Operation IDs, reservations and closures are namespaced by account. A funded caller cannot preempt another account by copying its pending operation ID. The global audit sequence indexes `(account, operation_id)` pairs. An identical retry by the same authorized origin returns success without changing state or appending a second receipt. Reusing an ID for another payload or action within the same account fails. Different accounts may safely use the same ID. An old successful retry does not renew a reservation or reverse its closure. Every new successful operation appends an immutable indexed receipt containing account, resource, units, resulting balances, reservation link, allocation/service approval hash where applicable, request hash and predecessor hash. Closure records are separate from immutable reservations. All balance and sequence arithmetic is checked, and dispatches are transactional.

Receipt hashes are BLAKE2-256 of the SCALE-encoded tuple `(b"CHLOM:resource-receipt:v1", operation_id, receipt_with_zero_receipt_hash)`. Request hashes use the `CHLOM:resource-request:v1` domain. These hashes are public audit commitments, not signatures or privacy proofs. They become as immutable as the actual deployment's consensus and governance; mock execution alone does not establish immutability.

## Approved policy commitments

`pallet-chlom-policy` stores authority-approved versions scoped to exact tenant, jurisdiction and purpose commitments. It never fetches laws, writes legal rules, evaluates private DSL, makes a compliance determination or automatically approves a proposed update. `PolicyOrigin` must approve every version; the test runtime uses `EnsureRoot`.

`approve_version(scope, version, policy_hash, effective_from, effective_until, approval_hash, evidence_hash)` records an immutable version. `revoke_version(scope_id, version, approval_hash, reason_hash)` adds a separate immutable revocation. Exact retries are idempotent; altered retries fail. Scope IDs are domain-separated BLAKE2-256 SCALE commitments over the exact scope tuple. Policy content and evidence stay outside public storage.

`active_policy(scope, block)` selects the newest version whose effective start has arrived. Intervals are **inclusive at the start, exclusive at the end**. Expiry or revocation of that selected version returns no active policy instead of resurrecting old rules. Future versions do not activate early. Historical lookup respects the revocation block; the system cannot backdate a new approval. Callers must treat an absent active policy as unavailable and apply their own approved decision rules. Query work is bounded by `MaxVersionsPerScope`.

## Verification and deployment boundary

The dedicated `chlom-utility-policy-tests` mock runtime exercises authorization, per-account/resource isolation, operation-ID front-running resistance, conservation, exact retry behavior, conflicting operation IDs, reservation ownership, one terminal action, integer/sequence overflow rollback, receipt chaining, price/version timing, release after expiry/revocation, scope isolation, append-only policy history and fail-closed policy selection.

Run from the repository root:

```sh
cargo test --manifest-path substrate/chlom-l1/Cargo.toml --locked -p chlom-utility-policy-tests
```

Both pallets compile against the existing pinned SDK. The local candidate has passed 17 tests, including generated genesis and runtime integrity checks. Dispatch weights are development estimates; production requires benchmarks/generated weights, a composed production runtime, ratified origins and capacity, reproducible Wasm custody, migration/recovery validation and network activation evidence. No validator, economic rail, transferable token or legal effect is activated by this source release.
