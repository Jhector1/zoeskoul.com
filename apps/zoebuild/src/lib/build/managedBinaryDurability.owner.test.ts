import {describe, expect, it} from "vitest";
import {readFileSync} from "node:fs";
import {join} from "node:path";
const source = (file:string) => readFileSync(join(import.meta.dirname,file),"utf8");

describe("AI4B4E2C durable storage admission source ownership",()=>{
 it("journals R2 object intent before the PUT and requires a real PNG decoder",()=>{
  const code=source("managedBinaryUploadJournal.ts");
  expect(code.indexOf("tx.buildManagedBinaryUploadIntent.create(")).toBeGreaterThan(-1);
  expect(code.indexOf("tx.buildManagedBinaryUploadIntent.create(")).toBeLessThan(code.indexOf("store.putIfAbsent("));
  expect(code).toContain("await input.inspectPng(bytes)");
  expect(code).toContain("request.mimeType !== \"image/png\"");
  expect(code).not.toContain("NEXT_PUBLIC_");
 });
 it("writes source CAS, history, private manifest, and uploads inside one transaction",()=>{
  const code=source("prismaManagedBinaryPort.ts");
  expect(code).toContain("client.$transaction(async tx => {");
  expect(code).toContain("tx.codeProject.updateMany(");
  expect(code).toContain("tx.codeProjectRevision.create(");
  expect(code).toContain("tx.buildManagedBinaryRevision.create(");
  expect(code).toContain("tx.buildManagedBinaryUploadIntent.updateMany(");
  expect(code).toContain("Prisma.TransactionIsolationLevel.Serializable");
 });
 it("does not modify existing live source or R2 media routes",()=>{
  const code=source("prismaManagedBinaryPort.ts")+source("managedBinaryUploadJournal.ts");
  expect(code).not.toContain("NextResponse");
  expect(code).not.toContain("export async function PATCH(");
  expect(code).not.toContain("export async function POST(");
 });
});

 it("reserves all upload intents under a Serializable transaction before object I/O",()=>{
  const code=source("managedBinaryUploadJournal.ts");
  expect(code).toContain("await requireOwner(tx)");
  expect(code.match(/tx\.buildManagedBinaryUploadIntent\.aggregate/g)).toHaveLength(2);
  expect(code.indexOf("assertManagedBinaryStorageBudget({")).toBeLessThan(code.indexOf("tx.buildManagedBinaryUploadIntent.create("));
  expect(code.indexOf("Prisma.TransactionIsolationLevel.Serializable")).toBeLessThan(code.indexOf("store.putIfAbsent("));
 });
 it("protects pending and committed objects from hard project deletion",()=>{
  const code=source("deleteOwnedBuildProject.ts");
  expect(code).toContain("tx.buildManagedBinaryRevision.count");
  expect(code).toContain("tx.buildManagedBinaryUploadIntent.count");
  expect(code).toContain("hasExternalResources: managedRevisions > 0 || managedIntents > 0");
 });
