# E16C4D6 — Provider-published model pricing reviews (NOT billing activation)

Review date: 2026-10-19. Currency: USD per million tokens. Production approval: **NONE**.
Source-backed rates are recorded in `publishedModelPriceReviews.ts`, and an extra
**production-only** comparison in `reviewedAiBillingRegistry.ts` refuses a policy
whose active four-category rate matrix differs from the freshly reviewed source.
An older observation (>7 days), unrecognized model, duplicate rates, mismatched
source, long-context ceiling or unapproved provider fails closed.

| Model | Standard input | Cached input | Cache writes | Output | Source |
|---|---:|---:|---:|---:|---|
| `gpt-6-luna` | $0.10 | $0.01 | $0.125 | $0.50 | https://developers.openai.com/api/docs/models/gpt-6-luna |
| `gpt-6.1-sol` | $2.00 | $0.10 | $2.50 | $10.00 | https://developers.openai.com/api/docs/models/gpt-6.1-sol |

Both model pages document a **272,000 input-token short-context threshold** and
**128,000 model output-token limit**. Requests above 272K are billed at **2x input
and cache rates and 1.5x output** for the full request. Regional processing is
10% more expensive, and Fast/Flex/Ultrafast differ. The current architecture
only attempts OpenAI Standard pricing, so this patch explicitly refuses use of
the short-context review above 272K. The input-token preflight and output caps
from E16C4D5A/C still must be independently validated at dispatch.

Important: the OpenAI price list includes **cache write** fees while E16C2's
OpenAI usage normalizer does not surface a distinct cache-write counter and
E16C4D1's ceiling did not separately model an OpenAI cache-write scenario.
Before allowing paid requests, confirm the provider's cache-write semantics and
ensure they are covered conservatively in reservation **and** actual settlement.
Do not silently assume the fee is zero or covered by ordinary input. Actual
processing region and data residency need explicit enforceable controls too.

Other routed providers remain NOT ELIGIBLE, even though published rate pages exist:
- `gemini-3.1-flash-lite`: https://ai.google.dev/gemini-api/docs/pricing
  (text input $0.25, output including thinking $1.50 per million in Standard)
- `gemini-3.8-flash`: introductory Standard text input $0.75 and output including
  thinking $3.75 per million through 2026-12-31; published prices double in 2027.
  Model-specific thinking, caching, media and counting are not certified here.

**NOT done:** active pricing registry, verified credit-conversion funding,
provider-side regional controls, cache-write reconciliation, live generation/
edit routes, and unknown-outcome recovery. No DB, migrations, actual provider
calls, secrets, credits, Git, deployment or production AI charge activation.
