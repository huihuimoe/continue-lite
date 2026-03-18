import * as z from "zod";
import { commonModelSlugs } from "./commonSlugs.js";
import { dataSchema } from "./data/index.js";
import {
  modelSchema,
  partialModelSchema,
  requestOptionsSchema,
} from "./models.js";

const contextSchema = z.object({
  name: z.string().optional(),
  provider: z.string(),
  params: z.any().optional(),
});

const promptSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  prompt: z.string(),
  sourceFile: z.string().optional(),
});

const docSchema = z.object({
  name: z.string(),
  startUrl: z.string(),
  rootUrl: z.string().optional(),
  faviconUrl: z.string().optional(),
  sourceFile: z.string().optional(),
});

const mcpServerEnvSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean()]),
);

const mcpServerSchema = z.object({
  name: z.string(),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: mcpServerEnvSchema.optional(),
  sourceSlug: z.string().optional(),
  sourceFile: z.string().optional(),
});

const ruleObjectSchema = z.object({
  name: z.string(),
  rule: z.string(),
  description: z.string().optional(),
  globs: z.union([z.string(), z.array(z.string())]).optional(),
  regex: z.union([z.string(), z.array(z.string())]).optional(),
  alwaysApply: z.boolean().optional(),
  invokable: z.boolean().optional(),
  sourceFile: z.string().optional(),
});
const ruleSchema = z.union([z.string(), ruleObjectSchema]);

/**
 * A schema for rules.json files
 */
const rulesJsonSchema = z.object({
  name: z.string(),
  version: z.string(),
  author: z.string().optional(),
  license: z.string().optional(),
  rules: z.record(z.string(), z.string()).optional(),
});

export type Rule = z.infer<typeof ruleSchema>;
export type RuleObject = z.infer<typeof ruleObjectSchema>;
/**
 * A schema for rules.json files
 */
type RulesJson = z.infer<typeof rulesJsonSchema>;

const defaultUsesSchema = z.string();

type AnyObjectSchema = z.ZodObject<z.ZodRawShape>;

const blockItemWrapperSchema = <T extends AnyObjectSchema>(
  schema: T,
  usesSchema: z.ZodTypeAny = defaultUsesSchema,
) =>
  z.object({
    uses: usesSchema,
    with: z.record(z.string(), z.string()).optional(),
    override: schema.partial().optional(),
  });

const blockOrSchema = <T extends AnyObjectSchema>(
  schema: T,
  usesSchema: z.ZodTypeAny = defaultUsesSchema,
) => z.union([schema, blockItemWrapperSchema(schema, usesSchema)]);

const commonMetadataSchema = z.object({
  tags: z.string().optional(),
  sourceCodeUrl: z.string().optional(),
  description: z.string().optional(),
  author: z.string().optional(),
  license: z.string().optional(),
  iconUrl: z.string().optional(),
});

const envRecord = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean()]),
);

const baseConfigYamlSchema = z.object({
  name: z.string(),
  version: z.string(),
  schema: z.string().optional(),
  metadata: z
    .record(z.string(), z.string())
    .and(commonMetadataSchema.partial())
    .optional(),
  env: envRecord.optional(),
  requestOptions: requestOptionsSchema.optional(),
});

const modelsUsesSchema = z
  .string()
  .or(z.enum(commonModelSlugs as [string, ...string[]]));

export const configYamlSchema = baseConfigYamlSchema.extend({
  models: z
    .array(
      z.union([
        modelSchema,
        z.object({
          uses: modelsUsesSchema,
          with: z.record(z.string(), z.string()).optional(),
          override: partialModelSchema.optional(),
        }),
      ]),
    )
    .optional(),
  context: z.array(blockOrSchema(contextSchema)).optional(),
  data: z.array(blockOrSchema(dataSchema)).optional(),
  mcpServers: z.array(blockOrSchema(mcpServerSchema)).optional(),
  rules: z
    .array(
      z.union([
        ruleSchema,
        z.object({
          uses: defaultUsesSchema,
          with: z.record(z.string(), z.string()).optional(),
        }),
      ]),
    )
    .optional(),
  prompts: z.array(blockOrSchema(promptSchema)).optional(),
  docs: z.array(blockOrSchema(docSchema)).optional(),
});

export type ConfigYaml = z.infer<typeof configYamlSchema>;

export const assistantUnrolledSchema = baseConfigYamlSchema.extend({
  models: z.array(modelSchema.nullable()).optional(),
  context: z.array(contextSchema.nullable()).optional(),
  data: z.array(dataSchema.nullable()).optional(),
  mcpServers: z.array(mcpServerSchema.nullable()).optional(),
  rules: z.array(ruleSchema.nullable()).optional(),
  prompts: z.array(promptSchema.nullable()).optional(),
  docs: z.array(docSchema.nullable()).optional(),
});

export type AssistantUnrolled = z.infer<typeof assistantUnrolledSchema>;

const assistantUnrolledSchemaNonNullable = baseConfigYamlSchema.extend({
  models: z.array(modelSchema).optional(),
  context: z.array(contextSchema).optional(),
  data: z.array(dataSchema).optional(),
  mcpServers: z.array(mcpServerSchema).optional(),
  rules: z.array(ruleSchema).optional(),
  prompts: z.array(promptSchema).optional(),
  docs: z.array(docSchema).optional(),
});

export type AssistantUnrolledNonNullable = z.infer<
  typeof assistantUnrolledSchemaNonNullable
>;

const isAssistantUnrolledNonNullable = (
  a: AssistantUnrolled,
): a is AssistantUnrolledNonNullable =>
  (!a.models || a.models.every((m) => m !== null)) &&
  (!a.context || a.context.every((c) => c !== null)) &&
  (!a.data || a.data.every((d) => d !== null)) &&
  (!a.rules || a.rules.every((r) => r !== null)) &&
  (!a.mcpServers || a.mcpServers.every((mcp) => mcp !== null)) &&
  (!a.prompts || a.prompts.every((prompt) => prompt !== null)) &&
  (!a.docs || a.docs.every((doc) => doc !== null));

export const blockSchema = baseConfigYamlSchema.and(
  z.union([
    z.object({ models: z.array(modelSchema).length(1) }),
    z.object({ context: z.array(contextSchema).length(1) }),
    z.object({ data: z.array(dataSchema).length(1) }),
    z.object({ mcpServers: z.array(mcpServerSchema).length(1) }),
    z.object({
      rules: z.array(ruleSchema).length(1),
    }),
    z.object({ prompts: z.array(promptSchema).length(1) }),
    z.object({ docs: z.array(docSchema).length(1) }),
  ]),
);

export type Block = z.infer<typeof blockSchema>;

const languageMarkerSchema = z.object({
  language: z.string(),
  markers: z.array(z.string()),
});

const autoindentExtensionsSchema = z.array(z.string());

const configSchema = z.object({
  models: z.array(modelSchema).optional(),
  defaultRecentMessages: z.number().optional(),
  langMarkers: z.array(languageMarkerSchema).optional(),
  tabAutocompleteModel: z.string().optional(),
  rules: z.array(ruleObjectSchema).optional(),
  doneWithBannerForever: z.boolean().optional(),
  autoindentExtensions: autoindentExtensionsSchema.optional(),
  proxy: z.string().optional(),
  api_base: z.string().optional(),
  api_key: z.string().optional(),
  env: envRecord.optional(),
  requestOptions: requestOptionsSchema.optional(),
});

type Config = z.infer<typeof configSchema>;
