import test from 'node:test';
import assert from 'node:assert/strict';
import { selectedCanonicalDatabaseUrl } from './canonicalDatabaseUrl.mjs';

test('selects only DATABASE_URL', () => {
  assert.equal(selectedCanonicalDatabaseUrl({DATABASE_URL:'  postgres://localhost/x '}), 'postgres://localhost/x');
  assert.equal(selectedCanonicalDatabaseUrl({}), undefined);
});
test('refuses all obsolete aliases even when same value as DATABASE_URL', () => {
  for (const key of ['ADMIN_DATABASE_URL', 'WEB_DATABASE_URL']) {
    assert.throws(() => selectedCanonicalDatabaseUrl({DATABASE_URL:'secret', [key]:'secret'}),
      /DEPRECATED_DATABASE_ALIAS_CONFIGURED/);
  }
});
test('does not expose secrets in its errors', () => {
  try { selectedCanonicalDatabaseUrl({DATABASE_URL:'top-secret', WEB_DATABASE_URL:'top-secret'}); }
  catch (error) { assert.equal(String(error).includes('top-secret'),false); return; }
  assert.fail('expected refusal');
});
