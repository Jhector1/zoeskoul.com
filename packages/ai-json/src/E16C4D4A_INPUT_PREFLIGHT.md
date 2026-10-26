# E16C4D4A — Input payload preflight (foundation, not credit authorization)

`assertAiJsonInputEnvelope` measures UTF-8 bytes in the complete caller-owned text
and serialized response schema and rejects unsupported media or non-JSON schemas.
This implementation is intentionally **not wired into paid routes**.

A raw UTF-8 byte limit is **not** a guaranteed upper limit for billable input
or long-context pricing. Before production use, obtain verified provider-specific
counting/transport guarantees for system+user+schema+hidden overhead, service tier,
all input/cached/reasoning/output categories, tools/media and model pricing dates.
Count or reject the complete actual transport request immediately before dispatch.
Do not construct a reservation from this helper's result.

The registry stays empty and the strict enforcement flag stays disabled until the
actual billable-token bound, provider price schedules and live route wiring pass tests.
