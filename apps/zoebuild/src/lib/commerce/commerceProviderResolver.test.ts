import type {
  PrismaClient,
} from "@zoeskoul/db";

import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  CommerceProviderResolutionError,
  ZOEBUILD_NATIVE_COMMERCE_ADAPTER,
  createCommerceProviderRegistry,
  requireCommerceProviderAdapter,
  resolveCommerceProvider,
  type CommerceProviderRegistration,
} from "./commerceProviderResolver";

import {
  COMMERCE_PROVIDER_CAPABILITIES,
  type CommerceProviderAdapter,
  type CommerceProviderCapability,
} from "./nativeCommerceProvider";

function capabilities(
  enabled:
    readonly CommerceProviderCapability[],
) {
  const set =
    new Set(
      enabled,
    );

  return Object.fromEntries(
    COMMERCE_PROVIDER_CAPABILITIES.map(
      (capability) => [
        capability,
        set.has(
          capability,
        ),
      ],
    ),
  ) as CommerceProviderAdapter["capabilities"];
}

function externalRegistration(
  overrides:
    Partial<
      CommerceProviderRegistration
    > = {},
): CommerceProviderRegistration {
  return {
    adapter: {
      provider:
        "external-commerce",
      capabilities:
        capabilities([
          "catalog",
          "cart",
          "checkout",
          "payments",
        ]),
      supportsEnvironment:
        () => true,
    },
    connectionRequired:
      true,
    ...overrides,
  };
}

function fakeClient(input: {
  store?:
    | {
        id: string;
        status: string;
      }
    | null;
  route?:
    | {
        provider: string;
        connectionId:
          string | null;
        connection:
          | {
              id: string;
              storeId: string;
              provider: string;
              environment:
                "test" | "live";
              status:
                "disconnected" |
                "active" |
                "error";
              externalAccountRef:
                string | null;
              credentialsSecretRef:
                string | null;
              webhookSecretRef:
                string | null;
              config:
                unknown;
            }
          | null;
      }
    | null;
}) {
  const commerceStore = {
    findUnique:
      vi.fn(
        async () =>
          input.store ??
          null,
      ),
  };

  const commerceProviderRoute = {
    findUnique:
      vi.fn(
        async () =>
          input.route ??
          null,
      ),
  };

  return {
    client: {
      commerceStore,
      commerceProviderRoute,
    } as unknown as PrismaClient,
    commerceStore,
    commerceProviderRoute,
  };
}

function nativeRoute() {
  return {
    provider:
      "zoebuild-native",
    connectionId:
      null,
    connection:
      null,
  } as const;
}

async function errorCode(
  promise:
    Promise<unknown>,
) {
  try {
    await promise;
  } catch (error) {
    expect(
      error,
    ).toBeInstanceOf(
      CommerceProviderResolutionError,
    );

    return (
      error as
        CommerceProviderResolutionError
    ).code;
  }

  throw new Error(
    "Expected resolver to fail.",
  );
}

describe(
  "ZoeBuild commerce provider resolver",
  () => {
    it(
      "maps preview to test and resolves native catalog without a connection",
      async () => {
        const fake =
          fakeClient({
            store: {
              id: "store_1",
              status:
                "draft",
            },
            route:
              nativeRoute(),
          });

        const resolved =
          await resolveCommerceProvider(
            fake.client,
            {
              buildProjectId:
                "build_1",
              surface:
                "preview",
              capability:
                "catalog",
            },
          );

        expect(
          resolved.environment,
        ).toBe(
          "test",
        );

        expect(
          resolved.provider,
        ).toBe(
          "zoebuild-native",
        );

        expect(
          resolved.connection,
        ).toBeNull();

        expect(
          resolved.adapter,
        ).toBe(
          ZOEBUILD_NATIVE_COMMERCE_ADAPTER,
        );

        expect(
          fake.commerceProviderRoute
            .findUnique,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              storeId_environment_capability: {
                storeId:
                  "store_1",
                environment:
                  "test",
                capability:
                  "catalog",
              },
            },
          }),
        );
      },
    );

    it(
      "maps published to live",
      async () => {
        const fake =
          fakeClient({
            store: {
              id: "store_1",
              status:
                "active",
            },
            route:
              nativeRoute(),
          });

        const resolved =
          await resolveCommerceProvider(
            fake.client,
            {
              buildProjectId:
                "build_1",
              surface:
                "published",
              capability:
                "cart",
            },
          );

        expect(
          resolved.environment,
        ).toBe(
          "live",
        );
      },
    );

    it(
      "fails closed when the surface cannot use the store",
      async () => {
        const fake =
          fakeClient({
            store: {
              id: "store_1",
              status:
                "draft",
            },
            route:
              nativeRoute(),
          });

        expect(
          await errorCode(
            resolveCommerceProvider(
              fake.client,
              {
                buildProjectId:
                  "build_1",
                surface:
                  "published",
                capability:
                  "catalog",
              },
            ),
          ),
        ).toBe(
          "COMMERCE_STORE_NOT_FOUND",
        );
      },
    );

    it(
      "fails closed when no capability route exists",
      async () => {
        const fake =
          fakeClient({
            store: {
              id: "store_1",
              status:
                "active",
            },
            route:
              null,
          });

        expect(
          await errorCode(
            resolveCommerceProvider(
              fake.client,
              {
                buildProjectId:
                  "build_1",
                surface:
                  "published",
                capability:
                  "payments",
              },
            ),
          ),
        ).toBe(
          "COMMERCE_PROVIDER_ROUTE_NOT_FOUND",
        );
      },
    );

    it(
      "fails closed for an unregistered provider",
      async () => {
        const fake =
          fakeClient({
            store: {
              id: "store_1",
              status:
                "active",
            },
            route: {
              provider:
                "unknown-provider",
              connectionId:
                null,
              connection:
                null,
            },
          });

        expect(
          await errorCode(
            resolveCommerceProvider(
              fake.client,
              {
                buildProjectId:
                  "build_1",
                surface:
                  "published",
                capability:
                  "catalog",
              },
            ),
          ),
        ).toBe(
          "COMMERCE_PROVIDER_NOT_REGISTERED",
        );
      },
    );

    it(
      "fails closed when the registered adapter does not own the route capability",
      async () => {
        const registration =
          externalRegistration({
            adapter: {
              provider:
                "external-commerce",
              capabilities:
                capabilities([
                  "payments",
                ]),
              supportsEnvironment:
                () => true,
            },
          });

        const registry =
          createCommerceProviderRegistry([
            registration,
          ]);

        const fake =
          fakeClient({
            store: {
              id: "store_1",
              status:
                "active",
            },
            route: {
              provider:
                "external-commerce",
              connectionId:
                null,
              connection:
                null,
            },
          });

        expect(
          await errorCode(
            resolveCommerceProvider(
              fake.client,
              {
                buildProjectId:
                  "build_1",
                surface:
                  "published",
                capability:
                  "catalog",
              },
              registry,
            ),
          ),
        ).toBe(
          "COMMERCE_PROVIDER_CAPABILITY_UNSUPPORTED",
        );
      },
    );

    it(
      "requires a connection only when the provider registration requires one",
      async () => {
        const registry =
          createCommerceProviderRegistry([
            externalRegistration(),
          ]);

        const fake =
          fakeClient({
            store: {
              id: "store_1",
              status:
                "active",
            },
            route: {
              provider:
                "external-commerce",
              connectionId:
                null,
              connection:
                null,
            },
          });

        expect(
          await errorCode(
            resolveCommerceProvider(
              fake.client,
              {
                buildProjectId:
                  "build_1",
                surface:
                  "published",
                capability:
                  "catalog",
              },
              registry,
            ),
          ),
        ).toBe(
          "COMMERCE_PROVIDER_CONNECTION_REQUIRED",
        );
      },
    );

    it(
      "rejects mismatched or inactive connections",
      async () => {
        const registry =
          createCommerceProviderRegistry([
            externalRegistration(),
          ]);

        const fake =
          fakeClient({
            store: {
              id: "store_1",
              status:
                "active",
            },
            route: {
              provider:
                "external-commerce",
              connectionId:
                "connection_1",
              connection: {
                id:
                  "connection_1",
                storeId:
                  "store_1",
                provider:
                  "external-commerce",
                environment:
                  "live",
                status:
                  "error",
                externalAccountRef:
                  "acct_1",
                credentialsSecretRef:
                  "secret://commerce/live",
                webhookSecretRef:
                  "secret://commerce/webhook",
                config:
                  null,
              },
            },
          });

        expect(
          await errorCode(
            resolveCommerceProvider(
              fake.client,
              {
                buildProjectId:
                  "build_1",
                surface:
                  "published",
                capability:
                  "catalog",
              },
              registry,
            ),
          ),
        ).toBe(
          "COMMERCE_PROVIDER_CONNECTION_INVALID",
        );
      },
    );

    it(
      "returns only server-side connection references for a valid external route",
      async () => {
        const registry =
          createCommerceProviderRegistry([
            externalRegistration(),
          ]);

        const fake =
          fakeClient({
            store: {
              id: "store_1",
              status:
                "active",
            },
            route: {
              provider:
                "external-commerce",
              connectionId:
                "connection_1",
              connection: {
                id:
                  "connection_1",
                storeId:
                  "store_1",
                provider:
                  "external-commerce",
                environment:
                  "live",
                status:
                  "active",
                externalAccountRef:
                  "acct_1",
                credentialsSecretRef:
                  "secret://commerce/live",
                webhookSecretRef:
                  "secret://commerce/webhook",
                config: {
                  location:
                    "primary",
                },
              },
            },
          });

        const resolved =
          await resolveCommerceProvider(
            fake.client,
            {
              buildProjectId:
                "build_1",
              surface:
                "published",
              capability:
                "catalog",
            },
            registry,
          );

        expect(
          resolved.connection,
        ).toEqual({
          id:
            "connection_1",
          externalAccountRef:
            "acct_1",
          credentialsSecretRef:
            "secret://commerce/live",
          webhookSecretRef:
            "secret://commerce/webhook",
          config: {
            location:
              "primary",
          },
        });
      },
    );

    it(
      "prevents a resolved external provider from entering the native execution path",
      async () => {
        const registry =
          createCommerceProviderRegistry([
            externalRegistration(),
          ]);

        const fake =
          fakeClient({
            store: {
              id: "store_1",
              status:
                "active",
            },
            route: {
              provider:
                "external-commerce",
              connectionId:
                "connection_1",
              connection: {
                id:
                  "connection_1",
                storeId:
                  "store_1",
                provider:
                  "external-commerce",
                environment:
                  "live",
                status:
                  "active",
                externalAccountRef:
                  "acct_1",
                credentialsSecretRef:
                  "secret://commerce/live",
                webhookSecretRef:
                  null,
                config:
                  null,
              },
            },
          });

        const resolved =
          await resolveCommerceProvider(
            fake.client,
            {
              buildProjectId:
                "build_1",
              surface:
                "published",
              capability:
                "catalog",
            },
            registry,
          );

        expect(
          () =>
            requireCommerceProviderAdapter(
              resolved,
              ZOEBUILD_NATIVE_COMMERCE_ADAPTER,
            ),
        ).toThrow(
          CommerceProviderResolutionError,
        );

        try {
          requireCommerceProviderAdapter(
            resolved,
            ZOEBUILD_NATIVE_COMMERCE_ADAPTER,
          );
        } catch (error) {
          expect(
            (
              error as
                CommerceProviderResolutionError
            ).code,
          ).toBe(
            "COMMERCE_PROVIDER_EXECUTION_UNAVAILABLE",
          );
        }
      },
    );

    it(
      "rejects duplicate provider registrations",
      () => {
        expect(
          () =>
            createCommerceProviderRegistry([
              externalRegistration(),
              externalRegistration(),
            ]),
        ).toThrow(
          "Duplicate commerce provider registration",
        );
      },
    );
  },
);
