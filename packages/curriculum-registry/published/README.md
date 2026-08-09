# Canonical published curriculum

This directory is the single published curriculum release owned by
`@zoeskoul/curriculum-registry`.

- `subjects/` owns published subject manifests and topic bundles.
- `messages/` owns published learner-facing curriculum messages.
- Web, Student, Teacher, and Admin should consume package runtime exports
  instead of maintaining independent curriculum publication roots.

Phase 1C seeded this directory once from the existing Web live release so the
already-published curriculum was preserved during the ownership cutover.
Future publishing writes here through curriculum-core live path helpers.

Do not re-seed this directory from an application mirror.
