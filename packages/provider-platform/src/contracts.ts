export type ProviderKey = string;

export type CapabilityKey = `${string}.${string}`;

export type ProviderEnvironment = "test" | "live";

export type ProviderConnectionKind =
  | "internal"
  | "credentials"
  | "oauth"
  | "endpoint";

export type ProviderConnectionStatus =
  | "pending"
  | "active"
  | "disabled"
  | "error";

export interface ProviderConnectionSnapshot {
  readonly id: string;
  readonly providerKey: ProviderKey;
  readonly environment: ProviderEnvironment;
  readonly kind: ProviderConnectionKind;
  readonly status: ProviderConnectionStatus;
}

export interface ProviderCapabilityRoute<
  TCapability extends CapabilityKey = CapabilityKey,
> {
  readonly scopeId: string;
  readonly environment: ProviderEnvironment;
  readonly capability: TCapability;
  readonly connectionId: string;
}

export interface ProviderManifest {
  readonly key: ProviderKey;
  readonly displayName: string;
  readonly connectionKinds: readonly ProviderConnectionKind[];
  /**
   * Environments in which this provider registration may execute.
   *
   * Capability support alone is insufficient: callers must also verify the
   * exact routed environment. There is never implicit test/live fallback.
   */
  readonly environments: readonly ProviderEnvironment[];
}

export interface ProviderRegistration<
  TCapability extends CapabilityKey,
  THandler,
> {
  readonly manifest: ProviderManifest;
  readonly handlers: Readonly<
    Partial<Record<TCapability, THandler>>
  >;
}

export interface ProviderPresetRoute<
  TCapability extends CapabilityKey = CapabilityKey,
> {
  readonly capability: TCapability;
  readonly providerKey: ProviderKey;
}

export interface ProviderPreset<
  TCapability extends CapabilityKey = CapabilityKey,
> {
  readonly key: string;
  readonly version: number;
  readonly label: string;
  readonly description: string;
  readonly routes: readonly ProviderPresetRoute<TCapability>[];
}

export interface MaterializedProviderPreset<
  TCapability extends CapabilityKey = CapabilityKey,
> {
  readonly presetKey: string;
  readonly presetVersion: number;
  readonly routes: readonly ProviderCapabilityRoute<TCapability>[];
}

export interface ProviderResourceLink {
  readonly connectionId: string;
  readonly domain: string;
  readonly resourceType: string;
  readonly localResourceId: string;
  readonly remoteResourceId: string;
}

export interface ProviderWebhookEndpoint {
  readonly id: string;
  readonly connectionId: string;
  readonly environment: ProviderEnvironment;
  readonly secretRef: string | null;
}
