# Module 1 — Understanding Linux Permissions

**Course:** Linux Files, Permissions, and Users · **Level:** beginner after Linux Terminal Fundamentals · **Status:** full editorial lesson draft, not a published sketch.

**Outcome:** Given a real or illustrated permission listing, a current identity and a path, determine what the bits mean, which identity class applies, and why the parent-directory path matters. **This module is read-only.**

**Existing prerequisite:** navigation with `pwd`, `ls`, `cd`, relative and absolute paths, file inspection. Linux usernames and group names are environment-dependent; no quiz may hardcode a learner UID/GID.

## Topic `reading-permission-strings` — Read Linux Permission Strings

A Linux permission listing is a concise summary of the file type, access bits, ownership, and other metadata. Before changing a permission, read the existing permissions and understand the intended users.

```bash
pwd
ls -l
ls -l secure-lab
```

Press **Enter** after each command. An *illustrative* `ls -l` line looks like this:

```text
-rwxr-x--- 1 learner study 82 Nov 9 10:20 run.sh
```

The first character (`-`) means a regular file; a leading `d` means directory; `l` indicates a symbolic link. The next nine characters are three groups: `rwx | r-x | ---`, describing owner, group, and everyone else respectively. `r` allows reading, `w` allows writing, `x` allows executing an eligible file. The dash indicates a missing bit. This is not a guarantee that an operation will succeed: the active identity, all parent directories, and other filesystem controls can affect effective access.

| Mode field | Type | Owner | Group | Other |
|---|---|---|---|---|
| `-rw-r-----` | file | `rw-` | `r--` | `---` |
| `drwxr-x---` | directory | `rwx` | `r-x` | `---` |
| `-rwx------` | file | `rwx` | `---` | `---` |

**Worked example:** For `-rw-r-----`, the owning user can read and modify the file. Members of the owning group may read it (assuming parent traversal). Everyone else has none of those permission bits. Nobody has the execute bit. Do not confuse the leading file-type dash with the owner execute bit.

**Try It (read-only):** Inspect the three pre-seeded `secure-lab/` entries with `ls -l secure-lab`. Write the type and all three triplets for each. If the fixture does not exist, use the provided lab starter; do not create an unrequested tree. Run `ls -ld secure-lab` to read the *directory's own* permissions. Press Enter after each command.

**Prediction check:** For `-rwxr-x---`, is execution granted to the group? **Yes** by the file's mode bits. Is it granted to others? **No**. Does the string prove an arbitrary user can run the file? **No**—the path and actual identity still matter.

**Frequent mistake:** Reading `drwx------` as an executable program. `d` means directory and directory `x` enables traversal, not program execution.

## Topic `current-user-and-groups` — Inspect User Identity

Linux stores owner and group identities separately. To decide whether owner, group or other permission bits normally apply, inspect the identity of the current process and the ownership of the target.

```bash
whoami
id
groups
ls -l secure-lab
```

`whoami` prints the effective username. `id` reports user and group identifiers and supplementary groups. `groups` displays the current user's group memberships. The sample `learner`, `study`, and numeric IDs shown in documentation are **examples**, not the student's guaranteed values.

**Worked example:** Suppose `report.txt` is owned by user `alex`, group `research`, mode `640`. If your effective UID matches `alex`, the owner triplet (`rw-`) applies. Otherwise, if you are in `research`, the group triplet (`r--`) typically applies. Otherwise, other (`---`) applies. Linux tests owner first, then group, then other; memberships are not a union of all triplets. ACLs and security mechanisms may refine the outcome.

**Try It:** Run `whoami`, `id`, `groups`, and `ls -l secure-lab`. Use your actual output to identify which triplet would apply to a supplied file. Do not create or switch system users. Press Enter after each command.

**Quick check:** Why shouldn't a quiz expect a particular UID such as `1000`? **Because the sandbox's user and group IDs vary.** The skill is interpreting relationships, not memorizing an environment-specific value.

## Topic `file-versus-directory-bits` — Files and Directories Use Bits Differently

A file's read bit governs reading file contents; its write bit governs modifying contents; its execute bit permits executing a suitable program or script. Directory bits work differently:

- Directory `r`: list the names of entries (subject to other permissions and filesystem controls).
- Directory `w`: change directory entries, such as creating/removing names, **usually requiring directory `x` as well**.
- Directory `x`: traverse/search the directory and resolve a known name beneath it.

Example:

```text
drwxr-x---  shared/
-rw-r-----  shared/notes.txt
```

A file may grant read permission but be unreachable because one of its ancestor directories lacks traversal permission. Making the file mode `777` would not fix a blocked ancestor and would grant unnecessary access.

**Try It (prediction first):** Consider a non-owner, non-group user. Can they open `shared/notes.txt` through `drwxr-x--- shared/`? **No**, other users have no directory `x`. Examine a supplied analogous fixture with `ls -ld secure-lab secure-lab/shared` before writing your explanation. Do not change permissions yet.

**Common mistake:** Assuming `x` on a directory means the directory can be executed as a script. It means names under it can be traversed.

## Topic `parent-path-access` — Diagnose Parent Directory Access

Inspect an inaccessible path one component at a time, starting from the containing directories. `ls -ld path` reports the mode **of that directory**, whereas `ls -l path` normally reports entries *inside* that directory.

```bash
ls -ld secure-lab
ls -ld secure-lab/public
ls -l secure-lab/public
```

**Worked example:** `secure-lab/public/README.md` is `644`, but `secure-lab` is `700` and the reader is not the owner. They normally cannot reach the README by this path, irrespective of the file's own read bit. Investigate the parent; do not broadly relax every child.

**Try It:** Using a prebuilt inaccessible-path scenario, inspect the parent chain and identify the *first blocked ancestor* for the intended identity. State the minimum intended access change; do **not** run `chmod` or administrative commands in Module 1.

**Quick check:** Why can a directory with `--x` still permit access to a known filename but not permit ordinary listing? `x` permits name lookup and `r` permits name enumeration. Effective access still depends on ancestors and target permissions.

## Module project `module-1-permission-detective` — Permission Detective

**Scenario:** A team hands you a workspace containing `secure-lab/`, `secure-lab/shared/` and several example files. Your job is to audit *without modifying anything*.

1. Run `pwd` and `ls -ld secure-lab`; record the mode of the parent.
2. Run `ls -l secure-lab` and `ls -ld secure-lab/shared`; decode the type and three permission triplets.
3. Run `whoami`, `id`, `groups`; identify which triplet applies to your current identity for the supplied fixture.
4. For each example file, predict whether an intended non-owner reader can access it, considering parent traversal.
5. Submit a short report: observed mode, likely applicable triplet, first blocked path (if any), and a least-privilege suggestion. **No chmod yet.**

**Assessment (20 points):** mode interpretation 6; user/group reasoning 4; ancestor traversal 6; concise safe recommendation 4. Verification requires correct answers and an unchanged starter fixture. Checking only that a file exists cannot measure this outcome. Learners may retry with a reset fixture.

### Module 1 knowledge check (answers for the author, not shown before the attempt)

1. What does the first `d` in `drwxr-xr-x` indicate? **Directory.**
2. In `-rw-r-----`, can the owning group execute? **No.**
3. Does directory `x` mean you can run the directory as a program? **No; it permits path traversal.**
4. Which command shows a directory's own permissions? **`ls -ld directory`.**
5. Why might a `644` file still be inaccessible? **A parent directory may deny traversal, or identity/ACLs may deny access.**

**Transition to Module 2:** Now that you can inspect and reason about access, you can learn targeted changes on *learner-owned* files. Never experiment on system files.
