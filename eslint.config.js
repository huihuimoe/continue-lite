const tsParser = require("@typescript-eslint/parser");
const tsPlugin = require("@typescript-eslint/eslint-plugin");
const { importX } = require("eslint-plugin-import-x");

const importOrderRule = [
  "warn",
  {
    groups: [
      "builtin",
      "external",
      "internal",
      "parent",
      "sibling",
      "index",
      "object",
      "type",
    ],
    alphabetize: {
      order: "asc",
      caseInsensitive: true,
    },
    "newlines-between": "always",
  },
];

module.exports = [
  {
    ignores: ["**/out/**", "**/dist/**", "**/*.d.ts"],
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 6,
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "import-x": importX,
    },
    rules: {
      "no-negated-condition": "warn",
      "@typescript-eslint/naming-convention": "off",
      "@typescript-eslint/no-floating-promises": "warn",
      "@typescript-eslint/no-misused-promises": "error",
      curly: "warn",
      eqeqeq: "warn",
      "no-throw-literal": "warn",
      semi: "off",
      "import-x/order": importOrderRule,
    },
  },
  {
    files: ["core/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        project: ["./core/tsconfig.json"],
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      quotes: ["off", "double", {}],
      "@typescript-eslint/naming-convention": "off",
      // This is important: floating promises can cause unhandled rejections in long-lived editor runtimes
      "@typescript-eslint/no-floating-promises": "error",
      "import-x/order": "off",
      curly: "off",
      eqeqeq: "error",
      complexity: ["error", { max: 36 }],
      "max-lines-per-function": ["error", { max: 500 }],
      "max-statements": ["error", { max: 108 }],
      "max-depth": ["error", { max: 6 }],
      "max-nested-callbacks": ["error", { max: 4 }],
      "max-params": ["error", { max: 8 }],
    },
  },
  {
    files: [
      "core/**/*.test.ts",
      "core/**/*.test.tsx",
      "core/**/*.spec.ts",
      "core/**/*.spec.tsx",
      "core/**/*.vitest.ts",
    ],
    rules: {
      "max-lines-per-function": "off",
    },
  },
  {
    files: ["extensions/vscode/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        project: [
          "./extensions/vscode/tsconfig.json",
          "./extensions/vscode/tsconfig.e2e.json",
        ],
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-misused-promises": "warn",
    },
  },
];
