import {
  describe,
  expect,
  it,
} from "vitest";

import {
  NativeCommerceCheckoutError,
  parseCommerceCheckoutRequest,
} from "./nativeCommerceCheckout";

const CART =
  "A".repeat(
    43,
  );

describe(
  "ZoeBuild checkout request boundary",
  () => {
    it(
      "accepts only the opaque cart id",
      () => {
        expect(
          parseCommerceCheckoutRequest({
            cartId:
              CART,
          }),
        ).toEqual({
          cartId:
            CART,
        });
      },
    );

    it.each([
      {
        cartId:
          CART,
        subtotalMinor:
          1,
      },
      {
        cartId:
          CART,
        totalMinor:
          1,
      },
      {
        cartId:
          CART,
        paymentProvider:
          "stripe",
      },
      {
        cartId:
          CART,
        environment:
          "live",
      },
      {
        cartId:
          CART,
        successUrl:
          "https://attacker.example/",
      },
    ])(
      "rejects browser-controlled checkout authority %#",
      (
        input,
      ) => {
        expect(
          () =>
            parseCommerceCheckoutRequest(
              input,
            ),
        ).toThrowError(
          NativeCommerceCheckoutError,
        );
      },
    );

    it(
      "rejects internal cart database ids",
      () => {
        expect(
          () =>
            parseCommerceCheckoutRequest({
              cartId:
                "cm_internal_primary_key",
            }),
        ).toThrowError(
          NativeCommerceCheckoutError,
        );
      },
    );
  },
);
