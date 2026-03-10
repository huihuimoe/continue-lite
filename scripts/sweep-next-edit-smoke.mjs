#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const CORE_DIST_DIR = path.join(REPO_ROOT, "core", "dist");
const EVIDENCE_DIR = path.join(REPO_ROOT, ".sisyphus", "evidence");

const DEFAULTS = {
  apiBase: "http://localhost:11434",
  mode: "fim",
  provider: "ollama",
  model: "sweepai/sweep-next-edit",
  maxTokens: 96,
  temperature: 0,
};

const SAMPLE = {
  filepath: "file:///smoke/sweep-next-edit.ts",
  prefix: [
    "export function greet(name: string) {",
    '  const prefix = "Hello, ";',
    "  const message = ",
  ].join("\n"),
  suffix: [";", "  return message;", "}", ""].join("\n"),
};

export function getDefaultEvidenceFilename({ mode = "fim", expectMissing }) {
  if (mode === "next-edit") {
    return expectMissing
      ? "task-10-ollama-next-edit-smoke-error.json"
      : "task-10-ollama-next-edit-smoke.json";
  }

  return expectMissing
    ? "task-5-ollama-fim-smoke-error.json"
    : "task-5-ollama-fim-smoke.json";
}

export function findMatchingModelEntry(models, requestedModel) {
  return models.find((model) => {
    if (!model?.name) {
      return false;
    }
    return (
      model.name === requestedModel ||
      model.name.startsWith(`${requestedModel}:`)
    );
  });
}

export function summarizeShowResponse(showResponse) {
  const modelInfo = {};

  if (showResponse?.model_info?.["general.architecture"] !== undefined) {
    modelInfo.architecture = showResponse.model_info["general.architecture"];
  }
  if (showResponse?.model_info?.["general.parameter_count"] !== undefined) {
    modelInfo.parameterCount =
      showResponse.model_info["general.parameter_count"];
  }
  if (showResponse?.model_info?.["qwen2.context_length"] !== undefined) {
    modelInfo.qwen2ContextLength =
      showResponse.model_info["qwen2.context_length"];
  }

  return {
    template: showResponse?.template ?? null,
    templateHasSuffix:
      typeof showResponse?.template === "string" &&
      showResponse.template.includes(".Suffix"),
    capabilities: Array.isArray(showResponse?.capabilities)
      ? showResponse.capabilities
      : [],
    details: showResponse?.details ?? null,
    modelInfo,
  };
}

export function parseArgs(argv) {
  const args = {
    ...DEFAULTS,
    expectMissing: false,
    evidence: undefined,
  };

  for (const rawArg of argv) {
    if (!rawArg.startsWith("--")) {
      throw new Error(`Unexpected argument: ${rawArg}`);
    }

    if (rawArg === "--expect-missing") {
      args.expectMissing = true;
      continue;
    }

    const equalIndex = rawArg.indexOf("=");
    if (equalIndex === -1) {
      throw new Error(`Expected --key=value format, received ${rawArg}`);
    }

    const key = rawArg.slice(2, equalIndex);
    const value = rawArg.slice(equalIndex + 1);

    switch (key) {
      case "api-base":
        args.apiBase = value;
        break;
      case "mode":
        args.mode = value;
        break;
      case "provider":
        args.provider = value;
        break;
      case "model":
        args.model = value;
        break;
      case "evidence":
        args.evidence = value;
        break;
      case "max-tokens":
        args.maxTokens = Number.parseInt(value, 10);
        break;
      case "temperature":
        args.temperature = Number.parseFloat(value);
        break;
      default:
        throw new Error(`Unknown argument: --${key}`);
    }
  }

  if (args.mode !== "fim" && args.mode !== "next-edit") {
    throw new Error(
      `Unsupported mode: ${args.mode}. Supported values: --mode=fim or --mode=next-edit.`,
    );
  }

  if (args.provider !== "ollama") {
    throw new Error(
      `Unsupported provider: ${args.provider}. Only --provider=ollama is implemented.`,
    );
  }

  if (!Number.isFinite(args.maxTokens) || args.maxTokens <= 0) {
    throw new Error(
      `--max-tokens must be a positive integer. Received ${args.maxTokens}.`,
    );
  }

  if (!Number.isFinite(args.temperature)) {
    throw new Error(
      `--temperature must be a number. Received ${args.temperature}.`,
    );
  }

  return args;
}

function serializeError(error) {
  return {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  };
}

function runCurlJson(curlArgs) {
  const command = process.platform === "win32" ? "curl.exe" : "curl";
  const result = spawnSync(command, [...curlArgs, "-w", "\n%{http_code}"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      result.stderr.trim() || `curl exited with status ${result.status}`,
    );
  }

  const trimmed = result.stdout.trim();
  const lastNewline = trimmed.lastIndexOf("\n");
  if (lastNewline === -1) {
    throw new Error(`Unable to parse curl response: ${trimmed}`);
  }

  const body = trimmed.slice(0, lastNewline);
  const statusCode = Number.parseInt(trimmed.slice(lastNewline + 1), 10);
  if (!Number.isFinite(statusCode)) {
    throw new Error(`Unable to parse curl HTTP status from: ${trimmed}`);
  }

  let parsedBody;
  try {
    parsedBody = JSON.parse(body);
  } catch (error) {
    throw new Error(`Failed to parse JSON response from curl: ${body}`);
  }

  return {
    statusCode,
    body: parsedBody,
  };
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureCoreDist() {
  const sentinel = path.join(CORE_DIST_DIR, "llm", "llms", "Ollama.js");
  if (await pathExists(sentinel)) {
    return;
  }

  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npmCommand, ["--prefix", "core", "run", "build"], {
    cwd: REPO_ROOT,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `npm --prefix core run build failed with status ${result.status}`,
    );
  }
}

async function importCoreModules() {
  await ensureCoreDist();

  const [
    { default: Ollama },
    { CompletionStreamer },
    { renderPrompt },
    { SweepNextEditProvider },
  ] = await Promise.all([
    import(
      pathToFileURL(path.join(CORE_DIST_DIR, "llm", "llms", "Ollama.js")).href
    ),
    import(
      pathToFileURL(
        path.join(
          CORE_DIST_DIR,
          "autocomplete",
          "generation",
          "CompletionStreamer.js",
        ),
      ).href
    ),
    import(
      pathToFileURL(
        path.join(CORE_DIST_DIR, "autocomplete", "templating", "index.js"),
      ).href
    ),
    import(
      pathToFileURL(
        path.join(
          CORE_DIST_DIR,
          "nextEdit",
          "providers",
          "SweepNextEditProvider.js",
        ),
      ).href
    ),
  ]);

  return { Ollama, CompletionStreamer, renderPrompt, SweepNextEditProvider };
}

function buildSmokeRenderContext(model) {
  const workspaceUri = pathToFileURL(REPO_ROOT).href;

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
  };
}

function buildNextEditSmokeContext(model) {
  const workspaceUri = pathToFileURL(REPO_ROOT).href;
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
  };
}

async function writeEvidence(evidencePath, payload) {
  await mkdir(path.dirname(evidencePath), { recursive: true });
  await writeFile(
    evidencePath,
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8",
  );
}

async function waitForFimSupport(llm, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (llm.supportsFim()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(
    `Ollama never reported FIM support for ${llm.model} within ${timeoutMs}ms.`,
  );
}

async function collect(generator) {
  const chunks = [];
  for await (const chunk of generator) {
    chunks.push(chunk);
  }
  return chunks;
}

export async function runSmokeHarness(rawArgs = process.argv.slice(2)) {
  const options = parseArgs(rawArgs);
  const evidenceFilename =
    options.evidence ?? getDefaultEvidenceFilename(options);
  const evidencePath = path.isAbsolute(evidenceFilename)
    ? evidenceFilename
    : path.join(EVIDENCE_DIR, evidenceFilename);

  const evidence = {
    script: path.relative(REPO_ROOT, fileURLToPath(import.meta.url)),
    startedAt: new Date().toISOString(),
    mode: options.mode,
    provider: options.provider,
    model: options.model,
    apiBase: options.apiBase,
    expectMissing: options.expectMissing,
    evidencePath: path.relative(REPO_ROOT, evidencePath),
  };

  try {
    const tagsResponse = runCurlJson(["-sS", `${options.apiBase}/api/tags`]);
    if (tagsResponse.statusCode !== 200) {
      throw new Error(
        `Ollama /api/tags returned HTTP ${tagsResponse.statusCode}.`,
      );
    }

    const models = Array.isArray(tagsResponse.body?.models)
      ? tagsResponse.body.models
      : [];
    const matchedModel = findMatchingModelEntry(models, options.model);

    evidence.preflight = {
      tagNames: models.map((model) => model.name),
      matchedModel: matchedModel ?? null,
    };

    if (options.expectMissing && matchedModel) {
      evidence.status = "unexpected-model-presence";
      evidence.finishedAt = new Date().toISOString();
      await writeEvidence(evidencePath, evidence);
      return 1;
    }

    if (!matchedModel) {
      evidence.status = options.expectMissing
        ? "expected-missing"
        : "missing-model";
      evidence.finishedAt = new Date().toISOString();
      await writeEvidence(evidencePath, evidence);
      return options.expectMissing ? 0 : 1;
    }

    const showResponse = runCurlJson([
      "-sS",
      `${options.apiBase}/api/show`,
      "-H",
      "Content-Type: application/json",
      "-d",
      JSON.stringify({ name: options.model }),
    ]);

    if (showResponse.statusCode !== 200) {
      throw new Error(
        `Ollama /api/show returned HTTP ${showResponse.statusCode}.`,
      );
    }

    evidence.preflight.show = summarizeShowResponse(showResponse.body);

    if (!evidence.preflight.show.template) {
      throw new Error(
        `Ollama /api/show returned empty metadata for ${options.model}.`,
      );
    }

    if (options.mode === "fim" && !evidence.preflight.show.templateHasSuffix) {
      throw new Error(
        `Ollama model ${options.model} does not advertise a .Suffix-aware template; repository FIM path will refuse this model.`,
      );
    }

    const { Ollama, CompletionStreamer, renderPrompt, SweepNextEditProvider } =
      await importCoreModules();

    const llm = new Ollama({
      apiBase: options.apiBase,
      model: options.model,
      completionOptions: {
        model: options.model,
        maxTokens: options.maxTokens,
        temperature: options.temperature,
      },
    });

    if (options.mode === "fim") {
      const renderContext = buildSmokeRenderContext(options.model);
      const promptContext = renderPrompt(renderContext);

      evidence.prompt = {
        filepath: SAMPLE.filepath,
        prefix: promptContext.prefix,
        suffix: promptContext.suffix,
        prompt: promptContext.prompt,
        completionOptions: promptContext.completionOptions ?? {},
      };

      await waitForFimSupport(llm, 5000);

      const streamer = new CompletionStreamer(() => {});
      const abortController = new AbortController();
      const startedAtMs = Date.now();
      const chunks = await collect(
        streamer.streamCompletionWithFilters(
          abortController.signal,
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

      evidence.result = {
        durationMs: Date.now() - startedAtMs,
        chunkCount: chunks.length,
        chunks,
        completion,
        completionLength: completion.trim().length,
      };

      if (!completion.trim()) {
        throw new Error(
          "Smoke request completed but returned an empty completion.",
        );
      }
    } else {
      const provider = new SweepNextEditProvider();
      const nextEditContext = buildNextEditSmokeContext(options.model);
      const prompts = await provider.generatePrompts(nextEditContext);
      const promptMetadata = provider.buildPromptMetadata(nextEditContext);
      const editableRegion = provider.calculateEditableRegion(
        nextEditContext.helper,
        false,
      );

      evidence.prompt = {
        filepath: SAMPLE.filepath,
        promptRole: promptMetadata.prompt.role,
        prompt: promptMetadata.prompt.content,
        promptMessages: prompts,
        userEdits: promptMetadata.userEdits,
        userExcerpts: promptMetadata.userExcerpts,
        editableRegion,
      };

      const abortController = new AbortController();
      const startedAtMs = Date.now();
      const message = await llm.chat(prompts, abortController.signal, {
        stream: false,
        model: options.model,
        maxTokens: options.maxTokens,
        temperature: options.temperature,
      });
      const rawCompletion =
        typeof message.content === "string" ? message.content : "";
      const completion = provider.extractCompletion(rawCompletion);

      evidence.result = {
        durationMs: Date.now() - startedAtMs,
        rawCompletion,
        rawCompletionLength: rawCompletion.trim().length,
        completion,
        completionLength: completion.trim().length,
      };

      if (!completion.trim()) {
        throw new Error(
          "Next Edit smoke request completed but returned an empty completion.",
        );
      }
    }

    evidence.status = "success";
    evidence.finishedAt = new Date().toISOString();
    await writeEvidence(evidencePath, evidence);
    return 0;
  } catch (error) {
    evidence.status = "error";
    evidence.error = serializeError(error);
    evidence.finishedAt = new Date().toISOString();
    await writeEvidence(evidencePath, evidence);
    return 1;
  }
}

async function main() {
  const exitCode = await runSmokeHarness();
  if (exitCode === 0) {
    console.log("Sweep next-edit smoke finished successfully.");
  } else {
    console.error("Sweep next-edit smoke failed. See evidence for details.");
  }
  process.exit(exitCode);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
const isMain = invokedPath
  ? import.meta.url === pathToFileURL(invokedPath).href
  : false;

if (isMain) {
  await main();
}
