#!/usr/bin/env python3
"""Publish a native draft only after exact source and complete asset readback pass.

CrownThrive-authored; governed by the repository LICENSE.
"""
import argparse
import hashlib
import json
import re
import subprocess
import tempfile
from pathlib import Path

REQUIRED_ASSETS = {
    "SHA256SUMS", "native-release.json", "chlom-node-linux-x86_64.tar.gz",
    "chlom-runtime.wasm", "chlom-native-corresponding-source.tar.gz",
    "native-smoke.json", "native-signed-rpc.json", "native-benchmarks.json",
    "native-calibration-receipt.json", "native-calibration.tar.gz", "dependency-licenses.json",
    "chlom-dev.json", "chlom-dev-raw.json", "chlom-local.json", "chlom-local-raw.json",
}


def command(*args):
    return subprocess.check_output(args, text=True).strip()


def digest(path):
    with path.open("rb") as file:
        return hashlib.file_digest(file, "sha256").hexdigest()


def validate_assets(directory, source):
    files = {path.name: path for path in directory.iterdir()}
    if not REQUIRED_ASSETS.issubset(files):
        raise ValueError("Complete native binary, source and acceptance asset set required")
    if any(not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", name) or path.is_symlink() or not path.is_file()
           for name, path in files.items()):
        raise ValueError("Native assets must be regular files with safe names")
    expected = {}
    for line in files["SHA256SUMS"].read_text().splitlines():
        match = re.fullmatch(r"([0-9a-f]{64})  ([A-Za-z0-9][A-Za-z0-9._-]*)", line)
        if not match or match[2] in expected:
            raise ValueError("Invalid or duplicate checksum entry")
        expected[match[2]] = match[1]
    if set(expected) != files.keys() - {"SHA256SUMS"}:
        raise ValueError("Checksums must cover the complete asset set")
    if any(digest(files[name]) != checksum for name, checksum in expected.items()):
        raise ValueError("Native asset checksum mismatch")
    manifest = json.loads(files["native-release.json"].read_text())
    if manifest.get("sourceCommit") != source:
        raise ValueError("Native manifest source does not match exact release target")
    return files


def publish(tag, source, directory, run=command):
    if not re.fullmatch(r"native-v[0-9]+\.[0-9]+\.[0-9]+(?:[.-][A-Za-z0-9.-]+)?", tag):
        raise ValueError("Expected native semantic-version release tag")
    if not re.fullmatch(r"[0-9a-f]{40}", source):
        raise ValueError("Expected exact source commit")
    files = validate_assets(directory, source)

    def check_tag():
        ref = f"refs/tags/{tag}"
        run("git", "fetch", "--no-tags", "origin", f"{ref}:{ref}")
        if run("git", "rev-parse", f"{ref}^{{commit}}") != source:
            raise ValueError("Release tag has a different source commit")

    def readback():
        release = json.loads(run("gh", "release", "view", tag, "--json", "tagName,url,isDraft,assets"))
        if release.get("tagName") != tag or not isinstance(release.get("isDraft"), bool):
            raise ValueError("Release identity/state readback mismatch")
        names = [asset["name"] for asset in release["assets"]]
        if len(names) != len(set(names)) or not set(names).issubset(files):
            raise ValueError("Unexpected existing native release assets; nothing may be replaced")
        return release, set(names)

    def verify_download(name, destination):
        run("gh", "release", "download", tag, "--pattern", name, "--dir", str(destination))
        downloaded = destination / name
        if not downloaded.is_file() or downloaded.is_symlink() or digest(downloaded) != digest(files[name]):
            raise ValueError(f"Remote asset differs; refusing replacement: {name}")

    check_tag()
    release, existing = readback()
    missing = files.keys() - existing
    if missing and not release["isDraft"]:
        raise ValueError("Published native releases are immutable; missing assets require a new release")
    with tempfile.TemporaryDirectory(prefix="chlom-native-publish-") as temporary:
        old = Path(temporary) / "existing"
        old.mkdir()
        for name in sorted(existing):
            verify_download(name, old)
        for name in sorted(missing):
            # Deliberately no --clobber: a concurrent or conflicting upload fails closed.
            run("gh", "release", "upload", tag, str(files[name]))
        _, remote_names = readback()
        if remote_names != files.keys():
            raise ValueError("Remote release does not contain the complete verified asset set")
        complete = Path(temporary) / "complete"
        complete.mkdir()
        for name in sorted(files):
            verify_download(name, complete)
        check_tag()
        # This is the only publication transition, after all verification and byte readback.
        if release["isDraft"]:
            run("gh", "release", "edit", tag, "--draft=false")
        final, final_names = readback()
        if final["isDraft"] or final_names != files.keys():
            raise ValueError("Final publication readback failed")
        check_tag()
        final["verifiedSourceCommit"] = source
        final["assetBytesReadbackVerified"] = True
        return final


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tag", required=True)
    parser.add_argument("--source", required=True)
    parser.add_argument("--artifacts", required=True, type=Path)
    arguments = parser.parse_args()
    print(json.dumps(publish(arguments.tag, arguments.source, arguments.artifacts.resolve()), indent=2))
