import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, mkdir, rm, writeFile, copyFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = join(dirname(fileURLToPath(import.meta.url)), 'zoebuild-dev-verified.mjs');

async function freePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function temporaryApp({ failHealth = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'zoebuild-dev-startup-test-'));
  const app = join(root, 'apps', 'zoebuild');
  const scripts = join(app, 'scripts');
  await mkdir(scripts, { recursive: true });
  await copyFile(source, join(scripts, 'zoebuild-dev-verified.mjs'));
  await writeFile(join(app, 'package.json'), JSON.stringify({ private:true, scripts: {
    'dev:server':'node fake-server.mjs',
  } }, null, 2));
  await writeFile(join(app, 'fake-server.mjs'), `import { createServer } from 'node:http';
    const s = createServer((req,res) => { res.writeHead(200, {'Content-Type':'text/plain'}); res.end('ok'); });
    s.listen(Number(process.env.ZOEBUILD_DEV_PORT), '127.0.0.1');
    process.on('SIGTERM', () => s.close(() => process.exit(0)));
    process.on('SIGINT', () => s.close(() => process.exit(0)));
  `);
  await writeFile(join(scripts, 'zoebuild-startup-health.sh'), `#!/bin/bash
    echo REDACTED_REPORT_LOG=/tmp/fixture-report
    if [ "${failHealth ? 'yes' : 'no'}" = yes ]; then
      echo STARTUP_INFRA_STATUS=FAIL
      exit 1
    fi
    echo STARTUP_INFRA_STATUS=PASS
    exit 0
  `);
  await chmod(join(scripts, 'zoebuild-startup-health.sh'), 0o755);
  return { root, app, launcher: join(scripts, 'zoebuild-dev-verified.mjs') };
}

function execWrapper(app, port, args = []) {
  const child = spawn(process.execPath, [app.launcher, ...args], {
    cwd: app.app,
    env: { ...process.env, ZOEBUILD_DEV_PORT: String(port), ZOEBUILD_DEV_START_TIMEOUT_MS: '10000', ZOEBUILD_DEV_WATCH_INTERVAL_MS: '30000' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', x => output += x);
  child.stderr.on('data', x => output += x);
  const done = new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal, output })));
  return { child, done, readOutput: () => output };
}

async function until(predicate, ms = 11000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 80));
  }
  throw new Error('test wait timed out');
}

async function probe(port) {
  const { connect } = await import('node:net');
  return await new Promise(resolve => {
    const s = connect(port, '127.0.0.1');
    s.once('connect', () => { s.end(); resolve(true); });
    s.once('error', () => resolve(false));
  });
}

test('check mode reports checks without launching a server', async () => {
  const app = await temporaryApp();
  try {
    const run = execWrapper(app, await freePort(), ['--check']);
    const result = await run.done;
    assert.equal(result.code, 0);
    assert.match(result.output, /STARTUP_INFRA_STATUS=PASS/);
    assert.doesNotMatch(result.output, /ZOEBUILD_DEV_SERVER_HTTP_READY/);
  } finally { await rm(app.root, { force: true, recursive: true }); }
});

test('successful startup checks health and stops only its own server', async () => {
  const app = await temporaryApp();
  const port = await freePort();
  const run = execWrapper(app, port);
  try {
    await until(() => run.readOutput().includes('ZOEBUILD_DEV_INFRA=READY'));
    assert.equal(await probe(port), true);
    assert.match(run.readOutput(), /ZOEBUILD_DEV_MONITOR=ENABLED/);
    run.child.kill('SIGTERM');
    const result = await run.done;
    assert.equal(result.code, 130);
    await until(async () => !(await probe(port)), 2000).catch(() => {});
    assert.equal(await probe(port), false);
  } finally { run.child.kill('SIGTERM'); await rm(app.root, { force: true, recursive: true }); }
});

test('failure in infrastructure health shuts down launched server and exits nonzero', async () => {
  const app = await temporaryApp({ failHealth: true });
  const port = await freePort();
  const run = execWrapper(app, port);
  try {
    const result = await run.done;
    assert.notEqual(result.code, 0);
    assert.match(result.output, /ZOEBUILD_DEV_INFRA=FAILED_SERVER_STOPPING_NO_SILENT_FALLBACK/);
    assert.equal(await probe(port), false);
  } finally { run.child.kill('SIGTERM'); await rm(app.root, { force: true, recursive: true }); }
});

test('already occupied port safely stops without touching existing listener', async () => {
  const app = await temporaryApp();
  const server = createServer(s => { s.on('error', () => {}); s.end('existing'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    const run = execWrapper(app, port);
    const result = await run.done;
    assert.notEqual(result.code, 0);
    assert.match(result.output, /PORT_\d+_ALREADY_LISTENING/);
    assert.equal(await probe(port), true);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(app.root, { force: true, recursive: true });
  }
});
