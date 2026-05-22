# Authoring Layout

Canonical layout after refactor:

- `catalogs/` contains thin public catalog metadata.
- `subjects/<subject>/subject.*.json` contains subject-level path, plan, and validation.
- `subjects/<subject>/shared/` contains subject-level reusable profile, datasets, validation, and rubrics.
- `subjects/<subject>/courses/<courseSlug>/` contains one publishable course.
- `subjects/<subject>/legacy/` contains old monoliths, old version folders, or migrated originals for audit only.

Runtime/app packages should not depend on folder order. They should read `authoring.index.json`, then explicit `courseOrder`, `moduleOrder`, and topic order fields.
