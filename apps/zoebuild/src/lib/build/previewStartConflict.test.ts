import { describe,expect,it } from "vitest";
import { classifyPreviewRunnerFailure } from "./previewStartConflict";

describe("preview start conflict contract",()=>{
  it("distinguishes a newer admitted operation from other 409 contracts",()=>{
    expect(classifyPreviewRunnerFailure({status:409,code:"PREVIEW_NEWER_OPERATION"}))
      .toMatchObject({status:409,code:"BUILD_PREVIEW_NEWER_OPERATION",
        conflictCategory:"active_newer_operation"});
    expect(classifyPreviewRunnerFailure({status:409,code:"PREVIEW_SOURCE_CONFLICT"}))
      .toMatchObject({status:409,code:"BUILD_PREVIEW_SOURCE_CONFLICT",
        conflictCategory:"runner_source_conflict"});
  });

  it("keeps capacity and runner availability separate from source conflicts",()=>{
    expect(classifyPreviewRunnerFailure({status:429})).toMatchObject({
      status:429,code:"BUILD_PREVIEW_CAPACITY"});
    expect(classifyPreviewRunnerFailure({status:503})).toMatchObject({
      status:503,code:"BUILD_PREVIEW_RUNNER_UNAVAILABLE"});
    expect(classifyPreviewRunnerFailure({status:418})).toMatchObject({
      status:502,code:"BUILD_PREVIEW_RUNNER_UNAVAILABLE"});
  });
});
