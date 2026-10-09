import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ resolveExercise: vi.fn(), resolveBundle: vi.fn(), getSqlDataset: vi.fn(), getTranslations: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@zoeskoul/curriculum-runtime/curriculum/resolveManifestExercise", () => ({ resolveManifestExercise: mocks.resolveExercise }));
vi.mock("@zoeskoul/curriculum-runtime/subjects/sql/sql/datasets", () => ({ getSqlDataset: mocks.getSqlDataset }));
vi.mock("@/lib/curriculum/resolveTopicBundleManifest", () => ({ resolveTopicBundleManifest: mocks.resolveBundle }));
vi.mock("next-intl/server", () => ({ getTranslations: mocks.getTranslations }));

let resolvePublicChallengeCopyContext: typeof import("./publicChallengeCopyContext").resolvePublicChallengeCopyContext;
const base = {
  id: "exercise", catalogSlug: "catalog", catalogTitle: "Catalog", subjectSlug: "subject", subjectTitle: "Subject",
  moduleSlug: "module", moduleTitle: "Module", sectionSlug: "section", sectionTitle: "Section", sectionRole: "lesson",
  topicSlug: "topic", topicTitle: "Topic", exerciseKey: "exercise", exerciseTitle: "Exercise", exercisePrompt: "Do the task.",
  exerciseKind: "code_input", exercisePurpose: "practice", isMultiFile: true, requiresTerminal: false, isStandaloneTryIt: false, releaseStatus: "active",
} as const;

beforeAll(async () => ({ resolvePublicChallengeCopyContext } = await import("./publicChallengeCopyContext")));
beforeEach(() => { vi.clearAllMocks(); mocks.getTranslations.mockResolvedValue(((key: string) => key) as any); });

describe("course-agnostic challenge context", () => {
  it("enriches SQL through the SQL adapter", async () => {
    mocks.resolveBundle.mockReturnValue({ runtimeDefaults: { kind: "sql", datasetId: "inventory_ops", fixedSqlDialect: "sqlite" } });
    mocks.resolveExercise.mockReturnValue({ kind: "code_input", purpose: "practice", language: "sql", prompt: "Use a preview SELECT before changing row `id = 5`, then set status to `active`.", runtime: { kind: "sql", datasetId: "inventory_ops", fixedSqlDialect: "sqlite" }, workspace: { language: "sql" }, recipe: { datasetId: "inventory_ops", checkSql: "SELECT id, name, status FROM inventory_items WHERE id = 5;", solutionCode: "UPDATE inventory_items SET status = 'active' WHERE id = 5;" } });
    mocks.getSqlDataset.mockReturnValue({ id: "inventory_ops", dialect: "sqlite", schemaSql: "CREATE TABLE inventory_items (id INTEGER, name TEXT, status TEXT);", tableSnapshots: { inventory_items: { name: "inventory_items", columns: [{ name: "id", type: "INTEGER" }, { name: "name", type: "TEXT" }, { name: "status", type: "TEXT" }], rows: [[5, "Water Bottle", "inactive"]], rowCount: 1 } } });
    const result = await resolvePublicChallengeCopyContext({ locale: "en", option: base });
    expect(JSON.stringify(result.resources)).toContain("inventory_items");
    expect(result.requiredFacts).toEqual(expect.arrayContaining(["SELECT", "UPDATE", "inventory_items", "id", "name", "status", "5", "active"]));
    expect(result.technicalFallbackLead).toBe("In the inventory_items table");
  });

  it("keeps Python on the generic path", async () => {
    mocks.resolveBundle.mockReturnValue({ runtimeDefaults: { kind: "python", language: "python" } });
    mocks.resolveExercise.mockReturnValue({ kind: "code_input", purpose: "practice", prompt: "Open `report.py`, update `format_name`, and handle 3 sample values.", runtime: { kind: "python" }, workspace: { language: "python", starterCode: "def format_name(value):\n    pass" }, recipe: {} });
    const result = await resolvePublicChallengeCopyContext({ locale: "en", option: { ...base, subjectSlug: "python-v2", subjectTitle: "Python" } });
    expect(result.runtimeKind).toBe("python");
    expect(result.resources).toEqual([]);
    expect(result.storyFrame.id).toBeTruthy();
    expect(mocks.getSqlDataset).not.toHaveBeenCalled();
  });

  it("varies story frames across exercise identities", async () => {
    mocks.resolveBundle.mockReturnValue({ runtimeDefaults: { kind: "python", language: "python" } });
    mocks.resolveExercise.mockReturnValue({ kind: "code_input", purpose: "practice", prompt: "Update `main.py` and verify 2 values.", runtime: { kind: "python" }, workspace: { language: "python" }, recipe: {} });
    const frames = new Set<string>();
    for (const exerciseKey of ["alpha", "beta", "gamma", "delta", "epsilon", "zeta"]) {
      const result = await resolvePublicChallengeCopyContext({ locale: "en", option: { ...base, id: exerciseKey, exerciseKey } });
      frames.add(result.storyFrame.id);
    }
    expect(frames.size).toBeGreaterThan(1);
  });
  it("prefers canonical exercise prompt over generic published option copy", async () => {
    mocks.resolveBundle.mockReturnValue({
      runtimeDefaults: { kind: "sql", datasetId: "inventory_ops", fixedSqlDialect: "sqlite" },
    });
    mocks.resolveExercise.mockReturnValue({
      kind: "code_input",
      purpose: "practice",
      language: "sql",
      prompt: "Use a preview SELECT before changing row `id = 5`, then set status to `active`.",
      runtime: { kind: "sql", datasetId: "inventory_ops", fixedSqlDialect: "sqlite" },
      workspace: { language: "sql" },
      recipe: {
        datasetId: "inventory_ops",
        checkSql: "SELECT id, name, status FROM inventory_items WHERE id = 5;",
        solutionCode: "UPDATE inventory_items SET status = 'active' WHERE id = 5;",
      },
    });
    mocks.getSqlDataset.mockReturnValue({
      id: "inventory_ops",
      dialect: "sqlite",
      schemaSql: "CREATE TABLE inventory_items (id INTEGER, name TEXT, status TEXT);",
      tableSnapshots: {
        inventory_items: {
          name: "inventory_items",
          columns: [
            { name: "id", type: "INTEGER" },
            { name: "name", type: "TEXT" },
            { name: "status", type: "TEXT" },
          ],
          rows: [[5, "Water Bottle", "inactive"]],
          rowCount: 1,
        },
      },
    });

    const result = await resolvePublicChallengeCopyContext({
      locale: "en",
      option: { ...base, exercisePrompt: "Do the task." },
    });

    expect(result.exercise.originalPrompt).toBe(
      "Use a preview SELECT before changing row `id = 5`, then set status to `active`.",
    );
    expect(result.requiredFacts).toEqual(
      expect.arrayContaining([
        "SELECT",
        "UPDATE",
        "inventory_items",
        "id",
        "name",
        "status",
        "5",
        "active",
      ]),
    );
  });

});
