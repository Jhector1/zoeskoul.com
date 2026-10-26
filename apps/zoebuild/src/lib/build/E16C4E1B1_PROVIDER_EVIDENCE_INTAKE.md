# E16C4E1B1 — Held AI-charge evidence journal (NO financial resolution)

The preceding E16C4E1A database migration and source tests are validated locally.
This patch adds an **append-only evidence metadata table** linked to each held-charge case.

- Provider information is explicitly limited to OpenAI, matching the metered implementation eligible for current Standard-tier review. Other providers remain blocked.
- An authenticated internal operator may later submit a provider usage-export, invoice, or support-reference **identifier**, a SHA-256 **digest**, the reported outcome, an optional reported cost, a reviewer identifier and an observation time.
- Duplicate `evidenceKey` submissions are idempotent if and only if all immutable fields match. Changed amounts, owners, reviewers or hashes produce conflict errors.
- Evidence can be attached only to an existing reconciliation case while the reservation is `reserved` and owned by the indicated user.
- Evidence metadata and its audit event are written together inside a single database transaction. The financial ledger is neither accessed nor modified for settlement or release.
- No raw prompts, responses, provider keys, invoices, or supporting documents are stored in the evidence table. A digest helps detect subsequent alteration but **does not authenticate the provider or certify an invoice**.

## Not yet authorized

This is **not** a provider verifier, a charge-recovery tool, a signed operator approval, a billing endpoint, or a payment settlement system. The new function is a server-owned primitive only. A future authenticated operator workflow must independently obtain, validate and retain provenance for evidence before a separate atomic ledger decision can be permitted. An uploaded hash, a reviewer label or `not_billed` report alone MUST NEVER release customer funds. No provider charge is assumed to be zero on timeout or reservation expiry.

Both live model/operations approval registries remain empty. `ZOEBUILD_AI_CREDITS_ENFORCEMENT=required` must remain off.

## Local migration

Migration **source only** is included: `20261019213000_e16c4e1b1_ai_reconciliation_evidence`. Installation with `--apply` changes files only; it does **not** execute SQL. Before applying locally, verify the correct database target in `.env.shared.local` and confirm only this migration is pending. Do not migrate an unknown or production database. The current phase makes no provider calls, credits/grants, real Stripe changes, routes, Git commits or deployments.
