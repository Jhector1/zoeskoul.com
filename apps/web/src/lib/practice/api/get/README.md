# Practice API README

## Overview

The Practice API powers two main behaviors for the practice experience:

1. **Generate the next practice exercise** for a user, guest, session, module, section, or topic scope.
2. **Return session status/history** when `statusOnly=true`.

This endpoint supports:

* authenticated users and guests
* standalone practice and session-backed practice
* assignment-backed sessions
* onboarding trial sessions
* purpose filtering (`quiz`, `project`, `mixed`)
* kind filtering (`single_choice`, `code_input`, etc.)
* deterministic or actor-based randomness
* optional history and missed-question retrieval
* signed attempt keys for secure answer submission

---

## Endpoint

`GET /api/practice`

Runtime characteristics:

* Node runtime
* dynamic response
* no-store / non-cacheable
* rate limited
* guest cookie aware
* access gated before exercise generation

---

## High-level flow

The request lifecycle is:

1. Validate query params
2. Resolve actor (user or guest)
3. Apply rate limiting
4. Resolve locale
5. Sanitize `returnUrl` / `returnTo`
6. Load session if `sessionId` is provided
7. Resolve billing/access rules
8. Resolve session ownership / session state
9. Resolve purpose mode
10. Either:

* return session status/history, or
* generate the next exercise and persist a question instance

---

## Query parameters

### Scope parameters

These determine what content pool the practice request can pull from.

#### `subject`

Type: `string`

Used for non-session practice to scope generation to a subject.

Example:

```txt
/api/practice?subject=python
```

#### `module`

Type: `string`

Used for non-session practice to scope generation to a module.

Example:

```txt
/api/practice?subject=python&module=python-0
```

#### `section`

Type: `string`

Used to scope generation to a section when not already locked by a session.

Example:

```txt
/api/practice?subject=python&module=python-0&section=python-0-foundations
```

#### `topic`

Type: `string`

Used to request a specific topic slug. Can also be omitted or set to `all` to allow topic selection from the eligible pool.

Example:

```txt
/api/practice?subject=python&module=python-0&topic=py0.variables_intro
```

Example for broad pool selection:

```txt
/api/practice?subject=python&module=python-0&topic=all
```

---

### Session parameters

#### `sessionId`

Type: `string`

If present, the API becomes session-aware. This affects:

* ownership checks
* trial/assignment behavior
* difficulty lock behavior
* target counts
* reveal policy
* purpose persistence
* status/history lookup

Example:

```txt
/api/practice?sessionId=cmmmxqvku000jsjcfejnjpc24
```

#### `statusOnly`

Type: `"true" | "false"`

When `true`, the endpoint returns session progress/status instead of generating a new exercise.

This requires `sessionId`.

Example:

```txt
/api/practice?sessionId=cmmmxqvku000jsjcfejnjpc24&statusOnly=true
```

---

### Difficulty and reveal parameters

#### `difficulty`

Type: `"easy" | "medium" | "hard"`

Used for non-assignment practice. If omitted, the API may use session difficulty or actor-based random selection.

Example:

```txt
/api/practice?subject=python&module=python-0&difficulty=easy
```

#### `allowReveal`

Type: `"true" | "false"`

Controls whether reveal is allowed in non-session practice, or whether reveal is enabled in assignment mode when the assignment already allows it.

Behavior summary:

* no session: `allowReveal=true` enables reveal
* regular session: reveal is disabled
* assignment session: reveal is only enabled if assignment allows it **and** the param requests it

Example:

```txt
/api/practice?subject=python&module=python-0&allowReveal=true
```

---

### Filtering parameters

#### `preferKind`

Type: one of:

* `numeric`
* `single_choice`
* `multi_choice`
* `vector_drag_target`
* `vector_drag_dot`
* `matrix_input`
* `fill_blank_choice`
* `voice_input`
* `listen_build`
* `code_input`

Used to ask the generator for a preferred exercise kind.

Example:

```txt
/api/practice?subject=python&module=python-0&preferKind=single_choice
```

#### `preferPurpose`

Type: `"quiz" | "project" | "mixed"`

Used to influence what purpose bucket the generator should use.

Behavior summary:

* `quiz`: quiz-only generation
* `project`: project-style generation
* `mixed`: no purpose filter; generator may return either
* assignment-backed sessions ignore this and force `quiz`
* onboarding trial sessions only allow quiz behavior

Example:

```txt
/api/practice?subject=python&module=python-0&preferPurpose=project
```

Example with mixed mode:

```txt
/api/practice?subject=python&module=python-0&preferPurpose=mixed
```

#### `purposePolicy`

Type: `"strict" | "fallback"`

Controls what happens when the requested purpose is not allowed by the session/module preset.

Behavior:

* `strict`: return an error if requested purpose is not allowed
* `fallback`: degrade to an allowed purpose automatically

Example:

```txt
/api/practice?sessionId=abc123&preferPurpose=project&purposePolicy=strict
```

---

### History and review parameters

#### `includeMissed`

Type: `"true" | "false"`

Only meaningful with `statusOnly=true`.

When enabled, the response includes unresolved missed questions. The API uses a signature of topic/kind/title/prompt to determine unresolved misses based on the latest non-reveal attempt.

Example:

```txt
/api/practice?sessionId=abc123&statusOnly=true&includeMissed=true
```

#### `includeHistory`

Type: `string` but used as boolean-style `"true"`

Only meaningful with `statusOnly=true`.

When `true`, the response includes question history with attempt counts, last answer state, and optionally expected payload/explanations when allowed.

Example:

```txt
/api/practice?sessionId=abc123&statusOnly=true&includeHistory=true
```

---

### Randomness and determinism parameters

#### `salt`

Type: `string`

Used to stabilize or vary exercise generation. If omitted, a request nonce is generated.

Examples:

```txt
/api/practice?subject=python&module=python-0&salt=my-seed
```

#### `exerciseKey`

Type: `string`

Optional force-key passed into generator metadata and request context. Useful for targeting a specific exercise variant or catalog item.

Example:

```txt
/api/practice?subject=python&module=python-0&exerciseKey=vars_print_01
```

#### `seedPolicy`

Type: `"actor" | "global"`

Controls how RNG identity is derived.

Behavior:

* `actor`: randomness tied to actor/session identity
* `global`: randomness not tied to actor identity

Example:

```txt
/api/practice?subject=python&module=python-0&seedPolicy=global
```

---

### Navigation / return parameters

#### `returnUrl`

Type: `string`

Optional redirect target to persist onto the session for later return/navigation behavior.

Only same-origin or relative values are accepted.

Example:

```txt
/api/practice?sessionId=abc123&returnUrl=/subjects/python/modules/python-0
```

#### `returnTo`

Type: `string`

Alias for `returnUrl`.

Used the same way and sanitized the same way.

Example:

```txt
/api/practice?sessionId=abc123&returnTo=/assignments
```

---

## Parameter summary

### Minimal generation request

```txt
GET /api/practice?subject=python&module=python-0
```

### Generate with explicit filters

```txt
GET /api/practice?subject=python&module=python-0&difficulty=easy&preferKind=single_choice&preferPurpose=quiz
```

### Session status request

```txt
GET /api/practice?sessionId=abc123&statusOnly=true
```

### Session status with missed + history

```txt
GET /api/practice?sessionId=abc123&statusOnly=true&includeMissed=true&includeHistory=true
```

### Assignment/trial-aware request

```txt
GET /api/practice?sessionId=abc123&allowReveal=true
```

---

## Behavior rules

### Actor handling

The API supports both:

* authenticated users
* guests with a guest cookie

If the request is not session-bound, the route may create a guest id automatically.
If the request is session-bound, it does **not** silently mint a new guest id.

---

### Session ownership rules

If a session exists:

* user-owned sessions require matching `userId`
* guest-owned sessions require matching `guestId`
* sessions with no owner are treated as invalid/internal error state

For onboarding trial sessions, a guest mismatch may return a recoverable session recovery payload.

---

### Access rules

Access is resolved before generation.

Behavior summary:

* onboarding trial sessions bypass billing gate
* standard mode goes through module access gate
* assignment entitlement is enforced after session load when applicable

---

### Purpose resolution rules

The API computes a single effective purpose mode.

Priority summary:

1. assignment-backed sessions force `quiz`
2. explicit request param may override
3. session preference may be reused
4. otherwise default is `quiz`

If the request uses `mixed`, the generator receives no purpose filter.
If the request uses `strict`, disallowed purposes return a `403`.
If the request uses `fallback`, the API downgrades to an allowed purpose.

---

### Trial rules

Onboarding trial sessions:

* cannot be assignment-backed
* only support quiz behavior
* may treat `mixed` as acceptable input but generation still behaves as quiz-only

---

### Reveal rules

Expected answers are never revealed for `code_input` through history payloads.

For status/history payloads:

* assignment sessions only reveal expected payloads if assignment allows reveal
* regular sessions may reveal history payloads in status mode
* non-session practice uses the request param

---

### Topic resolution rules

Topic selection happens in this rough priority order:

1. requested topic if valid and allowed
2. assignment topic pool
3. session module pool
4. section pool
5. module slug pool
6. subject pool

If a topic resolves but generation fails due to a missing handler/pool/generator, the topic is excluded and the API retries up to several times.

---

## Response shapes

## A. Generated exercise response

Returned when `statusOnly` is not `true`.

Example shape:

```json
{
  "exercise": {
    "kind": "single_choice",
    "title": "Variables",
    "prompt": "Which line creates a variable?",
    "topic": "py0.variables_intro"
  },
  "key": "signed-practice-key",
  "sessionId": "abc123",
  "run": {
    "mode": "session",
    "lockDifficulty": "easy",
    "lockTopic": "all",
    "allowReveal": false,
    "showDebug": false,
    "targetCount": 10,
    "maxAttempts": null,
    "returnUrl": "/subjects/python/modules/python-0"
  },
  "meta": {
    "genKey": "python_part1",
    "topic": "py0.variables_intro",
    "variant": null,
    "allowReveal": false,
    "salt": "rnd:...",
    "purposeMode": "quiz",
    "preferPurposeForGenerator": "quiz",
    "chosenPurpose": "quiz",
    "excludedTopicSlugs": [],
    "purpose": {
      "effective": "quiz",
      "requested": "quiz",
      "allowed": ["quiz"],
      "policy": "fallback",
      "source": "param",
      "reason": null
    }
  }
}
```

### Important fields

#### `exercise`

The public exercise payload sent to the client.

#### `key`

Signed key used for secure answer submission / validation flow.

#### `run`

Run configuration resolved from session type and difficulty.

#### `meta`

Debug and trace information about how generation happened.

---

## B. Status-only response

Returned when `statusOnly=true`.

Example shape:

```json
{
  "complete": false,
  "pct": 0.4,
  "status": "active",
  "answeredCount": 4,
  "targetCount": 10,
  "correctCount": 3,
  "totalCount": 4,
  "correct": 3,
  "total": 4,
  "assignmentId": null,
  "sessionId": "abc123",
  "purpose": {
    "effective": "quiz",
    "requested": null,
    "allowed": ["quiz", "project"],
    "policy": "fallback",
    "source": "session",
    "reason": null
  },
  "missed": [],
  "history": [],
  "run": {
    "mode": "session",
    "lockDifficulty": "easy",
    "lockTopic": "all",
    "allowReveal": false,
    "showDebug": false,
    "targetCount": 10,
    "maxAttempts": null,
    "returnUrl": "/subjects/python/modules/python-0"
  },
  "returnUrl": "/subjects/python/modules/python-0"
}
```

---

## Missed payload

When `includeMissed=true`, unresolved misses may look like:

```json
{
  "id": "instance123-missed",
  "at": 1710000000000,
  "topic": "py0.variables_intro",
  "kind": "single_choice",
  "title": "Variables",
  "prompt": "Which line creates a variable?",
  "publicPayload": {},
  "userAnswer": { "optionId": "b" },
  "expected": { "kind": "single_choice", "optionId": "a" },
  "explanation": "A variable is created with assignment."
}
```

---

## History payload

When `includeHistory=true`, a row may look like:

```json
{
  "instanceId": "instance123",
  "createdAt": "2026-03-13T12:00:00.000Z",
  "answeredAt": "2026-03-13T12:05:00.000Z",
  "topic": "py0.variables_intro",
  "kind": "single_choice",
  "difficulty": "easy",
  "title": "Variables",
  "prompt": "Which line creates a variable?",
  "publicPayload": {},
  "attempts": 2,
  "lastOk": false,
  "lastRevealUsed": false,
  "lastAnswerPayload": { "optionId": "b" },
  "lastAttemptAt": "2026-03-13T12:05:00.000Z",
  "expectedAnswerPayload": { "kind": "single_choice", "optionId": "a" },
  "explanation": "A variable is created with assignment."
}
```

---

## Error responses

### Invalid query params

Status: `400`

```json
{
  "message": "Invalid query params",
  "issues": []
}
```

### Session not found

Status: `404`

```json
{
  "message": "Session not found."
}
```

### Ownership mismatch

Status: typically `403`

```json
{
  "message": "Forbidden.",
  "code": "SESSION_OWNER_USER_MISMATCH"
}
```

### Recoverable trial mismatch

Status: `409`

```json
{
  "message": "Session recovery required.",
  "code": "SESSION_RECOVERY_REQUIRED",
  "recoverable": true,
  "reason": "SESSION_OWNER_GUEST_MISMATCH",
  "sessionId": "abc123"
}
```

### Purpose blocked by strict policy

Status: `403`

```json
{
  "message": "This run does not allow purpose=\"project\".",
  "detail": {
    "allowed": ["quiz"]
  }
}
```

### Invalid topic or filters

Status: `400`

```json
{
  "message": "Invalid topic/filters",
  "explanation": "Section \"...\" not found."
}
```

### No eligible questions found

Status: `404`

```json
{
  "message": "No quiz questions available for this scope yet.",
  "explanation": "All eligible topics were filtered out.",
  "meta": {
    "purposeMode": "quiz",
    "preferKind": "single_choice",
    "excludedTopicSlugs": []
  }
}
```

### Rate limit

Status: `429`

```json
{
  "message": "Too many requests"
}
```

### Unexpected failure

Status: `500`

```json
{
  "message": "Practice API failed"
}
```

---

## Response headers

The route applies:

* `Cache-Control: no-store, max-age=0`
* `Pragma: no-cache`
* `X-Content-Type-Options: nosniff`
* `Referrer-Policy: same-origin`
* `Cross-Origin-Resource-Policy: same-origin`
* `Content-Security-Policy: default-src 'none'`
* `X-Request-Id: <uuid>`

Rate-limited responses may also include:

* `Retry-After`
* `X-RateLimit-Limit`
* `X-RateLimit-Remaining`
* `X-RateLimit-Reset`

---

## Practical examples

### Example 1: plain standalone practice

```txt
GET /api/practice?subject=python&module=python-0&difficulty=easy&preferKind=single_choice
```

### Example 2: section-scoped mixed practice

```txt
GET /api/practice?subject=python&module=python-0&section=python-0-foundations&preferPurpose=mixed&purposePolicy=fallback
```

### Example 3: session next-question fetch

```txt
GET /api/practice?sessionId=abc123&preferPurpose=quiz
```

### Example 4: session progress dashboard fetch

```txt
GET /api/practice?sessionId=abc123&statusOnly=true&includeMissed=true&includeHistory=true
```

### Example 5: deterministic preview-like fetch

```txt
GET /api/practice?subject=python&module=python-0&salt=preview-seed&seedPolicy=global
```

---

## Notes for frontend consumers

* Use `statusOnly=true` when polling or restoring an in-progress run.
* Use `includeMissed=true` only when needed because it adds query work.
* Use `includeHistory=true` only when rendering review/history UI.
* Treat `meta` as helpful debug/trace data, not stable UI contract unless you explicitly standardize it.
* Store and submit the signed `key` alongside answers in your answer-validation flow.
* Do not assume `mixed` means an even split; it only means the generator is not purpose-filtered.

---

## Recommended future documentation additions

As the Practice API grows, this README can be expanded with:

* submit/validate endpoint documentation
* signed key lifecycle diagram
* session state transition diagram
* onboarding trial flow diagram
* example frontend fetch helpers
* typed response contracts for client consumption
