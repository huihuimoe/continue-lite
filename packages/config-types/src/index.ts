import { z } from "zod";

const completionOptionsSchema = z.object({
  temperature: z.number().optional(),
  topP: z.number().optional(),
  topK: z.number().optional(),
  minP: z.number().optional(),
  presencePenalty: z.number().optional(),
  frequencyPenalty: z.number().optional(),
  mirostat: z.number().optional(),
  stop: z.array(z.string()).optional(),
  maxTokens: z.number().optional(),
  numThreads: z.number().optional(),
  useMmap: z.boolean().optional(),
  keepAlive: z.number().optional(),
  numGpu: z.number().optional(),
  raw: z.boolean().optional(),
  stream: z.boolean().optional(),
});
type CompletionOptions = z.infer<typeof completionOptionsSchema>;

const clientCertificateOptionsSchema = z.object({
  cert: z.string(),
  key: z.string(),
  passphrase: z.string().optional(),
});
type ClientCertificateOptions = z.infer<typeof clientCertificateOptionsSchema>;

const requestOptionsSchema = z.object({
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

const modelDescriptionSchema = z.object({
  title: z.string(),
  provider: z.enum([
    "openai",
    "anthropic",
    "cohere",
    "ollama",
    "huggingface-tgi",
    "huggingface-inference-api",
    "replicate",
    "gemini",
    "mistral",
    "cloudflare",
    "azure",
    "ovhcloud",
    "nebius",
    "scaleway",
    "watsonx",
  ]),
  model: z.string(),
  apiKey: z.string().optional(),
  apiBase: z.string().optional(),
  contextLength: z.number().optional(),
  template: z
    .enum([
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
      "llama3",
    ])
    .optional(),
  completionOptions: completionOptionsSchema.optional(),
  systemMessage: z.string().optional(),
  requestOptions: z
    .object({
      timeout: z.number().optional(),
      verifySsl: z.boolean().optional(),
      caBundlePath: z.union([z.string(), z.array(z.string())]).optional(),
      proxy: z.string().optional(),
      headers: z.record(z.string(), z.string()).optional(),
      extraBodyProperties: z.record(z.string(), z.any()).optional(),
      noProxy: z.array(z.string()).optional(),
    })
    .optional(),
  promptTemplates: z.record(z.string(), z.string()).optional(),
});
export type ModelDescription = z.infer<typeof modelDescriptionSchema>;

const uiOptionsSchema = z.object({
  fontSize: z.number().optional(),
  displayRawMarkdown: z.boolean().optional(),
  codeWrap: z.boolean().optional(),
});
type UiOptions = z.infer<typeof uiOptionsSchema>;

const tabAutocompleteOptionsSchema = z.object({
  disable: z.boolean(),
  maxPromptTokens: z.number(),
  debounceDelay: z.number(),
  maxSuffixPercentage: z.number(),
  prefixPercentage: z.number(),
  transform: z.boolean().optional(),
  template: z.string().optional(),
  multilineCompletions: z.enum(["always", "never", "auto"]),
  useCache: z.boolean(),
  onlyMyCode: z.boolean(),
  useRecentlyEdited: z.boolean(),
  disableInFiles: z.array(z.string()).optional(),
  useImports: z.boolean().optional(),
  // Experimental options: true = enabled, false = disabled, number = enabled w priority
  experimental_includeClipboard: z.union([z.boolean(), z.number()]).optional(),
  experimental_includeRecentlyVisitedRanges: z
    .union([z.boolean(), z.number()])
    .optional(),
  experimental_includeRecentlyEditedRanges: z
    .union([z.boolean(), z.number()])
    .optional(),
  experimental_includeDiff: z.union([z.boolean(), z.number()]).optional(),
  experimental_enableStaticContextualization: z.boolean().optional(),
});
type TabAutocompleteOptions = z.infer<typeof tabAutocompleteOptionsSchema>;

const contextProviderSchema = z.object({
  name: z.string(),
  params: z.record(z.string(), z.any()),
});
type ContextProvider = z.infer<typeof contextProviderSchema>;

const analyticsSchema = z.object({
  provider: z.enum([
    "posthog",
    "amplitude",
    "segment",
    "logstash",
    "mixpanel",
    "splunk",
    "datadog",
    "continue-proxy",
  ]),
  url: z.string().optional(),
  clientKey: z.string().optional(),
});
type Analytics = z.infer<typeof analyticsSchema>;

const devDataSchema = z.object({
  url: z.string().optional(),
});
type DevData = z.infer<typeof devDataSchema>;

const customCommandSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  prompt: z.string(),
});
type CustomCommand = z.infer<typeof customCommandSchema>;

const docDescriptionSchema = z.object({
  title: z.string(),
  startUrl: z.string(),
  rootUrl: z.string().optional(),
  faviconUrl: z.string().optional(),
});
type DocDescription = z.infer<typeof docDescriptionSchema>;

const configJsonSchema = z.object({
  models: z.array(modelDescriptionSchema),
  tabAutocompleteModel: modelDescriptionSchema.optional(),
  analytics: analyticsSchema,
  devData: devDataSchema,
  customCommands: z.array(customCommandSchema).optional(),
  docs: z.array(docDescriptionSchema).optional(),
  systemMessage: z.string().optional(),
  completionOptions: completionOptionsSchema.optional(),
  requestOptions: requestOptionsSchema.optional(),
  tabAutocompleteOptions: tabAutocompleteOptionsSchema.optional(),
  ui: uiOptionsSchema.optional(),
});
export type ConfigJson = z.infer<typeof configJsonSchema>;
