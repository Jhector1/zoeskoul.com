# ADR — One generated-app stack: TanStack Start

**Status:** target architecture; NOT yet activated. **Environment:** development only.

## Decision
ZoeBuild's own control plane stays on Next.js. Generated web applications will use
one canonical `tanstack-start-v1` stack with React, TypeScript, Vite and
TanStack Router. SSR/server functions run ONLY in tenant-isolated runtimes.
Cloudflare Workers is the first production target; additional providers can be
separate adapters if needed, but not additional generated source stacks.

## Reasons
- Public pages can deliver server HTML and route-level metadata.
- Frontend and backend can share types in one generated project.
- React/Vite skills and UI components remain applicable.
- Cloudflare's Vite plugin supports a Worker deployment target.

## Non-goals
- Migrating ZoeBuild itself to TanStack Start.
- Treating Workers as a database or limitless runtime.
- Shipping a Next.js or Spring Boot execution stack.
- Making unsupported backend promises before a working Runner and publisher exist.
- Preserving a static HTML/SPA compatibility shim after the final development cutover.

## Invariants
- Authorization and resource limits enforced outside model text.
- Project-scoped secrets never enter the browser or a peer app.
- Generated SSR code never executes inside the ZoeBuild platform process.
- A successful build is not a successful deployment; both have separate receipts.
- Owner-approved applied source version must equal verified deployment source.
- No new project is created with this stack until all readiness gates pass.
