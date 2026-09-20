import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location("native_publish", Path(__file__).resolve().parents[1] / "scripts/native/publish-assets.py")
PUBLISH = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PUBLISH)
SHA = "a" * 40
TAG = "native-v1.4.0"


class FakeGitHub:
    def __init__(self, draft=True, assets=None, corrupt=None, tag_sha=SHA, fail_upload=False):
        self.draft = draft
        self.assets = {} if assets is None else dict(assets)
        self.corrupt = corrupt
        self.tag_sha = tag_sha
        self.fail_upload = fail_upload
        self.operations = []

    def __call__(self, *args):
        self.operations.append(args)
        if args[:2] == ("git", "fetch"):
            return ""
        if args[:2] == ("git", "rev-parse"):
            return self.tag_sha
        if args[:3] == ("gh", "release", "view"):
            return json.dumps({"tagName": TAG, "url": "https://example.invalid/release", "isDraft": self.draft,
                               "assets": [{"name": name} for name in sorted(self.assets)]})
        if args[:3] == ("gh", "release", "download"):
            name = args[args.index("--pattern") + 1]
            folder = Path(args[args.index("--dir") + 1])
            (folder / name).write_bytes(b"corrupt" if name == self.corrupt else self.assets[name])
            return ""
        if args[:3] == ("gh", "release", "upload"):
            if self.fail_upload:
                raise RuntimeError("simulated upload interruption")
            if not self.draft:
                raise AssertionError("An upload was attempted after publication")
            file = Path(args[4])
            if file.name in self.assets:
                raise AssertionError("An existing asset was replaced")
            self.assets[file.name] = file.read_bytes()
            return ""
        if args[:3] == ("gh", "release", "edit"):
            if args[4:] != ("--draft=false",):
                raise AssertionError("Unexpected metadata mutation")
            self.draft = False
            return ""
        raise AssertionError(f"Unexpected command: {args}")


class NativePublicationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        for name in PUBLISH.REQUIRED_ASSETS - {"SHA256SUMS", "native-release.json"}:
            (self.root / name).write_bytes((name + "\n").encode())
        (self.root / "native-release.json").write_text(json.dumps({"sourceCommit": SHA}))
        self.checksums()

    def checksums(self):
        (self.root / "SHA256SUMS").write_text("".join(
            f"{PUBLISH.digest(file)}  {file.name}\n" for file in sorted(self.root.iterdir()) if file.name != "SHA256SUMS"))

    def assets(self):
        return {file.name: file.read_bytes() for file in self.root.iterdir()}

    def mutations(self, fake):
        return [args for args in fake.operations if args[:3] in (("gh", "release", "edit"), ("gh", "release", "upload"))]

    def test_draft_is_published_only_after_all_remote_bytes_and_source_are_checked(self):
        fake = FakeGitHub()
        result = PUBLISH.publish(TAG, SHA, self.root, run=fake)
        self.assertFalse(result["isDraft"])
        self.assertEqual(fake.assets, self.assets())
        edits = [index for index, args in enumerate(fake.operations) if args[:3] == ("gh", "release", "edit")]
        self.assertEqual(len(edits), 1)
        before_publish = fake.operations[:edits[0]]
        self.assertEqual(sum(args[:3] == ("gh", "release", "download") for args in before_publish), len(self.assets()))
        self.assertEqual(before_publish[-1][:2], ("git", "rev-parse"))

    def test_download_corruption_never_publishes_the_draft(self):
        fake = FakeGitHub(corrupt="chlom-runtime.wasm")
        with self.assertRaisesRegex(ValueError, "refusing replacement"):
            PUBLISH.publish(TAG, SHA, self.root, run=fake)
        self.assertTrue(fake.draft)
        self.assertFalse(any(args[:3] == ("gh", "release", "edit") for args in fake.operations))

    def test_conflicting_existing_asset_is_neither_replaced_nor_published(self):
        fake = FakeGitHub(assets={"chlom-runtime.wasm": b"different"})
        with self.assertRaisesRegex(ValueError, "refusing replacement"):
            PUBLISH.publish(TAG, SHA, self.root, run=fake)
        self.assertEqual(self.mutations(fake), [])
        self.assertTrue(fake.draft)

    def test_complete_published_release_is_verified_without_mutation(self):
        fake = FakeGitHub(draft=False, assets=self.assets())
        self.assertFalse(PUBLISH.publish(TAG, SHA, self.root, run=fake)["isDraft"])
        self.assertEqual(self.mutations(fake), [])

    def test_incomplete_published_release_is_not_changed(self):
        fake = FakeGitHub(draft=False)
        with self.assertRaisesRegex(ValueError, "immutable"):
            PUBLISH.publish(TAG, SHA, self.root, run=fake)
        self.assertEqual(self.mutations(fake), [])

    def test_wrong_tag_or_corrupt_local_source_fails_before_remote_mutation(self):
        fake = FakeGitHub(tag_sha="b" * 40)
        with self.assertRaisesRegex(ValueError, "different source"):
            PUBLISH.publish(TAG, SHA, self.root, run=fake)
        self.assertEqual(self.mutations(fake), [])
        (self.root / "chlom-native-corresponding-source.tar.gz").write_bytes(b"modified")
        fake = FakeGitHub()
        with self.assertRaisesRegex(ValueError, "checksum mismatch"):
            PUBLISH.publish(TAG, SHA, self.root, run=fake)
        self.assertEqual(fake.operations, [])

    def test_upload_interruption_leaves_release_in_draft(self):
        fake = FakeGitHub(fail_upload=True)
        with self.assertRaisesRegex(RuntimeError, "interruption"):
            PUBLISH.publish(TAG, SHA, self.root, run=fake)
        self.assertTrue(fake.draft)
        self.assertFalse(any(args[:3] == ("gh", "release", "edit") for args in fake.operations))

    def test_verified_partial_draft_can_resume_without_replacing_existing_assets(self):
        existing = {"chlom-runtime.wasm": self.assets()["chlom-runtime.wasm"]}
        fake = FakeGitHub(assets=existing)
        result = PUBLISH.publish(TAG, SHA, self.root, run=fake)
        self.assertFalse(result["isDraft"])
        uploads = [Path(args[4]).name for args in fake.operations if args[:3] == ("gh", "release", "upload")]
        self.assertNotIn("chlom-runtime.wasm", uploads)
        self.assertEqual(len(uploads), len(self.assets()) - 1)


if __name__ == "__main__":
    unittest.main()
