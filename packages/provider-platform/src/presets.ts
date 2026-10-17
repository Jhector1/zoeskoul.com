import type {
  CapabilityKey,
  MaterializedProviderPreset,
  ProviderCapabilityRoute,
  ProviderConnectionSnapshot,
  ProviderEnvironment,
  ProviderPreset,
  ProviderPresetRoute,
} from "./contracts";

export class ProviderPresetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderPresetError";
  }
}

function assertUniqueCapabilities<TCapability extends CapabilityKey>(
  preset: ProviderPreset<TCapability>,
): void {
  const seen = new Set<TCapability>();

  for (const route of preset.routes) {
    if (seen.has(route.capability)) {
      throw new ProviderPresetError(
        `Preset "${preset.key}" contains duplicate capability "${route.capability}".`,
      );
    }

    seen.add(route.capability);
  }
}

export function materializeProviderPreset<
  TCapability extends CapabilityKey,
>(args: {
  readonly preset: ProviderPreset<TCapability>;
  readonly scopeId: string;
  readonly environment: ProviderEnvironment;
  readonly resolveConnection: (
    route: ProviderPresetRoute<TCapability>,
  ) => ProviderConnectionSnapshot | null;
}): MaterializedProviderPreset<TCapability> {
  assertUniqueCapabilities(args.preset);

  const routes: ProviderCapabilityRoute<TCapability>[] =
    args.preset.routes.map((route) => {
      const connection = args.resolveConnection(route);

      if (!connection) {
        throw new ProviderPresetError(
          `Preset "${args.preset.key}" could not resolve an explicit connection for provider "${route.providerKey}" and capability "${route.capability}".`,
        );
      }

      if (connection.providerKey !== route.providerKey) {
        throw new ProviderPresetError(
          `Preset "${args.preset.key}" resolved provider "${connection.providerKey}" for route "${route.providerKey}".`,
        );
      }

      if (connection.environment !== args.environment) {
        throw new ProviderPresetError(
          `Preset "${args.preset.key}" cannot route ${args.environment} capability "${route.capability}" through a ${connection.environment} connection.`,
        );
      }

      if (connection.status !== "active") {
        throw new ProviderPresetError(
          `Preset "${args.preset.key}" requires active connection "${connection.id}".`,
        );
      }

      return {
        scopeId: args.scopeId,
        environment: args.environment,
        capability: route.capability,
        connectionId: connection.id,
      };
    });

  return {
    presetKey: args.preset.key,
    presetVersion: args.preset.version,
    routes,
  };
}
