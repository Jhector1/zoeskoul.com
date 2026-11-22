# Module 3 — Users, Groups, and Permission Troubleshooting

**Outcome:** Diagnose access errors using identity, mode and parent-path evidence. Explain what requires administrator authorization without running privileged commands. Practice default permissions and make small, authorized corrections on pre-seeded, learner-owned fixtures.

## Topic `owner-group-identity` — Distinguish Owners, Groups, and Access

In `ls -l`, the fields after the link count usually include owner and owning group. They are metadata, not commands. Ownership is not the same as the currently active user, and an owner's own bits normally take precedence over the group and other triplets for that user.

```bash
whoami
id
groups
ls -l secure-lab
```

**Worked case:** `-rw-r----- 1 alex editors ... report.txt` and current user `sam`. If `sam` belongs to `editors`, the group `r--` triplet normally applies. If `sam` does not belong to `editors`, the other `---` triplet applies. This example does not assume that `alex` or `editors` exists on the learner's actual machine.

**Try It:** Compare the actual values from `whoami`, `id`, and `groups` to a set of fictional file ownership cards. Explain which triplet applies under each fictional identity. Your answer must distinguish *permission bits* from *group membership* and acknowledge traversal requirements.

**Mistake to avoid:** Assuming the group triplet grants access to anyone simply because it is nonempty.

## Topic `ownership-administration-concepts` — When Ownership Must Change

`chown` changes a file's owning user; `chgrp` changes its owning group. These are administration concepts here, not student lab commands. On a real Linux machine, changing ownership may require elevated privileges or specific ownership/group rules. Our learner sandbox is not a place to manage system accounts or change fixture ownership.

**Scenario:** A team wants both members to edit a shared folder. Is `chmod 777 shared/` a good first fix? No. Determine intended collaborators, group identity, ancestor traversal, and whether a controlled administrator-owned setup should assign the directory to a shared group. Explain the change in plain language; **do not run chown, chgrp, or group-management commands**.

**Try It (analysis only):** Given three simulated listings, identify which ones are problems with modes, which are group membership mismatches, and which require an authorized administrator. Provide a least-privilege recommendation.

**Check:** Can a student solve every ownership mismatch by running `sudo chown`? **No**, and this course prohibits executing privileged operations.

## Topic `sudo-root-concepts` — Why Root Privileges Need Boundaries

Root is a privileged identity. `sudo` may allow an authorized user to run a command with elevated privileges after authentication and policy checks. Power magnifies the consequences of typos, overly broad paths, and accidental writes. Reading about `sudo` does not grant permission to use it.

**Example decision:** A task asks you to repair `secure-lab/notes.txt`, which you own. Should you start with `sudo`? **No.** Inspect the file and ancestor directories, and make a narrowly scoped change only if you own the fixture. If an intended system path is inaccessible, stop and ask the administrator instead of bypassing permissions.

**Try It (no terminal command):** Classify these decisions as safe or unsafe in a student lab: inspect a permitted path (`safe`); use `chmod` on a named, learner-owned fixture with approval (`conditionally safe`); run `sudo chmod -R 777 /` (`unsafe and prohibited`); change `/etc` permissions (`unsafe and prohibited`).

**Common misconception:** “Permission denied” always means “I need sudo.” Often it means a wrong path, missing parent `x`, incorrect ownership, or the task intentionally limits access.

## Topic `least-privilege-decisions` — Choose the Minimum Needed Access

Least privilege means granting only the access required for the intended task. It is not the same as making access maximally convenient.

| Scenario | Reasonable intent | Example mode |
|---|---|---|
| Private configuration fixture | Only owner reads and changes | `600` |
| Documentation intended to be publicly readable | Owner writes; others read | `644` |
| Vetted script only owner executes | Owner-only access | `700` |
| Shared directory for one owning group | Owner/group may enter and modify | `770`, *with correct memberships* |

These are starting examples, not universal prescriptions. Directory traversal, user/group ownership, default ACLs and the actual audience matter. Permission changes should be as narrow as the validated requirement allows.

**Try It (analysis only):** Choose which fixture mode best satisfies three stated audiences; justify why `777` is excessive, and distinguish a missing mode bit from a missing group membership. Do not change accounts.

## Topic `permission-denied-triage` — Trace a Permission Denied Error

Use a repeatable diagnostic order:

1. Confirm the intended path and current directory with `pwd`.
2. Inspect the target with `ls -l` if accessible; distinguish file versus directory.
3. Inspect ancestors with `ls -ld`; note any missing `x` for the intended identity.
4. Inspect `whoami`, `id`, and `groups` to determine the applicable class.
5. Determine the minimum authorized fix; only change owned, named fixtures.
6. Verify after the change using mode inspection and the intended safe operation.

**Worked case:** `./secure-lab/scripts/run.sh` fails. The script mode is `700`, but the containing directory is `600`. A directory without execute/traversal permission can block access. The correct fix is to inspect intended access and, where authorized and safe, restore the minimal directory `x` bit—not change the script to `777`.

**Try It:** In an isolated owned fixture, predict the first inaccessible path, use `ls -ld` to gather evidence, then make the single mode correction specified by the task. Avoid destructive, recursive, or privileged commands. The checker must independently validate the resulting mode and absence of unrelated changes.

## Topic `umask-and-default-modes` — Understand Default Permission Masks

Programs typically create new files requesting mode `666` and directories requesting `777`, then the process `umask` removes permission bits. In simple examples, the effective result is bitwise masking, not subtraction; other tools and policies can further influence actual modes.

Example: with umask `022`, a typical newly created regular file is `644`, while a typical newly created directory is `755`.

| Requested | umask | Typical resulting mode |
|---|---|---|
| File `666` | `022` | `644` |
| Directory `777` | `022` | `755` |
| File `666` | `077` | `600` |
| Directory `777` | `077` | `700` |

```bash
umask
```

This reads the current mask; **do not change your shell or global startup profile** in the lesson. Use a table exercise to calculate results under hypothetical masks.

**Try It:** Predict regular-file and directory modes with `umask 027`, starting from `666` and `777`: file `640`, directory `750`. Explain how the group and other bits differ from `022`.

**Common mistake:** Assuming `umask 022` “sets permissions to 022.” It removes bits from the requested mode.

## Module project `module-7-permission-debugging-lab` — Shared Team Directory

**Scenario:** A controlled, learner-owned `team-lab/` fixture is intended to permit its owner to maintain notes and a simulated shared folder. A supplied collaborator scenario describes different intended group memberships; you must not modify actual system groups.

1. Inspect the root, shared directory, and child modes with `ls -ld`, `ls -l`, and read-only `stat`.
2. Check the current identity with `id` and explain why it may differ from the scenario collaborator.
3. Identify the blocking parent or insufficient target permission in a deliberately broken fixture.
4. Apply only the specified mode repair on the **owned** fixture and re-inspect the resulting mode bits.
5. Explain how a real administrator would approach a group mismatch *without executing* ownership or privileged commands. Show the meaning of the group triplet and the likely default modes under a provided umask.

**Assessment (25 points):** evidence/identity 5; identify cause 6; narrow owned fixture repair 6; real mode and unchanged-path verification 5; least-privilege explanation 3. Scenarios involving `chown`, `chgrp` or `sudo` are conceptual questions, not executable labs.

### Module 3 knowledge check (author answer key)

1. Does mode `770` create a group or add members? **No.**
2. What should you inspect before blaming file mode for a denied path? **Parent-directory traversal and effective identity.**
3. Is `sudo` a universal solution to permission errors? **No; stop and diagnose first.**
4. With umask `027`, what is a typical new directory mode? **`750`.**
5. Why avoid `chmod -R 777`? **It grants excessive access, affects unrelated descendants, and obscures the underlying cause.**

**Transition to capstone:** You now have the theory and practice to inspect a project, adjust only its intended access, and verify the final state.
