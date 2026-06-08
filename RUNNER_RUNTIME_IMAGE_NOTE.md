# Runner runtime image note

Your uploaded `runtime/Dockerfile` was not the runner API container. It is the sandbox/runtime image that the runner uses when it creates per-session containers.

This updated bundle keeps both images:

- `apps/runner/Dockerfile` -> `ghcr.io/OWNER/zoeskoul-runner:TAG`
- `apps/runner/runtime.Dockerfile` -> `ghcr.io/OWNER/zoeskoul-runtime:TAG`

VM 2 must pull both. The runner API container is started by Docker Compose. The runtime image is pulled into the Docker daemon that the runner uses through `RUNNER_DOCKER_SOCKET_HOST`.

In VM 2 `.env`, keep:

```env
GHCR_OWNER=your-github-user-or-org-lowercase
IMAGE_TAG=prod
RUNNER_DOCKER_SOCKET_HOST=/run/user/1000/docker.sock
RUNNER_DOCKER_SOCKET_IN_CONTAINER=/docker.sock
```

The compose file injects:

```env
RUNNER_IMAGE=ghcr.io/$GHCR_OWNER/zoeskoul-runtime:$IMAGE_TAG
```

Do not delete `apps/runner/pty-runner.py`; the runtime image copies it into `/opt/runner/pty-runner.py`.
