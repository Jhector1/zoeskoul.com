import "server-only";

import type {
  PrismaClient,
} from "@zoeskoul/db";

import type {
  BuildSecretStore,
} from "@zoeskoul/platform-server/security/buildSecretStore";

import type {
  CommerceProviderEnvironment,
} from "./nativeCommerceProvider";

type BuildSecretValue =
  Parameters<
    BuildSecretStore["put"]
  >[0]["value"];

export type CommerceProviderConnectionLifecycleResult =
  Readonly<{
    provider: string;
    environment:
      CommerceProviderEnvironment;
    status:
      "active" |
      "disconnected";
  }>;

export class CommerceProviderConnectionLifecycleError
  extends Error {
  readonly code:
    | "COMMERCE_PROVIDER_CONNECTION_SCOPE_INVALID"
    | "COMMERCE_PROVIDER_CONNECTION_SAVE_FAILED"
    | "COMMERCE_PROVIDER_CONNECTION_DISCONNECT_FAILED";

  constructor(
    code:
      CommerceProviderConnectionLifecycleError["code"],
    message: string,
  ) {
    super(
      message,
    );

    this.name =
      "CommerceProviderConnectionLifecycleError";

    this.code =
      code;
  }
}

function normalizedScope(
  input:
    Readonly<{
      buildProjectId:
        string;
      storeId:
        string;
      provider:
        string;
    }>,
) {
  const buildProjectId =
    input.buildProjectId
      .trim();

  const storeId =
    input.storeId
      .trim();

  const provider =
    input.provider
      .trim();

  if (
    !buildProjectId ||
    !storeId ||
    !provider
  ) {
    throw new CommerceProviderConnectionLifecycleError(
      "COMMERCE_PROVIDER_CONNECTION_SCOPE_INVALID",
      "Commerce provider connection scope is invalid.",
    );
  }

  return {
    buildProjectId,
    storeId,
    provider,
  } as const;
}

/**
 * Persists validated provider credentials behind an opaque BuildSecretStore
 * reference and atomically switches the provider/environment connection to the
 * new vault record. Provider-specific normalization, environment validation,
 * and remote probing must happen before this function is called.
 */
export async function activateCommerceProviderCredentialConnection(
  client:
    PrismaClient,
  input:
    Readonly<{
      buildProjectId:
        string;
      storeId:
        string;
      provider:
        string;
      environment:
        CommerceProviderEnvironment;
      credentials:
        BuildSecretValue;
      secretStore:
        BuildSecretStore;
    }>,
): Promise<
  CommerceProviderConnectionLifecycleResult
> {
  const {
    buildProjectId,
    storeId,
    provider,
  } =
    normalizedScope(
      input,
    );

  const existing =
    await client
      .commerceProviderConnection
      .findUnique({
        where: {
          storeId_provider_environment: {
            storeId,
            provider,
            environment:
              input.environment,
          },
        },
        select: {
          id:
            true,
          credentialsSecretRef:
            true,
        },
      });

  const stored =
    await input.secretStore
      .put({
        buildProjectId,
        value:
          input.credentials,
      });

  try {
    await client
      .commerceProviderConnection
      .upsert({
        where: {
          storeId_provider_environment: {
            storeId,
            provider,
            environment:
              input.environment,
          },
        },
        create: {
          storeId,
          provider,
          environment:
            input.environment,
          status:
            "active",
          credentialsSecretRef:
            stored.secretRef,
        },
        update: {
          status:
            "active",
          credentialsSecretRef:
            stored.secretRef,
        },
        select: {
          id:
            true,
        },
      });
  } catch {
    await input.secretStore
      .delete({
        buildProjectId,
        secretRef:
          stored.secretRef,
      })
      .catch(
        () => undefined,
      );

    throw new CommerceProviderConnectionLifecycleError(
      "COMMERCE_PROVIDER_CONNECTION_SAVE_FAILED",
      "Commerce provider connection could not be saved.",
    );
  }

  const previousRef =
    existing
      ?.credentialsSecretRef
      ?.trim();

  if (
    previousRef &&
    previousRef !==
      stored.secretRef
  ) {
    await input.secretStore
      .delete({
        buildProjectId,
        secretRef:
          previousRef,
      })
      .catch(
        () => undefined,
      );
  }

  return {
    provider,
    environment:
      input.environment,
    status:
      "active",
  };
}

/**
 * Marks one explicit provider/environment connection as disconnected, removes
 * all secret references from persistence, then best-effort deletes the old
 * credential/webhook vault records. No alternate environment is selected.
 */
export async function disconnectCommerceProviderEnvironment(
  client:
    PrismaClient,
  input:
    Readonly<{
      buildProjectId:
        string;
      storeId:
        string;
      provider:
        string;
      environment:
        CommerceProviderEnvironment;
      secretStore:
        BuildSecretStore;
    }>,
): Promise<
  CommerceProviderConnectionLifecycleResult
> {
  const {
    buildProjectId,
    storeId,
    provider,
  } =
    normalizedScope(
      input,
    );

  const existing =
    await client
      .commerceProviderConnection
      .findUnique({
        where: {
          storeId_provider_environment: {
            storeId,
            provider,
            environment:
              input.environment,
          },
        },
        select: {
          id:
            true,
          credentialsSecretRef:
            true,
          webhookSecretRef:
            true,
            storefrontSecretRef: true,
        },
      });

  if (!existing) {
    return {
      provider,
      environment:
        input.environment,
      status:
        "disconnected",
    };
  }

  try {
    await client
      .commerceProviderConnection
      .update({
        where: {
          id:
            existing.id,
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
            storefrontSecretRef: null,
        },
        select: {
          id:
            true,
        },
      });
  } catch {
    throw new CommerceProviderConnectionLifecycleError(
      "COMMERCE_PROVIDER_CONNECTION_DISCONNECT_FAILED",
      "Commerce provider connection could not be disconnected.",
    );
  }

  const secretRefs =
    new Set(
      [
        existing
          .credentialsSecretRef
          ?.trim(),
        existing
          .webhookSecretRef
          ?.trim(),
          existing.storefrontSecretRef?.trim(),
      ].filter(
        (
          secretRef,
        ): secretRef is string =>
          Boolean(
            secretRef,
          ),
      ),
    );

  for (
    const secretRef of secretRefs
  ) {
    await input.secretStore
      .delete({
        buildProjectId,
        secretRef,
      })
      .catch(
        () => undefined,
      );
  }

  return {
    provider,
    environment:
      input.environment,
    status:
      "disconnected",
  };
}
