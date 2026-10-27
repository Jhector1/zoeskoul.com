import { describe, expect, it } from "vitest";
import { diagnoseZoeEditFailure } from "./zoeEditFailureDiagnostic";

describe("V12K10F safe edit failure diagnostics", () => {
  it("labels failures by bounded generation stage", () => {
    expect(diagnoseZoeEditFailure(new TypeError("secret"), "agent_inspection"))
      .toEqual({stage:"agent_inspection",reason:"SERVER_TYPE_FAILURE"});
    expect(diagnoseZoeEditFailure(new SyntaxError("private"), "proposal_validation"))
      .toEqual({stage:"proposal_validation",reason:"MODEL_RESPONSE_SYNTAX"});
  });

  it("distinguishes metering and agent response categories without untrusted messages", () => {
    const metering = Object.assign(new Error("Do not echo provider credentials"),
      {name:"ZoeBuildRequiredMeteringError"});
    const agent = Object.assign(new Error("Sensitive source contents"),
      {name:"ZoeProjectAgentError"});
    expect(diagnoseZoeEditFailure(metering,"transport_setup").reason)
      .toBe("BILLING_EXECUTION_FAILED");
    expect(diagnoseZoeEditFailure(agent,"agent_inspection").reason)
      .toBe("AGENT_RESPONSE_REJECTED");
  });

  it("does not echo error messages, stack traces or arbitrary exception names", () => {
    const secret = Object.assign(new Error("credential-sample-SHOULD_NOT_LEAK"),
      {name:"PrivateBackendError"});
    const result = diagnoseZoeEditFailure(secret,"agent_inspection");
    expect(result).toEqual({stage:"agent_inspection",reason:"UNKNOWN_GENERATION_FAILURE"});
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("SHOULD_NOT_LEAK");
    expect(serialized).not.toContain("PrivateBackendError");
    expect(serialized).not.toContain("stack");
  });
});
