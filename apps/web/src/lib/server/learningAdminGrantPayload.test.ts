import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createStudentAdminGrantPayload } from "./learningAdminGrantPayload";

const sample = {
  actorKey: `u:${"a".repeat(64)}`,
  target: {
    moduleSlug: "linux-module-3-users-groups-troubleshooting",
    topicSlug: "sudo-root-concepts",
  } as const,
  secret: "z".repeat(64),
  nonce: "b".repeat(32),
  nowMs: 1_800_000_000_000,
};

describe("trusted web-to-Runner administrative grants", () => {
  it("mints an actor-bound, 30-second, v1 Runner-compatible grant", () => {
    const grant = createStudentAdminGrantPayload(sample);
    const [payload, mac] = grant.split(".");
    expect(createHmac("sha256", sample.secret).update(payload).digest("base64url")).toBe(mac);
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    expect(claims).toMatchObject({
      v: 1,
      aud: "zoeskoul-learning-admin",
      actorKey: sample.actorKey,
      courseSlug: "linux-files-permissions-users",
      topicSlug: "sudo-root-concepts",
      nonce: sample.nonce,
    });
    expect(claims.exp - claims.iat).toBe(30);
    expect(claims).not.toHaveProperty("secret");
  });

  it("never mints a grant for guests, e2e actor keys, or short secrets", () => {
    for (const actorKey of ["g:abc", "e2e:" + "a".repeat(64), "u:forged"]){
      expect(() => createStudentAdminGrantPayload({ ...sample, actorKey })).toThrow();
    }
    expect(() => createStudentAdminGrantPayload({ ...sample, secret: "short" })).toThrow();
    expect(() => createStudentAdminGrantPayload({ ...sample, nonce: "not-random" })).toThrow();
  });
});
