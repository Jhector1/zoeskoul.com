#!/usr/bin/env bash
set -euo pipefail

# Reuse the pool-wide health, port-isolation, and configuration admission check.
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
"$SCRIPT_DIR/../shared/smoke-pool.sh" zoeskoul-learning "$@"
cd "$SCRIPT_DIR"

# Judge0's synchronous wait may exceed a short client timeout despite healthy
# execution workers. Submit asynchronously and poll the real completion status.
# No auth values, source content, tokens, or response bodies are printed.
docker compose --env-file .env -f compose.yml exec -T runner node <<'NODE'
'use strict';

const root = process.env.JUDGE0_URL;
const secret = process.env.JUDGE0_AUTHN_TOKEN;
const header = process.env.JUDGE0_AUTHN_HEADER || 'X-Judge0-Token';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function requireCondition(condition, reason) {
  if (!condition) throw new Error(reason);
}

async function request(path, method = 'GET', payload) {
  let response;
  try {
    response = await fetch(new URL(path, root), {
      method,
      headers: {
        [header]: secret,
        ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (error) {
    const kind = error?.name === 'TimeoutError' ? 'request-timeout' : 'transport-error';
    throw new Error(kind);
  }
  requireCondition(response.ok, `http-${response.status}`);
  try {
    return await response.json();
  } catch {
    throw new Error('response-not-json');
  }
}

async function main() {
  requireCondition(Boolean(root && secret), 'missing-judge0-configuration');

  const created = await request('/submissions?base64_encoded=true&wait=false', 'POST', {
    language_id: 71,
    source_code: Buffer.from('print(90)\n').toString('base64'),
  });
  requireCondition(typeof created?.token === 'string' && created.token.length > 0,
    'submission-token-missing');
  console.log('LEARNING_JUDGE0_SUBMISSION_ACCEPTED');

  for (let attempt = 1; attempt <= 15; attempt++) {
    await delay(2000);
    const result = await request(
      `/submissions/${encodeURIComponent(created.token)}?base64_encoded=true`);
    const status = result?.status?.id;
    requireCondition(Number.isInteger(status), 'submission-status-missing');
    if (status === 1 || status === 2) {
      console.log(`LEARNING_JUDGE0_PENDING attempt=${attempt} status=${status}`);
      continue;
    }
    requireCondition(status === 3, `submission-final-status-${status}`);
    requireCondition(typeof result.stdout === 'string', 'submission-output-missing');
    const output = Buffer.from(result.stdout, 'base64').toString('utf8').trim();
    requireCondition(output === '90', 'submission-unexpected-output');
    console.log('LEARNING_JUDGE0_SMOKE_PASS');
    return;
  }
  throw new Error('submission-not-finished-within-poll-window');
}

main().catch(error => {
  console.error(`LEARNING_JUDGE0_SMOKE_FAIL reason=${error.message}`);
  process.exitCode = 1;
});
NODE
