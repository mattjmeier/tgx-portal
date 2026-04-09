from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from .models import Assay, Project, Sample, Study, StudyOnboardingState, UserProfile

User = get_user_model()


class HealthcheckTests(TestCase):
    def test_healthcheck_returns_ok(self) -> None:
        response = self.client.get(reverse("healthcheck"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})


class SampleModelTests(TestCase):
    def test_invalid_sample_id_raises_validation_error(self) -> None:
        project = Project.objects.create(
            pi_name="Dr. Curie",
            researcher_name="Researcher A",
            bioinformatician_assigned="Bioinfo A",
            title="Project Alpha",
            description="A test project",
        )
        study = Study.objects.create(
            project=project,
            title="Hepatocyte study",
            species=Study.Species.HUMAN,
            celltype="Hepatocyte",
            treatment_var="dose",
            batch_var="plate",
        )
        sample = Sample(
            study=study,
            sample_ID="bad sample",
            sample_name="Bad Sample",
            description="Invalid identifier",
            group="control",
            dose=0,
        )

        with self.assertRaises(ValidationError):
            sample.full_clean()


class ProjectApiTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        self.user = User.objects.create_user(username="admin", password="admin123")
        self.user.profile.role = UserProfile.Role.ADMIN
        self.user.profile.save()
        self.client.force_authenticate(user=self.user)

    def test_list_projects_uses_paginated_payload(self) -> None:
        Project.objects.create(
            pi_name="Dr. Curie",
            researcher_name="Researcher A",
            bioinformatician_assigned="Bioinfo A",
            title="Project Alpha",
            description="A test project",
        )

        response = self.client.get("/api/projects/")

        self.assertEqual(response.status_code, 200)
        self.assertIn("results", response.json())
        self.assertEqual(response.json()["count"], 1)

    def test_list_projects_supports_search_and_ordering(self) -> None:
        Project.objects.create(
            pi_name="Dr. Curie",
            researcher_name="Researcher A",
            bioinformatician_assigned="Bioinfo A",
            title="Alpha collaboration",
            description="A test project",
        )
        Project.objects.create(
            pi_name="Dr. Sagan",
            researcher_name="Researcher B",
            bioinformatician_assigned="Bioinfo B",
            title="Beta collaboration",
            description="A second project",
        )

        response = self.client.get("/api/projects/?search=beta")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["count"], 1)
        self.assertEqual(response.json()["results"][0]["title"], "Beta collaboration")

        response = self.client.get("/api/projects/?ordering=title")

        self.assertEqual(response.status_code, 200)
        titles = [project["title"] for project in response.json()["results"]]
        self.assertEqual(titles, sorted(titles))

    def test_create_project_returns_created_project(self) -> None:
        payload = {
            "pi_name": "Dr. Curie",
            "researcher_name": "Researcher A",
            "bioinformatician_assigned": "Bioinfo A",
            "title": "Project Alpha",
            "description": "A test project",
        }

        response = self.client.post("/api/projects/", payload, format="json")

        self.assertEqual(response.status_code, 201)
        self.assertEqual(Project.objects.count(), 1)
        self.assertEqual(Project.objects.get().title, "Project Alpha")

    def test_delete_project_removes_record(self) -> None:
        project = Project.objects.create(
            pi_name="Dr. Curie",
            researcher_name="Researcher A",
            bioinformatician_assigned="Bioinfo A",
            title="Project Alpha",
            description="A test project",
        )

        response = self.client.delete(f"/api/projects/{project.id}/")

        self.assertEqual(response.status_code, 204)
        self.assertFalse(Project.objects.filter(id=project.id).exists())

    def test_client_role_only_sees_owned_projects(self) -> None:
        other_user = User.objects.create_user(username="other", password="other123")
        other_user.profile.role = UserProfile.Role.CLIENT
        other_user.profile.save()
        self.user.profile.role = UserProfile.Role.CLIENT
        self.user.profile.save()

        owned_project = Project.objects.create(
            owner=self.user,
            pi_name="Dr. Curie",
            researcher_name="Researcher A",
            bioinformatician_assigned="Bioinfo A",
            title="Owned Project",
            description="Owned by client",
        )
        Project.objects.create(
            owner=other_user,
            pi_name="Dr. Sagan",
            researcher_name="Researcher B",
            bioinformatician_assigned="Bioinfo B",
            title="Other Project",
            description="Owned by another client",
        )

        response = self.client.get("/api/projects/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["count"], 1)
        self.assertEqual(response.json()["results"][0]["id"], owned_project.id)

    def test_admin_can_assign_project_owner(self) -> None:
        client_user = User.objects.create_user(username="clientuser", password="client123")
        client_user.profile.role = UserProfile.Role.CLIENT
        client_user.profile.save()
        project = Project.objects.create(
            owner=self.user,
            pi_name="Dr. Curie",
            researcher_name="Researcher A",
            bioinformatician_assigned="Bioinfo A",
            title="Project Alpha",
            description="A test project",
        )

        response = self.client.patch(
            f"/api/projects/{project.id}/assign-owner/",
            {"owner_id": client_user.id},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        project.refresh_from_db()
        self.assertEqual(project.owner_id, client_user.id)

    def test_client_cannot_assign_project_owner(self) -> None:
        client_user = User.objects.create_user(username="clientuser", password="client123")
        client_user.profile.role = UserProfile.Role.CLIENT
        client_user.profile.save()
        self.user.profile.role = UserProfile.Role.CLIENT
        self.user.profile.save()
        project = Project.objects.create(
            owner=self.user,
            pi_name="Dr. Curie",
            researcher_name="Researcher A",
            bioinformatician_assigned="Bioinfo A",
            title="Project Alpha",
            description="A test project",
        )

        response = self.client.patch(
            f"/api/projects/{project.id}/assign-owner/",
            {"owner_id": client_user.id},
            format="json",
        )

        self.assertEqual(response.status_code, 403)


class StudyApiTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        self.user = User.objects.create_user(username="admin", password="admin123")
        self.user.profile.role = UserProfile.Role.ADMIN
        self.user.profile.save()
        self.client.force_authenticate(user=self.user)
        self.project_alpha = Project.objects.create(
            owner=self.user,
            pi_name="Dr. Curie",
            researcher_name="Researcher A",
            bioinformatician_assigned="Bioinfo A",
            title="Project Alpha",
            description="A test project",
        )
        self.project_beta = Project.objects.create(
            owner=self.user,
            pi_name="Dr. Sagan",
            researcher_name="Researcher B",
            bioinformatician_assigned="Bioinfo B",
            title="Project Beta",
            description="A second project",
        )

    def test_list_studies_can_be_filtered_by_project(self) -> None:
        alpha_study = Study.objects.create(
            project=self.project_alpha,
            title="Alpha study 1",
            species=Study.Species.HUMAN,
            celltype="Hepatocyte",
            treatment_var="dose",
            batch_var="plate",
        )
        Study.objects.create(
            project=self.project_beta,
            title="Beta study 1",
            species=Study.Species.MOUSE,
            celltype="Neuron",
            treatment_var="timepoint",
            batch_var="operator",
        )
        sample = Sample.objects.create(
            study=alpha_study,
            sample_ID="alpha-1",
            sample_name="Alpha sample",
            description="Included sample",
            group="control",
            dose=0,
        )
        Assay.objects.create(
            sample=sample,
            platform=Assay.Platform.RNA_SEQ,
            genome_version="hg38",
            quantification_method="salmon",
        )

        response = self.client.get(f"/api/studies/?project_id={self.project_alpha.id}")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["count"], 1)
        self.assertEqual(response.json()["results"][0]["project"], self.project_alpha.id)
        self.assertEqual(response.json()["results"][0]["sample_count"], 1)
        self.assertEqual(response.json()["results"][0]["assay_count"], 1)

    def test_create_study_returns_created_study(self) -> None:
        payload = {
            "project": self.project_alpha.id,
            "title": "Hepatocyte dose response",
            "species": Study.Species.HUMAN,
            "celltype": "Hepatocyte",
            "treatment_var": "dose",
            "batch_var": "plate",
        }

        response = self.client.post("/api/studies/", payload, format="json")

        self.assertEqual(response.status_code, 201)
        self.assertEqual(Study.objects.count(), 1)

    def test_create_study_requires_title(self) -> None:
        payload = {
            "project": self.project_alpha.id,
            "species": Study.Species.HUMAN,
            "celltype": "Hepatocyte",
            "treatment_var": "dose",
            "batch_var": "plate",
        }

        response = self.client.post("/api/studies/", payload, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertIn("title", response.json())

    def test_duplicate_study_returns_bad_request(self) -> None:
        Study.objects.create(
            project=self.project_alpha,
            title="Alpha hepatocyte study",
            species=Study.Species.HUMAN,
            celltype="Hepatocyte",
            treatment_var="dose",
            batch_var="plate",
        )
        payload = {
            "project": self.project_alpha.id,
            "title": "Different title but same metadata",
            "species": Study.Species.HUMAN,
            "celltype": "Hepatocyte",
            "treatment_var": "dose",
            "batch_var": "plate",
        }

        response = self.client.post("/api/studies/", payload, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertIn("non_field_errors", response.json())

    def test_delete_study_removes_record(self) -> None:
        study = Study.objects.create(
            project=self.project_alpha,
            title="Disposable study",
            species=Study.Species.HUMAN,
            celltype="Hepatocyte",
            treatment_var="dose",
            batch_var="plate",
        )

        response = self.client.delete(f"/api/studies/{study.id}/")

        self.assertEqual(response.status_code, 204)
        self.assertFalse(Study.objects.filter(id=study.id).exists())


class SampleApiTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        self.user = User.objects.create_user(username="admin", password="admin123")
        self.user.profile.role = UserProfile.Role.ADMIN
        self.user.profile.save()
        self.client.force_authenticate(user=self.user)
        self.project = Project.objects.create(
            owner=self.user,
            pi_name="Dr. Curie",
            researcher_name="Researcher A",
            bioinformatician_assigned="Bioinfo A",
            title="Project Alpha",
            description="A test project",
        )
        self.study = Study.objects.create(
            project=self.project,
            title="Sample validation study",
            species=Study.Species.HUMAN,
            celltype="Hepatocyte",
            treatment_var="dose",
            batch_var="plate",
        )

    def test_sample_bulk_create_accepts_list_payload(self) -> None:
        payload = [
            {
                "study": self.study.id,
                "sample_ID": "sample-1",
                "sample_name": "Sample 1",
                "description": "Bulk row one",
                "group": "control",
                "chemical": "",
                "chemical_longname": "",
                "dose": 0,
                "technical_control": False,
                "reference_rna": False,
                "solvent_control": False,
            },
            {
                "study": self.study.id,
                "sample_ID": "sample-2",
                "sample_name": "Sample 2",
                "description": "Bulk row two",
                "group": "treated",
                "chemical": "cmpd",
                "chemical_longname": "Compound",
                "dose": 3.5,
                "technical_control": False,
                "reference_rna": False,
                "solvent_control": False,
            },
        ]

        response = self.client.post("/api/samples/", payload, format="json")

        self.assertEqual(response.status_code, 201)
        self.assertEqual(Sample.objects.count(), 2)
        self.assertEqual(len(response.json()), 2)

    def test_list_samples_can_be_filtered_by_study(self) -> None:
        other_study = Study.objects.create(
            project=self.project,
            title="Other study",
            species=Study.Species.MOUSE,
            celltype="Neuron",
            treatment_var="timepoint",
            batch_var="operator",
        )
        Sample.objects.create(
            study=self.study,
            sample_ID="sample-1",
            sample_name="Sample 1",
            description="Included sample",
            group="control",
            dose=0,
        )
        Sample.objects.create(
            study=other_study,
            sample_ID="sample-2",
            sample_name="Sample 2",
            description="Filtered out",
            group="treated",
            dose=1,
        )

        response = self.client.get(f"/api/samples/?study_id={self.study.id}")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["count"], 1)
        self.assertEqual(response.json()["results"][0]["sample_ID"], "sample-1")

    def test_list_samples_supports_search(self) -> None:
        Sample.objects.create(
            study=self.study,
            sample_ID="control-1",
            sample_name="Control Sample",
            description="Included sample",
            group="control",
            dose=0,
        )
        Sample.objects.create(
            study=self.study,
            sample_ID="treated-1",
            sample_name="Treated Sample",
            description="Filtered out",
            group="treated",
            dose=1,
        )

        response = self.client.get(f"/api/samples/?study_id={self.study.id}&search=control")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["count"], 1)
        self.assertEqual(response.json()["results"][0]["sample_ID"], "control-1")

    def test_list_samples_supports_ordering(self) -> None:
        Sample.objects.create(
            study=self.study,
            sample_ID="sample-1",
            sample_name="A Sample",
            description="Included sample",
            group="control",
            dose=0,
        )
        Sample.objects.create(
            study=self.study,
            sample_ID="sample-2",
            sample_name="B Sample",
            description="Filtered out",
            group="treated",
            dose=5,
        )

        response = self.client.get(f"/api/samples/?study_id={self.study.id}&ordering=-dose")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["results"][0]["sample_ID"], "sample-2")

    def test_invalid_sample_payload_returns_bad_request(self) -> None:
        payload = {
            "study": self.study.id,
            "sample_ID": "bad sample",
            "sample_name": "Sample 1",
            "description": "Invalid sample",
            "group": "control",
            "chemical": "",
            "chemical_longname": "",
            "dose": -1,
            "technical_control": False,
            "reference_rna": False,
            "solvent_control": False,
        }

        response = self.client.post("/api/samples/", payload, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertIn("sample_ID", response.json())

    def test_bulk_import_duplicate_sample_ids_are_rejected_atomically(self) -> None:
        payload = [
            {
                "study": self.study.id,
                "sample_ID": "sample-1",
                "sample_name": "Sample 1",
                "description": "First upload row",
                "group": "control",
                "chemical": "",
                "chemical_longname": "",
                "dose": 0,
                "technical_control": False,
                "reference_rna": False,
                "solvent_control": True,
            },
            {
                "study": self.study.id,
                "sample_ID": "sample-1",
                "sample_name": "Sample 1 duplicate",
                "description": "Second upload row",
                "group": "treated",
                "chemical": "cmpd",
                "chemical_longname": "Compound",
                "dose": 2,
                "technical_control": False,
                "reference_rna": False,
                "solvent_control": False,
            },
        ]

        response = self.client.post("/api/samples/", payload, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(Sample.objects.count(), 0)
        self.assertEqual(len(response.json()), 2)
        self.assertEqual(response.json()[1]["sample_ID"][0], "This sample_ID is duplicated within the upload.")

    def test_bulk_import_preserves_row_level_validation_errors(self) -> None:
        payload = [
            {
                "study": self.study.id,
                "sample_ID": "sample-1",
                "sample_name": "Sample 1",
                "description": "First upload row",
                "group": "control",
                "chemical": "",
                "chemical_longname": "",
                "dose": 0,
                "technical_control": False,
                "reference_rna": False,
                "solvent_control": True,
            },
            {
                "study": self.study.id,
                "sample_ID": "bad sample",
                "sample_name": "Sample 2",
                "description": "Second upload row",
                "group": "treated",
                "chemical": "cmpd",
                "chemical_longname": "Compound",
                "dose": -1,
                "technical_control": False,
                "reference_rna": False,
                "solvent_control": False,
            },
        ]

        response = self.client.post("/api/samples/", payload, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(Sample.objects.count(), 0)
        self.assertEqual(len(response.json()), 2)
        self.assertEqual(response.json()[0], {})
        self.assertIn("sample_ID", response.json()[1])
        self.assertIn("dose", response.json()[1])

    def test_duplicate_sample_id_within_study_returns_bad_request(self) -> None:
        Sample.objects.create(
            study=self.study,
            sample_ID="sample-1",
            sample_name="Sample 1",
            description="Existing sample",
            group="control",
            dose=0,
        )
        payload = {
            "study": self.study.id,
            "sample_ID": "sample-1",
            "sample_name": "Another Sample 1",
            "description": "Duplicate sample",
            "group": "control",
            "chemical": "",
            "chemical_longname": "",
            "dose": 0,
            "technical_control": False,
            "reference_rna": False,
            "solvent_control": False,
        }

        response = self.client.post("/api/samples/", payload, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertIn("non_field_errors", response.json())

    def test_delete_sample_removes_record(self) -> None:
        sample = Sample.objects.create(
            study=self.study,
            sample_ID="sample-1",
            sample_name="Sample 1",
            description="Included sample",
            group="control",
            dose=0,
        )

        response = self.client.delete(f"/api/samples/{sample.id}/")

        self.assertEqual(response.status_code, 204)
        self.assertFalse(Sample.objects.filter(id=sample.id).exists())


class AssayApiTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        self.user = User.objects.create_user(username="admin", password="admin123")
        self.user.profile.role = UserProfile.Role.ADMIN
        self.user.profile.save()
        self.client.force_authenticate(user=self.user)
        self.project = Project.objects.create(
            owner=self.user,
            pi_name="Dr. Curie",
            researcher_name="Researcher A",
            bioinformatician_assigned="Bioinfo A",
            title="Project Alpha",
            description="A test project",
        )
        self.study = Study.objects.create(
            project=self.project,
            title="Assay study",
            species=Study.Species.HUMAN,
            celltype="Hepatocyte",
            treatment_var="dose",
            batch_var="plate",
        )
        self.sample = Sample.objects.create(
            study=self.study,
            sample_ID="sample-1",
            sample_name="Sample 1",
            description="Included sample",
            group="control",
            dose=0,
            solvent_control=True,
        )

    def test_create_assay_returns_created_assay(self) -> None:
        payload = {
            "sample": self.sample.id,
            "platform": Assay.Platform.RNA_SEQ,
            "genome_version": "hg38",
            "quantification_method": "raw_counts",
        }

        response = self.client.post("/api/assays/", payload, format="json")

        self.assertEqual(response.status_code, 201)
        self.assertEqual(Assay.objects.count(), 1)

    def test_list_assays_can_be_filtered_by_sample(self) -> None:
        Assay.objects.create(
            sample=self.sample,
            platform=Assay.Platform.RNA_SEQ,
            genome_version="hg38",
            quantification_method="raw_counts",
        )
        other_sample = Sample.objects.create(
            study=self.study,
            sample_ID="sample-2",
            sample_name="Sample 2",
            description="Other sample",
            group="treated",
            dose=1,
        )
        Assay.objects.create(
            sample=other_sample,
            platform=Assay.Platform.TEMPO_SEQ,
            genome_version="mm39",
            quantification_method="normalized_transcripts",
        )

        response = self.client.get(f"/api/assays/?sample_id={self.sample.id}")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["count"], 1)
        self.assertEqual(response.json()["results"][0]["sample"], self.sample.id)


class ConfigGenerationApiTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        self.user = User.objects.create_user(username="admin", password="admin123")
        self.user.profile.role = UserProfile.Role.ADMIN
        self.user.profile.save()
        self.client.force_authenticate(user=self.user)
        self.project = Project.objects.create(
            owner=self.user,
            pi_name="Dr. Curie",
            researcher_name="Researcher A",
            bioinformatician_assigned="Bioinfo A",
            title="Project Alpha",
            description="A test project",
        )
        self.study = Study.objects.create(
            project=self.project,
            title="Config generation study",
            species=Study.Species.HUMAN,
            celltype="Hepatocyte",
            treatment_var="dose",
            batch_var="plate",
        )
        StudyOnboardingState.objects.create(
            study=self.study,
            status=StudyOnboardingState.Status.FINAL,
            metadata_columns=["group", "plate"],
            mappings={"treatment_level_1": "group", "batch": "plate"},
        )
        self.sample_control = Sample.objects.create(
            study=self.study,
            sample_ID="sample-1",
            sample_name="Sample 1",
            description="Control sample",
            group="control",
            chemical="",
            chemical_longname="",
            dose=0,
            solvent_control=True,
        )
        self.sample_treated = Sample.objects.create(
            study=self.study,
            sample_ID="sample-2",
            sample_name="Sample 2",
            description="Treated sample",
            group="treated",
            chemical="cmpd",
            chemical_longname="Compound",
            dose=3.5,
        )
        Assay.objects.create(
            sample=self.sample_control,
            platform=Assay.Platform.RNA_SEQ,
            genome_version="hg38",
            quantification_method="raw_counts",
        )
        Assay.objects.create(
            sample=self.sample_treated,
            platform=Assay.Platform.RNA_SEQ,
            genome_version="hg38",
            quantification_method="raw_counts",
        )

    def test_generate_config_returns_zip_file(self) -> None:
        response = self.client.post(f"/api/projects/{self.project.id}/generate-config/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/zip")
        self.assertIn("config_bundle_project_alpha.zip", response["Content-Disposition"])

    def test_generate_config_rejects_mixed_platforms(self) -> None:
        Assay.objects.create(
            sample=self.sample_control,
            platform=Assay.Platform.TEMPO_SEQ,
            genome_version="hg38",
            quantification_method="normalized_transcripts",
        )

        response = self.client.post(f"/api/projects/{self.project.id}/generate-config/")

        self.assertEqual(response.status_code, 400)
        self.assertIn("detail", response.json())


class AuthApiTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        self.user = User.objects.create_user(username="admin", password="admin123")
        self.user.profile.role = UserProfile.Role.ADMIN
        self.user.profile.save()

    def test_login_returns_token_and_user(self) -> None:
        response = self.client.post(
            "/api/auth/login/",
            {"username": "admin", "password": "admin123"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn("token", response.json())
        self.assertEqual(response.json()["user"]["profile"]["role"], UserProfile.Role.ADMIN)

    def test_unauthenticated_projects_request_is_rejected(self) -> None:
        response = self.client.get("/api/projects/")

        self.assertEqual(response.status_code, 401)


class UserManagementApiTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        self.admin_user = User.objects.create_user(username="admin", password="admin123")
        self.admin_user.profile.role = UserProfile.Role.ADMIN
        self.admin_user.profile.save()
        self.client_user = User.objects.create_user(username="client", password="client123")
        self.client_user.profile.role = UserProfile.Role.CLIENT
        self.client_user.profile.save()

    def test_admin_can_list_users(self) -> None:
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.get("/api/users/")

        self.assertEqual(response.status_code, 200)
        self.assertGreaterEqual(response.json()["count"], 2)

    def test_admin_can_create_client_user(self) -> None:
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.post(
            "/api/users/",
            {
                "username": "newclient",
                "email": "newclient@example.com",
                "password": "strongpass1",
                "role": UserProfile.Role.CLIENT,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(User.objects.filter(username="newclient").exists())
        self.assertEqual(User.objects.get(username="newclient").profile.role, UserProfile.Role.CLIENT)

    def test_admin_can_update_user_role(self) -> None:
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.patch(
            f"/api/users/{self.client_user.id}/",
            {"role": UserProfile.Role.SYSTEM},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.client_user.refresh_from_db()
        self.assertEqual(self.client_user.profile.role, UserProfile.Role.SYSTEM)

    def test_client_cannot_list_users(self) -> None:
        self.client.force_authenticate(user=self.client_user)

        response = self.client.get("/api/users/")

        self.assertEqual(response.status_code, 403)
