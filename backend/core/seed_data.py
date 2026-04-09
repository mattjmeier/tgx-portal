from __future__ import annotations

from dataclasses import dataclass, field

from django.contrib.auth import get_user_model
from django.db import transaction

from .models import Assay, Project, Sample, Study, StudyOnboardingState, UserProfile

User = get_user_model()


@dataclass(frozen=True)
class SeedSample:
    sample_id: str
    sample_name: str
    group: str
    dose: float
    chemical: str
    chemical_longname: str
    description: str
    solvent_control: bool = False
    technical_control: bool = False
    reference_rna: bool = False


@dataclass(frozen=True)
class SeedStudy:
    title: str
    species: str
    celltype: str
    treatment_var: str
    batch_var: str
    metadata_columns: list[str]
    mappings: dict[str, str]
    selected_contrasts: list[list[str]]
    samples: list[SeedSample]
    platform: str
    genome_version: str
    quantification_method: str


@dataclass(frozen=True)
class SeedProject:
    owner_username: str
    pi_name: str
    researcher_name: str
    bioinformatician_assigned: str
    title: str
    description: str
    studies: list[SeedStudy] = field(default_factory=list)


SEED_PROJECTS: list[SeedProject] = [
    SeedProject(
        owner_username="client",
        pi_name="Dr. Elise Navarro",
        researcher_name="Marc Beal",
        bioinformatician_assigned="Lauren Bradford",
        title="Aflatoxin Response Atlas",
        description=(
            "Mock collaboration for UX and config testing based on the AFB1 example set, "
            "covering 2D and 3D hepatocyte exposure scenarios."
        ),
        studies=[
            SeedStudy(
                title="AFB1 2D dose response",
                species=Study.Species.MOUSE,
                celltype="Primary hepatocyte 2D",
                treatment_var="group",
                batch_var="plate",
                metadata_columns=["sample_ID", "sample_name", "group", "dose", "plate", "solvent_control"],
                mappings={"treatment_level_1": "group", "batch": "plate"},
                selected_contrasts=[["1uM_2D", "C_2D"], ["2uM_2D", "C_2D"]],
                platform=Assay.Platform.RNA_SEQ,
                genome_version="mm10",
                quantification_method="raw_counts",
                samples=[
                    SeedSample(
                        sample_id="28_2D_Cont",
                        sample_name="28_2D_Cont",
                        group="C_2D",
                        dose=0,
                        chemical="AfB1",
                        chemical_longname="Aflatoxin B1",
                        description="Solvent control in 2D culture, adapted from mocks/metadata.csv.",
                        solvent_control=True,
                    ),
                    SeedSample(
                        sample_id="29_2D_Low",
                        sample_name="29_2D_Low",
                        group="1uM_2D",
                        dose=1,
                        chemical="AfB1",
                        chemical_longname="Aflatoxin B1",
                        description="Low-dose 2D exposure, adapted from mocks/metadata.csv.",
                    ),
                    SeedSample(
                        sample_id="24_2D_High",
                        sample_name="24_2D_High",
                        group="2uM_2D",
                        dose=2,
                        chemical="AfB1",
                        chemical_longname="Aflatoxin B1",
                        description="High-dose 2D exposure, adapted from mocks/metadata.csv.",
                    ),
                ],
            ),
            SeedStudy(
                title="AFB1 3D microphysiological culture",
                species=Study.Species.MOUSE,
                celltype="Primary hepatocyte 3D",
                treatment_var="group",
                batch_var="chip_batch",
                metadata_columns=["sample_ID", "sample_name", "group", "dose", "chip_batch", "solvent_control"],
                mappings={"treatment_level_1": "group", "batch": "chip_batch"},
                selected_contrasts=[["1uM_3D", "C_3D"], ["2uM_3D", "C_3D"]],
                platform=Assay.Platform.RNA_SEQ,
                genome_version="mm10",
                quantification_method="raw_counts",
                samples=[
                    SeedSample(
                        sample_id="31_3D_Cont",
                        sample_name="31_3D_Cont",
                        group="C_3D",
                        dose=0,
                        chemical="AfB1",
                        chemical_longname="Aflatoxin B1",
                        description="Solvent control in 3D culture, adapted from mocks/metadata.csv.",
                        solvent_control=True,
                    ),
                    SeedSample(
                        sample_id="38_3D_Low",
                        sample_name="38_3D_Low",
                        group="1uM_3D",
                        dose=1,
                        chemical="AfB1",
                        chemical_longname="Aflatoxin B1",
                        description="Low-dose 3D exposure, adapted from mocks/metadata.csv.",
                    ),
                    SeedSample(
                        sample_id="42_3D_High",
                        sample_name="42_3D_High",
                        group="2uM_3D",
                        dose=2,
                        chemical="AfB1",
                        chemical_longname="Aflatoxin B1",
                        description="High-dose 3D exposure, adapted from mocks/metadata.csv.",
                    ),
                ],
            ),
            SeedStudy(
                title="AFB1 format comparison bridge",
                species=Study.Species.MOUSE,
                celltype="Hepatocyte format bridge",
                treatment_var="culture_type",
                batch_var="animal_cohort",
                metadata_columns=["sample_ID", "sample_name", "group", "dose", "animal_cohort", "solvent_control"],
                mappings={"treatment_level_1": "group", "batch": "animal_cohort"},
                selected_contrasts=[["C_3D", "C_2D"]],
                platform=Assay.Platform.RNA_SEQ,
                genome_version="mm10",
                quantification_method="raw_counts",
                samples=[
                    SeedSample(
                        sample_id="19_2D_Cont",
                        sample_name="19_2D_Cont",
                        group="C_2D",
                        dose=0,
                        chemical="AfB1",
                        chemical_longname="Aflatoxin B1",
                        description="2D control used for format-comparison QA.",
                        solvent_control=True,
                    ),
                    SeedSample(
                        sample_id="10_3D_Cont",
                        sample_name="10_3D_Cont",
                        group="C_3D",
                        dose=0,
                        chemical="AfB1",
                        chemical_longname="Aflatoxin B1",
                        description="3D control used for format-comparison QA.",
                    ),
                    SeedSample(
                        sample_id="36_3D_High",
                        sample_name="36_3D_High",
                        group="2uM_3D",
                        dose=2,
                        chemical="AfB1",
                        chemical_longname="Aflatoxin B1",
                        description="High-dose 3D anchor sample for comparison workflows.",
                    ),
                ],
            ),
        ],
    ),
    SeedProject(
        owner_username="admin",
        pi_name="Dr. Priya Shah",
        researcher_name="Noah Campbell",
        bioinformatician_assigned="Lauren Bradford",
        title="Endocrine Resilience Screen",
        description=(
            "Mock collaboration for study browsing and role-based review, focused on endocrine-active "
            "compound screening across human breast-cell models."
        ),
        studies=[
            SeedStudy(
                title="MCF-7 estrogen pulse",
                species=Study.Species.HUMAN,
                celltype="MCF-7",
                treatment_var="group",
                batch_var="plate",
                metadata_columns=["sample_ID", "sample_name", "group", "dose", "plate", "solvent_control"],
                mappings={"treatment_level_1": "group", "batch": "plate"},
                selected_contrasts=[["estradiol", "vehicle"], ["bpa_low", "vehicle"]],
                platform=Assay.Platform.RNA_SEQ,
                genome_version="hg38",
                quantification_method="raw_counts",
                samples=[
                    SeedSample(
                        sample_id="mcf7_vehicle_a",
                        sample_name="MCF7 vehicle A",
                        group="vehicle",
                        dose=0,
                        chemical="DMSO",
                        chemical_longname="Dimethyl sulfoxide",
                        description="Vehicle control for MCF-7 estrogen pulse.",
                        solvent_control=True,
                    ),
                    SeedSample(
                        sample_id="mcf7_e2_a",
                        sample_name="MCF7 estradiol A",
                        group="estradiol",
                        dose=0.01,
                        chemical="E2",
                        chemical_longname="17beta-estradiol",
                        description="Positive-control estrogenic response sample.",
                    ),
                    SeedSample(
                        sample_id="mcf7_bpa_a",
                        sample_name="MCF7 BPA A",
                        group="bpa_low",
                        dose=1,
                        chemical="BPA",
                        chemical_longname="Bisphenol A",
                        description="Low-dose BPA screening sample.",
                    ),
                ],
            ),
            SeedStudy(
                title="T47D receptor recovery",
                species=Study.Species.HUMAN,
                celltype="T47D",
                treatment_var="group",
                batch_var="operator",
                metadata_columns=["sample_ID", "sample_name", "group", "dose", "operator", "solvent_control"],
                mappings={"treatment_level_1": "group", "batch": "operator"},
                selected_contrasts=[["estradiol", "vehicle"], ["tamoxifen", "vehicle"]],
                platform=Assay.Platform.RNA_SEQ,
                genome_version="hg38",
                quantification_method="raw_counts",
                samples=[
                    SeedSample(
                        sample_id="t47d_vehicle_a",
                        sample_name="T47D vehicle A",
                        group="vehicle",
                        dose=0,
                        chemical="DMSO",
                        chemical_longname="Dimethyl sulfoxide",
                        description="Vehicle control for T47D recovery study.",
                        solvent_control=True,
                    ),
                    SeedSample(
                        sample_id="t47d_e2_a",
                        sample_name="T47D estradiol A",
                        group="estradiol",
                        dose=0.01,
                        chemical="E2",
                        chemical_longname="17beta-estradiol",
                        description="Estradiol challenge sample for T47D cells.",
                    ),
                    SeedSample(
                        sample_id="t47d_tam_a",
                        sample_name="T47D tamoxifen A",
                        group="tamoxifen",
                        dose=0.5,
                        chemical="TAM",
                        chemical_longname="Tamoxifen",
                        description="Antagonist treatment sample for T47D cells.",
                    ),
                ],
            ),
            SeedStudy(
                title="ZR-75 stress comparator",
                species=Study.Species.HUMAN,
                celltype="ZR-75-1",
                treatment_var="group",
                batch_var="run_day",
                metadata_columns=["sample_ID", "sample_name", "group", "dose", "run_day", "solvent_control"],
                mappings={"treatment_level_1": "group", "batch": "run_day"},
                selected_contrasts=[["estradiol", "vehicle"], ["genistein", "vehicle"]],
                platform=Assay.Platform.RNA_SEQ,
                genome_version="hg38",
                quantification_method="raw_counts",
                samples=[
                    SeedSample(
                        sample_id="zr75_vehicle_a",
                        sample_name="ZR75 vehicle A",
                        group="vehicle",
                        dose=0,
                        chemical="DMSO",
                        chemical_longname="Dimethyl sulfoxide",
                        description="Vehicle control for ZR-75 stress comparator.",
                        solvent_control=True,
                    ),
                    SeedSample(
                        sample_id="zr75_e2_a",
                        sample_name="ZR75 estradiol A",
                        group="estradiol",
                        dose=0.01,
                        chemical="E2",
                        chemical_longname="17beta-estradiol",
                        description="Estradiol-treated ZR-75 sample.",
                    ),
                    SeedSample(
                        sample_id="zr75_gen_a",
                        sample_name="ZR75 genistein A",
                        group="genistein",
                        dose=2,
                        chemical="GEN",
                        chemical_longname="Genistein",
                        description="Phytoestrogen-treated ZR-75 sample.",
                    ),
                ],
            ),
        ],
    ),
]


def ensure_seed_users() -> dict[str, User]:
    seeded_users: dict[str, tuple[str, bool, str]] = {
        "admin": ("admin123", True, UserProfile.Role.ADMIN),
        "client": ("client123", False, UserProfile.Role.CLIENT),
    }
    users: dict[str, User] = {}
    for username, (password, is_staff, role) in seeded_users.items():
        user, created = User.objects.get_or_create(username=username, defaults={"is_staff": is_staff})
        if created or not user.check_password(password):
            user.set_password(password)
        user.is_staff = is_staff
        user.save()

        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.role = role
        profile.save()
        users[username] = user
    return users


@transaction.atomic
def reset_seed_data() -> dict[str, int]:
    users = ensure_seed_users()

    Project.objects.all().delete()

    project_count = 0
    study_count = 0
    sample_count = 0
    assay_count = 0

    for seed_project in SEED_PROJECTS:
        project = Project.objects.create(
            owner=users[seed_project.owner_username],
            pi_name=seed_project.pi_name,
            researcher_name=seed_project.researcher_name,
            bioinformatician_assigned=seed_project.bioinformatician_assigned,
            title=seed_project.title,
            description=seed_project.description,
        )
        project_count += 1

        for seed_study in seed_project.studies:
            study = Study.objects.create(
                project=project,
                title=seed_study.title,
                species=seed_study.species,
                celltype=seed_study.celltype,
                treatment_var=seed_study.treatment_var,
                batch_var=seed_study.batch_var,
            )
            study_count += 1

            StudyOnboardingState.objects.create(
                study=study,
                status=StudyOnboardingState.Status.FINAL,
                metadata_columns=seed_study.metadata_columns,
                mappings=seed_study.mappings,
                suggested_contrasts=seed_study.selected_contrasts,
                selected_contrasts=seed_study.selected_contrasts,
            )

            for seed_sample in seed_study.samples:
                sample = Sample.objects.create(
                    study=study,
                    sample_ID=seed_sample.sample_id,
                    sample_name=seed_sample.sample_name,
                    description=seed_sample.description,
                    group=seed_sample.group,
                    chemical=seed_sample.chemical,
                    chemical_longname=seed_sample.chemical_longname,
                    dose=seed_sample.dose,
                    technical_control=seed_sample.technical_control,
                    reference_rna=seed_sample.reference_rna,
                    solvent_control=seed_sample.solvent_control,
                )
                sample_count += 1

                Assay.objects.create(
                    sample=sample,
                    platform=seed_study.platform,
                    genome_version=seed_study.genome_version,
                    quantification_method=seed_study.quantification_method,
                )
                assay_count += 1

    return {
        "projects": project_count,
        "studies": study_count,
        "samples": sample_count,
        "assays": assay_count,
    }
