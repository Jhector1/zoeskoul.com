import {
  describe,
  expect,
  it,
} from "vitest";

import {
  COMMERCE_CART_TOKEN_BYTES,
  createCommerceCartPublicToken,
  hashCommerceCartPublicToken,
  isCommerceCartPublicToken,
} from "./commerceCartToken";

describe(
  "commerce cart public token",
  () => {
    it(
      "creates a 256-bit opaque browser token",
      () => {
        expect(
          COMMERCE_CART_TOKEN_BYTES,
        ).toBe(
          32,
        );

        const first =
          createCommerceCartPublicToken();
        const second =
          createCommerceCartPublicToken();

        expect(
          first,
        ).toHaveLength(
          43,
        );
        expect(
          isCommerceCartPublicToken(
            first,
          ),
        ).toBe(
          true,
        );
        expect(
          first,
        ).not.toBe(
          second,
        );
      },
    );

    it(
      "hashes tokens deterministically without preserving plaintext",
      () => {
        const token =
          createCommerceCartPublicToken();

        const digest =
          hashCommerceCartPublicToken(
            token,
          );

        expect(
          digest,
        ).toMatch(
          /^[a-f0-9]{64}$/,
        );
        expect(
          digest,
        ).not.toContain(
          token,
        );
        expect(
          hashCommerceCartPublicToken(
            token,
          ),
        ).toBe(
          digest,
        );
      },
    );

    it.each([
      null,
      undefined,
      "",
      "short",
      "gid://shopify/Cart/example?key=secret",
      "a".repeat(
        44,
      ),
    ])(
      "rejects non-public cart token value %p",
      (
        value,
      ) => {
        expect(
          isCommerceCartPublicToken(
            value,
          ),
        ).toBe(
          false,
        );
      },
    );
  },
);
