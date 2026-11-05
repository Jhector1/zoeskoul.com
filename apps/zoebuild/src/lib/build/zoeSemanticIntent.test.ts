import {describe, expect, it} from "vitest";
import {parseZoeSemanticIntent, zoeSemanticIntentSchema} from "./zoeSemanticIntent";

const edit = {action:"edit", pagePath:"privacy.html", provider:"", reply:"", conversationMode:"act"};

describe("Zoé semantic intent validation", () => {
  it("accepts model-selected routes independently of the user's choice of words", () => {
    expect(parseZoeSemanticIntent(edit)).toEqual({action:"edit",pagePath:"privacy.html",provider:"",reply:""});
    expect(parseZoeSemanticIntent({...edit, pagePath:"none"}).pagePath).toBe("none");
    expect(parseZoeSemanticIntent({action:"answer",pagePath:"none",provider:"",reply:"",conversationMode:"discuss"}).action).toBe("answer");
    expect(parseZoeSemanticIntent({action:"provider_settings",pagePath:"none",provider:"Stripe",reply:"",conversationMode:"act"}).provider).toBe("Stripe");
  });
  it("rejects invalid actions, page paths, and forged intent fields", () => {
    expect(() => parseZoeSemanticIntent({...edit, pagePath:"../../.env"})).toThrow("BUILD_INTENT_INVALID");
    expect(() => parseZoeSemanticIntent({...edit, action:"full_rebuild"})).toThrow("BUILD_INTENT_INVALID");
    expect(() => parseZoeSemanticIntent({...edit, provider:"Stripe"})).toThrow("BUILD_INTENT_INVALID");
    expect(() => parseZoeSemanticIntent({...edit, reply:1})).toThrow("BUILD_INTENT_INVALID");
    expect(parseZoeSemanticIntent({action:"answer",pagePath:"none",provider:"",reply:"An answer generated in the router",conversationMode:"discuss"}).reply).toBe("");
    expect(() => parseZoeSemanticIntent(null)).toThrow("BUILD_INTENT_INVALID");
    expect(() => parseZoeSemanticIntent({...edit,conversationMode:"invented"})).toThrow("BUILD_INTENT_INVALID");
    expect(() => parseZoeSemanticIntent({...edit,conversationMode:undefined})).toThrow("BUILD_INTENT_INVALID");
  });
  it("prevents the model from silently translating an unsupported runtime into an edit", () => {
    expect(parseZoeSemanticIntent({...edit, pagePath:"none", runtimeSupport:"unsupported"}))
      .toEqual({action:"answer",pagePath:"none",provider:"",reply:""});
    expect(parseZoeSemanticIntent({...edit, pagePath:"none", runtimeSupport:"supported"}).action).toBe("edit");
    expect(() => parseZoeSemanticIntent({...edit,runtimeSupport:"pretend-supported"})).toThrow("BUILD_INTENT_INVALID");
  });
  it("routes exploratory requests to conversation even if the model suggests editing", () => {
    expect(parseZoeSemanticIntent({...edit,pagePath:"none",conversationMode:"discuss"}))
      .toEqual({action:"answer",pagePath:"none",provider:"",reply:""});
    expect(parseZoeSemanticIntent({...edit,action:"full_rebuild",pagePath:"none",conversationMode:"discuss"}).action)
      .toBe("answer");
    expect(parseZoeSemanticIntent({action:"provider_settings",pagePath:"none",provider:"payments:stripe",reply:"",conversationMode:"discuss"}).action)
      .toBe("answer");
    // Genuine explicit requests still reach existing authorization/review gates.
    expect(parseZoeSemanticIntent({...edit,pagePath:"none",conversationMode:"act"}).action).toBe("edit");
    expect(parseZoeSemanticIntent({action:"provider_settings",pagePath:"none",provider:"payments:stripe",reply:"",conversationMode:"act"}).action)
      .toBe("provider_settings");
  });
  it("publishes a closed structured-output schema", () => {
    const schema = zoeSemanticIntentSchema();
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(["action","pagePath","provider","reply","runtimeSupport","conversationMode"]);
    expect(schema.properties.conversationMode.enum).toEqual(["discuss","act"]);
    expect(schema.properties.action.enum).toContain("clarify");
  });
});
