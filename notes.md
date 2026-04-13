# UI notes

See https://reui.io/components/data-grid and other examples; very nice react components.
https://www.kibo-ui.com/components/gantt advanced components too here

Collapsible sidebar - only mobile?

Main landing page / home link


I'm working to improve my study onboarding (e.g., studies/n/onboarding). Currently, template design (step 2) has a lot of options. I think I want to re-organize how this onboarding flow works.
1. The first thing to do is establish "Study design elements", as we already do in the first card. This should form the constraints of the template. This is already pretty well set up; however, we need to make it a bit more intuitive and full-featured to fill out (see point 3 below).
2. To make room for extra features, I want to consider moving the "Template columns" card to the next page (maybe rename it "finalize metadata"?). This is where users can preview and select/deselect optional columns. That is the penultimate step to getting their template.
3. To make sure we get the right constraints nailed down on step 2, we should make it a bit more clear what we are trying to do. We want to determine:
A) what is the main experimental variable of interest? for example, most of the time it's chemical. Once the user has picked this, it means it must be included in the template. 
B) what column in their metadata will be the batch variable? I like the element that appears for batch and for treatment to help name columns, but obviously we will need to move this popup to a card that will remain on the template design page (equivalent to just NOT moving it with the other components like "template columns" I suppose!)
C) I noticed that the "sequencing" section includes an option for paired end. It made me realize: this is not a metadata option, but a config option. We should have a small section devoted to capturing these config options, including whether it's PE or SE, the instrument used (or to be used) for sequencing, the institution that will (or did) carry out the sequencing (which should be an add or select menu). Actually, I think we could expand step 1 (study details) to capture much of this, including the following.

# Full instrument list from GEO metadata template
# Except 454 machines are excluded
# We should probably give a more limited list of the usual machines, but they're all here just in case
instrument_models = c("HiSeq X Five", "HiSeq X Ten", "Illumina Genome Analyzer", "Illumina Genome Analyzer II", "Illumina Genome Analyzer IIx", "Illumina HiScanSQ", "Illumina NextSeq 500",  "Illumina HiSeq 1000", "Illumina HiSeq 1500", "Illumina HiSeq 2000", "Illumina HiSeq 2500", "Illumina HiSeq 3000", "Illumina HiSeq 4000", "Illumina MiniSeq", "Illumina MiSeq", "Illumina NovaSeq 6000", "Illumina NovaSeq X", "Illumina NovaSeq X Plus", "NextSeq 1000", "NextSeq 2000", "NextSeq 550", "GridION", "MinION", "PromethION", "Ion GeneStudio S5", "Ion Torrent Genexus", "Ion Torrent PGM", "Ion Torrent Proton", "Ion Torrent S5", "Ion Torrent S5 XL", "PacBio RS", "PacBio RS II", "AB 5500 Genetic Analyzer", "AB 5500xl Genetic Analyzer", "AB 5500xl-W Genetic Analysis System", "AB SOLiD 3 Plus System", "AB SOLiD 4 System", "AB SOLiD 4hq System", "AB SOLiD PI System", "AB SOLiD System", "AB SOLiD System 2.0", "AB SOLiD System 3.0", "Sequel", "Sequel II", "Sequel IIe", "Complete Genomics", "Element AVITI", "FASTASeq 300", "GenoCare 1600", "GenoCare 1600", "GS111", "Helicos HeliScope", "Onso", "Revio", "Sentosa SQ301", "Tapestri", "UG 100")

# Sequencing location, so we know where to find data (direct to server, basespace, etc)
sequenced_by = c("HC Genomics lab", "HC foods lab", "Yauk lab", "other") (add or select)

# Platform
platform = c("TempO-Seq", "RNA-seq", "DrugSeq")

# Biospyder kits
# Written out here human-friendly with spaces as they appear on the biospyder website
# Maybe we include a dictionary (below) to translate human-friendly to short-form for the config? 
# Additional kits exist but we don't have unified manifests for them. I guess if someone used a kit not on this list, that's a "contact your bioinformatician" situation
biospyder_kit = c("Human Whole Transcriptome 2.1", "Human Whole Transcriptome 2.0", "Human S1500+ Surrogate 2.0", "Human S1500+ Surrogate 1.2", "Mouse Whole Transcriptome 1.0", "Mouse S1500+ Surrogate 1.2")

biospyder_kit_dict = {
"Human Whole Transcriptome 2.1":"hwt2-1",
"Human Whole Transcriptome 2.0":"hwt2-0",
"Human S1500+ Surrogate 2.0":"h1500_2-0",
"Human S1500+ Surrogate 1.2":"h1500_1-2",
"Human S1500+ Surrogate 1.2":"h1500_1-2",
"Mouse Whole Transcriptome 1.0":"mousewt1-0",
"Mouse S1500+ Surrogate 1.2":"mouse1500_1-2",
"Zebrafish  S1500+ Surrogate":"zebrafish1500",
}
...and perhaps some Illumina options built in too? Probably should be add or select

# Sequencing mode: single-end or paired end?
# Note that temposeq (and drugseq??) are always se
seq_mode = c("se", "pe")

organism = c("human", "mouse", "rat", "hamster", "other")

cell type should also be an add or select feature.








QUESTIONS - treatment/batch vars



The minimized structure is too heavy for the continue onboarding banner.

On an existing study: the download template should reflect the shape of the current study in question.