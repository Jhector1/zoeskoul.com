# E16C4D3 — model billing registry review (2026-10-19)

This file is NOT an authorization to charge users. No model is activated.
The production billing registry remains empty by design.

## Models actually named by `packages/build-routing/src/index.ts`

| Provider | Exact route model ID | Review status |
| --- | --- | --- |
| OpenAI | `gpt-6-luna` | API model exists; all-billable-input bound and processing-tier restrictions still require implementation and review |
| OpenAI | `gpt-6.1-sol` | API model exists; long-context/tier and reasoning billing requirements still require implementation and review |
| Gemini | `gemini-3.1-flash-lite` | Exists; Gemini cache/thought/media pricing and bounded accounting not yet implemented |
| Gemini | `gemini-3.8-flash` | Exists; Gemini cache/thought/media pricing and bounded accounting not yet implemented |

The manual `ZOEBUILD_AI_PROVIDER` + `ZOEBUILD_AI_MODEL` override may
introduce other IDs. Exact-match reviewed entries are mandatory for them too.

## Published documentation to examine before onboarding a model

- OpenAI models: https://developers.openai.com/api/docs/models
- GPT-6 Luna: https://developers.openai.com/api/docs/models/gpt-6-luna
- GPT-6.1 Sol: https://developers.openai.com/api/docs/models/gpt-6.1-sol
- OpenAI pricing/tier tables: https://developers.openai.com/api/docs/pricing
- Gemini models: https://ai.google.dev/gemini-api/docs/models
- Gemini pricing: https://ai.google.dev/gemini-api/docs/pricing

The published OpenAI GPT-6 model pages specify a *higher rate* for requests
exceeding 272,000 input tokens and surcharges for nonstandard processing tiers.
The generic E16C4D1 text-token calculator does not model those differences.
This registry therefore rejects >272,000 combined-input limits for its two
routed OpenAI models, but additional verified prompt-size enforcement is still
required. Merely asserting a max is insufficient: the provider must actually
restrict input, or the server must count and reject oversized prompts using a
compatible tokenizer before dispatch, including system/schema/context tokens.

Before activation, independently verify and record: pricing effective dates;
cached-read/write treatment; long-context pricing; processing tier/residency;
all reasoning/thinking tokens; tools and media fees; real model context limits;
server-side prompt token budgeting and provider output cap semantics; and the
credit conversion/version. Recheck after pricing and model updates.

## Activation prerequisites

1. Do not accept a billing profile or price catalog from the browser or AI model.
2. Server-only reviewed registry entry for the exact provider/model/price version.
3. Transport must fix the appropriate service tier and disallow billable tools
   or unsupported modalities, rather than assume the provider default.
4. Verify input+reasoning/output ceilings are enforceable *before* reservation.
5. Integrate registry resolver into live generation **and** targeted edit routes,
   and test each fallback/failed attempt independently.
6. Fund lots only from verified subscription periods and settled Stripe events.
7. Build reconciliation for provider failures, unknown usage and interruptions.

Nothing in E16C4D3 changes paid routes, model routing, currency conversions,
credit balances or subscriptions.
