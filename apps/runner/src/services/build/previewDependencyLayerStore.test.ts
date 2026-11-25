import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PreviewDependencyLayerStore, previewDependencyLayerKey } from "./previewDependencyLayerStore.js";

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "zoebuild-layer-test-"));
  roots.push(root);
  const first = path.join(root, "first");
  await fs.mkdir(path.join(first, "node_modules", ".pnpm", "foo", "node_modules", "foo"), { recursive: true });
  await fs.writeFile(path.join(first, "node_modules", ".pnpm", "foo", "node_modules", "foo", "index.js"), "export default 123");
  await fs.symlink(".pnpm/foo/node_modules/foo", path.join(first, "node_modules", "foo"));
  return { root, first, store: new PreviewDependencyLayerStore(root) };
}
const keyInput = {
  actorKey: "owner-1", projectId: "project-1", dependencyFingerprint: "frozen-exact-1",
  command: ["pnpm", "install", "--frozen-lockfile", "--ignore-scripts"],
  imageId: `sha256:${"a".repeat(64)}`,
  installPolicyFingerprint: "install-policy-v1",
};
const key = () => previewDependencyLayerKey(keyInput);

describe("K20D3F persistent verified dependency layers", () => {
  it("publishes a verified detached layer and survives a store restart", async () => {
    const { root, first, store } = await fixture();
    const lease = await store.publish(key(), first);
    expect(lease).not.toBeNull();
    expect((await fs.lstat(path.join(first, "node_modules"))).isDirectory()).toBe(true);
    expect(await fs.readFile(path.join(lease!.nodeModulesDir, "foo", "index.js"), "utf8"))
      .toBe("export default 123");
    expect(PreviewDependencyLayerStore.bind(lease!)).toBe(`${lease!.nodeModulesDir}:/workspace/node_modules:ro`);
    const restarted = new PreviewDependencyLayerStore(root);
    const next = await restarted.acquire(key());
    expect(next).not.toBeNull();
    expect(restarted.snapshot()).toMatchObject({lookups:1,hits:1,misses:0,activeKeys:1,activeLeases:1});
    expect(store.snapshot()).toMatchObject({publishAttempts:1,published:1,activeLeases:1});
    expect(await restarted.storageSnapshot()).toMatchObject({available:true,entries:1});
    expect((await restarted.storageSnapshot()).bytes).toBeGreaterThan(0);
    next!.release(); lease!.release();
  });

  it("verifies wide dependency directories and still rejects byte-level tampering", async () => {
    const { root, first, store } = await fixture();
    const wide = path.join(first, "node_modules", ".pnpm", "foo", "node_modules", "foo");
    for (let i = 0; i < 32; i++) {
      await fs.writeFile(path.join(wide, `module-${i.toString().padStart(2, "0")}.js`),
        `export const x = ${i};`);
    }
    const original = await store.publish(key(), first);
    expect(original).not.toBeNull();
    original?.release();
    const restarted = new PreviewDependencyLayerStore(root);
    const valid = await restarted.lookup(key());
    expect(valid.outcome).toBe("hit");
    valid.lease?.release();
    const target = path.join(root, ".zoebuild-preview-dependency-layers-v1", key(),
      "node_modules", ".pnpm", "foo", "node_modules", "foo", "module-17.js");
    await fs.writeFile(target, "export const x = 999;");
    const tampered = await restarted.lookup(key());
    expect(tampered.outcome).toBe("corrupt");
    expect(tampered.lease).toBeNull();
  });

  it("rejects tampered file contents on every acquire", async () => {
    const { first, store } = await fixture();
    const lease = await store.publish(key(), first);
    expect(lease).not.toBeNull();
    lease!.release();
    await fs.writeFile(path.join(lease!.nodeModulesDir, "foo", "index.js"), "malicious edit");
    expect(await store.acquire(key())).toBeNull();
  });

  it("rejects tampered manifests and a symlink replaced layer root", async () => {
    const { root, first, store } = await fixture();
    const lease = await store.publish(key(), first);
    lease!.release();
    const layerRoot = path.dirname(lease!.nodeModulesDir);
    await fs.writeFile(path.join(layerRoot, "manifest.json"), "{}");
    expect(await store.acquire(key())).toBeNull();
    await fs.rm(layerRoot, { recursive: true });
    await fs.symlink(root, layerRoot);
    expect(await store.acquire(key())).toBeNull();
  });

  it("rejects escaping relative and absolute links instead of publishing", async () => {
    const { root, first, store } = await fixture();
    await fs.mkdir(path.join(root, "outside"));
    await fs.symlink("../../outside", path.join(first, "node_modules", "escape"));
    expect(await store.publish(key(), first)).toBeNull();
    await fs.unlink(path.join(first, "node_modules", "escape"));
    await fs.symlink("/etc/passwd", path.join(first, "node_modules", "absolute"));
    expect(await store.publish(key(), first)).toBeNull();
    expect(await fs.lstat(path.join(first, "node_modules"))).toHaveProperty("mode");
  });

  it("accepts a contained relative symlink chain and verifies its published bytes", async () => {
    const { first, store } = await fixture();
    const modules = path.join(first, "node_modules");
    await fs.symlink("foo", path.join(modules, "alias"));
    const lease = await store.publish(key(), first);
    expect(lease).not.toBeNull();
    expect(await fs.readFile(path.join(lease!.nodeModulesDir, "alias", "index.js"), "utf8"))
      .toBe("export default 123");
    lease!.release();
    const verified = await store.acquire(key());
    expect(verified).not.toBeNull();
    verified!.release();
  });

  it.each(["missing", "broken", "missing/../foo"])(
    "rejects unresolved or cyclic symlink target %s", async target => {
      const { first, store } = await fixture();
      await fs.symlink(target, path.join(first, "node_modules", "broken"));
      expect(await store.publish(key(), first)).toBeNull();
      expect(await store.acquire(key())).toBeNull();
    },
  );

  it("rejects wrong owner, project, dependencies, install command or runtime image", async () => {
    const { first, store } = await fixture();
    const lease = await store.publish(key(), first);
    lease!.release();
    for (const item of [
      { ...keyInput, actorKey: "someone-else" },
      { ...keyInput, projectId: "another-project" },
      { ...keyInput, dependencyFingerprint: "different-lock" },
      { ...keyInput, command: ["pnpm", "install"] },
      { ...keyInput, imageId: `sha256:${"b".repeat(64)}` },
      { ...keyInput, installPolicyFingerprint: "install-policy-v2" },
    ]) expect(await store.acquire(previewDependencyLayerKey(item))).toBeNull();
  });

  it("accepts safe relative pnpm links reached via a workspace path alias", async () => {
    const { root, first, store } = await fixture();
    await fs.symlink(path.basename(first), path.join(root, "alias"));
    const lease = await store.publish(key(), path.join(root, "alias"));
    expect(lease).not.toBeNull();
    lease!.release();
  });

  it("detaches pnpm-style external hardlinks once and never shares their inode", async () => {
    const { root, first, store } = await fixture();
    const outside = path.join(root, "shared.js");
    await fs.writeFile(outside, "original external content");
    await fs.link(outside, path.join(first, "node_modules", "hardlink.js"));
    const lease = await store.publish(key(), first);
    expect(lease).not.toBeNull();
    const detached = path.join(lease!.nodeModulesDir, "hardlink.js");
    expect((await fs.stat(detached)).ino).not.toBe((await fs.stat(outside)).ino);
    await fs.writeFile(outside, "externally mutated");
    expect(await fs.readFile(detached, "utf8")).toBe("original external content");
    lease!.release();
    const restarted = new PreviewDependencyLayerStore(root);
    const again = await restarted.acquire(key());
    expect(again).not.toBeNull();
    again!.release();
  });

  it("preserves executable mode and relative symlink while detaching internal hardlinks", async () => {
    const {first, store} = await fixture();
    const source = path.join(first, "node_modules");
    await fs.writeFile(path.join(source, "executable"), "#!/bin/sh\n", {mode:0o751});
    // Creation modes are masked by the installer's restrictive umask (077).
    await fs.chmod(path.join(source, "executable"), 0o751);
    expect((await fs.stat(path.join(source, "executable"))).mode & 0o777).toBe(0o751);
    await fs.link(path.join(source, "executable"), path.join(source, "another"));
    await fs.symlink("executable", path.join(source, "link"));
    const lease = await store.publish(key(), first);
    expect(lease).not.toBeNull();
    try {
      const a = await fs.stat(path.join(lease!.nodeModulesDir, "executable"));
      const b = await fs.stat(path.join(lease!.nodeModulesDir, "another"));
      const original = await fs.stat(path.join(source, "executable"));
      expect(a.mode & 0o777).toBe(0o751);
      expect(b.mode & 0o777).toBe(0o751);
      expect(original.mode & 0o777).toBe(0o751);
      expect(a.nlink).toBe(1);
      expect(b.nlink).toBe(1);
      expect(a.ino).not.toBe(b.ino);
      expect(a.ino).not.toBe(original.ino);
      expect(await fs.readlink(path.join(lease!.nodeModulesDir, "link"))).toBe("executable");
      await fs.writeFile(path.join(source, "another"), "changed");
      expect(await fs.readFile(path.join(lease!.nodeModulesDir, "executable"), "utf8")).toBe("#!/bin/sh\n");
    } finally { lease?.release(); }
    const verified = await store.acquire(key());
    expect(verified).not.toBeNull();
    verified?.release();
  });

  it("does not modify the rootless-installed source or require mkdir permission inside it", async () => {
    const { first, store } = await fixture();
    const original = path.join(first, "node_modules");
    await fs.chmod(original, 0o555);
    let lease: Awaited<ReturnType<PreviewDependencyLayerStore["publish"]>> = null;
    try {
      lease = await store.publish(key(), first);
      expect(lease).not.toBeNull();
      // Publication may change modes on its PRIVATE detached copy only.
      expect((await fs.stat(original)).mode & 0o777).toBe(0o555);
      expect(await fs.lstat(path.join(original, ".vite")).catch(() => null)).toBeNull();
      expect((await fs.lstat(path.join(lease!.nodeModulesDir, ".vite"))).isDirectory()).toBe(true);
      expect((await fs.stat(lease!.nodeModulesDir)).mode & 0o200).toBe(0o200);
    } finally {
      lease?.release();
      // Test teardown must not leave a 0555 source directory on macOS.
      await fs.chmod(original, 0o755);
    }
  });

  it("keeps private source intact and reports bounded skip reasons on invalid trees", async () => {
    const { root, first, store } = await fixture();
    await fs.symlink("/etc/passwd", path.join(first, "node_modules", "escape"));
    const lease = await store.publish(key(), first);
    expect(lease).toBeNull();
    expect((await fs.lstat(path.join(first, "node_modules"))).isDirectory()).toBe(true);
    expect(await fs.readdir(path.join(root, ".zoebuild-preview-dependency-layers-v1")))
      .not.toContain(key());
  });

  it("passes the former 256 MiB item limit while retaining disk-headroom protection", async () => {
    const { first, root } = await fixture();
    const large = await fs.open(path.join(first, "node_modules", "within-new-cap.bin"), "w");
    // Sparse file: metadata-only attestation tests the boundary without copying
    // or hashing hundreds of MiB of data in CI.
    try { await large.truncate(256 * 1024 * 1024 + 1); }
    finally { await large.close(); }
    const store = new PreviewDependencyLayerStore(root, {
      reserveCapacity: async () => { throw new Error("disk reservation denied"); },
    });
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    expect(await store.publish(key(), first)).toBeNull();
    // The tree passes the item cap and reaches the next independent safeguard.
    expect(info).toHaveBeenCalledWith(
      "RUNNER React preview dependency layer publication",
      { result: "skipped", reason: "disk-headroom" },
    );
    expect(store.snapshot()).toMatchObject({ publishAttempts: 1, publishSkipped: 1 });
  });

  it("rejects a tree above the bounded 640 MiB cap before copying it", async () => {
    const { first, store } = await fixture();
    const oversized = await fs.open(path.join(first, "node_modules", "oversized.bin"), "w");
    try { await oversized.truncate(640 * 1024 * 1024 + 1); }
    finally { await oversized.close(); }
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    expect(await store.publish(key(), first)).toBeNull();
    expect(info).toHaveBeenCalledWith(
      "RUNNER React preview dependency layer publication",
      { result: "skipped", reason: "source-tree-byte-limit" },
    );
    expect(store.snapshot()).toMatchObject({ publishAttempts: 1, publishSkipped: 1 });
  });

  it("rejects a symlink workspace dependency root", async () => {
    const { root, first, store } = await fixture();
    await fs.rename(path.join(first, "node_modules"), path.join(root, "modules"));
    await fs.symlink(path.join(root, "modules"), path.join(first, "node_modules"));
    expect(await store.publish(key(), first)).toBeNull();
  });

  it("a layer only exports its node_modules as an explicit read-only bind", async () => {
    const { root, first, store } = await fixture();
    const lease = await store.publish(key(), first);
    expect(lease!.nodeModulesDir).toContain("/.zoebuild-preview-dependency-layers-v1/");
    expect(PreviewDependencyLayerStore.bind(lease!)).not.toContain(":rw");
    expect(PreviewDependencyLayerStore.bind(lease!)).not.toContain("docker.sock");
    expect(PreviewDependencyLayerStore.bind(lease!)).not.toBe(`${root}:/workspace:ro`);
    lease!.release();
  });

  it("rejects expired layers and reports corrupt content distinctly", async () => {
    let now = 10_000_000_000;
    const { first, root } = await fixture();
    const store = new PreviewDependencyLayerStore(root, { now: () => now });
    const lease = await store.publish(key(), first);
    lease!.release();
    now += 24 * 60 * 60_000 + 1;
    expect((await store.lookup(key())).outcome).toBe("rejected");
    now -= 24 * 60 * 60_000 + 1;
    await fs.appendFile(path.join(lease!.nodeModulesDir, "foo", "index.js"), "tamper");
    expect((await store.lookup(key())).outcome).toBe("corrupt");
    expect(store.snapshot()).toMatchObject({ rejected: 1, corrupt: 1 });
  });

  it("falls back without publishing when prospective disk headroom is unavailable", async () => {
    const { first, root } = await fixture();
    const store = new PreviewDependencyLayerStore(root, {
      reserveCapacity: async () => { throw new Error("disk reserve unavailable"); },
    });
    expect(await store.publish(key(), first)).toBeNull();
    expect((await fs.lstat(path.join(first, "node_modules"))).isDirectory()).toBe(true);
    expect(store.snapshot()).toMatchObject({ publishAttempts: 1, publishSkipped: 1 });
  });

  it("atomically resolves concurrent identical publications", async () => {
    const { first, root, store } = await fixture();
    const results = await Promise.all([
      store.publish(key(), first),
      store.publish(key(), first),
      store.publish(key(), first),
    ]);
    expect(results.filter(Boolean).length).toBeGreaterThanOrEqual(1);
    for (const lease of results) lease?.release();
    const entries = (await fs.readdir(path.join(root, ".zoebuild-preview-dependency-layers-v1")))
      .filter(name => /^[a-f0-9]{64}$/.test(name));
    expect(entries).toEqual([key()]);
    const acquired = await store.acquire(key());
    expect(acquired).not.toBeNull();
    acquired!.release();
  });

  it("evicts deterministically without removing a leased layer", async () => {
    let now = 20_000_000_000;
    const { first, root } = await fixture();
    const store = new PreviewDependencyLayerStore(root, { now: () => now });
    let held: Awaited<ReturnType<PreviewDependencyLayerStore["publish"]>> = null;
    const keys: string[] = [];
    for (let i = 0; i < 24; i++) {
      const itemKey = previewDependencyLayerKey({
        ...keyInput, dependencyFingerprint: `dependencies-${String(i).padStart(2, "0")}`,
      });
      keys.push(itemKey);
      const lease = await store.publish(itemKey, first);
      expect(lease).not.toBeNull();
      if (i === 0) held = lease;
      else lease!.release();
      now += 1;
    }
    now += 76 * 60_000;
    const newest = previewDependencyLayerKey({ ...keyInput, dependencyFingerprint: "dependencies-24" });
    const added = await store.publish(newest, first);
    expect(added).not.toBeNull();
    const remaining = await fs.readdir(path.join(root, ".zoebuild-preview-dependency-layers-v1"));
    expect(remaining).toContain(keys[0]);
    expect(remaining).not.toContain(keys[1]);
    expect(remaining).toContain(newest);
    added!.release();
    held!.release();
  }, 30_000);

  it("cleans only old incomplete staging directories during a later publication", async () => {
    const { first, root } = await fixture();
    const storeRoot = path.join(root, ".zoebuild-preview-dependency-layers-v1");
    await fs.mkdir(storeRoot);
    const abandoned = path.join(storeRoot, ".pending-11111111-1111-1111-1111-111111111111");
    await fs.mkdir(abandoned);
    const old = new Date(Date.now() - 2 * 60 * 60_000);
    await fs.utimes(abandoned, old, old);
    const store = new PreviewDependencyLayerStore(root);
    const lease = await store.publish(key(), first);
    expect(lease).not.toBeNull();
    expect(await fs.lstat(abandoned).catch(() => null)).toBeNull();
    lease!.release();
  });
});


describe("H10S1 full-byte worker attestation", () => {
  it("coalesces overlapping exact-key scans but never caches a completed attestation",async()=>{
    const {first,store}=await fixture();
    const published=(await store.publish(key(),first))!;published.release();
    const internal=store as unknown as {verified(key:string):Promise<unknown>};
    const original=internal.verified.bind(store);
    let release!:()=>void;
    const gate=new Promise<void>(resolve=>{release=resolve;});
    let calls=0;
    vi.spyOn(internal,"verified").mockImplementation(async candidate=>{
      calls++;await gate;return original(candidate);
    });
    const one=store.lookup(key());
    const two=store.lookup(key());
    await vi.waitFor(()=>expect(calls).toBe(1));
    release();
    const results=await Promise.all([one,two]);
    expect(results.map(result=>result.outcome)).toEqual(["hit","hit"]);
    results.forEach(result=>result.lease?.release());
    const target=path.join(published.nodeModulesDir,"foo","index.js");
    await fs.writeFile(target,"tampered after shared verification");
    expect((await store.lookup(key())).outcome).toBe("corrupt");
    expect(calls).toBe(2);
  });

  it("pins all overlapping verification waiters and releases pins after failure",async()=>{
    const {first,store}=await fixture();
    const published=(await store.publish(key(),first))!;published.release();
    const internal=store as unknown as {verified(key:string):Promise<unknown>;remove(key:string):Promise<boolean>};
    let fail!:(error:Error)=>void;
    const spy=vi.spyOn(internal,"verified").mockImplementationOnce(()=>new Promise((_resolve,reject)=>{fail=reject;}));
    const one=store.lookup(key()); const two=store.lookup(key());
    const results=Promise.allSettled([one,two]);
    await vi.waitFor(()=>expect(spy).toHaveBeenCalledTimes(1));
    // Wait for both callers to pin the key before rejecting the common flight.
    const pins=store as unknown as {verifying:Map<string,number>};
    await vi.waitFor(()=>expect(pins.verifying.get(key())).toBe(2));
    expect(await internal.remove(key())).toBe(false);
    fail(Error("test verification failed"));
    expect((await results).map(r=>r.status)).toEqual(["rejected","rejected"]);
    const again=await store.lookup(key());
    expect(again.outcome).toBe("hit");
    again.lease?.release();
    expect(await internal.remove(key())).toBe(true);
  });
  it("rejects same-length tampering even when the original mtime is restored", async () => {
    const { first, store } = await fixture();
    const lease = (await store.publish(key(), first))!;
    const target = path.join(lease.nodeModulesDir, "foo", "index.js");
    const original = await fs.stat(target);
    lease.release();
    await fs.writeFile(target, "export default 999");
    await fs.utimes(target, original.atime, original.mtime);
    expect((await store.lookup(key())).outcome).toBe("corrupt");
  });

  it("rejects an external hardlink and an executable mode change after publication", async () => {
    const { root, first, store } = await fixture();
    const lease = (await store.publish(key(), first))!;
    const target = path.join(lease.nodeModulesDir, "foo", "index.js");
    lease.release();
    const original = await fs.stat(target);
    const external = path.join(root, "external.js");
    await fs.link(target, external);
    expect((await store.lookup(key())).outcome).toBe("corrupt");
    await fs.unlink(external);
    await fs.chmod(target, (original.mode & 0o777) ^ 0o100);
    expect((await store.lookup(key())).outcome).toBe("corrupt");
  });

  it("holds a verification pin until a successful lookup becomes a lease", async () => {
    const { first, store } = await fixture();
    const lease = (await store.publish(key(), first))!;
    lease.release();
    // Delay only manifest reading in the trusted store, not any worker bytes.
    const internal = store as unknown as {
      manifest(key: string): Promise<unknown>;
      remove(key: string): Promise<boolean>;
    };
    const original = internal.manifest.bind(store);
    let resume!: () => void;
    let entered!: () => void;
    const blocked = new Promise<void>(resolve => { resume = resolve; });
    const reading = new Promise<void>(resolve => { entered = resolve; });
    vi.spyOn(internal, "manifest").mockImplementation(async k => {
      entered(); await blocked; return original(k);
    });
    const pending = store.lookup(key());
    await reading;
    try { expect(await internal.remove(key())).toBe(false); }
    finally { resume(); }
    const result = await pending;
    expect(result.outcome).toBe("hit");
    expect(await internal.remove(key())).toBe(false);
    result.lease?.release();
    expect(await internal.remove(key())).toBe(true);
  });
});

// Mock only the kernel boundary. These tests exercise real store publication,
// manifests, leases and verification selection; Linux ioctl tests are separate.
describe("PS7C4 versioned dependency integrity", () => {
  const schema = "zoebuild-preview-dependency-layer-verity-v2";
  const tree = { digest: "a".repeat(64), bytes: 18, files: 8 };
  async function enabledFixture() {
    vi.stubEnv("RUNNER_EXECUTION_POOL", "zoebuild");
    vi.stubEnv("ZOEBUILD_DEPENDENCY_VERITY_PUBLISH_ENABLED", "1");
    const helper = await import("./previewDependencyVerity.js");
    const spy = vi.spyOn(helper, "attestVerityTree");
    return { ...await fixture(), spy };
  }
  afterEach(() => vi.unstubAllEnvs());

  it("publishes v2 and verifies it after restart even with publication disabled", async () => {
    const { root, first, store, spy } = await enabledFixture();
    spy.mockResolvedValue({ status: "ok", tree });
    const lease = await store.publish(key(), first);
    expect(lease).not.toBeNull();
    lease!.release();
    const manifest = JSON.parse(await fs.readFile(path.join(path.dirname(lease!.nodeModulesDir), "manifest.json"), "utf8"));
    expect(manifest).toMatchObject({ schema, key: key(), ...tree });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining(".pending-"), key(), "seal");
    vi.stubEnv("ZOEBUILD_DEPENDENCY_VERITY_PUBLISH_ENABLED", "0");
    const restarted = new PreviewDependencyLayerStore(root);
    const result = await restarted.lookup(key());
    expect(result.outcome).toBe("hit");
    expect(spy).toHaveBeenLastCalledWith(lease!.nodeModulesDir, key(), "verify");
    result.lease?.release();
    spy.mockResolvedValue({ status: "unsupported" });
    expect(await restarted.lookup(key())).toMatchObject({ outcome: "corrupt", lease: null });
    spy.mockResolvedValue({ status: "invalid" });
    expect(await restarted.lookup(key())).toMatchObject({ outcome: "corrupt", lease: null });
    spy.mockResolvedValue({ status: "ok", tree: { ...tree, digest: "b".repeat(64) } });
    expect(await restarted.lookup(key())).toMatchObject({ outcome: "corrupt", lease: null });
  });

  it("falls back to v1 only when sealing capability is unsupported", async () => {
    const { first, store, spy } = await enabledFixture();
    spy.mockResolvedValue({ status: "unsupported" });
    const lease = await store.publish(key(), first);
    expect(lease).not.toBeNull();
    const manifest = JSON.parse(await fs.readFile(path.join(path.dirname(lease!.nodeModulesDir), "manifest.json"), "utf8"));
    expect(manifest.schema).toBe("zoebuild-preview-dependency-layer-v1");
    lease!.release();
    const result = await store.lookup(key());
    expect(result.outcome).toBe("hit");
    result.lease?.release();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("rejects failed sealing without publishing legacy bytes", async () => {
    const { root, first, store, spy } = await enabledFixture();
    spy.mockResolvedValue({ status: "invalid" });
    expect(await store.publish(key(), first)).toBeNull();
    expect(await fs.readdir(path.join(root, ".zoebuild-preview-dependency-layers-v1"))).toEqual([]);
  });

  it("does not enable sealing for the Learning pool", async () => {
    const { root, first, spy } = await enabledFixture();
    vi.stubEnv("RUNNER_EXECUTION_POOL", "learning");
    const store = new PreviewDependencyLayerStore(root);
    const lease = await store.publish(key(), first);
    expect(lease).not.toBeNull();
    expect(spy).not.toHaveBeenCalled();
    lease!.release();
  });
});
