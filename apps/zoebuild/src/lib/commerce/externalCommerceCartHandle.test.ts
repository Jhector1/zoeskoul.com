import type {
  BuildSecretStore,
} from "@zoeskoul/platform-server/security/buildSecretStore";

import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  createExternalCommerceCartHandle,
  ExternalCommerceCartHandleError,
  resolveExternalCommerceCartHandle,
} from "./externalCommerceCartHandle";

function fakeSecretStore() {
  const values =
    new Map<
      string,
      unknown
    >();

  let next =
    0;

  const store:
    BuildSecretStore = {
      async put(
        input,
      ) {
        const secretRef =
          `secret_${++next}`;

        values.set(
          secretRef,
          input.value,
        );

        return {
          secretRef,
        };
      },

      async read(
        input,
      ) {
        return values.get(
          input.secretRef,
        ) as never;
      },

      async delete(
        input,
      ) {
        values.delete(
          input.secretRef,
        );
      },
    };

  return {
    store,
    values,
  };
}

function fakeClient() {
  const created:
    Array<
      Record<
        string,
        unknown
      >
    > = [];

  const commerceStore = {
    findUnique:
      vi.fn(
        async () => ({
          id:
            "store_1",
        }),
      ),
  };

  const commerceCart = {
    create:
      vi.fn(
        async (
          input:
            any,
        ) => {
          created.push(
            input.data,
          );

          return {
            id:
              "cart_internal_1",
          };
        },
      ),

    findFirst:
      vi.fn(),
  };

  return {
    client: {
      commerceStore,
      commerceCart,
    } as any,
    commerceStore,
    commerceCart,
    created,
  };
}

describe(
  "external commerce cart handles",
  () => {
    it(
      "stores the remote cart id only in encrypted secret storage and exposes an opaque browser token",
      async () => {
        const fake =
          fakeClient();
        const secrets =
          fakeSecretStore();

        const result =
          await createExternalCommerceCartHandle(
            fake.client,
            {
              buildProjectId:
                "project_1",
              provider:
                "example-provider",
              environment:
                "test",
              remoteCartId:
                "remote-cart-with-secret",
              currency:
                "usd",
              secretStore:
                secrets.store,
            },
          );

        expect(
          result.cartToken,
        ).toHaveLength(
          43,
        );

        expect(
          result,
        ).not.toHaveProperty(
          "remoteCartId",
        );

        expect(
          JSON.stringify(
            fake.created,
          ),
        ).not.toContain(
          "remote-cart-with-secret",
        );

        expect(
          fake.created[0],
        ).toMatchObject({
          provider:
            "example-provider",
          providerEnvironment:
            "test",
          providerCartSecretRef:
            "secret_1",
          currency:
            "USD",
        });

        expect(
          secrets.values.get(
            "secret_1",
          ),
        ).toEqual({
          version:
            1,
          provider:
            "example-provider",
          environment:
            "test",
          remoteCartId:
            "remote-cart-with-secret",
        });
      },
    );

    it(
      "resolves a remote cart only for the exact provider and environment",
      async () => {
        const fake =
          fakeClient();
        const secrets =
          fakeSecretStore();

        const created =
          await createExternalCommerceCartHandle(
            fake.client,
            {
              buildProjectId:
                "project_1",
              provider:
                "example-provider",
              environment:
                "test",
              remoteCartId:
                "remote-test-cart",
              currency:
                "USD",
              secretStore:
                secrets.store,
            },
          );

        fake
          .commerceCart
          .findFirst
          .mockResolvedValue({
            id:
              "cart_internal_1",
            currency:
              "USD",
            providerCartSecretRef:
              "secret_1",
          });

        const resolved =
          await resolveExternalCommerceCartHandle(
            fake.client,
            {
              buildProjectId:
                "project_1",
              provider:
                "example-provider",
              environment:
                "test",
              cartToken:
                created.cartToken,
              secretStore:
                secrets.store,
            },
          );

        expect(
          resolved.remoteCartId,
        ).toBe(
          "remote-test-cart",
        );

        expect(
          fake
            .commerceCart
            .findFirst,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            where:
              expect.objectContaining({
                provider:
                  "example-provider",
                providerEnvironment:
                  "test",
              }),
          }),
        );
      },
    );

    it(
      "fails closed when an environment-scoped cart cannot be found",
      async () => {
        const fake =
          fakeClient();
        const secrets =
          fakeSecretStore();

        fake
          .commerceCart
          .findFirst
          .mockResolvedValue(
            null,
          );

        const token =
          "A".repeat(
            43,
          );

        await expect(
          resolveExternalCommerceCartHandle(
            fake.client,
            {
              buildProjectId:
                "project_1",
              provider:
                "example-provider",
              environment:
                "live",
              cartToken:
                token,
              secretStore:
                secrets.store,
            },
          ),
        ).rejects.toMatchObject({
          code:
            "EXTERNAL_COMMERCE_CART_NOT_FOUND",
          status:
            404,
        });
      },
    );

    it(
      "rejects a stored reference whose provider scope does not match",
      async () => {
        const fake =
          fakeClient();
        const secrets =
          fakeSecretStore();

        await secrets
          .store
          .put({
            buildProjectId:
              "project_1",
            value: {
              version:
                1,
              provider:
                "wrong-provider",
              environment:
                "test",
              remoteCartId:
                "remote-cart",
            },
          });

        fake
          .commerceCart
          .findFirst
          .mockResolvedValue({
            id:
              "cart_internal_1",
            currency:
              "USD",
            providerCartSecretRef:
              "secret_1",
          });

        await expect(
          resolveExternalCommerceCartHandle(
            fake.client,
            {
              buildProjectId:
                "project_1",
              provider:
                "example-provider",
              environment:
                "test",
              cartToken:
                "B".repeat(
                  43,
                ),
              secretStore:
                secrets.store,
            },
          ),
        ).rejects.toBeInstanceOf(
          ExternalCommerceCartHandleError,
        );
      },
    );

    it(
      "deletes a newly stored secret if cart persistence fails",
      async () => {
        const fake =
          fakeClient();
        const secrets =
          fakeSecretStore();

        fake
          .commerceCart
          .create
          .mockRejectedValue(
            new Error(
              "database unavailable",
            ),
          );

        await expect(
          createExternalCommerceCartHandle(
            fake.client,
            {
              buildProjectId:
                "project_1",
              provider:
                "example-provider",
              environment:
                "test",
              remoteCartId:
                "remote-cart",
              currency:
                "USD",
              secretStore:
                secrets.store,
            },
          ),
        ).rejects.toMatchObject({
          code:
            "EXTERNAL_COMMERCE_CART_SAVE_FAILED",
        });

        expect(
          secrets.values.size,
        ).toBe(
          0,
        );
      },
    );
  },
);
