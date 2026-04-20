import { getRecipeRegistry } from "./recipeRegistry.js";
import {
    resolveChoicesByCount,
    resolveHelp,
    resolveOptionsByIds,
    resolveTokensByIds,
    t,
} from "../i18n/resolveManifestMessages.js";

function maybeT(key: string): string | undefined {
    try {
        return t(key);
    } catch {
        return undefined;
    }
}

function resolveBase(messageBase: string) {
    return {
        title: t(`${messageBase}.title`),
        prompt: t(`${messageBase}.prompt`),
        hint: maybeT(`${messageBase}.hint`),
        help: resolveHelp(messageBase),
        starterCode: maybeT(`${messageBase}.starterCode`) ?? "",
        template: maybeT(`${messageBase}.template`) ?? "",
        expectedExampleMeta: maybeT(`${messageBase}.expectedExampleMeta`),
        maybeT,
    };
}

function buildCodeInput(def: any, args: any, profileId: string) {
    const resolved = resolveBase(def.messageBase);
    const recipeHandler = getRecipeRegistry(profileId)[def.recipe.type];

    if (!recipeHandler) {
        throw new Error(`Unknown recipe type "${def.recipe.type}" for "${def.id}"`);
    }

    return recipeHandler(def, args, resolved);
}

export function buildExerciseFromManifest(def: any, args: any, profileId: string) {
    const resolved = resolveBase(def.messageBase);

    switch (def.kind) {
        case "single_choice":
            return {
                kind: "single_choice",
                archetype: def.id,
                id: args.id,
                topic: args.topic,
                diff: args.diff,
                title: resolved.title,
                prompt: resolved.prompt,
                options: resolveOptionsByIds(def.messageBase, def.optionIds),
                answerOptionId: def.expected.optionId,
                help: resolved.help,
                hint: resolved.hint,
            };

        case "multi_choice":
            return {
                kind: "multi_choice",
                archetype: def.id,
                id: args.id,
                topic: args.topic,
                diff: args.diff,
                title: resolved.title,
                prompt: resolved.prompt,
                options: resolveOptionsByIds(def.messageBase, def.optionIds),
                answerOptionIds: def.expected.optionIds,
                help: resolved.help,
                hint: resolved.hint,
            };

        case "drag_reorder":
            return {
                kind: "drag_reorder",
                archetype: def.id,
                id: args.id,
                topic: args.topic,
                diff: args.diff,
                title: resolved.title,
                prompt: resolved.prompt,
                tokens: resolveTokensByIds(def.messageBase, def.tokenIds),
                answerTokenIds: def.expected.tokenIds,
                help: resolved.help,
                hint: resolved.hint,
            };

        case "fill_blank_choice":
            return {
                kind: "fill_blank_choice",
                archetype: def.id,
                id: args.id,
                topic: args.topic,
                diff: args.diff,
                title: resolved.title,
                prompt: resolved.prompt,
                template: resolved.template,
                choices: resolveChoicesByCount(def.messageBase, def.choiceCount),
                correct: def.expected.value,
                help: resolved.help,
                hint: resolved.hint,
            };

        case "code_input":
            return buildCodeInput(def, args, profileId);

        default:
            throw new Error(`Unsupported exercise kind: ${def.kind}`);
    }
}