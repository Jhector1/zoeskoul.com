/** Trusted Course 2 capstone fixture creation in a private rootless tmpfs volume.
 *
 * Never execute browser-provided commands, never seed ordinary or conceptual
 * admin sessions, and never write to a host workspace. Admission remains the
 * signed-grant + per-process operator switch in startDockerAdminSession().
 */
import type Docker from "dockerode";
import { docker } from "../docker/dockerClient.js";
import { adminWorkspaceVolumeName, verifyAdminWorkspaceVolume } from "./adminWorkspaceVolume.js";
import { adminHostConfig } from "./learningAdminSandbox.js";
import { assertAdminLabSwitch } from "./learningAdminSwitch.js";

/** Intentionally imperfect modes, so the learner has real work to do.
 * All seven paths begin owned by the sandbox identity (1000:1000). README
 * ownership changes to 0:0 only through the learner's scoped sudo step.
 * This literal is server-owned; neither a browser request nor a draft file
 * may supply script bytes or interpolate a path into it.
 */
export const CAPSTONE_INITIAL_MODES = Object.freeze({
  "secure-project": "755:1000:1000",
  "secure-project/README.md": "644:1000:1000",
  "secure-project/scripts": "755:1000:1000",
  "secure-project/scripts/run.sh": "644:1000:1000",
  "secure-project/secrets.env": "644:1000:1000",
  "secure-project/shared": "755:1000:1000",
  "secure-project/shared/notes.txt": "644:1000:1000",
});

const SCRIPT = [
  "set -eu",
  "umask 077",
  "cd /workspace",
  "test ! -e secure-project && test ! -L secure-project",
  "mkdir -m 0755 secure-project",
  "mkdir -m 0755 secure-project/scripts secure-project/shared",
  "printf '%s\n' '# Secure Project' 'Public training documentation.' > secure-project/README.md",
  "printf '%s\n' 'ENVIRONMENT=training' 'PLACEHOLDER=not-a-secret' > secure-project/secrets.env",
  "printf '%s\n' '#!/bin/sh' 'printf \"Secure project demo: OK\\n\"' > secure-project/scripts/run.sh",
  "printf '%s\n' 'Team handoff notes (practice).' > secure-project/shared/notes.txt",
  // chmod must happen while root still owns the freshly created entries.
  // The seeder intentionally lacks CAP_FOWNER; chmod after chown to 1000
  // fails with EPERM even when CAP_CHOWN is available.
  "chmod 00755 secure-project secure-project/scripts secure-project/shared",
  "chmod 0644 secure-project/README.md secure-project/scripts/run.sh secure-project/secrets.env secure-project/shared/notes.txt",
  "chown 1000:1000 secure-project secure-project/README.md secure-project/scripts secure-project/scripts/run.sh secure-project/secrets.env secure-project/shared secure-project/shared/notes.txt",
  "test -d secure-project && test ! -L secure-project",
  "test -f secure-project/README.md && test ! -L secure-project/README.md",
  "test -d secure-project/scripts && test ! -L secure-project/scripts",
  "test -f secure-project/scripts/run.sh && test ! -L secure-project/scripts/run.sh",
  "test -f secure-project/secrets.env && test ! -L secure-project/secrets.env",
  "test -d secure-project/shared && test ! -L secure-project/shared",
  "test -f secure-project/shared/notes.txt && test ! -L secure-project/shared/notes.txt",
  ...Object.entries(CAPSTONE_INITIAL_MODES).map(([item, expected]) =>
    `test "$(stat -c '%a:%u:%g' '${item}')" = '${expected}'`),
].join("\n");

/** Lease for the exact verified tmpfs mount. Do not release this hold until the
 * interactive administrator container has successfully started and mounted it.
 */
export type AdminCapstoneWorkspaceHold = Readonly<{
  assertMounted: () => Promise<void>;
  release: () => Promise<void>;
}>;

export type SeedCapstoneArgs = Readonly<{
  sessionId: string;
  volumeName: string;
  image: string;
  generation: number;
}>;

/** Compose immutable, reviewable Docker settings. No bind mounts, no network,
 * no Docker socket, and a read-only image filesystem outside the tmpfs volume.
 */
export function capstoneSeedContainerOptions(args: SeedCapstoneArgs) {
  if (adminWorkspaceVolumeName(args.sessionId) !== args.volumeName ||
      !/^sha256:[a-f0-9]{64}$/.test(args.image) ||
      !Number.isSafeInteger(args.generation) || args.generation < 0) {
    throw new Error("Invalid capstone workspace seeding authorization.");
  }
  return {
    Image: args.image,
    name: `zoeskoul_capstone_seed_${args.sessionId}`,
    User: "0:0",
    WorkingDir: "/workspace",
    Tty: false,
    OpenStdin: false,
    AttachStdin: false,
    AttachStdout: false,
    AttachStderr: false,
    Labels: {
      "com.zoeskoul.runner": "true",
      "com.zoeskoul.runner.session": args.sessionId,
      "com.zoeskoul.runner.purpose": "learn",
      "com.zoeskoul.runner.profile": "learning-admin-capstone-seed-v1",
    },
    // Override the admin image's default /opt/runner/admin-init.sh entrypoint.
    // It runs chpasswd, which cannot modify /etc on our read-only seeder rootfs.
    // This applies ONLY to the temporary setup container; the interactive
    // administrator shell keeps its normal audited startup behavior.
    Entrypoint: ["/bin/sh"],
    Cmd: ["-eu", "-c", SCRIPT],
    HostConfig: {
      ...adminHostConfig,
      ReadonlyRootfs: true,
      AutoRemove: false, // Verified cleanup in finally, even after nonzero exit
      CapDrop: ["ALL"],
      CapAdd: ["CHOWN"],
      SecurityOpt: ["no-new-privileges"],
      Mounts: [{
        Type: "volume" as const,
        Source: args.volumeName,
        Target: "/workspace",
        ReadOnly: false,
        VolumeOptions: {NoCopy: true} as import("dockerode").MountSettings["VolumeOptions"],
      }],
    },
  };
}

/** Passive mount holder: no shell initialization, network, host filesystem,
 * or additional capabilities. Rootless Docker's named tmpfs volume is
 * unmounted and emptied when its last running container exits. This holder
 * keeps it mounted while the seeder exits and the actual learner starts.
 * An explicit 10-minute bound also protects against stuck startup paths.
 */
export function capstoneHoldContainerOptions(args: SeedCapstoneArgs) {
  // Validate exactly the same immutable session, volume, and image identity.
  capstoneSeedContainerOptions(args);
  return {
    Image: args.image,
    name: `zoeskoul_capstone_hold_${args.sessionId}`,
    User: "1000:1000",
    WorkingDir: "/workspace",
    Tty: false,
    OpenStdin: false,
    AttachStdin: false,
    AttachStdout: false,
    AttachStderr: false,
    Labels: {
      "com.zoeskoul.runner": "true",
      "com.zoeskoul.runner.session": args.sessionId,
      "com.zoeskoul.runner.purpose": "learn",
      "com.zoeskoul.runner.profile": "learning-admin-capstone-hold-v1",
    },
    Entrypoint: ["/bin/sh"],
    Cmd: ["-c", "exec sleep 600"],
    HostConfig: {
      ...adminHostConfig,
      ReadonlyRootfs: true,
      AutoRemove: false,
      CapDrop: ["ALL"],
      CapAdd: [],
      SecurityOpt: ["no-new-privileges"],
      Mounts: [{
        Type: "volume" as const,
        Source: args.volumeName,
        Target: "/workspace",
        ReadOnly: false,
        VolumeOptions: {NoCopy: true} as import("dockerode").MountSettings["VolumeOptions"],
      }],
    },
  };
}

/** Called exclusively by the admitted capstone branch before createSession().
 * A failed or timed-out bootstrap prevents starting the learner terminal; the
 * caller already owns removal of the newly created tmpfs volume on failure.
 * On success the caller owns and MUST release the temporary mount holder only
 * after container.start() successfully mounts the volume for the learner.
 */
export async function seedAdminCapstoneWorkspace(
  args: SeedCapstoneArgs,
  client: Docker = docker,
): Promise<AdminCapstoneWorkspaceHold> {
  const options = capstoneSeedContainerOptions(args);
  const holdOptions = capstoneHoldContainerOptions(args);
  assertAdminLabSwitch(args.generation);
  await verifyAdminWorkspaceVolume(args.volumeName, args.sessionId);
  assertAdminLabSwitch(args.generation);

  // Start the holder FIRST; the volume must never have zero active mounts
  // between completion of the seeder and startup of the learner container.
  const holder = await client.createContainer(holdOptions);
  let released = false;
  const release = async () => {
    if (released) return;
    try {
      await holder.remove({force: true});
    } catch (error) {
      if ((error as {statusCode?: number})?.statusCode !== 404) {
        throw new Error("Capstone mount holder cleanup could not be verified.");
      }
    }
    released = true;
  };
  const assertMounted = async () => {
    assertAdminLabSwitch(args.generation);
    await verifyAdminWorkspaceVolume(args.volumeName, args.sessionId);
    const inspection = await holder.inspect();
    if (inspection.State?.Running !== true) {
      throw new Error("Capstone tmpfs mount holder stopped before learner startup.");
    }
    assertAdminLabSwitch(args.generation);
  };

  try {
    assertAdminLabSwitch(args.generation);
    await holder.start();
    await assertMounted();

    const container = await client.createContainer(options);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cleanupFailed = false;
    try {
      assertAdminLabSwitch(args.generation);
      await container.start();
      const result = await Promise.race([
        container.wait(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("Capstone setup exceeded time limit.")), 15000);
        }),
      ]);
      if (result.StatusCode !== 0) throw new Error("Capstone sample workspace setup failed.");
      assertAdminLabSwitch(args.generation);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      try {
        await container.remove({force: true});
      } catch (error) {
        if ((error as {statusCode?: number})?.statusCode !== 404) cleanupFailed = true;
      }
      if (cleanupFailed) throw new Error("Capstone setup container cleanup could not be verified.");
    }
    // The seeder is now gone, but the holder still has the volume mounted.
    await assertMounted();
    return {assertMounted, release};
  } catch (error) {
    // No learner container has been started; never leak a mount holder on
    // denial, timeout, failed seeding, or rootless Docker error.
    await release();
    throw error;
  }
}
