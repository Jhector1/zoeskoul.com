# V12J.16B — Paid targeted-edit selection and acceptance preflight

Status: **CODE GUARD ONLY; PROVIDER SPENDING NOT APPROVED OR ACTIVATED**.

## Evidence already present
- The user's V12J.16A Mac run: 4/4 Node architectural checks, 5/5 Vitest cases, ZoeBuild TypeScript PASS.
- $5 Stripe TEST checkout reconciled: one paid PaymentIntent, one purchased 500,000-unit lot/grant, same webhook replay returned HTTP 200 with unchanged wallet.
- Targeted-edit POST already enforces project ownership, entitlement, source version, same-origin, rate limits, stable operation IDs in required billing mode, and source-file allowlisting. PATCH is separate and owner-authorized.
- Existing metered executor counts OpenAI input before reserving, enforces output cap, binds outbound client request ID, records provider receipts, saves encrypted replay result and settles canonical ledger. Missing cost evidence leaves funds held.

## This patch
- In `ZOEBUILD_AI_CREDITS_ENFORCEMENT=required` targeted-edit mode, select `openai/gpt-6-luna` **only through the exact compiled pricing+operational readiness resolver**. No fallback to manual model settings, Gemini/Claude/DeepSeek or unmetered transport when selection fails.
- The first model must have input limit <=20,000 tokens and output cap <=4,096 tokens. The executor rechecks approval and rederives the reservation immediately before dispatch.
- If approvals remain absent, the edit intentionally fails before selecting a paid provider. No credits are charged and the existing free-mode route is unchanged.
- No NODE_ENV route, new database, Stripe call, fake approval, pricing activation or model-operation grant.

## Still required before enabling spending
1. Operator re-verification of published **current** Standard/global rates including **cache write retention**. OpenAI lists $0.125/million for 30-minute writes and $0.25/million for 12-hour writes for Luna. The current four-category rate map has only one cache-write price: verify the transport's retention semantics, or model the 12-hour cost conservatively before approval. Model review expires after seven days.
2. Provider account endpoint/region and tier verification (not only the code's default HTTPS base URL).
3. Reviewed credit conversion and markup economics, loss bounds, cost alerts and refund/dispute recovery.
4. Route-level authorization/operation ID acceptance across real **intent + edit** browser workflow (both may invoke a provider) and a verified configured encrypted result-journal key.
5. Aged/uncertain reservation reconciliation, audit retention, and independent operations sign-off with real evidence IDs. The `ZOEBUILD_APPROVED_BILLING_OPERATIONS` array must not be filled from invented references.
6. Re-run the existing real one-edit receipt and same-operation-ID replay acceptance, then confirm `500000 - settledUnits` wallet and no duplicate request.

Do NOT change the global `ZOEBUILD_AI_CREDITS_ENFORCEMENT` setting solely to force this test before all required routes are operationally approved. The `apps/zoebuild` UI-caller collector included here identifies the exact edit/intent browser flow for the next integration batch.
