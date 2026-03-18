#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const EVIDENCE_DIR = path.join(REPO_ROOT, ".sisyphus", "evidence");
const CORE_PROBE_SCRIPT = path.join(
  SCRIPT_DIR,
  "sweep-next-edit-smoke-core.ts",
);

const DEFAULTS = {
  apiBase: "http://localhost:11434",
  mode: "fim",
  provider: "ollama",
  model: "sweepai/sweep-next-edit",
  maxTokens: 96,
  temperature: 0,
};

const MODE_EXPECTATIONS = {
  fim: {
    requiredPromptFragments: [
      "<|file_sep|>sweep-next-edit.ts",
      "<|fim_prefix|>",
      "<|fim_suffix|>",
      "<|fim_middle|>",
    ],
    requiredCompletionFragments: ["prefix + name"],
    forbiddenCompletionFragments: [
      "<|fim_prefix|>",
      "<|fim_suffix|>",
      "<|file_sep|>",
    ],
  },
  "next-edit": {
    requiredPromptFragments: [
      "<|file_sep|>current/sweep-next-edit.ts",
      "<|file_sep|>updated/sweep-next-edit.ts",
      "original",
      "current",
      "updated",
    ],
    requiredCompletionFragments: ["prefix + name"],
    forbiddenCompletionFragments: [
      "<|fim_prefix|>",
      "<|fim_suffix|>",
      "<|file_sep|>",
    ],
  },
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

export function getDefaultEvidenceFilename({
  mode = "fim",
  expectMissing,
  provider = "ollama",
}) {
  const providerPrefix = provider === "ollama" ? "ollama" : provider;

  if (mode === "next-edit") {
    return expectMissing
      ? `task-10-${providerPrefix}-next-edit-smoke-error.json`
      : `task-10-${providerPrefix}-next-edit-smoke.json`;
  }

  return expectMissing
    ? `task-5-${providerPrefix}-fim-smoke-error.json`
    : `task-5-${providerPrefix}-fim-smoke.json`;
}

export function findMatchingModelEntry(models, requestedModel) {
  return models.find((model) => {
    const identifier = model?.name ?? model?.id;
    if (!identifier) {
      return false;
    }
    return (
      identifier === requestedModel ||
      identifier.startsWith(`${requestedModel}:`)
    );
  });
}

export function assertExpectation({ mode, prompt, completion }) {
  const expectation = MODE_EXPECTATIONS[mode];
  if (!expectation) {
    throw new Error(`No expectation configured for mode ${mode}.`);
  }

  for (const fragment of expectation.requiredPromptFragments) {
    if (!prompt.includes(fragment)) {
      throw new Error(
        `Generated prompt for ${mode} is missing required fragment: ${fragment}`,
      );
    }
  }

  for (const fragment of expectation.requiredCompletionFragments) {
    if (!completion.includes(fragment)) {
      throw new Error(
        `Completion for ${mode} is missing required fragment: ${fragment}`,
      );
    }
  }

  for (const fragment of expectation.forbiddenCompletionFragments) {
    if (completion.includes(fragment)) {
      throw new Error(
        `Completion for ${mode} still contains prompt artifact: ${fragment}`,
      );
    }
  }
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

  if (!["ollama", "openai"].includes(args.provider)) {
    throw new Error(
      `Unsupported provider: ${args.provider}. Supported providers: --provider=ollama or --provider=openai.`,
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

function summarizeModelListResponse(provider, body) {
  if (provider === "ollama") {
    const models = Array.isArray(body?.models) ? body.models : [];
    return {
      models,
      identifiers: models.map((model) => model.name),
    };
  }

  const models = Array.isArray(body?.data) ? body.data : [];
  return {
    models,
    identifiers: models.map((model) => model.id),
  };
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

function runCoreProbe(options) {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const payload = Buffer.from(JSON.stringify(options), "utf8").toString(
    "base64",
  );
  const result = spawnSync(
    npmCommand,
    [
      "--prefix",
      "core",
      "exec",
      "--",
      "tsx",
      CORE_PROBE_SCRIPT,
      `--payload=${payload}`,
    ],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
    },
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      result.stderr.trim() ||
        result.stdout.trim() ||
        `Core probe exited with status ${result.status}`,
    );
  }

  try {
    const lines = result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const jsonLine = [...lines].reverse().find((line) => line.startsWith("{"));
    if (!jsonLine) {
      throw new Error("No JSON payload found in core probe output.");
    }
    return JSON.parse(jsonLine);
  } catch (error) {
    throw new Error(`Failed to parse core probe output: ${result.stdout}`);
  }
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
    const modelsEndpoint =
      options.provider === "ollama"
        ? `${options.apiBase}/api/tags`
        : `${options.apiBase}/models`;
    const modelsResponse = runCurlJson(["-sS", modelsEndpoint]);
    if (modelsResponse.statusCode !== 200) {
      throw new Error(
        `${options.provider} model listing returned HTTP ${modelsResponse.statusCode}.`,
      );
    }

    const preflightModels = summarizeModelListResponse(
      options.provider,
      modelsResponse.body,
    );
    const matchedModel = findMatchingModelEntry(
      preflightModels.models,
      options.model,
    );

    evidence.preflight = {
      modelIdentifiers: preflightModels.identifiers,
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

    if (options.provider === "ollama") {
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

      if (
        options.mode === "fim" &&
        !evidence.preflight.show.templateHasSuffix
      ) {
        throw new Error(
          `Ollama model ${options.model} does not advertise a .Suffix-aware template; repository FIM path will refuse this model.`,
        );
      }
    }

    const startedAtMs = Date.now();
    const probe = runCoreProbe(options);

    evidence.prompt = probe.prompt;
    evidence.expected = MODE_EXPECTATIONS[options.mode];
    evidence.result = {
      durationMs: Date.now() - startedAtMs,
      ...probe.result,
    };

    const completion =
      typeof probe.result?.completion === "string"
        ? probe.result.completion
        : "";

    if (!completion.trim()) {
      throw new Error(
        "Smoke request completed but returned an empty completion.",
      );
    }

    assertExpectation({
      mode: options.mode,
      prompt: probe.prompt.prompt,
      completion,
    });

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
