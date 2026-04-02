from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from zipfile import ZIP_DEFLATED, ZipFile

import yaml
from django.utils.text import slugify

from .models import Assay, Project, Sample


class ConfigGenerationError(Exception):
    pass


@dataclass
class ConfigBundle:
    filename: str
    content: bytes


def _build_config_payload(project: Project, assays: list[Assay], samples: list[Sample]) -> dict:
    platforms = sorted({assay.platform for assay in assays})
    if not platforms:
        raise ConfigGenerationError("At least one assay is required before generating configuration files.")
    if len(platforms) > 1:
        raise ConfigGenerationError("All assays within a project must use the same platform for config generation.")

    genome_versions = sorted({assay.genome_version for assay in assays})
    quant_methods = sorted({assay.quantification_method for assay in assays})
    studies = list(project.studies.all())

    first_study = studies[0] if studies else None
    return {
        "common": {
            "projectdir": f"/secure/projects/{slugify(project.title)}",
            "project_title": project.title,
            "researcher_name": project.researcher_name,
            "bioinformatician_name": project.bioinformatician_assigned,
            "platform": platforms[0],
            "dose": [sample.dose for sample in samples],
            "batch_var": first_study.batch_var if first_study else "",
            "celltype": first_study.celltype if first_study else "",
            "units": "dose",
            "biospyder_dbs": [],
            "biospyder_manifest_file": "",
        },
        "pipeline": {
            "genomedir": "/refs/genomes",
            "genome_filename": f"{genome_versions[0]}.fa" if genome_versions else "",
            "annotation_filename": f"{genome_versions[0]}.gtf" if genome_versions else "",
            "genome_name": genome_versions[0] if genome_versions else "",
            "mode": "se",
            "quantification_method": quant_methods[0] if quant_methods else "",
        },
        "QC": {
            "clust_method": "ward.D2",
            "align_threshold": 0.95,
        },
        "DESeq2": {
            "cooks": True,
            "filter_gene_counts": 10,
        },
    }


def _build_metadata_tsv(samples: list[Sample]) -> str:
    header = [
        "sample_ID",
        "sample_name",
        "group",
        "dose",
        "chemical",
        "chemical_longname",
        "technical_control",
        "reference_rna",
        "solvent_control",
    ]
    rows = ["\t".join(header)]
    for sample in samples:
        rows.append(
            "\t".join(
                [
                    sample.sample_ID,
                    sample.sample_name,
                    sample.group,
                    str(sample.dose),
                    sample.chemical,
                    sample.chemical_longname,
                    str(sample.technical_control).lower(),
                    str(sample.reference_rna).lower(),
                    str(sample.solvent_control).lower(),
                ]
            )
        )
    return "\n".join(rows) + "\n"


def _build_contrasts_tsv(samples: list[Sample]) -> str:
    header = ["reference_group", "comparison_group"]
    rows = ["\t".join(header)]
    control_groups = sorted({sample.group for sample in samples if sample.solvent_control})
    experimental_groups = sorted({sample.group for sample in samples if not sample.solvent_control})
    for control_group in control_groups:
        for comparison_group in experimental_groups:
            if control_group != comparison_group:
                rows.append(f"{control_group}\t{comparison_group}")
    return "\n".join(rows) + "\n"


def build_project_config_bundle(project: Project) -> ConfigBundle:
    samples = list(
        Sample.objects.select_related("study")
        .filter(study__project=project)
        .order_by("id")
    )
    if not samples:
        raise ConfigGenerationError("At least one sample is required before generating configuration files.")

    assays = list(
        Assay.objects.select_related("sample", "sample__study")
        .filter(sample__study__project=project)
        .order_by("id")
    )

    config_yaml = yaml.safe_dump(_build_config_payload(project, assays, samples), sort_keys=False)
    metadata_tsv = _build_metadata_tsv(samples)
    contrasts_tsv = _build_contrasts_tsv(samples)

    file_buffer = BytesIO()
    with ZipFile(file_buffer, "w", compression=ZIP_DEFLATED) as archive:
        archive.writestr("config.yaml", config_yaml)
        archive.writestr("metadata.tsv", metadata_tsv)
        archive.writestr("contrasts.tsv", contrasts_tsv)

    filename = f"config_bundle_{slugify(project.title)}.zip"
    return ConfigBundle(filename=filename, content=file_buffer.getvalue())
