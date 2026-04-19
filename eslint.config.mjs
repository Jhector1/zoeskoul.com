// eslint.config.mjs
import js from "@eslint/js";
import tseslint from "typescript-eslint";
// optional:
import unusedImports from "eslint-plugin-unused-imports";

export default [
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ["**/*.{ts,tsx,js,jsx}"],
        plugins: {
            "unused-imports": unusedImports,
        },
        rules: {
            "no-unused-vars": "off",
            "@typescript-eslint/no-unused-vars": [
                "error",
                {
                    argsIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                    caughtErrorsIgnorePattern: "^_",
                },
            ],

            // optional but nice for imports:
            "unused-imports/no-unused-imports": "error",

            // REMOVE THIS in flat config:
            // "import/no-unused-modules": ["warn", { unusedExports: true, missingExports: true }],
        },
    },
];