# CSS Foundations — Cumulative Learning Flow Guidance

## Course structure

Modules 1–5 are one continuous website build.

There are no learner-visible standalone module projects in Modules 1–5.
The coding exercises themselves are the cumulative project work.

Every coding exercise improves the same inherited six-file website:

- `index.html`
- `about.html`
- `projects/portfolio.html`
- `contact.html`
- `images/profile.png`
- `styles.css`

Module 6 is the only formal final capstone.

The `moduleProject` fields retained in `course.spec.json` are internal milestone
metadata required by the authoring schema. They must not create learner-visible
project sections or interrupt the cumulative flow.

## Coding-exercise writing standard

Do not give bare mechanical commands such as:

> Add `align-items: center;` to `nav` and add `nav a { flex: 0 0 auto; }`.

A learner should understand the visual problem before being told which syntax
to type.

Write each coding step in this order:

1. **Current state** — briefly describe what the learner sees now.
2. **Visual problem or opportunity** — explain what feels off or what could be
   improved.
3. **CSS reason** — connect the problem to the concept being learned.
4. **Action** — ask for the focused CSS change.
5. **Expected result** — tell the learner what to notice in the preview.

### Alignment example

Instead of:

> Add `align-items: center;` to `nav`.

Prefer:

> The navigation works, but the links sit a little lower than the logo, making
> the header feel uneven. Because `nav` already uses Flexbox, we can align its
> children on the cross axis instead of moving each link separately. Add
> `align-items: center;` to `nav`, then check the preview: the logo and links
> should now sit on the same visual line.

### Image-position example

Instead of:

> Add `margin-left: 1rem;` to the profile image.

Prefer:

> The profile image feels too close to the left edge, so that side of the page
> looks crowded. Give it a little breathing room with layout spacing rather than
> an arbitrary position offset. Add a small `margin-inline-start` and watch the
> image move slightly right while remaining part of the responsive flow.

### Grid-spacing example

Instead of:

> Add `gap: 1rem;`.

Prefer:

> The cards are laid out correctly, but they are packed together and read like
> one large block. Grid can create consistent breathing room without adding
> separate margins to every card. Add a `gap` to the grid container and compare
> the preview: each card should now feel visually distinct.

## Tone

Prefer:
- concrete observations about the current preview;
- realistic design/debugging decisions;
- explanation before syntax;
- short, purposeful context;
- continuity from the previous solved state;
- a concrete result the learner can see.

Avoid:
- command dumps;
- unexplained CSS properties;
- arbitrary offsets when layout or spacing is the better tool;
- fake stories unrelated to the visible page;
- excessive prose for tiny edits;
- revealing every line when the learner should still reason.

## Cumulative rule

Every code exercise must start from the previous solved website state.

The learner should always know:
- what part of the site they are improving;
- why the current version needs the change;
- what CSS concept addresses the problem;
- what should look or behave differently afterward.
