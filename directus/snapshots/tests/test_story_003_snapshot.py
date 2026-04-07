import pathlib
import unittest

import yaml


ROOT = pathlib.Path(__file__).resolve().parents[3]
SNAPSHOT = ROOT / "directus" / "snapshots" / "03-admin-lookup-and-permissions-management.yaml"


LOOKUP_COLLECTIONS = [
    "platform_options",
    "genome_versions",
    "quantification_methods",
    "species_options",
    "biospyder_databases",
    "biospyder_manifests",
]


class Story003SnapshotTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with SNAPSHOT.open("r", encoding="utf-8") as f:
            cls.data = yaml.safe_load(f)

        cls.roles = {r["name"]: r["id"] for r in cls.data.get("roles", [])}

    def test_lookup_collections_exist_and_grouped(self):
        collections = {c["collection"]: c for c in self.data.get("collections", [])}
        for name in LOOKUP_COLLECTIONS:
            self.assertIn(name, collections)
            meta = (collections.get(name) or {}).get("meta", {})
            self.assertEqual("Lookups", meta.get("group"))
            self.assertEqual("all", meta.get("accountability"))

    def test_lookup_collections_have_stable_code_fields(self):
        fields = self.data.get("fields", [])
        by_collection = {}
        for f in fields:
            by_collection.setdefault(f.get("collection"), []).append(f)

        for name in LOOKUP_COLLECTIONS:
            coll_fields = {f.get("field"): f for f in by_collection.get(name, [])}
            self.assertIn("name", coll_fields, f"Missing {name}.name field")
            self.assertIn("code", coll_fields, f"Missing {name}.code field")

            code_schema = (coll_fields["code"].get("schema", {}) or {})
            self.assertEqual(False, code_schema.get("is_nullable"), f"{name}.code should be required")
            self.assertEqual(True, code_schema.get("is_unique"), f"{name}.code should be unique")

    def test_client_can_read_lookups(self):
        client_role = self.roles["Client"]
        perms = self.data.get("permissions", [])
        for collection in LOOKUP_COLLECTIONS:
            matching = [
                p
                for p in perms
                if p.get("role") == client_role
                and p.get("collection") == collection
                and p.get("action") == "read"
            ]
            self.assertTrue(matching, f"Client should have read access to {collection}")

        # Ensure there is no accidental wildcard on lookups for Client.
        wildcard = [
            p
            for p in perms
            if p.get("role") == client_role
            and p.get("collection") in LOOKUP_COLLECTIONS
            and p.get("action") == "*"
        ]
        self.assertEqual([], wildcard)

        # Ensure Client doesn't get write access to lookup collections.
        write_actions = {"create", "update", "delete"}
        writes = [
            p
            for p in perms
            if p.get("role") == client_role
            and p.get("collection") in LOOKUP_COLLECTIONS
            and p.get("action") in write_actions
        ]
        self.assertEqual([], writes)

    def test_admin_can_manage_lookup_m2m_junction(self):
        admin_role = self.roles["Admin"]
        perms = self.data.get("permissions", [])
        matching = [
            p
            for p in perms
            if p.get("role") == admin_role
            and p.get("collection") == "projects_biospyder_databases"
            and p.get("action") == "*"
        ]
        self.assertTrue(matching)

    def test_client_scope_filters_exist_for_core_collections(self):
        client_role = self.roles["Client"]
        perms = self.data.get("permissions", [])

        projects_read = [
            p
            for p in perms
            if p.get("role") == client_role
            and p.get("collection") == "projects"
            and p.get("action") == "read"
        ]
        self.assertTrue(projects_read)
        self.assertEqual(
            "$CURRENT_USER",
            (projects_read[0].get("permissions", {}) or {}).get("client_user", {}).get("_eq"),
        )

        projects_create = [
            p
            for p in perms
            if p.get("role") == client_role
            and p.get("collection") == "projects"
            and p.get("action") == "create"
        ]
        self.assertTrue(projects_create)
        self.assertEqual(
            "$CURRENT_USER",
            (projects_create[0].get("validation", {}) or {}).get("client_user", {}).get("_eq"),
        )

        def assert_nested_scope(d, expected_path):
            cur = d or {}
            for key in expected_path:
                cur = (cur.get(key) or {}) if isinstance(cur, dict) else {}
            self.assertEqual("$CURRENT_USER", cur.get("_eq"))

        def assert_scoped_collection(collection, expected_path):
            def find(action):
                return [
                    p
                    for p in perms
                    if p.get("role") == client_role
                    and p.get("collection") == collection
                    and p.get("action") == action
                ]

            read = find("read")
            self.assertTrue(read, f"Expected scoped read permission for {collection}")
            assert_nested_scope(read[0].get("permissions", {}) or {}, expected_path)

            create = find("create")
            self.assertTrue(create, f"Expected scoped create permission for {collection}")
            assert_nested_scope(create[0].get("validation", {}) or {}, expected_path)

            update = find("update")
            self.assertTrue(update, f"Expected scoped update permission for {collection}")
            assert_nested_scope(update[0].get("permissions", {}) or {}, expected_path)
            assert_nested_scope(update[0].get("validation", {}) or {}, expected_path)

            delete = find("delete")
            self.assertTrue(delete, f"Expected scoped delete permission for {collection}")
            assert_nested_scope(delete[0].get("permissions", {}) or {}, expected_path)

        assert_scoped_collection("studies", ["project", "client_user"])
        assert_scoped_collection("samples", ["study", "project", "client_user"])
        assert_scoped_collection("assays", ["sample", "study", "project", "client_user"])
        assert_scoped_collection("sample_plating", ["sample", "study", "project", "client_user"])

    def test_plane_sync_operations_use_automation_token(self):
        operations = self.data.get("operations", [])
        plane_ops = [op for op in operations if op.get("type") == "webhook" and "Plane Sync" in (op.get("name") or "")]
        self.assertTrue(plane_ops, "Expected Plane Sync webhook operations")
        for op in plane_ops:
            headers = (op.get("options") or {}).get("headers") or []
            auth = [h for h in headers if (h.get("header") or "").lower() == "authorization"]
            self.assertTrue(auth, f"Missing Authorization header on operation {op.get('name')}")
            self.assertIn("DIRECTUS_AUTOMATION_TOKEN", auth[0].get("value") or "")

    def test_admin_presets_exist_for_lookup_tables(self):
        admin_role = self.roles["Admin"]
        presets = self.data.get("presets", [])
        bookmarks = {
            (p.get("collection"), p.get("bookmark"))
            for p in presets
            if p.get("role") == admin_role
        }
        expected = {
            ("genome_versions", "Lookups: Genome Versions"),
            ("quantification_methods", "Lookups: Quantification Methods"),
            ("species_options", "Lookups: Species Options"),
            ("platform_options", "Lookups: Platform Options"),
            ("biospyder_databases", "Lookups: Biospyder Databases"),
            ("biospyder_manifests", "Lookups: Biospyder Manifests"),
        }
        self.assertTrue(expected.issubset(bookmarks))

    def test_system_can_read_user_email_for_integrations(self):
        system_role = self.roles["System"]
        perms = self.data.get("permissions", [])
        matching = [
            p
            for p in perms
            if p.get("role") == system_role
            and p.get("collection") == "directus_users"
            and p.get("action") == "read"
        ]
        self.assertTrue(matching, "System should be able to read directus_users")
        fields = set(matching[0].get("fields") or [])
        self.assertIn("id", fields)
        self.assertIn("email", fields)

    def test_system_role_is_least_privilege(self):
        system_role = self.roles["System"]
        perms = self.data.get("permissions", [])

        wildcard = [p for p in perms if p.get("role") == system_role and p.get("action") == "*"]
        self.assertEqual([], wildcard)

        # Only allow one update permission: Plane sync metadata on projects.
        updates = [
            p
            for p in perms
            if p.get("role") == system_role
            and p.get("action") == "update"
            and p.get("collection") != "projects"
        ]
        self.assertEqual([], updates)


if __name__ == "__main__":
    unittest.main()
