from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import transaction

from chemicals.models import ChemicalSample
from profiling.models import (
    HTTrSeriesWell,
    HTTrWell,
    ImportBatch,
    ImportBatchResource,
    Metric,
    Pod,
    ProfilingPlatform,
    Series,
    StudyDataResource,
    StudyWarehouseMetadata,
)

from .models import (
    Assay,
    ControlledLookupValue,
    MetadataFieldDefinition,
    Project,
    Sample,
    Study,
    StudyConfig,
    StudyMetadataFieldSelection,
    StudyMetadataMapping,
    StudyOnboardingState,
    UserProfile,
    default_study_config,
)
from .onboarding_options import (
    ALL_INSTRUMENT_MODELS,
    BIOSPYDER_KIT_VALUES,
    PLATFORM_VALUES,
    SEQUENCED_BY_VALUES,
)

User = get_user_model()
DEFAULT_SEED_INSTRUMENT_MODEL = "Illumina NovaSeq 6000"
DEFAULT_SEED_SEQUENCED_BY = "HC Genomics lab"
SEED_REPLICATE_SUFFIXES = ("a", "b", "c")


@dataclass(frozen=True)
class SeedSample:
    sample_id: str
    sample_name: str
    group: str
    dose: float | None
    chemical: str
    chemical_longname: str
    description: str
    solvent_control: bool = False
    technical_control: bool = False
    reference_rna: bool = False
    metadata: dict[str, object] = field(default_factory=dict)


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
    instrument_model: str = DEFAULT_SEED_INSTRUMENT_MODEL
    sequenced_by: str = DEFAULT_SEED_SEQUENCED_BY
    onboarding_status: str = StudyOnboardingState.Status.FINAL


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
        title="Aflatoxin Response Study",
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
                onboarding_status=StudyOnboardingState.Status.DRAFT,
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
                treatment_var="timepoint",
                batch_var="run_day",
                metadata_columns=["sample_ID", "sample_name", "group", "timepoint", "run_day", "solvent_control"],
                mappings={"treatment_level_1": "timepoint", "treatment_level_2": "group", "batch": "run_day"},
                selected_contrasts=[["24h", "0h"], ["48h", "0h"]],
                platform=Assay.Platform.RNA_SEQ,
                genome_version="hg38",
                quantification_method="raw_counts",
                samples=[
                    SeedSample(
                        sample_id="zr75_vehicle_a",
                        sample_name="ZR75 vehicle A",
                        group="vehicle",
                        dose=None,
                        chemical="DMSO",
                        chemical_longname="Dimethyl sulfoxide",
                        description="Vehicle control for ZR-75 stress comparator.",
                        solvent_control=True,
                        metadata={"timepoint": "0h"},
                    ),
                    SeedSample(
                        sample_id="zr75_e2_a",
                        sample_name="ZR75 estradiol A",
                        group="estradiol",
                        dose=None,
                        chemical="E2",
                        chemical_longname="17beta-estradiol",
                        description="Estradiol-treated ZR-75 sample.",
                        metadata={"timepoint": "24h"},
                    ),
                    SeedSample(
                        sample_id="zr75_gen_a",
                        sample_name="ZR75 genistein A",
                        group="genistein",
                        dose=None,
                        chemical="GEN",
                        chemical_longname="Genistein",
                        description="Phytoestrogen-treated ZR-75 sample.",
                        metadata={"timepoint": "48h"},
                    ),
                ],
            ),
        ],
    ),
    SeedProject(
        owner_username="client",
        pi_name="Dr. Miriam Okafor",
        researcher_name="Leah Kim",
        bioinformatician_assigned="Andre Dubois",
        title="Pulmonary Stress Sentinel",
        description=(
            "Mock collaboration covering airway and alveolar models for inhalation-toxicology QA, "
            "with a mix of acute and recovery-focused transcriptomics studies."
        ),
        studies=[
            SeedStudy(
                title="BEAS-2B ozone pulse",
                species=Study.Species.HUMAN,
                celltype="BEAS-2B",
                treatment_var="group",
                batch_var="exposure_chamber",
                metadata_columns=[
                    "sample_ID",
                    "sample_name",
                    "group",
                    "dose",
                    "exposure_chamber",
                    "solvent_control",
                ],
                mappings={"treatment_level_1": "group", "batch": "exposure_chamber"},
                selected_contrasts=[["ozone_high", "air_control"], ["ozone_low", "air_control"]],
                platform=Assay.Platform.RNA_SEQ,
                genome_version="hg38",
                quantification_method="raw_counts",
                samples=[
                    SeedSample(
                        sample_id="beas_air_a",
                        sample_name="BEAS air A",
                        group="air_control",
                        dose=0,
                        chemical="Air",
                        chemical_longname="Filtered air control",
                        description="Air-only chamber control for BEAS-2B ozone pulse.",
                        solvent_control=True,
                    ),
                    SeedSample(
                        sample_id="beas_ozone_low_a",
                        sample_name="BEAS ozone low A",
                        group="ozone_low",
                        dose=0.1,
                        chemical="O3",
                        chemical_longname="Ozone",
                        description="Low ozone pulse in BEAS-2B cells.",
                    ),
                    SeedSample(
                        sample_id="beas_ozone_high_a",
                        sample_name="BEAS ozone high A",
                        group="ozone_high",
                        dose=0.3,
                        chemical="O3",
                        chemical_longname="Ozone",
                        description="High ozone pulse in BEAS-2B cells.",
                    ),
                ],
            ),
            SeedStudy(
                title="A549 particulate recovery",
                species=Study.Species.HUMAN,
                celltype="A549",
                treatment_var="group",
                batch_var="operator",
                metadata_columns=["sample_ID", "sample_name", "group", "dose", "operator", "solvent_control"],
                mappings={"treatment_level_1": "group", "batch": "operator"},
                selected_contrasts=[["pm_recovery", "vehicle"], ["pm_peak", "vehicle"]],
                platform=Assay.Platform.RNA_SEQ,
                genome_version="hg38",
                quantification_method="raw_counts",
                samples=[
                    SeedSample(
                        sample_id="a549_vehicle_a",
                        sample_name="A549 vehicle A",
                        group="vehicle",
                        dose=0,
                        chemical="PBS",
                        chemical_longname="Phosphate-buffered saline",
                        description="Vehicle control for particulate recovery study.",
                        solvent_control=True,
                    ),
                    SeedSample(
                        sample_id="a549_pm_peak_a",
                        sample_name="A549 PM peak A",
                        group="pm_peak",
                        dose=5,
                        chemical="PM2.5",
                        chemical_longname="Fine particulate matter",
                        description="Acute peak-response particulate exposure.",
                    ),
                    SeedSample(
                        sample_id="a549_pm_recovery_a",
                        sample_name="A549 PM recovery A",
                        group="pm_recovery",
                        dose=5,
                        chemical="PM2.5",
                        chemical_longname="Fine particulate matter",
                        description="Recovery-phase particulate exposure sample.",
                    ),
                ],
            ),
            SeedStudy(
                title="Calu-3 barrier resilience",
                species=Study.Species.HUMAN,
                celltype="Calu-3",
                treatment_var="group",
                batch_var="insert_batch",
                metadata_columns=["sample_ID", "sample_name", "group", "dose", "insert_batch", "solvent_control"],
                mappings={"treatment_level_1": "group", "batch": "insert_batch"},
                selected_contrasts=[["diesel_extract", "vehicle"], ["cigarette_smoke", "vehicle"]],
                platform=Assay.Platform.RNA_SEQ,
                genome_version="hg38",
                quantification_method="raw_counts",
                samples=[
                    SeedSample(
                        sample_id="calu3_vehicle_a",
                        sample_name="Calu3 vehicle A",
                        group="vehicle",
                        dose=0,
                        chemical="Media",
                        chemical_longname="Culture media control",
                        description="Air-liquid interface control sample.",
                        solvent_control=True,
                    ),
                    SeedSample(
                        sample_id="calu3_diesel_a",
                        sample_name="Calu3 diesel A",
                        group="diesel_extract",
                        dose=2,
                        chemical="DEE",
                        chemical_longname="Diesel exhaust extract",
                        description="Diesel exhaust extract challenge sample.",
                    ),
                    SeedSample(
                        sample_id="calu3_smoke_a",
                        sample_name="Calu3 smoke A",
                        group="cigarette_smoke",
                        dose=1,
                        chemical="CSE",
                        chemical_longname="Cigarette smoke extract",
                        description="Cigarette smoke extract challenge sample.",
                    ),
                ],
            ),
        ],
    ),
    SeedProject(
        owner_username="admin",
        pi_name="Dr. Hannah Wu",
        researcher_name="Owen Fisher",
        bioinformatician_assigned="Andre Dubois",
        title="Neuroinflammation Reference Panel",
        description=(
            "Mock collaboration focused on glial activation and neuronal stress-response comparisons, "
            "useful for QA across time-course and multi-condition study setups."
        ),
        studies=[
            SeedStudy(
                title="Microglia LPS cascade",
                species=Study.Species.MOUSE,
                celltype="BV2 microglia",
                treatment_var="group",
                batch_var="harvest_day",
                metadata_columns=["sample_ID", "sample_name", "group", "dose", "harvest_day", "solvent_control"],
                mappings={"treatment_level_1": "group", "batch": "harvest_day"},
                selected_contrasts=[["lps_high", "vehicle"], ["lps_low", "vehicle"]],
                platform=Assay.Platform.RNA_SEQ,
                genome_version="mm10",
                quantification_method="raw_counts",
                samples=[
                    SeedSample(
                        sample_id="bv2_vehicle_a",
                        sample_name="BV2 vehicle A",
                        group="vehicle",
                        dose=0,
                        chemical="PBS",
                        chemical_longname="Phosphate-buffered saline",
                        description="Vehicle control for BV2 LPS cascade study.",
                        solvent_control=True,
                    ),
                    SeedSample(
                        sample_id="bv2_lps_low_a",
                        sample_name="BV2 LPS low A",
                        group="lps_low",
                        dose=10,
                        chemical="LPS",
                        chemical_longname="Lipopolysaccharide",
                        description="Low LPS challenge in microglia.",
                    ),
                    SeedSample(
                        sample_id="bv2_lps_high_a",
                        sample_name="BV2 LPS high A",
                        group="lps_high",
                        dose=100,
                        chemical="LPS",
                        chemical_longname="Lipopolysaccharide",
                        description="High LPS challenge in microglia.",
                    ),
                ],
            ),
            SeedStudy(
                title="Astrocyte cytokine relay",
                species=Study.Species.HUMAN,
                celltype="Primary astrocyte",
                treatment_var="group",
                batch_var="donor_batch",
                metadata_columns=["sample_ID", "sample_name", "group", "dose", "donor_batch", "solvent_control"],
                mappings={"treatment_level_1": "group", "batch": "donor_batch"},
                selected_contrasts=[["tnfa_ifng", "vehicle"], ["il1b", "vehicle"]],
                platform=Assay.Platform.RNA_SEQ,
                genome_version="hg38",
                quantification_method="raw_counts",
                samples=[
                    SeedSample(
                        sample_id="astro_vehicle_a",
                        sample_name="Astro vehicle A",
                        group="vehicle",
                        dose=0,
                        chemical="Media",
                        chemical_longname="Culture media control",
                        description="Vehicle control for astrocyte cytokine relay study.",
                        solvent_control=True,
                    ),
                    SeedSample(
                        sample_id="astro_il1b_a",
                        sample_name="Astro IL1B A",
                        group="il1b",
                        dose=5,
                        chemical="IL1B",
                        chemical_longname="Interleukin 1 beta",
                        description="IL1B-treated astrocyte sample.",
                    ),
                    SeedSample(
                        sample_id="astro_tnfa_ifng_a",
                        sample_name="Astro TNFA IFNG A",
                        group="tnfa_ifng",
                        dose=10,
                        chemical="TNFA_IFNG",
                        chemical_longname="TNF-alpha and IFN-gamma cytokine mix",
                        description="Combined TNFA and IFNG stimulation sample.",
                    ),
                ],
            ),
            SeedStudy(
                title="Cortical neuron oxidative challenge",
                species=Study.Species.RAT,
                celltype="Primary cortical neuron",
                treatment_var="group",
                batch_var="prep_batch",
                metadata_columns=["sample_ID", "sample_name", "group", "dose", "prep_batch", "solvent_control"],
                mappings={"treatment_level_1": "group", "batch": "prep_batch"},
                selected_contrasts=[["h2o2_high", "vehicle"], ["h2o2_low", "vehicle"]],
                platform=Assay.Platform.RNA_SEQ,
                genome_version="rn6",
                quantification_method="raw_counts",
                samples=[
                    SeedSample(
                        sample_id="neuron_vehicle_a",
                        sample_name="Neuron vehicle A",
                        group="vehicle",
                        dose=0,
                        chemical="Media",
                        chemical_longname="Culture media control",
                        description="Vehicle control for oxidative challenge study.",
                        solvent_control=True,
                    ),
                    SeedSample(
                        sample_id="neuron_h2o2_low_a",
                        sample_name="Neuron H2O2 low A",
                        group="h2o2_low",
                        dose=25,
                        chemical="H2O2",
                        chemical_longname="Hydrogen peroxide",
                        description="Low oxidative-stress challenge sample.",
                    ),
                    SeedSample(
                        sample_id="neuron_h2o2_high_a",
                        sample_name="Neuron H2O2 high A",
                        group="h2o2_high",
                        dose=100,
                        chemical="H2O2",
                        chemical_longname="Hydrogen peroxide",
                        description="High oxidative-stress challenge sample.",
                    ),
                ],
            ),
        ],
    ),
]


def _infer_field_type(key: str):
    if key in {"technical_control", "reference_rna", "solvent_control"}:
        return MetadataFieldDefinition.DataType.BOOLEAN
    if key in {"dose", "concentration", "timepoint"}:
        return MetadataFieldDefinition.DataType.FLOAT if key in {"dose", "concentration"} else MetadataFieldDefinition.DataType.STRING
    return MetadataFieldDefinition.DataType.STRING


def _ensure_metadata_field_definition(key: str) -> MetadataFieldDefinition:
    sequencing_keys = {"i5_index", "i7_index", "well_id"}
    defaults = {
        "label": key.replace("_", " ").title(),
        "group": (
            "Core"
            if key in {"sample_ID", "sample_name", "technical_control", "reference_rna", "solvent_control"}
            else "Sequencing"
            if key in sequencing_keys
            else "Study design"
        ),
        "description": f"Seeded metadata field for {key}.",
        "scope": MetadataFieldDefinition.Scope.SAMPLE,
        "system_key": key,
        "data_type": _infer_field_type(key),
        "kind": MetadataFieldDefinition.Kind.STANDARD,
        "required": key in {"sample_ID", "technical_control", "reference_rna", "solvent_control"},
        "is_core": key in {"sample_ID", "technical_control", "reference_rna", "solvent_control"},
        "allow_null": key not in {"sample_ID", "technical_control", "reference_rna", "solvent_control"},
    }
    if key == "concentration":
        defaults["description"] = "Select for in vitro experiments."
    if key == "dose":
        defaults["description"] = "Select for in vivo experiments."
    if key == "sample_ID":
        defaults["regex"] = r"^[a-zA-Z0-9-_]*$"
    definition, _ = MetadataFieldDefinition.objects.update_or_create(key=key, defaults=defaults)
    return definition


def _seed_controlled_lookups() -> None:
    ControlledLookupValue.objects.filter(
        category__in=[
            ControlledLookupValue.Category.PLATFORM,
            ControlledLookupValue.Category.INSTRUMENT_MODEL,
            ControlledLookupValue.Category.BIOSPYDER_KIT,
            ControlledLookupValue.Category.SEQUENCED_BY,
        ]
    ).delete()

    ControlledLookupValue.objects.bulk_create(
        [
            *[
                ControlledLookupValue(category=ControlledLookupValue.Category.PLATFORM, value=value)
                for value in PLATFORM_VALUES
            ],
            *[
                ControlledLookupValue(category=ControlledLookupValue.Category.INSTRUMENT_MODEL, value=value)
                for value in ALL_INSTRUMENT_MODELS
            ],
            *[
                ControlledLookupValue(category=ControlledLookupValue.Category.BIOSPYDER_KIT, value=value)
                for value in BIOSPYDER_KIT_VALUES
            ],
            *[
                ControlledLookupValue(category=ControlledLookupValue.Category.SEQUENCED_BY, value=value)
                for value in SEQUENCED_BY_VALUES
            ],
        ]
    )


def _rnaseq_platform_name_for_genome(genome_version: str) -> str:
    if genome_version == "mm10":
        return "rnaseq_mm10_demo"
    if genome_version == "rn6":
        return "rnaseq_rn6_demo"
    return "rnaseq_hg38_demo"


BIOSPYDER_PLATFORM_SEEDS: tuple[dict[str, object], ...] = (
    {
        "platform_name": "humanWT2_1_brAtten",
        "title": "TempO-seq Human WT v2.1, Broad Attenuation",
        "version": "2.1",
        "biospyder_kit": "hwt2-1",
        "species": Study.Species.HUMAN,
        "probe_set": "whole_transcriptome",
    },
    {
        "platform_name": "humanWT2_0_brAtten",
        "title": "TempO-seq Human WT v2.0, Broad Attenuation",
        "version": "2.0",
        "biospyder_kit": "hwt2-0",
        "species": Study.Species.HUMAN,
        "probe_set": "whole_transcriptome",
    },
    {
        "platform_name": "humanS1500_2_0_brAtten",
        "title": "TempO-seq Human S1500+ v2.0, Broad Attenuation",
        "version": "2.0",
        "biospyder_kit": "h1500_2-0",
        "species": Study.Species.HUMAN,
        "probe_set": "s1500_plus",
    },
    {
        "platform_name": "humanS1500_1_2_brAtten",
        "title": "TempO-seq Human S1500+ v1.2, Broad Attenuation",
        "version": "1.2",
        "biospyder_kit": "h1500_1-2",
        "species": Study.Species.HUMAN,
        "probe_set": "s1500_plus",
    },
    {
        "platform_name": "mouseWT1_0_brAtten",
        "title": "TempO-seq Mouse WT v1.0, Broad Attenuation",
        "version": "1.0",
        "biospyder_kit": "mousewt1-0",
        "species": Study.Species.MOUSE,
        "probe_set": "whole_transcriptome",
    },
    {
        "platform_name": "mouseS1500_1_2_brAtten",
        "title": "TempO-seq Mouse S1500+ v1.2, Broad Attenuation",
        "version": "1.2",
        "biospyder_kit": "mouse1500_1-2",
        "species": Study.Species.MOUSE,
        "probe_set": "s1500_plus",
    },
    {
        "platform_name": "zebrafishS1500_brAtten",
        "title": "TempO-seq Zebrafish S1500+, Broad Attenuation",
        "version": "",
        "biospyder_kit": "zebrafish1500",
        "species": None,
        "probe_set": "s1500_plus",
        "organism": "zebrafish",
    },
)


def _seed_study_config(study: Study, seed_study: SeedStudy) -> None:
    config_payload = default_study_config()
    platform_value = "RNA-Seq" if seed_study.platform == Assay.Platform.RNA_SEQ else "TempO-Seq"
    profiling_platform_name = (
        _rnaseq_platform_name_for_genome(seed_study.genome_version)
        if seed_study.platform == Assay.Platform.RNA_SEQ
        else "humanWT2_1_brAtten"
    )
    config_payload["common"].update(
        {
            "platform": platform_value,
            "profiling_platform_name": profiling_platform_name,
            "instrument_model": seed_study.instrument_model,
            "sequenced_by": seed_study.sequenced_by,
            "biospyder_kit": "hwt2-1" if platform_value == "TempO-Seq" else None,
            "celltype": seed_study.celltype,
            "dose": "dose" if "dose" in seed_study.metadata_columns else None,
            "batch_var": seed_study.batch_var or None,
        }
    )
    config_payload["pipeline"].update(
        {
            "genome_filename": f"{seed_study.genome_version}.fa",
            "annotation_filename": f"{seed_study.genome_version}.gtf",
            "genome_name": seed_study.genome_version,
            "mode": "se",
        }
    )
    config_payload["qc"].update(
        {
            "treatment_var": seed_study.mappings.get("treatment_level_1", ""),
            "dendro_color_by": seed_study.mappings.get("treatment_level_1", ""),
        }
    )
    config_payload["deseq2"].update(
        {
            "species": seed_study.species,
            "design": seed_study.mappings.get("treatment_level_1", ""),
            "sortcol": "dose" if "dose" in seed_study.metadata_columns else None,
        }
    )
    StudyConfig.objects.create(study=study, **config_payload)


def ensure_seed_users() -> dict[str, User]:
    seeded_users: dict[str, tuple[str, bool, str]] = {
        "admin": ("admin123", True, UserProfile.Role.ADMIN),
        "client": ("client123", False, UserProfile.Role.CLIENT),
    }
    users: dict[str, User] = {}
    for username, (password, is_staff, role) in seeded_users.items():
        user, created = User.objects.get_or_create(
            username=username,
            defaults={"is_staff": is_staff, "is_superuser": role == UserProfile.Role.ADMIN},
        )
        if created or not user.check_password(password):
            user.set_password(password)
        user.is_staff = is_staff
        user.is_superuser = role == UserProfile.Role.ADMIN
        user.save()

        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.role = role
        profile.save()
        users[username] = user
    return users


def _build_seed_template_context(seed_study: SeedStudy) -> dict[str, object]:
    metadata_columns = set(seed_study.metadata_columns)
    study_design_elements: list[str] = []

    if "chemical" in metadata_columns:
        study_design_elements.append("chemical")
    if "dose" in metadata_columns or "concentration" in metadata_columns:
        study_design_elements.append("exposure")
    if "timepoint" in metadata_columns:
        study_design_elements.append("timepoint")
    if seed_study.treatment_var:
        study_design_elements.append("treatment")
    if seed_study.batch_var:
        study_design_elements.append("batch")

    exposure_label_mode: str | None = None
    if "dose" in metadata_columns and "concentration" in metadata_columns:
        exposure_label_mode = "both"
    elif "concentration" in metadata_columns:
        exposure_label_mode = "concentration"
    elif "dose" in metadata_columns:
        exposure_label_mode = "dose"

    treatment_level_1 = seed_study.mappings.get("treatment_level_1", "")
    batch = seed_study.mappings.get("batch", "")

    return {
        "study_design_elements": study_design_elements,
        "exposure_label_mode": exposure_label_mode,
        "exposure_custom_label": "",
        "treatment_vars": [treatment_level_1] if treatment_level_1 else ([seed_study.treatment_var] if seed_study.treatment_var else []),
        "batch_vars": [batch] if batch else ([seed_study.batch_var] if seed_study.batch_var else []),
        "optional_field_keys": [],
        "custom_field_keys": [],
    }


def _replace_terminal_suffix(value: str, *, lower_suffix: str, upper_suffix: str) -> str:
    for existing in SEED_REPLICATE_SUFFIXES:
        if value.lower().endswith(f"_{existing}"):
            return f"{value[:-2]}_{lower_suffix}"
        if value.endswith(f" {existing.upper()}"):
            return f"{value[:-2]} {upper_suffix}"
    return f"{value}_{lower_suffix}" if "_" in value else f"{value} {upper_suffix}"


def _seed_batch_value(column: str, replicate_number: int) -> str:
    special_values = {
        "plate": f"P{replicate_number}",
        "chip_batch": f"chip-{replicate_number}",
        "animal_cohort": f"cohort-{replicate_number}",
        "operator": f"operator-{replicate_number}",
        "run_day": f"day-{replicate_number}",
        "exposure_chamber": f"chamber-{replicate_number}",
        "insert_batch": f"insert-{replicate_number}",
        "harvest_day": f"harvest-{replicate_number}",
        "donor_batch": f"donor-{replicate_number}",
        "prep_batch": f"prep-{replicate_number}",
    }
    return special_values.get(column, f"{column}-{replicate_number}")


def _expand_seed_samples(seed_study: SeedStudy) -> list[SeedSample]:
    expanded: list[SeedSample] = []
    for template_sample in seed_study.samples:
        for replicate_number, replicate_suffix in enumerate(SEED_REPLICATE_SUFFIXES, start=1):
            metadata = dict(template_sample.metadata)
            if (
                seed_study.batch_var
                and seed_study.batch_var in seed_study.metadata_columns
                and seed_study.batch_var not in metadata
            ):
                metadata[seed_study.batch_var] = _seed_batch_value(seed_study.batch_var, replicate_number)

            expanded.append(
                SeedSample(
                    sample_id=_replace_terminal_suffix(
                        template_sample.sample_id,
                        lower_suffix=replicate_suffix,
                        upper_suffix=replicate_suffix.upper(),
                    ),
                    sample_name=_replace_terminal_suffix(
                        template_sample.sample_name,
                        lower_suffix=replicate_suffix,
                        upper_suffix=replicate_suffix.upper(),
                    ),
                    group=template_sample.group,
                    dose=template_sample.dose,
                    chemical=template_sample.chemical,
                    chemical_longname=template_sample.chemical_longname,
                    description=f"{template_sample.description} Replicate {replicate_suffix.upper()}.",
                    solvent_control=template_sample.solvent_control,
                    technical_control=template_sample.technical_control,
                    reference_rna=template_sample.reference_rna,
                    metadata=metadata,
                )
            )
    return expanded


def _seed_warehouse_demo(study: Study) -> None:
    chemical_sample = ChemicalSample.objects.create(
        chemical_sample_id="HC-AFB1-DEMO-001",
        spid="HC-AFB1-DEMO-BOTTLE-1",
        dtxsid="DTXSID7020005",
        casrn="1162-65-8",
        preferred_name="Aflatoxin B1",
        ext={"source_note": "Seeded warehouse demo chemical sample."},
    )
    rnaseq_platform = ProfilingPlatform.objects.create(
        platform_name="rnaseq_hg38_demo",
        title="RNA-seq hg38 demonstration platform",
        description="Seeded profiling platform for admin schema exploration.",
        version="demo-1",
        technology_type=ProfilingPlatform.TechnologyType.RNA_SEQ,
        study_type=ProfilingPlatform.StudyType.TGX,
        species=Study.Species.HUMAN,
    )
    ProfilingPlatform.objects.create(
        platform_name="rnaseq_mm10_demo",
        title="RNA-seq mm10 demonstration platform",
        description="Seeded mouse RNA-seq platform for admin schema exploration.",
        version="demo-1",
        technology_type=ProfilingPlatform.TechnologyType.RNA_SEQ,
        study_type=ProfilingPlatform.StudyType.TGX,
        species=Study.Species.MOUSE,
    )
    ProfilingPlatform.objects.create(
        platform_name="rnaseq_rn6_demo",
        title="RNA-seq rn6 demonstration platform",
        description="Seeded rat RNA-seq platform for admin schema exploration.",
        version="demo-1",
        technology_type=ProfilingPlatform.TechnologyType.RNA_SEQ,
        study_type=ProfilingPlatform.StudyType.TGX,
        species=Study.Species.RAT,
    )
    for platform_seed in BIOSPYDER_PLATFORM_SEEDS:
        ext = {
            "biospyder_kit": platform_seed["biospyder_kit"],
            "attenuation": "broad",
            "probe_set": platform_seed["probe_set"],
            "source_note": "Seeded to keep canonical profiling platforms aligned with operational TempO-Seq lookups.",
        }
        organism = platform_seed.get("organism")
        if organism:
            ext["organism"] = organism

        ProfilingPlatform.objects.create(
            platform_name=str(platform_seed["platform_name"]),
            title=str(platform_seed["title"]),
            description="Seeded TempO-seq platform record representing a concrete BioSpyder probe-set and attenuation combination.",
            version=str(platform_seed["version"]),
            technology_type=ProfilingPlatform.TechnologyType.TEMPO_SEQ,
            study_type=ProfilingPlatform.StudyType.HTTR,
            species=platform_seed["species"],
            ext=ext,
        )
    ProfilingPlatform.objects.create(
        platform_name="drugseq_s1500_demo",
        title="DrugSeq S1500+ demonstration platform",
        description="Seeded DrugSeq platform record representing a canonical targeted transcriptomics feature set.",
        version="demo-1",
        technology_type=ProfilingPlatform.TechnologyType.DRUG_SEQ,
        study_type=ProfilingPlatform.StudyType.HTTR,
        species=Study.Species.HUMAN,
        ext={"source_note": "Seeded to keep canonical profiling platforms aligned with operational DrugSeq lookups."},
    )
    warehouse_metadata = StudyWarehouseMetadata.objects.create(
        study=study,
        study_name="hc_afb1_warehouse_demo",
        source="Health Canada",
        study_type=StudyWarehouseMetadata.StudyType.TGX,
        in_vitro=True,
        platform=rnaseq_platform,
        cell_types=[study.celltype or "MCF-7"],
        culture_conditions=["standard seeded demo culture"],
        exposure_conditions=["24h exposure"],
        references=["demo:tgx-portal-schema-harmonization"],
        ext={"source_note": "Seeded from reset_seed_data for backend schema exploration."},
    )
    series = Series.objects.create(
        study_metadata=warehouse_metadata,
        chemical_sample=chemical_sample,
        treatment_condition="24h",
        exposure_lower=Decimal("0.01"),
        exposure_upper=Decimal("1.00"),
        exposure_unit="uM",
        exposure_group_count=3,
        exposure_values=[0.01, 0.1, 1.0],
        control_type="DMSO",
        factors=["plate_id"],
    )
    metric = Metric.objects.create(
        metric_name="demo_global_tpod",
        title="Demonstration global tPOD",
        description="Seeded POD metric used to make the warehouse schema visible in Django admin.",
        software_name="tgx-portal",
        software_version="demo",
    )
    Pod.objects.create(
        series=series,
        metric=metric,
        pod=Decimal("0.42"),
        active=True,
        ext={"interpretation": "Demonstration value only."},
    )
    well = HTTrWell.objects.create(
        study_metadata=warehouse_metadata,
        biosample_name="demo_plate_A01",
        plate_id="demo_plate_1",
        well_row=HTTrWell.WellRow.A,
        well_column=1,
        cell_type=study.celltype or "MCF-7",
        treatment_name="AFB1_0.1uM",
        treatment_condition="24h",
        chemical_sample=chemical_sample,
        exposure_time_h=24,
        exposure_concentration=Decimal("0.10"),
        exposure_vehicle="DMSO",
        is_treated=True,
    )
    HTTrSeriesWell.objects.create(series=series, well=well, dose_level=1)
    metadata_manifest = StudyDataResource.objects.create(
        study_metadata=warehouse_metadata,
        resource_type=StudyDataResource.ResourceType.MANIFEST,
        storage_kind=StudyDataResource.StorageKind.LOCAL_PATH,
        display_name="Seeded warehouse metadata manifest",
        uri="/data/demo/hc_afb1_warehouse_demo/manifest.csv",
        description="Demonstration pointer for the historical import manifest used to seed the warehouse demo.",
        file_format="csv",
        availability_status=StudyDataResource.AvailabilityStatus.AVAILABLE,
        version="demo-1",
        ext={"source_note": "Seeded resource pointer; file contents are not stored in PostgreSQL."},
    )
    feature_resource = StudyDataResource.objects.create(
        study_metadata=warehouse_metadata,
        resource_type=StudyDataResource.ResourceType.FEATURE,
        storage_kind=StudyDataResource.StorageKind.LOCAL_PATH,
        display_name="Seeded feature matrix",
        uri="/data/demo/hc_afb1_warehouse_demo/features.parquet",
        description="Demonstration pointer for a feature-level matrix that would remain outside the portal database.",
        file_format="parquet",
        availability_status=StudyDataResource.AvailabilityStatus.AVAILABLE,
        version="demo-1",
    )
    import_batch = ImportBatch.objects.create(
        study_metadata=warehouse_metadata,
        source_system="reset_seed_data",
        source_name="Seeded warehouse provenance demo",
        status=ImportBatch.Status.COMPLETED,
        records_seen=2,
        records_created=2,
        records_updated=0,
        records_rejected=0,
        notes="Demonstrates how source resources are linked to a warehouse import batch.",
    )
    ImportBatchResource.objects.create(
        import_batch=import_batch,
        data_resource=metadata_manifest,
        role=ImportBatchResource.ResourceRole.INPUT,
    )
    ImportBatchResource.objects.create(
        import_batch=import_batch,
        data_resource=feature_resource,
        role=ImportBatchResource.ResourceRole.OUTPUT,
    )


@transaction.atomic
def reset_seed_data() -> dict[str, int]:
    users = ensure_seed_users()

    Project.objects.all().delete()
    ChemicalSample.objects.all().delete()
    ProfilingPlatform.objects.all().delete()
    Metric.objects.all().delete()
    _seed_controlled_lookups()

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
                status=Study.Status.ACTIVE,
                species=seed_study.species,
                celltype=seed_study.celltype,
                treatment_var=seed_study.treatment_var,
                batch_var=seed_study.batch_var,
            )
            study_count += 1

            selections: list[StudyMetadataFieldSelection] = []
            for order, key in enumerate(seed_study.metadata_columns):
                definition = _ensure_metadata_field_definition(key)
                selections.append(
                    StudyMetadataFieldSelection(
                        study=study,
                        field_definition=definition,
                        required=definition.is_core or definition.required,
                        sort_order=order,
                        is_active=True,
                    )
                )
            StudyMetadataFieldSelection.objects.bulk_create(selections)

            StudyMetadataMapping.objects.create(
                study=study,
                treatment_level_1=seed_study.mappings.get("treatment_level_1", ""),
                treatment_level_2=seed_study.mappings.get("treatment_level_2", ""),
                treatment_level_3=seed_study.mappings.get("treatment_level_3", ""),
                treatment_level_4=seed_study.mappings.get("treatment_level_4", ""),
                treatment_level_5=seed_study.mappings.get("treatment_level_5", ""),
                batch=seed_study.mappings.get("batch", ""),
                pca_color=seed_study.mappings.get("pca_color", ""),
                pca_shape=seed_study.mappings.get("pca_shape", ""),
                pca_alpha=seed_study.mappings.get("pca_alpha", ""),
                clustering_group=seed_study.mappings.get("clustering_group", ""),
                report_faceting_group=seed_study.mappings.get("report_faceting_group", ""),
                selected_contrasts=[
                    {"comparison_group": pair[0], "reference_group": pair[1]}
                    for pair in seed_study.selected_contrasts
                ],
            )
            _seed_study_config(study, seed_study)

            StudyOnboardingState.objects.create(
                study=study,
                status=seed_study.onboarding_status,
                metadata_columns=seed_study.metadata_columns,
                mappings=seed_study.mappings,
                template_context=_build_seed_template_context(seed_study),
                suggested_contrasts=[
                    {"comparison_group": pair[0], "reference_group": pair[1]}
                    for pair in seed_study.selected_contrasts
                ],
                selected_contrasts=[
                    {"comparison_group": pair[0], "reference_group": pair[1]}
                    for pair in seed_study.selected_contrasts
                ],
            )

            for seed_sample in _expand_seed_samples(seed_study):
                sample_metadata = {
                    "group": seed_sample.group,
                    "chemical": seed_sample.chemical,
                    "chemical_longname": seed_sample.chemical_longname,
                    **({"dose": seed_sample.dose} if seed_sample.dose is not None else {}),
                    **seed_sample.metadata,
                }
                sample_metadata = {
                    key: value
                    for key, value in sample_metadata.items()
                    if key in seed_study.metadata_columns
                }
                sample = Sample.objects.create(
                    study=study,
                    sample_ID=seed_sample.sample_id,
                    sample_name=seed_sample.sample_name,
                    description=seed_sample.description,
                    technical_control=seed_sample.technical_control,
                    reference_rna=seed_sample.reference_rna,
                    solvent_control=seed_sample.solvent_control,
                    metadata=sample_metadata,
                )
                sample_count += 1

                Assay.objects.create(
                    sample=sample,
                    platform=seed_study.platform,
                    genome_version=seed_study.genome_version,
                    quantification_method=seed_study.quantification_method,
                )
                assay_count += 1

    _seed_warehouse_demo(Study.objects.get(title="MCF-7 estrogen pulse"))

    return {
        "projects": project_count,
        "studies": study_count,
        "samples": sample_count,
        "assays": assay_count,
    }
