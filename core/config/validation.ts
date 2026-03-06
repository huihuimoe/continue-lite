import { ConfigValidationError } from "@continuedev/config-yaml";

import { ModelDescription, SerializedContinueConfig } from "../";
import { Telemetry } from "../util/posthog";

/**
 * Validates a SerializedContinueConfig object to ensure all properties are correctly formed.
 * @param config The configuration object to validate.
 * @returns An array of error messages if there are any. Otherwise, the config is valid.
 */
export function validateConfig(config: SerializedContinueConfig) {
  const errors: ConfigValidationError[] = [];

  // Validate chat models
  if (!Array.isArray(config.models)) {
    errors.push({
      fatal: true,
      message: "The 'models' field should be an array.",
    });
  } else {
    config.models.forEach((model, index) => {
      if (typeof model.title !== "string" || model.title.trim() === "") {
        errors.push({
          fatal: true,
          message: `Model at index ${index} has an invalid or missing 'title'.`,
        });
      }
      if (typeof model.provider !== "string") {
        errors.push({
          fatal: true,
          message: `Model at index ${index} has an invalid 'provider'.`,
        });
      }

      if (model.contextLength && model.completionOptions?.maxTokens) {
        const difference =
          model.contextLength - model.completionOptions.maxTokens;

        if (difference < 1000) {
          errors.push({
            fatal: false,
            message: `Model "${model.title}" has a contextLength of ${model.contextLength} and a maxTokens of ${model.completionOptions.maxTokens}. This leaves only ${difference} tokens for input context and will likely result in your inputs being truncated.`,
          });
        }
      }
    });
  }

  // Validate tab autocomplete model(s)
  if (config.tabAutocompleteModel) {
    function validateTabAutocompleteModel(modelDescription: ModelDescription) {
      const modelName = modelDescription.model.toLowerCase();
      const nonAutocompleteModels = [
        // "gpt",
        // "claude",
        "mistral",
        "instruct",
      ];

      if (
        nonAutocompleteModels.some((m) => modelName.includes(m)) &&
        !modelName.includes("deepseek") &&
        !modelName.includes("codestral") &&
        !modelName.toLowerCase().includes("coder")
      ) {
        errors.push({
          fatal: false,
          message: `${modelDescription.model} is not trained for tab-autocomplete, and will result in low-quality suggestions. See the docs to learn more about why: https://docs.continue.dev/features/tab-autocomplete#i-want-better-completions-should-i-use-gpt-4`,
        });
      }
    }

    if (Array.isArray(config.tabAutocompleteModel)) {
      config.tabAutocompleteModel.forEach(validateTabAutocompleteModel);
    } else {
      validateTabAutocompleteModel(config.tabAutocompleteModel);
    }
  }

  // Validate other boolean flags
  const booleanFlags: Array<
    keyof Pick<SerializedContinueConfig, "allowAnonymousTelemetry">
  > = ["allowAnonymousTelemetry"];

  booleanFlags.forEach((flag) => {
    if (config[flag] !== undefined && typeof config[flag] !== "boolean") {
      errors.push({
        fatal: true,
        message: `The '${flag}' field should be a boolean if defined.`,
      });
    }
  });

  if (errors.length > 0) {
    void Telemetry.capture(
      "configValidationError",
      {
        errors,
      },
      true,
    );

    return errors;
  }

  return undefined;
}
