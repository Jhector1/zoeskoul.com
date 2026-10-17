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
  adoptCommercePaymentProviderRef,
  CommercePaymentProviderRefError,
} from "./commercePaymentProviderRef";

function fakeClient(
  initialRef:
    string |
    null,
) {
  let providerRef =
    initialRef;

  const commerceOrder = {
    updateMany:
      vi.fn(
        async (
          input:
            any,
        ) => {
          const requested =
            input
              .data
              .paymentProviderRef;

          if (
            providerRef !==
              null &&
            providerRef !==
              requested
          ) {
            return {
              count: 0,
            };
          }

          providerRef =
            requested;

          return {
            count: 1,
          };
        },
      ),

    findFirst:
      vi.fn(
        async () => ({
          paymentProvider:
            "stripe",
          paymentEnvironment:
            "test",
          paymentProviderRef:
            providerRef,
        }),
      ),
  };

  const client = {
    commerceOrder,
  } as unknown as
    PrismaClient;

  return {
    client,
    commerceOrder,
    get providerRef() {
      return providerRef;
    },
  };
}

const input = {
  buildProjectId:
    "build_1",
  orderId:
    "order_1",
  provider:
    "stripe",
  environment:
    "test" as const,
  providerRef:
    "cs_test_123",
};

describe(
  "commerce payment provider reference adoption",
  () => {
    it(
      "adopts a missing provider reference exactly once",
      async () => {
        const fake =
          fakeClient(
            null,
          );

        await expect(
          adoptCommercePaymentProviderRef(
            fake.client,
            input,
          ),
        ).resolves.toBe(
          "cs_test_123",
        );

        expect(
          fake.providerRef,
        ).toBe(
          "cs_test_123",
        );
      },
    );

    it(
      "is idempotent when the exact reference is already stored",
      async () => {
        const fake =
          fakeClient(
            "cs_test_123",
          );

        await expect(
          adoptCommercePaymentProviderRef(
            fake.client,
            input,
          ),
        ).resolves.toBe(
          "cs_test_123",
        );
      },
    );

    it(
      "never overwrites a conflicting non-null provider reference",
      async () => {
        const fake =
          fakeClient(
            "cs_test_other",
          );

        await expect(
          adoptCommercePaymentProviderRef(
            fake.client,
            input,
          ),
        ).rejects.toBeInstanceOf(
          CommercePaymentProviderRefError,
        );

        expect(
          fake.providerRef,
        ).toBe(
          "cs_test_other",
        );
      },
    );
  },
);
