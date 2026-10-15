# @zoeskoul/build-application

Provider-neutral ZoeBuild application orchestration.

## Responsibilities

- Materialize a validated supported template before persistence.
- Require an authenticated owner id from the caller.
- Persist exactly one initial CodeProject source revision through a port.
- Keep BuildProject metadata attached to that CodeProject.

## Non-responsibilities

This package does not import Prisma, Next.js, Neon, Cloudflare, Docker,
Stripe/Square, OpenAI, or any provider SDK. Infrastructure adapters implement
`BuildProjectPersistence` outside this package.
