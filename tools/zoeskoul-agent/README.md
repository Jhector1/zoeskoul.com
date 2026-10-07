# ZoeSkoul Closure Agent v2

Uses the official **Sign in with ChatGPT** flow for eligible ChatGPT-plan usage.
The executable code does not require an OpenAI API key.

## Install

```bash
cd /Users/admin/Documents/NextJSProject/zoeskoul-web-infra
unzip -o ~/Downloads/zoeskoul-closure-agent-v2.zip
chmod +x tools/zoeskoul-agent/run.sh tools/zoeskoul-agent/zoeskoul_closure_agent.py
```

## Connect your ChatGPT account

```bash
./tools/zoeskoul-agent/run.sh --login
```

The tool opens the official OpenAI authorization page in your system browser.
Approve ChatGPT plan usage. The callback is local to `127.0.0.1`.

Credentials are stored owner-only under:

```text
~/.config/zoeskoul-closure-agent/
```

Check the connection:

```bash
./tools/zoeskoul-agent/run.sh --auth-status
```

List models available to this signed-in account:

```bash
./tools/zoeskoul-agent/run.sh --models
```

## First safety run

```bash
./tools/zoeskoul-agent/run.sh --dry-run
```

This runs gates until the first failure, asks ChatGPT for one unified diff,
validates it with the local guardrails and `git apply --check`, and stops
without changing the repo.

## Full closure

```bash
./tools/zoeskoul-agent/run.sh
```

Gate chain:

1. runtime roots
2. canonical SQL identity
3. canonical manifest boundary
4. full Web Vitest suite
5. Web typecheck
6. monorepo typecheck
7. Web build
8. complete final verification rerun

The AI receives no shell tool. It can only return a unified diff. The local
controller validates and applies that diff, runs `git diff --check`, then reruns
the same gate.

The controller blocks legacy curriculum mirrors, published curriculum direct
edits, secrets/env files, deployment paths, lockfiles, test skipping, TypeScript
suppression, and commit/push/reset/checkout behavior.

## Plan usage

Requests consume the ChatGPT plan usage that you explicitly authorize for this
tool. Manage its limit in ChatGPT Settings > Usage. Using credits after included
plan usage is a separate user-controlled setting; the tool does not enable it.

## Disconnect

```bash
./tools/zoeskoul-agent/run.sh --logout
```

## Logs

```text
~/.zoeskoul-agent/zoeskoul-web-infra/runs/
```

No tokens are written to run logs.
