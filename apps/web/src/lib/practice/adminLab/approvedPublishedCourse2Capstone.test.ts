import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

const mock = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/curriculum/resolveTopicBundleManifest", () => ({
  resolveTopicBundleManifest: mock.resolve,
}));
import {
  course2PublishedTopicDigest,
  isCurrentApprovedCourse2FinalInstance,
  resolveApprovedCourse2PrivateExpected,
} from "./approvedPublishedCourse2Capstone";
import {course2FinalFilesystemExpected} from "../api/validate/grade/adminLabFilesystemEvidencePolicy";

const ENV = "ZOESKOUL_LEARNING_COURSE2_FINAL_APPROVED_TOPIC_SHA256";
const exercise = {
  id: "final-capstone-secure-project-step-5", kind: "code_input", language: "bash",
  recipe: {type: "shell_task", mode: "terminal_workspace"}, messageBase: "test.final.capstone",
};
const bundle = {
  topicId: "final-capstone-secure-project", subjectSlug: "linux-files-permissions-users",
  moduleSlug: "linux-module-4-secure-project-capstone",
  serviceDefaults: {administratorLab: "eligible"}, exercises: [exercise],
};
const args = {topicBundle: bundle, manifestExercise: exercise, exerciseKey: exercise.id};
const instance = (sha: string, extras: Record<string, unknown> = {}) => ({
  exerciseKey: exercise.id,
  topic: {slug: bundle.topicId, subjectId: "subject-1",
    subject: {slug: bundle.subjectSlug},
    module: {slug: bundle.moduleSlug, subject: {slug: bundle.subjectSlug, id: "subject-1"}}},
  secretPayload: {expected: {kind: "code_input", adminLabFilesystemExpectations: course2FinalFilesystemExpected(),
    adminLabPublishedTopicSha256: sha, ...extras}},
});
const previous = process.env[ENV];
beforeEach(() => { delete process.env[ENV]; mock.resolve.mockReset(); mock.resolve.mockReturnValue(bundle); });
afterEach(() => { if (previous === undefined) delete process.env[ENV]; else process.env[ENV] = previous; });

describe("published Course 2 private final-step approval", () => {
  it("stays disabled before explicit approval and for any different digest", () => {
    expect(resolveApprovedCourse2PrivateExpected(args)).toBeNull();
    process.env[ENV] = "0".repeat(64);
    expect(resolveApprovedCourse2PrivateExpected(args)).toBeNull();
    expect(isCurrentApprovedCourse2FinalInstance(instance("0".repeat(64)))).toBe(false);
  });
  it("injects the seven-path contract only for an exactly pinned compiled bundle", () => {
    const sha = course2PublishedTopicDigest(bundle);
    process.env[ENV] = sha;
    const approved = resolveApprovedCourse2PrivateExpected(args);
    expect(approved?.digest).toBe(sha);
    expect(approved?.privateExpected.adminLabFilesystemExpectations.required).toHaveLength(7);
    expect(isCurrentApprovedCourse2FinalInstance(instance(sha))).toBe(true);
    expect(isCurrentApprovedCourse2FinalInstance(instance(sha, {terminalExpectations: {requiredCommands: []}}))).toBe(false);
    expect(isCurrentApprovedCourse2FinalInstance(instance("0".repeat(64)))).toBe(false);
  });
  it("denies modified compiled topic versions and old persisted instances", () => {
    const sha = course2PublishedTopicDigest(bundle);
    process.env[ENV] = sha;
    const modified = {...bundle, exercises: [{...exercise, messageBase: "changed.prompt"}]};
    expect(resolveApprovedCourse2PrivateExpected({topicBundle: modified, manifestExercise: modified.exercises[0],exerciseKey: exercise.id})).toBeNull();
    mock.resolve.mockReturnValue(modified);
    expect(isCurrentApprovedCourse2FinalInstance(instance(sha))).toBe(false);
  });
  it("denies mismatched scope, duplicate keys, non-shell recipes and competing graders", () => {
    process.env[ENV] = course2PublishedTopicDigest(bundle);
    expect(resolveApprovedCourse2PrivateExpected({...args, exerciseKey: "other"})).toBeNull();
    expect(resolveApprovedCourse2PrivateExpected({...args, topicBundle: {...bundle, subjectSlug: "linux-terminal-fundamentals"}})).toBeNull();
    expect(resolveApprovedCourse2PrivateExpected({...args, topicBundle: {...bundle, exercises: [exercise, exercise]}})).toBeNull();
    const competing = {...exercise, terminalExpectations: {requiredCommands: []}};
    expect(resolveApprovedCourse2PrivateExpected({...args, topicBundle: {...bundle, exercises: [competing]}, manifestExercise: competing})).toBeNull();
    const wrong = {...exercise, recipe: {type: "shell_task", mode: "stdout"}};
    expect(resolveApprovedCourse2PrivateExpected({...args, topicBundle: {...bundle, exercises: [wrong]}, manifestExercise: wrong})).toBeNull();
  });
  it("rejects incomplete or forged persisted private contracts", () => {
    const sha = course2PublishedTopicDigest(bundle);
    process.env[ENV] = sha;
    expect(isCurrentApprovedCourse2FinalInstance(instance(sha, {adminLabFilesystemExpectations: {required: []}}))).toBe(false);
    expect(isCurrentApprovedCourse2FinalInstance({...instance(sha), topic: {slug: "other", subject: {slug: bundle.subjectSlug}, module: {slug: bundle.moduleSlug}}})).toBe(false);
  });
  it("fingerprints object keys deterministically and detects content changes", () => {
    const reordered = {...bundle, moduleSlug: bundle.moduleSlug, topicId: bundle.topicId};
    expect(course2PublishedTopicDigest(reordered)).toBe(course2PublishedTopicDigest(bundle));
    expect(course2PublishedTopicDigest({...bundle, topicId: "other"})).not.toBe(course2PublishedTopicDigest(bundle));
  });
});
