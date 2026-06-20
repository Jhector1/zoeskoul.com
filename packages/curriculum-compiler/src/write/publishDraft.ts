import fs from "node:fs/promises";
import path from "node:path";
import {
  getBackupRoot,
  getDraftCatalogRoot,
  getBackupSubjectManifestPath,
  getBackupTopicBundlePath,
  getBackupTopicMessagesPath,
  getDraftSubjectMessagesPath,
  getDraftMessagesRoot,
  getDraftSubjectManifestPath,
  getDraftSubjectRoot,
  getDraftTopicBundlePath,
  getDraftTopicMessagesPath,
  getLiveSubjectMessagesRoot,
  getSubjectMessagesPath,
  getSubjectManifestPath,
  getTopicBundlePath,
  getTopicMessagesPath,
} from "@zoeskoul/curriculum-core";

async function ensureDir(filePath: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function pathExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonValidated(filePath: string) {
  const raw = await fs.readFile(filePath, "utf8");
  JSON.parse(raw);
  return raw;
}

function rewriteSubjectSlugDeep(
    value: unknown,
    draftSubjectSlug: string,
    liveSubjectSlug: string,
): unknown {
  if (draftSubjectSlug === liveSubjectSlug) {
    return value;
  }

  if (typeof value === "string") {
    return value.split(draftSubjectSlug).join(liveSubjectSlug);
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
        rewriteSubjectSlugDeep(item, draftSubjectSlug, liveSubjectSlug),
    );
  }

  if (value && typeof value === "object") {
    const next: Record<string, unknown> = {};

    for (const [key, childValue] of Object.entries(
        value as Record<string, unknown>,
    )) {
      const nextKey = key.split(draftSubjectSlug).join(liveSubjectSlug);
      next[nextKey] = rewriteSubjectSlugDeep(
          childValue,
          draftSubjectSlug,
          liveSubjectSlug,
      );
    }

    return next;
  }

  return value;
}

function rewriteJsonRawForLiveSubject(args: {
  raw: string;
  draftSubjectSlug: string;
  liveSubjectSlug: string;
}) {
  JSON.parse(args.raw);

  if (args.draftSubjectSlug === args.liveSubjectSlug) {
    return args.raw;
  }

  const parsed = JSON.parse(args.raw);
  const rewritten = rewriteSubjectSlugDeep(
      parsed,
      args.draftSubjectSlug,
      args.liveSubjectSlug,
  );

  return `${JSON.stringify(rewritten, null, 2)}\n`;
}

async function writeRawAtomic(filePath: string, raw: string) {
  const tempPath = `${filePath}.tmp`;
  await ensureDir(filePath);
  await fs.writeFile(tempPath, raw, "utf8");
  await fs.rename(tempPath, filePath);
}

async function backupIfExists(src: string, dest: string) {
  if (!(await pathExists(src))) return;
  const raw = await fs.readFile(src, "utf8");
  await writeRawAtomic(dest, raw);
}

function makeTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function makeBackupKey(args: {
  courseSlug?: string;
  liveSubjectSlug: string;
}) {
  const now = new Date();
  const date = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
  ].join("-");
  const time = [
    String(now.getUTCHours()).padStart(2, "0"),
    String(now.getUTCMinutes()).padStart(2, "0"),
    String(now.getUTCSeconds()).padStart(2, "0"),
  ].join("-");
  const scope = args.courseSlug ?? args.liveSubjectSlug;

  return `${scope}--${date}--${time}`;
}

function getBackupSubjectMessagesPath(
    backupKey: string,
    locale: string,
    subjectSlug: string,
) {
  return path.join(getBackupRoot(backupKey, subjectSlug), "messages", locale, "subjects", subjectSlug, "subject.json");
}

async function readDraftJsonForLive(args: {
  filePath: string;
  draftSubjectSlug: string;
  liveSubjectSlug: string;
}) {
  const raw = await readJsonValidated(args.filePath);

  return rewriteJsonRawForLiveSubject({
    raw,
    draftSubjectSlug: args.draftSubjectSlug,
    liveSubjectSlug: args.liveSubjectSlug,
  });
}

export async function publishDraft(args: { subjectSlug: string }) {
  return publishDraftToLive({
    draftSubjectSlug: args.subjectSlug,
    liveSubjectSlug: args.subjectSlug,
  });
}

export async function publishDraftToLive(args: {
  draftSubjectSlug: string;
  liveSubjectSlug: string;
  courseSlug?: string;
}) {
  const timestamp = makeTimestamp();
  const backupKey = makeBackupKey({
    courseSlug: args.courseSlug,
    liveSubjectSlug: args.liveSubjectSlug,
  });
  const draftSubjectRoot = getDraftSubjectRoot(args.draftSubjectSlug);
  const draftMessagesRoot = getDraftMessagesRoot(args.draftSubjectSlug);

  const draftManifestPath = getDraftSubjectManifestPath(args.draftSubjectSlug);
  const liveManifestPath = getSubjectManifestPath(args.liveSubjectSlug);

  if (!(await pathExists(draftManifestPath))) {
    throw new Error(`Draft subject manifest not found: ${draftManifestPath}`);
  }

  await backupIfExists(
      liveManifestPath,
      getBackupSubjectManifestPath(backupKey, args.liveSubjectSlug),
  );

  const manifestRaw = await readDraftJsonForLive({
    filePath: draftManifestPath,
    draftSubjectSlug: args.draftSubjectSlug,
    liveSubjectSlug: args.liveSubjectSlug,
  });

  await writeRawAtomic(liveManifestPath, manifestRaw);

  const draftModulesRoot = path.join(draftSubjectRoot, "modules");

  if (await pathExists(draftModulesRoot)) {
    const moduleDirs = await fs.readdir(draftModulesRoot, {
      withFileTypes: true,
    });

    for (const moduleDir of moduleDirs) {
      if (!moduleDir.isDirectory()) continue;

      const topicsRoot = path.join(draftModulesRoot, moduleDir.name, "topics");
      if (!(await pathExists(topicsRoot))) continue;

      const topicDirs = await fs.readdir(topicsRoot, { withFileTypes: true });

      for (const topicDir of topicDirs) {
        if (!topicDir.isDirectory()) continue;

        const topicId = topicDir.name;

        const draftBundlePath = getDraftTopicBundlePath(
            args.draftSubjectSlug,
            moduleDir.name,
            topicId,
        );

        const liveBundlePath = getTopicBundlePath(
            args.liveSubjectSlug,
            moduleDir.name,
            topicId,
        );

        await backupIfExists(
            liveBundlePath,
            getBackupTopicBundlePath(
                backupKey,
                args.liveSubjectSlug,
                moduleDir.name,
                topicId,
            ),
        );

        const bundleRaw = await readDraftJsonForLive({
          filePath: draftBundlePath,
          draftSubjectSlug: args.draftSubjectSlug,
          liveSubjectSlug: args.liveSubjectSlug,
        });

        await writeRawAtomic(liveBundlePath, bundleRaw);
      }
    }
  }

  if (await pathExists(draftMessagesRoot)) {
    const localeDirs = await fs.readdir(draftMessagesRoot, {
      withFileTypes: true,
    });

    for (const localeDir of localeDirs) {
      if (!localeDir.isDirectory()) continue;

      const locale = localeDir.name;

      const draftSubjectMessagesDir = path.join(
          draftMessagesRoot,
          locale,
          "subjects",
          args.draftSubjectSlug,
      );

      if (!(await pathExists(draftSubjectMessagesDir))) continue;

      const draftSubjectJsonPath = getDraftSubjectMessagesPath(
          locale,
          args.draftSubjectSlug,
      );

      const liveSubjectJsonPath = getSubjectMessagesPath(
          locale,
          args.liveSubjectSlug,
      );

      if (await pathExists(draftSubjectJsonPath)) {
        await backupIfExists(
            liveSubjectJsonPath,
            getBackupSubjectMessagesPath(
                backupKey,
                locale,
                args.liveSubjectSlug,
            ),
        );

        const subjectMessageRaw = await readDraftJsonForLive({
          filePath: draftSubjectJsonPath,
          draftSubjectSlug: args.draftSubjectSlug,
          liveSubjectSlug: args.liveSubjectSlug,
        });

        await writeRawAtomic(liveSubjectJsonPath, subjectMessageRaw);
      }

      const moduleDirs = await fs.readdir(draftSubjectMessagesDir, {
        withFileTypes: true,
      });

      for (const moduleDir of moduleDirs) {
        if (!moduleDir.isDirectory()) continue;

        const draftModuleDir = path.join(draftSubjectMessagesDir, moduleDir.name);
        const files = await fs.readdir(draftModuleDir, { withFileTypes: true });

        for (const file of files) {
          if (!file.isFile() || !file.name.endsWith(".json")) continue;

          const topicId = file.name.replace(/\.json$/, "");

          const draftMessagePath = getDraftTopicMessagesPath(
              locale,
              args.draftSubjectSlug,
              moduleDir.name,
              topicId,
          );

          const liveMessagePath = getTopicMessagesPath(
              locale,
              args.liveSubjectSlug,
              moduleDir.name,
              topicId,
          );

          await backupIfExists(
              liveMessagePath,
              getBackupTopicMessagesPath(
                  backupKey,
                  locale,
                  args.liveSubjectSlug,
                  moduleDir.name,
                  topicId,
              ),
          );

          const messageRaw = await readDraftJsonForLive({
            filePath: draftMessagePath,
            draftSubjectSlug: args.draftSubjectSlug,
            liveSubjectSlug: args.liveSubjectSlug,
          });

          await writeRawAtomic(liveMessagePath, messageRaw);
        }
      }
    }
  }

  return { ok: true, backupKey, backupTimestamp: timestamp };
}
