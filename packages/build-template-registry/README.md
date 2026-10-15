# @zoeskoul/build-template-registry

Canonical provider-neutral ZoeBuild source templates.

Templates are deterministic starter workspaces, not AI output. The initial
registry contains static-html-v1 and react-vite-v1 only. React/Vite pins the
supported package baseline and declares that its pnpm lockfile must be created
once by a future trusted bootstrap job before the stack's frozen install step
is allowed to run.

No cloud, database, payment, AI, or deployment-provider SDK belongs here.
