// src/lib/practice/generator/engines/python/python_part1_mod1/handlers.ts
import type { Difficulty, ExerciseKind } from "../../../../types";
import type { GenOut } from "../../../shared/expected";
import type { RNG } from "../../../shared/rng";
import type { TopicContext } from "../../../generatorTypes";

import { makePythonModuleGenerator } from "../_shared";

import { VARS_GENERATOR_TOPIC} from "@/lib/subjects/python/modules/module1/topics/variables/generator";
import { M1_ERRORS_GENERATOR_TOPIC } from "@/lib/subjects/python/modules/module1/topics/errors_intro/generator";
import { M1_TYPES_GENERATOR_TOPIC } from "@/lib/subjects/python/modules/module1/topics/data_types_intro/generator";
import { M1_GENERATOR_OPERATORS_TOPIC } from "@/lib/subjects/python/modules/module1/topics/operators_expressions/generator";
import { M1_STRINGS_GENERATOR_TOPIC } from "@/lib/subjects/python/modules/module1/topics/string_basics/generator";
import { M1_IO_GENERATOR_TOPIC } from "@/lib/subjects/python/modules/module1/topics/input_output_patterns/generator";
import {AnyGenOut, SubjectModuleGenerator} from "@/lib/practice/generator/engines/utils";

export function makeGenPythonStatementsPart1Mod1(ctx: TopicContext) {

    // console.log("Resolved prompt:", i18nText(ctx, "quiz.m1_io_age_next_year.prompt", "__MISSING__"));
    return makePythonModuleGenerator({
        engineName: "python_part1_mod1",
        ctx,
        defaultPurpose: "quiz",
        enablePurpose: true,
        topics: [
            VARS_GENERATOR_TOPIC,
            M1_ERRORS_GENERATOR_TOPIC,
            M1_TYPES_GENERATOR_TOPIC,
            M1_GENERATOR_OPERATORS_TOPIC,
            M1_STRINGS_GENERATOR_TOPIC,
            M1_IO_GENERATOR_TOPIC,
        ],
    }) as (rng: RNG, diff: Difficulty, id: string) => AnyGenOut;
}