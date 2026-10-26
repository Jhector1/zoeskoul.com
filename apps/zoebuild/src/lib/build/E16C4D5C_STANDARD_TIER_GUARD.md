# E16C4D5C — Metered OpenAI Standard-tier guard (not live billing activation)

The OpenAI Responses API defaults to `service_tier: "auto"` when omitted. Project settings
can then alter pricing. To ensure the prepared text-only credit policy cannot silently
settle at a different processing rate, the metered executor **forces** `serviceTier: "default"`
server-side. The OpenAI transport encodes this as `service_tier: "default"` plus
`truncation: "disabled"`; these non-input-billing fields are removed from the separate
`/responses/input_tokens` request. Both calls share the same model, system, input, and schema.

On generation, the OpenAI transport carries the **actual provider-returned**
`service_tier` into its metadata. A metered call settles only when that value equals
`"default"`. Missing, unknown, Fast, Flex, or Ultrafast metadata holds the existing
reservation and returns a pending-settlement error for reconciliation. No silent standard-
rate charging of premium-tier output.

Official API reference (2026-10-19 review):
https://developers.openai.com/api/reference/resources/responses/methods/create

This patch neither registers price schedules nor approves any production models.
It does not enforce regional premiums, confirm cache write semantics, authorize
input billing ceilings, fund credit lots, or connect any live generation/edit route.
The production billing registry remains intentionally EMPTY. Keep strict live
AI-credit enforcement off until complete review and route/funding integration.
