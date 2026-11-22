# Module 2 — Managing File and Directory Access

**Outcome:** Apply a minimal, authorized change with symbolic or numeric `chmod`, then verify the actual result. This module uses **only trusted, learner-owned, pre-seeded paths** in an isolated Linux workspace. No `sudo`, `chmod -R`, `chown`, `chgrp`, system files, or real secrets.

## Topic `symbolic-chmod-basics` — Change Specific Bits with `chmod`

`chmod` changes the permission mode of a file or directory. Symbolic mode syntax targets an identity class: `u` (owner), `g` (group), `o` (other), or `a` (all). The operator `+` adds bits, `-` removes bits, and `=` sets the selected class exactly. The letters `r`, `w`, and `x` identify the bits.

For a disposable, *owned* fixture, read the current mode first:

```bash
ls -l secure-lab/notes.txt
chmod go-r secure-lab/notes.txt
ls -l secure-lab/notes.txt
```

Press **Enter** after each command. `go-r` removes group and other read bits; it does not inherently set the owner's bits. Therefore inspect the before/after mode rather than predicting a complete final mode without knowing the initial state.

Examples to reason about:

| Command | Meaning |
|---|---|
| `chmod u+x run.sh` | Add execute for owner only |
| `chmod go-r note.txt` | Remove group/other read |
| `chmod u=rw note.txt` | Owner gets precisely read/write; execute cleared for owner |
| `chmod o-rwx private/` | Remove all other-user bits from this directory |

**Do not** use `chmod 777` as a default fix, and never run permission changes on paths you do not own or control.

**Try It:** On the lab's provided, owned `secure-lab/notes.txt`, run `ls -l`, apply the smallest specified change, and inspect again. Explain which characters changed and which stayed the same. Press Enter after each command. The lab must verify the **real mode bits**, not just the command history.

**Frequent mistake:** Using `chmod u+x` when the actual problem is a non-traversable parent directory. Always inspect the path first.

## Topic `script-executable-bit` — Fix a Safe Script's Execute Permission

Linux scripts generally need an appropriate interpreter and permission to execute directly. A supplied, reviewed script may display a message but fail to start as `./run.sh` because it lacks execute permission. In contrast, `bash run.sh` asks Bash to read and interpret the file directly and has different permission requirements. Don't use that workaround as evidence that the execute bit was fixed.

```bash
ls -l secure-lab/scripts/run.sh
chmod u+x secure-lab/scripts/run.sh
ls -l secure-lab/scripts/run.sh
```

On a trusted, pre-seeded script, verify it after its parent directories permit traversal:

```bash
./secure-lab/scripts/run.sh
```

Do not create your own Bash scripts here; Course 3 will teach scripting. The checker must establish that only the expected mode changed, and the script is the vetted fixture rather than an arbitrary executable.

**Try It:** The lab starts with `run.sh` owned by the learner, mode `600`, containing an innocuous echo message. Add the owner execute bit (`chmod u+x`) to produce `700`. Run the script and observe the expected marker, then inspect the new mode. Never rely only on the marker to grade permissions.

**Check:** Does `chmod +x` mean “only the owner receives execute”? **Not necessarily.** Use `u+x` when the task specifically means the owner.

## Topic `numeric-permission-math` — Read Octal Permissions

In octal notation, each permission class gets one digit: read is `4`, write is `2`, execute is `1`. Add only the bits that should be allowed.

| Mode | Owner | Group | Other | Typical *example* use |
|---|---|---|---|---|
| `600` | rw- | --- | --- | Private text/config fixture |
| `644` | rw- | r-- | r-- | Publicly readable documentation (where parent traversal permits) |
| `700` | rwx | --- | --- | Private directory or executable |
| `755` | rwx | r-x | r-x | Directory intended for public traversal |
| `770` | rwx | rwx | --- | Shared team directory when correct group ownership/membership exists |

**Worked example:** `rwxr-x---` becomes `7 5 0`, so mode `750`. The directory's bits do not automatically tell you whether another person belongs to the owning group.

**Try It (mental first):** Convert `rw-------`, `rwx------`, and `rwxrwx---` to numeric modes before testing any command. Answers: `600`, `700`, `770`. Explain why setting mode `777` on a private config file would violate least privilege.

**Frequent mistake:** Treating `chmod 644` as universally correct for all files. Directories often need execute/traversal bits, while a private credential-like fixture should not be world-readable.

## Topic `apply-safe-numeric-modes` — Apply and Verify Numeric Modes

When you know the exact intended access policy, numeric `chmod` is concise. In this controlled lab, the learner owns every target.

```bash
ls -l secure-lab/private-note.txt
chmod 600 secure-lab/private-note.txt
ls -l secure-lab/private-note.txt
```

On a Linux Runner that supports GNU `stat`, `stat -c '%a %n' secure-lab/private-note.txt` may display the octal mode and path. The lab's server-side checker must independently read `stat.S_IMODE` for the actual inode and reject symlinks. The visible `stat` output is helpful for students but **not** authoritative grading evidence.

**Try It:** Set an owned private note to `600` and owned README to `644`; inspect each. If the parent directories deny traversal, also inspect their modes *before* proposing a fix. Do not touch system files or perform recursive changes.

**Check your understanding:** A group-shared directory is set to `770`. Will every team member now be able to enter it? **Only if they have the applicable owner/group identity and all ancestor directories permit traversal.** `770` does not create group memberships.

## Module project `module-3-secure-script-folder` — Secure Your Workspace

**Starter fixture:** An isolated, learner-owned `secure-lab/` containing `scripts/run.sh`, `private-note.txt`, and `README.md`. It uses dummy text only. No arbitrary scripts or credentials.

1. Inspect `secure-lab/`, `scripts/`, and all three files with `ls -ld`, `ls -l`, and read-only `stat`.
2. Explain which item needs execution and which item must remain private.
3. Set `secure-lab/scripts/` and `run.sh` to `700`, `private-note.txt` to `600`, and `README.md` to `644` *only within this fixture*.
4. Verify the actual modes and relevant parent traversal. Run the vetted script only if it is safe and accessible.
5. Report before/after permissions and why each mode matches the audience. Do not modify unrelated files.

**Assessment (25 points):** inspections 4; script/folder `700` 8; private note `600` 4; README `644` 4; real post-state verification and no unrelated changes 5. Exact mode checks are a **publication blocker** until the isolated Runner verifier is integrated.

### Module 2 knowledge check (author answer key)

1. What does `chmod g-w file` remove? **Write permission for the owning group.**
2. What is the numeric value of `r-x`? **5.**
3. Which is narrower for a private config, `600` or `644`? **`600`.**
4. Why inspect a parent directory before fixing file permissions? **Missing directory traversal may cause the failure.**
5. Can `chmod` safely create group membership? **No.**

**Transition:** Mode bits are only part of a Linux access decision. Next, investigate ownership, group membership, system-administration boundaries, and errors.
