export const ZOEBUILD_STARTER_KINDS = [
  "website",
  "web-app",
  "storefront",
] as const;

export type ZoeBuildStarterKind =
  (typeof ZOEBUILD_STARTER_KINDS)[number];

/**
 * Deterministic, client-safe ZoeBuild starter specifications.
 *
 * These baselines are validated against the canonical
 * ProjectSpecification parser and registry-backed materializer.
 *
 * User-facing archetypes such as business, landing page,
 * portfolio, and content remain above this technical stack layer.
 */
const STARTER_SPECIFICATIONS = {
  "website": {
    "version": 1,
    "name": "V302B Website",
    "projectType": "static-site",
    "targets": [
      "web"
    ],
    "requirements": {
      "backend": false,
      "database": false,
      "auth": false,
      "storage": false,
      "payments": false,
      "email": false,
      "commerce": false
    },
    "pages": [
      "Home"
    ],
    "stackId": "static-html-v1",
    "deployment": {
      "preference": "static"
    }
  },
  "web-app": {
    "version": 1,
    "name": "V302B Web App",
    "projectType": "frontend-app",
    "targets": [
      "web"
    ],
    "requirements": {
      "backend": false,
      "database": false,
      "auth": false,
      "storage": false,
      "payments": false,
      "email": false,
      "commerce": false
    },
    "pages": [
      "Home"
    ],
    "stackId": "react-vite-v1",
    "deployment": {
      "preference": "static"
    }
  },
  "storefront": {
    "version": 1,
    "name": "V302B Storefront",
    "projectType": "frontend-app",
    "targets": [
      "web"
    ],
    "requirements": {
      "backend": false,
      "database": false,
      "auth": false,
      "storage": false,
      "payments": true,
      "email": false,
      "commerce": true
    },
    "pages": [
      "Home"
    ],
    "stackId": "commerce-static-v1",
    "commerce": {
      "provider": "zoebuild-native",
      "storefrontRuntime": "static"
    },
    "deployment": {
      "preference": "static"
    }
  }
} as const;

export function createStarterProjectSpecification(
  kind: ZoeBuildStarterKind,
  name: string,
): Record<string, unknown> {
  const normalizedName =
    name.trim();

  if (!normalizedName) {
    throw new Error(
      "Project name is required.",
    );
  }

  const specification =
    JSON.parse(
      JSON.stringify(
        STARTER_SPECIFICATIONS[kind],
      ),
    ) as Record<string, unknown>;

  specification.name =
    normalizedName;

  return specification;
}
