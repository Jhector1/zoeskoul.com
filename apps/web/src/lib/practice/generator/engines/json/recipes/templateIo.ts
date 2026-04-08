import { makeCodeInputOut } from "@/lib/practice/generator/engines/utils";
import type { RecipeHandler } from "./types";
import type {
    ManifestComputedSpec,
    ManifestVarSpec,
} from "@/lib/subjects/_core/manifestTypes";

function resolveVar(
    rng: any,
    spec: ManifestVarSpec,
    current: Record<string, string | number>,
) {
    switch (spec.source) {
        case "int":
            return rng.int(spec.min, spec.max);

        case "pick":
            return rng.pick(spec.from);

        case "pickDifferentFromVar": {
            const avoid = String(current[spec.var] ?? "");
            let x = rng.pick(spec.from);
            for (let i = 0; i < 8 && x === avoid; i++) x = rng.pick(spec.from);
            return x;
        }

        case "intDifferentFromVar": {
            const avoid = Number(current[spec.var] ?? 0);
            let x = rng.int(spec.min, spec.max);
            for (let i = 0; i < 8 && x === avoid; i++) x = rng.int(spec.min, spec.max);
            return x;
        }

        default:
            throw new Error("Unsupported var source");
    }
}

function computeValue(spec: ManifestComputedSpec, vars: Record<string, string | number>) {
    const left = Number(vars[spec.left] ?? 0);

    switch (spec.op) {
        case "add":
            return left + spec.right;
        case "sub":
            return left - spec.right;
        case "mul":
            return left * spec.right;
        case "floor_div":
            return Math.floor(left / spec.right);
        case "c_to_f_int":
            return Math.floor((left * 9) / 5 + 32);
        case "mul_div_floor":
            return Math.floor((Number(vars[spec.left] ?? 0) * Number(vars[spec.right] ?? 0)) / spec.divisor);
        default:
            throw new Error("Unsupported computed op");
    }
}

function fillTemplate(template: string, vars: Record<string, string | number>) {
    return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => String(vars[key] ?? ""));
}

export const buildTemplateIoRecipe: RecipeHandler<any> = (def, args, resolved) => {
    const vars: Record<string, string | number> = {};

    for (const [name, spec] of Object.entries(def.recipe.vars)) {
        vars[name] = resolveVar(args.rng, spec as ManifestVarSpec, vars);
    }

    for (const [name, spec] of Object.entries(def.recipe.computed ?? {})) {
        vars[name] = computeValue(spec as ManifestComputedSpec, vars);
    }

    const tests = def.recipe.tests.map((t: any) => ({
        stdin: t.stdinTemplate ? fillTemplate(t.stdinTemplate, vars) : undefined,
        stdout: fillTemplate(t.stdoutTemplate, vars),
        match: t.match ?? "exact",
    }));

    return makeCodeInputOut({
        archetype: def.id,
        id: args.id,
        topic: args.topic,
        diff: args.diff,
        title: resolved.title,
        prompt: resolved.prompt,
        language: def.language ?? "python",
        starterCode: resolved.starterCode,
        help: resolved.help,
        hint: resolved.hint,
        fixedSqlDialect: def.fixedSqlDialect,
        expected: {
            kind: "code_input",
            tests,
            ...(def.recipe.solutionTemplate
                ? { solutionCode: fillTemplate(def.recipe.solutionTemplate, vars) }
                : {}),
        } as any,
    });
};