import { describe, expect, it } from "vitest";
import { resolveEmailSenderSettings } from "./senderConfig";

describe("canonical transactional email sender environment", () => {
  const defaults = {
    BREVO_FROM_EMAIL: "shared@example.test",
    BREVO_FROM_NAME: "Platform",
    EMAIL_FROM: "legacy-default@example.test",
  };

  it("uses the same shared Brevo sender for welcome and classroom invitations", () => {
    for (const purpose of ["welcome", "classroom-invite"] as const) {
      expect(resolveEmailSenderSettings(purpose, defaults)).toEqual({
        from: "shared@example.test", name: "Platform", defaultName: "ZoeSkoul",
      });
    }
  });

  it("retains purpose-specific verified sender overrides", () => {
    expect(resolveEmailSenderSettings("welcome", {
      ...defaults,
      BREVO_WELCOME_FROM_EMAIL: "welcome@example.test",
      BREVO_WELCOME_FROM_NAME: "Welcome desk",
    })).toMatchObject({from: "welcome@example.test", name: "Welcome desk"});
    expect(resolveEmailSenderSettings("classroom-invite", {
      ...defaults,
      BREVO_INVITE_FROM_EMAIL: "invites@example.test",
      BREVO_INVITE_FROM_NAME: "Invitations",
    })).toMatchObject({from: "invites@example.test", name: "Invitations"});
  });

  it("retains the generic EMAIL_FROM fallback used elsewhere in Web", () => {
    expect(resolveEmailSenderSettings("welcome", { EMAIL_FROM: "generic@example.test" }).from)
      .toBe("generic@example.test");
    expect(resolveEmailSenderSettings("classroom-invite", { EMAIL_FROM: "generic@example.test" }).from)
      .toBe("generic@example.test");
  });

  it("does not accept the retired invitation aliases", () => {
    const oldOnly = {
      CLASSROOM_INVITE_FROM_EMAIL: "retired@example.test",
      LEARNING_INVITE_FROM_EMAIL: "retired2@example.test",
    };
    expect(resolveEmailSenderSettings("classroom-invite", oldOnly).from).toBeUndefined();
  });

  it("preserves existing nullish (not falsy) override semantics", () => {
    const cfg = resolveEmailSenderSettings("welcome", {
      BREVO_WELCOME_FROM_EMAIL: "", BREVO_FROM_EMAIL: "shared@example.test",
      BREVO_WELCOME_FROM_NAME: "", BREVO_FROM_NAME: "Platform",
    });
    expect(cfg.from).toBe("");
    expect(cfg.name).toBe("");
  });
});
