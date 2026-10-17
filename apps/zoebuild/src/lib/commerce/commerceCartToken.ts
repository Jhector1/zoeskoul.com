import "server-only";

import {
  createHash,
  randomBytes,
} from "node:crypto";

export const COMMERCE_CART_TOKEN_BYTES =
  32;

const COMMERCE_CART_TOKEN_PATTERN =
  /^[A-Za-z0-9_-]{43}$/;

export function isCommerceCartPublicToken(
  value:
    unknown,
): value is string {
  return (
    typeof value ===
      "string" &&
    COMMERCE_CART_TOKEN_PATTERN.test(
      value,
    )
  );
}

export function createCommerceCartPublicToken():
  string {
  return randomBytes(
    COMMERCE_CART_TOKEN_BYTES,
  ).toString(
    "base64url",
  );
}

export function hashCommerceCartPublicToken(
  value:
    string,
): string {
  return createHash(
    "sha256",
  )
    .update(
      value,
      "utf8",
    )
    .digest(
      "hex",
    );
}
