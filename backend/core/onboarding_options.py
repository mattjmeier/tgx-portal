from __future__ import annotations


COMMON_INSTRUMENT_MODELS: list[str] = [
    "Illumina NovaSeq 6000",
    "Illumina NovaSeq X",
    "Illumina NextSeq 500",
    "Illumina NextSeq 550",
    "NextSeq 1000",
    "NextSeq 2000",
    "Illumina MiSeq",
]

ALL_INSTRUMENT_MODELS: list[str] = [
    "HiSeq X Five",
    "HiSeq X Ten",
    "Illumina Genome Analyzer",
    "Illumina Genome Analyzer II",
    "Illumina Genome Analyzer IIx",
    "Illumina HiScanSQ",
    "Illumina NextSeq 500",
    "Illumina HiSeq 1000",
    "Illumina HiSeq 1500",
    "Illumina HiSeq 2000",
    "Illumina HiSeq 2500",
    "Illumina HiSeq 3000",
    "Illumina HiSeq 4000",
    "Illumina MiniSeq",
    "Illumina MiSeq",
    "Illumina NovaSeq 6000",
    "Illumina NovaSeq X",
    "Illumina NovaSeq X Plus",
    "NextSeq 1000",
    "NextSeq 2000",
    "NextSeq 550",
    "GridION",
    "MinION",
    "PromethION",
    "Ion GeneStudio S5",
    "Ion Torrent Genexus",
    "Ion Torrent PGM",
    "Ion Torrent Proton",
    "Ion Torrent S5",
    "Ion Torrent S5 XL",
    "PacBio RS",
    "PacBio RS II",
    "AB 5500 Genetic Analyzer",
    "AB 5500xl Genetic Analyzer",
    "AB 5500xl-W Genetic Analysis System",
    "AB SOLiD 3 Plus System",
    "AB SOLiD 4 System",
    "AB SOLiD 4hq System",
    "AB SOLiD PI System",
    "AB SOLiD System",
    "AB SOLiD System 2.0",
    "AB SOLiD System 3.0",
    "Sequel",
    "Sequel II",
    "Sequel IIe",
    "Complete Genomics",
    "Element AVITI",
    "FASTASeq 300",
    "GenoCare 1600",
    "GS111",
    "Helicos HeliScope",
    "Onso",
    "Revio",
    "Sentosa SQ301",
    "Tapestri",
    "UG 100",
]

PLATFORM_VALUES: list[str] = ["TempO-Seq", "RNA-Seq", "DrugSeq"]

SEQUENCED_BY_VALUES: list[str] = [
    "HC Genomics lab",
    "HC foods lab",
    "Yauk lab",
]

BIOSPYDER_KIT_LABELS: dict[str, str] = {
    "hwt2-1": "Human Whole Transcriptome 2.1",
    "hwt2-0": "Human Whole Transcriptome 2.0",
    "h1500_2-0": "Human S1500+ Surrogate 2.0",
    "h1500_1-2": "Human S1500+ Surrogate 1.2",
    "mousewt1-0": "Mouse Whole Transcriptome 1.0",
    "mouse1500_1-2": "Mouse S1500+ Surrogate 1.2",
    "zebrafish1500": "Zebrafish S1500+ Surrogate",
}

BIOSPYDER_KIT_VALUES: list[str] = list(BIOSPYDER_KIT_LABELS.keys())

