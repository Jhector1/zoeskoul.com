# Course 2 — Assessment alignment, four modules

**Curriculum authority:** `course.spec.json` and `course.plan.json`, with learner-facing lesson content in `MODULE_1_LESSONS.md` through `MODULE_4_LESSONS.md`. `LESSON_PRACTICE_BANK.json` contains 60 authored quiz/project practice records. The bank is editorial input, **not** a runtime-importable checker format.

| Module | Teaching topics | Applied module project | Assessment evidence | Release gate |
|---|---|---|---|---|
| 1. Understanding Linux Permissions | `reading-permission-strings`, `current-user-and-groups`, `file-versus-directory-bits`, `parent-path-access` | `module-1-permission-detective` | Decode modes correctly; explain group/owner/other and blocked ancestor; unchanged fixture | Read-only fixture observation plus human/structured interpretation |
| 2. Managing File and Directory Access | `symbolic-chmod-basics`, `script-executable-bit`, `numeric-permission-math`, `apply-safe-numeric-modes` | `module-3-secure-script-folder` | Minimal chmod, exact real modes and type/owner checks; no collateral changes | Server-owned mode-bit verifier in isolated Runner |
| 3. Users, Groups, and Troubleshooting | `owner-group-identity`, `ownership-administration-concepts`, `sudo-root-concepts`, `least-privilege-decisions`, `permission-denied-triage`, `umask-and-default-modes` | `module-7-permission-debugging-lab` | Identity and group reasoning; parent-path diagnosis; owned fixture repair; umask math | No privileged command execution; verify owned changed modes |
| 4. Capstone: Secure Project Folder | `final-capstone-secure-project` | Five cumulative steps within one topic | Inspect → private config → script/README → shared folder → verification and written handoff | All six exact mode checks, path traversal, ownership, no symlinks or unrelated changes |

The three module project topic IDs deliberately retain their old editorial slugs even though the parent module numbers changed; Course 2 has **never been published**, so a future editorial rename is possible with a reviewed crosswalk. No already published Course 1 IDs change.

## Test contract

**Course 1:** introduction and navigation before file creation; `echo`, `>`, `>>`, `wc -l` before capstone; existing topic IDs preserved; editor hidden for terminal-only tasks; no sudo/system paths.

**Course 2 conceptual tasks:** Question correct answers are authored in `LESSON_PRACTICE_BANK.json`. Do not treat terminal command history as proof that the student understands access. Use structured choice and explanation checks.

**Course 2 file-mode tasks:** Authoritative grader must use the Runner's existing authenticated session and file service, canonical root/tenant ownership, no-follow file descriptor access (`openat`/`O_NOFOLLOW` or equivalent), full ancestor type checks, safe fixture lifecycle and lease, bounded execution, server-owned expected modes, actual `stat.S_IMODE(st_mode)`, and no unrelated changes. Do **not** trust browser-reported modes, command text or symlink-following `Path.stat()` on untrusted inputs. The included `tools/reference_mode_audit.py` is a read-only local illustration and not safe for adversarial production races.

**Capstone target modes:**

| Relative path | Type | Required octal mode |
|---|---|---|
| `secure-project` | directory | 755 |
| `secure-project/README.md` | regular file | 644 |
| `secure-project/scripts` | directory | 700 |
| `secure-project/scripts/run.sh` | regular file | 700 |
| `secure-project/secrets.env` | regular file | 600 |
| `secure-project/shared` | directory | 770 |

Learner interpretation also must explain that `770` grants group permission bits, but does not create actual group membership. The shared folder may require administrator-managed group assignment in a real team, which is **not** executed in this sandbox.

## Editorial + publication gate

- [x] Four modules with topic IDs, sections, projects, and five-step capstone in synchronized spec/plan
- [x] Lesson drafts with explanations, worked examples, safe terminal tasks, quiz answers and rubric
- [x] Editorial practice bank covering 18 topics; 4 items for each of 14 conceptual/technical topics
- [x] Reference real-mode checker smoke tests for valid modes, mode mismatch, symlink and ownership
- [ ] Convert/review markdown and bank into production sketch/exercise records through existing authoring workflow
- [ ] Add authenticated race-safe production Runner permission mode checker and resettable fixture API
- [ ] Verify browser teaching flow, exercise results, student workspaces and isolated tenant authorization
- [ ] Admin approve, intentionally update authoring index/subject plan/catalog/lifecycle and seed only approved course metadata
- [ ] Confirm existing enrollments and course versions are preserved
