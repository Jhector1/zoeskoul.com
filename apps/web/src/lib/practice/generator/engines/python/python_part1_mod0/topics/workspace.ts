import {
    defineTopic,
    type Handler,type AnyHandler,
    type HandlerArgs,
    makeSingleChoiceOut,
    type TopicBundle,
} from "@/lib/practice/generator/engines/utils";
import {TOPIC_ID} from "@/lib/subjects/python/modules/module0/topics/workspace/meta";

export const M0_WORKSPACE_POOL = [
    { key: "m0_workspace_run_button", w: 1, kind: "single_choice", purpose: "quiz" },
    { key: "m0_workspace_terminal_output", w: 1, kind: "single_choice", purpose: "quiz" },
    { key: "m0_workspace_editor_area", w: 1, kind: "single_choice", purpose: "quiz" },
] as const;

export type M0WorkspaceKey = (typeof M0_WORKSPACE_POOL)[number]["key"];

function Q(key: M0WorkspaceKey) {
    return `quiz.${key}`;
}

type OptId = "a" | "b" | "c";

function buildOptions(key: M0WorkspaceKey, ids: OptId[]) {
    return ids.map((id) => ({
        id,
        text: `@:${Q(key)}.options.${id}`,
    }));
}

function sc(
    key: M0WorkspaceKey,
    answerOptionId: OptId,
    optionIds: OptId[] = ["a", "b", "c"]
): Handler<"single_choice"> {
    return ({ diff, id, topic }: HandlerArgs) =>
        makeSingleChoiceOut({
            archetype: key,
            id,
            topic,
            diff,
            title: `@:${Q(key)}.title`,
            prompt: `@:${Q(key)}.prompt`,
            options: buildOptions(key, optionIds),
            answerOptionId,
            hint: `@:${Q(key)}.hint`,
        });
}

export const M0_WORKSPACE_HANDLERS={
    m0_workspace_run_button: sc("m0_workspace_run_button", "b"),
    m0_workspace_terminal_output: sc("m0_workspace_terminal_output", "b"),
    m0_workspace_editor_area: sc("m0_workspace_editor_area", "a"),
};

// Legacy export: keep only if some old registry still depends on defineTopic(...)
export const M0_WORKSPACE_GENERATOR_TOPIC: TopicBundle = defineTopic(
 TOPIC_ID,
    M0_WORKSPACE_POOL as any,
    M0_WORKSPACE_HANDLERS as any
);