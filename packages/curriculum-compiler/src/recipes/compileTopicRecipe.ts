// import type {
//   TopicRecipe,
//   TopicSeed,
// } from "@zoeskoul/curriculum-contracts";
// import { getProfileAdapter } from "@zoeskoul/curriculum-profiles";
//
// function assertTopicRecipeShape(recipe: unknown): asserts recipe is TopicRecipe {
//   if (!recipe || typeof recipe !== "object") {
//     throw new Error("AI returned invalid TopicRecipe: value is not an object");
//   }
//
//   const r = recipe as Record<string, unknown>;
//
//   if (!r.topicBundle || typeof r.topicBundle !== "object") {
//     throw new Error(
//         `AI returned invalid TopicRecipe: missing topicBundle\n\nRaw:\n${JSON.stringify(recipe, null, 2)}`,
//     );
//   }
//
//   if (!r.messagesByLocale || typeof r.messagesByLocale !== "object") {
//     throw new Error(
//         `AI returned invalid TopicRecipe: missing messagesByLocale\n\nRaw:\n${JSON.stringify(recipe, null, 2)}`,
//     );
//   }
//
//   const topicBundle = r.topicBundle as Record<string, unknown>;
//
//   if (!Array.isArray(topicBundle.cards)) {
//     throw new Error(
//         `AI returned invalid TopicRecipe: topicBundle.cards must be an array\n\nRaw:\n${JSON.stringify(recipe, null, 2)}`,
//     );
//   }
//
//   if (!Array.isArray(topicBundle.sketches)) {
//     throw new Error(
//         `AI returned invalid TopicRecipe: topicBundle.sketches must be an array\n\nRaw:\n${JSON.stringify(recipe, null, 2)}`,
//     );
//   }
//
//   if (!Array.isArray(topicBundle.exercises)) {
//     throw new Error(
//         `AI returned invalid TopicRecipe: topicBundle.exercises must be an array\n\nRaw:\n${JSON.stringify(recipe, null, 2)}`,
//     );
//   }
// }
//
// export function compileTopicRecipe(args: {
//   profileId: string;
//   seed: TopicSeed;
//   recipe: TopicRecipe;
//   sourceLocale: "en";
//   targetLocales: string[];
// }) {
//   assertTopicRecipeShape(args.recipe);
//
//   const profile = getProfileAdapter(args.profileId);
//
//   const issues = profile.validateTopicRecipe(args.recipe);
//   const errors = issues.filter((x) => x.startsWith("ERROR:"));
//   if (errors.length) {
//     throw new Error(errors.join("\n"));
//   }
//
//   return profile.compileTopicRecipe({
//     recipe: args.recipe,
//     seed: args.seed,
//     sourceLocale: args.sourceLocale,
//     targetLocales: args.targetLocales,
//   });
// }
import type {
  CompileTopicRecipeArgs,
  ProfileAdapter,
  TopicRecipe,
} from "@zoeskoul/curriculum-contracts";

export function compileTopicRecipe(args: {
  adapter: ProfileAdapter;
  recipe: TopicRecipe;
  seed?: CompileTopicRecipeArgs["seed"];
}) {
  return args.adapter.compileTopicRecipe({
    seed: args.seed,
    recipe: args.recipe,
  });
}