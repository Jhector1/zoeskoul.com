# ZoeBuild: runner-side execution policy and ingress-signer source

The **ZoeBuild App** is now an opt-in service on the **Zoéskoul Web host**, via
`zoe-infra/hosts/web/docker-compose.zoebuild.yml` and `deploy-zoebuild.sh`.
The old application Compose/deployment here is retired; `deploy.sh` is an intentional
fail-closed guard to prevent incorrect app deployment on the Learning Runner VM.

This directory retains:
- Ingress-signer **source code/Dockerfile** used by the existing GH Actions image-build workflow.
- Disabled future independent runner worker policy (`worker-policy.json`).
- `validate-scaffold.sh` to test signer logic without deployment.

**Learning Runner**, Judge0, and ZoeBuild preview/build code execution remain on the
existing runner host. Existing runner route-level build and preview capacity limits
are separate from the disabled independent-worker policy; they are not proof of
physical CPU/RAM isolation.

No migration, Shopify activation, independent worker, new VPS, or production
rollout is performed by the relocation patch.
