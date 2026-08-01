# Pseudocode Input and C Hardening

This change adds a first-class `pseudocode_input` exercise kind and centralizes stricter C authoring/runtime validation.

## Pseudocode input

Supported authoring modes:

- `complete`
- `fill_blanks`
- `reorder`
- `trace`
- `write`

The canonical dialect is `zoeskoul-v1`. Pass/fail is deterministic: authored structure, operation, ordered-operation, pattern, forbidden-pattern, and trace rules are normalized and checked by `@zoeskoul/practice-checks`. AI may explain a failure but does not decide correctness.

The kind is wired through curriculum contracts, authoring draft normalization, generation/sanitization, manifest compilation, practice generation, persistence, API grading, reveal/fill, tutor context, and the learner UI.

## C hardening

C code now uses three centralized Judge0 compilation modes:

- Learner: `-Wall -Wextra -Wpedantic`
- Strict golden: learner flags plus `-Werror`
- Sanitized golden: strict warnings plus AddressSanitizer and UndefinedBehaviorSanitizer

C authoring requires at least three distinct fixed tests. Duplicate workspace paths, fixture paths, and fixed tests are rejected. Golden validation also checks dynamic-allocation cleanup and explicit allocation-failure handling.

## Database migration

Apply the included Prisma migration before serving published pseudocode exercises:

```bash
pnpm prisma generate
pnpm prisma migrate deploy
```

Use your repository's existing Prisma package/filter command when it differs from the root shortcut.

## Suggested validation

```bash
pnpm --filter @zoeskoul/practice-checks test
pnpm --filter @zoeskoul/curriculum-contracts test
pnpm --filter @zoeskoul/curriculum-profiles test
pnpm --filter @zoeskoul/curriculum-runtime test
pnpm curr:course -- check
pnpm curr:course -- validate
pnpm curr:build
```

The Judge0 image used for strict publishing must provide GCC with AddressSanitizer and UndefinedBehaviorSanitizer support.
