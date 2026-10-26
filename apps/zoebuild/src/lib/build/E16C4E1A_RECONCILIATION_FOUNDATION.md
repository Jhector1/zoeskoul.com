# E16C4E1A — Durable held-charge detection, not financial resolution

This preparatory phase adds two audit tables linked to the AI credit reservation.
It journals provider-unknown and settlement-pending outcomes after an actual
reserved call, without preserving raw provider errors, prompts, or responses.

Duplicate journal attempts are idempotent by held reservation and reason code.
An internal read-only scanner finds ANY aged `reserved` reservation, including
cases where the server crashed after the paid call but before journaling.

**No auto-release or auto-settle is implemented.** Neither an HTTP error nor
an expired pending reservation proves the provider did not bill. The accounting
ledger remains the financial source of truth. An independent, verifiable
provider evidence workflow, authenticated operator access, atomic case/ledger
resolution, idempotent retry, audit retention, and monitoring are needed before
this can be approved for production.

Migration must be applied deliberately to the local development database,
followed by `prisma generate` and the repository test suite. No production
migration, model approval, funded credits, live route or deployment is included.

The production billing readiness and model approval registries remain EMPTY;
keep `ZOEBUILD_AI_CREDITS_ENFORCEMENT=required` disabled.
