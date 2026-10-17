import "server-only";

import type {
  PrismaClient,
} from "@zoeskoul/db";

import type {
  BuildSecretStore,
} from "@zoeskoul/platform-server/security/buildSecretStore";

import {
  createCommerceCartPublicToken,
  hashCommerceCartPublicToken,
  isCommerceCartPublicToken,
} from "./commerceCartToken";

import type {
  CommerceProviderEnvironment,
} from "./nativeCommerceProvider";

type StoredExternalCartReference =
  Readonly<{
    version:
      1;
    provider:
      string;
    environment:
      CommerceProviderEnvironment;
    remoteCartId:
      string;
  }>;

export type ExternalCommerceCartHandle =
  Readonly<{
    cartToken:
      string;
    internalCartId:
      string;
    currency:
      string;
  }>;

export type ResolvedExternalCommerceCartHandle =
  ExternalCommerceCartHandle &
  Readonly<{
    remoteCartId:
      string;
  }>;

export class ExternalCommerceCartHandleError
  extends Error {
  readonly code:
    | "EXTERNAL_COMMERCE_CART_SCOPE_INVALID"
    | "EXTERNAL_COMMERCE_CART_NOT_FOUND"
    | "EXTERNAL_COMMERCE_CART_SECRET_INVALID"
    | "EXTERNAL_COMMERCE_CART_SAVE_FAILED";

  readonly status:
    number;

  constructor(
    code:
      ExternalCommerceCartHandleError["code"],
    message:
      string,
    status:
      number,
  ) {
    super(
      message,
    );
    this.name =
      "ExternalCommerceCartHandleError";
    this.code =
      code;
    this.status =
      status;
  }
}

function requiredText(
  value:
    string,
  label:
    string,
): string {
  const normalized =
    value.trim();

  if (!normalized) {
    throw new ExternalCommerceCartHandleError(
      "EXTERNAL_COMMERCE_CART_SCOPE_INVALID",
      `${label} is required.`,
      400,
    );
  }

  return normalized;
}

function currencyCode(
  value:
    string,
): string {
  const normalized =
    value
      .trim()
      .toUpperCase();

  if (
    !/^[A-Z]{3}$/.test(
      normalized,
    )
  ) {
    throw new ExternalCommerceCartHandleError(
      "EXTERNAL_COMMERCE_CART_SCOPE_INVALID",
      "External cart currency is invalid.",
      400,
    );
  }

  return normalized;
}

async function storeIdForProject(
  client:
    PrismaClient,
  buildProjectId:
    string,
): Promise<string> {
  const store =
    await client
      .commerceStore
      .findUnique({
        where: {
          buildProjectId,
        },
        select: {
          id:
            true,
        },
      });

  if (!store) {
    throw new ExternalCommerceCartHandleError(
      "EXTERNAL_COMMERCE_CART_SCOPE_INVALID",
      "Commerce store is unavailable.",
      404,
    );
  }

  return store.id;
}

function storedReference(
  value:
    unknown,
  expected:
    Readonly<{
      provider:
        string;
      environment:
        CommerceProviderEnvironment;
    }>,
): StoredExternalCartReference {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(
      value,
    )
  ) {
    throw new ExternalCommerceCartHandleError(
      "EXTERNAL_COMMERCE_CART_SECRET_INVALID",
      "External cart reference is invalid.",
      500,
    );
  }

  const record =
    value as Readonly<
      Record<
        string,
        unknown
      >
    >;

  const remoteCartId =
    typeof record
      .remoteCartId ===
      "string"
      ? record
          .remoteCartId
          .trim()
      : "";

  if (
    record.version !==
      1 ||
    record.provider !==
      expected.provider ||
    record.environment !==
      expected.environment ||
    !remoteCartId
  ) {
    throw new ExternalCommerceCartHandleError(
      "EXTERNAL_COMMERCE_CART_SECRET_INVALID",
      "External cart reference does not match its provider execution scope.",
      500,
    );
  }

  return {
    version:
      1,
    provider:
      expected.provider,
    environment:
      expected.environment,
    remoteCartId,
  };
}

export async function createExternalCommerceCartHandle(
  client:
    PrismaClient,
  input:
    Readonly<{
      buildProjectId:
        string;
      provider:
        string;
      environment:
        CommerceProviderEnvironment;
      remoteCartId:
        string;
      currency:
        string;
      secretStore:
        BuildSecretStore;
    }>,
): Promise<
  ExternalCommerceCartHandle
> {
  const buildProjectId =
    requiredText(
      input.buildProjectId,
      "BuildProject id",
    );
  const provider =
    requiredText(
      input.provider,
      "Commerce provider",
    );
  const remoteCartId =
    requiredText(
      input.remoteCartId,
      "Remote cart id",
    );
  const currency =
    currencyCode(
      input.currency,
    );

  const storeId =
    await storeIdForProject(
      client,
      buildProjectId,
    );

  const cartToken =
    createCommerceCartPublicToken();

  const stored =
    await input
      .secretStore
      .put({
        buildProjectId,
        value: {
          version:
            1,
          provider,
          environment:
            input.environment,
          remoteCartId,
        },
      });

  try {
    const cart =
      await client
        .commerceCart
        .create({
          data: {
            publicTokenHash:
              hashCommerceCartPublicToken(
                cartToken,
              ),
            storeId,
            status:
              "active",
            currency,
            provider,
            providerEnvironment:
              input.environment,
            providerCartSecretRef:
              stored.secretRef,
          },
          select: {
            id:
              true,
          },
        });

    return {
      cartToken,
      internalCartId:
        cart.id,
      currency,
    };
  } catch {
    await input
      .secretStore
      .delete({
        buildProjectId,
        secretRef:
          stored.secretRef,
      })
      .catch(
        () => undefined,
      );

    throw new ExternalCommerceCartHandleError(
      "EXTERNAL_COMMERCE_CART_SAVE_FAILED",
      "External commerce cart handle could not be saved.",
      500,
    );
  }
}

export async function resolveExternalCommerceCartHandle(
  client:
    PrismaClient,
  input:
    Readonly<{
      buildProjectId:
        string;
      provider:
        string;
      environment:
        CommerceProviderEnvironment;
      cartToken:
        unknown;
      secretStore:
        BuildSecretStore;
    }>,
): Promise<
  ResolvedExternalCommerceCartHandle
> {
  const buildProjectId =
    requiredText(
      input.buildProjectId,
      "BuildProject id",
    );
  const provider =
    requiredText(
      input.provider,
      "Commerce provider",
    );

  if (
    !isCommerceCartPublicToken(
      input.cartToken,
    )
  ) {
    throw new ExternalCommerceCartHandleError(
      "EXTERNAL_COMMERCE_CART_NOT_FOUND",
      "Cart not found.",
      404,
    );
  }

  const cartToken =
    input.cartToken;

  const storeId =
    await storeIdForProject(
      client,
      buildProjectId,
    );

  const cart =
    await client
      .commerceCart
      .findFirst({
        where: {
          storeId,
          publicTokenHash:
            hashCommerceCartPublicToken(
              cartToken,
            ),
          status:
            "active",
          provider,
          providerEnvironment:
            input.environment,
        },
        select: {
          id:
            true,
          currency:
            true,
          providerCartSecretRef:
            true,
        },
      });

  const secretRef =
    cart
      ?.providerCartSecretRef
      ?.trim();

  if (
    !cart ||
    !secretRef
  ) {
    throw new ExternalCommerceCartHandleError(
      "EXTERNAL_COMMERCE_CART_NOT_FOUND",
      "Cart not found.",
      404,
    );
  }

  const secret =
    await input
      .secretStore
      .read({
        buildProjectId,
        secretRef,
      });

  const reference =
    storedReference(
      secret,
      {
        provider,
        environment:
          input.environment,
      },
    );

  return {
    cartToken,
    internalCartId:
      cart.id,
    currency:
      cart.currency,
    remoteCartId:
      reference.remoteCartId,
  };
}
