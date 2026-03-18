import { CompletionStreamer } from "../core/autocomplete/generation/CompletionStreamer.js";
import { renderPrompt } from "../core/autocomplete/templating/index.js";
import Ollama from "../core/llm/llms/Ollama.js";
import OpenAI from "../core/llm/llms/OpenAI.js";
import { SweepNextEditProvider } from "../core/nextEdit/providers/SweepNextEditProvider.js";

const SAMPLE = {
  filepath: "file:///smoke/sweep-next-edit.ts",
  prefix: [
    "export function greet(name: string) {",
    '  const prefix = "Hello, ";',
    "  const message = ",
  ].join("\n"),
  suffix: [";", "  return message;", "}", ""].join("\n"),
};

type ProbeOptions = {
  mode: "fim" | "next-edit";
  provider: "ollama" | "openai";
  apiBase: string;
  model: string;
  maxTokens: number;
  temperature: number;
};

function buildSmokeRenderContext(model: string) {
  const workspaceUri = new URL("file:///smoke/continue/").href;

  return {
    helper: {
      input: {
        filepath: SAMPLE.filepath,
        pos: { line: 2, character: 18 },
        recentlyEditedRanges: [],
        recentlyVisitedRanges: [],
      },
      prunedPrefix: SAMPLE.prefix,
      prunedSuffix: SAMPLE.suffix,
      prunedCaretWindow: `${SAMPLE.prefix}${SAMPLE.suffix}`,
      lang: {
        name: "TypeScript",
        topLevelKeywords: [],
        singleLineComment: "//",
        endOfLine: [";"],
      },
      modelName: model,
      filepath: SAMPLE.filepath,
      workspaceUris: [workspaceUri],
      options: {
        maxPromptTokens: 2048,
        prefixPercentage: 0.5,
        maxSuffixPercentage: 0.25,
        modelTimeout: 5000,
        debounceDelay: 0,
        transform: false,
        useRecentlyOpened: false,
        onlyMyCode: false,
        experimental_includeClipboard: false,
        experimental_includeRecentlyVisitedRanges: false,
        experimental_includeRecentlyEditedRanges: false,
        experimental_includeDiff: false,
      },
    },
    snippetPayload: {
      rootPathSnippets: [],
      importDefinitionSnippets: [],
      ideSnippets: [],
      recentlyEditedRangeSnippets: [],
      recentlyVisitedRangesSnippets: [],
      diffSnippets: [],
      clipboardSnippets: [],
      recentlyOpenedFileSnippets: [],
      staticSnippet: [],
    },
    workspaceDirs: [workspaceUri],
  } as any;
}

function buildNextEditSmokeContext(model: string) {
  const workspaceUri = new URL("file:///smoke/continue/").href;
  const fileContents = `${SAMPLE.prefix}${SAMPLE.suffix}`;
  const diffContext = [
    [
      "--- a/src/example.ts",
      "+++ b/src/example.ts",
      "@@ -1,3 +1,3 @@",
      " export function greet(name: string) {",
      '-  const prefix = "Hello";',
      '+  const prefix = "Hello, ";',
      "   const message = prefix + name;",
    ].join("\n"),
  ];

  return {
    helper: {
      fileContents,
      fileLines: fileContents.split("\n"),
      filepath: SAMPLE.filepath,
      workspaceUris: [workspaceUri],
      pos: { line: 2, character: 18 },
      lang: { name: "typescript" },
      modelName: model,
      input: {
        completionId: "sweep-next-edit-smoke",
      },
      options: {},
    },
    snippetPayload: {
      rootPathSnippets: [],
      importDefinitionSnippets: [],
      ideSnippets: [],
      recentlyEditedRangeSnippets: [],
      recentlyVisitedRangesSnippets: [
        {
          filepath: "file:///smoke/context.ts",
          content: "export const shared = true;",
          type: "code",
        },
      ],
      diffSnippets: [],
      clipboardSnippets: [],
      recentlyOpenedFileSnippets: [],
      staticSnippet: [],
    },
    editableRegionStartLine: 0,
    editableRegionEndLine: 0,
    diffContext,
    autocompleteContext: "",
    historyDiff: diffContext[0],
  } as any;
}

function buildLlm(options: ProbeOptions) {
  const commonOptions = {
    apiBase: options.apiBase,
    model: options.model,
    completionOptions: {
      model: options.model,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
    },
  };

  if (options.provider === "ollama") {
    return new Ollama(commonOptions);
  }

  return new OpenAI(commonOptions);
}

async function collect(generator: AsyncGenerator<string>) {
  const chunks: string[] = [];
  for await (const chunk of generator) {
    chunks.push(chunk);
  }
  return chunks;
}

async function runProbe(options: ProbeOptions) {
  const llm = buildLlm(options);

  if (options.mode === "fim") {
    const renderContext = buildSmokeRenderContext(options.model);
    const promptContext = renderPrompt(renderContext);
    const streamer = new CompletionStreamer(() => {});
    const chunks = await collect(
      streamer.streamCompletionWithFilters(
        new AbortController().signal,
        llm,
        promptContext.prefix,
        promptContext.suffix,
        promptContext.prompt,
        false,
        {
          ...promptContext.completionOptions,
          model: options.model,
          maxTokens: options.maxTokens,
          temperature: options.temperature,
        },
        renderContext.helper,
      ),
    );
    const completion = chunks.join("");

    return {
      prompt: {
        filepath: SAMPLE.filepath,
        prefix: promptContext.prefix,
        suffix: promptContext.suffix,
        prompt: promptContext.prompt,
        completionOptions: promptContext.completionOptions ?? {},
      },
      result: {
        chunkCount: chunks.length,
        chunks,
        completion,
        completionLength: completion.trim().length,
      },
    };
  }

  const provider = new SweepNextEditProvider();
  const nextEditContext = buildNextEditSmokeContext(options.model);
  const prompts = await provider.generatePrompts(nextEditContext);
  const promptMetadata = provider.buildPromptMetadata(nextEditContext);
  const editableRegion = provider.calculateEditableRegion(
    nextEditContext.helper,
    false,
  );
  const inferenceOptions = provider.getInferenceOptions();

  let rawCompletion = "";
  if (inferenceOptions.mode === "complete") {
    rawCompletion = await llm.complete(
      promptMetadata.prompt.content,
      new AbortController().signal,
      {
        stream: false,
        model: options.model,
        maxTokens: options.maxTokens,
        temperature: options.temperature,
        ...inferenceOptions.completionOptions,
      },
    );
  } else {
    const message = await llm.chat(prompts, new AbortController().signal, {
      stream: false,
      model: options.model,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      ...inferenceOptions.completionOptions,
    });
    rawCompletion = typeof message.content === "string" ? message.content : "";
  }

  const completion = provider.extractCompletion(rawCompletion);

  return {
    prompt: {
      filepath: SAMPLE.filepath,
      promptRole: promptMetadata.prompt.role,
      prompt: promptMetadata.prompt.content,
      promptMessages: prompts,
      userEdits: promptMetadata.userEdits,
      userExcerpts: promptMetadata.userExcerpts,
      editableRegion,
    },
    result: {
      rawCompletion,
      rawCompletionLength: rawCompletion.trim().length,
      completion,
      completionLength: completion.trim().length,
    },
  };
}

async function main() {
  const payloadArg = process.argv.find((arg) => arg.startsWith("--payload="));
  if (!payloadArg) {
    throw new Error("Missing --payload argument.");
  }

  const payload = payloadArg.slice("--payload=".length);
  const options = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
  const result = await runProbe(options);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch((error) => {
  console.error(
    error instanceof Error ? (error.stack ?? error.message) : String(error),
  );
  process.exit(1);
});
