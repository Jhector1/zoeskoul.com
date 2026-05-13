// apps/web/eslint.config.mjs
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "dist/**",
    "coverage/**",
    ".turbo/**",
    "next-env.d.ts",
  ]),

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
      "@typescript-eslint/no-explicit-any": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-render": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/rules-of-hooks": "error",
      "@typescript-eslint/no-require-imports": "error"
    },
  },
]);

export default eslintConfig;