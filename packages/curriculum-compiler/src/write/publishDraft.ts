import fs from "node:fs/promises";
import path from "node:path";
import {
  getBackupSubjectManifestPath,
  getBackupTopicBundlePath,
  getBackupTopicMessagesPath,
  getDraftMessagesRoot,
  getDraftSubjectManifestPath,
  getDraftSubjectRoot,
  getDraftTopicBundlePath,
  getDraftTopicMessagesPath,
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

function getBackupSubjectMessagesPath(
    timestamp: string,
    locale: string,
    subjectSlug: string,
) {
  return path.join(
      ".curriculum-backups",
      timestamp,
      "messages",
      locale,
      "subjects",
      subjectSlug,
      "subject.json",
  );
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
}) {
  const timestamp = makeTimestamp();
  const draftSubjectRoot = getDraftSubjectRoot(args.draftSubjectSlug);
  const draftMessagesRoot = getDraftMessagesRoot();
  const liveMessagesRoot = path.join("apps/web/src/i18n/messages");

  const draftManifestPath = getDraftSubjectManifestPath(args.draftSubjectSlug);
  const liveManifestPath = getSubjectManifestPath(args.liveSubjectSlug);

  if (!(await pathExists(draftManifestPath))) {
    throw new Error(`Draft subject manifest not found: ${draftManifestPath}`);
  }

  await backupIfExists(
      liveManifestPath,
      getBackupSubjectManifestPath(timestamp, args.liveSubjectSlug),
  );

  const manifestRaw = await readJsonValidated(draftManifestPath);
  await writeRawAtomic(liveManifestPath, manifestRaw);

  const draftModulesRoot = path.join(draftSubjectRoot, "modules");
  if (await pathExists(draftModulesRoot)) {
    const moduleDirs = await fs.readdir(draftModulesRoot, { withFileTypes: true });

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
                timestamp,
                args.liveSubjectSlug,
                moduleDir.name,
                topicId,
            ),
        );

        const bundleRaw = await readJsonValidated(draftBundlePath);
        await writeRawAtomic(liveBundlePath, bundleRaw);
      }
    }
  }

  if (await pathExists(draftMessagesRoot)) {
    const localeDirs = await fs.readdir(draftMessagesRoot, { withFileTypes: true });

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

      const draftSubjectJsonPath = path.join(
          draftMessagesRoot,
          locale,
          "subjects",
          args.draftSubjectSlug,
          "subject.json",
      );

      const liveSubjectJsonPath = path.join(
          liveMessagesRoot,
          locale,
          "subjects",
          args.liveSubjectSlug,
          "subject.json",
      );

      if (await pathExists(draftSubjectJsonPath)) {
        await backupIfExists(
            liveSubjectJsonPath,
            getBackupSubjectMessagesPath(timestamp, locale, args.liveSubjectSlug),
        );

        const subjectMessageRaw = await readJsonValidated(draftSubjectJsonPath);
        await writeRawAtomic(liveSubjectJsonPath, subjectMessageRaw);
      }

      const moduleDirs = await fs.readdir(draftSubjectMessagesDir, { withFileTypes: true });

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
                  timestamp,
                  locale,
                  args.liveSubjectSlug,
                  moduleDir.name,
                  topicId,
              ),
          );

          const messageRaw = await readJsonValidated(draftMessagePath);
          await writeRawAtomic(liveMessagePath, messageRaw);
        }
      }
    }
  }

  return { ok: true, backupTimestamp: timestamp };
}
