# @zoeskoul/curriculum-agents

Agent-based curriculum review tooling.

## Student agent

The Student agent is intentionally learner-firewalled.

It drives the learner-facing Student UI with Playwright and receives only:
- visible page text,
- visible interactive controls,
- normal click/fill/type/keyboard/scroll/wait actions.

It receives no repository, filesystem, curriculum source, solution, hidden-test,
grader, source-check, database, network-inspection, or browser-devtools tools.

### Run

Start the real ZoeSkoul services needed by the learner flow, then:

```bash
export OPENAI_API_KEY="..."
pnpm --filter @zoeskoul/curriculum-agents student -- \
  --url "http://localhost:3002/<learner-route>" \
  --headed
```

For an authenticated learner flow, provide a Playwright storage-state file:

```bash
pnpm --filter @zoeskoul/curriculum-agents student -- \
  --url "http://localhost:3002/<learner-route>" \
  --storage-state "/path/to/student-storage-state.json" \
  --allow-origin "http://localhost:3000" \
  --headed
```

Reports are written under `.curriculum-reviews/student/` unless `--report` is supplied.

## Security boundary

The browser defaults to the start URL's origin only.
Additional origins must be explicitly passed with `--allow-origin`.

The browser is launched without inherited host environment variables,
with extensions disabled, and with file-system browser access disabled.

## ZoeSkoul authentication bootstrap

Authentication is separate from the Student model.

```bash
pnpm curriculum:agent:student:auth -- \
  --url "http://localhost:3002/en/subjects"
```

A headed browser opens. Complete ZoeSkoul's normal Google or SSO/Keycloak flow.
The authenticated browser state is saved to:

```text
.curriculum-reviews/auth/student.storage-state.json
```

The model never receives Google or Keycloak credentials.

Then take a module:

```bash
pnpm curriculum:agent:student -- \
  --url "http://localhost:3002/en/subjects/<subject>/modules/<module>/learn" \
  --storage-state ".curriculum-reviews/auth/student.storage-state.json" \
  --allow-origin "http://localhost:3000" \
  --headed \
  --max-turns 300
```

Agent 1 uses the existing learner-visible ReviewModule controls and records
deterministic browser evidence for Run, Check, Reveal, practice Next/Finish,
module navigation, generic learner clicks, edits, and visited URLs.
