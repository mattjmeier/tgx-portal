import pathlib
import unittest

import yaml


ROOT = pathlib.Path(__file__).resolve().parents[3]
SNAPSHOT = ROOT / "directus" / "snapshots" / "01-collaborator-project-intake.yaml"


class Story001SnapshotTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with SNAPSHOT.open("r", encoding="utf-8") as f:
            cls.data = yaml.safe_load(f)

    def test_has_required_collections(self):
        collections = {c["collection"] for c in self.data.get("collections", [])}
        for name in [
            "projects",
            "studies",
            "samples",
            "assays",
            "sample_plating",
        ]:
            self.assertIn(name, collections)

    def test_has_required_roles(self):
        roles = {r["name"] for r in self.data.get("roles", [])}
        self.assertEqual({"Admin", "Client", "System"}, roles)

    def test_client_projects_read_is_scoped(self):
        perms = self.data.get("permissions", [])
        match = [
            p
            for p in perms
            if p.get("collection") == "projects"
            and p.get("action") == "read"
            and p.get("role")
        ]
        # Ensure *a* projects read permission exists with the expected client_user scoping rule.
        scoped = any(
            p.get("permissions", {}).get("client_user", {}).get("_eq") == "$CURRENT_USER"
            for p in match
        )
        self.assertTrue(scoped)

    def test_project_intake_fields_exist(self):
        fields = [
            f for f in self.data.get("fields", []) if f.get("collection") == "projects"
        ]
        names = {f["field"] for f in fields}
        for name in [
            "title",
            "pi_name",
            "researcher_name",
            "bioinformatician_assigned",
            "description",
            "status",
            "intake_platform",
        ]:
            self.assertIn(name, names)

    def test_biospyder_fields_have_conditions(self):
        fields = [
            f for f in self.data.get("fields", []) if f.get("collection") == "projects"
        ]
        by_name = {f["field"]: f for f in fields}
        for name in ["biospyder_manifest", "biospyder_databases"]:
            conditions = (by_name.get(name) or {}).get("meta", {}).get("conditions")
            self.assertTrue(conditions, f"{name} should include UI conditions")


if __name__ == "__main__":
    unittest.main()

