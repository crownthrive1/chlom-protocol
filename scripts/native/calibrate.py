#!/usr/bin/env python3
"""Measure CHLOM's compiled runtime; preserve evidence without changing active weights.

CLI flags and JSON schema are pinned to polkadot-stable2506-7, FRAME benchmark CLI.
This runs a local synthetic development chain's benchmark API, never a live network.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import os
from pathlib import Path
import platform
import shutil
import statistics
import subprocess
import sys
import time
from datetime import datetime, timezone

EXPECTED = {
    "authority": ["record_grant_version"],
    "identity": ["record_identity_version", "record_credential_version"],
    "rights": ["record_ownership_interest", "record_rights_instrument"],
    "licensing": ["record_dla_version", "record_license_version", "record_lex_offer_version", "record_entitlement_version"],
    "settlement": ["record_revenue_policy", "preview_settlement"],
    "tokenization": ["record_token_class", "record_chain_adapter", "register_tokenized_object", "record_provider_event"],
    "oracle": ["report_signal", "record_review_decision"],
    "checkpoint": ["record_checkpoint", "record_anchor_intent", "record_anchor_receipt"],
    "utility": ["approve_service", "revoke_service", "allocate", "reserve", "consume", "release"],
    "policy": ["approve_version", "revoke_version"],
}
SDK_TAG = "polkadot-stable2506-7"


def utcnow():
    return datetime.now(timezone.utc).isoformat()


def digest(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def write_json(path, value):
    temp = Path(str(path) + ".tmp")
    temp.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")
    temp.replace(path)


def git(repo, *args):
    return subprocess.check_output(["git", "-C", str(repo), *args], text=True).strip()


def source_snapshot(repo):
    tracked = git(repo, "ls-files", "-z", "substrate/chlom-l1").split("\0")
    untracked = git(repo, "ls-files", "--others", "--exclude-standard", "-z", "substrate/chlom-l1").split("\0")
    sources = {name: digest(repo / name) for name in sorted(set(tracked + untracked)) if name and (repo / name).is_file()}
    serialized = json.dumps(sources, sort_keys=True, separators=(",", ":")).encode()
    return {"git_commit": git(repo, "rev-parse", "HEAD"), "native_files_sha256": sources,
            "native_snapshot_sha256": hashlib.sha256(serialized).hexdigest(),
            "native_worktree_status": git(repo, "status", "--short", "--", "substrate/chlom-l1")}


def read_optional(path):
    try:
        return Path(path).read_text().strip()
    except OSError:
        return None


def host_info():
    cpu_text = read_optional("/proc/cpuinfo") or ""
    model = next((line.split(":", 1)[1].strip() for line in cpu_text.splitlines() if line.startswith("model name")), None)
    memory = read_optional("/proc/meminfo") or ""
    memory_total = next((line.split(":", 1)[1].strip() for line in memory.splitlines() if line.startswith("MemTotal:")), None)
    return {"os": platform.system(), "kernel": platform.release(), "machine": platform.machine(),
            "cpu_model": model, "logical_cpu_count": os.cpu_count(),
            "affinity_cpu_count": len(os.sched_getaffinity(0)) if hasattr(os, "sched_getaffinity") else None,
            "cpu_cgroup_quota": read_optional("/sys/fs/cgroup/cpu.max"),
            "memory_cgroup_limit": read_optional("/sys/fs/cgroup/memory.max"),
            "host_memory_total": memory_total, "load_average": list(os.getloadavg()),
            "cpu0_governor": read_optional("/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor")}


def summarize_batches(data, pallet, expected):
    if not isinstance(data, list):
        raise ValueError("benchmark result must be a list")
    seen, summaries = set(), []
    for batch in data:
        name = batch.get("benchmark")
        if batch.get("pallet") != pallet or name not in expected or name in seen:
            raise ValueError(f"unexpected or repeated benchmark: {batch.get('pallet')}::{name}")
        seen.add(name)
        timing, database = batch.get("time_results"), batch.get("db_results")
        if not timing or not database:
            raise ValueError(f"missing measured timing/database samples for {name}")
        for sample in timing + database:
            for field in ("extrinsic_time", "reads", "writes", "proof_size"):
                if not isinstance(sample.get(field), int) or isinstance(sample[field], bool) or sample[field] < 0:
                    raise ValueError(f"invalid {field} sample for {name}")
        times = [sample["extrinsic_time"] for sample in timing]
        if min(times) <= 0:
            raise ValueError(f"nonpositive timing sample for {name}")
        ranges = {}
        for sample in timing:
            for component, value in sample.get("components", []):
                prior = ranges.setdefault(component, {"minimum": value, "maximum": value})
                prior["minimum"], prior["maximum"] = min(prior["minimum"], value), max(prior["maximum"], value)
        summaries.append({"pallet": pallet, "dispatch": name, "time_samples": len(timing), "database_samples": len(database),
                          "sample_extrinsic_time_ns": {"minimum": min(times), "median": statistics.median(times), "maximum": max(times)},
                          "maximum_observed_proof_bytes": max(sample["proof_size"] for sample in database),
                          "maximum_observed_reads": max(sample["reads"] for sample in database),
                          "maximum_observed_writes": max(sample["writes"] for sample in database),
                          "component_ranges": ranges})
    if seen != set(expected):
        raise ValueError(f"missing benchmarks: {sorted(set(expected) - seen)}")
    return summaries


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--binary", required=True, type=Path)
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--output", required=True, type=Path, help="new directory for immutable measurement artifacts")
    parser.add_argument("--steps", type=int, default=50)
    parser.add_argument("--repeat", type=int, default=20)
    parser.add_argument("--external-repeat", type=int, default=1)
    parser.add_argument("--db-cache", type=int, default=256)
    parser.add_argument("--timeout", type=int, default=1800, help="maximum seconds per command")
    parser.add_argument("--expected-binary-sha256")
    args = parser.parse_args(argv)
    if args.steps < 2 or min(args.repeat, args.external_repeat, args.db_cache, args.timeout) < 1:
        parser.error("steps must be >=2 and repeat/cache/timeout parameters must be positive")
    binary, repo, out = args.binary.resolve(), args.repo.resolve(), args.output.resolve()
    if not binary.is_file() or not os.access(binary, os.X_OK):
        parser.error("--binary must be an existing executable built with runtime-benchmarks")
    if out.exists():
        parser.error("--output must not exist; preserve earlier measurements in place")
    template = Path(__file__).with_name("measurement-floor.hbs").resolve()
    if not template.is_file():
        parser.error("measurement template missing")
    binary_hash = digest(binary)
    if args.expected_binary_sha256 and binary_hash != args.expected_binary_sha256:
        parser.error("binary hash differs from --expected-binary-sha256")
    out.mkdir(parents=True)
    for subdirectory in ("logs", "raw", "candidate-weights"):
        (out / subdirectory).mkdir()
    shutil.copyfile(template, out / "measurement-floor.hbs")
    receipt_path = out / "measurement-receipt.json"
    receipt = {"schema": "chlom.native.hardware-measurement.v1", "started_at": utcnow(), "state": "RUNNING",
               "sdk_tag": SDK_TAG, "binary": {"filename": binary.name, "sha256": binary_hash, "bytes": binary.stat().st_size},
               "runner_sha256": digest(__file__), "template_sha256": digest(template), "hardware_before": host_info(),
               "source_before": source_snapshot(repo), "commands": [], "measurements": [],
               "settings": {"steps": args.steps, "repeat": args.repeat, "external_repeat": args.external_repeat,
                            "wasm_execution": "compiled", "database_cache_mib": args.db_cache,
                            "proof_recording_enabled": True, "verification_enabled": True,
                            "pov_estimation": "max-encoded-len", "assumed_map_size": 1000000, "additional_trie_layers": 3},
               "limits": ["Development runtime with synthetic data; no production network transactions.",
                          "Observed proof bytes are samples, not general proof-size bounds.",
                          "SDK proof estimates depend on recorded map-size/trie-layer assumptions.",
                          "Host scheduling and concurrent workloads can affect execution timing.",
                          "Source snapshot and binary hashes are recorded independently; no reproducible-build attestation is implied.",
                          "Candidate schedules retain the original schedule as a componentwise floor and are not activated."]}
    write_json(receipt_path, receipt)

    def public_text(value):
        # Preserve reproducible command structure without publishing workstation paths.
        for original, replacement in sorted(((str(binary), "$CHLOM_NODE"), (str(out), "$MEASUREMENTS"),
                                              (str(repo), "$SOURCE_ROOT"), (str(Path.home()), "$USER_HOME")),
                                             key=lambda item: len(item[0]), reverse=True):
            value = value.replace(original, replacement)
        return value

    def sanitize_log(path):
        if path.is_file():
            path.write_text(public_text(path.read_text(errors="replace")))

    def run(label, arguments, stdout_path=None):
        command = [str(binary), *arguments]
        stdout_path = stdout_path or out / "logs" / f"{label}.stdout.log"
        stderr_path = out / "logs" / f"{label}.stderr.log"
        record = {"label": label, "argv": [public_text(arg) for arg in command], "started_at": utcnow(), "stdout": str(stdout_path.relative_to(out)),
                  "stderr": str(stderr_path.relative_to(out))}
        receipt["commands"].append(record)
        write_json(receipt_path, receipt)
        print(f"Starting {label}", flush=True)
        start = time.monotonic()
        try:
            with stdout_path.open("wb") as stdout, stderr_path.open("wb") as stderr:
                completed = subprocess.run(command, cwd=repo, stdout=stdout, stderr=stderr, timeout=args.timeout, check=False)
            record["return_code"] = completed.returncode
            if completed.returncode:
                raise RuntimeError(f"{label} failed with exit {completed.returncode}; see {stderr_path}")
        finally:
            if stdout_path.parent == out / "logs":
                sanitize_log(stdout_path)
            sanitize_log(stderr_path)
            record["elapsed_seconds"] = round(time.monotonic() - start, 3)
            record["finished_at"] = utcnow()
            write_json(receipt_path, receipt)
        print(f"Completed {label} in {record['elapsed_seconds']} seconds", flush=True)
        return stdout_path

    try:
        rustc = shutil.which("rustc") or str(Path.home() / ".cargo" / "bin" / "rustc")
        compiler = subprocess.run([rustc, "--version", "--verbose"], cwd=repo / "substrate/chlom-l1", capture_output=True, text=True, timeout=60, check=True)
        receipt["compiler"] = public_text(compiler.stdout.strip())
        run("version", ["--version"])
        run("benchmark-help", ["benchmark", "pallet", "--help"])
        spec_path = run("build-spec", ["build-spec", "--chain", "dev", "--raw", "--disable-default-bootnode"], out / "development.raw.json")
        spec = json.loads(spec_path.read_text())
        code_hex = spec["genesis"]["raw"]["top"]["0x3a636f6465"]
        if not code_hex.startswith("0x"):
            raise ValueError("genesis runtime code must be hex encoded")
        wasm_path = out / "benchmark-runtime.wasm"
        wasm_path.write_bytes(bytes.fromhex(code_hex[2:]))
        receipt["runtime_blob"] = {"path": wasm_path.name, "sha256": digest(wasm_path), "bytes": wasm_path.stat().st_size,
                                   "note": "Exact genesis :code bytes; SDK may store a compressed Wasm blob."}
        receipt["chain_spec"] = {"path": spec_path.name, "sha256": digest(spec_path), "name": spec.get("name"), "id": spec.get("id")}
        # Reuse the saved raw specification so every process executes identical genesis code.
        base = ["benchmark", "pallet", "--chain", str(spec_path), "--genesis-builder", "spec", "--wasm-execution", "compiled"]
        listing = run("list", [*base, "--list=all"])
        available = {(row[0].strip(), row[1].strip()) for row in csv.reader(io.StringIO(listing.read_text())) if len(row) == 2}
        expected = {(f"pallet_chlom_{pallet}", name) for pallet, names in EXPECTED.items() for name in names}
        actual = {pair for pair in available if pair[0].startswith("pallet_chlom_")}
        if actual != expected:
            raise ValueError(f"runtime benchmark inventory mismatch; missing={sorted(expected - actual)}, extra={sorted(actual - expected)}")
        receipt["inventory_verified"] = {"pallets": len(EXPECTED), "dispatches": len(expected)}
        for pallet, names in EXPECTED.items():
            pallet_name = f"pallet_chlom_{pallet}"
            raw_path = out / "raw" / f"{pallet}.json"
            generated_path = out / "candidate-weights" / f"{pallet}.rs"
            run(pallet, [*base, "--pallet", pallet_name, "--extrinsic", "*", "--steps", str(args.steps),
                         "--repeat", str(args.repeat), "--external-repeat", str(args.external_repeat),
                         "--db-cache", str(args.db_cache), "--json-file", str(raw_path), "--output", str(generated_path),
                         "--template", str(out / "measurement-floor.hbs"), "--output-analysis", "max",
                         "--output-pov-analysis", "max", "--default-pov-mode", "max-encoded-len",
                         "--map-size", "1000000", "--additional-trie-layers", "3", "--hostname-override", "chlom-calibration-host"])
            measurements = summarize_batches(json.loads(raw_path.read_text()), pallet_name, names)
            if not generated_path.is_file() or generated_path.stat().st_size == 0:
                raise ValueError(f"no candidate schedule generated for {pallet}")
            receipt["measurements"].extend(measurements)
            write_json(receipt_path, receipt)
        receipt["source_after"] = source_snapshot(repo)
        if receipt["source_before"]["native_snapshot_sha256"] != receipt["source_after"]["native_snapshot_sha256"]:
            raise ValueError("native source files changed during measurements; rerun against a stable source snapshot")
        if digest(binary) != binary_hash:
            raise ValueError("benchmark binary changed during measurements")
        receipt["state"] = "MEASURED_REVIEW_REQUIRED"
        receipt["measured_dispatch_count"] = len(receipt["measurements"])
        receipt["active_weight_files_changed"] = False
    except Exception as error:
        receipt["state"] = "FAILED"
        receipt["error"] = public_text(f"{type(error).__name__}: {error}")
        print(receipt["error"], file=sys.stderr, flush=True)
    finally:
        receipt["finished_at"] = utcnow()
        receipt["hardware_after"] = host_info()
        receipt["artifacts"] = {str(path.relative_to(out)): {"sha256": digest(path), "bytes": path.stat().st_size}
                                for path in sorted(out.rglob("*")) if path.is_file() and path != receipt_path and path.suffix != ".tmp"}
        write_json(receipt_path, receipt)
        print(f"Receipt: {receipt_path}\nState: {receipt['state']}", flush=True)
    return 0 if receipt["state"] == "MEASURED_REVIEW_REQUIRED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
