import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as URI from "uri-js";
import * as YAML from "yaml";

import { DevEventName } from "@continuedev/config-yaml";
import dotenv from "dotenv";

import { IdeType } from "../";
import { defaultConfig } from "../config/default";

dotenv.config();

export function setConfigFilePermissions(filePath: string): void {
  try {
    if (os.platform() !== "win32") {
      fs.chmodSync(filePath, 0o600);
    }
  } catch (error) {
    console.warn(`Failed to set permissions on ${filePath}:`, error);
  }
}

const CONTINUE_GLOBAL_DIR = (() => {
  const configPath = process.env.CONTINUE_GLOBAL_DIR;
  if (configPath) {
    // Convert relative path to absolute paths based on current working directory
    return path.isAbsolute(configPath)
      ? configPath
      : path.resolve(process.cwd(), configPath);
  }
  return path.join(os.homedir(), ".continue");
})();

// export const DEFAULT_CONFIG_TS_CONTENTS = `import { Config } from "./types"\n\nexport function modifyConfig(config: Config): Config {
//   return config;
// }`;

export function getChromiumPath(): string {
  return path.join(getContinueUtilsPath(), ".chromium-browser-snapshots");
}

export function getContinueUtilsPath(): string {
  const utilsPath = path.join(getContinueGlobalPath(), ".utils");
  if (!fs.existsSync(utilsPath)) {
    fs.mkdirSync(utilsPath);
  }
  return utilsPath;
}

export function getGlobalContinueIgnorePath(): string {
  const continueIgnorePath = path.join(
    getContinueGlobalPath(),
    ".continueignore",
  );
  if (!fs.existsSync(continueIgnorePath)) {
    fs.writeFileSync(continueIgnorePath, "");
  }
  return continueIgnorePath;
}

export function getContinueGlobalPath(): string {
  // This is ~/.continue on mac/linux
  const continuePath = CONTINUE_GLOBAL_DIR;
  if (!fs.existsSync(continuePath)) {
    fs.mkdirSync(continuePath);
  }
  return continuePath;
}

export function getSessionsFolderPath(): string {
  const sessionsPath = path.join(getContinueGlobalPath(), "sessions");
  if (!fs.existsSync(sessionsPath)) {
    fs.mkdirSync(sessionsPath);
  }
  return sessionsPath;
}

export function getIndexFolderPath(): string {
  const indexPath = path.join(getContinueGlobalPath(), "index");
  if (!fs.existsSync(indexPath)) {
    fs.mkdirSync(indexPath);
  }
  return indexPath;
}

export function getGlobalContextFilePath(): string {
  return path.join(getIndexFolderPath(), "globalContext.json");
}

export function getSharedConfigFilePath(): string {
  return path.join(getContinueGlobalPath(), "sharedConfig.json");
}

export function getSessionFilePath(sessionId: string): string {
  return path.join(getSessionsFolderPath(), `${sessionId}.json`);
}

export function getSessionsListPath(): string {
  const filepath = path.join(getSessionsFolderPath(), "sessions.json");
  if (!fs.existsSync(filepath)) {
    fs.writeFileSync(filepath, JSON.stringify([]));
  }
  return filepath;
}

export function getConfigYamlPath(ideType?: IdeType): string {
  const p = path.join(getContinueGlobalPath(), "config.yaml");
  if (!fs.existsSync(p)) {
    if (ideType === "jetbrains") {
      // https://github.com/continuedev/continue/pull/7224
      // This was here because we had different context provider support between jetbrains and vs code
      // Leaving so we could differentiate later but for now configs are the same between IDEs
      fs.writeFileSync(p, YAML.stringify(defaultConfig));
    } else {
      fs.writeFileSync(p, YAML.stringify(defaultConfig));
    }
    setConfigFilePermissions(p);
  }
  return p;
}

export function getPrimaryConfigFilePath(): string {
  return getConfigYamlPath();
}

export function getTsConfigPath(): string {
  const tsConfigPath = path.join(getContinueGlobalPath(), "tsconfig.json");
  if (!fs.existsSync(tsConfigPath)) {
    fs.writeFileSync(
      tsConfigPath,
      JSON.stringify(
        {
          compilerOptions: {
            target: "ESNext",
            useDefineForClassFields: true,
            lib: ["DOM", "DOM.Iterable", "ESNext"],
            allowJs: true,
            skipLibCheck: true,
            esModuleInterop: false,
            allowSyntheticDefaultImports: true,
            strict: true,
            forceConsistentCasingInFileNames: true,
            module: "System",
            moduleResolution: "Node",
            noEmit: false,
            noEmitOnError: false,
            outFile: "./out/config.js",
            typeRoots: ["./node_modules/@types", "./types"],
          },
          include: ["./config.ts"],
        },
        null,
        2,
      ),
    );
  }
  return tsConfigPath;
}

export function getContinueRcPath(): string {
  const continuercPath = path.join(getContinueGlobalPath(), ".continuerc.json");
  if (!fs.existsSync(continuercPath)) {
    fs.writeFileSync(continuercPath, JSON.stringify({}, null, 2));
  }
  return continuercPath;
}

function getDevDataPath(): string {
  const sPath = path.join(getContinueGlobalPath(), "dev_data");
  if (!fs.existsSync(sPath)) {
    fs.mkdirSync(sPath);
  }
  return sPath;
}

export function getDevDataSqlitePath(): string {
  return path.join(getDevDataPath(), "devdata.sqlite");
}

export function getDevDataFilePath(
  eventName: DevEventName,
  schema: string,
): string {
  const versionPath = path.join(getDevDataPath(), schema);
  if (!fs.existsSync(versionPath)) {
    fs.mkdirSync(versionPath);
  }
  return path.join(versionPath, `${String(eventName)}.jsonl`);
}

function getMigrationsFolderPath(): string {
  const migrationsPath = path.join(getContinueGlobalPath(), ".migrations");
  if (!fs.existsSync(migrationsPath)) {
    fs.mkdirSync(migrationsPath);
  }
  return migrationsPath;
}

export async function migrate(
  id: string,
  callback: () => void | Promise<void>,
  onAlreadyComplete?: () => void,
) {
  if (process.env.NODE_ENV === "test") {
    return await Promise.resolve(callback());
  }

  const migrationsPath = getMigrationsFolderPath();
  const migrationPath = path.join(migrationsPath, id);

  if (!fs.existsSync(migrationPath)) {
    try {
      console.log(`Running migration: ${id}`);

      fs.writeFileSync(migrationPath, "");
      await Promise.resolve(callback());
    } catch (e) {
      console.warn(`Migration ${id} failed`, e);
    }
  } else if (onAlreadyComplete) {
    onAlreadyComplete();
  }
}

export function getIndexSqlitePath(): string {
  return path.join(getIndexFolderPath(), "index.sqlite");
}

export function getLanceDbPath(): string {
  return path.join(getIndexFolderPath(), "lancedb");
}

export function getTabAutocompleteCacheSqlitePath(): string {
  return path.join(getIndexFolderPath(), "autocompleteCache.sqlite");
}

export function getDocsSqlitePath(): string {
  return path.join(getIndexFolderPath(), "docs.sqlite");
}

export function getRemoteConfigsFolderPath(): string {
  const dir = path.join(getContinueGlobalPath(), ".configs");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
  }
  return dir;
}

export function getPathToRemoteConfig(remoteConfigServerUrl: string): string {
  let url: URL | undefined = undefined;
  try {
    url =
      typeof remoteConfigServerUrl !== "string" || remoteConfigServerUrl === ""
        ? undefined
        : new URL(remoteConfigServerUrl);
  } catch (e) {}
  const dir = path.join(getRemoteConfigsFolderPath(), url?.hostname ?? "None");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
  }
  return dir;
}

export function getConfigJsonPathForRemote(
  remoteConfigServerUrl: string,
): string {
  return path.join(getPathToRemoteConfig(remoteConfigServerUrl), "config.json");
}

export function getConfigJsPathForRemote(
  remoteConfigServerUrl: string,
): string {
  return path.join(getPathToRemoteConfig(remoteConfigServerUrl), "config.js");
}

export function getContinueDotEnv(): { [key: string]: string } {
  const filepath = path.join(getContinueGlobalPath(), ".env");
  if (fs.existsSync(filepath)) {
    return dotenv.parse(fs.readFileSync(filepath));
  }
  return {};
}

export function getLogsDirPath(): string {
  const logsPath = path.join(getContinueGlobalPath(), "logs");
  if (!fs.existsSync(logsPath)) {
    fs.mkdirSync(logsPath);
  }
  return logsPath;
}

export function getCoreLogsPath(): string {
  return path.join(getLogsDirPath(), "core.log");
}

export function getPromptLogsPath(): string {
  return path.join(getLogsDirPath(), "prompt.log");
}

export function getGlobalFolderWithName(name: string): string {
  return path.join(getContinueGlobalPath(), name);
}

export function getRepoMapFilePath(): string {
  return path.join(getContinueUtilsPath(), "repo_map.txt");
}

export function migrateV1DevDataFiles() {
  const devDataPath = getDevDataPath();
  function moveToV1FolderIfExists(
    oldFileName: string,
    newFileName: DevEventName,
  ) {
    const oldFilePath = path.join(devDataPath, `${oldFileName}.jsonl`);
    if (fs.existsSync(oldFilePath)) {
      const newFilePath = getDevDataFilePath(newFileName, "0.1.0");
      if (!fs.existsSync(newFilePath)) {
        fs.copyFileSync(oldFilePath, newFilePath);
        fs.unlinkSync(oldFilePath);
      }
    }
  }
  moveToV1FolderIfExists("tokens_generated", "tokensGenerated");
  moveToV1FolderIfExists("chat", "chatFeedback");
  moveToV1FolderIfExists("quickEdit", "quickEdit");
  moveToV1FolderIfExists("autocomplete", "autocomplete");
}

export function getLocalEnvironmentDotFilePath(): string {
  return path.join(getContinueGlobalPath(), ".local");
}

export function getStagingEnvironmentDotFilePath(): string {
  return path.join(getContinueGlobalPath(), ".staging");
}

export function getDiffsDirectoryPath(): string {
  const diffsPath = path.join(getContinueGlobalPath(), ".diffs"); // .replace(/^C:/, "c:"); ??
  if (!fs.existsSync(diffsPath)) {
    fs.mkdirSync(diffsPath, {
      recursive: true,
    });
  }
  return diffsPath;
}

export const isFileWithinFolder = (
  fileUri: string,
  folderPath: string,
): boolean => {
  try {
    if (!fileUri || !folderPath) {
      return false;
    }

    const fileUriParsed = URI.parse(fileUri);
    const fileScheme = fileUriParsed.scheme || "file";
    let filePath = fileUriParsed.path || "";
    filePath = decodeURIComponent(filePath);

    let folderWithScheme = folderPath;
    if (!folderPath.includes("://")) {
      folderWithScheme = `${fileScheme}://${folderPath.startsWith("/") ? "" : "/"}${folderPath}`;
    }
    const folderUriParsed = URI.parse(folderWithScheme);

    let folderPathClean = folderUriParsed.path || "";
    folderPathClean = decodeURIComponent(folderPathClean);

    filePath = filePath.replace(/\/$/, "");
    folderPathClean = folderPathClean.replace(/\/$/, "");

    return (
      filePath === folderPathClean || filePath.startsWith(`${folderPathClean}/`)
    );
  } catch (error) {
    console.error("Error in isFileWithinFolder:", error);
    return false;
  }
};
