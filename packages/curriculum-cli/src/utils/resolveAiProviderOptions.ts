import {
  createAiProvider,
  type AiProvider,
  type AiProviderId,
} from "@zoeskoul/curriculum-ai";
import {
  printAiModelCatalog,
  resolveGenerationProviderModel,
  resolveTranslationProviderModel,
} from "./selectProviderModel.js";

export type ResolvedAiProviderOptions = {
  generationProviderId: AiProviderId;
  generationModel: string;
  translationProviderId: AiProviderId;
  translationModel: string;
  provider: AiProvider;
  translationProvider: AiProvider;
};

export async function resolveAiProviderOptions(args: {
  cliArgs: string[];
  needsGeneration: boolean;
  needsTranslation?: boolean;
  interactive?: boolean;
}): Promise<ResolvedAiProviderOptions | null> {
  if (args.cliArgs.includes("--list-ai-models")) {
    printAiModelCatalog();
    return null;
  }

  if (!args.needsGeneration) {
    return null;
  }

  const generation = await resolveGenerationProviderModel({
    cliArgs: args.cliArgs,
    interactive: args.interactive,
  });
  const translation = await resolveTranslationProviderModel({
    cliArgs: args.cliArgs,
    generation,
    interactive: args.interactive,
  });

  const provider = createAiProvider({
    provider: generation.provider,
    model: generation.model,
  });
  const translationProvider = createAiProvider({
    provider: translation.provider,
    model: translation.model,
  });

  console.log("");
  console.log("Generation AI:");
  console.log(`  provider: ${generation.provider}`);
  console.log(`  model: ${generation.model}`);
  console.log("");
  console.log("Translation AI:");
  console.log(`  provider: ${translation.provider}`);
  console.log(`  model: ${translation.model}`);
  console.log("");

  return {
    generationProviderId: generation.provider,
    generationModel: generation.model,
    translationProviderId: translation.provider,
    translationModel: translation.model,
    provider,
    translationProvider,
  };
}
