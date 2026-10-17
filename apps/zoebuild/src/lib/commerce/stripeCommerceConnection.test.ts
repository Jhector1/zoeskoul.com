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
  connectStripeCommerceEnvironment,
} from "./stripeCommerceConnection";

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
      previousRef?:
        string |
        null;
      failUpsert?:
        boolean;
    }> =
      {},
) {
  const findUnique =
    vi.fn(
      async () =>
        input.previousRef ===
          undefined
          ? null
          : {
              id:
                "connection_1",
              credentialsSecretRef:
                input.previousRef,
            },
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
            "db failed",
          );
        }

        return {
          id:
            "connection_1",
          ...args.update,
        };
      },
    );

  return {
    client: {
      commerceProviderConnection: {
        findUnique,
        upsert,
      },
    } as unknown as
      PrismaClient,
    findUnique,
    upsert,
  };
}

function probeFactory() {
  const list =
    vi.fn(
      async () => ({
        data:
          [],
      }),
    );

  return {
    list,
    createProbeClient:
      () => ({
        checkout: {
          sessions: {
            list,
          },
        },
      }),
  };
}

describe(
  "Stripe commerce connection provisioning",
  () => {
    it(
      "validates Stripe before encrypting and activating a test connection",
      async () => {
        const prisma =
          fakePrisma();

        const secrets =
          fakeSecretStore();

        const probe =
          probeFactory();

        const result =
          await connectStripeCommerceEnvironment(
            prisma.client,
            {
              buildProjectId:
                "project_1",
              storeId:
                "store_1",
              environment:
                "test",
              apiKey:
                "sk_test_example_1234567890",
              secretStore:
                secrets.store,
            },
            {
              createProbeClient:
                probe.createProbeClient,
            },
          );

        expect(
          result,
        ).toEqual({
          provider:
            "stripe",
          environment:
            "test",
          status:
            "active",
        });

        expect(
          probe.list,
        ).toHaveBeenCalledWith({
          limit:
            1,
        });

        expect(
          secrets.put,
        ).toHaveBeenCalledWith({
          buildProjectId:
            "project_1",
          value: {
            secretKey:
              "sk_test_example_1234567890",
          },
        });

        expect(
          prisma.upsert,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            create:
              expect.objectContaining({
                provider:
                  "stripe",
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
      },
    );

    it(
      "rejects a live key on the test environment before network or storage",
      async () => {
        const prisma =
          fakePrisma();

        const secrets =
          fakeSecretStore();

        const probe =
          probeFactory();

        await expect(
          connectStripeCommerceEnvironment(
            prisma.client,
            {
              buildProjectId:
                "project_1",
              storeId:
                "store_1",
              environment:
                "test",
              apiKey:
                "sk_live_wrong_environment_123",
              secretStore:
                secrets.store,
            },
            {
              createProbeClient:
                probe.createProbeClient,
            },
          ),
        ).rejects.toMatchObject({
          code:
            "STRIPE_CREDENTIAL_ENVIRONMENT_MISMATCH",
        });

        expect(
          probe.list,
        ).not.toHaveBeenCalled();

        expect(
          secrets.put,
        ).not.toHaveBeenCalled();

        expect(
          prisma.upsert,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "does not persist credentials when Stripe validation fails",
      async () => {
        const prisma =
          fakePrisma();

        const secrets =
          fakeSecretStore();

        await expect(
          connectStripeCommerceEnvironment(
            prisma.client,
            {
              buildProjectId:
                "project_1",
              storeId:
                "store_1",
              environment:
                "test",
              apiKey:
                "sk_test_invalid_but_shaped_123",
              secretStore:
                secrets.store,
            },
            {
              createProbeClient:
                () => ({
                  checkout: {
                    sessions: {
                      async list() {
                        throw new Error(
                          "stripe rejected key",
                        );
                      },
                    },
                  },
                }),
            },
          ),
        ).rejects.toMatchObject({
          code:
            "STRIPE_CONNECTION_VALIDATION_FAILED",
        });

        expect(
          secrets.put,
        ).not.toHaveBeenCalled();

        expect(
          prisma.upsert,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "rotates a connection and deletes the previous vault record after success",
      async () => {
        const previousRef =
          "zoebuild-secret:v1:11111111-1111-4111-8111-111111111111";

        const prisma =
          fakePrisma({
            previousRef,
          });

        const secrets =
          fakeSecretStore();

        const probe =
          probeFactory();

        await connectStripeCommerceEnvironment(
          prisma.client,
          {
            buildProjectId:
              "project_1",
            storeId:
              "store_1",
            environment:
              "live",
            apiKey:
              "sk_live_example_1234567890",
            secretStore:
              secrets.store,
          },
          {
            createProbeClient:
              probe.createProbeClient,
          },
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
      "removes the new vault record if the connection write fails",
      async () => {
        const prisma =
          fakePrisma({
            failUpsert:
              true,
          });

        const secrets =
          fakeSecretStore({
            newRef:
              "zoebuild-secret:v1:33333333-3333-4333-8333-333333333333",
          });

        const probe =
          probeFactory();

        await expect(
          connectStripeCommerceEnvironment(
            prisma.client,
            {
              buildProjectId:
                "project_1",
              storeId:
                "store_1",
              environment:
                "test",
              apiKey:
                "sk_test_example_1234567890",
              secretStore:
                secrets.store,
            },
            {
              createProbeClient:
                probe.createProbeClient,
            },
          ),
        ).rejects.toMatchObject({
          code:
            "STRIPE_CONNECTION_SAVE_FAILED",
        });

        expect(
          secrets.deleteSecret,
        ).toHaveBeenCalledWith({
          buildProjectId:
            "project_1",
          secretRef:
            "zoebuild-secret:v1:33333333-3333-4333-8333-333333333333",
        });
      },
    );
  },
);
