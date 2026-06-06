# Security notes for the single-VM preview

This bundle is hardened for a one-Ubuntu-VM preview, but it is not equivalent to a multi-host production security boundary.

## Runner security model

The runner defaults to a rootless Docker socket:

```text
RUNNER_DOCKER_SOCKET_HOST=/run/user/<uid>/docker.sock
RUNNER_DOCKER_SOCKET_IN_CONTAINER=/run/runner-docker/docker.sock
ALLOW_ROOT_DOCKER_SOCKET=0
```

The preflight refuses `/var/run/docker.sock` unless you explicitly set `ALLOW_ROOT_DOCKER_SOCKET=1`.

Why this matters: the normal Docker daemon/socket is root-equivalent. Anyone who can control it can usually create privileged containers or mount host paths. Rootless Docker reduces that blast radius by running the daemon and child containers as an unprivileged user.

## Runner service hardening

The runner service uses:

```text
read_only: true
cap_drop: ALL
security_opt: no-new-privileges:true
tmpfs for /tmp and /run
pids_limit
mem_limit
cpus
no public host port by default
```

The runtime image is built into the rootless runner daemon by `scripts/build-runtime-for-runner.sh` so the runner's Docker daemon can see it.

## Judge0 security model

Judge0 remains privileged because the standard Judge0 CE container expects that mode for its sandbox stack. Therefore Judge0 is:

```text
internal-only
not published to the host by default
token protected through AUTHN_HEADER/AUTHN_TOKEN
using its own Postgres and Redis
using Redis password
pinned to judge0/judge0:1.13.1
resource-limited with conservative defaults
```

For real production, move Judge0 to a separate disposable VM.

## What is still not solved on one VM

- A kernel/container escape in runner/Judge0 can still affect the same VM.
- Judge0 is still privileged.
- Rootless Docker is safer than the root socket but not a perfect sandbox.
- Outbound network blocking for child execution containers depends on the runner implementation honoring `RUNNER_CHILD_NETWORK=none` / `RUNNER_DISABLE_NETWORK=1`.

## Real production rule

Run these as separate trust zones:

```text
Host A: web + Postgres + Redis
Host B: runner / PTY / code execution
Host C: Judge0
Host D optional: Caddy edge
```
