#!/usr/bin/env python3
"""Inspect a trusted locally built Linux node without publishing host paths.

CrownThrive-authored; governed by the repository LICENSE. ldd may execute loader
code: use only the node just built from the reviewed source, never an unknown file.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import shlex
import subprocess

SONAME = re.compile(r"[A-Za-z0-9_.+-]{1,180}\Z")
PACKAGE = re.compile(r"[a-z0-9][a-z0-9+.-]*(?::[a-z0-9][a-z0-9-]*)?\Z")


def run(arguments):
    environment = {key: value for key, value in os.environ.items()
                   if key not in {"LD_PRELOAD", "LD_LIBRARY_PATH", "LD_AUDIT", "LD_DEBUG"}}
    environment["LC_ALL"] = "C"
    return subprocess.run(arguments, check=False, capture_output=True, text=True,
                          timeout=30, env=environment)


def owner(path):
    candidates = [path, str(Path(path).resolve())]
    for value in tuple(candidates):
        if value.startswith("/usr/lib/"):
            candidates.append(value.removeprefix("/usr"))
        elif value.startswith("/lib/"):
            candidates.append("/usr" + value)
    for candidate in dict.fromkeys(candidates):
        result = run(["dpkg-query", "-S", candidate])
        if result.returncode:
            continue
        for line in result.stdout.splitlines():
            name = line.partition(": ")[0]
            if not PACKAGE.fullmatch(name):
                continue
            installed = run(["dpkg-query", "-W", "-f=${binary:Package}\t${Version}\n", name])
            fields = installed.stdout.strip().split("\t")
            if installed.returncode == 0 and len(fields) == 2 and PACKAGE.fullmatch(fields[0]):
                return {"name": fields[0], "version": fields[1]}
    raise RuntimeError("A resolved runtime library has no verified installed package owner")


def inspect(node, output):
    with node.open("rb") as binary:
        header = binary.read(20)
        if (len(header) < 20 or header[:6] != b"\x7fELF\x02\x01" or
                int.from_bytes(header[18:20], "little") != 62):
            raise RuntimeError("Release node must be a little-endian x86_64 ELF executable")
        binary.seek(0)
        binary_hash = hashlib.file_digest(binary, "sha256").hexdigest()
    dynamic = run(["readelf", "--dynamic", "--wide", str(node)])
    needed = sorted(set(re.findall(r"\(NEEDED\).*?Shared library: \[([^\]]+)\]", dynamic.stdout)))
    if dynamic.returncode or not needed or not all(SONAME.fullmatch(name) for name in needed):
        raise RuntimeError("ELF DT_NEEDED dependencies are absent or malformed")
    program = run(["readelf", "--program-headers", "--wide", str(node)])
    interpreter_match = re.search(r"Requesting program interpreter: ([^\]]+)\]", program.stdout)
    if program.returncode or not interpreter_match:
        raise RuntimeError("ELF dynamic loader interpreter is missing")
    interpreter = Path(interpreter_match[1]).name
    if not SONAME.fullmatch(interpreter):
        raise RuntimeError("ELF loader name is malformed")
    relocation = run(["ldd", "-r", str(node)])
    diagnostics = relocation.stdout + "\n" + relocation.stderr
    if (relocation.returncode or "not found" in diagnostics.lower() or
            "undefined symbol" in diagnostics.lower()):
        raise RuntimeError("Native loader found a missing library or undefined symbol")
    resolved = {}
    virtual = set()
    for line in relocation.stdout.splitlines():
        tokens = line.split()
        if not tokens:
            continue
        if "=>" in tokens:
            if len(tokens) < 3 or not SONAME.fullmatch(tokens[0]) or not tokens[2].startswith("/"):
                raise RuntimeError("Unexpected loader dependency record")
            resolved[tokens[0]] = tokens[2]
        elif tokens[0].startswith("/"):
            name = Path(tokens[0]).name
            if not SONAME.fullmatch(name):
                raise RuntimeError("Unexpected loader interpreter record")
            resolved[name] = tokens[0]
        elif tokens[0].startswith("linux-vdso.") and SONAME.fullmatch(tokens[0]):
            virtual.add(tokens[0])
        else:
            raise RuntimeError("Unexpected native loader diagnostic")
    if not set(needed).issubset(resolved) or interpreter not in resolved:
        raise RuntimeError("Native loader did not resolve every direct dependency and interpreter")
    dependencies = [{"soname": name,
                     "kind": "interpreter" if name == interpreter else "direct" if name in needed else "transitive",
                     "package": owner(path)} for name, path in sorted(resolved.items())]
    versions = run(["readelf", "--version-info", "--wide", str(node)])
    if versions.returncode:
        raise RuntimeError("ELF version requirements could not be inspected")
    required_versions = sorted(set(re.findall(r"Name: ([A-Za-z0-9_.+-]+)", versions.stdout)))
    system = {}
    for line in Path("/etc/os-release").read_text().splitlines():
        key, separator, value = line.partition("=")
        if separator and key in {"ID", "VERSION_ID"}:
            parsed = shlex.split(value)
            system[key.lower()] = parsed[0] if parsed else ""
    packages = {item["package"]["name"]: item["package"] for item in dependencies}
    with node.open("rb") as binary:
        if hashlib.file_digest(binary, "sha256").hexdigest() != binary_hash:
            raise RuntimeError("Node binary changed during loader verification")
    receipt = {
        "schema": "chlom.native.loader-readback.v1", "accepted": True,
        "nodeSha256": binary_hash, "target": "x86_64-unknown-linux-gnu",
        "system": system, "machine": platform.machine(), "interpreter": interpreter,
        "directDependencies": needed, "resolvedDependencies": dependencies,
        "virtualDependencies": sorted(virtual), "requiredSymbolVersions": required_versions,
        "runtimePackages": [packages[name] for name in sorted(packages)],
        "relocationCheck": "ldd -r passed", "unresolvedDependencies": [], "undefinedSymbols": [],
        "scope": "Observed package owners and versions on this build host; compatible runtime versions must satisfy the recorded symbol requirements.",
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps(receipt))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--node", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    inspect(args.node.resolve(strict=True), args.output)
