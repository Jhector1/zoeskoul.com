# Legacy ZoeSkoul client transplant

This directory is the copy-first migration staging area for the authenticated
ZoeSkoul browser client.

Rules:

1. Preserve JSX, styling, interactions, themes and responsive behavior.
2. Activate components route by route through Vite compatibility adapters.
3. Do not import server-only, Prisma, Next route-handler or Node code into the
   Vite runtime.
4. Do not delete an old component until its Vite replacement passes visual,
   behavioral, lint, test, type-check, build and browser parity checks.
5. Shared FullIDE, review, practice, tutoring and application-shell code will
   be extracted only after student parity is proven.

The staging tree is intentionally excluded from broad TypeScript and ESLint
scans until each subtree is activated. Imported files are still type-checked
through the active application graph.
