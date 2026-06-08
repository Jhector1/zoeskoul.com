# Ubuntu VM preview runbook

From your monorepo root:

```bash
cp -R /path/to/this/infra ./infra
cd infra
make prereqs
make rootless
make env
make preflight
make up
make smoke
```

With web:

```bash
ENABLE_WEB=1 make up
```

With Judge0:

```bash
ENABLE_JUDGE0=1 make up
ENABLE_JUDGE0=1 make smoke
```

Firewall lockdown:

```bash
sudo SSH_PORT=22 ./firewall/ufw-preview-lockdown.sh
```

Check host hardening:

```bash
make hardening-check
```

Test the rootless Docker daemon used by the runner:

```bash
make rootless-test
```

## Common failures

### Rootless socket missing

Run:

```bash
./scripts/install-rootless-docker.sh
```

Then log out and back in if needed.

### Runtime image not found by runner

Run:

```bash
./scripts/build-runtime-for-runner.sh
```

This builds the runtime image into the same Docker daemon the runner uses.

### Need temporary runner local port

Only for local debugging:

```bash
EXPOSE_RUNNER_LOCAL=1 ./scripts/deploy-preview.sh
```

The port binds to `127.0.0.1`, not `0.0.0.0`.

### Need temporary Judge0 local port

Only for local debugging:

```bash
ENABLE_JUDGE0=1 EXPOSE_JUDGE0_LOCAL=1 ./scripts/deploy-preview.sh
```
