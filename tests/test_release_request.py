import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location("release_request", Path(__file__).resolve().parents[1] / "scripts/release_request.py")
RELEASE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RELEASE)


class ReleaseRequestValidationTests(unittest.TestCase):
    def request(self, **updates):
        value = {"tag": "native-v1.4.0", "target": "a" * 40,
                 "title": "CHLOM Native 1.4.0 — Development runtime",
                 "package": "releases/native-v1.4.0", "draft": False, "prerelease": True}
        value.update(updates)
        return value

    def validate(self, request):
        return RELEASE.validate_fields(request, {"tag": request.get("tag"), "target_ref": request.get("target")})

    def test_valid_exact_source_and_boolean_flags_survive(self):
        value = self.validate(self.request())
        self.assertEqual(value["TARGET"], "a" * 40)
        self.assertEqual(value["DRAFT"], "false")
        self.assertEqual(value["PRERELEASE"], "true")

    def test_environment_injection_and_unsafe_paths_are_rejected(self):
        for updates in [
            {"title": "ok\nGH_TOKEN=bad"}, {"title": "bad\x00title"},
            {"tag": "native-v1.4.0\nINJECTED=yes"}, {"tag": "--target=main"},
            {"package": "releases/../../secrets"}, {"package": "/tmp/package"},
            {"draft": "false"}, {"prerelease": 1},
        ]:
            with self.subTest(updates=updates), self.assertRaises(ValueError):
                self.validate(self.request(**updates))

    def test_mutable_short_or_revision_expression_sources_are_rejected(self):
        for target in ["main", "a" * 7, "HEAD~1", "a" * 40 + "^{commit}", "A" * 40]:
            with self.subTest(target=target), self.assertRaises(ValueError):
                self.validate(self.request(target=target))

    def test_manifest_cannot_substitute_tag_or_commit(self):
        for manifest in [{"tag": "native-v1.5.0", "target_ref": "a" * 40},
                         {"tag": "native-v1.4.0", "target_ref": "b" * 40}]:
            with self.subTest(manifest=manifest), self.assertRaises(ValueError):
                RELEASE.validate_fields(self.request(), manifest)

    def test_manual_request_path_has_no_shell_or_traversal_surface(self):
        for path in ["'; echo bad; '", "../../other.json", ".github/release-requests/../other.json", "", "a\nb"]:
            with self.subTest(path=path), self.assertRaises(ValueError):
                RELEASE.resolve_request("workflow_dispatch", path)

    def test_first_parent_request_discovery_handles_real_merge_commit(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            def git(*args):
                return subprocess.check_output(["git", *args], cwd=root, text=True, stderr=subprocess.DEVNULL).strip()
            git("init", "-b", "main")
            git("config", "user.name", "Release Test")
            git("config", "user.email", "release-test@example.invalid")
            (root / "base.txt").write_text("base\n")
            git("add", ".")
            git("commit", "-m", "base")
            git("checkout", "-b", "release-request")
            request = root / ".github/release-requests/chlom-native-v1.4.0.json"
            request.parent.mkdir(parents=True)
            request.write_text(json.dumps(self.request()))
            git("add", ".")
            git("commit", "-m", "request")
            git("checkout", "main")
            (root / "other.txt").write_text("other\n")
            git("add", ".")
            git("commit", "-m", "parallel main update")
            git("merge", "--no-ff", "release-request", "-m", "merge request")
            self.assertEqual(RELEASE.resolve_request("push", "", root=root), request.relative_to(root).as_posix())
            self.assertEqual(json.loads(RELEASE.committed_file(request.relative_to(root).as_posix(), root=root)), self.request())
            # Symlinked release input must not reach filesystem or Git blob parsing.
            request.unlink()
            request.symlink_to(root / "base.txt")
            with self.assertRaises(ValueError):
                RELEASE.committed_file(request.relative_to(root).as_posix(), root=root)


if __name__ == "__main__":
    unittest.main()
