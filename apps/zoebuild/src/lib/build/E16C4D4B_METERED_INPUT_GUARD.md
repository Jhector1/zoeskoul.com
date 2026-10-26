# E16C4D4B — Metered input-envelope preflight

Before a metered AI call reserves credits, the executor checks UTF-8 payload bytes
for the system message, user message, schema name and serialized JSON schema.
Unsupported media and malformed schemas remain fail-closed. The executor
snapshots the validated fields before awaiting an asynchronous credit reserve,
then sends the stable snapshot to the provider.

The current platform-wide maximum is **64 KiB UTF-8** for these supplied text
and schema fields. This is an extra **payload-size guard only**, not a safe
upper bound on provider billable tokens. Provider wrappers may supply additional
request overhead, and no provider-specific tokenizer or input cap is proved by
this patch. Do **not** derive token reservations from the 64 KiB byte limit.

The reviewed production billing registry stays empty, and live AI routes are
not connected. Future input-cost authorization requires provider/model-specific
proof of all billable input, relevant tier/context rules and exact provider
framing, or an independently verified conservative request budget.

No database, migrations, credit grants, live billing, Git or deployment.
