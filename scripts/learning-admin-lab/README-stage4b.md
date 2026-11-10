# Stage 4B — explicit admin lesson PTY (client) and grading fail-closed guard

This stage adds a **manually requested** administrative sandbox to the three
approved published Course 2 topics. It uses ZoeLearning's existing
`useRunSession` transport and `XtermTerminal` renderer; it does not change the
ordinary shell/FullIDE execution path or start an additional runner service.

- Web's Stage 4A route still verifies the published lesson, enrollment and
  practice entitlement; client topic metadata is only for presentation.
- UI is hidden by default; to test the UI explicitly set
  `NEXT_PUBLIC_ZOESKOUL_ADMIN_LAB_UI_ENABLED=true` when building the web app.
  This UI flag provides NO authorization. Keep both privileged server flags
  OFF until end-to-end tests and broader isolation assessment pass.
- Uses actor-scoped PTY attach/cancel routes, cancels on topic navigation,
  and catches late starts to prevent leaked admin sessions.
- No admin workspace snapshots, host file synchronization, shared volume,
  or fake grading. The root session is disposable, not persisted.
- Authored `adminLabFilesystemExpectations` now fail closed (HTTP 503, no
  attempt consumed) until a trusted Runner-owned evidence route is built.
  Do not use browser-supplied command text or `terminalEvidence` as proof of
  filesystem mode, ownership or root actions. **This stage does not implement
  authoritative mode/owner verification or completion grading.**
- No changes to Docker, Docker image, ZoeBuild, auth, billing, or course
  publication; Runner admin switch remains OFF.

## Verify locally

```
python3 "$PATCH/test_package.py"
python3 "$PATCH/apply.py" --repo "$PWD" --check
python3 "$PATCH/apply.py" --repo "$PWD" --apply
python3 "$PATCH/apply.py" --repo "$PWD" --verify
pnpm exec vitest run \
  apps/student/src/legacy-web/components/review/module/components/content/adminLabTopicDisplayPolicy.test.ts \
  apps/web/src/lib/practice/api/validate/grade/adminLabFilesystemEvidencePolicy.test.ts
(cd apps/web && pnpm exec next typegen)
pnpm exec tsc -p apps/web/tsconfig.json --noEmit
pnpm exec vitest run apps/web/src/lib/practice/api/validate/grade/codeInput.test.ts
```

The `ReviewTopicCards.tsx` source in the earlier export may be older than
your working tree. The installer makes only two anchored insertions and
preserves unrelated current edits. If the expected anchors changed, it
refuses safely rather than overwriting newer work. Never force an install
through a drift refusal.

## Next stage

Implement the Runner's actor-bound, server-only read-only `stat` evidence
collection and link it with published trusted exercise expectations, session
lifecycle, correct attempt recording and end-to-end permission grading. Then
validate with real sudo/su, chmod, chown, navigation, cancel and OFF revocation
on the Ubuntu rootless executor before exposing it to students.
