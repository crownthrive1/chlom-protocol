"""Reject incomplete or misleading native benchmark evidence before reporting success."""
import copy
import importlib.util
from pathlib import Path
import unittest

SPEC = importlib.util.spec_from_file_location("native_calibrate", Path(__file__).parents[1] / "scripts/native/calibrate.py")
calibrate = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(calibrate)


class NativeCalibrationEvidenceTests(unittest.TestCase):
    def sample(self):
        return [{"pallet": "pallet_chlom_utility", "benchmark": "reserve", "time_results": [
            {"extrinsic_time": 12000, "reads": 4, "writes": 3, "proof_size": 100, "components": [["n", 1]]},
            {"extrinsic_time": 24000, "reads": 7, "writes": 3, "proof_size": 400, "components": [["n", 4]]}],
            "db_results": [{"extrinsic_time": 12000, "reads": 7, "writes": 3, "proof_size": 400}]}]

    def test_summarizes_measured_samples_without_claiming_proof_bound(self):
        result = calibrate.summarize_batches(self.sample(), "pallet_chlom_utility", ["reserve"])[0]
        self.assertEqual(result["component_ranges"]["n"], {"minimum": 1, "maximum": 4})
        self.assertEqual(result["sample_extrinsic_time_ns"]["median"], 18000)
        self.assertEqual(result["maximum_observed_proof_bytes"], 400)
        self.assertNotIn("proof_bound", result)

    def test_rejects_missing_duplicate_or_wrong_dispatch(self):
        data = self.sample()
        for malformed, expected in (([], ["reserve"]), (data + copy.deepcopy(data), ["reserve"]),
                                    (data, ["reserve", "consume"]), (data, ["consume"])):
            with self.subTest(expected=expected, entries=len(malformed)):
                with self.assertRaises(ValueError):
                    calibrate.summarize_batches(malformed, "pallet_chlom_utility", expected)

    def test_rejects_empty_or_non_measured_samples(self):
        for field, replacement in (("time_results", []), ("db_results", [])):
            data = self.sample()
            data[0][field] = replacement
            with self.assertRaises(ValueError):
                calibrate.summarize_batches(data, "pallet_chlom_utility", ["reserve"])
        for invalid in (0, -1, True, "12000"):
            data = self.sample()
            data[0]["time_results"][0]["extrinsic_time"] = invalid
            with self.assertRaises(ValueError):
                calibrate.summarize_batches(data, "pallet_chlom_utility", ["reserve"])


if __name__ == "__main__":
    unittest.main()
