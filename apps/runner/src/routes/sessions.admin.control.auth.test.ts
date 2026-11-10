import {afterEach, describe, expect, it, vi} from "vitest";
vi.mock("../services/docker/dockerClient.js", () => ({docker: {}}));
vi.mock("../services/sessions/sessionStore.js", () => ({getAllSessions: vi.fn(() => [])}));
vi.mock("../services/docker/killSession.js", () => ({killSession: vi.fn()}));
import {validOperatorSecret} from "./sessions.admin.control.js";

afterEach(() => {delete process.env.ZOESKOUL_LEARNING_ADMIN_CONTROL_SECRET;});
describe("shared admin control authentication", () => {
  it("accepts only the independent operator secret", () => {
    process.env.ZOESKOUL_LEARNING_ADMIN_CONTROL_SECRET = "control-" + "c".repeat(48);
    process.env.ZOESKOUL_LEARNING_ADMIN_GRANT_SECRET = "grant-" + "g".repeat(48);
    expect(validOperatorSecret(process.env.ZOESKOUL_LEARNING_ADMIN_CONTROL_SECRET)).toBe(true);
    expect(validOperatorSecret(process.env.ZOESKOUL_LEARNING_ADMIN_GRANT_SECRET)).toBe(false);
    expect(validOperatorSecret("control-")).toBe(false);
  });
  it("fails closed without a strong configured secret", () => {
    expect(validOperatorSecret("")).toBe(false);
    process.env.ZOESKOUL_LEARNING_ADMIN_CONTROL_SECRET = "short";
    expect(validOperatorSecret("short")).toBe(false);
  });
});
