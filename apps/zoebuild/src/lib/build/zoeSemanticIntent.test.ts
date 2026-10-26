import {describe, expect, it} from "vitest";
import {parseZoeSemanticIntent, zoeSemanticIntentSchema} from "./zoeSemanticIntent";

const edit = {action:"edit", pagePath:"privacy.html", provider:"", reply:""};

describe("Zoé semantic intent validation", () => {
  it("accepts model-selected routes independently of the user's choice of words", () => {
    expect(parseZoeSemanticIntent(edit)).toEqual(edit);
    expect(parseZoeSemanticIntent({...edit, pagePath:"none"}).pagePath).toBe("none");
    expect(parseZoeSemanticIntent({action:"answer",pagePath:"none",provider:"",reply:""}).action).toBe("answer");
    expect(parseZoeSemanticIntent({action:"provider_settings",pagePath:"none",provider:"Stripe",reply:""}).provider).toBe("Stripe");
  });
  it("rejects invalid actions, page paths, and forged intent fields", () => {
    expect(() => parseZoeSemanticIntent({...edit, pagePath:"../../.env"})).toThrow("BUILD_INTENT_INVALID");
    expect(() => parseZoeSemanticIntent({...edit, action:"full_rebuild"})).toThrow("BUILD_INTENT_INVALID");
    expect(() => parseZoeSemanticIntent({...edit, provider:"Stripe"})).toThrow("BUILD_INTENT_INVALID");
    expect(() => parseZoeSemanticIntent({...edit, reply:1})).toThrow("BUILD_INTENT_INVALID");
    expect(parseZoeSemanticIntent({action:"answer",pagePath:"none",provider:"",reply:"An answer generated in the router"}).reply).toBe("");
    expect(() => parseZoeSemanticIntent(null)).toThrow("BUILD_INTENT_INVALID");
  });
  it("publishes a closed structured-output schema", () => {
    const schema = zoeSemanticIntentSchema();
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(["action","pagePath","provider","reply"]);
    expect(schema.properties.action.enum).toContain("clarify");
  });
});
