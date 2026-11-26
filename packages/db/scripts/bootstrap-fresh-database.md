# Fresh local PostgreSQL initialization (111-migration checkpoint)

Use only for a newly created disposable/local database. The tool requires an
explicit maintenance URL to `127.0.0.1:<port>/postgres`, password authentication,
and an unused database name matching `zoe_fresh_[a-z0-9_]{8,40}`. The caller must
own/administer the cluster and reserve the new database for exclusive use during
bootstrap. Never point this at a production tunnel or shared production cluster.

Install locked dependencies and PostgreSQL client tools first. From repository root:

```bash
python3 packages/db/scripts/bootstrap-fresh-database.py --self-test
# Supply ZOE_FRESH_POSTGRES_ADMIN_URL securely in the environment, not in history.
python3 packages/db/scripts/bootstrap-fresh-database.py --new-database zoe_fresh_example01
unset ZOE_FRESH_POSTGRES_ADMIN_URL
```

The script creates a NEW database (template0), refuses every existing target,
checks the reviewed immutable migration manifest, applies the first 44, checks
the historical index preconditions, records the premature rename as applied,
then deploys the remaining 66 unchanged migrations. It verifies the complete
ledger, final unique index, schema comparison and repeat deployment. It does
not seed or configure any app. It never drops a database. On failure, keep the
new database for inspection; do not rerun against it. Use a different new name
only after diagnosing the failure. The manifest is pinned to the reviewed 111
migrations; future migration changes require a deliberate update and rehearsal.

Existing environments retain their normal reviewed migration-deploy workflow.
Do not apply this workaround to an existing or partially migrated database.
A plain migrate deploy from an empty database still has the historical ordering
problem. Production upgrade compatibility and external deployment automation are
separate gates. No existing credential records are read or deleted by this tool.
