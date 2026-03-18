const { spawnSync } = require("child_process");
const path = require("path");

const { prepareLinuxE2eRuntime } = require("./run-e2e-tests.cjs");

const EXTEST_BIN = process.platform === "win32" ? "extest.cmd" : "extest";
const DEFAULT_STORAGE = "./e2e/storage";

function buildInstallVsixArgs() {
  return [
    "install-vsix",
    "-f",
    "./e2e/vsix/continue.vsix",
    "--extensions_dir",
    "./e2e/.test-extensions",
    "--storage",
    DEFAULT_STORAGE,
  ];
}

async function main() {
  const storagePath = path.resolve(DEFAULT_STORAGE);

  await prepareLinuxE2eRuntime({ storagePath });

  const result = spawnSync(EXTEST_BIN, buildInstallVsixArgs(), {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) {
    throw result.error;
  }

  process.exit(result.status ?? 1);
}

if (require.main === module) {
  void main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  buildInstallVsixArgs,
  main,
};
