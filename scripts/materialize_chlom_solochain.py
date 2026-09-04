#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
from pathlib import Path

SDK_COMMIT = "d173a5f32494b0b281a92b370f67fe803fc0ce47"
PALLETS = (
    "authority",
    "identity",
    "rights",
    "licensing",
    "settlement",
    "tokenization",
    "oracle",
    "checkpoint",
)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one occurrence, found {count}")
    return text.replace(old, new, 1)


def write_text(path: Path, text: str) -> None:
    path.write_text(text, encoding="utf-8")


def run(*args: str, cwd: Path | None = None) -> str:
    completed = subprocess.run(args, cwd=cwd, text=True, capture_output=True, check=True)
    return completed.stdout.strip()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sdk-dir", type=Path, required=True)
    parser.add_argument("--repo-dir", type=Path, default=Path.cwd())
    parser.add_argument("--manifest", type=Path, required=True)
    args = parser.parse_args()

    sdk = args.sdk_dir.resolve()
    repo = args.repo_dir.resolve()
    template = sdk / "templates" / "solochain"
    source = repo / "substrate" / "chlom-l1"
    if not template.is_dir():
        raise RuntimeError(f"official solochain template missing: {template}")
    if not source.is_dir():
        raise RuntimeError(f"CHLOM pallet source missing: {source}")

    actual_sdk_commit = run("git", "rev-parse", "HEAD", cwd=sdk)
    if actual_sdk_commit != SDK_COMMIT:
        raise RuntimeError(f"SDK commit drift: {actual_sdk_commit} != {SDK_COMMIT}")

    primitive_target = template / "chlom-primitives"
    if primitive_target.exists():
        shutil.rmtree(primitive_target)
    shutil.copytree(source / "primitives", primitive_target)

    copied: list[Path] = []
    for name in PALLETS:
        target = template / "pallets" / f"chlom-{name}"
        if target.exists():
            shutil.rmtree(target)
        shutil.copytree(source / "pallets" / name, target)
        cargo = target / "Cargo.toml"
        cargo_text = cargo.read_text(encoding="utf-8")
        cargo_text = cargo_text.replace(
            "chlom-primitives.workspace = true",
            'chlom-primitives = { path = "../../chlom-primitives", default-features = false }',
        )
        write_text(cargo, cargo_text)
        copied.extend(path for path in target.rglob("*") if path.is_file())
    copied.extend(path for path in primitive_target.rglob("*") if path.is_file())

    runtime_cargo = template / "runtime" / "Cargo.toml"
    text = runtime_cargo.read_text(encoding="utf-8")
    dependency_lines = "\n".join(
        f'pallet-chlom-{name} = {{ path = "../pallets/chlom-{name}", default-features = false }}'
        for name in PALLETS
    )
    text = replace_once(
        text,
        "pallet-template.workspace = true\n",
        f"pallet-template.workspace = true\n{dependency_lines}\n",
        "runtime dependencies",
    )
    std_lines = "\n".join(f'\t"pallet-chlom-{name}/std",' for name in PALLETS)
    text = replace_once(
        text,
        '\t"pallet-template/std",\n',
        f'\t"pallet-template/std",\n{std_lines}\n',
        "runtime std features",
    )
    text = text.replace(
        'description = "A solochain runtime template built with Substrate, part of Polkadot Sdk."',
        'description = "The CHLOM rights, licensing, settlement, tokenization and checkpoint runtime."',
    )
    write_text(runtime_cargo, text)

    runtime_lib = template / "runtime" / "src" / "lib.rs"
    text = runtime_lib.read_text(encoding="utf-8")
    text = text.replace('"solochain-template-runtime"', '"chlom-runtime"')
    pallet_block = """

\t#[runtime::pallet_index(8)]
\tpub type ChlomAuthority = pallet_chlom_authority;

\t#[runtime::pallet_index(9)]
\tpub type ChlomIdentity = pallet_chlom_identity;

\t#[runtime::pallet_index(10)]
\tpub type ChlomRights = pallet_chlom_rights;

\t#[runtime::pallet_index(11)]
\tpub type ChlomLicensing = pallet_chlom_licensing;

\t#[runtime::pallet_index(12)]
\tpub type ChlomSettlement = pallet_chlom_settlement;

\t#[runtime::pallet_index(13)]
\tpub type ChlomTokenization = pallet_chlom_tokenization;

\t#[runtime::pallet_index(14)]
\tpub type ChlomOracle = pallet_chlom_oracle;

\t#[runtime::pallet_index(15)]
\tpub type ChlomCheckpoint = pallet_chlom_checkpoint;
"""
    text = replace_once(
        text,
        "\t#[runtime::pallet_index(7)]\n\tpub type Template = pallet_template;\n}",
        "\t#[runtime::pallet_index(7)]\n\tpub type Template = pallet_template;" + pallet_block + "\n}",
        "runtime pallet composition",
    )
    write_text(runtime_lib, text)

    configs = template / "runtime" / "src" / "configs" / "mod.rs"
    text = configs.read_text(encoding="utf-8")
    chlom_configs = """

parameter_types! {
\tpub const ChlomMaxSettlementLegs: u32 = 32;
}

impl pallet_chlom_authority::Config for Runtime {
\ttype RuntimeEvent = RuntimeEvent;
\ttype AdminOrigin = frame_system::EnsureRoot<AccountId>;
}

impl pallet_chlom_identity::Config for Runtime {
\ttype RuntimeEvent = RuntimeEvent;
\ttype AdminOrigin = frame_system::EnsureRoot<AccountId>;
}

impl pallet_chlom_rights::Config for Runtime {
\ttype RuntimeEvent = RuntimeEvent;
\ttype RightsOrigin = frame_system::EnsureRoot<AccountId>;
}

impl pallet_chlom_licensing::Config for Runtime {
\ttype RuntimeEvent = RuntimeEvent;
\ttype LicensingOrigin = frame_system::EnsureRoot<AccountId>;
}

impl pallet_chlom_settlement::Config for Runtime {
\ttype RuntimeEvent = RuntimeEvent;
\ttype SettlementOrigin = frame_system::EnsureRoot<AccountId>;
\ttype MaxLegs = ChlomMaxSettlementLegs;
}

impl pallet_chlom_tokenization::Config for Runtime {
\ttype RuntimeEvent = RuntimeEvent;
\ttype TokenOrigin = frame_system::EnsureRoot<AccountId>;
}

impl pallet_chlom_oracle::Config for Runtime {
\ttype RuntimeEvent = RuntimeEvent;
\ttype OracleOrigin = frame_system::EnsureRoot<AccountId>;
\ttype ReviewOrigin = frame_system::EnsureRoot<AccountId>;
}

impl pallet_chlom_checkpoint::Config for Runtime {
\ttype RuntimeEvent = RuntimeEvent;
\ttype CheckpointOrigin = frame_system::EnsureRoot<AccountId>;
\ttype AnchorOrigin = frame_system::EnsureRoot<AccountId>;
}
"""
    if "impl pallet_chlom_authority::Config" in text:
        raise RuntimeError("CHLOM configs already present in upstream template")
    write_text(configs, text.rstrip() + chlom_configs + "\n")

    chain_spec = template / "node" / "src" / "chain_spec.rs"
    text = chain_spec.read_text(encoding="utf-8")
    text = text.replace('.with_name("Development")', '.with_name("CHLOM Development")')
    text = text.replace('.with_id("dev")', '.with_id("chlom_dev")')
    text = text.replace('.with_name("Local Testnet")', '.with_name("CHLOM Local Network")')
    text = text.replace('.with_id("local_testnet")', '.with_id("chlom_local")')
    write_text(chain_spec, text)

    command = template / "node" / "src" / "command.rs"
    text = command.read_text(encoding="utf-8")
    text = text.replace('"Substrate Node".into()', '"CHLOM Node".into()')
    text = text.replace('"support.anonymous.an".into()', '"https://crownthrive.com".into()')
    text = text.replace("\t\t2017\n", "\t\t2025\n")
    write_text(command, text)

    node_cargo = template / "node" / "Cargo.toml"
    text = node_cargo.read_text(encoding="utf-8")
    text = text.replace(
        'description = "A solochain node template built with Substrate, part of Polkadot Sdk."',
        'description = "The CHLOM standalone Layer-1 authority node."',
    )
    write_text(node_cargo, text)

    runtime_manifest = {
        "contract": "ct.chlom.native-runtime-materialization.v1",
        "sdk_repository": "paritytech/polkadot-sdk",
        "sdk_commit": SDK_COMMIT,
        "sdk_template": "templates/solochain",
        "chlom_repository": os.environ.get("GITHUB_REPOSITORY", "crownthrive1/chlom-protocol"),
        "chlom_commit": os.environ.get("GITHUB_SHA", run("git", "rev-parse", "HEAD", cwd=repo)),
        "pallets": list(PALLETS),
        "runtime_spec_name": "chlom-runtime",
        "chain_names": ["CHLOM Development", "CHLOM Local Network"],
        "authority_model": "Aura + GRANDPA for validator certification",
        "external_execution_enabled": False,
        "tokenomics_issued": False,
        "legal_title_adjudication_enabled": False,
        "files": {},
    }
    for path in sorted(set(copied + [runtime_cargo, runtime_lib, configs, chain_spec, command, node_cargo])):
        runtime_manifest["files"][str(path.relative_to(sdk))] = sha256_file(path)

    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    args.manifest.write_text(json.dumps(runtime_manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(runtime_manifest, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
