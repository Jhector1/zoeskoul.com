# ZoeBuild application vs. ZoeBuild runner

- The **ZoeBuild application** is hosted with Zoéskoul Web under `hosts/web/`.
- The **ZoeBuild execution runner** is independently deployed from `hosts/runner/zoebuild/`, using the same runner application image as Learning but a separate rootless Docker executor and workspace.
- Runner-agnostic deployment/cleanup helpers are in `hosts/runner/shared/`.
- `hosts/runner/gateway/` routes the existing Runner domain's `/build/*` endpoints only to the ZoeBuild pool, and `/sessions/*` to Learning.

This directory retains the ZoeBuild ingress-signer source and the intentionally disabled application deployment guard. Pool execution policy is configured by the ZoeBuild runner's `.env` and enforced in the runner backend. There is **no separate worker-policy.json** or duplicate runner implementation.
