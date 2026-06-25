# Zoeskoul E2E suites

The default E2E gate is intentionally small and contract-focused.

## Default stable suite

Run:

```bash
pnpm --filter @zoeskoul/web test:e2e
```

This runs only high-signal tests that match the current curriculum/runtime conventions:

- catalog visibility smoke
- review progress save/restore harnesses
- curriculum i18n starter-code contract clone
- terminal workspace contract clone
- reveal/fill multi-file regression
- one real route navigation smoke
- one stale-tools isolation smoke

## Opt-in suites

Runner/PTY tests require a healthy local runner and are not part of the default gate:

```bash
pnpm --filter @zoeskoul/web test:e2e:runner
```

Long FullIDE terminal/workspace integration tests are opt-in:

```bash
pnpm --filter @zoeskoul/web test:e2e:ide
```

Legacy broad route/workspace suites are preserved for archaeology and manual debugging, but are not the default quality gate:

```bash
pnpm --filter @zoeskoul/web test:e2e:legacy
```

Raw everything is available when you intentionally want the old exhaustive run:

```bash
pnpm --filter @zoeskoul/web test:e2e:all
```

## Why this split exists

The old suite mixed several concerns in one default command:

- real catalog route behavior
- dev clone behavior
- runner/PTY availability
- browser history behavior
- workspace precedence
- old project question conventions

That made `validate:full` noisy and slow. New regressions should prefer a clone contract test plus one focused real-route smoke, then unit tests for lower-level workspace precedence.
