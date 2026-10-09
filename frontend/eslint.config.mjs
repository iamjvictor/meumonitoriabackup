import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import unusedImports from "eslint-plugin-unused-imports";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "test-results/**",
    "playwright-report/**",
    "next-env.d.ts",
  ]),
  {
    files: ["src/modules/student/**/*.{ts,tsx}", "src/app/(student-app)/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["@/modules/teacher", "@/modules/teacher/**"],
          message: "O módulo student não pode importar diretamente do módulo teacher.",
        }],
      }],
    },
  },
  {
    files: ["src/modules/teacher/**/*.{ts,tsx}", "src/app/(teacher)/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["@/modules/student", "@/modules/student/**"],
          message: "O módulo teacher não pode importar diretamente do módulo student.",
        }],
      }],
    },
  },
  {
    // Dívida técnica já existente: manter o lint informativo no legado sem
    // transformar uma limpeza gradual em uma refatoração comportamental.
    plugins: {
      "unused-imports": unusedImports,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-imports": "warn",
      "unused-imports/no-unused-vars": ["warn", {
        args: "after-used",
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrors: "none",
      }],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-empty-object-type": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
]);

export default eslintConfig;
