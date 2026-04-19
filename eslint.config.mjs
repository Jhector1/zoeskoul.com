// eslint.config.mjs
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
    {
        ignores: [
            "**/.next/**",
            "**/node_modules/**",
            "**/dist/**",
            "**/build/**",
            "**/coverage/**",
            "**/.turbo/**",
        ],
    },

    js.configs.recommended,
    ...tseslint.configs.recommended,

    {
        files: ["**/*.{ts,tsx}"],
        rules: {
            "no-unused-vars": "off",
            "@typescript-eslint/no-unused-vars": [
                "warn",
                {
                    argsIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                    caughtErrorsIgnorePattern: "^_",
                },
            ],
        },
    },

    {
        files: ["**/*.{js,jsx,mjs,cjs}"],
        rules: {
            "no-unused-vars": [
                "warn",
                {
                    argsIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                    caughtErrorsIgnorePattern: "^_",
                },
            ],
        },
    },
];