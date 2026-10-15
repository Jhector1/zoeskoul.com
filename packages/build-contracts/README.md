# @zoeskoul/build-contracts

Provider-neutral ZoeBuild domain contracts.

## Invariants

- No Cloudflare, Neon, Stripe, Square, Expo, Docker, or other vendor SDK types.
- `CodeProject` remains the canonical source/workspace and ownership record.
- Build requirements describe capabilities, not provider choices.
- Stack definitions reference adapters by stable IDs so providers can change later.
- Mobile is a target of the same Build project, not a separate product data model.
