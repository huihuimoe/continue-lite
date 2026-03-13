import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as YAML from "yaml";

import { DevEventName } from "@continuedev/config-yaml";
import dotenv from "dotenv";

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

function getContinueUtilsPath(): string {
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

function getIndexFolderPath(): string {
  const indexPath = path.join(getContinueGlobalPath(), "index");
  if (!fs.existsSync(indexPath)) {
    fs.mkdirSync(indexPath);
  }
  return indexPath;
}

export function getGlobalContextFilePath(): string {
  return path.join(getIndexFolderPath(), "globalContext.json");
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

export function getConfigYamlPath(): string {
  const p = path.join(getContinueGlobalPath(), "config.yaml");
  if (!fs.existsSync(p)) {
    fs.writeFileSync(p, YAML.stringify(defaultConfig));
    setConfigFilePermissions(p);
  }
  return p;
}

export function getPrimaryConfigFilePath(): string {
  return getConfigYamlPath();
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

export function getTabAutocompleteCacheSqlitePath(): string {
  return path.join(getIndexFolderPath(), "autocompleteCache.sqlite");
}

export function getContinueDotEnv(): { [key: string]: string } {
  const filepath = path.join(getContinueGlobalPath(), ".env");
  if (fs.existsSync(filepath)) {
    return dotenv.parse(fs.readFileSync(filepath));
  }
  return {};
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
