import { describe, expect, it, vi } from "vitest";
import { confirmDockerResourceAbsent } from "./adminRevocationVerification.js";

const notFound = () => Object.assign(new Error("absent"), { statusCode: 404 });

describe("administrator revocation Docker absence verification", () => {
  it("accepts an immediate 404", async () => {
    const inspect = vi.fn().mockRejectedValue(notFound());
    expect(await confirmDockerResourceAbsent(inspect, { attempts: 3 })).toBe(true);
    expect(inspect).toHaveBeenCalledTimes(1);
  });

  it("retries inspectable resources before accepting 404", async () => {
    const inspect = vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(notFound());
    const sleep = vi.fn().mockResolvedValue(undefined);
    expect(await confirmDockerResourceAbsent(inspect, { attempts: 3, sleep })).toBe(true);
    expect(inspect).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("does not treat a persistent stopped container as removed", async () => {
    const inspect = vi.fn().mockResolvedValue({ State: { Running: false } });
    const sleep = vi.fn().mockResolvedValue(undefined);
    expect(await confirmDockerResourceAbsent(inspect, { attempts: 3, sleep })).toBe(false);
    expect(inspect).toHaveBeenCalledTimes(3);
  });

  it("fails closed on Docker communication errors", async () => {
    const error = Object.assign(new Error("daemon unavailable"), { statusCode: 503 });
    await expect(confirmDockerResourceAbsent(vi.fn().mockRejectedValue(error), {
      attempts: 3,
    })).rejects.toBe(error);
  });

  it("rejects unbounded retry configurations", async () => {
    await expect(confirmDockerResourceAbsent(async () => {}, { attempts: 0 })).rejects.toThrow();
    await expect(confirmDockerResourceAbsent(async () => {}, { attempts: 999 })).rejects.toThrow();
  });
});
