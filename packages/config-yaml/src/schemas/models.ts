import { z } from "zod";

const clientCertificateOptionsSchema = z.object({
  cert: z.string(),
  key: z.string(),
  passphrase: z.string().optional(),
});
type ClientCertificateOptions = z.infer<typeof clientCertificateOptionsSchema>;

export const requestOptionsSchema = z.object({
  timeout: z.number().optional(),
  verifySsl: z.boolean().optional(),
  caBundlePath: z.union([z.string(), z.array(z.string())]).optional(),
  proxy: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  extraBodyProperties: z.record(z.string(), z.any()).optional(),
  noProxy: z.array(z.string()).optional(),
  clientCertificate: clientCertificateOptionsSchema.optional(),
});
export type RequestOptions = z.infer<typeof requestOptionsSchema>;
const modelRolesSchema = z.enum([
  "chat",
  "autocomplete",
  "embed",
  "rerank",
  "edit",
  "apply",
  "summarize",
  "subagent",
]);
export type ModelRole = z.infer<typeof modelRolesSchema>;

// TODO consider just using array of strings for model capabilities
// To allow more dynamic string parsing
const modelCapabilitySchema = z.union([
  z.literal("tool_use"),
  z.literal("image_input"),
  z.literal("next_edit"),
  z.string(), // Needed for forwards compatibility, see https://github.com/continuedev/continue/pull/7676
]);

// not ideal but lose type suggestions if use z.infer because of the string fallback
type ModelCapability = "tool_use" | "image_input" | "next_edit";

export const completionOptionsSchema = z.object({
  contextLength: z.number().optional(),
  maxTokens: z.number().optional(),
  temperature: z.number().optional(),
  topP: z.number().optional(),
  topK: z.number().optional(),
  minP: z.number().optional(),
  presencePenalty: z.number().optional(),
  frequencyPenalty: z.number().optional(),
  stop: z.array(z.string()).optional(),
  n: z.number().optional(),
  reasoning: z.boolean().optional(),
  reasoningBudgetTokens: z.number().optional(),
  promptCaching: z.boolean().optional(),
  stream: z.boolean().optional(),
});
type CompletionOptions = z.infer<typeof completionOptionsSchema>;

const embeddingTasksSchema = z.union([z.literal("chunk"), z.literal("query")]);
type EmbeddingTasks = z.infer<typeof embeddingTasksSchema>;

const embeddingPrefixesSchema = z.record(embeddingTasksSchema, z.string());
type EmbeddingPrefixes = z.infer<typeof embeddingPrefixesSchema>;

const cacheBehaviorSchema = z.object({
  cacheSystemMessage: z.boolean().optional(),
  cacheConversation: z.boolean().optional(),
});
type CacheBehavior = z.infer<typeof cacheBehaviorSchema>;

const embedOptionsSchema = z
  .object({
    maxChunkSize: z.unknown().optional(),
    maxBatchSize: z.unknown().optional(),
    embeddingPrefixes: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();
type EmbedOptions = z.infer<typeof embedOptionsSchema>;

const chatOptionsSchema = z.object({
  baseSystemMessage: z.string().optional(),
  baseAgentSystemMessage: z.string().optional(),
  basePlanSystemMessage: z.string().optional(),
});
type ChatOptions = z.infer<typeof chatOptionsSchema>;

const templateSchema = z.enum([
  "llama2",
  "alpaca",
  "zephyr",
  "phi2",
  "phind",
  "anthropic",
  "chatml",
  "none",
  "openchat",
  "deepseek",
  "xwin-coder",
  "neural-chat",
  "codellama-70b",
  "llava",
  "gemma",
  "granite",
  "llama3",
  "codestral",
]);

const autocompleteOptionsSchema = z.object({
  disable: z.boolean().optional(),
  maxPromptTokens: z.number().optional(),
  debounceDelay: z.number().optional(),
  modelTimeout: z.number().optional(),
  maxSuffixPercentage: z.number().optional(),
  prefixPercentage: z.number().optional(),
  transform: z.boolean().optional(),
  template: z.string().optional(),
  onlyMyCode: z.boolean().optional(),
  useCache: z.boolean().optional(),
  useImports: z.boolean().optional(),
  useRecentlyEdited: z.boolean().optional(),
  useRecentlyOpened: z.boolean().optional(),
  // Experimental options: true = enabled, false = disabled, number = enabled w priority
  experimental_includeClipboard: z.boolean().optional(),
  experimental_includeRecentlyVisitedRanges: z.boolean().optional(),
  experimental_includeRecentlyEditedRanges: z.boolean().optional(),
  experimental_includeDiff: z.boolean().optional(),
  experimental_enableStaticContextualization: z.boolean().optional(),
});

/** Prompt templates use Handlebars syntax */
const promptTemplatesSchema = z.object({
  apply: z.string().optional(),
  chat: templateSchema.optional(),
  edit: z.string().optional(),
  autocomplete: z.string().optional(),
});
export type PromptTemplates = z.infer<typeof promptTemplatesSchema>;

const baseModelFields = {
  name: z.string(),
  model: z.string(),
  apiKey: z.string().optional(),
  apiBase: z.string().optional(),
  maxStopWords: z.number().optional(),
  roles: modelRolesSchema.array().optional(),
  capabilities: modelCapabilitySchema.array().optional(),
  defaultCompletionOptions: completionOptionsSchema.optional(),
  cacheBehavior: cacheBehaviorSchema.optional(),
  requestOptions: requestOptionsSchema.optional(),
  embedOptions: embedOptionsSchema.optional(),
  chatOptions: chatOptionsSchema.optional(),
  promptTemplates: promptTemplatesSchema.optional(),
  useLegacyCompletionsEndpoint: z.never().optional(),
  env: z
    .record(z.string(), z.union([z.string(), z.boolean(), z.number()]))
    .optional(),
  autocompleteOptions: autocompleteOptionsSchema.optional(),
};

export const modelSchema = z.object({
  ...baseModelFields,
  provider: z.string(),
  sourceFile: z.string().optional(),
});

export const partialModelSchema = modelSchema.partial();

export type ModelConfig = z.infer<typeof modelSchema>;
