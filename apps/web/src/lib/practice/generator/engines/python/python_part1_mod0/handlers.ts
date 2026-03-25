import type { Difficulty, ExerciseKind } from "../../../../types";
import type { GenOut } from "../../../shared/expected";
import type { RNG } from "../../../shared/rng";
import type { TopicContext } from "../../../generatorTypes";

import { makePythonModuleGenerator } from "../_shared";
import {M0_WORKSPACE_GENERATOR_TOPIC} from "@/lib/subjects/python/modules/module0/topics/workspace/generator";
import {M0_SYNTAX_GENERATOR_TOPIC} from "@/lib/subjects/python/modules/module0/topics/syntax_intro/generator";
import {M0_PROGRAMMING_GENERATOR_TOPIC} from "@/lib/subjects/python/modules/module0/topics/programming_intro/generator";
import {M0_COMPUTER_GENERATOR_TOPIC} from "@/lib/subjects/python/modules/module0/topics/computer_intro/generator";
import {M0_COMMENTS_GENERATOR_TOPIC} from "@/lib/subjects/python/modules/module0/topics/comments_intro/generator";
import {AnyGenOut} from "@/lib/practice/generator/engines/utils";

export function makeGenPythonStatementsPart1Mod0(ctx: TopicContext) {
    return makePythonModuleGenerator({
        engineName: "python_part1_mod0",
        ctx,
        defaultPurpose: "quiz",
        enablePurpose: true,
        topics: [
            M0_WORKSPACE_GENERATOR_TOPIC,
            M0_SYNTAX_GENERATOR_TOPIC,
            M0_PROGRAMMING_GENERATOR_TOPIC,
            M0_COMPUTER_GENERATOR_TOPIC,
            M0_COMMENTS_GENERATOR_TOPIC,
        ],
    }) as (rng: RNG, diff: Difficulty, id: string) => AnyGenOut;
}