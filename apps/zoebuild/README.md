# ZoeBuild application

`apps/zoebuild` is the standalone ZoeBuild product application for
`build.zoeskoul.com`.

ZoeBuild is a general-purpose website/application builder. It is available to
business owners, organizations, freelancers, students, teachers, and other
Zoéskoul account holders. It must not depend on student learning entitlements
or learning workflows.

## Ownership

ZoeBuild owns:

- its marketing experience;
- onboarding and project dashboard;
- builder UI and product-specific APIs;
- preview, publish, deployment, domain, and resource-management UX;
- ZoeBuild-specific server orchestration.

Shared concerns belong in packages:

- authentication/account identity;
- theme/design-system primitives;
- locale/i18n;
- canonical CodeProject persistence;
- reusable FullIDE/workspace components;
- Build domain/application/contracts.

Execution remains owned by `apps/runner`.

`apps/web` remains the neutral `zoeskoul.com` entry and marketing application.
