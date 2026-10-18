# ZoeBuild on the existing runner host (scaffold only)

This infrastructure lives on the **existing paid Zoéskoul runner server**. It
is **not** a request for a new VPS. It is intentionally separate from the
educational runner's Compose services, secrets and execution permissions.

## What this initial patch implements

- Separate ZoeBuild Next.js Docker image (port 3004, no public port mapping).
- Separate edge HMAC signer container (port 8090, no host port mapping) with an
  independent shared edge-auth secret, private application network and no
  Docker socket. Generated code never runs in the Next.js app or signer.
- Caddy site fragment **not imported**. Existing Caddy config untouched.
- Images built on explicit manual GitHub Actions invocation, by immutable SHA;
  no auto-deployment, no `prod` tag overwrite, no migration execution.
- Conservative quotas on the builder app and signer.
- Separate *disabled* generated-code worker policy. **No runnable worker has
  been added yet**, because passing the current learning runner's Docker socket
  into an untrusted build executor would be unsafe.

## Before any deployment (blocked until all pass)

1. Verify which Caddy daemon actually handles the ZoeBuild hostname. The
   current runner Caddyfile has not been changed by this scaffold.
2. On that actual Caddy host, ensure the `public` Docker network exists and
   only the reverse proxy can reach the signer. Configure trusted Cloudflare
   IP ranges and `client_ip_headers CF-Connecting-IP` *only when ingress is
   Cloudflare-restricted at network level*; otherwise `{client_ip}` may be a
   Cloudflare edge address, not the buyer. Do not trust arbitrary forwarded IP.
3. Import and validate `Caddyfile.fragment` only after proving the client-IP
   trust chain, matching pathname, edge secret, and no direct upstream access.
   Caddy must overwrite edge-auth and IP; signer discards supplied proof.
4. Create private `.env` (Compose interpolation) and `.env.app` (Next secrets)
   with mode 0600. Do not expose environment values in validation reports.
   Inject `ZOEBUILD_EDGE_SHARED_SECRET` into actual Caddy separately; keep
   `ZOEBUILD_BUYER_IP_SIGNING_KEY` out of Caddy entirely. Generate distinct
   secrets >= 32 UTF-8 bytes. Inject HMAC key into signer and Next only.
5. Confirm a private network route to the existing database. **Never expose
   PostgreSQL publicly merely to make ZoeBuild work**. ZoeBuild should use
   Zoéskoul's existing auth session, not a new sign-in provider.
6. Validate immutable CI images, Compose network membership and effective
   memory budgets against the runner server's actual capacity and existing
   learning-runner reservations. Default app 1 CPU / 1536 MiB, signer 0.2 CPU
   / 128 MiB; worker policy is disabled until isolation exists.
7. Verify committed Shopify migrations against deployed database separately
   using authorized *read-only* commands. Do not infer applied status from
   source files. Shopify remains gated off in this Compose definition.
8. Exercise signed header spoofing, invalid signatures, exact request paths,
   and normal ZoeSkoul student runner sessions before any release.

## Local-only checks

`bash zoe-infra/hosts/zoebuild/validate-scaffold.sh`

Never pipe `docker compose config` without `--quiet` into a shared log: it may
print resolved secrets. The patch intentionally supplies no deploy command.

## Cost and worker boundary

`worker-policy.json` defines initial budgets **but does not enforce them until
an actual worker is implemented**. Build/preview execution needs a separate
restricted sandbox identity, dedicated queues, concurrency limits, idle expiry,
no privileged containers, no host mounts or Docker socket, no payment secrets,
and controlled egress. It may run on the *same machine* as the learning runner,
but must not share the learning runner process/service identity. If the host
lacks spare RAM/CPU, queue jobs or leave workers disabled rather than degrading
student exercise execution.

## Deployment status

This is only a code scaffold. Neither Docker images nor deployment runtime,
proxy, certificates, database migrations, Shopify credentials, nor the runner
worker have been deployed or verified.
