# ZoeBuild VirtualBox staging deployment

This is a separate deployment from the learning runner. `./deploy.sh` does not
restart Judge0, the learning runner, or the existing runner Caddy. It does not
modify Contabo, Docker rootless executor, or a production database.

## Behavior

- `./deploy.sh`: query the GitHub Actions workflow `build-zoebuild-image.yml`
  for the newest *successful manual main-branch workflow run*, use its SHA,
  pull app + signer images at that SAME pinned SHA and start staging on the VM.
- `./deploy.sh --check`: validate env, resolve tag, and validate merged Compose
  without pulling images or mutating Docker.
- `./deploy.sh <40-character-sha>`: install a specific previously published
  build, including for rollback. No ambiguous `latest` or `prod` tags.
- `./deploy.sh --check <sha>`: offline preflight of an explicit pinned tag.

### One-time setup, VM

```bash
cd /opt/zoeskoul/zoe-infra/hosts/zoebuild
umask 077
cp -n .env.example .env
cp -n .env.app.example .env.app
chmod 600 .env .env.app
nano .env
nano .env.app
./deploy.sh --check
./deploy.sh
```

Set `GHCR_OWNER=jhector1` in `.env`, plus two **different** randomly-generated
secrets (32+ bytes each). Add `ZOEBUILD_STAGE_DB_CONFIRMED=yes` to `.env` ONLY
after confirming `.env.app` uses staging-only PostgreSQL and the existing shared
auth config. The resolver defaults to source repo `jhector1/zoeskoul.com`, or
accepts `GITHUB_SOURCE_REPO=jhector1/zoeskoul.com` in `.env`.

For private GitHub repositories, provide `GH_TOKEN` securely in the invoking
shell with Actions read access (do not put it in `.env` or logs). For private
GHCR packages, configure `docker login ghcr.io` with `read:packages` access.

If the build workflow has never succeeded, trigger it manually first on `main`.
Images are only published by that workflow, not by the learning-runner deploy.

To open from Mac, with VirtualBox SSH port forwarding already configured:

```bash
ssh -p 2222 -N -L 13004:127.0.0.1:13004 jean@127.0.0.1
```

Then browse http://localhost:13004 . HTTPS/authenticated cookies are NOT part
of this HTTP-only smoke test. This test does not enable publishing or Shopify.

Rollback example: `./deploy.sh 1ad124274460e7ce5f84ff3774a23580029151e2`
(only works if BOTH images exist for that SHA).

To examine only ZoeBuild staging: `docker compose -p zoebuild-stage -f
./docker-compose.yml -f staging/docker-compose.http.yml --env-file .env ps`.
Never run `docker system prune` to deploy staging.
