# Practice Validate API README

## Overview

The Validate API is the server endpoint responsible for validating or revealing answers for an already-generated practice question.

It works together with the Practice GET endpoint:

* **GET `/api/practice`** generates an exercise and returns a signed `key`
* **POST `/api/practice/validate`** consumes that key to:

    * validate an answer
    * optionally reveal an answer when allowed
    * persist an attempt
    * finalize the question when appropriate
    * update session completion state and summary

This endpoint is the server truth for:

* actor ownership binding
* reveal permissions
* max attempts enforcement
* grading
* attempt persistence
* session progress/finalization

---

## Endpoint

`POST /api/practice/validate`

Runtime characteristics:

* Node runtime
* dynamic response
* non-cacheable
* JSON-only
* same-origin protected in production
* rate limited
* guest cookie aware
* key-based authorization

---

## High-level flow

The request lifecycle is:

1. Enforce same-origin POST policy in production
2. Require `application/json`
3. Apply rate limiting
4. Parse and validate request body
5. Normalize and verify signed practice key
6. Resolve actor and guest cookie state
7. Load practice instance and attached session
8. Run access gate
9. Check session ownership
10. Check reveal policy
11. Check attempts / finalized rules
12. Load canonical expected answer
13. Grade answer or reveal content
14. Persist attempt and finalize if needed
15. Update session counters and completion state
16. Return result payload

---

## Request body

The request body supports two modes:

1. **Normal validation mode**
2. **Reveal mode**

---

## Base shape

```json
{
  "key": "signed-practice-key",
  "reveal": false,
  "answer": {
    "kind": "single_choice",
    "optionId": "choice_a"
  }
}
```

### Fields

#### `key`

Type:

* `string`
* or object wrapper containing one of:

    * `token`
    * `key`
    * `value`

Examples:

```json
{ "key": "abc123..." }
```

```json
{ "key": { "token": "abc123..." } }
```

```json
{ "key": { "key": "abc123..." } }
```

```json
{ "key": { "value": "abc123..." } }
```

The server normalizes this to a single string using `normalizeKey()`.

#### `reveal`

Type: `boolean` (optional)

When `true`, the request is a reveal request instead of a grading request.

#### `answer`

Type: discriminated union by `kind`

Required unless `reveal=true`.

---

## Answer payload kinds

## 1. `single_choice`

```json
{
  "kind": "single_choice",
  "optionId": "choice_a"
}
```

## 2. `multi_choice`

```json
{
  "kind": "multi_choice",
  "optionIds": ["choice_a", "choice_c"]
}
```

## 3. `numeric`

```json
{
  "kind": "numeric",
  "value": 42
}
```

## 4. `vector_drag_target`

```json
{
  "kind": "vector_drag_target",
  "a": { "x": 1, "y": 2 },
  "b": { "x": 3, "y": 4 }
}
```

## 5. `vector_drag_dot`

```json
{
  "kind": "vector_drag_dot",
  "a": { "x": 1, "y": 2 }
}
```

## 6. `matrix_input`

```json
{
  "kind": "matrix_input",
  "values": [[1, 2], [3, 4]]
}
```

## 7. `code_input`

```json
{
  "kind": "code_input",
  "language": "python",
  "code": "print('hello')"
}
```

Accepted fields:

* `language` (optional)
* `code` (preferred)
* `source` (legacy-compatible alternative)
* `stdin` (optional UI convenience field)

At least one of `code` or `source` must contain non-empty source text.

## 8. `text_input`

```json
{
  "kind": "text_input",
  "value": "Bonjour"
}
```

## 9. `drag_reorder`

```json
{
  "kind": "drag_reorder",
  "order": ["token_1", "token_2", "token_3"]
}
```

## 10. `voice_input`

```json
{
  "kind": "voice_input",
  "transcript": "Bonjou",
  "audioId": "audio_123"
}
```

## 11. `word_bank_arrange`

```json
{
  "kind": "word_bank_arrange",
  "value": "I am learning Python"
}
```

## 12. `listen_build`

```json
{
  "kind": "listen_build",
  "value": "Mwen ap aprann"
}
```

## 13. `fill_blank_choice`

```json
{
  "kind": "fill_blank_choice",
  "value": "variable"
}
```

---

## Reveal request example

```json
{
  "key": "signed-practice-key",
  "reveal": true
}
```

Behavior:

* no `answer` is required
* reveal is only allowed if endpoint policy permits it
* reveal attempts are persisted with `revealUsed: true`
* reveal does **not** finalize the question

---

## Validation rules

The body schema enforces:

* `key` must exist and normalize to a string
* `answer` must exist unless `reveal=true`
* answer payload must match one of the supported answer kinds
* `code_input` must include non-empty code or source text
* reveal requests may omit `answer`

---

## Signed key behavior

The validate endpoint depends on the signed key returned by the Practice GET endpoint.

The key payload typically contains:

* `instanceId`
* `sessionId`
* `userId`
* `guestId`
* `allowReveal`
* expiration timestamp

The key is verified using `verifyPracticeKey()`.

If the key is invalid or expired, the endpoint rejects the request.

---

## Actor binding

After the key is verified, the endpoint resolves the current actor.

Actor resolution supports:

* logged-in users
* guest users with guest cookie
* guest recovery from key payload when cookie is missing

Behavior summary:

* if neither `userId` nor `guestId` exists locally but key has `guestId`, the server adopts that guest id
* otherwise it ensures a guest id exists when needed
* actor mismatch between key payload and resolved actor returns `401`

This protects against answer submission from the wrong actor.

---

## Instance loading

The endpoint loads the `practiceQuestionInstance` using `payload.instanceId`.

Loaded fields include:

* instance metadata
* public payload
* secret payload
* answer finalization state (`answeredAt`)
* attached session if present
* assignment settings if the instance belongs to an assignment session

If the instance does not exist, the endpoint returns `404`.

---

## Access control

The endpoint also runs `resolvePracticeAccess()` against the linked session.

Behavior summary:

* onboarding trial sessions bypass standard billing gate
* standard sessions still go through practice access rules
* assignment entitlement is enforced again after instance/session load

This ensures validate cannot be used against a session the actor should not access.

---

## Session ownership

If the instance has a session, the session owner must match the current actor.

Rules:

* user-owned session requires matching `actor.userId`
* guest-owned session requires matching `actor.guestId`

Mismatch returns `403`.

---

## Trial rules

For onboarding trial sessions:

* the session must not also be assignment-backed
* a trial + assignment combination is treated as invalid state

If that invalid combination is detected, the endpoint returns `400`.

---

## Answer-kind matching

When not revealing, `answer.kind` must exactly match `instance.kind`.

Example:

* instance kind = `single_choice`
* request answer kind = `numeric`
* result = `400 Answer kind mismatch`

This prevents clients from submitting a payload that does not match the original exercise kind.

---

## Reveal policy

Reveal permissions are computed using:

* whether the instance belongs to an assignment session
* `allowReveal` encoded inside the signed key
* assignment-level `allowReveal` flag

Behavior:

* non-assignment: reveal allowed if the key allows it
* assignment: reveal allowed only if both:

    * key allows reveal
    * assignment allows reveal

If reveal is requested while disabled, the endpoint returns `403`.

---

## Attempt policy

The endpoint is the server truth for max attempts.

Run modes:

* `assignment`
* `onboarding_trial`
* `session`
* `practice`

Attempt policy comes from `computeMaxAttempts()`.

General behavior:

* assignment mode: finite attempts
* session mode: finite attempts
* onboarding trial: finite attempts
* practice mode: may be unlimited depending on policy

The endpoint counts **prior non-reveal attempts** for the current actor and instance.

If the max is already reached, it returns `409 No attempts left for this question.`

---

## Finalization rules

A question may become finalized when:

* the answer is correct, or
* the answer exhausts allowed attempts in a finite-attempt mode

Reveal requests do **not** finalize the question.

If a non-reveal request arrives after the instance is already finalized, the endpoint returns `409`.

---

## Expected answer loading

The endpoint pulls canonical expected data from:

* `instance.secretPayload.expected`

If the expected payload is missing, the endpoint returns `500` because this is considered a server bug.

---

## Grading

Grading is delegated to `gradeInstance()`.

Inputs:

* loaded instance
* canonical expected payload
* submitted answer or `null` for reveal requests
* reveal flag
* `showDebug` assignment flag

Outputs generally include:

* `ok`
* `explanation`
* `revealAnswer` when reveal mode is active
* kind-specific grading data as needed

---

## Persistence behavior

The endpoint persists every validate call as a `practiceAttempt`.

### Attempt record fields include:

* `sessionId`
* `instanceId`
* `userId`
* `guestId`
* `answerPayload`
* `ok`
* `revealUsed`

### Special rules

* reveal attempts are saved with `revealUsed: true`
* only the first finalization marks `instance.answeredAt`
* session totals only increment once, on first finalized attempt

---

## Session completion behavior

When an instance belongs to a session and finalization happens for the first time:

1. session `total` increments by 1
2. session `correct` increments by 1 if answer is correct
3. answered-count is recomputed canonically using finalized questions
4. if answered-count reaches target-count:

    * session status becomes `completed`
    * completion summary is built

---

## Session summary behavior

When the session completes, the endpoint may return a summary like:

* `correct`
* `total`
* `answeredCount`
* `targetCount`
* `missed`

Missed questions are computed from the **last non-reveal attempt per instance**.
Only instances whose last non-reveal attempt is incorrect are included.

Important:

* expected answers are **not leaked** in the summary
* summary includes question metadata and the user’s submitted answer only

---

## Success response shape

Example:

```json
{
  "ok": true,
  "revealUsed": false,
  "revealAnswer": null,
  "expected": null,
  "explanation": "Correct.",
  "finalized": true,
  "attempts": {
    "used": 1,
    "max": 3,
    "left": 2
  },
  "sessionComplete": false,
  "summary": null,
  "returnUrl": "/subjects/python/modules/python-0",
  "requestId": "uuid"
}
```

### Fields

#### `ok`

Type: `boolean | null`

* `true` or `false` for normal validation requests
* `null` for reveal requests

#### `revealUsed`

Type: `boolean`

Indicates whether this request was a reveal request.

#### `revealAnswer`

Type: any | null

Returned only for reveal requests when the grader provides reveal content.

#### `expected`

Currently returned as `null`

The endpoint intentionally does not expose canonical expected payload directly in this response.

#### `explanation`

Type: `string | null`

Behavior:

* reveal requests: may include full explanation
* normal requests: may include normal grading explanation
* numeric incorrect answers may be normalized to a more generic explanation like `Not correct.`

#### `finalized`

Type: `boolean`

Whether the question is now finalized after this request.

#### `attempts`

```json
{
  "used": 1,
  "max": 3,
  "left": 2
}
```

* `used`: total non-reveal attempts used after this request
* `max`: maximum allowed attempts or `null`
* `left`: attempts remaining or `null`

#### `sessionComplete`

Type: `boolean`

Whether the session became complete as a result of this request.

#### `summary`

Type: object or `null`

Present when the session has just completed and summary data was produced.

#### `returnUrl`

Type: `string | null`

A same-origin sanitized return URL derived from session state.

#### `requestId`

Type: `string`

Server-generated request id for tracing.

---

## Reveal success example

```json
{
  "ok": null,
  "revealUsed": true,
  "revealAnswer": {
    "kind": "single_choice",
    "optionId": "choice_a"
  },
  "expected": null,
  "explanation": "The correct answer is choice A because ...",
  "finalized": false,
  "attempts": {
    "used": 0,
    "max": 3,
    "left": 3
  },
  "sessionComplete": false,
  "summary": null,
  "returnUrl": "/subjects/python/modules/python-0",
  "requestId": "uuid"
}
```

---

## Session-complete response example

```json
{
  "ok": false,
  "revealUsed": false,
  "revealAnswer": null,
  "expected": null,
  "explanation": "Not correct.",
  "finalized": true,
  "attempts": {
    "used": 3,
    "max": 3,
    "left": 0
  },
  "sessionComplete": true,
  "summary": {
    "correct": 7,
    "total": 10,
    "answeredCount": 10,
    "targetCount": 10,
    "missed": [
      {
        "instanceId": "inst_1",
        "kind": "single_choice",
        "title": "Variables",
        "prompt": "Which line creates a variable?",
        "yourAnswer": { "optionId": "choice_b" }
      }
    ]
  },
  "returnUrl": "/subjects/python/modules/python-0",
  "requestId": "uuid"
}
```

---

## Error responses

## Invalid content-type

Status: `415`

```json
{
  "message": "Unsupported content-type.",
  "requestId": "uuid"
}
```

## Invalid body

Status: `400`

```json
{
  "message": "Invalid body.",
  "issues": [],
  "requestId": "uuid"
}
```

## Missing key

Status: `400`

```json
{
  "message": "Missing key.",
  "requestId": "uuid"
}
```

## Invalid or expired key

Status: `401`

```json
{
  "message": "Invalid or expired key.",
  "requestId": "uuid"
}
```

## Actor mismatch

Status: `401`

```json
{
  "message": "Actor mismatch.",
  "requestId": "uuid"
}
```

## Instance not found

Status: `404`

```json
{
  "message": "Instance not found.",
  "requestId": "uuid"
}
```

## Invalid trial session state

Status: `400`

```json
{
  "message": "Invalid trial session state.",
  "requestId": "uuid"
}
```

## Answer kind mismatch

Status: `400`

```json
{
  "message": "Answer kind mismatch.",
  "debug": {
    "instanceKind": "single_choice",
    "answerKind": "numeric"
  },
  "requestId": "uuid"
}
```

## Forbidden / session owner mismatch

Status: `403`

```json
{
  "message": "Forbidden.",
  "code": "SESSION_OWNER_MISMATCH",
  "requestId": "uuid"
}
```

## Reveal disabled

Status: `403`

```json
{
  "message": "Reveal is disabled for this question.",
  "requestId": "uuid"
}
```

## Already finalized

Status: `409`

```json
{
  "message": "This question is already finalized.",
  "finalized": true,
  "requestId": "uuid"
}
```

## No attempts left

Status: `409`

```json
{
  "message": "No attempts left for this question.",
  "attempts": {
    "used": 3,
    "max": 3,
    "left": 0
  },
  "finalized": true,
  "requestId": "uuid"
}
```

## Missing canonical expected payload

Status: `500`

```json
{
  "message": "Server bug: missing secretPayload.expected.",
  "requestId": "uuid"
}
```

## Forbidden by same-origin policy

Status: `403`

```json
{
  "message": "Forbidden.",
  "requestId": "uuid"
}
```

## Rate limited

Status: `429`

```json
{
  "message": "Too many requests.",
  "requestId": "uuid"
}
```

## Service unavailable

Status: `503`

```json
{
  "message": "Service unavailable.",
  "requestId": "uuid"
}
```

---

## Response headers

The endpoint applies:

* `Cache-Control: no-store, max-age=0`
* `Pragma: no-cache`
* `X-Content-Type-Options: nosniff`
* `Referrer-Policy: same-origin`
* `Cross-Origin-Resource-Policy: same-origin`
* `Content-Security-Policy: default-src 'none'`
* `X-Request-Id: <uuid>`

Rate-limited responses may also include:

* `Retry-After`

---

## Security notes

### Same-origin protection

In production, the endpoint enforces same-origin POST requests using:

* `Origin` header when available
* otherwise `Referer`

### Signed key authorization

A valid signed key is required for every validate or reveal action.

### Actor/session ownership

The current actor must match the key payload and the linked session owner.

### Reveal hardening

The endpoint does not expose raw canonical expected payload in the response.

### Non-cacheable

All validate responses are explicitly marked non-cacheable.

---

## Practical examples

## Example 1: validate a single-choice answer

```http
POST /api/practice/validate
Content-Type: application/json

{
  "key": "signed-practice-key",
  "answer": {
    "kind": "single_choice",
    "optionId": "choice_a"
  }
}
```

## Example 2: validate code input

```http
POST /api/practice/validate
Content-Type: application/json

{
  "key": "signed-practice-key",
  "answer": {
    "kind": "code_input",
    "language": "python",
    "code": "print(input())"
  }
}
```

## Example 3: request reveal

```http
POST /api/practice/validate
Content-Type: application/json

{
  "key": "signed-practice-key",
  "reveal": true
}
```

## Example 4: drag reorder answer

```http
POST /api/practice/validate
Content-Type: application/json

{
  "key": "signed-practice-key",
  "answer": {
    "kind": "drag_reorder",
    "order": ["t1", "t2", "t3"]
  }
}
```

---

## Notes for frontend consumers

* Always store the `key` returned by the Practice GET endpoint and submit it back unchanged.
* Do not assume `expected` will ever be populated in validate responses.
* Use `finalized` to decide whether the client should allow another answer submission.
* Use `attempts.left` to display retry state.
* Use `sessionComplete` and `summary` to transition into summary UI without making another request if desired.
* Treat `revealAnswer` as reveal-only content, not as a general answer contract for all kinds.
* Preserve and pass through guest cookies on guest flows.

---

## Recommended future documentation additions

As the API evolves, you may want to add:

* a table mapping each exercise kind to its exact answer and reveal format
* the structure of the signed key payload
* a sequence diagram from Practice GET → Validate → Summary
* client fetch helper examples
* typed response DTOs for frontend consumption
