# PostgreSQL 17 production operations

Run as the deploy user. The independent Compose project `zoeskoul-db17`
resides at `$HOME/.local/share/zoeskoul-db17-hotfix`. The tracked
`db17-compose.yml` is its configuration template; the installed copy is
`compose.yml` in that directory. The existing `.env` (pinned database image),
`admin-password` and external volume `zoeskoul_pg17_data` must be preserved.
The shared external network `zoeskoul_db_private` is internal. Do not
publish a database port, reuse the old PG16 volume, or run `down -v`.
Application deployment deliberately does not recreate PostgreSQL.

Runtime URL is in the web `.env`; migration URL is in
`$HOME/.local/share/zoeskoul-db17-hotfix/db5a-stage/migration-url` (0600).
Never commit or paste credentials or database dumps. `migrate.sh` runs the
Prisma CLI in an isolated container with owner-effective migration access.
`backup-postgres.sh` produces a private custom archive and checksum, but is
not off-site backup automation. `restore-postgres.sh` restores into a new
explicitly named recovery database only; promotion requires separate review.
Do not remove the original PostgreSQL 16 service or volume until separately
approved. Commit only reviewed infrastructure source, never `.env` or staging
artifacts. Coordinate deployment jobs with maintenance windows.
