import type {
  CapabilityKey,
  ProviderEnvironment,
  ProviderKey,
  ProviderManifest,
  ProviderRegistration,
} from "./contracts";

export class ProviderRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderRegistryError";
  }
}

export class ProviderRegistry<
  TCapability extends CapabilityKey,
  THandler,
> {
  private readonly registrations =
    new Map<ProviderKey, ProviderRegistration<TCapability, THandler>>();

  register(
    registration: ProviderRegistration<TCapability, THandler>,
  ): void {
    const key = registration.manifest.key.trim();

    if (!key) {
      throw new ProviderRegistryError(
        "Provider key must not be empty.",
      );
    }

    if (this.registrations.has(key)) {
      throw new ProviderRegistryError(
        `Provider "${key}" is already registered.`,
      );
    }

    if (registration.manifest.environments.length === 0) {
      throw new ProviderRegistryError(
        `Provider "${key}" must declare at least one execution environment.`,
      );
    }

    if (
      new Set(registration.manifest.environments).size !==
      registration.manifest.environments.length
    ) {
      throw new ProviderRegistryError(
        `Provider "${key}" contains duplicate execution environments.`,
      );
    }

    this.registrations.set(key, registration);
  }

  getManifest(providerKey: ProviderKey): ProviderManifest {
    const registration = this.registrations.get(providerKey);

    if (!registration) {
      throw new ProviderRegistryError(
        `Provider "${providerKey}" is not registered.`,
      );
    }

    return registration.manifest;
  }

  getHandler(
    providerKey: ProviderKey,
    capability: TCapability,
  ): THandler {
    const registration = this.registrations.get(providerKey);

    if (!registration) {
      throw new ProviderRegistryError(
        `Provider "${providerKey}" is not registered.`,
      );
    }

    const handler = registration.handlers[capability];

    if (!handler) {
      throw new ProviderRegistryError(
        `Provider "${providerKey}" does not implement capability "${capability}".`,
      );
    }

    return handler;
  }

  supports(
    providerKey: ProviderKey,
    capability: TCapability,
  ): boolean {
    return Boolean(
      this.registrations.get(providerKey)?.handlers[capability],
    );
  }

  supportsInEnvironment(
    providerKey: ProviderKey,
    capability: TCapability,
    environment: ProviderEnvironment,
  ): boolean {
    const registration =
      this.registrations.get(providerKey);

    return Boolean(
      registration &&
        registration.manifest.environments.includes(environment) &&
        registration.handlers[capability],
    );
  }

  list(): readonly ProviderRegistration<TCapability, THandler>[] {
    return [...this.registrations.values()];
  }
}
