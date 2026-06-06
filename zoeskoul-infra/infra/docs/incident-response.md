# Incident response

## Runner compromise assumption

If runner behavior is suspicious, assume the runner host is compromised because it has Docker daemon access.

Immediate steps:

1. Remove runner from load balancer/Caddy.
2. Rotate `RUNNER_SHARED_SECRET`, `PTY_ATTACH_SECRET`, and `RUNNER_EDGE_SECRET`.
3. Snapshot logs.
4. Rebuild runner host from a clean image.
5. Review app logs for abuse.
6. Review Docker container history on runner host.

## Database compromise

1. Take app offline.
2. Snapshot server and logs.
3. Rotate DB password and all app secrets.
4. Restore from known-good backup if needed.
5. Audit user/admin actions.
