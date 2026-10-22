import { describe, expect, it } from "vitest";
import { buildOwnershipRepairOptions } from "./workspaceOwnershipRepair.js";
import { env } from "../../lib/env.js";

describe("workspace ownership repair isolation", () => {
  it("uses a trusted, short-lived helper and does not elevate learner terminals", () => {
    const options = buildOwnershipRepairOptions("/workspaces/zoeskoul-run-12345678-1234-1234-1234-123456789abc");
    expect(options.User).toBe("0:0");
    expect(options.HostConfig.Privileged).toBe(false);
    expect(options.HostConfig.CapDrop).toEqual(["ALL"]);
    expect(options.HostConfig.CapAdd).toEqual(["CHOWN"]);
    expect(options.HostConfig.NetworkMode).toBe("none");
    expect(options.HostConfig.ReadonlyRootfs).toBe(true);
    expect(options.HostConfig.SecurityOpt).toEqual(["no-new-privileges:true"]);
    expect(options.HostConfig.Binds).toHaveLength(1);
    expect(options.Cmd[1]).toContain(`chown -hR -P -- ${env.execUid}:${env.execGid} /workspace`);
    expect(options.Cmd[1]).toContain("find /workspace -xdev");
    expect(options.HostConfig.PidsLimit).toBe(16);
  });
});
