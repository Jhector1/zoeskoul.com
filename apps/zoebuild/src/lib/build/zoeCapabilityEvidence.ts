/**
 * Human- and model-readable facts about this ZoeBuild project. This pure module
 * deliberately separates implemented operations from project readiness and
 * *observed* provider connection state. Nothing here grants permission.
 *
 * Keep supported project stacks tied to the React/Vite backend contract;
 * the answer/intent/edit routes use this shared evidence, not an AI-written FAQ.
 */
import {zoeProviderDirectoryEvidence} from "./zoeAssistantServiceIntent";

export type ZoeObservedConnection = Readonly<{
  provider: string;
  environment: string;
  status: string;
}>;
export type ZoeObservedRoute = Readonly<{
  provider: string;
  environment: string;
  capability: string;
  connected: boolean;
}>;
export type ZoeRuntimeProvider = Readonly<{
  id: string;
  executableCapabilities: readonly string[];
  connectionRequired: boolean;
}>;

export type ZoeCapabilityInput = Readonly<{
  project: Readonly<{stackId: string|null; status: string; sourceVersion: number}>;
  publishEnabled: boolean;
  aiEditAllowed: boolean;
  commerceLookup: "loaded" | "failed";
  commerceStorePresent: boolean;
  connections: readonly ZoeObservedConnection[];
  routes: readonly ZoeObservedRoute[];
  runtimeProviders: readonly ZoeRuntimeProvider[];
}>;

export function buildZoeCapabilityEvidence(input: ZoeCapabilityInput) {
  const isReact = input.project.stackId === "react-vite-v1";
  const editable = input.project.status !== "archived" && isReact;
  const directory = zoeProviderDirectoryEvidence();
  const providers = input.runtimeProviders.map(provider => {
    const connections = input.connections.filter(c => c.provider === provider.id)
      .map(c => ({environment: c.environment, status: c.status}));
    const routes = input.routes.filter(r => r.provider === provider.id)
      .map(r => ({environment: r.environment, capability: r.capability, connected: r.connected}));
    // Unknown is NOT disconnected. A failed DB read is never converted to an
    // optimistic connected state or an unsupported-provider conclusion.
    const connectionObservation = input.commerceLookup === "failed" ? "unknown" :
      !input.commerceStorePresent ? "no-commerce-store" :
      connections.some(c => c.status === "active") ? "active-connection-observed" :
      "no-active-connection-observed";
    return {id: provider.id, executableCapabilities: provider.executableCapabilities,
      connectionRequired: provider.connectionRequired, connectionObservation,
      connections, selectedRoutes: routes};
  });
  return {
    evidenceKind: "server-owned-implementation-and-observation",
    evidenceLimits: [
      "This snapshot is not a live Runner health check, execution result, browser test, or deployment confirmation.",
      "Provider connections and route selections are observed only for this owner-authorized project; never infer connection from a directory entry.",
      "Backend authorization, billing and per-operation validation remain authoritative at execution time.",
    ],
    project: {stackId: input.project.stackId, status: input.project.status,
      sourceVersion: input.project.sourceVersion},
    projectRuntime: {
      supportedExecutableStack: "react-vite-v1",
      description: "React + Vite browser frontend; React Router is available for client-side routes",
      currentProjectSupported: isReact,
      nextJsServerRuntime: "not-supported",
      springBootJavaRuntime: "not-supported",
      arbitraryServerBackend: "not-supported",
      incompatibleRuntimePolicy: "Explain or draft code for external environments if asked; never promise to create, run or deploy those runtimes within ZoeBuild or silently substitute React/Vite.",
    },
    operations: {
      projectSourceInspection: editable ? "available-with-owner-authorization" : "not-available-for-current-stack-or-status",
      projectSourceEditProposal: editable && input.aiEditAllowed
        ? "supported-reviewed-proposal-only" : "unavailable-for-current-project-or-entitlement",
      sourceSave: editable ? "requires-reviewed-apply-and-source-version-verification" : "unavailable-for-current-project",
      reactVitePreview: editable ? "implemented-but-runtime-not-probed" : "unsupported-for-current-project",
      isolatedProductionBuild: editable ? "implemented-but-not-run" : "unsupported-for-current-project",
      compiledSitePublish: editable && input.publishEnabled
        ? "endpoint-configured-requires-authorized-build-and-deployment-verification"
        : "unavailable-or-disabled-for-current-project",
    },
    providerDirectory: directory.map(category => ({...category,
      warning: "Presentation/setup list only. Listed does not mean connected, executable or ready."})),
    commerce: {
      projectStoreObservation: input.commerceLookup === "failed" ? "unknown" :
        input.commerceStorePresent ? "store-record-observed" : "no-store-record-observed",
      providers,
    },
  } as const;
}

export const ZOE_CAPABILITY_CONVERSATION_POLICY = [
  "capabilityEvidence is server-derived evidence, more authoritative than general model knowledge, prior assistant messages, and the providerDirectory presentation list.",
  "Interpret the user's actual meaning, including whether they are asking about ability, advice, source generation, preview, execution, integration, or deployment. Do not use literal keyword triggers.",
  "Differentiate: explain or write example code; propose an authorized source edit; apply/save after review; compile; run a preview; publish a site; connect or execute an external provider. These are not interchangeable.",
  "When a framework or backend runtime is unsupported, say plainly which part is unsupported here. You can still discuss it or draft examples, but never promise in-product execution or quietly replace the requested stack.",
  "If a provider is listed but has no executable backend capability, say it is listed or planned rather than connected or operational. If observation is unknown, say connection status was not verified; do not guess disconnected.",
  "If a provider has an active connection, do not claim its payment, checkout, webhooks, publication or other runtime paths were successfully exercised unless an actual operation returned verified success.",
  "If a request depends on a permission, subscription, connection, Runner availability or build/publish result, explain that it must be checked at execution time; never claim that a capability snapshot is an actual run.",
  "If the user challenges an earlier unsupported promise, correct it candidly using the current capabilityEvidence; do not double down or invent capabilities.",
  "Avoid generic hedging when the evidence is decisive; use natural, direct and helpful conversation, with workable alternatives only when relevant.",
].join("\n");
