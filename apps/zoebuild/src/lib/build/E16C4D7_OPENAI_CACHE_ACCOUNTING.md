# E16C4D7 — Complete OpenAI cache-write accounting (not activation)

Official Responses usage fields: `usage.input_tokens`,
`usage.input_tokens_details.cached_tokens`,
`usage.input_tokens_details.cache_write_tokens`. OpenAI prompt-caching docs
confirm three **mutually exclusive** input classes, not additive write fees.

- Normalize both provider cache counters without inventing absent values.
- Settle a metered OpenAI response only if **both** counters are present,
  valid nonnegative integers, and `cached + written <= input_tokens`.
- Price ordinary input as `input_tokens - cached - written`, then apply the
  independently reviewed cached-read and cache-write rates to their actual counts.
- Before reservation, maximize across **all three** possible input categories
  (including cache writes), plus the bounded output cost.
- Missing or contradictory provider usage holds reserved funds for reconciliation;
  it must not be priced as zero cache writes or returned as a free response.
- Preflight zero-usage price schedule validation uses explicit zero cache
  counters; it does not authorize any production model.

Documentation: https://developers.openai.com/api/docs/guides/prompt-caching
https://developers.openai.com/api/reference/resources/responses/methods/create

## Still blocked

The compiled production approval registry remains empty. Exact model limits,
region/data-residency charges, reviewing rates before expiry, Stripe-funded
credit lots, live generation/edit wiring and unknown-outcome reconciliation
remain prerequisites. No database, migrations, provider calls, live charging,
Git, or deployment is included in this patch.
