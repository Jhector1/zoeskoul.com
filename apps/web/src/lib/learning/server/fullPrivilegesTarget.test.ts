import { describe, expect, it } from "vitest";
import { createStudentAdminGrantPayload } from "@/lib/server/learningAdminGrantPayload";
import { parseStudentAdminLabTarget, STUDENT_FULL_PRIVILEGES_TARGET } from "./learningAdminStudentPolicy";
describe("full privileges cannot be enabled by unsigned browser claims", () => {
  it("accepts only the exact disposable target", () => {
    expect(parseStudentAdminLabTarget(STUDENT_FULL_PRIVILEGES_TARGET)).toEqual(STUDENT_FULL_PRIVILEGES_TARGET);
    expect(parseStudentAdminLabTarget({...STUDENT_FULL_PRIVILEGES_TARGET, grant:"injected"})).toBeNull();
    expect(parseStudentAdminLabTarget({moduleSlug:"linux-module-3-users-groups-troubleshooting",topicSlug:"full-privileges"})).toBeNull();
    expect(parseStudentAdminLabTarget({moduleSlug:"zoelearning-disposable-root",topicSlug:"sudo-root-concepts"})).toBeNull();
  });
  it("mints only with an authenticated actor and strong server secret", () => {
    const args = {actorKey:`u:${"a".repeat(64)}`,target:STUDENT_FULL_PRIVILEGES_TARGET,secret:"x".repeat(48),nonce:"b".repeat(32),nowMs:1800000000000};
    const [payload] = createStudentAdminGrantPayload(args).split(".");
    const claims = JSON.parse(Buffer.from(payload,"base64url").toString("utf8"));
    expect(claims.topicSlug).toBe("full-privileges");
    expect(claims.actorKey).toBe(args.actorKey);
    expect(() => createStudentAdminGrantPayload({...args,actorKey:"g:guest"})).toThrow();
  });
});
