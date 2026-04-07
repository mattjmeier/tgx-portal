import pathlib
import unittest

import yaml


ROOT = pathlib.Path(__file__).resolve().parents[3]
SNAPSHOT = ROOT / "directus" / "snapshots" / "02-bioinformatician-sample-intake.yaml"


class Story002SnapshotTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with SNAPSHOT.open("r", encoding="utf-8") as f:
            cls.data = yaml.safe_load(f)

    def test_has_sample_intake_collection(self):
        collections = {c["collection"] for c in self.data.get("collections", [])}
        self.assertIn("sample_intake_uploads", collections)

    def test_sample_intake_fields_exist(self):
        fields = [
            f
            for f in self.data.get("fields", [])
            if f.get("collection") == "sample_intake_uploads"
        ]
        names = {f["field"] for f in fields}
        for name in [
            "study",
            "file_type",
            "source_type",
            "source_text",
            "source_file",
            "status",
            "validate_requested",
            "commit_requested",
            "preview_rows",
            "validation_errors",
            "commit_result",
        ]:
            self.assertIn(name, names)


if __name__ == "__main__":
    unittest.main()

