import { execSync } from "child_process";
import * as fs from "fs";
import os from "os";
import path from "path";

import {
  ConfigResult,
  ConfigValidationError,
  ModelRole,
} from "@continuedev/config-yaml";
import * as JSONC from "comment-json";

import {
  BrowserSerializedContinueConfig,
  Config,
  ContinueConfig,
  ContinueRcJson,
  IDE,
  IdeInfo,
  IdeSettings,
  IdeType,
  ILLM,
  ILLMLogger,
  ModelDescription,
  SerializedContinueConfig,
} from "..";
import { useHub } from "../control-plane/env";
import { BaseLLM } from "../llm";
import { llmFromDescription } from "../llm/llms";
import CustomLLMClass from "../llm/llms/CustomLLM";
import { copyOf } from "../util";
import { GlobalContext } from "../util/GlobalContext";
import mergeJson from "../util/merge";
import {
  DEFAULT_CONFIG_TS_CONTENTS,
  getConfigJsonPath,
  getConfigJsPath,
  getConfigTsPath,
  getContinueDotEnv,
  getEsbuildBinaryPath,
} from "../util/paths";
import { localPathToUri } from "../util/pathToUri";

import { resolveRelativePathInDir } from "../util/ideUtils";
import { getWorkspaceRcConfigs } from "./json/loadRcConfigs";
import { modifyAnyConfigWithSharedConfig } from "./sharedConfig";
import { serializePromptTemplates } from "./util";
import { validateConfig } from "./validation.js";

export function resolveSerializedConfig(
  filepath: string,
): SerializedContinueConfig {
  let content = fs.readFileSync(filepath, "utf8");
  const config = JSONC.parse(content) as unknown as SerializedContinueConfig;
  if (config.env && Array.isArray(config.env)) {
    const env = {
      ...process.env,
      ...getContinueDotEnv(),
    };

    config.env.forEach((envVar) => {
      if (envVar in env) {
        content = (content as any).replaceAll(
          new RegExp(`"${envVar}"`, "g"),
          `"${env[envVar]}"`,
        );
      }
    });
  }

  return JSONC.parse(content) as unknown as SerializedContinueConfig;
}

const configMergeKeys = {
  models: (a: any, b: any) => a.title === b.title,
};

function loadSerializedConfig(
  workspaceConfigs: ContinueRcJson[],
  _ideType: IdeType,
  overrideConfigJson: SerializedContinueConfig | undefined,
): ConfigResult<SerializedContinueConfig> {
  let config: SerializedContinueConfig = overrideConfigJson!;
  if (!config) {
    try {
      config = resolveSerializedConfig(getConfigJsonPath());
    } catch (e) {
      throw new Error(`Failed to parse config.json: ${e}`);
    }
  }

  const errors = validateConfig(config);

  if (errors?.some((error) => error.fatal)) {
    return {
      errors,
      config: undefined,
      configLoadInterrupted: true,
    };
  }

  if (config.allowAnonymousTelemetry === undefined) {
    config.allowAnonymousTelemetry = true;
  }

  for (const workspaceConfig of workspaceConfigs) {
    config = mergeJson(
      config,
      workspaceConfig,
      workspaceConfig.mergeBehavior,
      configMergeKeys,
    );
  }

  return { config, errors, configLoadInterrupted: false };
}

async function serializedToIntermediateConfig(
  initial: SerializedContinueConfig,
): Promise<Config> {
  const config: Config = {
    ...initial,
  };

  return config;
}

// Merge request options set for entire config with model specific options
function applyRequestOptionsToModels(
  models: BaseLLM[],
  config: Config,
  roles: ModelRole[] | undefined = undefined,
) {
  // Prepare models
  for (const model of models) {
    model.requestOptions = {
      ...config.requestOptions,
      ...model.requestOptions,
    };
    if (roles !== undefined) {
      model.roles = model.roles ?? roles;
    }
  }
}

/** Only difference between intermediate and final configs is the `models` array */
async function intermediateToFinalConfig({
  config,
  ide,
  ideSettings,
  uniqueId,
  llmLogger,
}: {
  config: Config;
  ide: IDE;
  ideSettings: IdeSettings;
  uniqueId: string;
  llmLogger: ILLMLogger;
}): Promise<{ config: ContinueConfig; errors: ConfigValidationError[] }> {
  const errors: ConfigValidationError[] = [];
  const workspaceDirs = await ide.getWorkspaceDirs();
  const getUriFromPath = (path: string) => {
    return resolveRelativePathInDir(path, ide, workspaceDirs);
  };
  // Auto-detect models
  let models: BaseLLM[] = [];
  await Promise.all(
    config.models.map(async (desc) => {
      if ("title" in desc) {
        const llm = await llmFromDescription(
          desc,
          ide.readFile.bind(ide),
          getUriFromPath,
          uniqueId,
          ideSettings,
          llmLogger,
          config.completionOptions,
        );
        if (!llm) {
          return;
        }

        if (llm.model === "AUTODETECT") {
          try {
            const modelNames = await llm.listModels();
            const detectedModels = await Promise.all(
              modelNames.map(async (modelName) => {
                return await llmFromDescription(
                  {
                    ...desc,
                    model: modelName,
                    title: modelName,
                    isFromAutoDetect: true,
                  },
                  ide.readFile.bind(ide),
                  getUriFromPath,
                  uniqueId,
                  ideSettings,
                  llmLogger,
                  copyOf(config.completionOptions),
                );
              }),
            );
            models.push(
              ...(detectedModels.filter(
                (x) => typeof x !== "undefined",
              ) as BaseLLM[]),
            );
          } catch (e) {
            console.warn("Error listing models: ", e);
          }
        } else {
          models.push(llm);
        }
      } else {
        const llm = new CustomLLMClass({
          ...desc,
          options: { ...desc.options, logger: llmLogger } as any,
        });
        if (llm.model === "AUTODETECT") {
          try {
            const modelNames = await llm.listModels();
            const models = modelNames.map(
              (modelName) =>
                new CustomLLMClass({
                  ...desc,
                  options: {
                    ...desc.options,
                    model: modelName,
                    logger: llmLogger,
                    isFromAutoDetect: true,
                  },
                }),
            );

            models.push(...models);
          } catch (e) {
            console.warn("Error listing models: ", e);
          }
        } else {
          models.push(llm);
        }
      }
    }),
  );

  applyRequestOptionsToModels(models, config, ["autocomplete"]);

  // Free trial provider will be completely ignored
  let warnAboutFreeTrial = false;
  models = models.filter((model) => model.providerName !== "free-trial");
  if (models.filter((m) => m.providerName === "free-trial").length) {
    warnAboutFreeTrial = true;
  }

  // Tab autocomplete model
  const tabAutocompleteModels: BaseLLM[] = [];
  if (config.tabAutocompleteModel) {
    const autocompleteConfigs = Array.isArray(config.tabAutocompleteModel)
      ? config.tabAutocompleteModel
      : [config.tabAutocompleteModel];

    await Promise.all(
      autocompleteConfigs.map(async (desc) => {
        if ("title" in desc) {
          const llm = await llmFromDescription(
            desc,
            ide.readFile.bind(ide),
            getUriFromPath,
            uniqueId,
            ideSettings,
            llmLogger,
            config.completionOptions,
          );
          if (llm) {
            if (llm.providerName === "free-trial") {
              warnAboutFreeTrial = true;
            } else {
              tabAutocompleteModels.push(llm);
            }
          }
        } else {
          tabAutocompleteModels.push(new CustomLLMClass(desc));
        }
      }),
    );
  }

  applyRequestOptionsToModels(tabAutocompleteModels, config);

  if (warnAboutFreeTrial) {
    errors.push({
      fatal: false,
      message:
        "Model provider 'free-trial' is no longer supported, will be ignored",
    });
  }

  const continueConfig: ContinueConfig = {
    ...config,
    modelsByRole: {
      autocomplete: [...tabAutocompleteModels],
    },
    selectedModelByRole: {
      autocomplete: null,
    },
    rules: [],
  };

  if (config.systemMessage) {
    continueConfig.rules.unshift({
      rule: config.systemMessage,
      source: "json-systemMessage",
    });
  }

  return { config: continueConfig, errors };
}

function llmToSerializedModelDescription(llm: ILLM): ModelDescription {
  return {
    provider: llm.providerName,
    underlyingProviderName: llm.underlyingProviderName,
    model: llm.model,
    title: llm.title ?? llm.model,
    apiKey: llm.apiKey,
    apiBase: llm.apiBase,
    contextLength: llm.contextLength,
    template: llm.template,
    completionOptions: llm.completionOptions,
    baseAgentSystemMessage: llm.baseAgentSystemMessage,
    basePlanSystemMessage: llm.basePlanSystemMessage,
    baseChatSystemMessage: llm.baseChatSystemMessage,
    requestOptions: llm.requestOptions,
    promptTemplates: serializePromptTemplates(llm.promptTemplates),
    capabilities: llm.capabilities,
    roles: llm.roles,
    configurationStatus: llm.getConfigurationStatus(),
    apiKeyLocation: llm.apiKeyLocation,
    envSecretLocations: llm.envSecretLocations,
    sourceFile: llm.sourceFile,
    isFromAutoDetect: llm.isFromAutoDetect,
  };
}

async function finalToBrowserConfig(
  final: ContinueConfig,
  ide: IDE,
): Promise<BrowserSerializedContinueConfig> {
  return {
    allowAnonymousTelemetry: final.allowAnonymousTelemetry,
    completionOptions: final.completionOptions,
    userToken: final.userToken,
    experimental: final.experimental,
    rules: final.rules,
    tabAutocompleteOptions: final.tabAutocompleteOptions,
    usePlatform: await useHub(ide.getIdeSettings()),
    modelsByRole: Object.fromEntries(
      Object.entries(final.modelsByRole).map(([k, v]) => [
        k,
        v.map(llmToSerializedModelDescription),
      ]),
    ) as Record<ModelRole, ModelDescription[]>, // TODO better types here
    selectedModelByRole: Object.fromEntries(
      Object.entries(final.selectedModelByRole).map(([k, v]) => [
        k,
        v ? llmToSerializedModelDescription(v) : null,
      ]),
    ) as Record<ModelRole, ModelDescription | null>, // TODO better types here
    // data not included here because client doesn't need
  };
}

function escapeSpacesInPath(p: string): string {
  return p.replace(/ /g, "\\ ");
}

async function handleEsbuildInstallation(
  ide: IDE,
  _ideType: IdeType,
): Promise<boolean> {
  // Only check when config.ts is going to be used; never auto-install.
  const installCmd = "npm i esbuild@x.x.x --prefix ~/.continue";

  // Try to detect a user-installed esbuild (normal resolution)
  try {
    await import("esbuild");
    return true; // available
  } catch {
    // Try resolving from ~/.continue/node_modules as a courtesy
    try {
      const userEsbuild = path.join(
        os.homedir(),
        ".continue",
        "node_modules",
        "esbuild",
      );
      const candidate = require.resolve("esbuild", { paths: [userEsbuild] });
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require(candidate);
      return true; // available via ~/.continue
    } catch {
      // Not available → show friendly instructions and opt out of building
      await ide.showToast(
        "error",
        [
          "config.ts has been deprecated and esbuild is no longer automatically installed by Continue.",
          "To use config.ts, install esbuild manually:",
          "",
          `    ${installCmd}`,
        ].join("\n"),
      );
      return false;
    }
  }
}

async function tryBuildConfigTs(): Promise<boolean> {
  try {
    if (process.env.IS_BINARY === "true") {
      await buildConfigTsWithBinary();
    } else {
      await buildConfigTsWithNodeModule();
    }
    return true;
  } catch (e) {
    console.log(
      `Build error. Please check your ~/.continue/config.ts file: ${e}`,
    );
    return false;
  }
}

async function buildConfigTsWithBinary() {
  const cmd = [
    escapeSpacesInPath(getEsbuildBinaryPath()),
    escapeSpacesInPath(getConfigTsPath()),
    "--bundle",
    `--outfile=${escapeSpacesInPath(getConfigJsPath())}`,
    "--platform=node",
    "--format=cjs",
    "--sourcemap",
    "--external:fetch",
    "--external:fs",
    "--external:path",
    "--external:os",
    "--external:child_process",
  ].join(" ");

  execSync(cmd);
}

async function buildConfigTsWithNodeModule() {
  const { build } = await import("esbuild");

  await build({
    entryPoints: [getConfigTsPath()],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: getConfigJsPath(),
    external: ["fetch", "fs", "path", "os", "child_process"],
    sourcemap: true,
  });
}

function readConfigJs(): string | undefined {
  const configJsPath = getConfigJsPath();

  if (!fs.existsSync(configJsPath)) {
    return undefined;
  }

  return fs.readFileSync(configJsPath, "utf8");
}

async function buildConfigTsandReadConfigJs(ide: IDE, ideType: IdeType) {
  const configTsPath = getConfigTsPath();

  if (!fs.existsSync(configTsPath)) {
    return;
  }

  const currentContent = fs.readFileSync(configTsPath, "utf8");

  // If the user hasn't modified the default config.ts, don't bother building
  if (currentContent.trim() === DEFAULT_CONFIG_TS_CONTENTS.trim()) {
    return;
  }

  // Only bother with esbuild if config.ts is actually customized
  if (currentContent.trim() !== DEFAULT_CONFIG_TS_CONTENTS.trim()) {
    const ok = await handleEsbuildInstallation(ide, ideType);
    if (!ok) {
      // esbuild not available → we already showed a friendly message; skip building
      return;
    }
    const buildSucceeded = await tryBuildConfigTs();
    if (!buildSucceeded) {
      return;
    }
  }

  return readConfigJs();
}

async function loadContinueConfigFromJson(
  ide: IDE,
  ideSettings: IdeSettings,
  ideInfo: IdeInfo,
  uniqueId: string,
  llmLogger: ILLMLogger,
  overrideConfigJson: SerializedContinueConfig | undefined,
): Promise<ConfigResult<ContinueConfig>> {
  const workspaceConfigs = await getWorkspaceRcConfigs(ide);
  // Serialized config
  let {
    config: serialized,
    errors,
    configLoadInterrupted,
  } = loadSerializedConfig(
    workspaceConfigs,
    ideInfo.ideType,
    overrideConfigJson,
  );

  if (!serialized || configLoadInterrupted) {
    return { errors, config: undefined, configLoadInterrupted: true };
  }

  // Apply shared config
  // TODO: override several of these values with user/org shared config
  const sharedConfig = new GlobalContext().getSharedConfig();
  const withShared = modifyAnyConfigWithSharedConfig(serialized, sharedConfig);

  // Convert serialized to intermediate config
  let intermediate = await serializedToIntermediateConfig(withShared);

  // Apply config.ts to modify intermediate config
  const configJsContents = await buildConfigTsandReadConfigJs(
    ide,
    ideInfo.ideType,
  );
  if (configJsContents) {
    try {
      // Try config.ts first
      const configJsPath = getConfigJsPath();
      let module: any;

      try {
        module = await import(configJsPath);
      } catch (e) {
        console.log(e);
        console.log(
          "Could not load config.ts as absolute path, retrying as file url ...",
        );
        try {
          module = await import(localPathToUri(configJsPath));
        } catch (e) {
          throw new Error("Could not load config.ts as file url either", {
            cause: e,
          });
        }
      }

      if (typeof require !== "undefined") {
        delete require.cache[require.resolve(configJsPath)];
      }
      if (!module.modifyConfig) {
        throw new Error("config.ts does not export a modifyConfig function.");
      }
      intermediate = module.modifyConfig(intermediate);
    } catch (e) {
      console.log("Error loading config.ts: ", e);
    }
  }

  // Convert to final config format
  const { config: finalConfig, errors: finalErrors } =
    await intermediateToFinalConfig({
      config: intermediate,
      ide,
      ideSettings,
      uniqueId,
      llmLogger,
    });
  return {
    config: finalConfig,
    errors: [...(errors ?? []), ...finalErrors],
    configLoadInterrupted: false,
  };
}

export {
  finalToBrowserConfig,
  loadContinueConfigFromJson,
  type BrowserSerializedContinueConfig,
};
