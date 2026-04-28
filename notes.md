# UI notes

- contrasts - order them? buttons to shortcut ordering 

- free form notes for bioinformatician input

- fix landing page

- scroll bug


- SET UP PLANE SIDECAR

- EXPORT PREPOPULATED GEO
- EXPORT ILLUMINA SAMPLESHEET

- IMPORT DATA IN ADMIN

- review & finalize page: 
    - "blocking issues" should be more apparent
    - "Additional grouping columns" - it's too busy to show all of them; we need a way to limit, like using a dropdown menu and adding chips of additional columns. 


See https://reui.io/components/data-grid and other examples; very nice react components.
https://www.kibo-ui.com/components/gantt advanced components too here

Collapsible sidebar - only mobile?

- EVENTUALLY...
    - Results page on sidebar
    - Chemical management page

- Alias table for genes/probes?





QUESTIONS - treatment/batch vars



On an existing study: the download template should reflect the shape of the current study in question.


Template preview



# URL patterns

- studies have things like /56/onboarding - we should make a slug form based on title (this should also be used as the folder name; or, we derive folder name from another way, YYYY_PI-name_slug-study-name)

- make dose/concentration mandatory


- aflatoxin-response-study-45_metadata.csv - template has wrong name

My study onboarding flow has a few UI bugs and tweaks I'd like to make:

- the "finalize metadata" step - would more accurately be called "finalize and download template"

- On step 5, there is a kind of infinite loop where it says "saving...", causing that element to appear/disappear/re-appear repeatedly. What is standard practice? Usually just a static message saying "Your work is saved"?

- I got to the end of an onboarding and realized that steps 2 and 3 became unchecked. I'm not exactly sure why their state is inconsistent. That might be the hardest challenge to track.

- "Onboarding finalized"

Samples are now available in the study workspace. Config outputs can be downloaded later from study actions -- REWORK DESIGN

- continue designing vs continue onboarding