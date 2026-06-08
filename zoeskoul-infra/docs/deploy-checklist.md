# Deploy checklist

Before preview deploy:

- [ ] Ubuntu VM has enough memory. Judge0 may need several GB.
- [ ] Docker Compose v2 works.
- [ ] Rootless Docker works for the deploy user.
- [ ] `infra/env/*.env` generated and chmod 600.
- [ ] `RUNNER_DOCKER_SOCKET_HOST` points to `/run/user/<uid>/docker.sock`.
- [ ] `ALLOW_ROOT_DOCKER_SOCKET=0`.
- [ ] `./scripts/preflight.sh` passes.
- [ ] `./scripts/build-runtime-for-runner.sh` passes.
- [ ] `./scripts/smoke-test.sh` passes.
- [ ] Firewall has no public 2358/4001/5432/6379.

Deploy:

```bash
./scripts/deploy-preview.sh
./scripts/smoke-test.sh
./scripts/host-hardening-check.sh
```
