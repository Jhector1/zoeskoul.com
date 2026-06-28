import { loadDbEnv } from "../loadEnv";
import { runSeed, type RunSeedOptions } from "./runSeed";
import { seedPracticePresets } from "./presets";

loadDbEnv();

type SeedCliOptions = RunSeedOptions & {
  skipPresets: boolean;
  help: boolean;
};

function splitSeedArg(value: string | undefined) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function takeValue(argv: string[], index: number, flag: string) {
  const next = argv[index + 1];
  if (!next || next.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return next;
}

export function parseSeedCliArgs(argv: string[]): SeedCliOptions {
  const options: SeedCliOptions = {
    subjectSlugs: [],
    courseRefs: [],
    skipPresets: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--skip-presets") {
      options.skipPresets = true;
      continue;
    }

    const [flag, inlineValue] = arg.includes("=")
      ? (arg.split(/=(.*)/s).filter(Boolean) as [string, string])
      : [arg, undefined];

    if (flag === "--subject" || flag === "--subjects") {
      const value = inlineValue ?? takeValue(argv, index, flag);
      options.subjectSlugs = [
        ...(options.subjectSlugs ?? []),
        ...splitSeedArg(value),
      ];
      if (inlineValue === undefined) index += 1;
      continue;
    }

    if (flag === "--course" || flag === "--courses" || flag === "--only") {
      const value = inlineValue ?? takeValue(argv, index, flag);
      options.courseRefs = [
        ...(options.courseRefs ?? []),
        ...splitSeedArg(value),
      ];
      if (inlineValue === undefined) index += 1;
      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`Unknown seed option ${arg}`);
    }

    options.courseRefs = [...(options.courseRefs ?? []), ...splitSeedArg(arg)];
  }

  return options;
}

function printSeedHelp() {
  console.log(`
Seed Zoeskoul DB records from generated manifests.

Usage:
  pnpm --filter @zoeskoul/db db:seed
  pnpm --filter @zoeskoul/db db:seed -- --course sql/sql-v2
  pnpm --filter @zoeskoul/db db:seed -- --courses sql/sql-v2,python/python-v2
  pnpm --filter @zoeskoul/db db:seed -- --subjects sql-v2,python-v2

Options:
  --course <catalog/live-subject>  Seed one live course, for example sql/sql-v2.
  --courses <a,b>                 Seed a comma-separated list of courses.
  --subject <live-subject>        Seed one live subject slug, for example sql-v2.
  --subjects <a,b>                Seed a comma-separated list of live subject slugs.
  --only <a,b>                    Alias for --courses.
  --skip-presets                  Do not upsert shared practice presets.
  --help                          Show this help.
`);
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseSeedCliArgs(argv);

  if (options.help) {
    printSeedHelp();
    return;
  }

  const result = await runSeed({
    subjectSlugs: options.subjectSlugs,
    courseRefs: options.courseRefs,
  });

  if (!options.skipPresets) {
    await seedPracticePresets();
  }

  const selected = [
    ...((options.subjectSlugs ?? []) as readonly string[]),
    ...((options.courseRefs ?? []) as readonly string[]),
  ];

  console.log(
    `[db:seed] Seeded ${selected.length > 0 ? selected.join(", ") : "all live subjects"}: ` +
      `${result.catalogs} catalogs, ${result.subjects} subjects, ${result.modules} modules, ` +
      `${result.topics} topics, ${result.sections} sections in ${result.ms}ms`,
  );
}

main()
  .then(() => {})
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
