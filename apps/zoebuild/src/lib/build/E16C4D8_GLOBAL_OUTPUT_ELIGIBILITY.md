# E16C4D8 — Global endpoint and output-cost eligibility (NO activation)

## Scope

- Uses the **first-party OpenAI transport's snapshotted URL base** for both input-count and generation endpoints. A mutation of construction options cannot change the destination between calls.
- The metered executor accepts only `https://api.openai.com/v1` for the existing `region: global` published Standard-price reviews. Missing evidence, prefixed regional hosts (`us.api.openai.com`, `eu.api.openai.com`), FedRAMP, custom API bases, and proxies are **not authorized** until an independent, source-reviewed fee policy exists. This endpoint restriction is NOT a provider-attested processing location, nor proof of the API project's configuration.
- Provider-specific model policy must declare `maxBillableOutputTokens === maxOutputTokens`, because the OpenAI Responses `max_output_tokens` limit includes reasoning/output tokens. Policies with larger unsupported allowances cannot be used to reserve credits.
- The executor holds the reservation and refuses settlement when provider `usage.output_tokens` exceeds that server-enforced limit, or reported reasoning tokens exceed total output tokens. It does not return the response in either case.
- The production approval list stays **EMPTY**. All provider rates, caps, attestations, credit funding and account/region terms must still be independently reviewed before considering activation.

## Official documentation used for scope review (2026-10-19)

- https://developers.openai.com/api/docs/pricing (regional and FedRAMP price uplift)
- https://developers.openai.com/api/docs/guides/your-data (per-project and per-request region selection using prefixed endpoints)
- https://developers.openai.com/api/reference/resources/responses/methods/create (`max_output_tokens`, actual `service_tier` response)

## Still required before production

Live generation/edit route wiring, authenticated per-user credit entitlements, verified Stripe-funded credit lots, independently re-reviewed provider prices when observations expire, model-specific context and service policies, provider usage reconciliation on unknown outcomes, and strict enforcement activation. No DB migration, Git, provider calls, region changes, credit grants, or live charges occur in this patch.
