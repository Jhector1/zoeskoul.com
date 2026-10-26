# E16C4D4C — Complete planner-request policy inspection

The E16C4C/D2 metered planner formerly resolved its billing policy before the
shared BuildAiPlanner constructed the complete system prompt, user message, JSON
schema name and JSON schema. A future input-token verifier could only inspect a
partial request or a separate reconstruction, allowing a mismatch.

The metered planner now constructs the deterministic JSON request with a
**metadata-only transport facade**, checks its text/schema payload up to 64 KiB,
snapshots the envelope, and provides a separate copy to the trusted server-side
`resolveAttemptPolicy(candidate, attemptIndex, request)` callback. Only after
reviewed policy derivation does it instantiate the real provider transport and
call the metered executor. Mismatched transport model IDs are refused.

Each fallback attempt retains an independent credit idempotency key. No live
route is wired, the reviewed production model registry remains empty, and
strict paid AI enforcement must remain disabled.

**Still required:** provider/model-specific proof of every billable input token
(including hidden API overhead), output/reasoning charges, context-tier
semantics, model price registry, credit funding, live generation/edit wiring,
unknown-outcome reconciliation. A byte-checked request is not a token count.

This patch has no database, migrations, provider calls, credit grant, Git or
deployment side effects.
