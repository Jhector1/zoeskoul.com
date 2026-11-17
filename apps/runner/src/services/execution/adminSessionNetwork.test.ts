import { describe, expect, it, vi } from "vitest";
import {
  adminSessionNetworkName,
  adminSessionNetworkLabels,
  createAdminSessionNetwork,
  removeAdminSessionNetwork,
  cleanupOrphanedAdminSessionNetworks,
  verifyAdminSessionNetworkInspect,
} from "./adminSessionNetwork.js";

const sessionId = "sess_11111111-1111-4111-8111-111111111111";
const name = adminSessionNetworkName(sessionId);
const good = () => ({
  Name: name, Driver: "bridge", Internal: true, EnableIPv6: false,
  Attachable: false, Ingress: false, Containers: {},
  Labels: adminSessionNetworkLabels(sessionId),
});
const absent = () => Promise.reject(Object.assign(new Error("not found"), { statusCode: 404 }));

describe("per-session rootless internal network lifecycle", () => {
  it("requires owner identity, internal bridge, disabled IPv6 and trusted labels", () => {
    expect(() => adminSessionNetworkName("outside")).toThrow();
    expect(() => verifyAdminSessionNetworkInspect({ ...good(), Internal: false }, sessionId)).toThrow();
    expect(() => verifyAdminSessionNetworkInspect({ ...good(), EnableIPv6: true }, sessionId)).toThrow();
    expect(() => verifyAdminSessionNetworkInspect({ ...good(), Labels: {} }, sessionId)).toThrow();
    expect(() => verifyAdminSessionNetworkInspect({ ...good(), Name: "bridge" }, sessionId)).toThrow();
    expect(() => verifyAdminSessionNetworkInspect(good(), sessionId)).not.toThrow();
  });

  it("creates one non-attachable internal network with explicit labels", async () => {
    const createNetwork = vi.fn().mockResolvedValue({});
    const inspect = vi.fn().mockResolvedValue(good());
    const client = { createNetwork, getNetwork: vi.fn().mockReturnValue({ inspect }) };
    expect(await createAdminSessionNetwork(sessionId, client as any)).toBe(name);
    expect(createNetwork).toHaveBeenCalledWith(expect.objectContaining({
      Name: name, Internal: true, Driver: "bridge", EnableIPv6: false,
      Attachable: false, CheckDuplicate: true,
      Labels: adminSessionNetworkLabels(sessionId),
    }));
    expect(inspect).toHaveBeenCalledTimes(1);
  });

  it("refuses an existing endpoint even immediately after create", async () => {
    const client = {
      createNetwork: vi.fn().mockResolvedValue({}),
      getNetwork: () => ({ inspect: async () => ({ ...good(), Containers: { foreign: {} } }) }),
    };
    await expect(createAdminSessionNetwork(sessionId, client as any)).rejects.toThrow("unexpected endpoints");
  });

  it("removes only verified, empty, session-owned networks", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const inspect = vi.fn().mockResolvedValue(good());
    const client = { getNetwork: () => ({ inspect, remove }) };
    await expect(removeAdminSessionNetwork("bridge", sessionId, client as any)).rejects.toThrow("Incorrect");
    await removeAdminSessionNetwork(name, sessionId, client as any);
    expect(remove).toHaveBeenCalledTimes(1);
    inspect.mockResolvedValueOnce({ ...good(), Containers: { stillAttached: {} } });
    await expect(removeAdminSessionNetwork(name, sessionId, client as any)).rejects.toThrow("attached");
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("treats independently observed 404 as absent, not an arbitrary inspect failure", async () => {
    const remove = vi.fn();
    const client = { getNetwork: () => ({ inspect: absent, remove }) };
    await removeAdminSessionNetwork(name, sessionId, client as any);
    expect(remove).not.toHaveBeenCalled();
    await expect(removeAdminSessionNetwork(name, sessionId, {
      getNetwork: () => ({ inspect: async () => { throw new Error("daemon unavailable"); }, remove }),
    } as any)).rejects.toThrow("daemon unavailable");
  });

  it("startup reaps orphan networks after containers and fails closed on leaked networks", async () => {
    let pending = true;
    const remove = vi.fn().mockImplementation(async () => { pending = false; });
    const inspect = vi.fn().mockResolvedValue(good());
    const client = {
      listNetworks: vi.fn().mockImplementation(async () => pending ? [good()] : []),
      getNetwork: () => ({ inspect, remove }),
    };
    await cleanupOrphanedAdminSessionNetworks(client as any);
    expect(remove).toHaveBeenCalledTimes(1);
    pending = true;
    remove.mockImplementation(async () => {});
    await expect(cleanupOrphanedAdminSessionNetworks(client as any)).rejects.toThrow("incomplete");
  });
});
