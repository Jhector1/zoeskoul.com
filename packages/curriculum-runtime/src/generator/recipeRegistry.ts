export type RuntimeRecipeHandler = (...args: unknown[]) => unknown;
export type RuntimeRecipeRegistry = Record<string, RuntimeRecipeHandler>;
export type RuntimeRecipeRegistryResolver = (
    profileId: string,
) => RuntimeRecipeRegistry;

let currentResolver: RuntimeRecipeRegistryResolver | null = null;

export function setRecipeRegistryResolver(
    resolver: RuntimeRecipeRegistryResolver,
) {
  currentResolver = resolver;
}

export function getRecipeRegistryForProfile(
    profileId: string,
): RuntimeRecipeRegistry {
  if (!currentResolver) {
    throw new Error(
        "No recipe registry resolver is configured. Call setRecipeRegistryResolver(...) from a higher-level package.",
    );
  }

  return currentResolver(profileId);
}





/**
 * Backward-compatible alias for older runtime callers.
 */
export function getRecipeRegistry(
    profileId: string,
): RuntimeRecipeRegistry {
  return getRecipeRegistryForProfile(profileId);
}