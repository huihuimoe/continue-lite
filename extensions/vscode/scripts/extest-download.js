const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const command = process.argv[2];
const supportedCommands = new Set(["get-chromedriver", "get-vscode"]);

if (!supportedCommands.has(command)) {
  console.error(
    `Unsupported extest command "${command}". Expected one of: ${Array.from(supportedCommands).join(", ")}`,
  );
  process.exit(1);
}

function getFallbackVersionFromEngine() {
  const packageJsonPath = path.join(__dirname, "..", "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const engineVersion = packageJson?.engines?.vscode;

  if (typeof engineVersion !== "string") {
    return "1.110.0";
  }

  const parsed = engineVersion.match(/\d+\.\d+\.\d+/)?.[0];
  return parsed ?? "1.110.0";
}

async function resolveLatestStableVersion() {
  const response = await fetch(
    "https://update.code.visualstudio.com/api/releases/stable",
  );
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while querying VS Code releases`);
  }

  const releases = await response.json();
  if (!Array.isArray(releases) || typeof releases[0] !== "string") {
    throw new Error("Unexpected VS Code releases payload");
  }

  return releases[0];
}

void (async () => {
  const fallbackVersion = getFallbackVersionFromEngine();
  let vscodeVersion = fallbackVersion;

  try {
    vscodeVersion = await resolveLatestStableVersion();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[warn] Failed to resolve latest stable VS Code; falling back to ${fallbackVersion}. Reason: ${message}`,
    );
  }

  console.log(
    `[info] Running extest ${command} with VS Code stable ${vscodeVersion}`,
  );

  const result = spawnSync(
    "extest",
    [
      command,
      "--storage",
      "./e2e/storage",
      "--type",
      "stable",
      "--code_version",
      vscodeVersion,
    ],
    {
      stdio: "inherit",
      shell: process.platform === "win32",
    },
  );

  if (result.error) {
    throw result.error;
  }

  process.exit(result.status ?? 1);
})();
