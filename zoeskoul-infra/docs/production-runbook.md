# Production-preview runbook

## Start

```bash
cd infra
./scripts/deploy-preview.sh
./scripts/smoke-test.sh
```

## Stop

```bash
./scripts/stop-preview.sh
```

## Logs

```bash
./scripts/logs.sh
./scripts/logs.sh runner
./scripts/logs.sh caddy
```

## Rebuild runtime for runner

```bash
./scripts/build-runtime-for-runner.sh
```

## Backup Postgres

```bash
./scripts/backup-postgres.sh
```

## Restore Postgres

```bash
./scripts/restore-postgres.sh /path/to/backup.sql.gz
```

## Security checks

```bash
./scripts/assert-safe-runner.sh
./scripts/host-hardening-check.sh
./scripts/check-secrets.sh
```
