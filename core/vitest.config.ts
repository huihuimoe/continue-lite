import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globalSetup: "./test/vitest.global-setup.ts",
    setupFiles: "./test/vitest.setup.ts",
    fileParallelism: false,
    include: ["**/*.vitest.ts", "**/*.test.ts"],
    testTimeout: process.env.DEBUG === "jest" ? 5 * 60 * 1000 : 10000,
    environment: "node",
    globals: true,
    coverage: {
      provider: "v8",
    },
  },
  resolve: {
    alias: [
      {
        find: /^(\.{1,2}\/.*)\.js$/,
        replacement: "$1",
      },
      {
        find: /^uuid$/,
        replacement: path.join(rootDir, "test/shims/uuid.ts"),
      },
      {
        find: /^@continuedev\/fetch$/,
        replacement: path.join(rootDir, "test/shims/continuedev-fetch.ts"),
      },
      {
        find: /^@azure\/(.*)$/,
        replacement: path.join(rootDir, "node_modules/@azure/$1"),
      },
      {
        find: /^mssql$/,
        replacement: path.join(rootDir, "node_modules/mssql"),
      },
    ],
  },
});
