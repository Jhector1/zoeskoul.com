/** Database-target selection for plain Node ESM scripts.
 * TypeScript services use packages/db/src/databaseUrl.ts.
 * Never silently select a separate database through an obsolete alias.
 */
export function selectedCanonicalDatabaseUrl(environment = process.env) {
  for (const key of ['ADMIN_DATABASE_URL', 'WEB_DATABASE_URL']) {
    if (environment[key] !== undefined) {
      throw new Error(`DEPRECATED_DATABASE_ALIAS_CONFIGURED:${key}`);
    }
  }
  return environment.DATABASE_URL?.trim();
}
