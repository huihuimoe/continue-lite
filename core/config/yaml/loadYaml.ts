import {
  AssistantUnrolled,
  AssistantUnrolledNonNullable,
  BLOCK_TYPES,
  ConfigResult,
  ConfigValidationError,
  mergeConfigYamlRequestOptions,
  mergeUnrolledAssistants,
  PackageIdentifier,
  RegistryClient,
  unrollAssistant,
  validateConfigYaml,
} from "@continuedev/config-yaml";
import { dirname } from "node:path";

import { ContinueConfig, IDE, IdeSettings, ILLMLogger } from "../..";
import { ControlPlaneClient } from "../../control-plane/client";
import { GlobalContext } from "../../util/GlobalContext";
import { modifyAnyConfigWithSharedConfig } from "../sharedConfig";

import { getControlPlaneEnvSync } from "../../control-plane/env";
import { getCleanUriPath } from "../../util/uri";
import { getAllDotContinueDefinitionFiles } from "../loadLocalAssistants";
import { unrollLocalYamlBlocks } from "./loadLocalYamlBlocks";
import { LocalPlatformClient } from "./LocalPlatformClient";
import { llmsFromModelConfig } from "./models";
import { convertYamlRuleToContinueRule } from "./ruleConversion";

const RETAINED_YAML_BLOCK_TYPES = new Set(["models", "data", "rules"]);

async function loadConfigYaml(options: {
  overrideConfigYaml: AssistantUnrolled | undefined;
  controlPlaneClient: ControlPlaneClient;
  orgScopeId: string | null;
  ideSettings: IdeSettings;
  ide: IDE;
  packageIdentifier: PackageIdentifier;
}): Promise<ConfigResult<AssistantUnrolled>> {
  const {
    overrideConfigYaml,
    controlPlaneClient,
    orgScopeId,
    ideSettings,
    ide,
    packageIdentifier,
  } = options;

  // Add local .continue blocks
  // Use "content" field to pass pre-read content directly, avoiding
  // fs.readFileSync which fails for vscode-remote:// URIs in WSL (#6242, #7810)
  const localBlockPromises = BLOCK_TYPES.filter((blockType) =>
    RETAINED_YAML_BLOCK_TYPES.has(blockType),
  ).map(async (blockType) => {
    const localBlocks = await getAllDotContinueDefinitionFiles(
      ide,
      { includeGlobal: true, includeWorkspace: true, fileExtType: "yaml" },
      blockType,
    );
    return localBlocks.map((b) => ({
      uriType: "file" as const,
      fileUri: b.path,
      content: b.content,
    }));
  });
  const localPackageIdentifiers: PackageIdentifier[] = (
    await Promise.all(localBlockPromises)
  ).flat();

  // logger.info(
  //   `Loading config.yaml from ${JSON.stringify(packageIdentifier)} with root path ${rootPath}`,
  // );

  // Registry client is only used if local blocks are present, but logic same for hub/local assistants
  const getRegistryClient = async () => {
    const rootPath =
      packageIdentifier.uriType === "file"
        ? dirname(getCleanUriPath(packageIdentifier.fileUri))
        : undefined;
    return new RegistryClient({
      accessToken: await controlPlaneClient.getAccessToken(),
      apiBase: getControlPlaneEnvSync(ideSettings.continueTestEnvironment)
        .CONTROL_PLANE_URL,
      rootPath,
    });
  };

  const errors: ConfigValidationError[] = [];

  let config: AssistantUnrolled | undefined;

  if (overrideConfigYaml) {
    config = overrideConfigYaml;
    if (localPackageIdentifiers.length > 0) {
      const unrolledLocal = await unrollLocalYamlBlocks(
        localPackageIdentifiers,
        ide,
        await getRegistryClient(),
        orgScopeId,
        controlPlaneClient,
      );
      if (unrolledLocal.errors) {
        errors.push(...unrolledLocal.errors);
      }
      if (unrolledLocal.config) {
        config = mergeUnrolledAssistants(config, unrolledLocal.config);
      }
    }
  } else {
    // This is how we allow use of blocks locally
    const unrollResult = await unrollAssistant(
      packageIdentifier,
      await getRegistryClient(),
      {
        renderSecrets: true,
        currentUserSlug: "",
        onPremProxyUrl: null,
        orgScopeId,
        platformClient: new LocalPlatformClient(
          orgScopeId,
          controlPlaneClient,
          ide,
        ),
        injectBlocks: localPackageIdentifiers,
      },
    );
    config = unrollResult.config;
    if (unrollResult.errors) {
      errors.push(...unrollResult.errors);
    }
  }

  if (config) {
    errors.push(...validateConfigYaml(nonNullifyConfigYaml(config)));
  }

  if (errors?.some((error) => error.fatal)) {
    return {
      errors,
      config: undefined,
      configLoadInterrupted: true,
    };
  }

  // Set defaults if undefined (this lets us keep config.json uncluttered for new users)
  return {
    config,
    errors,
    configLoadInterrupted: false,
  };
}

function nonNullifyConfigYaml(
  unrolledAssistant: AssistantUnrolled,
): AssistantUnrolledNonNullable {
  return {
    name: unrolledAssistant.name,
    version: unrolledAssistant.version,
    schema: unrolledAssistant.schema,
    metadata: unrolledAssistant.metadata,
    env: unrolledAssistant.env,
    requestOptions: unrolledAssistant.requestOptions,
    data: unrolledAssistant.data?.filter((k) => !!k),
    models: unrolledAssistant.models?.filter((k) => !!k),
    rules: unrolledAssistant.rules?.filter((k) => !!k).map((k) => k!),
  };
}

export async function configYamlToContinueConfig(options: {
  unrolledAssistant: AssistantUnrolled;
  uniqueId: string;
  llmLogger: ILLMLogger;
}): Promise<{ config: ContinueConfig; errors: ConfigValidationError[] }> {
  let { unrolledAssistant, uniqueId, llmLogger } = options;

  const localErrors: ConfigValidationError[] = [];

  const continueConfig: ContinueConfig = {
    modelsByRole: {
      autocomplete: [],
    },
    selectedModelByRole: {
      autocomplete: null,
    },
    rules: [],
    requestOptions: { ...unrolledAssistant.requestOptions },
  };

  const config = nonNullifyConfigYaml(unrolledAssistant);

  for (const rule of config.rules ?? []) {
    const convertedRule = convertYamlRuleToContinueRule(rule);
    continueConfig.rules.push(convertedRule);
  }

  continueConfig.data = config.data?.map((d) => ({
    ...d,
    requestOptions: mergeConfigYamlRequestOptions(
      d.requestOptions,
      continueConfig.requestOptions,
    ),
  }));

  // Models
  for (const model of config.models ?? []) {
    const roles = model.roles ?? ["autocomplete"];
    try {
      const llms = await llmsFromModelConfig({
        model,
        uniqueId,
        llmLogger,
        config: continueConfig,
      });

      if (roles.includes("autocomplete")) {
        const autocompleteModels =
          continueConfig.modelsByRole.autocomplete ?? [];
        autocompleteModels.push(...llms);
        continueConfig.modelsByRole.autocomplete = autocompleteModels;
      }
    } catch (e) {
      localErrors.push({
        fatal: false,
        message: `Failed to load model:\nName: ${model.name}\nModel: ${model.model}\nProvider: ${model.provider}\n${e instanceof Error ? e.message : e}`,
      });
    }
  }

  return { config: continueConfig, errors: localErrors };
}

export async function loadContinueConfigFromYaml(options: {
  ide: IDE;
  ideSettings: IdeSettings;
  uniqueId: string;
  llmLogger: ILLMLogger;
  overrideConfigYaml: AssistantUnrolled | undefined;
  controlPlaneClient: ControlPlaneClient;
  orgScopeId: string | null;
  packageIdentifier: PackageIdentifier;
}): Promise<ConfigResult<ContinueConfig>> {
  const {
    ide,
    ideSettings,
    uniqueId,
    llmLogger,
    overrideConfigYaml,
    controlPlaneClient,
    orgScopeId,
    packageIdentifier,
  } = options;

  const configYamlResult = await loadConfigYaml({
    overrideConfigYaml,
    controlPlaneClient,
    orgScopeId,
    ideSettings,
    ide,
    packageIdentifier,
  });

  if (!configYamlResult.config || configYamlResult.configLoadInterrupted) {
    return {
      errors: configYamlResult.errors,
      config: undefined,
      configLoadInterrupted: true,
    };
  }

  const { config: continueConfig, errors: localErrors } =
    await configYamlToContinueConfig({
      unrolledAssistant: configYamlResult.config,
      uniqueId,
      llmLogger,
    });

  // Apply shared config
  // TODO: override several of these values with user/org shared config
  // Don't try catch this - has security implications and failure should be fatal
  const sharedConfig = new GlobalContext().getSharedConfig();
  const withShared = modifyAnyConfigWithSharedConfig(
    continueConfig,
    sharedConfig,
  );

  return {
    config: withShared,
    errors: [...(configYamlResult.errors ?? []), ...localErrors],
    configLoadInterrupted: false,
  };
}
