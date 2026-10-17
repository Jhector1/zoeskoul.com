import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  PrismaClient,
} from "@zoeskoul/db";

import {
  resolveCommerceProvider,
} from "./commerceProviderResolver";

function fakeClient(input?: {
  storeStatus?: "draft" | "active";
  route?: unknown;
}) {
  return {
    commerceStore: {
      findUnique:
        vi.fn(async () => ({
          id: "store_1",
          status:
            input?.storeStatus ??
            "draft",
        })),
    },
    commerceProviderRoute: {
      findUnique:
        vi.fn(async () =>
          input?.route ?? {
            provider:
              "zoestore",
            connectionId:
              "connection_test",
            connection: {
              id:
                "connection_test",
              storeId:
                "store_1",
              provider:
                "zoestore",
              environment:
                "test",
              status:
                "active",
              externalAccountRef:
                null,
              credentialsSecretRef:
                null,
              webhookSecretRef:
                null,
              config: {
                kind:
                  "internal",
              },
            },
          }),
    },
  } as unknown as PrismaClient;
}

describe(
  "ZoeBuild commerce provider persistence resolver",
  () => {
    it(
      "maps preview to an explicit active test connection",
      async () => {
        const resolved =
          await resolveCommerceProvider(
            fakeClient(),
            {
              buildProjectId:
                "project_1",
              surface:
                "preview",
              capability:
                "catalog",
            },
          );

        expect(resolved.environment).toBe("test");
        expect(resolved.provider).toBe("zoestore");
        expect(resolved.connection.id).toBe(
          "connection_test",
        );
      },
    );

    it(
      "maps published to an explicit active live connection",
      async () => {
        const resolved =
          await resolveCommerceProvider(
            fakeClient({
              storeStatus:
                "active",
              route: {
                provider:
                  "zoestore",
                connectionId:
                  "connection_live",
                connection: {
                  id:
                    "connection_live",
                  storeId:
                    "store_1",
                  provider:
                    "zoestore",
                  environment:
                    "live",
                  status:
                    "active",
                  externalAccountRef:
                    null,
                  credentialsSecretRef:
                    null,
                  webhookSecretRef:
                    null,
                  config: {
                    kind:
                      "internal",
                  },
                },
              },
            }),
            {
              buildProjectId:
                "project_1",
              surface:
                "published",
              capability:
                "orders",
            },
          );

        expect(resolved.environment).toBe("live");
        expect(resolved.connection.id).toBe(
          "connection_live",
        );
      },
    );

    it(
      "fails closed when the capability route has no explicit connection",
      async () => {
        await expect(
          resolveCommerceProvider(
            fakeClient({
              route: {
                provider:
                  "zoestore",
                connectionId:
                  "missing",
                connection:
                  null,
              },
            }),
            {
              buildProjectId:
                "project_1",
              surface:
                "preview",
              capability:
                "cart",
            },
          ),
        ).rejects.toMatchObject({
          code:
            "COMMERCE_PROVIDER_CONNECTION_INVALID",
        });
      },
    );

    it.each([
      {
        label:
          "provider mismatch",
        connection: {
          id:
            "connection_test",
          storeId:
            "store_1",
          provider:
            "stripe",
          environment:
            "test",
          status:
            "active",
          externalAccountRef:
            null,
          credentialsSecretRef:
            null,
          webhookSecretRef:
            null,
          config:
            null,
        },
      },
      {
        label:
          "environment mismatch",
        connection: {
          id:
            "connection_test",
          storeId:
            "store_1",
          provider:
            "zoestore",
          environment:
            "live",
          status:
            "active",
          externalAccountRef:
            null,
          credentialsSecretRef:
            null,
          webhookSecretRef:
            null,
          config:
            null,
        },
      },
      {
        label:
          "inactive connection",
        connection: {
          id:
            "connection_test",
          storeId:
            "store_1",
          provider:
            "zoestore",
          environment:
            "test",
          status:
            "disconnected",
          externalAccountRef:
            null,
          credentialsSecretRef:
            null,
          webhookSecretRef:
            null,
          config:
            null,
        },
      },
    ])(
      "rejects $label",
      async ({
        connection,
      }) => {
        await expect(
          resolveCommerceProvider(
            fakeClient({
              route: {
                provider:
                  "zoestore",
                connectionId:
                  "connection_test",
                connection,
              },
            }),
            {
              buildProjectId:
                "project_1",
              surface:
                "preview",
              capability:
                "catalog",
            },
          ),
        ).rejects.toMatchObject({
          code:
            "COMMERCE_PROVIDER_CONNECTION_INVALID",
        });
      },
    );

    it(
      "returns only server-side connection references for an external payment route",
      async () => {
        const resolved =
          await resolveCommerceProvider(
            fakeClient({
              route: {
                provider:
                  "stripe",
                connectionId:
                  "stripe_test",
                connection: {
                  id:
                    "stripe_test",
                  storeId:
                    "store_1",
                  provider:
                    "stripe",
                  environment:
                    "test",
                  status:
                    "active",
                  externalAccountRef:
                    "acct_ref",
                  credentialsSecretRef:
                    "secret/ref",
                  webhookSecretRef:
                    "webhook/ref",
                  config: {
                    accountLabel:
                      "test",
                  },
                },
              },
            }),
            {
              buildProjectId:
                "project_1",
              surface:
                "preview",
              capability:
                "payments",
            },
          );

        expect(
          resolved.connection,
        ).toEqual({
          id:
            "stripe_test",
          externalAccountRef:
            "acct_ref",
          credentialsSecretRef:
            "secret/ref",
          webhookSecretRef:
            "webhook/ref",
          config: {
            accountLabel:
              "test",
          },
        });
      },
    );
  },
);
