# Module 4 — Capstone: Secure Project Folder

**One module, one capstone topic:** `final-capstone-secure-project` · **One cumulative exercise workspace** across five steps. This does **not** require authoring Bash scripts, creating users or changing system ownership. Everything runs inside a fresh, isolated, learner-owned directory using dummy data.

## Project briefing

You are the access coordinator for a small project. The team needs readable public documentation, a runnable *pre-reviewed* script, a private dummy configuration file, and a workspace that a specific owning group could use. Your job is not to make everything world-writable; it is to assign only the necessary permission bits and explain any identity assumptions.

The Runner provisions this fixture **before** the learner starts. All entries are regular files or directories and owned by the unprivileged session user. There are no symbolic links, secrets, external mounts, or executable user uploads.

```text
secure-project/               target 755
├── README.md                 target 644
├── scripts/                  target 700
│   └── run.sh                target 700  (trusted provided script)
├── secrets.env               target 600  (dummy placeholder, not a real secret)
└── shared/                   target 770  (group membership determines who can use it)
```

**Important:** A mode of `770` for `shared/` gives the *owning group* bits, but does not ensure an arbitrary colleague belongs to that group. A production shared directory may also need administrator-managed ownership, ACLs or setgid policy; none of those privileged changes is required or permitted in this beginner lab.

## Step 1 — Inspect Before Changing

**Goal:** Inventory file type, owner/group, numeric mode and path traversal before making changes.

```bash
pwd
ls -ld secure-project secure-project/scripts secure-project/shared
ls -l secure-project
ls -l secure-project/scripts
id
```

Press Enter after each command. The expected *observations* depend on the deliberately imperfect starter modes. Write down which paths are accessible and why. **Do not modify anything during this inspection step.**

**Evidence:** A five-entry inventory naming actual modes and which identity class applies. The author check verifies that all fixture modes remain unchanged after step 1.

## Step 2 — Protect the Private Configuration

**Goal:** Only the owner may read/write the dummy config.

```bash
chmod 600 secure-project/secrets.env
ls -l secure-project/secrets.env
```

Verify its mode without `cat` or printing the file contents. It is dummy test data, but the skill transfers to protecting actual secrets. The server-side checker verifies that the inode is a regular file, not a symlink, and `stat.S_IMODE` is `0o600`.

**Common mistake:** Setting the configuration to `644` because it is “just text.” Text files may be private even when they are not executable.

## Step 3 — Make the Script Runnable, Keep Documentation Readable

**Goal:** Keep the trusted script owner-only executable, while making the README readable through the project root.

```bash
chmod 700 secure-project/scripts
chmod 700 secure-project/scripts/run.sh
chmod 644 secure-project/README.md
ls -ld secure-project/scripts
ls -l secure-project/scripts/run.sh secure-project/README.md
```

Press Enter after each command. If the lab allows running the trusted pre-seeded script, do so *after* checking it is the designated safe fixture. Do not edit or replace it. Exact mode checks must verify all three targets independently.

**Question:** Why isn't a `644` README automatically readable from any location? Because every ancestor needs traversal permission for that identity.

## Step 4 — Configure the Team Folder and Parent Traversal

**Goal:** Make project documentation reachable through a `755` project root and prepare a `770` group directory.

```bash
chmod 755 secure-project
chmod 770 secure-project/shared
ls -ld secure-project secure-project/shared
```

The first mode allows public traversal of the project root; the second enables owner and owning group access to `shared/` while denying others. In your explanation, state that a teammate requires membership in the owning group as well as permission to traverse every parent. **Do not create groups, run chgrp, or use sudo.**

## Step 5 — Audit, Explain and Hand Off

**Goal:** Inspect the final workspace and document why each mode is minimal and sufficient for the stated audience.

```bash
ls -ld secure-project secure-project/scripts secure-project/shared
ls -l secure-project
ls -l secure-project/scripts
```

Use the approved, isolated mode-checker (not a browser assertion or text match) to verify exactly:

| Path | Type | Octal bits |
|---|---|---|
| `secure-project/` | directory | `755` |
| `secure-project/README.md` | regular file | `644` |
| `secure-project/scripts/` | directory | `700` |
| `secure-project/scripts/run.sh` | regular file | `700` |
| `secure-project/secrets.env` | regular file | `600` |
| `secure-project/shared/` | directory | `770` |

**Handoff note:** Explain in 3–6 sentences who can read the README, who can access the dummy secret, why the script has owner execute, and what extra group-membership condition is needed for the shared folder. Record any remaining authorization assumptions. Check that no extra files, symlinks or unexpected permission changes were introduced.

## Capstone scoring rubric (100 points)

| Category | Points | What counts |
|---|---:|---|
| Inspection and identity reasoning | 15 | Read actual before-state and determine applicable triplets |
| Private configuration | 15 | `secrets.env` is regular file, owned by learner, exact mode `600` |
| Executable and documentation | 25 | Scripts directory/file `700`; README `644`, correct types |
| Sharing and traversal | 20 | Project root `755`; group folder `770`; group-membership caveat |
| Verification and safety | 15 | Server-owned `stat.S_IMODE`, no symlinks, unchanged unrelated fixtures |
| Written handoff | 10 | Clear least-privilege reasoning, no forbidden privileged commands |

**Pass standard:** 80/100 **and** all critical safety and exact-mode gates pass. A correct narrative cannot substitute for actual permission bits, and a correct mode cannot substitute for safe-path ownership checks. A failing verification should give a precise, non-secret error and allow the learner to retry within a resettable fixture.

## Required authoring and release gates

The source package can contain these materials without exposing the course publicly. Before any real student is graded on `chmod`, integrate the server-owned mode verifier with the existing isolated Runner; verify symlink escapes and permission race failure cases, authorization and ownership, and whether real filesystem modes survive the sandbox workspace lifecycle. Course metadata remains unpublished until an administrator reviews sketches, fixtures and browser behavior.

**End-of-course outcome:** You can diagnose a permission problem and correct only the minimal necessary bits, distinguishing mode changes from identity and group administration.
