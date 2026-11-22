# Linux Files, Permissions, and Users — four-module authoring package

**Status:** Complete editorial first pass; **not published**, not seeded, not linked from the live catalog. Prerequisite: `linux-terminal-fundamentals`.

The Course 2 lesson, exercises, projects and capstone sources are authored here. The existing Zoéskoul runtime stores publishable sketches and checkers in separate records not included in the source archive. This package does **not** pretend that adding Markdown publishes live lessons.

## Read in order

1. `course.spec.json` — authoritative course structure, topics, objectives and practice policy
2. `course.plan.json` — synchronized structure and module ordering
3. `course.blueprint.json` and `validation.policy.json` — learning targets and safety gates
4. `MODULE_1_LESSONS.md` — inspect permission strings and path traversal (read-only)
5. `MODULE_2_LESSONS.md` — symbolic/numeric chmod on owned, trusted fixtures
6. `MODULE_3_LESSONS.md` — identities, groups, sudo concepts, umask and error diagnosis
7. `MODULE_4_LESSONS.md` — one five-step secure-project capstone
8. `LESSON_PRACTICE_BANK.json` — 60 drafted exercises and answer keys; editorial only
9. `ASSESSMENT_MATRIX.md` — rubric and publication checklist
10. `tools/reference_mode_audit.py` and unit tests — read-only instructional checker illustration (not production-ready)

## Module design

- **Module 1 — Understanding Linux Permissions:** read modes, inspect identity, understand directory traversal, Permission Detective.
- **Module 2 — Managing File and Directory Access:** symbolic/numeric chmod, scripts, Secure Your Workspace.
- **Module 3 — Users, Groups, and Permission Troubleshooting:** ownership and sudo conceptual-only, umask, precise triage, Shared Team Directory.
- **Module 4 — Capstone: Secure Project Folder:** one cumulative workspace, five steps, six exact mode targets.

Module and topic counts are driven by content, not by a fixed topics-per-module formula. The course has **4 modules** (within the requested maximum of 5), 18 topic IDs including projects/capstone, 60 practice-bank entries and four detailed lesson files. Lesson modules contain substantive prose rather than placeholder outlines.

## Security and test expectations

Do not execute `sudo`, `chown`, `chgrp`, `su`, system account management, recursive chmod or root-path modifications in student tasks. Avoid real credentials, untrusted scripts, external hosts, hardcoded usernames or UIDs. All mutable fixtures must be private to the learner session, resettable, and owned by its unprivileged user.

The existing `workspaceExpectations` can detect file-tree outcomes but not permission bits. **Actual mode grading is a hard publication blocker** until server-owned, isolated, race-safe stat validation is integrated. The included reference checker demonstrates what must be verified, but is not safe to use directly on adversarial production workspaces.

No database writes or catalog publication occur when installing this source-only authoring package. Review and publish using the existing course lifecycle, not an ad hoc file copy into public routes.
