#!/usr/bin/env python3
"""Exercise a temporary local CHLOM chain through its real JSON-RPC service.

CrownThrive-authored; governed by the repository LICENSE. Never use production keys.
"""
import argparse
import hashlib
import json
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path


PALLETS = (
    "ChlomAuthority", "ChlomIdentity", "ChlomRights", "ChlomLicensing",
    "ChlomSettlement", "ChlomTokenization", "ChlomOracle", "ChlomCheckpoint",
    "ChlomUtility", "ChlomPolicy",
)


def unused_port():
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return listener.getsockname()[1]


def rpc(port, method, params=None):
    request = urllib.request.Request(
        f"http://127.0.0.1:{port}",
        json.dumps({"jsonrpc": "2.0", "id": 1, "method": method,
                    "params": [] if params is None else params}).encode(),
        {"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=5) as response:
        raw = response.read(4 * 1024 * 1024 + 1)
    if len(raw) > 4 * 1024 * 1024:
        raise RuntimeError("RPC response exceeds smoke limit")
    result = json.loads(raw)
    if "error" in result:
        raise RuntimeError(f"RPC {method} failed: {result['error']}")
    return result["result"]


def height(header):
    return int(header["number"], 16)


def run(node, output, timeout):
    started = time.monotonic()
    rpc_port, p2p_port = unused_port(), unused_port()
    while p2p_port == rpc_port:
        p2p_port = unused_port()
    with tempfile.TemporaryDirectory(prefix="chlom-native-smoke-") as temporary:
        log_path = Path(temporary) / "node.log"
        with log_path.open("w+") as log:
            command = [str(node), "--dev", "--tmp", "--no-telemetry", "--no-mdns",
                       "--rpc-port", str(rpc_port), "--rpc-methods", "safe",
                       "--listen-addr", f"/ip4/127.0.0.1/tcp/{p2p_port}"]
            process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT)
            try:
                health = None
                while time.monotonic() - started < timeout:
                    if process.poll() is not None:
                        raise RuntimeError(f"Node exited with code {process.returncode}")
                    try:
                        health = rpc(rpc_port, "system_health")
                        break
                    except (urllib.error.URLError, ConnectionError, TimeoutError):
                        time.sleep(0.5)
                if health is None:
                    raise RuntimeError("Node RPC did not become ready")
                version = rpc(rpc_port, "state_getRuntimeVersion")
                if version.get("specName") != "chlom-runtime":
                    raise RuntimeError(f"Unexpected runtime: {version.get('specName')!r}")
                metadata_hex = rpc(rpc_port, "state_getMetadata")
                metadata = bytes.fromhex(metadata_hex.removeprefix("0x"))
                code_hex = rpc(rpc_port, "state_getStorage", ["0x3a636f6465"])
                if not isinstance(code_hex, str) or not code_hex.startswith("0x"):
                    raise RuntimeError("Node did not return embedded :code storage")
                code_hash = hashlib.sha256(bytes.fromhex(code_hex[2:])).hexdigest()
                if not metadata.startswith(b"meta") or len(metadata) < 1000:
                    raise RuntimeError("Runtime returned invalid or incomplete metadata")
                missing = [name for name in PALLETS if name.encode() not in metadata]
                if missing:
                    raise RuntimeError(f"Missing native pallet metadata: {missing}")
                initial = height(rpc(rpc_port, "chain_getHeader"))
                final = initial
                finalized = 0
                while time.monotonic() - started < timeout:
                    if process.poll() is not None:
                        raise RuntimeError("Node exited before block/finality acceptance")
                    final = height(rpc(rpc_port, "chain_getHeader"))
                    finalized_hash = rpc(rpc_port, "chain_getFinalizedHead")
                    finalized = height(rpc(rpc_port, "chain_getHeader", [finalized_hash]))
                    if final >= initial + 2 and finalized > 0:
                        break
                    time.sleep(1)
                if final < initial + 2 or finalized <= 0:
                    raise RuntimeError("Aura blocks or GRANDPA finality did not advance")
                health = rpc(rpc_port, "system_health")
                if health.get("isSyncing") is not False:
                    raise RuntimeError("Development node remained syncing")
                with node.open("rb") as binary:
                    node_hash = hashlib.file_digest(binary, "sha256").hexdigest()
                receipt = {
                    "schema": "chlom.native.smoke.v1", "accepted": True,
                    "nodeSha256": node_hash,
                    "runtimeCodeSha256": code_hash,
                    "chain": "dev", "temporary": True, "rpcBinding": "127.0.0.1",
                    "runtime": version, "pallets": list(PALLETS), "health": health,
                    "initialBlock": initial, "observedBlock": final,
                    "finalizedBlock": finalized,
                    "metadataSha256": hashlib.sha256(metadata).hexdigest(),
                    "durationSeconds": round(time.monotonic() - started, 3),
                    "productionNetworkActivated": False,
                }
                output.parent.mkdir(parents=True, exist_ok=True)
                output.write_text(json.dumps(receipt, indent=2) + "\n")
                print(json.dumps(receipt))
            except Exception:
                log.flush()
                log.seek(0)
                print(log.read()[-24000:])
                raise
            finally:
                if process.poll() is None:
                    process.terminate()
                    try:
                        process.wait(timeout=15)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait(timeout=5)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--node", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--timeout", type=int, default=120)
    arguments = parser.parse_args()
    if not 15 <= arguments.timeout <= 600:
        parser.error("timeout must be between 15 and 600 seconds")
    run(arguments.node.resolve(strict=True), arguments.output, arguments.timeout)
