import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  AI_PROVIDER_IDS,
  formatAiModelCatalog,
  getAiProviderCatalogEntry,
  normalizeAiProviderId,
  resolveModelForProvider,
  type AiProviderId,
} from "@zoeskoul/curriculum-ai";

function readFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1]?.trim();

  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }

  return value;
}

async function askChoice(args: {
  title: string;
  choices: Array<{ id: string; label: string; detail?: string }>;
  customLabel?: string;
}): Promise<string> {
  if (!process.stdin.isTTY) {
    throw new Error(
      `${args.title} cannot be selected interactively because stdin is not a TTY.`,
    );
  }

  console.log("");
  console.log(args.title);
  console.log("");

  args.choices.forEach((choice, index) => {
    console.log(
      `${index + 1}. ${choice.label}${choice.detail ? ` - ${choice.detail}` : ""}`,
    );
  });

  const customIndex = args.customLabel ? args.choices.length + 1 : null;
  if (customIndex !== null) {
    console.log(`${customIndex}. ${args.customLabel}`);
  }

  console.log("");

  const rl = readline.createInterface({ input, output });

  try {
    while (true) {
      const answer = await rl.question("Choose number: ");
      const index = Number(answer.trim()) - 1;

      if (Number.isInteger(index) && index >= 0 && index < args.choices.length) {
        return args.choices[index].id;
      }

      if (customIndex !== null && index === customIndex - 1) {
        const custom = await rl.question("Enter custom model id: ");
        if (custom.trim()) return custom.trim();
      }

      console.log("Invalid choice. Please choose a number from the list.");
    }
  } finally {
    rl.close();
  }
}

export async function selectProviderFromConsole(): Promise<AiProviderId> {
  const selected = await askChoice({
    title: "Select AI provider:",
    choices: AI_PROVIDER_IDS.map((id) => {
      const entry = getAiProviderCatalogEntry(id);
      return { id, label: entry.label, detail: id };
    }),
  });

  return normalizeAiProviderId(selected)!;
}

export async function selectModelFromConsoleForProvider(
  provider: AiProviderId,
): Promise<string> {
  const entry = getAiProviderCatalogEntry(provider);
  return askChoice({
    title: `Select ${entry.label} model:`,
    choices: entry.models.map((model) => ({
      id: model.id,
      label: model.id,
      detail: [
        model.purpose,
        model.recommendedForTranslation ? "translation" : "",
        model.deprecated ? "deprecated" : "",
      ].filter(Boolean).join(", "),
    })),
    customLabel: "custom model id",
  });
}

export function printAiModelCatalog() {
  console.log(formatAiModelCatalog());
}

export function getAiCliFlag(args: string[], name: string): string | undefined {
  return readFlag(args, name);
}

/**
 * Generation provider/model selection.
 *
 * Important behavior:
 * If the caller did not pass --provider and AI_PROVIDER is not set, interactive
 * mode must ask for the provider first. Model env vars such as OPENAI_MODEL must
 * not force OpenAI silently; they only matter after a provider is resolved.
 */
export async function resolveGenerationProviderModel(args: {
  cliArgs: string[];
  interactive?: boolean;
}): Promise<{ provider: AiProviderId; model: string }> {
  const cliProvider = normalizeAiProviderId(readFlag(args.cliArgs, "--provider"));
  const providerFromEnv = normalizeAiProviderId(process.env.AI_PROVIDER);

  const provider =
    cliProvider ??
    providerFromEnv ??
    (args.interactive !== false && process.stdin.isTTY
      ? await selectProviderFromConsole()
      : "openai");

  const cliModel = readFlag(args.cliArgs, "--model");
  const genericModelEnv = process.env.AI_MODEL;
  const providerModelEnv =
    process.env[getAiProviderCatalogEntry(provider).modelEnv]?.trim();

  const model =
    cliModel ??
    genericModelEnv?.trim() ??
    providerModelEnv ??
    (args.interactive !== false && process.stdin.isTTY
      ? await selectModelFromConsoleForProvider(provider)
      : resolveModelForProvider({ provider }));

  return { provider, model };
}

/**
 * Translation provider/model selection.
 *
 * This intentionally prompts for provider first when --translation-provider and
 * TRANSLATION_PROVIDER are missing. Translation should not silently use OpenAI
 * just because OPENAI_MODEL exists or because the old script used OpenAI only.
 */
export async function resolveTranslationProviderModel(args: {
  cliArgs: string[];
  generation?: { provider: AiProviderId; model: string };
  interactive?: boolean;
}): Promise<{ provider: AiProviderId; model: string }> {
  const cliProvider = normalizeAiProviderId(readFlag(args.cliArgs, "--translation-provider"));
  const envProvider = normalizeAiProviderId(process.env.TRANSLATION_PROVIDER);
  const generationProvider = args.generation?.provider;

  const provider =
    cliProvider ??
    envProvider ??
    generationProvider ??
    (args.interactive !== false && process.stdin.isTTY
      ? await selectProviderFromConsole()
      : normalizeAiProviderId(process.env.AI_PROVIDER) ?? "openai");

  const cliModel = readFlag(args.cliArgs, "--translation-model");
  const translationModelEnv = process.env.TRANSLATION_MODEL?.trim();
  const providerModelEnv =
    process.env[getAiProviderCatalogEntry(provider).modelEnv]?.trim();

  const model =
    cliModel ??
    translationModelEnv ??
    providerModelEnv ??
    (provider === args.generation?.provider ? args.generation?.model : undefined) ??
    (args.interactive !== false && process.stdin.isTTY
      ? await selectModelFromConsoleForProvider(provider)
      : resolveModelForProvider({ provider }));

  return { provider, model };
}

export function applyResolvedAiEnv(args: {
  provider: AiProviderId;
  model: string;
  translation?: boolean;
}) {
  const entry = getAiProviderCatalogEntry(args.provider);

  if (args.translation) {
    process.env.TRANSLATION_PROVIDER = args.provider;
    process.env.TRANSLATION_MODEL = args.model;
  } else {
    process.env.AI_PROVIDER = args.provider;
    process.env.AI_MODEL = args.model;
  }

  process.env[entry.modelEnv] = args.model;

  // Backward compatibility for old OpenAI-only callers. They can continue to
  // read OPENAI_MODEL, but provider-aware callers should read AI_PROVIDER/AI_MODEL
  // or TRANSLATION_PROVIDER/TRANSLATION_MODEL.
  if (args.provider === "openai") {
    process.env.OPENAI_MODEL = args.model;
  }
}
