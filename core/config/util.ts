import fs from "fs";
import os from "os";

import { ConfigYaml, ModelConfig } from "@continuedev/config-yaml";
import YAML from "yaml";
import { ContinueConfig, IDE, JSONModelDescription, PromptTemplate } from "../";
import { GlobalContext } from "../util/GlobalContext";
import { getConfigYamlPath, setConfigFilePermissions } from "../util/paths";

export function addModel(model: JSONModelDescription) {
  editConfigYaml((config) => {
    let numMatches = 0;
    for (const entry of config.models ?? []) {
      if (
        typeof (entry as { name?: unknown }).name === "string" &&
        (entry as { name: string }).name.startsWith(model.title)
      ) {
        numMatches += 1;
      }
    }
    if (numMatches > 0) {
      model.title = `${model.title} (${numMatches})`;
    }

    if (!config.models) {
      config.models = [];
    }

    const desc: ModelConfig = {
      name: model.title,
      provider: model.provider,
      model: model.model,
      apiKey: model.apiKey,
      apiBase: model.apiBase,
      maxStopWords: model.maxStopWords,
      defaultCompletionOptions: model.completionOptions,
    };
    config.models.push(desc);
    return config;
  });
}

function editConfigYaml(callback: (config: ConfigYaml) => ConfigYaml): void {
  const configPath = getConfigYamlPath();
  const config = fs.readFileSync(configPath, "utf8");
  let configYaml = YAML.parse(config) as unknown;
  if (typeof configYaml === "object" && configYaml !== null) {
    configYaml = callback(configYaml as ConfigYaml);
    fs.writeFileSync(configPath, YAML.stringify(configYaml));
    setConfigFilePermissions(configPath);
  } else {
    console.warn("config.yaml is not a valid object");
  }
}

/**
 * This check is to determine if the user is on an unsupported CPU
 * target for our Lance DB binaries.
 *
 * See here for details: https://github.com/continuedev/continue/issues/940
 */
export function isSupportedLanceDbCpuTargetForLinux(ide?: IDE) {
  const CPU_FEATURES_TO_CHECK = ["avx2", "fma"] as const;

  const globalContext = new GlobalContext();
  const globalContextVal = globalContext.get(
    "isSupportedLanceDbCpuTargetForLinux",
  );

  // If we've already checked the CPU target, return the cached value
  if (globalContextVal !== undefined) {
    return globalContextVal;
  }

  const arch = os.arch();

  // This check only applies to x64
  //https://github.com/lancedb/lance/issues/2195#issuecomment-2057841311
  if (arch !== "x64") {
    globalContext.update("isSupportedLanceDbCpuTargetForLinux", true);
    return true;
  }

  try {
    const cpuFlags = fs.readFileSync("/proc/cpuinfo", "utf-8").toLowerCase();

    const isSupportedLanceDbCpuTargetForLinux = cpuFlags
      ? CPU_FEATURES_TO_CHECK.every((feature) => cpuFlags.includes(feature))
      : true;

    // If it's not a supported CPU target, and it's the first time we are checking,
    // show a toast to inform the user that we are going to disable indexing.
    if (!isSupportedLanceDbCpuTargetForLinux && ide) {
      // We offload our async toast to `showUnsupportedCpuToast` to prevent making
      // our config loading async upstream of `isSupportedLanceDbCpuTargetForLinux`
      void showUnsupportedCpuToast(ide);
    }

    globalContext.update(
      "isSupportedLanceDbCpuTargetForLinux",
      isSupportedLanceDbCpuTargetForLinux,
    );

    return isSupportedLanceDbCpuTargetForLinux;
  } catch (error) {
    // If we can't determine CPU features, default to true
    return true;
  }
}

async function showUnsupportedCpuToast(ide: IDE) {
  const shouldOpenLink = await ide.showToast(
    "warning",
    "Codebase indexing disabled - Your Linux system lacks required CPU features (AVX2, FMA)",
    "Learn more",
  );

  if (shouldOpenLink) {
    void ide.openUrl(
      "https://docs.continue.dev/troubleshooting#i-received-a-codebase-indexing-disabled---your-linux-system-lacks-required-cpu-features-avx2-fma-notification",
    );
  }
}

/**
 * This is required because users are only able to define prompt templates as a
 * string, while internally we also allow prompt templates to be functions
 * @param templates
 * @returns
 */
export function serializePromptTemplates(
  templates: Record<string, PromptTemplate> | undefined,
): Record<string, string> | undefined {
  if (!templates) return undefined;

  return Object.fromEntries(
    Object.entries(templates).map(([key, template]) => {
      const serialized = typeof template === "function" ? "" : template;
      return [key, serialized];
    }),
  );
}
