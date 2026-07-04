# Linux Terminal Fundamentals — refactored draft

This generated draft keeps the course beginner-focused and terminal-only.

Major changes:

- Set `subject.meta.curriculum.isTerminalRelease` to `true`.
- Added `writing-text-into-files` for `echo`, `>`, `>>`, and `cat`.
- Added `safe-delete-with-rm` before any project uses `rm`.
- Reworked projects into connected scenarios.
- Kept workspace expectations as the main grading signal and used command expectations only as broad evidence/safety hints.
- Removed stale translated files from this zip so HT/FR can be regenerated after the final English draft is accepted.

Recommended validation after copying into the repo:

```bash
pnpm --filter @zoeskoul/web gen:manifests
RUN_DRAFT_CODE_INPUT_GOLDENS=1 pnpm curr:course -- draft-goldens linux linux-terminal-fundamentals
pnpm --filter @zoeskoul/web typecheck
pnpm build
```
