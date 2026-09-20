"""Cargo-normalized source custody, with separate directories per source identity.

CrownThrive-authored; repository LICENSE applies. Cargo's source replacement
preserves the original dependency identities; it is not a dependency patch.
"""
import collections
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import tomllib


def digest(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def execute(args, workspace, env=None):
    return subprocess.check_output(args, cwd=workspace, env=env, text=True).strip()


def metadata(workspace, frozen=False, isolated=False):
    arguments = ["cargo", "metadata", "--format-version", "1", "--all-features",
                 "--frozen" if frozen else "--locked"]
    if not isolated:
        return json.loads(execute(arguments, workspace))
    # rustup's shim otherwise searches the deliberately empty CARGO_HOME/bin.
    sysroot = execute(["rustc", "--print", "sysroot"], workspace)
    with tempfile.TemporaryDirectory(prefix="chlom-empty-cargo-home-") as empty:
        environment = dict(os.environ, CARGO_HOME=empty, RUSTC=str(Path(sysroot) / "bin/rustc"))
        return json.loads(execute(arguments, workspace, environment))


def graph(value, workspace):
    """Normalize only relocatable paths; retain dependency kinds/targets/features."""
    workspace = Path(workspace).resolve()
    ids = {}
    packages = []
    for package in value["packages"]:
        manifest = Path(package["manifest_path"])
        origin = package.get("source") or "workspace:" + str(manifest.relative_to(workspace))
        ids[package["id"]] = f"{package['name']}@{package['version']}|{origin}"
    for package in value["packages"]:
        item = {key: package.get(key) for key in ("name", "version", "source", "features", "edition", "links")}
        item["id"] = ids[package["id"]]
        item["dependencies"] = json.loads(json.dumps(package["dependencies"]))
        for dependency in item["dependencies"]:
            if dependency.get("path"):
                dependency["path"] = str(Path(dependency["path"]).relative_to(workspace))
        item["targets"] = json.loads(json.dumps(package["targets"]))
        for target in item["targets"]:
            target["src_path"] = os.path.relpath(target["src_path"], Path(package["manifest_path"]).parent)
        packages.append(item)
    nodes = []
    for node in value["resolve"]["nodes"]:
        item = json.loads(json.dumps(node))
        item["id"] = ids[node["id"]]
        item["dependencies"] = sorted(ids[identifier] for identifier in node["dependencies"])
        for dependency in item["deps"]:
            dependency["pkg"] = ids[dependency["pkg"]]
        item["deps"].sort(key=lambda dependency: (dependency["name"], dependency["pkg"]))
        nodes.append(item)
    return {"packages": sorted(packages, key=lambda item: item["id"]),
            "resolve": {"root": ids.get(value["resolve"].get("root")), "nodes": sorted(nodes, key=lambda item: item["id"])},
            "workspace_members": sorted(ids[item] for item in value["workspace_members"]),
            "workspace_default_members": sorted(ids[item] for item in value["workspace_default_members"])}


def graph_digest(value, workspace):
    return hashlib.sha256(json.dumps(graph(value, workspace), sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def lock_key(package):
    return (package["name"], package["version"], package.get("source"), package.get("checksum"))


def verify_files(directory, expected_package):
    checksum = json.loads((directory / ".cargo-checksum.json").read_text())
    if checksum.get("package") != expected_package:
        raise RuntimeError(f"Vendor package checksum differs from Cargo.lock: {directory.name}")
    actual = {str(path.relative_to(directory)) for path in directory.rglob("*")
              if path.is_file() and path != directory / ".cargo-checksum.json"}
    if actual != set(checksum["files"]):
        raise RuntimeError(f"Vendor file inventory mismatch: {directory.name}")
    for name, expected in checksum["files"].items():
        path = directory / name
        if Path(name).is_absolute() or ".." in Path(name).parts or not path.resolve().is_relative_to(directory.resolve()):
            raise RuntimeError("Vendor file escapes its package")
        if digest(path) != expected:
            raise RuntimeError(f"Vendor source checksum mismatch: {directory.name}/{name}")


def verify_source_vendor(workspace, receipt):
    workspace = Path(workspace).resolve()
    if digest(workspace / "Cargo.lock") != receipt["cargoLockSha256"]:
        raise RuntimeError("Source bundle Cargo.lock changed")
    if digest(workspace / "Cargo.toml") != receipt["cargoManifestSha256"]:
        raise RuntimeError("Source bundle Cargo.toml changed")
    for package in receipt["packages"]:
        verify_files(workspace / package["directory"], package["checksum"])
    offline = metadata(workspace, frozen=True, isolated=True)
    delivered = {(package["name"], package["version"], package["source"]): package for package in receipt["packages"]}
    for package in offline["packages"]:
        manifest = Path(package["manifest_path"]).resolve()
        if not manifest.is_relative_to(workspace):
            raise RuntimeError("Frozen metadata used source outside the delivered archive")
        if package.get("source"):
            record = delivered[(package["name"], package["version"], package["source"])]
            if manifest != (workspace / record["directory"] / "Cargo.toml").resolve():
                raise RuntimeError("Frozen metadata did not resolve the delivered vendor package")
    actual = graph_digest(offline, workspace)
    if actual != receipt["originalGraphSha256"]:
        raise RuntimeError("Empty-cache frozen source graph differs from original dependency graph")
    return {"emptyCargoHome": True, "frozenAllFeaturesMetadata": True, "deliveredVendorPathsVerified": True, "graphSha256": actual,
            "metadataPackages": len(offline["packages"]), "verifiedVendorPackages": len(receipt["packages"])}


def build_source_vendor(workspace):
    workspace = Path(workspace).resolve()
    manifest_path, lock_path = workspace / "Cargo.toml", workspace / "Cargo.lock"
    manifest_bytes, lock_bytes = manifest_path.read_bytes(), lock_path.read_bytes()
    manifest = tomllib.loads(manifest_bytes.decode())
    lock = tomllib.loads(lock_bytes.decode())["package"]
    remote = [package for package in lock if package.get("source")]
    original = metadata(workspace)
    original_graph = graph_digest(original, workspace)
    source_manifest = {(package["name"], package["version"], package.get("source")): package for package in original["packages"]}
    groups = collections.defaultdict(list)
    for package in remote:
        groups[(package["name"], package["version"])].append(package)
    collisions = [packages for packages in groups.values() if len(packages) > 1]
    patches = []
    for packages in collisions:
        registry = [package for package in packages if package["source"] == "registry+https://github.com/rust-lang/crates.io-index"]
        if len(packages) != 2 or len(registry) != 1 or not any(package["source"].startswith("git+") for package in packages):
            raise RuntimeError("Unsupported vendor collision; source identities must not be guessed")
        patches.extend(registry)
    if patches and manifest.get("patch", {}).get("crates-io"):
        raise RuntimeError("Existing registry patches need explicit source-custody review")
    # Confirm Cargo's git checkout contains the exact unmodified locked source.
    inspected = set()
    for package in original["packages"]:
        if not (package.get("source") or "").startswith("git+"):
            continue
        root = Path(package["manifest_path"]).parent
        while not (root / ".git").exists() and root != root.parent:
            root = root.parent
        if root in inspected:
            continue
        inspected.add(root)
        if execute(["git", "rev-parse", "HEAD"], root) != package["source"].rsplit("#", 1)[1]:
            raise RuntimeError("Git dependency checkout does not match the locked commit")
        subprocess.run(["git", "diff", "--quiet", "HEAD", "--"], cwd=root, check=True)
        extras = set(execute(["git", "ls-files", "--others", "--exclude-standard"], root).splitlines()) - {".cargo-ok"}
        if extras:
            raise RuntimeError("Untracked source files found in locked git dependency")
    config_path = workspace / ".cargo/config.toml"
    existing_config = config_path.read_text() if config_path.exists() else ""
    if tomllib.loads(existing_config).get("source"):
        raise RuntimeError("Existing source replacement requires explicit custody review")
    vendor_root = workspace / "vendor"
    if vendor_root.exists():
        raise RuntimeError("Source vendor output must not already exist")
    with tempfile.TemporaryDirectory(prefix="chlom-source-normalization-") as temporary:
        temporary = Path(temporary)
        extracted = {}
        patch_lines = ["\n[patch.crates-io]"] if patches else []
        for package in patches:
            key = (package["name"], package["version"], package["source"])
            original_package = source_manifest[key]
            package_root = Path(original_package["manifest_path"]).parent
            crate = package_root.parents[2] / "cache" / package_root.parent.name / f"{package['name']}-{package['version']}.crate"
            if digest(crate) != package["checksum"]:
                raise RuntimeError("Registry crate archive does not match Cargo.lock checksum")
            with tarfile.open(crate) as source_tar:
                source_tar.extractall(temporary / "registry", filter="data")
            extracted[key] = temporary / "registry" / f"{package['name']}-{package['version']}"
            patch_lines.append(f"{json.dumps(package['name'])} = {{ path = {json.dumps(str(extracted[key]))} }}")
        try:
            if patches:
                manifest_path.write_bytes(manifest_bytes + ("\n".join(patch_lines) + "\n").encode())
                patched = json.loads(execute(["cargo", "metadata", "--offline", "--all-features", "--format-version", "1"], workspace))
                expected_lock = {lock_key(package) for package in lock} - {lock_key(package) for package in patches}
                expected_lock |= {(package["name"], package["version"], None, None) for package in patches}
                patched_lock = {lock_key(package) for package in tomllib.loads(lock_path.read_text())["package"]}
                if patched_lock != expected_lock:
                    raise RuntimeError("Temporary normalization changed additional dependency identities")
                for package in patches:
                    original_package = source_manifest[(package["name"], package["version"], package["source"])]
                    patched_package = next(item for item in patched["packages"] if item["name"] == package["name"] and item["version"] == package["version"] and item.get("source") is None)
                    for field in ("dependencies", "features", "edition", "links"):
                        if patched_package[field] != original_package[field]:
                            raise RuntimeError("Temporary registry path normalization changed package semantics")
            mixed = temporary / "cargo-vendor"
            generated_config = execute(["cargo", "vendor", "--locked", "--offline", "--versioned-dirs", str(mixed)], workspace)
        finally:
            manifest_path.write_bytes(manifest_bytes)
            lock_path.write_bytes(lock_bytes)
        vendor_config = tomllib.loads(generated_config)["source"]
        source_groups = {source: "source-" + hashlib.sha256(source.encode()).hexdigest()[:16] for source in sorted({package["source"] for package in remote})}
        records = []
        for package in remote:
            source, name = package["source"], f"{package['name']}-{package['version']}"
            destination = vendor_root / source_groups[source] / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            key = (package["name"], package["version"], source)
            if key in extracted:
                shutil.copytree(extracted[key], destination)
                checksums = {str(path.relative_to(destination)): digest(path) for path in destination.rglob("*") if path.is_file()}
                (destination / ".cargo-checksum.json").write_text(json.dumps({"package": package["checksum"], "files": checksums}, sort_keys=True) + "\n")
            else:
                shutil.move(str(mixed / name), destination)
            records.append({"name": package["name"], "version": package["version"], "source": source,
                            "checksum": package.get("checksum"), "directory": str(destination.relative_to(workspace))})
        if list(mixed.iterdir()):
            raise RuntimeError("Cargo vendored packages outside the original locked source closure")
        lines = [existing_config]
        for source, directory in source_groups.items():
            alias = "crates-io" if source == "registry+https://github.com/rust-lang/crates.io-index" else source.split("#", 1)[0]
            properties = vendor_config[alias]
            lines.append(f"[source.{json.dumps(alias)}]")
            for key, value in properties.items():
                if key != "replace-with":
                    lines.append(f"{key} = {json.dumps(value)}")
            lines.append(f"replace-with = {json.dumps(directory)}\n")
            lines.append(f"[source.{json.dumps(directory)}]\ndirectory = {json.dumps('vendor/' + directory)}\n")
        config_path.parent.mkdir(exist_ok=True)
        config_path.write_text("\n".join(lines))
    receipt = {"schema": "chlom.native.source-vendor.v1", "method": "Cargo-normalized source-scoped directory replacement",
               "cargoLockSha256": digest(lock_path), "cargoManifestSha256": digest(manifest_path),
               "originalGraphSha256": original_graph, "metadataFeatures": "all",
               "temporaryNormalizationOnly": [{"name": p["name"], "version": p["version"], "source": p["source"], "checksum": p["checksum"]} for p in patches],
               "originalManifestsRestored": True, "dependencyIdentitiesChanged": False,
               "packages": sorted(records, key=lambda item: (item["source"], item["name"], item["version"]))}
    receipt["verification"] = verify_source_vendor(workspace, receipt)
    (workspace / "VENDOR_SOURCE_RECEIPT.json").write_text(json.dumps(receipt, indent=2) + "\n")
    return receipt
