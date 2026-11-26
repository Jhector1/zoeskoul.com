# ZoeBuild local development: verified startup

This is scoped to `apps/zoebuild`, not the monorepo root or ZoeLearning. It uses the **original** `dev` script, preserved verbatim under `dev:server` by the guarded installer, instead of guessing Next.js flags or changing the UI.

## Commands

Run from `apps/zoebuild`:

- `npm run dev` — start the original Next.js server, wait for HTTP 200 on port 3004, run the project-contained authority/tunnel health check (`--prepare`), refuse silent fallback if required checks fail, and monitor drift at a 120-second interval. Stop using Ctrl+C.
- `npm run dev:server` — the **exact existing** server command without the automatic infrastructure checks (explicit troubleshooting bypass). This command does not verify runner readiness.
- `npm run dev:check` — read-only infrastructure health check (expects Next.js already running).
- `npm run dev:prepare` — check and, if missing, restore the existing **loopback-only** reverse SSH tunnel before verifying infra (expects Next.js already running).
- `npm run dev:watch` — dedicated full read-only report every 60 seconds in a second terminal.
- `npm run dev:test-startup` — isolated fixture tests; does not contact Ubuntu or use port 3004.

## Intended behavior

On startup, the wrapper first refuses to start if port 3004 is occupied (it **never** kills the process already holding that port). It launches `npm run dev:server` as its own child, waits for the local listener, checks the SSH alias `zoeskoul-dev`, the existing reverse SSH tunnel on the VM `33004`, the **exact** ZoeBuild Runner UID 1001, the authority endpoint and shared secret agreement, and recent Runner failures. Only then does it print `ZOEBUILD_DEV_INFRA=READY`. If a required check fails, it terminates **only the server process group it launched** and reports a nonzero exit status.

The checker is the project-contained version of the working U20G startup health script, using project-relative paths instead of a fixed user worktree. The current local VM contract remains intentionally strict: `jean-VirtualBox|jean`, `zoebuild-runner-runner-1`, rootless socket `/run/user/1001/docker.sock`, Runner authority bridge `172.31.254.1:3004`, and SSH key alias `zoeskoul-dev`. Adjusting those contracts requires a separately reviewed change; they must not silently point to an arbitrary VM or container.

Logs append to `~/.zoeskoul/logs/zoebuild-startup/YYYY-MM-DD.log` with private permissions. The checker never prints secrets or secret hashes. It reads from ignored local `.env.development.local`, never writes to it, and never modifies the existing `.env.local` symlink. No Docker operations mutate state.

Every 120 seconds, the wrapper rechecks infrastructure and prints failures/status transitions. Each check appends a redacted report, but successful unchanged cycles do not spam the main terminal. The normal Next.js output remains visible.

## Scope and limitations

`ZOEBUILD_DEV_INFRA=READY` means Mac and Runner **infrastructure** passed. Actual browser HMR still requires opening an authenticated ZoeBuild project and confirming `start` 200, `read-access` 200, `vite_signal_connected`, `bridge_bound`, and `iframe_vite_client_ready`. Do not equate Next.js `[HMR] connected` with the iframe's Vite signal.

Do not commit `.env.development.local`, `.env.local`, SSH private keys, or logs. `dev:server` remains available if VM access is intentionally unavailable. The local SSH bridge isn't a production transport; production must have independent deployment health and observability.

Optional dev-only overrides: `ZOEBUILD_DEV_PORT` (defaults to 3004; does not modify original server's port), `ZOEBUILD_DEV_START_TIMEOUT_MS` (10–300 seconds, default 120 seconds), and `ZOEBUILD_DEV_WATCH_INTERVAL_MS` (30–600 seconds, default 120 seconds). Keep the port aligned with the original Next.js command and the authority bridge configuration.

## Reversibility

The guarded installer stores the exact pre-patch `package.json` in a private per-worktree backup directory, and `--rollback` restores those bytes only if the installed package and generated project files have not been edited. It never reverts unrelated Git changes. Once this feature is committed and integrated normally, use ordinary Git changes instead of the one-time installer rollback.
