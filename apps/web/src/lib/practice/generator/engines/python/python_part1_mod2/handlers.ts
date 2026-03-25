import type { Difficulty, ExerciseKind } from "../../../../types";
import type { GenOut } from "../../../shared/expected";
import type { RNG } from "../../../shared/rng";
import type { TopicContext } from "../../../generatorTypes";

import { makePythonModuleGenerator } from "../_shared";
import {
    M2_CONDITIONALS_GENERATOR_TOPIC
} from "@/lib/subjects/python/modules/module2/topics/conditionals_basics/generator";
import {M2_LOOPS_GENERATOR_TOPIC} from "@/lib/subjects/python/modules/module2/topics/loops_basics/generator";
import {M2_LISTS_GENERATOR_TOPIC} from "@/lib/subjects/python/modules/module2/topics/lists_basics/generator";
import {M2_FUNCTIONS_GENERATOR_TOPIC} from "@/lib/subjects/python/modules/module2/topics/functions_basics/generator";
import {AnyGenOut, SubjectModuleGenerator} from "@/lib/practice/generator/engines/utils";

export function makeGenPythonStatementsPart1Mod2(ctx: TopicContext) {
    return makePythonModuleGenerator({
        engineName: "python_part1_mod2",
        ctx,
        defaultPurpose: "project",
        enablePurpose: true,
        topics: [M2_CONDITIONALS_GENERATOR_TOPIC, M2_LOOPS_GENERATOR_TOPIC, M2_LISTS_GENERATOR_TOPIC, M2_FUNCTIONS_GENERATOR_TOPIC],
    })  as (rng: RNG, diff: Difficulty, id: string) => AnyGenOut;
}