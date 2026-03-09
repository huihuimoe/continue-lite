// https://medium.com/@disparate-ai/not-all-tokens-are-created-equal-7347d549af4d
const ANTHROPIC_TOKEN_MULTIPLIER = 1.23;
const GEMINI_TOKEN_MULTIPLIER = 1.18;
const MISTRAL_TOKEN_MULTIPLIER = 1.26;

export function getAdjustedTokenCountFromModel(
  baseTokens: number,
  modelName: string,
): number {
  let multiplier = 1;
  const lowerModelName = modelName?.toLowerCase() ?? "";
  if (lowerModelName.includes("claude")) {
    multiplier = ANTHROPIC_TOKEN_MULTIPLIER;
  } else if (lowerModelName.includes("gemini")) {
    multiplier = GEMINI_TOKEN_MULTIPLIER;
  } else if (
    lowerModelName.includes("stral") ||
    lowerModelName.includes("mixtral")
  ) {
    // Mistral family models: mistral, mixtral, codestral, devstral, etc
    multiplier = MISTRAL_TOKEN_MULTIPLIER;
  }
  return Math.ceil(baseTokens * multiplier);
}
