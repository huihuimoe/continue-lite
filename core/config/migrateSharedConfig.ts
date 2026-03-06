/**
 * I'm disabling this rule for the entire file under the assumption
 * that this is a one-time migration script. I'm expecting this
 * code to be removed in the future.
 */
/* eslint-disable max-statements */

import { deduplicateArray } from "../util";
import { GlobalContext } from "../util/GlobalContext";
import { resolveSerializedConfig } from "./load";
import { SharedConfigSchema } from "./sharedConfig";

/*
  This migration function eliminates deprecated values from the json file
  And writes them to the shared config
*/
export function migrateJsonSharedConfig(filepath: string): void {
  const globalContext = new GlobalContext();
  const currentSharedConfig = globalContext.getSharedConfig(); // for merging security concerns

  try {
    let config = resolveSerializedConfig(filepath);
    const shareConfigUpdates: SharedConfigSchema = {};

    let effected = false;

    const { allowAnonymousTelemetry, ...withoutAllowTelemetry } = config;
    if (allowAnonymousTelemetry !== undefined) {
      if (currentSharedConfig.allowAnonymousTelemetry !== false) {
        // safe merge for security
        shareConfigUpdates.allowAnonymousTelemetry = allowAnonymousTelemetry;
      }
      config = withoutAllowTelemetry;
      effected = true;
    }

    const { tabAutocompleteOptions, ...withoutAutocompleteOptions } = config;
    if (tabAutocompleteOptions !== undefined) {
      let migratedAutocomplete = { ...tabAutocompleteOptions };

      const { useCache, ...withoutUseCache } = migratedAutocomplete;
      if (useCache !== undefined) {
        shareConfigUpdates.useAutocompleteCache = useCache;
        migratedAutocomplete = withoutUseCache;
        effected = true;
      }

      const { multilineCompletions, ...withoutMultiline } =
        migratedAutocomplete;
      if (multilineCompletions !== undefined) {
        shareConfigUpdates.useAutocompleteMultilineCompletions =
          multilineCompletions;
        migratedAutocomplete = withoutMultiline;
        effected = true;
      }

      const { disableInFiles, ...withoutDisableInFiles } = migratedAutocomplete;
      if (disableInFiles !== undefined) {
        if (currentSharedConfig.disableAutocompleteInFiles !== undefined) {
          // safe merge for security
          shareConfigUpdates.disableAutocompleteInFiles = deduplicateArray(
            [
              ...currentSharedConfig.disableAutocompleteInFiles,
              ...disableInFiles,
            ],
            (a, b) => a === b,
          );
        } else {
          shareConfigUpdates.disableAutocompleteInFiles = disableInFiles;
        }
        shareConfigUpdates.disableAutocompleteInFiles = disableInFiles;
        migratedAutocomplete = withoutDisableInFiles;
        effected = true;
      }

      if (Object.keys(migratedAutocomplete).length > 0) {
        config = {
          ...withoutAutocompleteOptions,
          tabAutocompleteOptions: migratedAutocomplete,
        };
      } else {
        config = withoutAutocompleteOptions;
      }
    }

    const { experimental, ...withoutExperimental } = config;
    if (experimental !== undefined) {
      let migratedExperimental = { ...experimental };

      if (Object.keys(migratedExperimental).length > 0) {
        config = {
          ...withoutExperimental,
          experimental: migratedExperimental,
        };
      } else {
        config = withoutExperimental;
      }
    }

    if (effected) {
      new GlobalContext().updateSharedConfig(shareConfigUpdates);
    }
  } catch (e) {
    console.error(`Migration: Failed to parse config.json: ${e}`);
  }
}
