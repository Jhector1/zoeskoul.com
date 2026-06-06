# Zoeskoul single-VM hardened production-preview infra

This bundle is meant for a **production-like preview on one Ubuntu VM**.

It hardens the original preview setup as much as is reasonable on one host:

- Caddy is the only public entry point.
- Runner is not published to the host by default.
- Judge0 is not published publicly by default.
- Runner defaults to a **rootless Docker socket**, not `/var/run/docker.sock`.
- The dangerous root Docker socket is refused unless you explicitly opt in.
- Judge0 is internal-only, token-protected, pinned to `judge0/judge0:1.13.1`, and has conservative execution limits.
- Secrets are generated locally and ignored by git.
- Networks are split into backend, edge, runner execution, and Judge0 internal networks.
- Backup, restore, preflight, smoke, firewall, and lockdown scripts are included.

## Important truth

No single-VM setup can make untrusted code execution "fully secure" in the same way that separate disposable execution hosts can. This bundle is a **hardened preview**. For real production, move runner and Judge0 to isolated hosts.

## Fast path on Ubuntu VM

Copy the `infra/` folder into the root of your `zoeskoul.com` monorepo, then run:

```bash
cd infra
./scripts/install-ubuntu-prereqs.sh
./scripts/install-rootless-docker.sh
./scripts/generate-env.sh
./scripts/preflight.sh
./scripts/deploy-preview.sh
./scripts/smoke-test.sh
```

Optional web build:

```bash
ENABLE_WEB=1 ./scripts/deploy-preview.sh
```

Optional Judge0 preview:

```bash
ENABLE_JUDGE0=1 ./scripts/deploy-preview.sh
```

Optional local debug ports, only bound to `127.0.0.1`:

```bash
EXPOSE_RUNNER_LOCAL=1 ./scripts/compose.sh -f compose/runner/compose.expose-local.yml up -d runner
ENABLE_JUDGE0=1 EXPOSE_JUDGE0_LOCAL=1 ./scripts/deploy-preview.sh
```

## Main safety defaults

- Runner uses `RUNNER_DOCKER_SOCKET_HOST=/run/user/<uid>/docker.sock`.
- Runner mounts that socket at `/run/runner-docker/docker.sock`.
- Runner passes `DOCKER_HOST=unix:///run/runner-docker/docker.sock`.
- Runner has `read_only`, tmpfs, no new privileges, no Linux capabilities, PID limit, memory cap, and CPU cap.
- Judge0 uses its own Postgres and Redis, its own internal network, auth token headers, and no public `2358` port.

## Layout

```text
infra/
  env/                         # examples only; generated env files ignored
  compose/app/                 # Postgres, Redis, optional web
  compose/runner/              # hardened runner compose
  compose/edge/                # Caddy only public entry
  compose/judge0/              # internal Judge0 preview
  scripts/                     # install, deploy, smoke, backup, checks
  firewall/                    # UFW scripts
  docs/                        # runbooks and security notes
  systemd/                     # optional backup timer units
```
