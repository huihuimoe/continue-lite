import { ModelRole } from "@continuedev/config-yaml";

import {
  BrowserSerializedContinueConfig,
  ContinueConfig,
  IDE,
  ILLM,
  ModelDescription,
} from "..";
import { useHub } from "../control-plane/env";
import { serializePromptTemplates } from "./util";

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

export { finalToBrowserConfig, type BrowserSerializedContinueConfig };
