#!/usr/bin/env node
/**
 * ZoeBuild-only dev entrypoint: preserve original npm dev command under
 * dev:server, enforce local readiness + guarded VM check, and monitor drift.
 * Only stops child processes it created. Does not mutate repository or Docker.
 */
import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import { get } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const healthScript = join(scriptsDir, 'zoebuild-startup-health.sh');
const mode = process.argv[2];
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const port = numberInRange(process.env.ZOEBUILD_DEV_PORT, 3004, 1, 65535);
const startupTimeoutMs = numberInRange(process.env.ZOEBUILD_DEV_START_TIMEOUT_MS, 120000, 10000, 300000);
const watchIntervalMs = numberInRange(process.env.ZOEBUILD_DEV_WATCH_INTERVAL_MS, 120000, 30000, 600000);

function numberInRange(source, fallback, min, max) {
  if (source === undefined || source === '') return fallback;
  const value = Number(source);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    process.stderr.write(`ZOEBUILD_DEV_INVALID_INTEGER_RANGE=${min}..${max}\n`);
    process.exit(2);
  }
  return value;
}

function message(line) { process.stdout.write(`${line}\n`); }
function fail(line) { process.stderr.write(`${line}\n`); }

async function isListening(portToTest) {
  return await new Promise(resolve => {
    const socket = connect({ host: '127.0.0.1', port: portToTest });
    let finished = false;
    const done = value => {
      if (finished) return;
      finished = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(900);
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.once('timeout', () => done(false));
  });
}

async function isHttpReady(portToTest) {
  return await new Promise(resolve => {
    let finished = false;
    const done = ok => {
      if (finished) return;
      finished = true;
      resolve(ok);
    };
    const req = get(`http://127.0.0.1:${portToTest}/`, { timeout: 2000 }, res => {
      res.resume();
      done(res.statusCode === 200);
    });
    req.once('timeout', () => { req.destroy(); done(false); });
    req.once('error', () => done(false));
  });
}

function subprocess(command, args, { capture = false, detached = false } = {}) {
  const child = spawn(command, args, {
    cwd: join(scriptsDir, '..'),
    detached,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    env: process.env,
  });
  const completed = new Promise(resolve => {
    let stdout = '';
    let stderr = '';
    if (capture) {
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      // Health checker has already redacted secret values in its output.
      child.stdout.on('data', s => { stdout = (stdout + s).slice(-20000); });
      child.stderr.on('data', s => { stderr = (stderr + s).slice(-2000); });
    }
    let settled = false;
    child.once('error', error => {
      if (settled) return;
      settled = true;
      resolve({ code: 1, signal: null, stdout, stderr, error: error.code || 'SPAWN_ERROR' });
    });
    child.once('close', (code, signal) => {
      if (settled) return;
      settled = true;
      resolve({ code: code ?? 1, signal, stdout, stderr });
    });
  });
  return { child, completed };
}

if (mode === '--check' || mode === '--prepare' || mode === '--watch') {
  const result = await subprocess('bash', [healthScript, mode]).completed;
  process.exitCode = result.code;
} else if (mode && mode.startsWith('--') && ['--help', '-h'].includes(mode)) {
  message('Usage: npm run dev | npm run dev:check | npm run dev:prepare | npm run dev:watch');
  message('dev starts the original server and checks infrastructure; dev:server bypasses health explicitly.');
} else {
  // All other arguments pass through unchanged to the original dev script.
  if (await isListening(port)) {
    fail(`ZOEBUILD_DEV_SAFE_STOP=PORT_${port}_ALREADY_LISTENING`);
    fail('NEXT_ACTION=USE_EXISTING_SERVER_OR_STOP_IT_FROM_ITS_ORIGINAL_TERMINAL');
    process.exitCode = 1;
  } else {
    message(`ZOEBUILD_DEV_LAUNCH=STARTING_EXISTING_NPM_DEV_SERVER PORT=${port}`);
    const args = ['run', 'dev:server'];
    if (process.argv.length > 2) args.push('--', ...process.argv.slice(2));
    const { child, completed } = subprocess(npmCommand, args, { detached: process.platform !== 'win32' });
    let stopped = false;
    let exited = false;
    let exitResult;
    const serverDone = completed.then(result => {
      exited = true;
      exitResult = result;
      return result;
    });
    function signalChild(signal) {
      if (!child.pid || exited) return;
      try {
        // Target only the dedicated process group started by this wrapper.
        if (process.platform !== 'win32') process.kill(-child.pid, signal);
        else child.kill(signal);
      } catch (error) {
        if (error.code !== 'ESRCH') fail(`ZOEBUILD_DEV_SIGNAL_ERROR=${error.code || 'UNKNOWN'}`);
      }
    }
    async function stopOwnedServer() {
      if (stopped) return await serverDone;
      stopped = true;
      signalChild('SIGTERM');
      const result = await Promise.race([
        serverDone,
        new Promise(resolve => setTimeout(() => resolve(null), 7000)),
      ]);
      if (!result) signalChild('SIGKILL');
      return await serverDone;
    }
    let stoppingFromSignal = false;
    const shutdown = signal => {
      stoppingFromSignal = true;
      message(`ZOEBUILD_DEV_SHUTDOWN_SIGNAL=${signal}`);
      void stopOwnedServer();
    };
    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));
    let tick = null;
    try {
      const deadline = Date.now() + startupTimeoutMs;
      while (!stoppingFromSignal && !exited && Date.now() < deadline && !(await isHttpReady(port))) {
        await new Promise(resolve => setTimeout(resolve, 350));
      }
      if (stoppingFromSignal) {
        await stopOwnedServer();
        process.exitCode = 130;
      } else if (exited) {
        fail(`ZOEBUILD_DEV_FAILED=ORIGINAL_SERVER_EXITED CODE=${exitResult.code}`);
        process.exitCode = exitResult.code || 1;
      } else if (!(await isHttpReady(port))) {
        fail('ZOEBUILD_DEV_FAILED=NEXTJS_HTTP_200_READINESS_TIMEOUT');
        await stopOwnedServer();
        process.exitCode = 1;
      } else {
        message(`ZOEBUILD_DEV_SERVER_HTTP_READY=200 PORT=${port}`);
        message('ZOEBUILD_DEV_INFRA=VERIFYING_AND_RESTORING_MISSING_TUNNEL_IF_NEEDED');
        const health = await subprocess('bash', [healthScript, '--prepare']).completed;
        if (stoppingFromSignal) {
          await stopOwnedServer();
          process.exitCode = 130;
        } else if (health.code !== 0) {
          fail('ZOEBUILD_DEV_INFRA=FAILED_SERVER_STOPPING_NO_SILENT_FALLBACK');
          fail('NEXT_ACTION=READ_STARTUP_REPORT_OR_RUN_NPM_RUN_DEV_CHECK');
          await stopOwnedServer();
          process.exitCode = 1;
        } else {
          message('ZOEBUILD_DEV_INFRA=READY');
          message('ZOEBUILD_BROWSER_NATIVE_HMR=NOT_ASSERTED_OPEN_AUTHENTICATED_PROJECT_PREVIEW');
          message(`ZOEBUILD_DEV_MONITOR=ENABLED_INTERVAL_${Math.floor(watchIntervalMs / 1000)}s`);
          message('ZOEBUILD_DEV_STOP=CTRL_C');
          let active = false;
          let lastState = 'PASS';
          tick = setInterval(async () => {
            if (stoppingFromSignal || exited || active) return;
            active = true;
            try {
              const check = await subprocess('bash', [healthScript, '--check'], { capture: true }).completed;
              const state = check.code === 0 && check.stdout.includes('STARTUP_INFRA_STATUS=PASS') ? 'PASS' : 'FAIL';
              if (state !== lastState || state === 'FAIL') {
                message(`ZOEBUILD_DEV_MONITOR_STATUS=${state}`);
                for (const line of check.stdout.split('\n')) {
                  if (/^(REDACTED_REPORT_LOG|STARTUP_INFRA_STATUS|NEXT_ACTION|VM_33004_HTTP|RUNNER_UID1001|AUTHORITY_SECRET_COMPARE)=/.test(line)) message(line);
                }
              }
              lastState = state;
            } catch {
              fail('ZOEBUILD_DEV_MONITOR_STATUS=FAIL_INSPECTION_ERROR');
            } finally {
              active = false;
            }
          }, watchIntervalMs);
          const result = await serverDone;
          if (!stoppingFromSignal) {
            fail(`ZOEBUILD_DEV_SERVER_EXITED=YES CODE=${result.code} SIGNAL=${result.signal || 'NONE'}`);
            process.exitCode = result.code === 0 ? 0 : result.code || 1;
          } else {
            process.exitCode = 130;
          }
        }
      }
    } catch (error) {
      fail(`ZOEBUILD_DEV_UNEXPECTED_ERROR=${error.code || error.name || 'UNKNOWN'}`);
      await stopOwnedServer();
      process.exitCode = 1;
    } finally {
      if (tick) clearInterval(tick);
    }
  }
}
