import {
  AssistantUnrolled,
  ConfigResult,
  ConfigValidationError,
  PackageIdentifier,
} from "@continuedev/config-yaml";

import {
  ContinueConfig,
  IDE,
  ILLMLogger,
  SerializedContinueConfig,
} from "../../";
import { ControlPlaneClient } from "../../control-plane/client.js";
import { PolicySingleton } from "../../control-plane/PolicySingleton";
import { getConfigYamlPath } from "../../util/paths";
import { Telemetry } from "../../util/posthog";
import { TTS } from "../../util/tts";
import { getWorkspaceContinueRuleDotFiles } from "../getWorkspaceContinueRuleDotFiles";
import { CodebaseRulesCache } from "../markdown/loadCodebaseRules";
import { loadMarkdownRules } from "../markdown/loadMarkdownRules";
import { rectifySelectedModelsFromGlobalContext } from "../selectedModels";
import { loadContinueConfigFromYaml } from "../yaml/loadYaml";

async function loadRules(ide: IDE) {
  const errors = [];

  // Add rules from .continuerules files
  const { rules: yamlRules, errors: continueRulesErrors } =
    await getWorkspaceContinueRuleDotFiles(ide);
  errors.push(...continueRulesErrors);

  // Add rules from markdown files in .continue/rules
  const { rules: markdownRules, errors: markdownRulesErrors } =
    await loadMarkdownRules(ide);
  errors.push(...markdownRulesErrors);

  // Add colocated rules from CodebaseRulesCache
  const codebaseRulesCache = CodebaseRulesCache.getInstance();
  errors.push(...codebaseRulesCache.errors);

  const rules = [...codebaseRulesCache.rules, ...markdownRules, ...yamlRules];

  return { rules, errors };
}

export default async function doLoadConfig(options: {
  ide: IDE;
  controlPlaneClient: ControlPlaneClient;
  llmLogger: ILLMLogger;
  overrideConfigJson?: SerializedContinueConfig;
  overrideConfigYaml?: AssistantUnrolled;
  profileId: string;
  overrideConfigYamlByPath?: string;
  orgScopeId: string | null;
  packageIdentifier: PackageIdentifier;
}): Promise<ConfigResult<ContinueConfig>> {
  const {
    ide,
    controlPlaneClient,
    llmLogger,
    overrideConfigYaml,
    profileId,
    overrideConfigYamlByPath,
    orgScopeId,
    packageIdentifier,
  } = options;

  const ideInfo = await ide.getIdeInfo();
  const uniqueId = await ide.getUniqueId();
  const ideSettings = await ide.getIdeSettings();

  const configYamlPath =
    overrideConfigYamlByPath || getConfigYamlPath(ideInfo.ideType);
  const yamlPackageIdentifier: PackageIdentifier =
    packageIdentifier.uriType === "file"
      ? {
          ...packageIdentifier,
          fileUri: configYamlPath,
        }
      : packageIdentifier;

  let newConfig: ContinueConfig | undefined;
  let errors: ConfigValidationError[] | undefined;
  let configLoadInterrupted = false;

  const result = await loadContinueConfigFromYaml({
    ide,
    ideSettings,
    uniqueId,
    llmLogger,
    overrideConfigYaml,
    controlPlaneClient,
    orgScopeId,
    packageIdentifier: yamlPackageIdentifier,
  });
  newConfig = result.config;
  errors = result.errors;
  configLoadInterrupted = result.configLoadInterrupted;

  if (configLoadInterrupted || !newConfig) {
    return { errors, config: newConfig, configLoadInterrupted: true };
  }

  // TODO using config result but result with non-fatal errors is an antipattern?
  // Remove ability have undefined errors, just have an array
  errors = [...(errors ?? [])];

  // Load rules and always include the RulesContextProvider
  const { rules, errors: rulesErrors } = await loadRules(ide);
  errors.push(...rulesErrors);
  newConfig.rules.unshift(...rules);

  // Rectify model selections for each role
  newConfig = rectifySelectedModelsFromGlobalContext(newConfig, profileId);

  const ruleCounts: Record<string, number> = {};
  newConfig.rules.forEach((rule) => {
    if (rule.name) {
      if (ruleCounts[rule.name]) {
        ruleCounts[rule.name] = ruleCounts[rule.name] + 1;
      } else {
        ruleCounts[rule.name] = 1;
      }
    }
  });

  Object.entries(ruleCounts).forEach(([ruleName, count]) => {
    if (count > 1) {
      errors!.push({
        fatal: false,
        message: `Duplicate (${count}) rules named "${ruleName}" detected. This may cause unexpected behavior`,
      });
    }
  });

  // VS Code has an IDE telemetry setting
  // Since it's a security concern we use OR behavior on false
  if (
    newConfig.allowAnonymousTelemetry !== false &&
    ideInfo.ideType === "vscode"
  ) {
    if ((await ide.isTelemetryEnabled()) === false) {
      newConfig.allowAnonymousTelemetry = false;
    }
  }

  // Org policies
  const policy = PolicySingleton.getInstance().policy?.policy;
  if (policy?.allowAnonymousTelemetry === false) {
    newConfig.allowAnonymousTelemetry = false;
  }

  // Setup telemetry only after (and if) we know it is enabled
  await Telemetry.setup(
    newConfig.allowAnonymousTelemetry ?? true,
    await ide.getUniqueId(),
    ideInfo,
  );

  // TODO: pass config to pre-load non-system TTS models
  await TTS.setup();

  if (newConfig.analytics) {
    // Analytics providers are removed from lite runtime.
  }

  return { config: newConfig, errors, configLoadInterrupted: false };
}
