/**
 * AI4B4E2E: REAL Prisma data-port integration in a dedicated, ephemeral PostgreSQL
 * database. This file is disabled during normal test runs and MUST NEVER run
 * against the application DB. The runner seeds only its private test DB.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";
import type { ManagedBinaryRevision } from "./managedBinaryRevision";
import type { ManagedBinaryAtomicSourcePort } from "./managedBinaryCommit";

// This test runs in Node, not the Next.js server renderer.
vi.mock("server-only", () => ({}));

const expected = process.env.AI4B4E2E_TEST_DATABASE_NAME ?? "";
const enabled = /^zoebuild_ai4b4e2e_test_[0-9a-f]{12}$/.test(expected) &&
  process.env.AI4B4E2E_CONFIRM === "EPHEMERAL_ONLY";

const png = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
  0, 0, 0, 1, 0, 0, 0, 1,
]);
const sha = createHash("sha256").update(png).digest("hex");
const imageData = Buffer.from(png).toString("base64");
const owner = "ai4b4e2e_owner_12345";
const attacker = "ai4b4e2e_attacker_12345";
const assetName = "hero.png";
const imageId = "ai4b4e2e_image_node";

function workspace(): WorkspaceStateV2 {
  return {
    version: 2, language: "web", stdin: "", expanded: [], leftPct: 30,
    openTabs: ["ai4b4e2e_index_node", imageId],
    entryFileId: "ai4b4e2e_index_node", activeFileId: imageId,
    nodes: [
      { id: "ai4b4e2e_index_node", kind: "file", name: "index.tsx", parentId: null,
        content: "export default function Page() { return 'AI4B4E2E'; }", createdAt: 1, updatedAt: 1 },
      { id: "ai4b4e2e_public", kind: "folder", name: "public", parentId: null, createdAt: 1, updatedAt: 1 },
      { id: "ai4b4e2e_assets", kind: "folder", name: "assets", parentId: "ai4b4e2e_public", createdAt: 1, updatedAt: 1 },
      { id: "ai4b4e2e_images", kind: "folder", name: "images", parentId: "ai4b4e2e_assets", createdAt: 1, updatedAt: 1 },
      { id: imageId, kind: "file", name: assetName, parentId: "ai4b4e2e_images",
        content: "", createdAt: 1, updatedAt: 1,
        binary: { encoding: "base64", data: imageData, mimeType: "image/png", sizeBytes: png.length } },
    ],
  } as WorkspaceStateV2;
}

type Port = ManagedBinaryAtomicSourcePort<WorkspaceStateV2>;
type PrismaType = typeof import("@zoeskoul/platform-server/prisma")["prisma"];
let prisma: PrismaType;
let port: Port;
let strip: typeof import("./managedBinaryWorkspace")["stripVerifiedManagedBinaryWorkspace"];
let load: typeof import("./managedBinaryCommit")["loadHydratedManagedBinaryRevision"];
let successFixture: Awaited<ReturnType<typeof addProject>>;

async function addProject(projectSuffix: string) {
  const buildProjectId = `ai4b4e2e_build_${projectSuffix}`;
  const codeProjectId = `ai4b4e2e_code_${projectSuffix}`;
  await prisma.codeProject.create({ data: {
    id: codeProjectId, ownerId: owner, title: "AI4B4E2E isolated fixture",
    language: "web", workspace: JSON.parse(JSON.stringify(workspace())), currentVersion: 1,
    entryPath: "index.tsx", activePath: "public/assets/images/hero.png",
  } });
  await prisma.buildProject.create({ data: { id: buildProjectId, codeProjectId } });
  await prisma.codeProjectRevision.create({ data: {
    projectId: codeProjectId, version: 1, snapshot: JSON.parse(JSON.stringify(workspace())), createdById: owner,
  } });
  const assetId = `asset_ai4b4e2e_${projectSuffix}`;
  const key = `project-media/${owner}/${buildProjectId}/${assetId}/${sha}`;
  const scope = { ownerId: owner, buildProjectId };
  const revision: ManagedBinaryRevision = { ...scope, sourceVersion: 2, bindings: [
    { ...scope, nodeId: imageId, path: "public/assets/images/hero.png", assetId,
      objectKey: key, sha256: sha, mimeType: "image/png", byteLength: png.length },
  ] };
  await prisma.buildManagedBinaryUploadIntent.create({ data: {
    assetId, buildProjectId, ownerId: owner, plannedBaseVersion: 1,
    objectKey: key, sha256: sha, mimeType: "image/png", byteLength: png.length,
    state: "uploaded",
  } });
  const snapshot = await strip({ scope, revision, sourceVersion: 2, workspace: workspace() });
  return { scope, revision, snapshot, codeProjectId, assetId, key };
}

function prepared(fixture: Awaited<ReturnType<typeof addProject>>) {
  return { scope: fixture.scope, expectedBaseVersion: 1,
    sourceVersion: 2, snapshot: fixture.snapshot, revision: fixture.revision };
}

describe.skipIf(!enabled)("AI4B4E2E actual Prisma transaction against isolated temporary PostgreSQL", () => {
  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? "";
    const uri = new URL(url);
    if (uri.hostname !== "127.0.0.1" || uri.port !== "55432" ||
        decodeURIComponent(uri.pathname.slice(1)) !== expected) {
      throw Error("AI4B4E2E_UNSAFE_DATABASE_URL");
    }
    ({ prisma } = await import("@zoeskoul/platform-server/prisma"));
    // SELECT-only identity check before any database write through Prisma.
    const actual = await prisma.$queryRaw<Array<{ database: string; is_standby: boolean }>>`
      SELECT current_database()::text AS database, pg_is_in_recovery() AS is_standby`;
    if (actual.length !== 1 || actual[0]?.database !== expected || actual[0]?.is_standby !== false) {
      throw Error("AI4B4E2E_CONNECTED_DATABASE_IDENTITY_MISMATCH");
    }
    const nonce = process.env.AI4B4E2E_TEST_NONCE ?? "";
    if (!/^[0-9a-f]{32}$/.test(nonce)) throw Error("AI4B4E2E_TEST_NONCE_INVALID");
    const guard = await prisma.$queryRaw<Array<{ nonce: string }>>`
      SELECT "nonce" FROM "__ai4b4e2e_guard" LIMIT 2`;
    if (guard.length !== 1 || guard[0]?.nonce !== nonce) {
      throw Error("AI4B4E2E_EPHEMERAL_DATABASE_MARKER_INVALID");
    }
    await prisma.$executeRaw`INSERT INTO "User"("id") VALUES (${owner})`;
    const module = await import("./prismaManagedBinaryPort");
    port = module.createPrismaManagedBinaryPort(prisma);
    ({ stripVerifiedManagedBinaryWorkspace: strip } = await import("./managedBinaryWorkspace"));
    ({ loadHydratedManagedBinaryRevision: load } = await import("./managedBinaryCommit"));
  }, 20000);

  afterAll(async () => { if (prisma) await prisma.$disconnect(); });

  it("atomically writes version 2, immutable source history, private manifest, and upload state", async () => {
    const fixture = await addProject("success");
    successFixture = fixture;
    const result = await port.commitOwnedRevision(prepared(fixture));
    expect(result).toEqual({ kind: "committed", sourceVersion: 2 });
    const code = await prisma.codeProject.findUniqueOrThrow({ where: { id: fixture.codeProjectId } });
    expect(code.currentVersion).toBe(2);
    expect(JSON.stringify(code.workspace)).not.toContain(imageData);
    const history = await prisma.codeProjectRevision.findUniqueOrThrow({
      where: { projectId_version: { projectId: fixture.codeProjectId, version: 2 } },
    });
    expect(JSON.stringify(history.snapshot)).not.toContain(imageData);
    const manifest = await prisma.buildManagedBinaryRevision.findUniqueOrThrow({
      where: { buildProjectId_sourceVersion: { buildProjectId: fixture.scope.buildProjectId, sourceVersion: 2 } },
    });
    expect(manifest.ownerId).toBe(owner);
    const intent = await prisma.buildManagedBinaryUploadIntent.findUniqueOrThrow({ where: { assetId: fixture.assetId } });
    expect(intent.state).toBe("committed");
    const loaded = await load({ scope: fixture.scope, sourceVersion: 2, port,
      readObject: async key => key === fixture.key ? Uint8Array.from(png) : null });
    const image = loaded?.nodes.find(node => node.id === imageId);
    expect(image?.kind).toBe("file");
    if (!image || image.kind !== "file") throw Error("HYDRATED_IMAGE_MISSING");
    expect(image.binary?.data).toBe(imageData);
    expect(image.binary?.checksum).toBe(`sha256:${sha}`);
  }, 20000);

  it("keeps historical inline revisions readable and denies cross-owner reads", async () => {
    const scope = { ownerId: owner, buildProjectId: "ai4b4e2e_build_success" };
    const legacy = await port.readOwnedRevision({ scope, sourceVersion: 1 });
    expect(legacy?.kind).toBe("legacy");
    const wrong = await port.readOwnedRevision({ scope: { ...scope, ownerId: attacker }, sourceVersion: 2 });
    expect(wrong).toBeNull();
    const conflict = await port.commitOwnedRevision(prepared(successFixture));
    expect(conflict.kind).toBe("conflict");
  });

  it("rolls back source-head CAS and history when manifest insertion fails", async () => {
    const fixture = await addProject("rollback");
    await prisma.buildManagedBinaryRevision.create({ data: {
      buildProjectId: fixture.scope.buildProjectId, sourceVersion: 2, ownerId: owner,
      manifest: JSON.parse(JSON.stringify({ ...fixture.revision, bindings: [] })),
    } });
    await expect(port.commitOwnedRevision(prepared(fixture))).rejects.toThrow();
    const code = await prisma.codeProject.findUniqueOrThrow({ where: { id: fixture.codeProjectId } });
    expect(code.currentVersion).toBe(1);
    const history = await prisma.codeProjectRevision.findUnique({
      where: { projectId_version: { projectId: fixture.codeProjectId, version: 2 } },
    });
    expect(history).toBeNull();
    const intent = await prisma.buildManagedBinaryUploadIntent.findUniqueOrThrow({ where: { assetId: fixture.assetId } });
    expect(intent.state).toBe("uploaded");
  }, 20000);

  it("rejects another owner's source commit without changing that project", async () => {
    const fixture = await addProject("owner_guard");
    await expect(port.commitOwnedRevision({ ...prepared(fixture),
      scope: { ...fixture.scope, ownerId: attacker },
    })).rejects.toThrow();
    const code = await prisma.codeProject.findUniqueOrThrow({ where: { id: fixture.codeProjectId } });
    expect(code.currentVersion).toBe(1);
  });
});
