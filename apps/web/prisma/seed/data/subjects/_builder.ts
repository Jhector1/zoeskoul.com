// prisma/seed/data/subjects/_builder.ts
import type {
  ModuleSeed,
  SectionDef,
  SectionSeed,
  SubjectSeed,
  TopicSeed,
} from "./_types";
import { ModuleMetaSchema } from "./_types";

function assertNonEmptyString(v: unknown, label: string) {
  if (typeof v !== "string" || !v.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }
}

function assertNoDot(v: string, label: string) {
  if (v.includes(".")) throw new Error(`${label} must NOT contain "." (got "${v}")`);
}

function assertUnique(values: string[], label: string) {
  const seen = new Set<string>();
  const dups: string[] = [];
  for (const v of values) {
    if (seen.has(v)) dups.push(v);
    seen.add(v);
  }
  if (dups.length) {
    throw new Error(`${label} contains duplicates: ${[...new Set(dups)].join(", ")}`);
  }
}

function assertOneOf<T extends string>(
    v: unknown,
    allowed: readonly T[],
    label: string,
) {
  if (v === undefined || v === null) return;
  if (typeof v !== "string" || !allowed.includes(v as T)) {
    throw new Error(`${label} must be one of: ${allowed.join(", ")} (got "${String(v)}")`);
  }
}

function assertNullableString(v: unknown, label: string) {
  if (v === undefined || v === null) return;
  if (typeof v !== "string") throw new Error(`${label} must be a string or null/undefined.`);
  if (!v.trim()) throw new Error(`${label} must be a non-empty string when provided.`);
}

export function defineSubject(input: {
  subject: SubjectSeed;
  modules: ModuleSeed[];
  topicGroups: SectionDef[];
}) {
  // -------------------------
  // Basic validation
  // -------------------------
  assertNonEmptyString(input.subject.slug, "subject.slug");
  assertUnique(input.modules.map((m) => m.slug), "modules[].slug");
  assertUnique(input.topicGroups.map((g) => g.section.slug), "topicGroups[].section.slug");

  // -------------------------
  // ✅ Subject access validation (optional fields)
  // -------------------------
  // SubjectSeed.accessPolicy?: "free" | "paid"
  assertOneOf(input.subject.accessPolicy, ["free", "paid"] as const, "subject.accessPolicy");
  assertNullableString(input.subject.entitlementKey, "subject.entitlementKey");
  assertOneOf(
      input.subject.status,
      ["active", "coming_soon", "disabled"] as const,
      "subject.status"
  );
  // -------------------------
  // ✅ Module meta + access validation
  // -------------------------
  for (const m of input.modules) {
    if (m.meta !== undefined) {
      const parsed = ModuleMetaSchema.safeParse(m.meta);
      if (!parsed.success) {
        throw new Error(`Invalid module meta for module "${m.slug}": ${parsed.error.message}`);
      }
    }

    // ModuleSeed.accessOverride?: "inherit" | "free" | "paid"
    assertOneOf(
        m.accessOverride,
        ["inherit", "free", "paid"] as const,
        `module.accessOverride for "${m.slug}"`,
    );
    assertNullableString(m.entitlementKey, `module.entitlementKey for "${m.slug}"`);
  }

  // -------------------------
  // Normalize topics + sections
  // -------------------------
  const allTopics: TopicSeed[] = [];
  const allSections: SectionSeed[] = [];

  const seenTopicSlugs = new Set<string>();

  for (const g of input.topicGroups) {
    assertNonEmptyString(g.moduleSlug, "topicGroups[].moduleSlug");
    assertNonEmptyString(g.prefix, "topicGroups[].prefix");
    assertNonEmptyString(g.genKey, "topicGroups[].genKey");
    assertNonEmptyString(g.section.slug, "topicGroups[].section.slug");

    assertNoDot(g.prefix, `prefix for section "${g.section.slug}"`);

    // prevent accidental repeats within a module group
    assertUnique(g.topics.map((t) => t.id), `topics[].id for section "${g.section.slug}"`);

    const normalizedTopics = g.topics.map((t, idx) => {
      assertNonEmptyString(t.id, "topic.id");
      assertNoDot(t.id, `topic.id "${t.id}"`);

      const slug = `${g.prefix}.${t.id}`;

      if (seenTopicSlugs.has(slug)) {
        throw new Error(`Duplicate topic slug generated: "${slug}"`);
      }
      seenTopicSlugs.add(slug);

      // ✅ IMPORTANT: preserve null (mixed). Only default when variant is undefined.
      const variant = t.variant !== undefined ? t.variant : t.id;

      return {
        slug,
        subjectSlug: input.subject.slug,
        moduleSlug: g.moduleSlug,
        order: t.order ?? idx,
        titleKey: t.titleKey ?? `topic.${slug}`,
        description: t.description,
        genKey: g.genKey,
        variant,
        meta: t.meta,
      } satisfies TopicSeed;
    });

    allTopics.push(...normalizedTopics);

    allSections.push({
      slug: g.section.slug,
      subjectSlug: input.subject.slug,
      moduleSlug: g.moduleSlug,
      order: g.section.order,
      title: g.section.title,
      description: g.section.description,
      meta: g.section.meta,
      topicSlugs: normalizedTopics.map((t) => t.slug),
    } satisfies SectionSeed);
  }

  // -------------------------
  // Optional convenience lookup: "io_vars" => "py0.io_vars"
  // Enforces uniqueness across the subject.
  // -------------------------
  const TOPIC: Record<string, string> = {};
  for (const t of allTopics) {
    const short = t.slug.split(".")[1] ?? "";
    if (!short) continue;
    if (TOPIC[short] && TOPIC[short] !== t.slug) {
      throw new Error(`TOPIC lookup collision for "${short}": "${TOPIC[short]}" vs "${t.slug}"`);
    }
    TOPIC[short] = t.slug;
  }

  return {
    subject: input.subject,
    modules: input.modules,
    topics: allTopics,
    sections: allSections,
    TOPIC,
  };
}