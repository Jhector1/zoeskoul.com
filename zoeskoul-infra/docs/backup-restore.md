# Backup and restore

## Backup

```bash
cd infra
./scripts/backup-postgres.sh
```

Backups are written to `BACKUP_DIR` from `env/production.env`.

## Restore

```bash
cd infra
./scripts/restore-postgres.sh /var/backups/zoeskoul/postgres/zoeskoul-postgres-YYYYMMDDTHHMMSSZ.sql.gz
```

Restore is destructive and requires typing `RESTORE`.

## Real production rule

A backup is not valid until a restore has been tested on a separate machine.
