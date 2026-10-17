import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  PrismaClient,
} from "@zoeskoul/db";

import type {
  BuildSecretStore,
} from "@zoeskoul/platform-server/security/buildSecretStore";

import {
  activateCommerceProviderCredentialConnection,
  disconnectCommerceProviderEnvironment,
} from "./commerceProviderConnectionLifecycle";

function fakeSecretStore(
  input:
    Readonly<{
      newRef?:
        string;
    }> =
      {},
) {
  const put =
    vi.fn(
      async () => ({
        secretRef:
          input.newRef ??
          "zoebuild-secret:v1:22222222-2222-4222-8222-222222222222",
      }),
    );

  const deleteSecret =
    vi.fn(
      async () =>
        undefined,
    );

  return {
    store: {
      put,
      read:
        vi.fn(),
      delete:
        deleteSecret,
    } as unknown as
      BuildSecretStore,
    put,
    deleteSecret,
  };
}

function fakePrisma(
  input:
    Readonly<{
      existing?:
        Readonly<{
          id:
            string;
          credentialsSecretRef:
            string |
            null;
          webhookSecretRef?:
            string |
            null;
        }> |
        null;
      failUpsert?:
        boolean;
      failUpdate?:
        boolean;
    }> =
      {},
) {
  const findUnique =
    vi.fn(
      async () =>
        input.existing ??
        null,
    );

  const upsert =
    vi.fn(
      async (
        args:
          any,
      ) => {
        if (
          input.failUpsert
        ) {
          throw new Error(
            "upsert failed",
          );
        }

        return {
          id:
            "connection_1",
          ...args.update,
        };
      },
    );

  const update =
    vi.fn(
      async (
        args:
          any,
      ) => {
        if (
          input.failUpdate
        ) {
          throw new Error(
            "update failed",
          );
        }

        return {
          id:
            args.where.id,
        };
      },
    );

  return {
    client: {
      commerceProviderConnection: {
        findUnique,
        upsert,
        update,
      },
    } as unknown as
      PrismaClient,
    findUnique,
    upsert,
    update,
  };
}

describe(
  "generic commerce provider connection lifecycle",
  () => {
    it(
      "activates validated credentials and rotates the previous secret after persistence succeeds",
      async () => {
        const previousRef =
          "zoebuild-secret:v1:11111111-1111-4111-8111-111111111111";

        const prisma =
          fakePrisma({
            existing: {
              id:
                "connection_1",
              credentialsSecretRef:
                previousRef,
            },
          });

        const secrets =
          fakeSecretStore();

        const result =
          await activateCommerceProviderCredentialConnection(
            prisma.client,
            {
              buildProjectId:
                "project_1",
              storeId:
                "store_1",
              provider:
                "example-provider",
              environment:
                "test",
              credentials: {
                secretKey:
                  "validated-provider-secret",
              },
              secretStore:
                secrets.store,
            },
          );

        expect(
          result,
        ).toEqual({
          provider:
            "example-provider",
          environment:
            "test",
          status:
            "active",
        });

        expect(
          secrets.put,
        ).toHaveBeenCalledWith({
          buildProjectId:
            "project_1",
          value: {
            secretKey:
              "validated-provider-secret",
          },
        });

        expect(
          prisma.upsert,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            create:
              expect.objectContaining({
                provider:
                  "example-provider",
                environment:
                  "test",
                status:
                  "active",
              }),
            update:
              expect.objectContaining({
                status:
                  "active",
              }),
          }),
        );

        expect(
          secrets.deleteSecret,
        ).toHaveBeenCalledWith({
          buildProjectId:
            "project_1",
          secretRef:
            previousRef,
        });
      },
    );

    it(
      "removes the new vault record when persistence fails",
      async () => {
        const prisma =
          fakePrisma({
            failUpsert:
              true,
          });

        const newRef =
          "zoebuild-secret:v1:33333333-3333-4333-8333-333333333333";

        const secrets =
          fakeSecretStore({
            newRef,
          });

        await expect(
          activateCommerceProviderCredentialConnection(
            prisma.client,
            {
              buildProjectId:
                "project_1",
              storeId:
                "store_1",
              provider:
                "example-provider",
              environment:
                "live",
              credentials: {
                secretKey:
                  "validated-provider-secret",
              },
              secretStore:
                secrets.store,
            },
          ),
        ).rejects.toMatchObject({
          code:
            "COMMERCE_PROVIDER_CONNECTION_SAVE_FAILED",
        });

        expect(
          secrets.deleteSecret,
        ).toHaveBeenCalledWith({
          buildProjectId:
            "project_1",
          secretRef:
            newRef,
        });
      },
    );

    it(
      "disconnects one explicit environment and deletes credential and webhook secrets only after persistence succeeds",
      async () => {
        const credentialRef =
          "zoebuild-secret:v1:44444444-4444-4444-8444-444444444444";

        const webhookRef =
          "zoebuild-secret:v1:55555555-5555-4555-8555-555555555555";

        const prisma =
          fakePrisma({
            existing: {
              id:
                "connection_1",
              credentialsSecretRef:
                credentialRef,
              webhookSecretRef:
                webhookRef,
            },
          });

        const secrets =
          fakeSecretStore();

        const result =
          await disconnectCommerceProviderEnvironment(
            prisma.client,
            {
              buildProjectId:
                "project_1",
              storeId:
                "store_1",
              provider:
                "example-provider",
              environment:
                "test",
              secretStore:
                secrets.store,
            },
          );

        expect(
          result,
        ).toEqual({
          provider:
            "example-provider",
          environment:
            "test",
          status:
            "disconnected",
        });

        expect(
          prisma.update,
        ).toHaveBeenCalledWith({
          where: {
            id:
              "connection_1",
          },
          data: {
            status:
              "disconnected",
            externalAccountRef:
              null,
            credentialsSecretRef:
              null,
            webhookSecretRef:
              null,
          },
          select: {
            id:
              true,
          },
        });

        expect(
          secrets.deleteSecret,
        ).toHaveBeenCalledTimes(
          2,
        );
        expect(
          secrets.deleteSecret,
        ).toHaveBeenCalledWith({
          buildProjectId:
            "project_1",
          secretRef:
            credentialRef,
        });
        expect(
          secrets.deleteSecret,
        ).toHaveBeenCalledWith({
          buildProjectId:
            "project_1",
          secretRef:
            webhookRef,
        });
      },
    );

    it(
      "fails closed on disconnect persistence errors without deleting vault records",
      async () => {
        const prisma =
          fakePrisma({
            existing: {
              id:
                "connection_1",
              credentialsSecretRef:
                "zoebuild-secret:v1:66666666-6666-4666-8666-666666666666",
              webhookSecretRef:
                null,
            },
            failUpdate:
              true,
          });

        const secrets =
          fakeSecretStore();

        await expect(
          disconnectCommerceProviderEnvironment(
            prisma.client,
            {
              buildProjectId:
                "project_1",
              storeId:
                "store_1",
              provider:
                "example-provider",
              environment:
                "live",
              secretStore:
                secrets.store,
            },
          ),
        ).rejects.toMatchObject({
          code:
            "COMMERCE_PROVIDER_CONNECTION_DISCONNECT_FAILED",
        });

        expect(
          secrets.deleteSecret,
        ).not.toHaveBeenCalled();
      },
    );
  },
);
