# Runner execution pools (development refactor)

One TypeScript runner image, two independently authenticated-by-platform, rootless execution pools:

- `zoeskoul-learning/`: `/sessions/*`, Judge0, short-lived sandbox execution.
- `zoebuild/`: `/build/*`, React/Vite previews, verified dependency layers and builds.
- `gateway/`: sole public ingress; path-routing through one existing `RUNNER_DOMAIN`.
- `shared/`: common Compose definition, deploy, smoke tests, cleanup and validation.

**No database/source-version migration is performed.** This is a development-environment cutover. Existing runner containers are stopped and recreated; old running previews do not survive. No `docker volume prune` and no Docker-wide `image prune -a` during deploys.

## Required preflight

1. Install patch in *both* `zoe-infra` and the Zoéskoul application repo, then run the app runner tests. Build and publish the runner image that contains `executionPoolGuard.ts` before enabling the two-pool architecture.
2. Make sure the old rootless Learning daemon is healthy.
3. On Ubuntu, provision a second rootless daemon: `./setup-zoebuild-executor.sh --install`. This creates `zoebuild-exec` and its own Docker socket; it does **not** repurpose the Learning Docker daemon.
4. With original `hosts/runner/.env` present, run `python3 prepare-dev-env.py` to create three separate `.env` files (mode `0600`). Review them locally, never upload them. It intentionally does not copy Judge0 DB credentials to ZoeBuild. Both execution pools use the existing shared platform authentication credentials pending a separate platform-client credential split.
5. Disable old maintenance before cutover: `sudo systemctl disable --now zoeskoul-runner-storage-maintenance.timer` (if installed).
6. Stop old development Compose stack before deploying the new gateway (to release ports 80/443): use the *old* `hosts/runner/docker-compose.yml` or the old Compose project (`runner`). Do not run `down -v`.
7. Validate `./deploy.sh --check`, then `./deploy.sh all`. The `all` command creates the shared private ingress network, deploys Learning, ZoeBuild, and gateway in that order.
8. After verification: `./install-maintenance.sh` sets independent Learning hourly and ZoeBuild six-hour scoped rootless cleanup timers.

## Security invariants

- Caddy routes `/build/*` only to ZoeBuild; other requests go to Learning. The runner enforces the same allow-list itself (`executionPoolGuard.ts`).
- Two rootless Docker sockets must have different owners and paths; pools must have different workspaces. Every pool checks isolation and refuses system Docker as an executor.
- Runtime and runner images share source, but rootless daemon image stores, sandbox containers, and workspaces are separate.
- The public Caddy gateway alone binds host ports. Internal runner services have no published ports.
- Neither pool deletes workspaces based on directory mtime: a workspace might still belong to a live session. Existing application-level TTL / workspace quota remains responsible; a future safe host-side workspace sweeper must check authoritative live ownership before deletion.
- Rootless executor cleanup is pool-scoped. ZoeBuild retains its Docker images and verified dependency layer directory; Learning prunes stale stopped containers, dangling images, and build cache.
- `RUNNER_PUBLIC_SMOKE=false` by default so VM-local dev smoke won't misreport a known external TLS/network issue; enable true for release acceptance. Gateway config check remains mandatory.

## Resource caveat

Both pools still share the VM's physical CPU, memory, and storage. With ~3.8 GiB VM RAM, do not raise build/runner concurrency until load tests validate the capacity; the `512m` default per runner is deliberately conservative.

## Operational commands

```
cd /opt/zoeskoul/zoe-infra/hosts/runner
./deploy.sh --check
./deploy.sh all
./smoke-test.sh
./storage-audit.sh
```

No automatic deployment or systemd changes are performed by the patch installer.
