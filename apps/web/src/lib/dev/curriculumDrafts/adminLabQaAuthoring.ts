import "server-only";
import { promises as fs, constants as fsConstants } from "node:fs";
import path from "node:path";
import { loadApprovedDraftAdminLab, isDraftAdminLabQaEnabled } from "./adminLabQaPolicy";
import { AUTHOR_ONLY_QA_TOPIC_MODULES, authorOnlyAdminQaKey,
  parseAuthorOnlyAdminQaContract, parseAuthorOnlyAdminQaKey,
} from "./adminLabQaAuthoringPure";

/** Only exact approved Course 2 topics, compiled separately from student lessons. */
async function loadAuthoredContract(refValue: unknown) {
  if (!isDraftAdminLabQaEnabled()) throw new Error("Author-only lab QA is disabled.");
  const {loaded, target} = await loadApprovedDraftAdminLab(refValue);
  if (AUTHOR_ONLY_QA_TOPIC_MODULES[target.topicSlug] !== loaded.moduleDir) {
    throw new Error("Unexpected Course 2 administrator QA module.");
  }
  // The topic name comes only from the canonical allowlist, never a browser filename.
  const filename = path.join(path.dirname(loaded.blueprintPath), "admin-lab-qa",
    `${target.topicSlug}.json`);
  // Do not follow a symlinked manually-authored private contract.
  const file = await fs.open(filename, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  let content: string;
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 32768 || stat.size === 0) {
      throw new Error("Invalid administrator QA contract file.");
    }
    content = await file.readFile({encoding: "utf8"});
  } finally { await file.close(); }
  const parsed = parseAuthorOnlyAdminQaContract(JSON.parse(content), target.topicSlug);
  return {topicSlug:target.topicSlug, contract:parsed};
}

export async function loadAuthorOnlyAdminQaExercises(refValue: unknown) {
  try {
    const {topicSlug, contract} = await loadAuthoredContract(refValue);
    return contract.exercises.map((ex) => ({
      key:authorOnlyAdminQaKey(topicSlug, ex.id), exerciseKey:ex.id,
      title:ex.title, instructions:ex.instructions,
    }));
  } catch (error) {
    // Unauthored topic legitimately has no privileged exercises; invalid authored
    // metadata and authorization failures are never silently graded.
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return [];
    throw error;
  }
}

export async function loadAuthorOnlyAdminQaExpected(key: unknown) {
  const parsed = parseAuthorOnlyAdminQaKey(key);
  if (!parsed) throw new Error("Invalid author-only administrator QA selector.");
  const {topicSlug, contract} = await loadAuthoredContract({
    catalog:"linux", subject:"linux", module:parsed.module, topic:parsed.topic,
  });
  const matches = contract.exercises.filter((ex) => ex.id === parsed.id);
  if (matches.length !== 1 || !matches[0]) throw new Error("Author-only administrator QA exercise missing.");
  return {topicSlug, expected:matches[0].expected};
}
