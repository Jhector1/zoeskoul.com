#!/usr/bin/env node
/**
 * Ensure the existing ZoeBuild Mac -> Ubuntu VM Runner SSH forwarding exists.
 * No Docker changes, no secrets printed, no process termination.
 * Called by npm run dev:prepare, before the verified ZoeBuild launcher.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const PORT = 8080;
const SSH_ALIAS = 'zoeskoul-dev';
const FORWARD = '8080:127.0.0.1:80';

function run(command, args, timeout = 12000) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout,
    env: { ...process.env, LC_ALL: 'C' },
  });
  if (result.error) throw new Error(`${command}: ${result.error.code ?? result.error.message}`);
  return result;
}

// Match the app-specific env-file order used for local development.
for (const name of ['.env.development.local', '.env.local', '.env.development', '.env']) {
  const file = resolve(process.cwd(), name);
  if (existsSync(file)) process.loadEnvFile(file);
}

const base = process.env.RUNNER_BASE_URL;
if (!base) {
  console.error('RUNNER_TUNNEL_CHECK=FAILED_RUNNER_BASE_URL_MISSING');
  process.exit(1);
}
let runner;
try {
  runner = new URL(base);
} catch {
  console.error('RUNNER_TUNNEL_CHECK=FAILED_RUNNER_BASE_URL_INVALID');
  process.exit(1);
}
if (runner.protocol !== 'http:' || runner.hostname !== 'runner.localhost' || runner.port !== String(PORT)) {
  console.log('RUNNER_TUNNEL_CHECK=SKIPPED_NON_DEFAULT_RUNNER');
  process.exit(0);
}

function listeners() {
  const result = run('lsof', ['-nP', `-iTCP:${PORT}`, '-sTCP:LISTEN', '-Fpc'], 6000);
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`lsof failed (exit ${result.status ?? 'unknown'})`);
  }
  const entries = [];
  let current;
  for (const line of result.stdout.split(/\r?\n/)) {
    if (line.startsWith('p')) {
      current = { pid: line.slice(1), command: '' };
      entries.push(current);
    } else if (line.startsWith('c') && current) {
      current.command = line.slice(1).trim();
    }
  }
  return entries;
}

function probe() {
  for (const path of ['/healthz', '/']) {
    const result = run('curl', [
      '--noproxy', '*', '--ipv4', '--silent', '--show-error',
      '--connect-timeout', '2', '--max-time', '4',
      '--output', '/dev/null', '--write-out', '%{http_code}',
      `http://runner.localhost:${PORT}${path}`,
    ], 6500);
    const status = Number(result.stdout.trim());
    // A 4xx response may reflect gateway authorization or route policy;
    // it still proves that HTTP reached a live service through the SSH tunnel.
    if (result.status === 0 && status >= 200 && status < 500) {
      console.log(`RUNNER_TUNNEL_PROBE=${path}:HTTP_${status}`);
      return true;
    }
  }
  return false;
}

function checkedListener() {
  const entries = listeners();
  if (entries.length === 0) return false;
  // Never treat another application's port 8080 as ZoeBuild's SSH tunnel.
  if (entries.some(({ command }) => command !== 'ssh')) {
    console.error('RUNNER_TUNNEL_CHECK=PORT_8080_OWNED_BY_NON_SSH_PROCESS');
    process.exit(1);
  }
  return true;
}

try {
  if (checkedListener()) {
    if (!probe()) throw new Error('Existing SSH port forward is not serving Runner HTTP');
    console.log('RUNNER_TUNNEL_8080=REUSED_HEALTHY_EXISTING');
    process.exit(0);
  }

  console.log('RUNNER_TUNNEL_8080=MISSING_RESTORING_VERIFIED_SSH_ALIAS');
  const result = run('ssh', [
    '-f', '-N', '-T',
    '-o', 'BatchMode=yes',
    '-o', 'StrictHostKeyChecking=yes',
    '-o', 'ExitOnForwardFailure=yes',
    '-o', 'GatewayPorts=no',
    '-o', 'ConnectTimeout=6',
    '-o', 'ServerAliveInterval=30',
    '-o', 'ServerAliveCountMax=3',
    '-L', FORWARD,
    SSH_ALIAS,
  ], 15000);
  if (result.status !== 0) {
    throw new Error(`SSH forwarding failed (exit ${result.status ?? 'unknown'}): ${
      (result.stderr || '').trim().slice(0, 300)
    }`);
  }

  if (!checkedListener()) throw new Error('SSH forwarding command exited without a port-8080 listener');
  if (!probe()) throw new Error('Port 8080 is listening, but Runner HTTP is not ready');
  console.log('RUNNER_TUNNEL_8080=RESTORED_AND_HTTP_RESPONDING');
} catch (error) {
  console.error('RUNNER_TUNNEL_CHECK=FAIL', error.message);
  process.exitCode = 1;
}
