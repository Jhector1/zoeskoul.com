# ZoeLearning Stage 3 — Operator switch and Course 2 lesson contract

This patch is source-only, not a deployment, and does not grant root to students.

- Existing `/sessions/start` still denies browser-provided `labProfile=admin`.
- `/sessions/admin/start` requires the original service-authenticated, actor-bound, signed, single-use operator grant.
- `ZOESKOUL_LEARNING_ADMIN_LABS_ENABLED=true` is only a *static prerequisite*, **not** runtime admission.
- The runtime switch begins **OFF on every Runner restart**. This is intentional.
- `/sessions/admin/control` requires the independent `ZOESKOUL_LEARNING_ADMIN_CONTROL_SECRET` (32+ bytes) in the `x-learning-admin-control` header, in addition to normal service authentication. Only `{ "enabled": true|false }` accepted.
- OFF invalidates in-flight start operations and awaits cancellation of tracked live administrator sessions.
- `/sessions/admin/control/status` reads the runtime switch and does not expose secrets.
- The older `/sessions/admin/revoke` endpoint also turns the runtime switch OFF.
- The admin container filesystem has no host-backed workspace. A blank `workspaceDir` denotes a container-only workspace; the existing cleanup lifecycle removes its session record without touching host filesystem paths.

## IMPORTANT: unfinished student-facing work

`learningAdminLessonPolicy.ts` is an eligibility list, not authentication or enrollment authorization. Do **not** let React or browser JSON mint admin grants. Connect a trusted server-side lesson service only once it verifies the authenticated actor's current published course, course access, explicit allowed topic/assessment, and runtime entitlement. The course's manual draft files and existing assessment pipeline must then be updated and validated, without adding a parallel grader. The existing three eligible topics are a policy ceiling, not an automatic authorization grant.

## Single Runner constraint

The switch is process-local. It is safe for the existing **single ZoeLearning Runner**. Before running multiple Runner replicas, replace it with a shared atomic revocation state and cross-replica admin-session termination. Never enable admin labs in a multi-replica deployment using this process-local state.

## Local checks

```sh
cd apps/runner
pnpm exec vitest run --root . \
  src/services/execution/learningAdminSwitch.test.ts \
  src/services/execution/learningAdminGrant.test.ts \
  src/services/execution/learningLabMode.test.ts \
  src/services/execution/sandboxProfile.test.ts
pnpm exec tsc -p tsconfig.json --noEmit
```

Deploying source code is a separate gated action. Leave admin labs disabled in dev until the full route + cancellation acceptance tests pass. Never expose the operator control secret or grant secret to a browser.
