# Network map

## Public host ports

```text
80/tcp   -> Caddy
443/tcp  -> Caddy
```

No public runner, Judge0, Postgres, or Redis ports are published by default.

## Docker networks

```text
zoeskoul-backend          internal: Postgres, Redis, web, runner
zoeskoul-edge-web         bridge:   Caddy -> web only
zoeskoul-edge-runner      bridge:   Caddy -> runner only
zoeskoul-judge0-internal  internal: Judge0 API, worker, Judge0 DB, Judge0 Redis, optional web
```

## Runner Docker daemon

The runner talks to rootless Docker through:

```text
host:      /run/user/<uid>/docker.sock
container: /run/runner-docker/docker.sock
```

## Judge0

Judge0 listens only inside Docker unless `EXPOSE_JUDGE0_LOCAL=1` is set. Even when exposed locally, it binds to `127.0.0.1`.
