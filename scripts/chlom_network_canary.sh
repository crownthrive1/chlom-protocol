#!/usr/bin/env bash
set -Eeuo pipefail

NODE=${1:?node binary required}
CHAIN=${2:?chain spec required}
OUT=${3:?output directory required}
mkdir -p "$OUT"
ALICE_BASE="$OUT/alice"
BOB_BASE="$OUT/bob"
ALICE_LOG="$OUT/alice.log"
BOB_LOG="$OUT/bob.log"
BOB_RESTART_LOG="$OUT/bob-restart.log"
ALICE_PID=""
BOB_PID=""

cleanup() {
  set +e
  [[ -n "$BOB_PID" ]] && kill "$BOB_PID" 2>/dev/null
  [[ -n "$ALICE_PID" ]] && kill "$ALICE_PID" 2>/dev/null
  [[ -n "$BOB_PID" ]] && wait "$BOB_PID" 2>/dev/null
  [[ -n "$ALICE_PID" ]] && wait "$ALICE_PID" 2>/dev/null
}
trap cleanup EXIT

rpc() {
  local port=$1 method=$2 params=${3:-'[]'}
  curl --fail --silent --show-error --max-time 3 \
    -H 'content-type: application/json' \
    --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"${method}\",\"params\":${params}}" \
    "http://127.0.0.1:${port}"
}

wait_rpc() {
  local port=$1
  for _ in $(seq 1 90); do
    if rpc "$port" system_health >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  return 1
}

block_height() {
  local port=$1 hex
  hex=$(rpc "$port" chain_getHeader | jq -er '.result.number')
  printf '%d\n' "$((16#${hex#0x}))"
}

rm -rf "$ALICE_BASE" "$BOB_BASE"
"$NODE" \
  --base-path "$ALICE_BASE" --chain "$CHAIN" --alice --validator --force-authoring \
  --port 30333 --rpc-port 9944 --rpc-methods Unsafe --rpc-cors all --no-telemetry \
  >"$ALICE_LOG" 2>&1 &
ALICE_PID=$!
wait_rpc 9944
ALICE_PEER=$(rpc 9944 system_localPeerId | jq -er '.result')
GENESIS_A=$(rpc 9944 chain_getBlockHash '[0]' | jq -er '.result')

"$NODE" \
  --base-path "$BOB_BASE" --chain "$CHAIN" --bob --validator --force-authoring \
  --port 30334 --rpc-port 9945 --rpc-methods Unsafe --rpc-cors all --no-telemetry \
  --bootnodes "/ip4/127.0.0.1/tcp/30333/p2p/${ALICE_PEER}" \
  >"$BOB_LOG" 2>&1 &
BOB_PID=$!
wait_rpc 9945
GENESIS_B=$(rpc 9945 chain_getBlockHash '[0]' | jq -er '.result')
[[ "$GENESIS_A" == "$GENESIS_B" ]]

for _ in $(seq 1 90); do
  A1=$(block_height 9944)
  B1=$(block_height 9945)
  PEERS=$(rpc 9945 system_health | jq -er '.result.peers')
  if (( A1 >= 3 && B1 >= 3 && PEERS >= 1 )); then break; fi
  sleep 2
done
(( A1 >= 3 && B1 >= 3 && PEERS >= 1 ))

kill "$BOB_PID"
wait "$BOB_PID" || true
BOB_PID=""
BOB_STOP_HEIGHT=$B1
sleep 12
ALICE_AFTER_STOP=$(block_height 9944)
(( ALICE_AFTER_STOP > BOB_STOP_HEIGHT ))

"$NODE" \
  --base-path "$BOB_BASE" --chain "$CHAIN" --bob --validator --force-authoring \
  --port 30334 --rpc-port 9945 --rpc-methods Unsafe --rpc-cors all --no-telemetry \
  --bootnodes "/ip4/127.0.0.1/tcp/30333/p2p/${ALICE_PEER}" \
  >"$BOB_RESTART_LOG" 2>&1 &
BOB_PID=$!
wait_rpc 9945
GENESIS_B_RESTART=$(rpc 9945 chain_getBlockHash '[0]' | jq -er '.result')
[[ "$GENESIS_B_RESTART" == "$GENESIS_A" ]]

for _ in $(seq 1 90); do
  A2=$(block_height 9944)
  B2=$(block_height 9945)
  PEERS2=$(rpc 9945 system_health | jq -er '.result.peers')
  DELTA=$(( A2 > B2 ? A2 - B2 : B2 - A2 ))
  if (( B2 > BOB_STOP_HEIGHT && PEERS2 >= 1 && DELTA <= 3 )); then break; fi
  sleep 2
done
(( B2 > BOB_STOP_HEIGHT && PEERS2 >= 1 && DELTA <= 3 ))

RUNTIME_VERSION=$(rpc 9944 state_getRuntimeVersion | jq -c '.result')
ALICE_HEALTH=$(rpc 9944 system_health | jq -c '.result')
BOB_HEALTH=$(rpc 9945 system_health | jq -c '.result')

jq -n \
  --arg contract 'ct.chlom.network-recovery-canary.v1' \
  --arg genesis "$GENESIS_A" \
  --arg alice_peer "$ALICE_PEER" \
  --argjson initial_alice "$A1" \
  --argjson initial_bob "$B1" \
  --argjson alice_after_stop "$ALICE_AFTER_STOP" \
  --argjson final_alice "$A2" \
  --argjson final_bob "$B2" \
  --argjson final_delta "$DELTA" \
  --argjson alice_health "$ALICE_HEALTH" \
  --argjson bob_health "$BOB_HEALTH" \
  --argjson runtime_version "$RUNTIME_VERSION" \
  '{
    contract:$contract,
    result:"PASS",
    genesis_hash:$genesis,
    alice_peer_id:$alice_peer,
    initial:{alice_height:$initial_alice,bob_height:$initial_bob},
    interruption:{bob_stopped_at:$initial_bob,alice_advanced_to:$alice_after_stop},
    recovery:{alice_height:$final_alice,bob_height:$final_bob,height_delta:$final_delta,bob_state_reused:true,genesis_preserved:true},
    health:{alice:$alice_health,bob:$bob_health},
    runtime_version:$runtime_version,
    private_keys_exported:false,
    public_authority_activated:false,
    external_money_movement:false,
    external_token_mint:false
  }' > "$OUT/network-recovery-receipt.json"

sha256sum "$ALICE_LOG" "$BOB_LOG" "$BOB_RESTART_LOG" "$OUT/network-recovery-receipt.json" > "$OUT/network-canary-sha256.txt"
cat "$OUT/network-recovery-receipt.json"
