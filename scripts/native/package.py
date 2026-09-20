#!/usr/bin/env python3
"""Package verified native artifacts, dependency notices and exact source custody.

CrownThrive-authored; governed by the repository LICENSE. Dependencies retain
their own licenses. This script does not relicense any linked component.
"""
import argparse
import gzip
import hashlib
import json
import os
import re
import shutil
import subprocess
import tarfile
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORKSPACE = ROOT / "substrate/chlom-l1"


def command(*args, cwd=ROOT):
    return subprocess.check_output(args, cwd=cwd, text=True).strip()


def digest(path):
    hasher = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            hasher.update(block)
    return hasher.hexdigest()


def archive(source, destination, epoch):
    """Normalize archive metadata; no assertion of reproducible compiler output."""
    with destination.open("wb") as raw:
        with gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=epoch) as zipped:
            with tarfile.open(fileobj=zipped, mode="w") as bundle:
                for path in sorted(source.rglob("*")):
                    if not path.is_file() and not path.is_symlink():
                        continue
                    relative = path.relative_to(source)
                    if path.is_symlink() and (os.path.isabs(os.readlink(path)) or not path.resolve().is_relative_to(source.resolve())):
                        raise RuntimeError(f"Archive symlink escapes source: {relative}")
                    info = bundle.gettarinfo(str(path), str(relative))
                    info.uid = info.gid = 0
                    info.uname = info.gname = ""
                    info.mtime = epoch
                    if path.is_symlink():
                        bundle.addfile(info)
                    else:
                        with path.open("rb") as file:
                            bundle.addfile(info, file)


def licenses(destination):
    metadata = json.loads(command("cargo", "metadata", "--locked", "--format-version", "1", cwd=WORKSPACE))
    destination.mkdir(parents=True)
    catalog = Path(__file__).resolve().parent / "licenses"
    catalog_manifest = json.loads((catalog / "manifest.json").read_text())
    standard = {}
    (destination / "spdx").mkdir()
    for item in catalog_manifest["files"]:
        source = catalog / f"{item['id']}.txt"
        if digest(source) != item["sha256"]:
            raise RuntimeError(f"Pinned SPDX text checksum mismatch: {item['id']}")
        target = destination / "spdx" / source.name
        shutil.copyfile(source, target)
        standard[item["id"]] = {"file": str(target.relative_to(destination)),
                                "sha256": item["sha256"], "source": item["url"]}
    shutil.copyfile(catalog / "manifest.json", destination / "spdx/manifest.json")
    records = []
    for package in sorted(metadata["packages"], key=lambda item: item["id"]):
        package_id = package["id"]
        key = hashlib.sha256(package_id.encode()).hexdigest()[:12]
        root = Path(package["manifest_path"]).parent
        found = set()
        # Native sys crates include separately licensed bundled subcomponents.
        for directory, directories, files in os.walk(root):
            directories[:] = [name for name in directories if name != ".git"]
            for filename in files:
                if filename.upper().startswith(("LICENSE", "LICENCE", "COPYING", "NOTICE")):
                    found.add(Path(directory) / filename)
        if package.get("license_file"):
            candidate = (root / package["license_file"]).resolve()
            if candidate.is_file():
                found.add(candidate)
        # Workspace and SDK packages commonly inherit license files from a parent.
        current = root
        for _ in range(12):
            for candidate in current.iterdir():
                if candidate.is_file() and candidate.name.upper().startswith(("LICENSE", "LICENCE", "COPYING", "NOTICE")):
                    found.add(candidate)
            if (current / ".git").exists() or current == ROOT or current.name == ".cargo" or current == current.parent:
                break
            # Registry source packages may not inherit unrelated parent licenses.
            if current == root and "/registry/src/" in str(root):
                break
            current = current.parent
        copied = []
        folder = destination / f"{package['name']}-{package['version']}-{key}"
        folder.mkdir()
        for index, candidate in enumerate(sorted(found)):
            if candidate.stat().st_size > 4 * 1024 * 1024:
                raise RuntimeError(f"License file unexpectedly large for {package['name']}")
            if candidate.is_relative_to(root):
                target = folder / "package" / candidate.relative_to(root)
            else:
                target = folder / "inherited" / f"{index:02d}-{candidate.name}"
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(candidate, target)
            copied.append({"file": str(target.relative_to(destination)), "sha256": digest(target)})
        identifiers = sorted(set(re.findall(r"[A-Za-z0-9][A-Za-z0-9.+-]*", package.get("license") or "")) - {"AND", "OR", "WITH"})
        standard_texts = []
        for identifier in identifiers:
            if identifier not in standard:
                raise RuntimeError(f"Uncatalogued dependency license identifier: {identifier}")
            standard_texts.append({"id": identifier, **standard[identifier]})
        if package.get("source") and not copied and not standard_texts:
            raise RuntimeError(f"Missing dependency license declaration/text: {package['name']} {package['version']}")
        records.append({"name": package["name"], "version": package["version"],
                        "source": package.get("source"), "license": package.get("license"),
                        "authors": package.get("authors", []),
                        "repository": package.get("repository"), "licenseFiles": copied,
                        "standardLicenseTexts": standard_texts,
                        "packageLicenseFilePresent": bool(copied)})
    manifest = {"schema": "chlom.native.dependency-licenses.v1", "packages": records,
                "scope": "Cargo.lock workspace dependency closure, including target-specific dependencies",
                "notice": "Each dependency retains its own license. Original license/notice files are copied when supplied. Standard SPDX texts include all declared alternatives/exceptions and explicitly supplement crates published without license files. Package authors and exact source are retained; source-file notices remain in corresponding source. This inventory does not relicense the binary."}
    (destination / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


def corresponding_source(destination, sha, epoch, temporary):
    source = temporary / "corresponding-source"
    source.mkdir()
    archive_path = temporary / "repo.tar"
    with archive_path.open("wb") as handle:
        subprocess.run(["git", "archive", "--format=tar", sha], cwd=ROOT, stdout=handle, check=True)
    with tarfile.open(archive_path) as source_tar:
        source_tar.extractall(source, filter="data")
    native_source = source / "substrate/chlom-l1"
    # Cargo vendors registry and pinned git source at the exact locked revisions.
    config = command("cargo", "vendor", "--locked", "--versioned-dirs", "vendor", cwd=native_source)
    cargo_config = native_source / ".cargo/config.toml"
    cargo_config.parent.mkdir(exist_ok=True)
    if cargo_config.exists():
        existing = cargo_config.read_text()
        if "[source." in existing:
            raise RuntimeError("Existing Cargo source configuration requires an explicit merge")
        cargo_config.write_text(existing + "\n" + config + "\n")
    else:
        cargo_config.write_text(config + "\n")
    (source / "NATIVE_SOURCE_RECEIPT.json").write_text(json.dumps({
        "schema": "chlom.native.corresponding-source.v1", "sourceCommit": sha,
        "cargoLockSha256": digest(native_source / "Cargo.lock"),
        "build": "cd substrate/chlom-l1 && cargo build --frozen --release -p chlom-node --features runtime-benchmarks",
        "scope": "Exact repository archive plus vendored Cargo dependency source; toolchain and OS build tools remain external.",
    }, indent=2) + "\n")
    archive(source, destination, epoch)


def main(args):
    sha = command("git", "rev-parse", "HEAD")
    subprocess.run(["git", "diff", "--exit-code", "HEAD", "--"], cwd=ROOT, check=True)
    if args.commit and args.commit != sha:
        raise RuntimeError("Build source does not match requested exact commit")
    epoch = int(command("git", "show", "-s", "--format=%ct", sha))
    node = args.node.resolve(strict=True)
    wasm = args.wasm.resolve(strict=True)
    receipt = json.loads(args.smoke.read_text())
    if receipt.get("accepted") is not True or receipt.get("runtime", {}).get("specName") != "chlom-runtime":
        raise RuntimeError("Successful native smoke receipt required")
    if receipt.get("nodeSha256") != digest(node):
        raise RuntimeError("Smoke receipt does not describe this exact node binary")
    if receipt.get("runtimeCodeSha256") != digest(wasm):
        raise RuntimeError("Exported Wasm differs from the running node's :code")
    signed_receipt = json.loads(args.e2e.read_text())
    if (signed_receipt.get("status") != "PASS" or
            signed_receipt.get("isolatedNodeLaunched") is not True or
            signed_receipt.get("binarySha256") != digest(node) or
            int(signed_receipt.get("signedTransactionCount", 0)) < 1):
        raise RuntimeError("Successful signed RPC acceptance for this exact binary is required")
    if signed_receipt.get("runtimeCodeBlake2b256") != "0x" + hashlib.blake2b(wasm.read_bytes(), digest_size=32).hexdigest():
        raise RuntimeError("Signed acceptance runtime :code differs from exported Wasm")
    benchmarks = json.loads(args.benchmarks.read_text())
    if (benchmarks.get("schema") != "chlom.native.benchmark-readback.v1" or
            benchmarks.get("accepted") is not True or
            benchmarks.get("nodeSha256") != digest(node) or
            len(benchmarks.get("nativePallets", [])) != 10 or
            int(benchmarks.get("caseCount", 0)) < 10):
        raise RuntimeError("Actual benchmark list readback for this exact binary is required")
    benchmark_stdout = benchmarks.get("stdout", "")
    if hashlib.sha256(benchmark_stdout.encode()).hexdigest() != benchmarks.get("stdoutSha256"):
        raise RuntimeError("Benchmark output receipt checksum mismatch")
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    if list(output.iterdir()):
        raise RuntimeError("Output directory must be empty; never mix release assets")
    with tempfile.TemporaryDirectory(prefix="chlom-native-package-") as directory:
        temporary = Path(directory)
        package = temporary / "binary"
        package.mkdir()
        shutil.copy2(node, package / "chlom-node")
        shutil.copy2(ROOT / "LICENSE", package / "CROWNTHRIVE-LICENSE.txt")
        for filename in ("CHLOM_NATIVE_INSTALLATION.md", "CHLOM_NATIVE_RELEASE_1_4.md"):
            shutil.copy2(ROOT / "docs" / filename, package / filename)
        for directory, directories, files in os.walk(WORKSPACE):
            directories[:] = [name for name in directories if name not in {"target", ".git", "vendor"}]
            for filename in files:
                if not filename.upper().startswith(("NOTICE", "UPSTREAM-LICENSE")):
                    continue
                notice = Path(directory) / filename
                target = package / "source-notices" / notice.relative_to(WORKSPACE)
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(notice, target)
        for component in ("node", "runtime"):
            shutil.copy2(WORKSPACE / component / "README.md", package / f"{component}-contract.md")
        licenses(package / "dependency-licenses")
        shutil.copy2(package / "dependency-licenses/manifest.json", output / "dependency-licenses.json")
        shutil.copy2(wasm, output / "chlom-runtime.wasm")
        shutil.copy2(args.smoke, output / "native-smoke.json")
        shutil.copy2(args.e2e, output / "native-signed-rpc.json")
        shutil.copy2(args.benchmarks, output / "native-benchmarks.json")
        (output / "native-benchmarks.csv").write_text(benchmark_stdout)
        for chain in ("dev", "local"):
            for raw in (False, True):
                filename = f"chlom-{chain}{'-raw' if raw else ''}.json"
                flags = [str(node), "build-spec", "--chain", chain, "--disable-default-bootnode"]
                if raw:
                    flags.append("--raw")
                data = json.loads(command(*flags))
                if data.get("bootNodes"):
                    raise RuntimeError("Development chain spec unexpectedly includes bootnodes")
                if raw:
                    code_hex = data.get("genesis", {}).get("raw", {}).get("top", {}).get("0x3a636f6465")
                    if not isinstance(code_hex, str) or not code_hex.startswith("0x"):
                        raise RuntimeError(f"Raw {chain} specification is missing :code")
                    if bytes.fromhex(code_hex[2:]) != wasm.read_bytes():
                        raise RuntimeError(f"Raw {chain} specification :code differs from exported Wasm")
                (output / filename).write_text(json.dumps(data, indent=2) + "\n")
                shutil.copy2(output / filename, package / filename)
        (package / "BINARY-LICENSE-NOTICE.txt").write_text(
            "CHLOM native distribution contains CrownThrive-authored and third-party components.\n"
            "CROWNTHRIVE-LICENSE.txt identifies repository terms for CrownThrive material.\n"
            "It does not replace separately licensed files or dependency licenses.\n"
            "See dependency-licenses/manifest.json, included full license texts, source-notices/,\n"
            "and the corresponding-source release archive for exact source and notices.\n"
            "This artifact is a development/local-testnet release, not a production-network activation.\n")
        manifest = {"schema": "chlom.native.release.v1", "version": args.version,
                    "sourceCommit": sha, "target": "x86_64-unknown-linux-gnu",
                    "nodeSha256": digest(node), "runtimeWasmSha256": digest(wasm),
                    "cargoLockSha256": digest(WORKSPACE / "Cargo.lock"),
                    "rust": command("rustc", "--version", cwd=WORKSPACE),
                    "nodeVersion": command(str(node), "--version"),
                    "nativePalletCount": 10, "chains": ["dev", "local"],
                    "signedTransactionCount": signed_receipt["signedTransactionCount"],
                    "features": ["runtime-benchmarks"],
                    "availableBenchmarkCount": benchmarks["caseCount"],
                    "productionNetworkActivated": False, "developmentKeysPublic": True}
        (output / "native-release.json").write_text(json.dumps(manifest, indent=2) + "\n")
        shutil.copy2(output / "native-release.json", package / "native-release.json")
        archive(package, output / "chlom-node-linux-x86_64.tar.gz", epoch)
        if args.with_source:
            corresponding_source(output / "chlom-native-corresponding-source.tar.gz", sha, epoch, temporary)
    checksums = "".join(f"{digest(path)}  {path.name}\n" for path in sorted(output.iterdir()) if path.is_file())
    (output / "SHA256SUMS").write_text(checksums)
    print(json.dumps({"sourceCommit": sha, "assets": sorted(path.name for path in output.iterdir())}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--node", required=True, type=Path)
    parser.add_argument("--wasm", required=True, type=Path)
    parser.add_argument("--smoke", required=True, type=Path)
    parser.add_argument("--e2e", required=True, type=Path)
    parser.add_argument("--benchmarks", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--version", default="1.4.0")
    parser.add_argument("--commit")
    parser.add_argument("--with-source", action="store_true")
    main(parser.parse_args())
