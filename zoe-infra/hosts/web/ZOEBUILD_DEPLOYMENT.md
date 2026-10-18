# ZoeBuild App placement — Web host, not runner

## Physical split

- **Web host (Contabo):** Zoéskoul Web + ZoeBuild App + ZoeBuild ingress signer,
  existing Zoéskoul auth and database. ZoeBuild is an **opt-in Compose overlay**:
  `docker-compose.zoebuild.yml` rather than editing the existing Web deployment.
- **Runner host (VirtualBox staging / runner VPS):** Learning Runner, Judge0,
  and existing runner-managed website builds and Vite previews. No ZoeBuild App
  or ingress-signer container should be started on this host.

## First use — no automatic deployment

1. Ensure the WEB HOST has checked out `zoe-infra/hosts/web` in its sparse checkout.
   Do not change the Runner checkout or its locally modified Caddyfile.
2. Copy `.env.zoebuild.example` to `.env.zoebuild` and
   `.env.zoebuild.app.example` to `.env.zoebuild.app`, both mode 0600.
   Use real independent secrets; both Compose and Caddy must share ONLY the
   edge-auth secret, while only signer and App share the HMAC signing key.
3. In `.env.zoebuild.app`, point to the **existing Zoéskoul Web PostgreSQL
   database on `postgres:5432`**, using compatible schema and existing shared
   auth/session configuration; do not create a second auth implementation.
   Verify private runner API connectivity and all provider credentials separately.
4. Confirm the **real** edge Caddy is on the Compose external `public` network;
   copy and import `Caddyfile.zoebuild.fragment` ONLY after verifying header
   stripping, edge-only reachability, domain and client-IP trusted proxy chain.
   Load the edge secret into Caddy through its own approved secret environment.
   No automatic Caddy change is made by `deploy-zoebuild.sh`.
5. Confirm schema migration status read-only before authorizing a deployment.
   The application deploy script does NOT run migrations or enable Shopify.
6. Set all three `.env.zoebuild` confirmation flags to `yes` only after actual
   verification; `--check` is still required and does not replace inspection.
7. `./deploy-zoebuild.sh --check` performs read-only preflight checks; then
   `./deploy-zoebuild.sh` pulls two matching immutable images and recreates
   **only** the ZoeBuild App and signer. An explicit SHA permits rollback.

Neither `./deploy.sh` (existing Web deploy) nor the Runner's deploy script is
modified. Existing Web Caddy/Runner networking, Judge0 and containers are not
restarted by ZoeBuild's overlay deployment.

## GitHub publication

The existing manual `build-zoebuild-image.yml` workflow builds the two
images from Git SHA. This deployment defaults to the latest **successful
manual main-branch workflow**, not newest Git commit or a mutable `prod` tag.
Publishing images is separate from deployment. `--check` does not pull images.

## Disable-by-default gates

`ZOEBUILD_SHOPIFY_OAUTH_ROUTES_ENABLED=false`,
`ZOEBUILD_SHOPIFY_ACCEPTANCE_RUNTIME_GATE=''`, and
`ZOEBUILD_PUBLISH_ENABLED=false` are hardcoded at Compose service boundary.
Shopify is not production accepted: real store/test checkout and database
migration application remain unverified.

No new VPS or separate rootless Docker worker is introduced by this patch.
