# Course 1 — Lesson-level alignment and live publication review

**Course:** Linux Terminal Fundamentals · Current published stable IDs are preserved. This change is **authoring-only**; it does not modify production lesson sketches or enrolled progress. Apply these edits in the existing reviewed publishing workflow rather than direct database manipulation.

## Corrected sequence

| Module | Prerequisite knowledge | What students actually do | Must not do yet |
|---|---|---|---|
| 1 Terminal Navigation Basics | Terminal prompt, command/output, `pwd`, `ls`, `ls -a`, `cd`, `.`, `..`, `~`, quoted paths | Navigate and inspect pre-seeded Terminal Map; read folder names, including hidden items | `mkdir`, `touch`, `rm` or file creation |
| 2 Files, Folders, and Viewing Content | Module 1 navigation | `mkdir`, `mkdir -p`, `touch`, `cp`, `mv`, targeted `rm`, `echo`, `>`, `>>`, `cat`, `head`, `tail`, `wc -l` | `chmod`, `chown`, sudo and scripts |
| 3 Community Media Archive capstone | Modules 1 and 2 | Five cumulative steps: inspect → create → write → organize → verify and clean | Outside-workspace operations, permission changes and unreviewed scripts |

## Exact published-sketch changes to review

- **`what-the-terminal-is`:** Retain standalone reading-only welcome, then each actual technical sketch has its own terminal Try It. `pwd` and `ls` prompts say "press Enter"; do not substitute a general introductory sketch for hands-on practice.
- **`where-am-i`:** Teach `ls -a` before asking about hidden files; distinguish what `ls` and `pwd` report.
- **`moving-around`:** Include names with spaces, e.g. `cd "Project Notes"`, and emphasize `..`, `.`, and `~` without assuming a fixed absolute home path.
- **`module-1-terminal-map-project`:** Replace any instructions/checkers requiring folder creation with a pre-seeded folder tree and read-only navigation. Preserve this topic ID. Terminal history and current-directory evidence should grade navigation rather than file creation.
- **`creating-folders-and-files`:** Introduce `mkdir`, `mkdir -p`, and `touch` only now. Ensure workspaceExpectations is reset per independent practice.
- **`copy-move-rename`:** Explain relative/quoted paths; perform only targeted `rm` after inspecting paths. Do not use `rm -rf` as beginner practice.
- **`viewing-file-contents`:** Include writing to disposable fixtures: `echo 'alpha' > notes.txt`, then `echo 'beta' >> notes.txt`, `cat notes.txt` and `wc -l notes.txt`. Explain replacement vs append; avoid redirecting to system paths. Keep original topic ID.
- **`module-2-notes-organizer-project`:** Ensure instructions and checker match commands taught above; verify content where applicable, not merely existence.
- **`final-capstone-file-room-handoff`:** Retain the stable ID but consistently show title "Community Media Archive". Five steps use only taught commands; check the cumulative file structure/content, safe deletion and final verification. Do not rename IDs as this would break learner progress references.

## Required acceptance checks before republishing

1. Compare every **currently published sketch, lesson, Try It and hidden fixture** against the source (published sketches were not included in the archive, so they cannot be silently rewritten here).
2. Independently run the Module 1 pre-seeded navigation lab; it must not need `mkdir`/`touch`.
3. Run the Module 2 `>` vs `>>` demo and confirm the append does not erase the first line; check the capstone relies on it only after introduction.
4. Verify every code-input recipe remains `shell_task` + `terminal_workspace`, with appropriate workspace/terminal expectations. Do not treat workspaceExpectations as a recipe type.
5. Compare before/after course IDs and student progress references; publish as a reviewed content revision through the existing lifecycle.
6. Confirm names and helper text across metadata, sketch headers and assessments are consistent.

No database seed, live sketch edits, course version changes or student progress mutations are performed by the installer.
