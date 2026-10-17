import "server-only";

import type {
  PrismaClient,
} from "@zoeskoul/db";

import type {
  CommerceProviderEnvironment,
} from "./nativeCommerceProvider";

export class CommercePaymentProviderRefError
  extends Error {
  readonly code: string;

  constructor(
    code: string,
    message: string,
  ) {
    super(
      message,
    );

    this.name =
      "CommercePaymentProviderRefError";

    this.code =
      code;
  }
}

function requiredValue(
  value: string,
  code: string,
  message: string,
) {
  const normalized =
    value.trim();

  if (!normalized) {
    throw new CommercePaymentProviderRefError(
      code,
      message,
    );
  }

  return normalized;
}

/**
 * Persist a provider checkout reference only when the trusted order is still
 * owned by the same provider/environment and the local reference is either
 * missing or already identical.
 *
 * A conflicting non-null reference is never overwritten.
 */
export async function adoptCommercePaymentProviderRef(
  client: PrismaClient,
  input: Readonly<{
    buildProjectId: string;
    orderId: string;
    provider: string;
    environment:
      CommerceProviderEnvironment;
    providerRef: string;
  }>,
) {
  const buildProjectId =
    requiredValue(
      input.buildProjectId,
      "COMMERCE_PROVIDER_REF_SCOPE_INVALID",
      "Commerce provider reference project scope is invalid.",
    );

  const orderId =
    requiredValue(
      input.orderId,
      "COMMERCE_PROVIDER_REF_ORDER_INVALID",
      "Commerce provider reference order is invalid.",
    );

  const provider =
    requiredValue(
      input.provider,
      "COMMERCE_PROVIDER_REF_PROVIDER_INVALID",
      "Commerce provider reference provider is invalid.",
    );

  const providerRef =
    requiredValue(
      input.providerRef,
      "COMMERCE_PROVIDER_REF_INVALID",
      "Commerce provider reference is invalid.",
    );

  if (
    providerRef.length >
    512
  ) {
    throw new CommercePaymentProviderRefError(
      "COMMERCE_PROVIDER_REF_INVALID",
      "Commerce provider reference is invalid.",
    );
  }

  const adopted =
    await client
      .commerceOrder
      .updateMany({
        where: {
          id:
            orderId,
          store: {
            buildProjectId,
          },
          paymentProvider:
            provider,
          paymentEnvironment:
            input.environment,
          status:
            "pending",
          paymentStatus: {
            in: [
              "pending",
              "authorized",
            ],
          },
          OR: [
            {
              paymentProviderRef:
                null,
            },
            {
              paymentProviderRef:
                providerRef,
            },
          ],
        },
        data: {
          paymentProviderRef:
            providerRef,
        },
      });

  if (
    adopted.count ===
    1
  ) {
    return providerRef;
  }

  /*
   * A concurrent trusted path may have adopted the exact same provider
   * reference, or may already have moved the order terminal after doing so.
   * Exact equality is idempotent; any different reference fails closed.
   */
  const current =
    await client
      .commerceOrder
      .findFirst({
        where: {
          id:
            orderId,
          store: {
            buildProjectId,
          },
        },
        select: {
          paymentProvider:
            true,
          paymentEnvironment:
            true,
          paymentProviderRef:
            true,
        },
      });

  if (
    current?.paymentProvider ===
      provider &&
    current
      .paymentEnvironment ===
      input.environment &&
    current
      .paymentProviderRef ===
      providerRef
  ) {
    return providerRef;
  }

  throw new CommercePaymentProviderRefError(
    "COMMERCE_PROVIDER_REF_CONFLICT",
    "Commerce provider reference changed or no longer belongs to the trusted checkout.",
  );
}
