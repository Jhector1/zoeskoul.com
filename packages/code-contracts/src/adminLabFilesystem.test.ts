import {describe, expect, it} from "vitest";
import {AdminLabFilesystemExpectedSchema} from "./adminLabFilesystem.js";
const valid = {required: [{path: "/workspace/project", kind: "directory", mode: "0750", uid: 0, gid: 1000}]};
describe("admin lab authoring contract", () => {
  it("allows bounded, authored POSIX metadata checks", () => {
    expect(AdminLabFilesystemExpectedSchema.parse(valid)).toEqual(valid);
  });
  it.each(["/etc/shadow", "/workspace/../etc", "/workspace//project", "/workspace/.lab-root-password", "/workspace/x/../../y", "/workspace/one/./two"])("rejects unsafe workspace path %s", path => {
    expect(AdminLabFilesystemExpectedSchema.safeParse({required: [{path, kind: "file", uid: 0}]}).success).toBe(false);
  });
  it("rejects unbounded, duplicate and malformed expectations", () => {
    expect(AdminLabFilesystemExpectedSchema.safeParse({required: Array(9).fill(valid.required[0])}).success).toBe(false);
    expect(AdminLabFilesystemExpectedSchema.safeParse({required: [valid.required[0], valid.required[0]]}).success).toBe(false);
    expect(AdminLabFilesystemExpectedSchema.safeParse({required: [{path: "/workspace/x", kind: "file", mode: "9999"}]}).success).toBe(false);
    expect(AdminLabFilesystemExpectedSchema.safeParse({required: [{path: "/workspace/x", kind: "file", uid: 0, shell: "id"}]}).success).toBe(false);
  });
});
