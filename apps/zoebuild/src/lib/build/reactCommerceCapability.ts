/**
 * Canonical React/Vite commerce capability. A React website is not implicitly
 * a store; project specification is authoritative for commerce enablement.
 * This is a pure, shared server/browser predicate, not an authorization check.
 */
export type ReactCommerceProject = Readonly<{
  stackId: string | null;
  specification?: Readonly<{
    requirements?: Readonly<{ commerce?: boolean }> | null;
    commerce?: Readonly<{ storefrontRuntime?: string }> | null;
  }> | null;
}>;

export function hasReactCommerceCapability(project: ReactCommerceProject): boolean {
  return project.stackId === "react-vite-v1" &&
    project.specification?.requirements?.commerce === true &&
    project.specification.commerce?.storefrontRuntime === "react-vite";
}
