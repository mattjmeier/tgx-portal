# Directus Workspace

This directory is reserved for Directus-specific assets.

## Intended Contents

* `extensions/`
  Custom endpoints, hooks, operations, or interfaces if native Directus features are not enough.
* `snapshots/`
  Exported Directus schema snapshots for versioning collections, fields, and permissions.
* `uploads/`
  Local development storage for uploaded files.
* `seed/`
  Optional future scripts or fixtures for bootstrapping collections and reference data.

## Initial Modeling Targets

The first collections to create in Directus should be:

* `projects`
* `studies`
* `samples`
* `assays`
* `sample_plating`
* lookup collections for genome versions, platforms, and Biospyder metadata
