import { ConfigJson } from "@continuedev/config-types";
import { ConfigYaml } from "./schemas/index.js";
import { ModelConfig } from "./schemas/models.js";

type ModelYaml = ModelConfig;
type PromptYaml = NonNullable<ConfigYaml["prompts"]>[number];

function convertModel(
  m: ConfigJson["models"][number],
  roles: NonNullable<ModelYaml["roles"]>,
): ModelYaml {
  return {
    name: m.title,
    provider: m.provider,
    model: m.model,
    apiKey: m.apiKey,
    apiBase: m.apiBase,
    roles,
    requestOptions: m.requestOptions,
    defaultCompletionOptions: m.completionOptions,
  };
}

function convertCustomCommand(
  cmd: NonNullable<ConfigJson["customCommands"]>[number],
): PromptYaml {
  return {
    name: cmd.name,
    description: cmd.description,
    prompt: (cmd as any).prompt, // The type is wrong in @continuedev/config-types
  };
}

function convertMcp(mcp: any): NonNullable<ConfigYaml["mcpServers"]>[number] {
  const { transport } = mcp;
  const { command, args, env, server_name } = transport;

  return {
    command,
    args,
    env,
    name: server_name || "MCP Server",
  };
}

function convertDoc(
  doc: NonNullable<ConfigJson["docs"]>[number],
): NonNullable<ConfigYaml["docs"]>[number] {
  return {
    name: doc.title,
    startUrl: doc.startUrl,
    rootUrl: doc.rootUrl,
    faviconUrl: doc.faviconUrl,
  };
}

export function convertJsonToYamlConfig(configJson: ConfigJson): ConfigYaml {
  // models
  const models = configJson.models.map((m) =>
    convertModel(m, ["autocomplete"]),
  );
  const autocompleteModels = Array.isArray(configJson.tabAutocompleteModel)
    ? configJson.tabAutocompleteModel
    : configJson.tabAutocompleteModel
      ? [configJson.tabAutocompleteModel]
      : [];
  models.push(
    ...autocompleteModels.map((m) => convertModel(m, ["autocomplete"])),
  );

  // mcpServers
  // Types for "experimental" don't exist
  const mcpServers = (
    configJson as any
  ).experimental?.modelContextProtocolServers?.map(convertMcp);

  // prompts
  const prompts = configJson.customCommands?.map(convertCustomCommand);

  // docs
  const docs = configJson.docs?.map(convertDoc);

  const configYaml: ConfigYaml = {
    name: "Continue Config",
    version: "0.0.1",
    models,
    rules: configJson.systemMessage ? [configJson.systemMessage] : undefined,
    prompts,
    mcpServers,
    docs,
    requestOptions: configJson.requestOptions,
  };

  return configYaml;
}
