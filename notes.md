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

- Alias table for genes/probes? FEATURES TABLE + ALIAS TABLE



- "No values added yet." - I think this text (on step 2) should be red since it indicates a blocking issue. In fact, maybe instead of that, the message "select at least one study design element..." should appear inside the applicable card instead of below them, I think that would draw attention nicely. What do you think??

- On metadata template download page (step 3) aflatoxin-response-study-45_metadata.csv - template has the 'collaboration' as part of the slug, but let's also include the study name, instead of the number? separated by an underscore maybe?
    - somewhat related... study URL paths have things like /56/onboarding - we should make a slug form based on title (this should also be used as the folder name; or, we derive folder name from another way, YYYY_PI-name_slug-study-name)

- If a user clicks "continue" from step 3 to 4, but they never clicked "download template", perhaps a modal should warn them (using nice "warning" formatting) that they have to provide a template on the next page, which they must download on the current page, and give them the option to continue or not?

- On step 4 - re-uploading a corrected file via the "Choose file" menu does not seem to update the data source...? it does work correctly with drag n drop though!

- I think we need to make selection of exposure level mandatory if (but only if) chemical is selected as a study design element.





---

- "Onboarding finalized"

Samples are now available in the study workspace. Config outputs can be downloaded later from study actions -- REWORK DESIGN

- continue designing vs continue onboarding