import { createCompiledLanguageProfile } from "../families/code/createCompiledLanguageProfile.js";
import { cShape } from "../shapes/cShape.js";

export const cProfile = createCompiledLanguageProfile({
    id: "c",
    shape: cShape,
    language: "c",
    languageLabel: "C",
    defaultEntryFileName: "main.c",
    defaultStarterCode: "#include <stdio.h>\n\nint main(void) {\n    /* Write your answer here. */\n    return 0;\n}\n",
    authoringRules: [
        "Compile the full workspace together; do not ask learners to paste every function into main.c.",
        "Prefer .h/.c pairs for reusable structures and keep the supplied main.c as a deterministic test harness.",
        "For pointer-based structures, initialize every child and parent pointer explicitly and free allocated nodes in the official solution.",
        "Keep runtime analysis in the teaching prose while the executable exercise verifies the algorithm's observable behavior.",
    ],
});
