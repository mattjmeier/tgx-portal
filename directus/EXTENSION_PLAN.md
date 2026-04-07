# Directus Extension Plan

This branch now treats Directus as the main application shell, not just the backend.

## Priority Order

1. Collections, fields, relations, and presets
2. Roles, policies, and permission filters
3. Flows and operations
4. App extensions
5. Endpoint or hook extensions
6. Separate frontend routes only if still necessary

## First Business Logic Targets

### 1. Roles And Policies
Create and test:
* `Admin`
* `Client`
* `System`

Goals:
* clients only see their assigned projects
* clients cannot access system settings or unrelated collections
* admins keep full management access

### 2. Core Collections
Create:
* `projects`
* `studies`
* `samples`
* `assays`
* `sample_plating`
* lookup collections

Goals:
* clean relational model
* sensible labels and icons
* field-level help text and defaults
* conditional display logic where Directus supports it

### 3. Flow-Based Automation
Use flows for:
* project-created notifications
* config-generation triggers
* lightweight approval or status transitions

### 4. Custom Module For Import And Review
Build a Directus custom module when native collection editing is not enough.

Likely first module:
* `Sample Intake`

Responsibilities:
* upload CSV/TSV
* preview rows
* call validation endpoint or operation
* display row-level and field-level issues
* create validated sample records

### 5. Endpoint Extensions
Use endpoint extensions for:
* `generate-config`
* domain validation endpoints for spreadsheet intake
* safe wrappers around external integrations like Plane

## Recommended Sequence

1. Model the collections in Directus
2. Lock down roles and permissions
3. Create the first flow for project lifecycle events
4. Build the config-generation endpoint
5. Build the sample-intake module only after native Directus editing is proven insufficient
