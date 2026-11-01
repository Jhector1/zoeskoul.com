/** Server-owned semantic intent vocabulary. These values are routing hints, not permissions. */
export const ZOE_INTENT_ACTIONS = ["edit", "full_rebuild", "provider_settings", "answer", "clarify"] as const;
import {isZoeReactPageRoute} from "./zoeReactRouteEdits";
export const ZOE_INTENT_PAGE_PATHS = ["none", "about.html", "privacy.html", "terms.html", "contact.html", "faq.html"] as const;

export type ZoeIntentAction = (typeof ZOE_INTENT_ACTIONS)[number];
export type ZoeIntentPagePath = string;
export const ZOE_RUNTIME_SUPPORT = ["supported", "unsupported", "not-applicable"] as const;
export type ZoeSemanticIntent = Readonly<{
  action: ZoeIntentAction;
  pagePath: ZoeIntentPagePath;
  provider: string;
  reply: string;
}>;

export function parseZoeSemanticIntent(input: unknown): ZoeSemanticIntent {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("BUILD_INTENT_INVALID");
  const value = input as Record<string, unknown>;
  if (!ZOE_INTENT_ACTIONS.includes(value.action as ZoeIntentAction) ||
      !(typeof value.pagePath === "string" && (ZOE_INTENT_PAGE_PATHS.includes(value.pagePath as typeof ZOE_INTENT_PAGE_PATHS[number]) || isZoeReactPageRoute(value.pagePath))) ||
      typeof value.provider !== "string" || value.provider.length > 120 ||
      typeof value.reply !== "string" || (value.action === "clarify" && value.reply.length > 2_000)) {
    throw new Error("BUILD_INTENT_INVALID");
  }
  // Classification is NOT a content-generation surface. The provider may
  // still include speculative answer text; discard it without a 503 or
  // returning unvalidated content to the browser.
  if (value.runtimeSupport !== undefined &&
      !ZOE_RUNTIME_SUPPORT.includes(value.runtimeSupport as typeof ZOE_RUNTIME_SUPPORT[number]))
    throw new Error("BUILD_INTENT_INVALID");
  if (value.action !== "edit" && value.pagePath !== "none") throw new Error("BUILD_INTENT_INVALID");
  if (value.action !== "provider_settings" && value.provider !== "") throw new Error("BUILD_INTENT_INVALID");
  // Semantic model output is not authority to silently translate an explicitly
  // requested unsupported runtime into a React/Vite edit. The separate answer
  // route explains the incompatibility; no edit generation is dispatched.
  if (value.runtimeSupport === "unsupported" &&
      (value.action === "edit" || value.action === "full_rebuild")) {
    return {action: "answer", pagePath: "none", provider: "", reply: ""};
  }
  return { action: value.action as ZoeIntentAction, pagePath: value.pagePath as ZoeIntentPagePath,
    provider: value.provider, reply: value.action === "clarify" ? value.reply : "" };
}

export function zoeSemanticIntentSchema() {
  return {
    type: "object", additionalProperties: false,
    required: ["action", "pagePath", "provider", "reply", "runtimeSupport"],
    properties: {
      action: { type: "string", enum: [...ZOE_INTENT_ACTIONS] },
      pagePath: { type: "string", maxLength: 49 },
      provider: { type: "string" },
      reply: { type: "string" },
      runtimeSupport: {type: "string", enum: [...ZOE_RUNTIME_SUPPORT]},
    },
  };
}
