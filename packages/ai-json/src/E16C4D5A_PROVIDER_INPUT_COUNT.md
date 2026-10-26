# E16C4D5A — OpenAI provider input-token preflight

- The OpenAI Responses transport builds ONE canonical request body for both
  `POST /responses/input_tokens` and `POST /responses`, removing the two
  non-input accounting fields (`store`, `max_output_tokens`) for preflight.
- The metered executor validates the exact snapshotted request with OpenAI's
  count endpoint BEFORE a ledger reservation and verifies its count fits the
  server-reviewed, model-specific maximum combined input-token ceiling.
- A failure, missing counter, invalid count, over-budget count, or unsupported
  provider is **fail closed before any credit reservation or generation**.
- Once the AI response returns, input usage above the reviewed bound holds the
  reservation for reconciliation rather than silently charging too little.
- This checks OpenAI token counts only. Claude's API describes its count as an
  estimate; DeepSeek's offline tokenizer may differ from provider-reported
  billed usage; Gemini thinking/cache categories need a verified billing model.
- No production model profiles, published pricing rates, authenticated routes,
  credit funding, live paid generation, migrations, Git or deployment changed.

Production activation still requires actual reviewed model price tiers, context
and output caps, premium service-tier restrictions, Stripe funding, and recovery
for unknown provider outcomes. The input count API itself is not an entitlement
or authorization to spend. Keep strict live enforcement disabled.

Documentation:
- https://developers.openai.com/api/docs/guides/token-counting
- https://developers.openai.com/api/reference/resources/responses/subresources/input_tokens/methods/count
- https://docs.anthropic.com/en/docs/build-with-claude/token-counting
- https://api-docs.deepseek.com/quick_start/token_usage/
