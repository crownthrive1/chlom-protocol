#!/usr/bin/env python3
"""Read actual benchmark availability from the packaged developer node.

CrownThrive-authored; governed by the repository LICENSE. Listing benchmark
cases is capability evidence, not a measurement or production weight certificate.
"""
import argparse
import csv
import hashlib
import io
import json
import subprocess
from pathlib import Path

EXPECTED = {
    "pallet_chlom_authority", "pallet_chlom_identity", "pallet_chlom_rights",
    "pallet_chlom_licensing", "pallet_chlom_settlement", "pallet_chlom_tokenization",
    "pallet_chlom_oracle", "pallet_chlom_checkpoint", "pallet_chlom_utility",
    "pallet_chlom_policy",
}


def inspect(node, output):
    result = subprocess.run(
        [str(node), "benchmark", "pallet", "--chain", "dev", "--list"],
        check=True, capture_output=True, text=True, timeout=180,
    )
    rows = list(csv.reader(io.StringIO(result.stdout), skipinitialspace=True))
    if not rows or [value.strip() for value in rows[0]] != ["pallet", "extrinsic"]:
        raise RuntimeError("Node did not return the SDK benchmark list CSV header")
    cases = []
    for row in rows[1:]:
        if not row:
            continue
        if len(row) != 2 or not all(value.strip() for value in row):
            raise RuntimeError("Malformed benchmark capability row")
        cases.append({"pallet": row[0].strip(), "extrinsic": row[1].strip()})
    modules = {case["pallet"] for case in cases}
    missing = sorted(EXPECTED - modules)
    if missing:
        raise RuntimeError(f"Node lacks CHLOM benchmark modules: {missing}")
    with node.open("rb") as binary:
        binary_hash = hashlib.file_digest(binary, "sha256").hexdigest()
    receipt = {
        "schema": "chlom.native.benchmark-readback.v1", "accepted": True,
        "nodeSha256": binary_hash,
        "command": ["chlom-node", "benchmark", "pallet", "--chain", "dev", "--list"],
        "nativePallets": sorted(EXPECTED), "availableCases": cases,
        "caseCount": len(cases), "stdout": result.stdout,
        "stdoutSha256": hashlib.sha256(result.stdout.encode()).hexdigest(),
        "measuredCalibration": False,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps({"accepted": True, "nativePalletCount": len(EXPECTED), "availableCaseCount": len(cases)}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--node", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    inspect(args.node.resolve(strict=True), args.output)
