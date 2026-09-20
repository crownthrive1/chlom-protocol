#!/usr/bin/env python3
"""Validate an exact, committed CHLOM release request before GitHub publication."""
import argparse
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REQUEST_PATTERN = re.compile(r"\.github/release-requests/chlom-[A-Za-z0-9._-]+\.json")
TAG_PATTERN = re.compile(r"(?:[A-Za-z0-9][A-Za-z0-9._-]*-)?v[0-9]+\.[0-9]+\.[0-9]+(?:[.-][A-Za-z0-9][A-Za-z0-9.-]*)?")
SHA_PATTERN = re.compile(r"[0-9a-f]{40}")


def git(*args, root=ROOT):
    return subprocess.check_output(["git", *args], cwd=root, text=True).strip()


def validate_fields(request, manifest):
    if not isinstance(request, dict) or not isinstance(manifest, dict):
        raise ValueError("Request and manifest must be JSON objects")
    tag = request.get("tag")
    target = request.get("target")
    title = request.get("title")
    package = request.get("package")
    if not isinstance(tag, str) or len(tag) > 128 or not TAG_PATTERN.fullmatch(tag):
        raise ValueError("Release tag must be a bounded semantic-version tag")
    if not isinstance(target, str) or not SHA_PATTERN.fullmatch(target):
        raise ValueError("Release target must be an exact 40-character commit SHA; historical mutable requests remain archived")
    if not isinstance(title, str) or not title.strip() or len(title) > 300 or any(ord(c) < 32 or ord(c) == 127 for c in title):
        raise ValueError("Release title must be a nonempty single line without control characters")
    if package != f"releases/{tag}":
        raise ValueError("Release package must be releases/<exact-tag>")
    for field in ("draft", "prerelease"):
        if field in request and not isinstance(request[field], bool):
            raise ValueError(f"{field} must be boolean when supplied")
    if manifest.get("tag") != tag or manifest.get("target_ref") != target:
        raise ValueError("Release request and manifest must name the same exact tag and source")
    return {"TAG": tag, "TARGET": target, "TITLE": title, "PACKAGE": package,
            "DRAFT": str(request.get("draft", False)).lower(),
            "PRERELEASE": str(request.get("prerelease", False)).lower()}


def committed_file(relative, root=ROOT):
    path = root / relative
    if not path.is_file() or path.is_symlink() or not path.resolve().is_relative_to(root.resolve()):
        raise ValueError(f"Expected a repository-contained regular file: {relative}")
    if any(parent.is_symlink() for parent in path.parents if parent != root.parent):
        raise ValueError(f"Symlinked release path is forbidden: {relative}")
    # Read the exact checkout's committed blob, excluding untracked/generated substitutions.
    return git("show", f"HEAD:{relative}", root=root)


def resolve_request(event, manual_path, root=ROOT):
    if event == "workflow_dispatch":
        candidates = [manual_path]
    elif event == "push":
        # The first-parent delta covers both squash and ordinary merge commits.
        changes = git("diff", "--name-only", "HEAD^1", "HEAD", "--", ".github/release-requests/", root=root).splitlines()
        candidates = [path for path in changes if REQUEST_PATTERN.fullmatch(path)]
    else:
        raise ValueError("Unsupported release publication event")
    if len(candidates) != 1 or not isinstance(candidates[0], str) or not REQUEST_PATTERN.fullmatch(candidates[0]):
        raise ValueError("Exactly one valid CHLOM release request is required")
    return candidates[0]


def main(args):
    request_file = resolve_request(args.event, args.request)
    request = json.loads(committed_file(request_file))
    # Validate the package path before any filesystem access based on JSON values.
    tag = request.get("tag") if isinstance(request, dict) else None
    package = request.get("package") if isinstance(request, dict) else None
    if not isinstance(tag, str) or not TAG_PATTERN.fullmatch(tag) or package != f"releases/{tag}":
        raise ValueError("Invalid release package path")
    manifest = json.loads(committed_file(f"{package}/MANIFEST.json"))
    notes = committed_file(f"{package}/RELEASE_NOTES.md")
    if not notes.strip():
        raise ValueError("Release notes cannot be empty")
    values = validate_fields(request, manifest)
    git("check-ref-format", f"refs/tags/{values['TAG']}")
    if git("rev-parse", "--verify", f"{values['TARGET']}^{{commit}}") != values["TARGET"]:
        raise ValueError("Release target is not an exact commit")
    values["REQUEST_FILE"] = request_file
    with args.output.open("a") as output:
        for key, value in values.items():
            output.write(f"{key}={value}\n")
    print(json.dumps({"request": request_file, "tag": values["TAG"], "sourceCommit": values["TARGET"]}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--event", required=True, choices=("push", "workflow_dispatch"))
    parser.add_argument("--request", default="")
    parser.add_argument("--output", type=Path, required=True)
    main(parser.parse_args())
