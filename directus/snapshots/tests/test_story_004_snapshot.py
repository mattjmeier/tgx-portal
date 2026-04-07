import pathlib
import unittest

import yaml


ROOT = pathlib.Path(__file__).resolve().parents[3]
SNAPSHOT = ROOT / "directus" / "snapshots" / "04-workflow-configuration-export.yaml"


EXPORT_COLLECTIONS = [
    "workflow_exports",
    "pipeline_defaults",
]

PROJECT_EXPORT_FIELDS = [
    "workflow_export_status",
    "workflow_export_last_generated_at",
    "workflow_export_last_error_code",
    "workflow_export_last_error_message",
    "latest_workflow_export",
]

GENOME_EXPORT_FIELDS = [
    "genomedir",
    "genome_filename",
    "annotation_filename",
    "genome_name",
]


class Story004SnapshotTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with SNAPSHOT.open("r", encoding="utf-8") as f:
            cls.data = yaml.safe_load(f)

        cls.roles = {r["name"]: r["id"] for r in cls.data.get("roles", [])}

    def test_export_collections_exist(self):
        collections = {c["collection"]: c for c in self.data.get("collections", [])}
        for name in EXPORT_COLLECTIONS:
            self.assertIn(name, collections)

        self.assertTrue(collections["pipeline_defaults"].get("meta", {}).get("singleton"))

    def test_projects_have_export_tracking_fields(self):
        fields = [f for f in self.data.get("fields", []) if f.get("collection") == "projects"]
        field_names = {f.get("field") for f in fields}
        for name in PROJECT_EXPORT_FIELDS:
            self.assertIn(name, field_names)

    def test_genome_versions_include_pipeline_mapping_fields(self):
        fields = [f for f in self.data.get("fields", []) if f.get("collection") == "genome_versions"]
        field_names = {f.get("field") for f in fields}
        for name in GENOME_EXPORT_FIELDS:
            self.assertIn(name, field_names)

    def test_system_role_can_create_workflow_exports_and_update_project_export_metadata(self):
        system_role = self.roles["System"]
        perms = self.data.get("permissions", [])

        create_exports = [
            p
            for p in perms
            if p.get("role") == system_role
            and p.get("collection") == "workflow_exports"
            and p.get("action") == "create"
        ]
        self.assertTrue(create_exports)

        project_update = [
            p
            for p in perms
            if p.get("role") == system_role
            and p.get("collection") == "projects"
            and p.get("action") == "update"
        ]
        self.assertTrue(project_update)
        allowed_fields = set(project_update[0].get("fields") or [])
        for f in PROJECT_EXPORT_FIELDS:
            self.assertIn(f, allowed_fields)

    def test_client_cannot_read_workflow_exports(self):
        client_role = self.roles["Client"]
        perms = self.data.get("permissions", [])
        read_exports = [
            p
            for p in perms
            if p.get("role") == client_role
            and p.get("collection") == "workflow_exports"
            and p.get("action") == "read"
        ]
        self.assertEqual([], read_exports)


if __name__ == "__main__":
    unittest.main()

