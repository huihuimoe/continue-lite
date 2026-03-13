import z from "zod";

import {
  BrowserSerializedContinueConfig,
  Config,
  ContinueConfig,
  SerializedContinueConfig,
} from "..";

export const sharedConfigSchema = z
  .object({
    // `experimental` in `ContinueConfig`
    useCurrentFileAsContext: z.boolean(),
    enableStaticContextualization: z.boolean(),

    // `tabAutocompleteOptions` in `ContinueConfig`
    useAutocompleteCache: z.boolean(),
    useAutocompleteMultilineCompletions: z.enum(["always", "never", "auto"]),
    disableAutocompleteInFiles: z.array(z.string()),
    modelTimeout: z.number(),
    debounceDelay: z.number(),
  })
  .partial();

export type SharedConfigSchema = z.infer<typeof sharedConfigSchema>;

// For security in case of damaged config file, try to salvage any security-related values
export function salvageSharedConfig(sharedConfig: object): SharedConfigSchema {
  const salvagedConfig: SharedConfigSchema = {};
  if ("disableAutocompleteInFiles" in sharedConfig) {
    const val = sharedConfigSchema.shape.disableAutocompleteInFiles.safeParse(
      sharedConfig.disableAutocompleteInFiles,
    );
    if (val.success) {
      salvagedConfig.disableAutocompleteInFiles = val.data;
    }
  }
  return salvagedConfig;
}

// Apply shared config to all forms of config
// - SerializedContinueConfig (config.json)
// - Config ("intermediate") - passed to config.ts
// - ContinueConfig
// - BrowserSerializedContinueConfig (final converted to be passed to GUI)

// This modify function is split into two steps
// - rectifySharedModelsFromSharedConfig - includes boolean flags like allowAnonymousTelemetry which
//   must be added BEFORE config.ts and remote server config apply for JSON
//   for security reasons
// - setSharedModelsFromSharedConfig - exists because of selectedModelsByRole
//   Which don't exist on SerializedContinueConfig/Config types, so must be added after the fact
export function modifyAnyConfigWithSharedConfig<
  T extends
    | ContinueConfig
    | BrowserSerializedContinueConfig
    | Config
    | SerializedContinueConfig,
>(continueConfig: T, sharedConfig: SharedConfigSchema): T {
  const configCopy = { ...continueConfig };
  configCopy.tabAutocompleteOptions = {
    ...configCopy.tabAutocompleteOptions,
  };
  if (sharedConfig.useAutocompleteCache !== undefined) {
    configCopy.tabAutocompleteOptions.useCache =
      sharedConfig.useAutocompleteCache;
  }
  if (sharedConfig.useAutocompleteMultilineCompletions !== undefined) {
    configCopy.tabAutocompleteOptions.multilineCompletions =
      sharedConfig.useAutocompleteMultilineCompletions;
  }
  if (sharedConfig.disableAutocompleteInFiles !== undefined) {
    configCopy.tabAutocompleteOptions.disableInFiles =
      sharedConfig.disableAutocompleteInFiles;
  }
  if (sharedConfig.modelTimeout !== undefined) {
    configCopy.tabAutocompleteOptions.modelTimeout = sharedConfig.modelTimeout;
  }
  if (sharedConfig.debounceDelay !== undefined) {
    configCopy.tabAutocompleteOptions.debounceDelay =
      sharedConfig.debounceDelay;
  }

  configCopy.experimental = {
    ...configCopy.experimental,
  };

  if (sharedConfig.useCurrentFileAsContext !== undefined) {
    configCopy.experimental.useCurrentFileAsContext =
      sharedConfig.useCurrentFileAsContext;
  }

  if (sharedConfig.enableStaticContextualization !== undefined) {
    configCopy.experimental.enableStaticContextualization =
      sharedConfig.enableStaticContextualization;
  }

  return configCopy;
}
