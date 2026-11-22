# Course 1 alignment cleanup — draft authoring only

Course `linux-terminal-fundamentals` remains published under its current stable module, section and topic identifiers. This cleanup modifies **authoring documents only**; it does not modify published lesson records, curriculum database rows, learner progress, live exercises, or existing grading fixtures.

## Corrected dependency order

- Module 1: `pwd`, `ls`, `ls -a`, `cd`, `.`, `..`, `~`, quoted paths. Terminal Map now explores a **pre-seeded folder tree**, rather than introducing `mkdir`/`touch` before instruction.
- Module 2: `mkdir`, `mkdir -p`, `touch`, `cp`, `mv`, targeted `rm`; `echo` with `>` (overwrite) and `>>` (append), then `cat`, `head`, `tail`, `wc -l`. The original topic ID `viewing-file-contents` is preserved with an expanded learner-facing title.
- Module 3: Community Media Archive, with five cumulative steps. All operations have been taught earlier. The legacy ID `final-capstone-file-room-handoff` remains intentionally stable; visible summaries now say Community Media Archive.

## Required publication follow-through

1. Review the actually published lesson/quiz/sketch content in the authoring UI (not included in the archive).
2. Regenerate or edit Module 1 project checks: they must use **existing folders**, not assume earlier `mkdir` or `touch` teaching.
3. Ensure a short, tested writing/redirection lesson precedes the capstone; quiz the difference between > and >>.
4. Update Module 2 project prompts and capstone hints with the new command prerequisites.
5. Check all hidden workspace fixtures and grading checks, especially when an authored task was previously based on creating folders in Module 1.
6. Publish through the existing draft/review lifecycle; do not rename stable IDs or recreate published records.

**No automated changes to live courses are made by this source patch.**
