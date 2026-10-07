# ZoeSkoul Closure Agent V2.3.1

Adds automatic repair for malformed/unapplicable model-generated unified diffs.

- Uses `git apply --recount` for stale hunk counts.
- If a patch still fails, sends the exact `git apply` error, rejected patch, and current target-file contents back to ChatGPT.
- Retries patch-format repair up to 3 times without restarting the failing gate.
- Whole-repo engineer mode remains enabled.
- Commit/push remain disabled.
