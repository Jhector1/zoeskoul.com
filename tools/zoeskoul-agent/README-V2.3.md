# ZoeSkoul Closure Agent V2.3

Whole-repo engineer mode.

- Whole repository read/search.
- Whole repository patch authority for non-secret files.
- Can repair root config, package scripts, Vitest/Next/Turbo config, app/package code, tests, and its JSON gate configuration.
- Can request additional repository evidence iteratively before patching.
- Cannot modify its Python/auth/bootstrap safety controller.
- Cannot commit, push, reset, checkout, clean, or mutate `.git`.
- Cannot read or patch secret-like files.
- Model never receives arbitrary shell execution.

Existing Sign in with ChatGPT credentials continue to work.

Install:

```bash
cd /Users/admin/Documents/NextJSProject/zoeskoul-web-infra
unzip -o ~/Downloads/zoeskoul-closure-agent-v2.3.zip
chmod +x tools/zoeskoul-agent/run.sh tools/zoeskoul-agent/zoeskoul_closure_agent.py
```

Resume the stopped closure:

```bash
./tools/zoeskoul-agent/run.sh --from-gate web-tests
```

The agent may discover that the gate itself is wrong. It is allowed to patch
`tools/zoeskoul-agent/zoeskoul-agent.json`, reload the gate configuration, and
rerun the same gate automatically.
