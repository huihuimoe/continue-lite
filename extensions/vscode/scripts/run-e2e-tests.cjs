const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const EXTEST_BIN = process.platform === "win32" ? "extest.cmd" : "extest";
const DEFAULT_TEST_PATTERN = "./e2e/_output/tests/*.test.js";
const DEFAULT_STORAGE = "./e2e/storage";
const DEFAULT_EXTENSIONS_DIR = "./e2e/.test-extensions";
const DEFAULT_SETTINGS_FILE = "settings.json";
const LINUX_CLEANUP_TIMEOUT_MS = 5_000;

function isStaleVsCodeWebdriverRootProcess(cmdline, runtime) {
  if (!cmdline) {
    return false;
  }

  const args = cmdline.split("\u0000").filter(Boolean);

  if (args.length === 0) {
    return false;
  }

  const executablePath = path.normalize(args[0]);
  const expectedExecutablePath = path.normalize(runtime.codeBinaryPath);
  const expectedExecutableSuffix = path.normalize(
    path.join("VSCode-linux-x64", "code"),
  );

  return (
    (executablePath === expectedExecutablePath ||
      executablePath.endsWith(expectedExecutableSuffix)) &&
    args.includes(`--user-data-dir=${runtime.settingsPath}`)
  );
}

function collectDescendantProcessIds(rootPids, processes) {
  const descendants = new Set(rootPids);
  let changed = true;

  while (changed) {
    changed = false;

    for (const processInfo of processes) {
      if (
        descendants.has(processInfo.ppid) &&
        !descendants.has(processInfo.pid)
      ) {
        descendants.add(processInfo.pid);
        changed = true;
      }
    }
  }

  return descendants;
}

function readLinuxProcesses(procRoot = "/proc") {
  return fs
    .readdirSync(procRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
    .map((entry) => {
      const pid = Number(entry.name);

      try {
        const cmdline = fs.readFileSync(
          path.join(procRoot, entry.name, "cmdline"),
          "utf8",
        );
        const status = fs.readFileSync(
          path.join(procRoot, entry.name, "status"),
          "utf8",
        );
        const ppidMatch = status.match(/^PPid:\s+(\d+)$/m);

        if (!ppidMatch) {
          return undefined;
        }

        return {
          pid,
          ppid: Number(ppidMatch[1]),
          cmdline,
        };
      } catch {
        return undefined;
      }
    })
    .filter(Boolean);
}

function processExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForProcessesToExit(pids, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const remaining = pids.filter((pid) => processExists(pid));
    if (remaining.length === 0) {
      return [];
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return pids.filter((pid) => processExists(pid));
}

async function cleanupLinuxVsCodeWebdriverProcesses({
  storagePath,
  logger = console,
}) {
  const runtime = {
    codeBinaryPath: path.join(storagePath, "VSCode-linux-x64", "code"),
    settingsPath: path.join(storagePath, "settings"),
  };
  const processes = readLinuxProcesses();
  const rootPids = processes
    .filter((processInfo) =>
      isStaleVsCodeWebdriverRootProcess(processInfo.cmdline, runtime),
    )
    .map((processInfo) => processInfo.pid);

  if (rootPids.length === 0) {
    return { rootPids: [], terminatedPids: [] };
  }

  const staleProcessIds = Array.from(
    collectDescendantProcessIds(new Set(rootPids), processes),
  ).sort((left, right) => right - left);

  logger.log(
    `[info] Cleaning ${rootPids.length} stale VS Code webdriver root process(es): ${rootPids.join(", ")}`,
  );

  for (const pid of staleProcessIds) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {}
  }

  const remaining = await waitForProcessesToExit(
    staleProcessIds,
    LINUX_CLEANUP_TIMEOUT_MS,
  );

  for (const pid of remaining) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {}
  }

  return { rootPids, terminatedPids: staleProcessIds };
}

function buildExtestArgs() {
  return [
    "run-tests",
    process.env.TEST_FILE || DEFAULT_TEST_PATTERN,
    "--code_settings",
    DEFAULT_SETTINGS_FILE,
    "--extensions_dir",
    DEFAULT_EXTENSIONS_DIR,
    "--storage",
    DEFAULT_STORAGE,
  ];
}

function buildExtestEnv(baseEnv = process.env) {
  const extraLaunchArgs =
    `${baseEnv.ELECTRON_EXTRA_LAUNCH_ARGS || ""} --disable-gpu --disable-software-rasterizer`.trim();

  return {
    ...baseEnv,
    NODE_ENV: baseEnv.NODE_ENV || "e2e",
    DISPLAY: baseEnv.DISPLAY || ":99",
    ELECTRON_DISABLE_GPU: baseEnv.ELECTRON_DISABLE_GPU || "1",
    ELECTRON_EXTRA_LAUNCH_ARGS: extraLaunchArgs,
  };
}

function ensureE2eRuntimeDirectories(storagePath) {
  const settingsPath = path.join(storagePath, "settings");
  const requiredDirs = [
    settingsPath,
    path.join(settingsPath, "User"),
    path.join(settingsPath, "logs"),
  ];

  for (const dir of requiredDirs) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function prepareLinuxE2eRuntime({
  platform = process.platform,
  storagePath,
  ensureRuntimeDirectories = ensureE2eRuntimeDirectories,
  cleanupLinuxVsCodeWebdriverProcesses:
    cleanupFn = cleanupLinuxVsCodeWebdriverProcesses,
  logger = console,
}) {
  ensureRuntimeDirectories(storagePath);

  if (platform === "linux") {
    await cleanupFn({ storagePath, logger });
  }
}

async function main() {
  const storagePath = path.resolve(DEFAULT_STORAGE);

  await prepareLinuxE2eRuntime({ storagePath });

  const result = spawnSync(EXTEST_BIN, buildExtestArgs(), {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: buildExtestEnv(),
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
  buildExtestArgs,
  buildExtestEnv,
  cleanupLinuxVsCodeWebdriverProcesses,
  collectDescendantProcessIds,
  ensureE2eRuntimeDirectories,
  isStaleVsCodeWebdriverRootProcess,
  main,
  prepareLinuxE2eRuntime,
  readLinuxProcesses,
};
