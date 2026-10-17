import "server-only";

/**
 * Trusted server-side connection material exposed to commerce provider adapters.
 *
 * This contract deliberately contains only opaque references to credential and
 * webhook secrets. Raw provider credentials/tokens must remain inside the
 * BuildSecretStore and may only be dereferenced by server-side adapter code.
 *
 * Provider identity and environment are owned by CommerceProviderExecutionContext
 * rather than duplicated here. Connection lifecycle is validated by the
 * persistence resolver before this material becomes executable.
 */
export type CommerceProviderConnectionSnapshot =
  Readonly<{
    id: string;
    externalAccountRef: string | null;
    credentialsSecretRef: string | null;
    webhookSecretRef: string | null;
    config: unknown;
  }>;
