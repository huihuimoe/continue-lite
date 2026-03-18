const { spawnSync } = require("child_process");

const EXTEST_BIN = process.platform === "win32" ? "extest.cmd" : "extest";
const EXTEST_ARGS = [
  "--extensions_dir",
  "./e2e/.test-extensions",
  "--storage",
  "./e2e/storage",
];

function installMarketplaceExtension(extensionId, optional = false) {
  const result = spawnSync(
    EXTEST_BIN,
    ["install-from-marketplace", extensionId, ...EXTEST_ARGS],
    {
      stdio: "inherit",
      shell: process.platform === "win32",
    },
  );

  if (result.error) {
    throw result.error;
  }

  if ((result.status ?? 1) !== 0) {
    if (optional) {
      console.warn(
        `[warn] Optional marketplace extension '${extensionId}' failed to install on ${process.platform}; continuing.`,
      );
      return;
    }

    process.exit(result.status ?? 1);
  }
}

installMarketplaceExtension("ms-vscode-remote.remote-ssh");
installMarketplaceExtension("ms-vscode-remote.remote-containers");

if (process.platform === "win32") {
  installMarketplaceExtension("ms-vscode-remote.remote-wsl");
} else {
  console.log(
    `[info] Skipping ms-vscode-remote.remote-wsl on ${process.platform}; Linux/non-mac e2e flows do not require the WSL extension.`,
  );
}
