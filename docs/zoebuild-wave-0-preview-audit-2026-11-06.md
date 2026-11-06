# ZoeBuild Wave 0 Preview Reliability and Performance Audit

Date: 2026-11-06 (America/Chicago)
Audited revision: `main` / `origin/main` at `741ac89b`
Scope: TanStack Start project creation, dependency preparation, Runner admission,
Vite startup, SSR/document and asset proxying, hydration/navigation, cleanup,
security boundaries, tests, and deploy evidence.

No Waves 1-5 implementation code was changed during this audit. The worktree was
already dirty; all pre-existing modifications and untracked files were preserved.

## Executive conclusion

The primary reliability problem is architectural, not a single timeout or MIME
bug. The browser, the ZoeBuild API, the operation journal, and the live lease
registry each own part of preview state. A healthy Runner lease has no
server-side idempotent lookup/reuse contract. A new accepted start always closes
the existing lease for the same owner/project and performs a new workspace plus
frozen install. Hard refreshes and new tabs lose the module-local browser cache,
so they turn a healthy preview into a cold restart.

The repository already contains a content-verified dependency-layer store, but
the preview Docker driver never calls it. Consequently every preview start runs
`pnpm install --frozen-lockfile --ignore-scripts` in a fresh workspace. In
addition, every SSR/document/asset request starts a new `docker exec` Python
process even though that Python worker is implemented as a multi-request,
six-thread loop. These are confirmed sources of repeated work.

HTTP 409 is not one conflict. It is presently used for stale source CAS,
unsupported stack, dependency-safety/preparation decisions, identity mismatch,
operation/source fences, and the intentional immutable-preview restart signal.
The browser-facing start route also collapses every Runner 409 into
`BUILD_PREVIEW_SOURCE_CONFLICT`. Treating all 409s as “retry start” can therefore
cause repeated startup or obscure a real dependency contract response.

The committed CSS MIME fix is on `origin/main`. The project-identity fix and
capability-root fix exist only as local uncommitted/untracked work. There is no
checked-in production pin file or reachable local Docker daemon, so this audit
cannot attest which image is actually running on either production host.

## Repository and deployment baseline

- `main` and `origin/main` both point to `741ac89b` (`fix(zoebuild): preserve CSS
  Accept through preview gateway`).
- Relevant preceding commits are `d2583491` (capability-scoped Vite assets),
  `c42caef5` (Next-safe `preview-document` route), `2f686e55` (preview install
  resources), `fe5dddf2` (bootstrap memory isolation), and `7f988484` (verified
  image deploy tooling).
- Pre-existing relevant local work:
  - modified `packages/build-application/src/index.ts`;
  - untracked `packages/build-application/src/generatedSiteIdentity.ts` and test;
  - modified TanStack template and test;
  - untracked bare capability-root route and owner test.
- `zoe-infra/hosts/runner/zoebuild/.env` and
  `zoe-infra/hosts/web/.env.zoebuild` are absent from this checkout, as expected
  for secret deployment state. Therefore image digest/revision pins cannot be
  inspected here.
- The local Docker daemon is unavailable, so a real cold install, Vite start,
  SSR, asset waterfall, or failure-recovery benchmark could not be run safely.

## Current architecture and trace

### 1. Project creation

1. `apps/zoebuild/src/app/api/build/projects/route.ts` authenticates the user,
   checks same-origin and rate limits, parses the specification, and invokes the
   application command.
2. `packages/build-application/src/index.ts` admits only
   `tanstack-start-v1`, materializes the registered project, and persists it.
3. `packages/build-materializer/src/index.ts` binds the sole stack from
   `packages/build-registry/src/index.ts` to the sole template from
   `packages/build-template-registry/src/tanstackStartTemplate.ts`.
4. `apps/zoebuild/src/lib/build/createBuildProject.ts` persists CodeProject
   version 1, its initial revision, BuildProject metadata, and optional commerce
   records in one database transaction.
5. The template deliberately has `dependencyLock.policy = "generate-once"` and
   no initial `pnpm-lock.yaml`, so first preview is expected to enter trusted
   dependency preparation.

### 2. First dependency preparation

1. `useReactVitePreview.ts` POSTs the complete saved workspace and source CAS to
   `/preview/start`.
2. `reactPreviewServer.ts` re-reads the owned project, checks the exact source
   version, parses the workspace, and creates the registered TanStack production
   request. Missing lock/approval returns a dependency-related 409.
3. The hook classifies selected dependency 409s and POSTs
   `/dependency-lock/bootstrap` with the original CAS.
4. The bootstrap route revalidates owner/project/source and dependency policy,
   then calls the Runner dependency-lock job.
5. `executeDependencyLockBootstrap.ts` runs a scriptless, networked,
   lockfile-only install. Identical work is coalesced in memory; successful lock
   text can be cached on disk by exact project/files/command/runtime-image ID.
6. The API writes/adopts the signed lock and approval under CAS, then the browser
   rehydrates the canonical saved project and starts again.

This prepares only the lock. It does not prepare reusable `node_modules`, so the
subsequent preview startup performs a second package operation.

### 3. Preview operation, workspace, install, Vite and SSR readiness

1. `/preview/start` submits `/build/previews/operations/start` and returns 202
   without holding the browser request for the install.
2. `previewOperationJournal.ts` coalesces only an identical operation while it is
   still `preparing`; a prior `ready` operation is intentionally not reused.
3. `tanstackPreviewSharedLifecycle.ts` runs inside one process-global serialized
   start coordinator. It reauthorizes the signed exact source.
4. Before starting, it closes every live lease for the same owner/project,
   including an otherwise healthy exact-source lease.
5. Capacity is reclaimed/reserved. Current ZoeBuild policy permits one active or
   pending preview globally.
6. `tanstackPreviewDockerDriver.ts` creates a new private workspace and always
   runs the full frozen, scriptless install in a one-shot networked container.
7. It starts a second network-disabled container running Vite on loopback port
   5173 under the Runner-minted capability base path.
8. `tanstackPreviewLifecycle.ts` probes the capability root until it receives a
   200 `text/html` document containing html/head/body, then registers the lease.
9. The browser polls the operation every two seconds. The ready-status endpoint
   performs another capability-scoped HEAD/MIME liveness check before returning
   the preview.

### 4. SSR document, assets and hydration

1. The browser iframe loads the fixed `preview-document` URL. This route maps to
   the capability root after strict route and capability validation.
2. The ZoeBuild gateway forwards a safe GET/HEAD request to the Runner. It never
   forwards cookies, authorization, host, origin, or arbitrary headers.
3. The Runner validates the live capability and starts a new `docker exec`
   Python worker for this one request. That worker connects only to
   `127.0.0.1:5173`, returns bounded body plus content type, and exits when stdin
   closes.
4. The gateway injects an external navigation bridge into HTML only. The iframe
   has scripts/forms/modals but not `allow-same-origin`, so it has an opaque
   origin.
5. Vite modules and CSS repeat the same gateway -> Runner -> new docker-exec
   path. Versioned dependency JS/CSS may be privately cached for five minutes;
   authored source and HTML are no-store.
6. A frame is promoted only after the exact revision posts a rendered React-root
   attestation. `onLoad` alone is never treated as success.

### 5. Navigation and refresh

- Page-picker, back, forward, and refresh all generate another protected
  `preview-document` load against the same preview lease; they should not restart
  Vite.
- The injected bridge restores the selected TanStack route before module boot.
- A normal document refresh double-buffers iframes and preserves the visible
  previous frame until the new one renders.
- The required catch-all `[...path]` does not register the bare capability URL.
  At HEAD that sibling route is absent. TanStack home navigation or a hard
  capability-root request can therefore be answered by Next with 404 before the
  proxy handler runs. The local P3B7T file adds the missing sibling route but is
  not committed.

## Authoritative state assessment

There is one canonical live lease registry (`sharedFullStackPreviews`), but not
one canonical end-to-end lifecycle state machine:

- Browser hook state: local session cache, in-flight start/restart promises,
  dependency-recovery guards, source/workspace revisions, retry state, and
  `starting/syncing/ready/error` display state.
- Runner operation state: `queued/workspace/dependencies/container/readiness`
  and `preparing/ready/failed/cancelled`, persisted without capability details.
- Runner lease state: separate live/closing maps with no source fingerprint,
  health state, operation identity, or reusable lookup.
- Persistent iframe host state: retains the last ready frame and overlays a
  separate preparation state.

The operation journal is authoritative only for one start request; the lease
registry is authoritative only after readiness. The browser bridges the gap and
decides when to cancel/restart. This violates the objective of one authoritative
operation state machine and makes repeated “Starting preview” states unsurprising.

## Confirmed defects and root-cause evidence

### D1. Healthy previews are not reusable at the server boundary

`startAdmittedTanstackPreview` iterates the live registry and closes every lease
for the owner/project before creating a new preview. It does not compare exact
source bytes/fingerprint or probe health. `PreviewOperationRegistry.start` also
creates a new operation after a prior operation reaches `ready`; its test
explicitly expects a second worker call. A hard refresh/new tab has no browser
module cache and therefore destroys/recreates a healthy process.

Impact: repeated startup, repeated install, avoidable downtime, conflicting tabs,
and unnecessary capacity/rate-limit consumption.

### D2. The dependency-layer cache is implemented but unused

`previewDependencyLayerStore.ts` implements project/actor/dependency/command/
image-keyed, content-attested, read-only layers with leases, TTL, entry and byte
limits. Only its tests import it. `tanstackPreviewDockerDriver.ts` always calls
`executeBuildStep(... TANSTACK_PREVIEW_INSTALL_COMMAND ...)` and never acquires
or publishes a layer.

Impact: every process restart repeats frozen installation and uses a private pnpm
store inside a workspace that is deleted with the preview.

### D3. Every proxied HTTP request pays a new Docker exec/process cost

`fetchTanstackHttpInsideSandbox` creates and starts a Docker exec for every
document, module, CSS file, API read, and liveness check. The embedded Python
worker already supports multiple newline-delimited requests and six concurrent
workers, but the Node caller closes stdin after one request and discards it.

Impact: asset waterfalls accumulate Docker API/exec/Python startup latency and
can dominate hydration even when Vite is already warm.

### D4. Bare capability-root routing is missing at committed HEAD

The committed application has the fixed `preview-document` route and required
catch-all route, but no sibling `content/[capability]/route.ts`. The local
untracked P3B7T implementation documents the exact App Router mismatch.

Impact: HTTP 404 on direct capability root/home navigation or hard refresh.

### D5. Idle/hard lifetime cleanup is not periodic

The live registry sweep (idle 10 minutes, hard lifetime 60 minutes) runs only
inside `reclaimTanstackPreviewCapacity`, which is called during another preview
start. The server timer prunes operation journal files, not live preview leases.
Browser route-unmount timers cannot run after a tab/browser crash.

Impact: a preview can retain a container, workspace and memory indefinitely on a
quiet system until another start or Runner restart. Host maintenance correctly
refuses unsafe mtime-based workspace deletion, so it does not solve this leak.

### D6. Start concurrency is nominally queued but effectively serialized

`PreviewStartCoordinator` has eight admitted waiters but one promise tail; the
front request owns the queue through install, launch, readiness and cleanup.
Waiters time out after 75 seconds. Separately, ZoeBuild capacity is one global
live/pending preview. Reuse checks occur inside this serialized work and after
operation creation.

Impact: unnecessary worker waiting and operation churn, particularly when a
healthy exact preview could have been returned immediately.

### D7. 409 semantics are conflated

Confirmed 409 contracts are:

- `/preview/start` before Runner: stale source CAS, unsupported non-TanStack
  project, invalid/unapproved dependency state, and other preparation errors.
- Runner operation admission: an in-memory newer source operation exists for the
  same actor/project. The browser route maps every Runner 409 to
  `BUILD_PREVIEW_SOURCE_CONFLICT`, losing the upstream category.
- Operation status: project source changed during startup or after liveness
  verification; preview/project/source/base-path identity mismatch.
- Immutable sync endpoint: `TANSTACK_PREVIEW_RESTART_REQUIRED` is intentionally
  represented as 409, distinct from stale source.
- Dependency bootstrap: stale CAS/history, already-approved no-op, restored lock
  policy, unsupported manifest/lock, and other safety decisions.

Impact: retry code cannot make a single correct decision from HTTP status alone.
Code plus operation state must be authoritative.

### D8. Test discovery and architecture tests are broken

- `pnpm test` fails immediately because `turbo.json` defines no `test` task.
- `pnpm exec vitest run apps/zoebuild` reports no files because root
  `vitest.config.ts` excludes `apps/zoebuild`.
- ZoeBuild has `test:build` but no `test` script, so it would not participate in
  a repaired Turbo `test` pipeline without another change.
- Relevant build packages are inconsistently wired into package tests; for
  example `build-contracts` has no package `test` script.
- Correctly discovered cross-package tests expose seven stale/failing legacy
  expectations, including React/Vite template IDs and old commerce runtime
  contracts.
- Runner tests expose two path-expectation failures left behind by the committed
  capability-base change and one macOS/platform-sensitive setgid-mode failure.

Impact: migration regressions are hidden, and “no test files found” can be
mistaken for success by ad-hoc commands.

### D9. Request size contracts disagree

The browser-facing start route accepts up to 12 MiB while Runner Express JSON is
globally limited to 8 MiB. Oversized accepted requests fail before the Runner
route and are mapped by the web route to a generic upstream failure rather than
a stable 413 contract.

### D10. TanStack-only cleanup is incomplete outside the preview path

The sole registered stack/template are TanStack Start, but legacy React/Vite
production validation, preview-plan functions, endpoints, runtime files, test
fixtures, names and profile IDs remain. Notably,
`assertRegisteredProductionBuildFiles` still requires `react-vite-v1` even
though registered production jobs now produce `tanstack-start-v1`. The current
preview driver bypasses this particular assertion through a TanStack-specific
policy, but the duplicate contract is unsafe and already causes tests to fail.

## Hypotheses requiring a production-capable reproduction

The following are plausible but were not marked confirmed without a live pinned
web/Runner/runtime environment:

- Quantitative share of startup time attributable to registry download versus
  workspace creation, pnpm linking, container launch, Vite transform, SSR loader,
  Docker exec transport, and browser hydration.
- Whether the committed CSS Accept fix is present in production images and
  removes all observed CSS MIME failures. Source/tests confirm the path, not the
  deployed digest.
- Whether multiple browser tabs are a frequent trigger for mutual lease
  destruction in production.
- Whether App Router component reuse across project IDs can leave the hook's
  `sessionRef` temporarily pointing to the previous project; route structure may
  remount the component and prevent it.
- Frequency and cause distribution of Runner cleanup failures/quarantined leases.
- Vite/TanStack memory high-water marks under real generated applications.
- Performance of full content attestation when acquiring a large dependency
  layer; correctness is tested, production latency is not measured.

## P3B7R / P3B7S / P3B7T status

| Item | Installed in this worktree | Committed on `origin/main` | Deployment evidence | Assessment |
|---|---|---|---|---|
| P3B7R CSS MIME / Accept | Yes | Yes, `741ac89b` | Not attestable from this checkout | Safe design: reduces browser Accept to `text/css` or `*/*`; tests cover both web and Runner boundaries. |
| P3B7S project identity | Yes, local modifications and untracked helper/test | No | None | New projects personalize one shared `site.ts` from the real project name. It does not migrate existing projects. Local typecheck and ZoeBuild tests pass. |
| P3B7T capability root | Yes, untracked sibling route/test | No | None | Correctly targets the confirmed required-catch-all gap and re-exports GET/HEAD only. Needs Next production build plus real root/no-slash/trailing-slash HTTP acceptance before release. |

The deploy tooling now resolves exact successful-main images and pins both
Runner and runtime by digest, while the web deploy pins matching ZoeBuild images.
That proves a safe mechanism exists; it does not prove an operator ran it after
`741ac89b`, and it cannot deploy P3B7S/T while they remain uncommitted.

## Duplicated, dormant or obsolete components

Safe removal should follow consumer verification and occur after the canonical
lifecycle is live, not as a compatibility shim.

- Direct synchronous Runner start route
  `apps/runner/src/routes/build.previews.start.ts` and web client
  `startTrustedReactPreviewAtRunner`: no ZoeBuild caller uses it; operations/start
  is canonical.
- Immutable sync chain:
  `apps/zoebuild/.../preview/[previewId]/sync/route.ts`,
  `apps/runner/src/routes/build.previews.sync.ts`,
  `tanstackPreviewSyncPolicy.ts`, client function, restart constant and tests.
  The current browser hook never calls this HTTP chain; it decides restart
  locally.
- Owner fetch route is used by the operator canary/tests but not by the web
  application. Retain only if it remains the chosen canary/internal mutation
  transport; otherwise fold it into a dedicated operator harness.
- `apps/runner/runtime/react-vite-v1/` is not referenced by current runtime code.
- `resolveRegisteredReactPreviewServerPlan` and `RegisteredReactPreviewServerPlan`
  are legacy React/Vite-only exports.
- `assertRegisteredProductionBuildFiles` is a legacy duplicate of the active
  TanStack worker policy and currently contradicts the registry.
- Legacy stack IDs remain throughout build preparation/materialization tests and
  `commerceDesign.ts`; several are now failing against the sole TanStack registry.
- `previewDependencyLayerStore.ts` is dormant, not obsolete: it is the intended
  reusable cache but must be integrated and measured.
- Naming such as `ReactPreview*` is semantically obsolete but should be renamed
  only while deleting duplicate APIs, to avoid a cosmetic compatibility layer.

## Security and isolation assessment

The current security invariants are strong and must remain acceptance gates:

- Browser POSTs use same-origin enforcement and authenticated owner reads.
- Every saved source transition is CAS-fenced; project/tenant identity is never
  taken only from the browser.
- Runner calls require a timing-safe shared service secret plus a server-derived
  hashed actor key.
- Production execution-pool middleware permits only `/build/*` on ZoeBuild and
  `/sessions/*` on Learning.
- Infrastructure uses separate Runner services, workspace roots and rootless
  Docker sockets for ZoeBuild and Zoéskoul Learning. They share source/image
  abstractions, not execution resources.
- Dependencies require exact pinned manifests, lockfiles, project-bound signed
  approval, frozen install, and ignored lifecycle scripts.
- Preview capability keys are Runner-minted 192-bit random values. Bearer paths
  permit GET/HEAD only; owner-bound POST requires actor/project/source checks.
- Generated code runs without an exposed port, privileged mode or capabilities;
  the live Vite container has no network and a read-only root filesystem.
- The gateway and Docker worker strip cookies, authorization, proxy/origin/host,
  redirects and Set-Cookie. Bodies and headers are bounded.
- The iframe remains opaque-origin because it lacks `allow-same-origin`.
- Cleanup failures retain capacity and create quarantined, non-routable leases
  instead of silently freeing a slot.

Risks to address without weakening those controls:

- Dependency cache mounts must stay actor/project/lock/image scoped, read-only,
  content-attested and leased until container teardown.
- A persistent Docker-exec transport must remain per-container, accept only the
  existing normalized request schema, have bounded concurrency/response size,
  and be destroyed with the lease.
- Server-side reuse must require exact owner/project/source fingerprint and a
  fresh capability-root health check; preview ID alone is insufficient.
- Process-local registries require one ZoeBuild Runner replica. Do not scale
  replicas until lease/status/routing authority is externalized or sticky
  routing is cryptographically bound and tested.

## Baseline measurements and current budgets

### Measured locally

| Check | Result | Wall time |
|---|---:|---:|
| Correct ZoeBuild suite (`test:build`) | 169 passed files, 3 skipped; 713 passed tests, 7 skipped | 12.24 s |
| Runner suite | 79 passed files, 2 failed; 311 passed tests, 3 failed | 10.27 s |
| Selected build packages | 28 passed files, 6 failed; 91 passed tests, 7 failed | 3.13 s |
| ZoeBuild TypeScript | pass | 18.41 s |
| Runner TypeScript | pass | 5.61 s |
| Incorrect root Vitest discovery | no files, exit 1 | 1.43 s |
| Root Turbo test | configuration failure: missing `test` task | not applicable |

These are developer validation timings, not user preview performance.

### Configured timing/capacity baseline

- Browser start acknowledgement deadline: 120 s; slow notice: 15 s.
- Operation poll interval: 2 s; operation TTL: 60 min.
- Bootstrap container deadline: 240 s. Source comment records healthy cold runs
  exceeding 100 s.
- Preview install deployment default: 480 s; schema range 180-600 s.
- Start coordinator wait deadline: 75 s, eight admitted waiters, serial execution.
- Vite SSR readiness after launch: 60 s, probed every 800 ms.
- Per HTTP Docker exec deadline: 24 s; Vite loopback timeout: 20 s.
- Browser slow-document notice: 20 s; post-load render acknowledgement: 60 s.
- Browser route-reuse grace: 10 min; Runner idle target: 10 min; Runner hard
  lifetime target: 60 min (not periodically enforced).
- Live/pending ZoeBuild previews: one global. Operation records: 64 preparing.
- Response body ceiling: 6 MiB; request body ceiling to generated POST: 256 KiB.
- Dependency layer design: 24 entries, 256 MiB/item, 1 GiB total, 24 h TTL;
  currently unused.
- Bootstrap lock caches: 16 in-process/1 h and 64 persistent/7 d.
- Workspace root quota: 2 GiB; required free headroom: 8 GiB and 10%.

No defensible cold-start, warm-reopen, asset-waterfall or recovery percentile can
be stated from this machine because Docker and production pins are unavailable.
That absence is itself a Wave 1 observability gap, not a passing measurement.

## Measurement contract for subsequent waves

Use one correlation chain (`requestId` -> `operationId` -> non-secret preview
identifier) and record bounded numeric/categorical metadata only. Never log
source, capability keys, dependency contents, paths, credentials or raw errors.

1. **Dependency preparation**: API receipt -> policy decision -> cache
   hit/join/resolved -> Runner completion -> CAS commit. Report cache mode,
   elapsed time and bounded lock size.
2. **Cold preview**: accepted operation -> queue acquired -> workspace ready ->
   dependency cache lookup/install -> container started -> first valid SSR ->
   operation ready -> iframe document response -> rendered attestation.
3. **Warm reopen**: start/reopen intent -> exact healthy lease returned -> iframe
   rendered. Assert same preview ID, zero install containers and zero Vite launches.
4. **SSR readiness**: Vite container start -> first valid 200 HTML, with attempt
   count and last bounded status category.
5. **Asset/hydration**: browser document request start -> HTML TTFB -> last
   render-blocking CSS/JS response -> exact rendered bridge attestation. Include
   per-request `Server-Timing` for gateway and Runner transport.
6. **Recovery**: injected transport death, Vite death and Runner restart ->
   authoritative failure detection -> cleanup confirmation -> newly rendered
   preview. Count automatic attempts; maximum one browser-visible automatic retry.
7. **Resources**: per-preview container RSS/CPU/PIDs, install peak, workspace
   bytes, dependency-cache bytes, live/closing/quarantined leases, queue depth,
   cleanup age/failures and Docker-exec worker count.

Initial acceptance targets should be validated under representative projects
before becoming SLOs. A useful provisional gate is: warm reopen performs no
install/launch and renders in <=3 s p95 on the production path; prepared-layer
cold launch reaches SSR in <=15 s p95; uncached network install is separately
reported rather than hidden inside “starting.”

## Proposed Waves 1-5

Each wave is independently deployable and must stop for validation before the
next begins.

### Wave 1 - Truthful tests, routing correctness and observability baseline

Scope:

- Register a Turbo `test` task in `turbo.json`.
- Add a canonical `test` script to `apps/zoebuild/package.json`; add missing
  relevant package test scripts (at minimum `packages/build-contracts/package.json`).
- Keep Runner on its own Vitest config/setup; do not force it through root
  Vitest. Add one root preview-validation script in `package.json` that invokes
  ZoeBuild, Runner and relevant build-package suites explicitly.
- Update stale migration tests in:
  - `apps/runner/src/services/build/tanstackPreviewOwnerHandoff.test.ts`;
  - `apps/runner/src/services/workspace/workspaceFilesystemPolicy.test.ts` with
    a Linux-only setgid assertion or portable filesystem capability guard;
  - legacy failing tests under `packages/build-contracts/src`,
    `packages/build-application/src`, `packages/build-preparation/src`, and
    `packages/build-template-registry/src/commerceStorefront.test.ts` so they
    assert TanStack-only contracts.
- Land and validate the existing P3B7T sibling capability-root route and its
  test. Run a production Next build and HTTP acceptance for root with and
  without trailing slash, `preview-document`, CSS and nested routes.
- Land P3B7S only after its existing tests and a newly-created-project acceptance
  pass; do not mutate existing projects.
- Add phase timestamps/counters to
  `previewOperationJournal.ts`, `tanstackPreviewSharedLifecycle.ts`,
  `tanstackPreviewLifecycle.ts`, `tanstackPreviewDockerDriver.ts`, and the
  document gateway. Surface bounded aggregates on the authenticated Runner
  metrics response and browser `Server-Timing`.

Risks:

- Tests that read source strings can pass without runtime behavior; add callable
  and HTTP acceptance where possible.
- Metrics can leak identities or create high-cardinality load; use categories and
  aggregates, never capability/project/user labels.

Acceptance:

- `pnpm test` actually discovers tests and fails on any suite failure.
- ZoeBuild/Runner/relevant build-package suites and both TypeScript checks pass.
- No “no test files found” result is accepted.
- P3B7R CSS response is `text/css`; P3B7T root returns SSR HTML; P3B7S new source
  uses the requested project identity.
- A single canary trace reports all six timing segments without sensitive data.

### Wave 2 - One authoritative idempotent preview lifecycle and healthy reuse

Scope:

- Replace the split operation/lease ownership in
  `apps/runner/src/services/build/previewOperationJournal.ts`,
  `sharedPreviewRegistry.ts`, `sharedPreviewRuntimeState.ts`, and
  `tanstackPreviewSharedLifecycle.ts` with one Runner-owned state machine:
  `queued -> workspace -> dependencies -> container -> readiness -> ready ->
  stopping/cleaning -> terminal`.
- Bind lifecycle identity to hashed actor, project, source version, exact source
  fingerprint, dependency fingerprint and runtime image identity.
- Make operations/start idempotently return an exact healthy `ready` lease or
  join its in-flight operation before entering the serialized cold-start queue.
- Give ready leases an owner-authenticated liveness/status lookup; never trust a
  browser cache or preview ID alone.
- Simplify `apps/zoebuild/src/components/builder/useReactVitePreview.ts` to a
  projection of server operation state. Keep
  `PersistentReactPreviewHost.tsx` as display retention only, not lifecycle
  authority.
- Keep `apps/zoebuild/.../preview/start/route.ts` and operation status as the one
  control-plane API. Remove the unused direct synchronous start route/client.
- Align browser/Runner request size limits and preserve exact 409 codes rather
  than collapsing all Runner conflicts.

Risks:

- Incorrect reuse can cross tenant/source boundaries or expose stale server
  functions.
- Races between reuse, project deletion, source advance and cleanup can resurrect
  a lease.

Acceptance:

- Concurrent identical starts return the same operation/preview and invoke one
  worker.
- Hard refresh and a second tab reuse the same healthy preview with zero install
  and zero Vite launches.
- Different owner/project/source/fingerprint never reuses.
- Source advance and project drain are linearizable against reuse.
- Runner restart marks old leases failed, reaps resources, and permits exactly
  one clean replacement.

### Wave 3 - Reusable, verified dependency layers

Scope:

- Wire `previewDependencyLayerStore.ts` into
  `tanstackPreviewDockerDriver.ts` and the lifecycle handle.
- Derive the key from actor/project, approved package+lock fingerprint, exact
  install command and immutable runtime image ID.
- On miss, perform the existing scriptless frozen install, publish a detached
  content-attested layer, and retain the private install for that first preview.
- On hit, mount only the verified `node_modules` layer read-only; provide bounded
  private writable Vite cache mount/tmpfs without making package content
  writable. Extend `assertTanstackSandboxOptions` accordingly.
- Release cache leases only after verified container teardown. Preserve TTL,
  bytes/files/entry limits and fail closed to a normal private install on cache
  unavailability/tamper.
- Add cache mode and verification/install timings to Wave 1 metrics.

Risks:

- Writable nested mounts, hardlinks, symlinks and eviction races can weaken
  isolation.
- Full-tree verification may erase the intended latency gain.
- The 1 GiB cache plus live workspaces can exceed the current 2 GiB workspace
  quota unless accounting distinguishes and jointly caps them.

Acceptance:

- First approved dependency fingerprint installs once; subsequent cold process
  starts use no network/install container.
- Cross-owner/project/lock/image reuse is rejected.
- Tampered content, symlink escape, unexpected hardlink, expired layer and active
  eviction all fail safely.
- Live layer cannot be evicted; failed teardown retains its lease/capacity.
- Learning pool filesystem, Docker socket, limits and behavior are unchanged.

### Wave 4 - Persistent bounded preview HTTP transport and browser critical path

Scope:

- Refactor `tanstackPreviewDockerTransport.ts` to retain one authenticated
  newline-framed Docker exec worker per live preview container and use the
  existing request IDs/thread pool in `tanstackPreviewHttpWorker.ts`.
- Add bounded pending requests, per-request deadlines, worker restart-at-most-once,
  response demultiplexing and teardown hooks owned by the canonical lifecycle.
- Keep `tanstackPreviewHttpBoundary.ts` as the sole normalization boundary.
- Update `tanstackPreviewSharedLifecycle.ts`, driver/handle types and tests to
  attach/destroy the transport with the lease.
- Measure the document and blocking asset waterfall in
  `RemoteWebPreview.tsx`; retain rendered-root attestation and opaque iframe.
- Keep the P3B7R Accept enum and existing no-cookie/no-redirect/no-Set-Cookie
  response policy.

Risks:

- A persistent worker can accumulate memory, mix responses or survive its lease
  if IDs/teardown are wrong.
- Unbounded multiplexing can overload Vite or Runner memory.

Acceptance:

- One worker serves a representative SSR+CSS+JS waterfall; no per-asset Docker
  exec is created.
- Concurrent responses are matched to exact request IDs; malformed/late/oversize
  responses cannot poison another request.
- Worker/container death fails pending requests, cleans resources and allows one
  bounded recovery.
- Header/cookie/origin/port/path traversal security tests remain green.
- CSS MIME, nested navigation, hard refresh and server-function loaders pass.

### Wave 5 - Operational cleanup, retirement and production acceptance

Scope:

- Add a periodic live-lease sweeper and graceful shutdown drain in
  `apps/runner/src/server.ts` and the canonical lifecycle registry. Enforce idle,
  hard lifetime and quarantined cleanup without mtime-only deletion.
- Extend authenticated `/metrics` with live/starting/closing/quarantined counts,
  queue age, cache size, workspace bytes and cleanup failures.
- Enforce one ZoeBuild Runner replica in deploy validation until lifecycle state
  and request routing are externalized; do not pretend the process-local maps are
  multi-replica safe.
- Remove verified-dead compatibility surface:
  - direct start and sync Runner routes plus web sync route/client/constants;
  - `apps/runner/runtime/react-vite-v1/`;
  - React/Vite-only preparation plan/types and contradictory assertions/tests;
  - obsolete stack IDs/profile names/comments after TanStack replacements pass.
- Correct the active production-build assertion to the registered TanStack
  worker bundle contract; keep preview and production execution policies DRY
  where they truly share trusted install/sandbox abstractions.
- Run immutable-image build, staged ZoeBuild-only deploy, canary, rollback test,
  resource soak and production SLO capture. Do not touch Learning deployment.

Risks:

- Removing a route still used by an operator canary or commerce flow can break
  recovery; prove call graphs and update the canary first.
- Periodic cleanup races with activity unless `touch`, close and transport work
  share the same lease lock/state machine.
- Deploy pin mismatch can leave web and Runner on incompatible contracts.

Acceptance:

- Idle and hard-lifetime previews close on schedule even with no new start.
- Browser crash, Runner restart and failed cleanup leave no untracked container
  or workspace; quarantined resources remain counted until verified removal.
- 24-hour representative soak stays within memory/disk/container/worker bounds.
- All legacy IDs/endpoints identified above have no runtime consumers and are
  deleted, not shimmed.
- ZoeBuild web, Runner and runtime images share one verified source SHA/digest
  set; rollback is demonstrated; Learning resources and service remain unchanged.
- Cold, warm, dependency, SSR, asset/hydration and recovery p50/p95/p99 are
  recorded and compared with the Wave 1 baseline.

## Go/no-go recommendation

Do not tune timeouts or raise concurrency first. The next bounded change should
be Wave 1 so tests and measurements become truthful and P3B7T is made deployable.
Then implement exact healthy reuse before dependency/transport caching. Reuse
removes the largest avoidable work without weakening isolation; the later cache
and persistent transport changes should be evaluated against the measurements it
creates.
