


import {
    makeSingleChoiceOut,
    makeMultiChoiceOut,
    makeDragReorderOut,
    makeFillBlankChoiceOut,
} from "@/lib/practice/generator/engines/utils";
import type { HandlerArgs } from "@/lib/practice/generator/engines/utils";
import type { ManifestExercise, ManifestCodeInput } from "@/lib/subjects/_core/manifestTypes";
import {
    resolveChoicesByCount,
    resolveHelp,
    resolveOptionsByIds,
    resolveTokensByIds,
    t,
} from "./i18nResolve";
import { RECIPE_REGISTRY } from "./recipes/registry";

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

function buildCodeInput(def: ManifestCodeInput, args: HandlerArgs) {
    const resolved = resolveBase(def.messageBase);
    const recipeHandler = RECIPE_REGISTRY[def.recipe.type];

    if (!recipeHandler) {
        throw new Error(`Unknown recipe type "${def.recipe.type}" for "${def.id}"`);
    }

    return recipeHandler(def as any, args, resolved);
}

export function buildExerciseFromManifest(def: ManifestExercise, args: HandlerArgs) {
    const resolved = resolveBase(def.messageBase);

    switch (def.kind) {
        case "single_choice":
            return makeSingleChoiceOut({
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
            });

        case "multi_choice":
            return makeMultiChoiceOut({
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
            });

        case "drag_reorder":
            return makeDragReorderOut({
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
            });

        case "fill_blank_choice":
            return makeFillBlankChoiceOut({
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
            });

        case "code_input":
            return buildCodeInput(def, args);

        default:
            throw new Error(`Unsupported exercise kind`);
    }
}