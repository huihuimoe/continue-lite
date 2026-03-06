import * as path from "node:path";

const extensionRoot = path.resolve(__dirname, "extensions", "vscode");

export default {
  root: extensionRoot,
  test: {
    include: ["**/*.vitest.ts"],
    environment: "node",
  },
};
