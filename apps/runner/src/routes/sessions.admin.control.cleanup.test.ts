import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  getAllSessions: vi.fn(),
  killSession: vi.fn(),
  inspectContainer: vi.fn(),
  inspectVolume: vi.fn(),
  inspectNetwork: vi.fn(),
  removeAdminSessionNetwork: vi.fn(),
  removeAdminEgressProxy: vi.fn(),
  removeAdminWorkspaceVolume: vi.fn(),
  setAdminLabSwitch: vi.fn(),
  status: vi.fn(),
  configuration: vi.fn(),
}));
vi.mock("../services/execution/learningAdminGrant.js", () => ({
  adminLabConfiguration: mocks.configuration,
}));
vi.mock("../services/execution/learningAdminSwitch.js", () => ({
  setAdminLabSwitch: mocks.setAdminLabSwitch,
  adminLabSwitchStatus: mocks.status,
}));
vi.mock("../services/sessions/sessionStore.js", () => ({
  getAllSessions: mocks.getAllSessions,
}));
vi.mock("../services/docker/killSession.js", () => ({
  killSession: mocks.killSession,
}));
vi.mock("../services/docker/dockerClient.js", () => ({
  docker: {
    getContainer: () => ({ inspect: mocks.inspectContainer }),
    getVolume: () => ({ inspect: mocks.inspectVolume }),
    getNetwork: () => ({ inspect: mocks.inspectNetwork }),
  },
}));
vi.mock("../services/execution/adminWorkspaceVolume.js", () => ({
  adminWorkspaceVolumeName: (sessionId: string) => `zoeskoul-admin-ws-${sessionId}`,
  removeAdminWorkspaceVolume: mocks.removeAdminWorkspaceVolume,
}));
vi.mock("../services/execution/adminEgressProxy.js", () => ({
  adminEgressProxyName: (sid: string) => `zoeskoul-admin-egress-${sid}`,
  removeAdminEgressProxy: mocks.removeAdminEgressProxy,
}));
vi.mock("../services/execution/adminSessionNetwork.js", () => ({
  adminSessionNetworkName: (sessionId: string) => `zoeskoul-admin-net-${sessionId}`,
  removeAdminSessionNetwork: mocks.removeAdminSessionNetwork,
}));
import { adminLabControlRoute } from "./sessions.admin.control.js";
import { revokeAdminSessionsRoute } from "./sessions.admin.revoke.js";

const sessionId = "sess_12345678-1234-1234-1234-123456789abc";
const makeSession = (state = "running") => ({
  id: sessionId,
  labMode: "admin",
  state,
  containerId: "trusted-container-id",
  adminVolumeName: `zoeskoul-admin-ws-${sessionId}`,
});
const missing = () => Promise.reject(Object.assign(new Error("404"), { statusCode: 404 }));

async function revoke(submittedSecret: string) {
  const req = {
    header: (name: string) => name === "x-learning-admin-control" ? submittedSecret : "",
    body: { enabled: false },
  };
  const response = {
    code: 0, data: null as any,
    status(code: number) { this.code = code; return this; },
    json(data: any) { this.data = data; return this; },
  };
  await adminLabControlRoute(req as any, response as any, vi.fn());
  return response;
}

beforeEach(() => {
  process.env.ZOESKOUL_LEARNING_ADMIN_CONTROL_SECRET = "control-" + "a".repeat(48);
  mocks.getAllSessions.mockReset().mockReturnValue([makeSession()]);
  mocks.killSession.mockReset().mockResolvedValue(undefined);
  mocks.inspectContainer.mockReset().mockImplementation(missing);
  mocks.inspectVolume.mockReset().mockImplementation(missing);
  mocks.inspectNetwork.mockReset().mockImplementation(missing);
  mocks.removeAdminSessionNetwork.mockReset().mockResolvedValue(undefined);
  mocks.removeAdminEgressProxy.mockReset().mockResolvedValue(undefined);
  mocks.removeAdminWorkspaceVolume.mockReset().mockResolvedValue(undefined);
  mocks.setAdminLabSwitch.mockReset().mockReturnValue({ enabled: false, generation: 3 });
  mocks.status.mockReset().mockReturnValue({ enabled: false, generation: 3 });
});
afterEach(() => { delete process.env.ZOESKOUL_LEARNING_ADMIN_CONTROL_SECRET; });

describe("administrator revocation admission and cleanup", () => {
  it("turns OFF first and verifies both session-owned resources", async () => {
    const response = await revoke(process.env.ZOESKOUL_LEARNING_ADMIN_CONTROL_SECRET!);
    expect(response.code).toBe(200);
    expect(response.data).toMatchObject({ ok: true, enabled: false, revoked: 1 });
    expect(mocks.setAdminLabSwitch).toHaveBeenCalledWith(false);
    expect(mocks.killSession).toHaveBeenCalledWith(sessionId, "canceled");
    expect(mocks.setAdminLabSwitch.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.killSession.mock.invocationCallOrder[0]);
    expect(mocks.removeAdminWorkspaceVolume).toHaveBeenCalledWith(
      `zoeskoul-admin-ws-${sessionId}`, sessionId);
  });

  it("verifies isolated network removal before reporting revocation success", async () => {
    mocks.getAllSessions.mockReturnValue([{ ...makeSession(),
      adminNetworkName: `zoeskoul-admin-net-${sessionId}` }]);
    const response = await revoke(process.env.ZOESKOUL_LEARNING_ADMIN_CONTROL_SECRET!);
    expect(response.code).toBe(200);
    expect(mocks.removeAdminSessionNetwork).toHaveBeenCalledWith(
      `zoeskoul-admin-net-${sessionId}`, sessionId);
    // An object that remains present for every bounded inspect must fail closed.
    // Use fake timers so all 20 verification attempts finish without a 5s wait.
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    try {
      mocks.inspectNetwork.mockResolvedValue({ Name: "still-present" });
      const pending = revoke(process.env.ZOESKOUL_LEARNING_ADMIN_CONTROL_SECRET!);
      await vi.runAllTimersAsync();
      const failed = await pending;
      expect(failed.code).toBe(503);
      expect(failed.data).toMatchObject({ ok: false, enabled: false, revoked: 0 });
      expect(mocks.inspectNetwork).toHaveBeenCalledTimes(21); // 1 earlier + 20 retries
    } finally {
      vi.useRealTimers();
    }
  });

  it("accepts delayed Docker network disappearance after a transient inspect", async () => {
    mocks.getAllSessions.mockReturnValue([{ ...makeSession(),
      adminNetworkName: `zoeskoul-admin-net-${sessionId}` }]);
    mocks.inspectNetwork.mockResolvedValueOnce({ Name: "briefly-visible" });
    const response = await revoke(process.env.ZOESKOUL_LEARNING_ADMIN_CONTROL_SECRET!);
    expect(response.code).toBe(200);
    expect(response.data).toMatchObject({ ok: true, enabled: false, revoked: 1 });
    expect(mocks.inspectNetwork).toHaveBeenCalledTimes(2); // then Docker 404
  });

  it("verifies the session-owned proxy is removed before revocation reports success", async () => {
    mocks.getAllSessions.mockReturnValue([{...makeSession(),
      adminEgressProxyName:`zoeskoul-admin-egress-${sessionId}`,
      adminNetworkName:`zoeskoul-admin-net-${sessionId}`,
    }]);
    const response = await revoke(process.env.ZOESKOUL_LEARNING_ADMIN_CONTROL_SECRET!);
    expect(response.code).toBe(200);
    expect(mocks.removeAdminEgressProxy).toHaveBeenCalledWith(
      `zoeskoul-admin-egress-${sessionId}`, sessionId);
    expect(mocks.removeAdminSessionNetwork).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the owned proxy cannot be removed", async () => {
    mocks.getAllSessions.mockReturnValue([{...makeSession(),
      adminEgressProxyName:`zoeskoul-admin-egress-${sessionId}`,
    }]);
    mocks.removeAdminEgressProxy.mockRejectedValueOnce(new Error("proxy busy"));
    const response = await revoke(process.env.ZOESKOUL_LEARNING_ADMIN_CONTROL_SECRET!);
    expect(response.code).toBe(503);
    expect(response.data).toMatchObject({ok:false,revoked:0});
  });

  it("retries already-terminal sessions after an earlier teardown failure", async () => {
    mocks.getAllSessions.mockReturnValue([makeSession("canceled")]);
    const response = await revoke(process.env.ZOESKOUL_LEARNING_ADMIN_CONTROL_SECRET!);
    expect(response.code).toBe(200);
    expect(mocks.killSession).toHaveBeenCalledTimes(1);
  });

  it("fails closed if a verified tmpfs volume cannot be removed", async () => {
    mocks.removeAdminWorkspaceVolume.mockRejectedValueOnce(new Error("volume busy"));
    const response = await revoke(process.env.ZOESKOUL_LEARNING_ADMIN_CONTROL_SECRET!);
    expect(response.code).toBe(503);
    expect(response.data).toMatchObject({ ok: false, enabled: false, revoked: 0 });
  });

  it("fails closed on a missing trusted volume identity", async () => {
    mocks.getAllSessions.mockReturnValue([{...makeSession(), adminVolumeName: null}]);
    const response = await revoke(process.env.ZOESKOUL_LEARNING_ADMIN_CONTROL_SECRET!);
    expect(response.code).toBe(503);
    expect(mocks.removeAdminWorkspaceVolume).not.toHaveBeenCalled();
  });

  it("older operator revoke endpoint shares verified fail-closed cleanup", async () => {
    mocks.removeAdminWorkspaceVolume.mockRejectedValueOnce(new Error("volume busy"));
    const req = {
      header: () => process.env.ZOESKOUL_LEARNING_ADMIN_CONTROL_SECRET!,
      body: {},
    };
    const response = {
      code: 0, data: null as any,
      status(code: number) { this.code = code; return this; },
      json(data: any) { this.data = data; return this; },
    };
    await revokeAdminSessionsRoute(req as any, response as any, vi.fn());
    expect(response.code).toBe(503);
    expect(response.data).toMatchObject({ok: false, enabled: false, revoked: 0});
  });

  it("does not allow unauthenticated revocation calls", async () => {
    const response = await revoke("wrong");
    expect(response.code).toBe(403);
    expect(mocks.setAdminLabSwitch).not.toHaveBeenCalled();
  });

  it("does not touch non-administrator sessions", async () => {
    mocks.getAllSessions.mockReturnValue([{ ...makeSession(), labMode: "standard" }]);
    const response = await revoke(process.env.ZOESKOUL_LEARNING_ADMIN_CONTROL_SECRET!);
    expect(response.code).toBe(200);
    expect(response.data.revoked).toBe(0);
    expect(mocks.killSession).not.toHaveBeenCalled();
  });
});
