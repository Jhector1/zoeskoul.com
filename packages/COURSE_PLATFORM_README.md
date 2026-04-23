# ZoeSkoul Curriculum Platform README

## Purpose

This document explains how the curriculum platform is structured, how the generation and publishing pipeline works, what the current trust model is, and what a **new future course** must implement to work properly.

This README is written as the **operating manual** for the current architecture.

---

## What this system is

The platform is a layered curriculum-generation and publishing system for subjects like SQL, Python, and future courses.

Its job is to:

- generate course plans and topic drafts
- normalize and repair generated drafts
- critique draft quality
- run semantic checks
- emit subject manifests, topic bundles, and messages
- write reports for auditability
- validate draft artifacts
- stage and publish when allowed

The important design goal is:

> Adding a new course should mostly require changes in the **profile layer**, not deep changes in the compiler foundation.

---

## High-level architecture

The intended dependency direction is:

```txt
curriculum-contracts
        ↓
curriculum-runtime
        ↓
curriculum-profiles
        ↓
curriculum-compiler
        ↓
curriculum-cli / apps/web
```

### Layer responsibilities

#### `packages/curriculum-contracts`
Owns shared contracts and stable types.

Examples:
- blueprint types
- plan types
- topic seed types
- topic recipe types
- profile adapter types
- publish gate types

This package should contain **pure shared contracts only**.

It should not contain:
- runtime execution code
- profile business logic
- compiler orchestration
- web app feedback logic

---

#### `packages/curriculum-runtime`
Owns reusable execution/runtime helpers.

Examples:
- SQL table extraction
- SQL result normalization and comparison
- shared SQL runner interface
- runtime recipe registry resolver
- future shared programming-output matching helpers

This package is lower-level than profiles.

It should not import:
- `@zoeskoul/curriculum-profiles`
- compiler modules
- web-only route helpers

---

#### `packages/curriculum-profiles`
Owns **course-family** and **subject-profile** behavior.

This is where the actual subject differences live.

Examples:
- SQL profile config
- Python profile config
- profile adapters
- profile services
- semantic validators
- trust policies
- recipe registries

This is the main place where future courses should be added.

---

#### `packages/curriculum-compiler`
Owns orchestration.

Examples:
- load blueprint
- load or generate plan
- compile subject
- compile topic
- critique topic/subject
- evaluate topic draft
- emit bundles/messages
- write reports
- publish gate

The compiler should be **generic**. It should call profile services, but it should not contain subject-specific business rules.

---

#### `packages/curriculum-cli`
Owns terminal commands and progress bars.

Examples:
- `compile-subject`
- `compile-topic`
- `validate`
- `publish`
- `publish-auto`
- `critique-topic`
- `critique-topic-draft`
- `critique-subject`
- `critique-subject-draft`

The CLI should not own generation logic. It should only call the compiler and render user-facing progress/output.

---

#### `apps/web`
Owns app-specific runtime glue.

Examples:
- API routes
- `runCode` bindings
- feedback formatting
- UI/response schemas
- user-facing exercise validation endpoints

The web layer can reuse shared runtime helpers, but should keep web-specific behavior local.

---

## Core compile flow

The topic pipeline should always follow this order:

```txt
generate draft
→ normalize draft
→ generic repair
→ profile repair
→ structural validation
→ profile validation
→ critique
→ semantic validation
→ emit topic bundle/messages
→ write reports
```

### What each stage means

#### Normalize
Makes raw generated content structurally consistent.

#### Repair
Fixes drafts so they become usable.

Examples:
- infer `correctValue`
- fix `correctOptionIds`
- repair drag order
- default SQL `datasetId`
- default SQL `recipeType`

Repair is allowed to **change the draft**.

#### Profile validation
Checks profile-specific structural rules.

Examples for SQL:
- dataset consistency
- allowed recipe types
- runtime assumptions

#### Critique
Checks pedagogical and quality issues, but does not fix the draft.

Examples:
- revealing hints
- weak distractors
- unclear wording
- bad pedagogy

#### Semantic validation
Checks whether the content is behaviorally correct.

Examples:
- SQL solution executes
- SQL result shape is valid
- SQL prompt intent matches the solution
- future Python solution passes tests

#### Emit
Build final topic bundle and messages from the repaired, approved draft.

---

## Fresh critique vs draft critique

There are now two critique modes.

### Fresh critique
This regenerates a new draft, evaluates it, and writes reports.

Commands:

```bash
pnpm curr:critique-topic <blueprintPath> <topicId>
pnpm curr:critique-subject <blueprintPath>
```

Use this when you want to know:

> If I generate this topic right now, is it good?

### Draft critique
This reads the **saved compiled draft reports** and critiques the saved draft again.

Commands:

```bash
pnpm curr:critique-topic-draft <blueprintPath> <topicId>
pnpm curr:critique-subject-draft <blueprintPath>
```

Use this when you want to know:

> Is the exact currently saved draft acceptable for publish?

For production trust, **draft critique is more important than fresh critique**.

---

## Reports

Every compiled topic should write reports under:

```txt
.curriculum-drafts/reports/<subjectSlug>/module<moduleOrder>/<topicId>/
```

Expected files:

- `raw-draft.json`
- `repaired-draft.json`
- `repair-report.json`
- `critique-report.json`
- `semantic-report.json`
- `emitted-topic-bundle.json`

These reports are the source of truth for later gating.

### Why reports matter

Blind or gated publish should never depend on memory or a fresh regeneration.

It should depend on:
- saved reports
- saved emitted bundle
- explicit gate results

---

## Quality model

### Repair
Repair should return:

```ts
{
  draft,
  report
}
```

Repair report entries should carry severity.

#### Recommended severity model

- `low`: formatting/default safe normalization
- `medium`: inferred answer fields, inferred metadata
- `high`: major logic correction, heavy fallback behavior

### Critique
Critique should return:

```ts
{
  topicId,
  ok,
  issues: [ ... ]
}
```

### Semantic validation
Semantic validation should return:

```ts
{
  topicId,
  ok,
  issues: [ ... ]
}
```

### Hint warnings
Hint warnings should not float separately forever.

They should be folded into critique issues so there is a single quality stream.

---

## Publish trust model

### Current realistic trust level

This system is suitable for:

- internal tooling
- staging
- supervised SQL generation
- manual publish after validation

It is **not** automatically ready for universal blind publish.

### What blind publish actually means here

The realistic goal is not literal 100% certainty.

The practical target is:

> SQL-only gated auto-publish with saved reports, semantic checks, snapshots, and rollback.

### Auto-publish should only be allowed when all are true

- compile passes
- validation passes
- critique errors = 0
- semantic errors = 0
- hint leakage errors = 0
- repair severity is within allowed threshold
- reports exist for every topic
- golden snapshot tests pass
- trust policy allows auto-publish

---

## SQL hardening model

SQL is currently the strongest candidate for trusted auto-publish because it has a clearer semantic execution path.

### SQL semantic validation should cover

- solution SQL executes
- readable result table exists
- result shape is correct
- prompt intent matches solution structure

Examples of prompt-intent checks:

- prompt says `group by` → solution should contain `GROUP BY`
- prompt says `count` or `how many` → solution should contain `COUNT(...)`
- prompt says `average` → solution should contain `AVG(...)`
- prompt says `sum` or `total` → solution should contain `SUM(...)`
- prompt says `having` → solution should contain `HAVING`
- prompt says join/combine tables → solution should contain `JOIN`
- prompt says `at least` → solution should likely use `>=`

### Important limitation

Result equivalence alone is not enough.

A wrong query can sometimes pass on a simple dataset.

Long term, SQL should also use:
- stronger prompt intent checks
- multiple/adversarial datasets

---

## Shared runtime logic

### What should be shareable

Move the reusable engine logic into packages.

Examples:
- SQL table extraction
- SQL table comparison
- SQL runner interface
- programming stdout normalization and output matching
- canonical expected schemas/types

### What should stay app-local

Keep these in `apps/web`:
- request parsing
- route-specific schemas
- `runCode` binding if app-owned
- feedback formatting (`CodeFeedback`)
- endpoint orchestration

This keeps shared logic reusable while keeping the web layer lightweight.

---

## Commands

### Root scripts

Recommended scripts block:

```json
{
  "scripts": {
    "dev": "turbo run dev --parallel",
    "build": "turbo run build",
    "typecheck": "turbo run typecheck",
    "build:web": "turbo run build --filter=@zoeskoul/web",

    "curr:build": "pnpm --filter @zoeskoul/curriculum-contracts build && pnpm --filter @zoeskoul/curriculum-runtime build && pnpm --filter @zoeskoul/curriculum-profiles build && pnpm --filter @zoeskoul/curriculum-compiler build && pnpm --filter @zoeskoul/curriculum-cli build",

    "curr:plan": "node packages/curriculum-cli/dist/index.js plan",
    "curr:compile": "node packages/curriculum-cli/dist/index.js compile-subject",
    "curr:compile-topic": "node packages/curriculum-cli/dist/index.js compile-topic",
    "curr:validate": "node packages/curriculum-cli/dist/index.js validate",
    "curr:publish": "node packages/curriculum-cli/dist/index.js publish",
    "curr:publish-auto": "node packages/curriculum-cli/dist/index.js publish-auto",

    "curr:critique-topic": "node packages/curriculum-cli/dist/index.js critique-topic",
    "curr:critique-topic-draft": "node packages/curriculum-cli/dist/index.js critique-topic-draft",
    "curr:critique-subject": "node packages/curriculum-cli/dist/index.js critique-subject",
    "curr:critique-subject-draft": "node packages/curriculum-cli/dist/index.js critique-subject-draft",

    "curr:test": "node --test packages/curriculum-compiler/test",
    "curr:test:golden": "node --test packages/curriculum-compiler/test/golden.spec.ts",

    "curr:sql:compile": "node packages/curriculum-cli/dist/index.js compile-subject authoring/sql/course.blueprint.json",
    "curr:sql:validate": "node packages/curriculum-cli/dist/index.js validate sql",
    "curr:sql:publish": "node packages/curriculum-cli/dist/index.js publish authoring/sql/course.blueprint.json",
    "curr:sql:publish-auto": "node packages/curriculum-cli/dist/index.js publish-auto authoring/sql/course.blueprint.json",
    "curr:sql:critique": "node packages/curriculum-cli/dist/index.js critique-subject authoring/sql/course.blueprint.json",
    "curr:sql:critique-draft": "node packages/curriculum-cli/dist/index.js critique-subject-draft authoring/sql/course.blueprint.json",

    "curr:sql:check": "pnpm curr:build && pnpm curr:sql:compile && pnpm curr:sql:validate && pnpm curr:sql:critique-draft && pnpm curr:test:golden"
  }
}
```

### Recommended SQL workflow

```bash
pnpm curr:build
pnpm curr:sql:compile
pnpm curr:sql:validate
pnpm curr:sql:critique-draft
pnpm curr:test:golden
```

Only after all of that is green should staged publish be considered.

---

## Golden tests

The separate test suite is the golden snapshot harness.

Location:

```txt
packages/curriculum-compiler/test/golden.spec.ts
```

This should compare saved outputs for stable topics.

### Good first fixture set

Create fixtures for 5–10 stable SQL topics, for example:

- introduction topic
- filtering topic
- sorting topic
- aggregate topic
- having topic
- join topic
- project-like topic

Snapshot at least:
- repaired draft
- critique report
- semantic report
- emitted bundle

### Why golden tests matter

They protect you from silent regressions when you change:
- prompts
- repair logic
- semantic validators
- profile services
- bundle emitters

---

## Publish gate

The publish gate should read saved topic reports and decide if a subject is publishable.

### Compile success is not enough

Never treat compile success as permission to publish.

Use a gate result like:

```ts
{
  ok,
  subjectSlug,
  profileId,
  reasons,
  stats
}
```

### Gate failure examples

- critique found errors
- semantic validation found errors
- hint warning count exceeds policy
- medium or high repairs exceed policy
- auto-publish disabled for profile
- no reports found
- runner not configured

---

## Trust policy

Each profile should own a trust policy.

Example fields:

- `autoPublishEnabled`
- `requiresCritiquePass`
- `requiresSemanticValidation`
- `maxHintWarnings`
- `maxMediumRepairs`
- `allowHighSeverityRepairs`

### Current recommendation

Keep `sqlTrustPolicy.autoPublishEnabled = false` until:
- SQL runner is configured in the compiler environment
- real semantic validation is green
- golden fixtures are real
- publish gate is enforced

Do not enable blind publish for Python or other profiles until they reach the same maturity.

---

## What a future course must implement

A future course is not ready just because it has content. It must participate in the base architecture.

### Minimum required pieces

#### 1. Profile config
File examples:
- `packages/curriculum-profiles/src/<subject>/profile.ts`

Must define:
- `id`
- `allowedExerciseKinds`
- `allowedRecipeTypes`
- `buildModuleRuntimeDefaults(...)`
- `getRecipeRegistry()`
- `validateTopicBundle(...)`

#### 2. Profile adapter
File examples:
- `packages/curriculum-profiles/src/<subject>/adapter.ts`

Must define:
- `buildTopicSeed(...)`
- `validateTopicRecipe(...)`
- `compileTopicRecipe(...)`
- `buildSubjectManifest(...)`

#### 3. Profile services
File examples:
- `packages/curriculum-profiles/src/<subject>/profileServices.ts`

Must define:
- `repairDraft(...)`
- `critiqueDraft(...)`
- `validateProfile(...)`
- `validateSemantic(...)`
- `getTrustPolicy()`

#### 4. Trust policy
File examples:
- `packages/curriculum-profiles/src/<subject>/trustPolicy.ts`

#### 5. Registry wiring
The subject must be registered so the system can resolve:
- profile config
- adapter
- services

#### 6. Messages/manifests compatibility
The emitted artifacts must be compatible with the manifest generation flow.

#### 7. Reports
Compile must write reports for each topic.

#### 8. Golden fixtures
Before auto-publish is considered, stable snapshots must exist.

---

## Subject readiness levels

### Level 1 — compile-ready
The subject can:
- compile
- emit artifacts
- validate structurally

### Level 2 — critique-ready
The subject can:
- produce meaningful critique issues
- fold hint leakage into critique
- write reports

### Level 3 — semantic-ready
The subject can:
- behaviorally validate important exercise types
- catch real correctness failures

### Level 4 — publish-gated
The subject has:
- reports
- gate logic
- trust policy
- stable validation path

### Level 5 — auto-publish candidate
The subject has:
- real semantic coverage
- real snapshots
- runner configured
- stable trust history

Only subjects at Level 5 should even be considered for auto-publish.

---

## What should never happen

### Do not let runtime import profiles
Bad:

```txt
runtime -> profiles
```

This creates cycles.

### Do not put subject-specific logic in compiler
Bad:
- SQL dataset business rules in compiler
- Python grading business logic in compiler

### Do not let CLI own business logic
CLI should never become the source of truth for quality decisions.

### Do not publish based on fresh critique alone
Publish should depend on **saved compiled drafts and saved reports**, not a newly regenerated draft.

---

## Troubleshooting

### `No saved draft found for <topicId>`
Cause:
- the topic was not recompiled after report writing was added
- reports folder is missing

Fix:

```bash
pnpm curr:sql:compile
pnpm curr:sql:critique-draft
```

### `SQL_RUNNER_NOT_CONFIGURED`
Cause:
- the shared runtime runner is not wired in the compiler environment

Fix:
- register the SQL runner in a higher-level package/environment
- do not enable auto-publish until resolved

### Circular package dependency
Cause:
- lower-level package importing higher-level package

Correct direction:

```txt
contracts -> runtime -> profiles -> compiler -> cli/web
```

### Export collision in barrel file
Cause:
- `export *` from two modules that expose the same name

Fix:
- prefer explicit exports in `src/index.ts`

---

## Recommended next milestones

### Immediate
- configure shared SQL runner
- compile full SQL subject
- validate SQL drafts
- run `critique-subject-draft`
- inspect reports

### After that
- add real golden fixtures
- enforce publish gate in CI
- keep SQL auto-publish disabled until gate + snapshots + runner are confirmed

### Later
- extract programming grader core into runtime
- add Python semantic execution support
- add staging-first publish workflow
- add rollback support

---

## Bottom line

This base is designed so future courses can work properly **without rewriting the foundation**.

A future course should mostly add:
- profile config
- adapter
- profile services
- trust policy
- registry entries
- semantic rules appropriate to that subject

The foundation should remain:
- generic compiler
- reusable runtime
- stable contracts
- CLI wrappers only

If that boundary is preserved, the system stays maintainable and scalable.
