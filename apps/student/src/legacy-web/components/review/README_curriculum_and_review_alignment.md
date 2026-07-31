# Curriculum, Review, and Practice Alignment Guide

## Purpose

This document explains the long-term architecture for curriculum data, review flows, practice flows, manifest generation, DB sync, and the slug model used across the app.

It is intended to be the single reference for:

- how manifests work
- what is canonical vs derived
- how review differs from practice
- what changed during the alignment refactor
- when to run generation vs DB sync
- what remains legacy naming vs what is fully canonical

---

## Core Principle

The app now follows this rule:

- **Manifest / registry is the source of truth for curriculum structure**
- **Database is a derived projection plus user/runtime state**

That means:

### Manifest / registry owns

- subjects
- modules
- sections
- topics
- module order
- section order
- topic membership inside sections
- topic prefixes
- topic runtime slugs
- review structure

### Database owns

- user progress
- review progress
- quiz instances
- practice sessions
- attempts
- access state
- session history
- DB-backed browse/projection endpoints

This split is the key change that removed the old drift bugs.

---

## Why This Refactor Was Needed

The original issue came from a mismatch between:

- manifest section topics using base ids such as `computer_intro`
- runtime topics using prefixed slugs such as `py0.computer_intro`
- review APIs checking section/topic membership from Prisma joins instead of the manifest-built registry

That caused errors like:

- `Topic "py0.editor_workspace_overview" is not part of section "python-0-foundations"`
- `Topic "py0.computer_intro" is not part of section "python-0-foundations"`
- `Unknown module for subject`
- review progress save/load drift when module resolution depended on stale DB structure

The fix was to stop using DB structure as the authority for review module and section/topic structure.

---

## Canonical Identifier Model

### Canonical curriculum identifiers

Use these as the long-term canonical identifiers:

- `subjectSlug`
- `moduleSlug`
- `sectionSlug`
- `topicId` for manifest/base ids only
- `topicSlug` for compiled runtime topic slugs

### Examples

Manifest/base topic id:

```txt
computer_intro
```

Compiled runtime topic slug:

```txt
py0.computer_intro
```

Module slug:

```txt
python-0
```

Subject slug:

```txt
python
```

### Important naming rule

- `topicId` means manifest/base topic id
- `topicSlug` means compiled runtime slug
- `moduleSlug` means canonical runtime module id
- avoid using `moduleId` in review/practice runtime code unless it truly means a DB id

---

## Manifest Structure

`subject.manifest.json` should contain the full subject structure:

- subject
- modules
- sections
- topic ids within sections

### Example shape

```json
{
  "subject": {
    "slug": "python",
    "genKey": "python_part1"
  },
  "modules": [
    {
      "slug": "python-0",
      "prefix": "py0",
      "sections": [
        {
          "slug": "python-0-foundations",
          "topics": [
            "editor_workspace_overview",
            "computer_intro",
            "programming_intro",
            "syntax_intro",
            "comments_intro"
          ]
        }
      ]
    }
  ]
}
```

### Manifest authoring rule

Inside section `topics`, always store **base topic ids only**, not prefixed runtime slugs.

Good:

```json
"topics": ["computer_intro", "syntax_intro"]
```

Bad:

```json
"topics": ["py0.computer_intro", "py0.syntax_intro"]
```

---

## How Runtime Slugs Are Built

Topic runtime slugs are compiled from:

- module prefix
- topic base id

### Example

Module prefix:

```txt
py0
```

Topic id:

```txt
computer_intro
```

Runtime topic slug:

```txt
py0.computer_intro
```

This compilation happens in the subject/course artifact layer, not in the database.

---

## Course Definition Path

### Current correct approach

Each subject is built from:

- `subject.manifest.json`
- `topics.generated`
- `defineCourseFromManifest(...)`

Example pattern:

```ts
import subjectManifest from "./subject.manifest.json";
import { TOPIC_MANIFESTS } from "./topics.generated";
import { defineCourseFromManifest } from "@/lib/subjects/_core/defineCourseFromManifest";

export const PYTHON = defineCourseFromManifest({
  manifest: subjectManifest,
  topicManifests: TOPIC_MANIFESTS,
});
```

This is correct and should remain the long-term pattern.

---

## Registry / Artifact Layer

The registry file that aggregates subjects should stay, but it should remain **derived**, not hand-authored truth.

### Recommended shape

```ts
import { buildArtifacts } from "./_core/buildArtifacts";
import { PYTHON } from "./python";
import { SQL } from "./sql";

export const COURSE_BUNDLES = [PYTHON, SQL] as const;

export const SUBJECT_ARTIFACTS = buildArtifacts(COURSE_BUNDLES);
export const SUBJECTS = SUBJECT_ARTIFACTS.subjects;
export const MODULES = SUBJECT_ARTIFACTS.modules;
export const TOPICS = SUBJECT_ARTIFACTS.topics;
export const SECTIONS = SUBJECT_ARTIFACTS.sections;
export const GENERATED_CATALOG = SUBJECT_ARTIFACTS.catalog;
export const REVIEW_TOPICS_BY_SLUG = SUBJECT_ARTIFACTS.reviewTopicsBySlug;
export const SUBJECT_SKETCHES = SUBJECT_ARTIFACTS.sketches;
export const TOPIC_GENERATORS_BY_SLUG = SUBJECT_ARTIFACTS.generatorsByTopicSlug;
```

### Important rule

Do not treat this file as the authoring source.

It is a compiled runtime registry built from manifests.

---

## Database Role

The DB is now a **projection/cache + state layer**.

### DB projection examples

- `practiceSubject`
- `practiceModule`
- `practiceSection`
- `practiceTopic`
- `practiceSectionTopic`

### DB state examples

- `reviewProgress`
- `reviewQuizInstance`
- `practiceSession`
- `practiceAttempt`
- `subjectEnrollment`
- access/entitlement tables

### Important rule

The DB should not decide:

- what modules exist
- what topic belongs to what section in review
- module order for review flows

That belongs to the registry/manifest.

---

## Review Flow Changes

## Review modules are now registry-first

`resolveReviewModuleForSubject(...)` should resolve review modules from:

- `SUBJECTS`
- `MODULES`
- `hasReviewModule(...)`

It should not query Prisma for structure resolution.

### Good behavior

- check that the subject exists in the registry
- filter modules for that subject
- keep only review-enabled modules
- sort by module order
- resolve by module slug

### Why

This removes stale DB structure as a source of review module drift.

---

## Review access changed to registry-first resolution

`resolveReviewAccess(...)` now:

1. resolves the canonical review module from the registry
2. uses that canonical module slug for access checks
3. optionally looks up DB ids only as best-effort compatibility metadata

This means the existence of a review module is no longer decided by Prisma module lookup.

---

## Review progress now uses canonical module slug

`/api/review/progress` now:

- accepts `moduleSlug` and legacy `moduleId` on GET/DELETE query params
- resolves the canonical review module from the registry
- persists progress under `reviewProgress.moduleId = resolved.module.slug`

### Important note

The DB column is still called `moduleId`, but semantically it stores the **canonical review module slug**.

That is safe for production because this was already effectively how the progress key was being used.

### Recommendation

Document this clearly in code. Optionally rename later via migration if desired, but there is no urgent need.

---

## Review progress payload compatibility

During transition, the client payload builder still used `moduleRef`, while newer schemas were moving toward `moduleSlug`.

### Safe compatibility rule

The review progress write schema should accept:

- `moduleSlug`
- `moduleId`
- `moduleRef`

Then normalize to a single internal value.

This prevents 400 errors during transition and protects production clients.

---

## Review quiz topic membership is now registry-first

The review quiz route should validate section/topic membership from:

- `SECTIONS`
- `TOPICS`

not Prisma `practiceSection -> topics` joins.

### Why

This is what fixes errors like:

- `Topic "py0.computer_intro" is not part of section "python-0-foundations"`

because the manifest-built registry knows the correct compiled topic slugs and section membership.

---

## Review client naming updates

The review client moved toward:

- `moduleSlug`
- `subjectSlug`

instead of `moduleId` or `moduleRef`

### Improved examples

```ts
useReviewProgress({ subjectSlug, moduleSlug, locale, firstTopicId })
useModuleNav({ subjectSlug, moduleSlug })
fetchReviewProgressGET({ subjectSlug, moduleSlug, locale })
```

### Remaining legacy naming

Some places may still use older names such as:

- `moduleId`
- `moduleRef`

These should be cleaned up over time, but they are mostly naming issues now, not structural issues.

---

## Practice Flow Alignment

The practice layer is also slug-based and aligned.

### Practice state persistence uses

- `subjectSlug`
- `moduleSlug`
- `section`
- `topic`
- `difficulty`

for sessionStorage/localStorage keys.

### Practice runtime uses

- `subjectSlug`
- `moduleSlug`

when fetching exercises, restoring sessions, and requesting practice status.

### Practice API alignment

`/api/practice` uses parsed request params and resolves access using:

- subject
- module
- sessionId

This is consistent with the client sending module slugs rather than DB ids.

---

## Tools Panel Contract

`ToolsPanel` still uses the prop name `moduleId`, but in current usage that value is a module slug.

This is acceptable for now because it is being used as an opaque module-scoped runtime value, not as a Prisma id.

Long-term cleanup would rename this prop to `moduleSlug`.

---

## Catalog Endpoints

### `/api/catalog/topics`

This route is currently a **DB projection endpoint**.

It is aligned with runtime slugs because:

- `practiceTopic.slug` stores the canonical runtime topic slug
- section filtering uses `practiceSectionTopic` ordering

This is safe as long as the DB has been synced from the manifest-built registry.

### `/api/catalog/subjects`

This is also a **DB projection endpoint** for browsing/UI.

It is fine for runtime use, but should not be treated as the source of truth for curriculum structure.

### Important distinction

These routes are acceptable as **projection-backed browse APIs**, but the manifest/registry remains the structural authority.

---

## What Changed

This section summarizes the major changes made during the refactor.

### 1. Manifest became the structural source of truth

We moved away from DB-first curriculum structure resolution for review.

### 2. Review module resolution became registry-first

`resolveReviewModuleForSubject(...)` now uses `SUBJECTS` + `MODULES` + `hasReviewModule(...)`.

### 3. Review access stopped using Prisma structure as authority

`resolveReviewAccess(...)` now resolves the review module from the registry first.

### 4. Review progress persisted canonical module slug

The review progress route now writes using `resolved.module.slug`.

### 5. Review quiz section/topic membership became registry-based

Section/topic membership checks now use `SECTIONS` and `TOPICS`.

### 6. Review UI naming moved toward slug terminology

Hooks and routes were updated toward `moduleSlug`.

### 7. Practice persistence and runtime were verified to already be slug-aligned

No major architectural change was needed there.

### 8. Assignment launch bug in `ReviewModuleView` was fixed

The self-shadowed `moduleSlug` variable was replaced with `practiceModuleSlug`.

---

## Production Safety

### Existing review progress should not be broken

The current refactor does **not** invalidate existing progress as long as:

- the stored `reviewProgress.moduleId` value remains the canonical module slug
- module slug formats are not changed
- routes continue to resolve and persist using the same slug values

### Safe now

- internal variable renames
- registry-first review structure resolution
- dual acceptance of legacy request field names

### Not safe without migration

- changing persisted module slug values
- renaming DB fields without a migration plan
- switching from slug persistence to Prisma id persistence

---

## Manifest Generation and DB Sync Workflow

### Scripts

Recommended scripts:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",

    "i18n:generate": "node scripts/generate-i18n-manifest.mjs",
    "gen:topic-manifests": "tsx scripts/generate-topic-manifests.ts",
    "gen:subject-manifests": "tsx scripts/generate-subject-manifests.ts",
    "gen:manifests": "pnpm i18n:generate && pnpm gen:topic-manifests && pnpm gen:subject-manifests",

    "db:seed": "npx prisma db seed",
    "sync:curriculum": "pnpm gen:manifests && pnpm db:seed",

    "predev": "pnpm gen:manifests",
    "prebuild": "pnpm gen:manifests",
    "pretypecheck": "pnpm gen:manifests"
  }
}
```

### Why `gen:manifests` should not seed automatically

`gen:manifests` should stay pure:

- file generation only
- no DB access
- safe in predev/prebuild/pretypecheck

Seeding should remain separate because it:

- mutates DB state
- requires a DB connection
- should not happen automatically on every build

### When to run `pnpm sync:curriculum`

Run it after manifest/curriculum changes such as:

- adding/removing modules
- adding/removing sections
- moving topics between sections
- changing topic slugs/prefixes
- changing subject/module/section ordering
- changing curriculum metadata that projection endpoints depend on

### When seeding is not necessary

You usually do **not** need DB sync for:

- UI-only style changes
- client-side layout changes
- non-structural runtime-only code changes

---

## Recommended Vocabulary Going Forward

Use this vocabulary consistently in review/practice code:

- `subjectSlug`
- `moduleSlug`
- `sectionSlug`
- `topicId` for manifest/base id only
- `topicSlug` for compiled runtime topic slug only
- `subjectDbId` for actual Prisma subject id
- `moduleDbId` for actual Prisma module id

Avoid, unless truly needed:

- `moduleId` in runtime code
- `moduleRef`
- `subjectId` when it is really a slug
- `topicKey` as a generic identifier if `topicId` or `topicSlug` is more precise

---

## Remaining Cleanup Items

These are not major architecture problems, just cleanup items.

### 1. Legacy naming still exists in some places

Examples:

- `moduleId` prop names carrying slugs
- `moduleRef` in transitional compatibility paths

### 2. DB schema field names are semantically old

`ReviewProgress.moduleId` stores a module slug.

This is okay for now, but should be documented clearly.

### 3. Projection endpoints are DB-backed, not registry-backed

That is acceptable as long as `pnpm sync:curriculum` is run after curriculum changes.

---

## Long-Term Rules

### Rule 1

**Never let DB joins be the authority for review curriculum structure.**

### Rule 2

**Use the manifest-built registry for module order and section/topic membership.**

### Rule 3

**Persist user state using canonical slugs, not DB ids, unless a true relational FK is required.**

### Rule 4

**Keep generation separate from DB sync.**

### Rule 5

**When curriculum structure changes, run `pnpm sync:curriculum`.**

---

## Quick Checklist

### After changing manifests

Run:

```bash
pnpm sync:curriculum
```

### If only UI changed

Usually no DB sync needed.

### If review starts throwing section/topic mismatch errors again

Check that:

- review route is using `SECTIONS` / `TOPICS`
- DB sync was run after the last structural manifest change

### If progress saves fail with 400

Check that:

- the review progress schema still accepts current client payload fields
- `moduleSlug/moduleId/moduleRef` compatibility is preserved

### If review module nav fails

Check that:

- `resolveReviewModuleForSubject(...)` is still registry-first
- caller uses `moduleSlug`
- manifest actually contains the requested module

---

## Summary

The app is now organized around a stable principle:

- **Manifest/registry defines curriculum**
- **DB stores user state and runtime projections**
- **Runtime identity is slug-based**

This is the long-term architecture to preserve.
