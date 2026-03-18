import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NextEditProvider } from "./NextEditProvider";
import type { PromptMetadata } from "./types";

describe("NextEditProvider request dispatch", () => {
  beforeEach(() => {
    // @ts-ignore resetting singleton for test isolation
    NextEditProvider.instance = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // @ts-ignore resetting singleton for test isolation
    NextEditProvider.instance = null;
  });

  it("uses raw completion for providers that request complete-mode inference", async () => {
    const llm = {
      complete: vi.fn().mockResolvedValue("rewritten body"),
      chat: vi.fn().mockResolvedValue({ role: "assistant", content: "unused" }),
      completionOptions: {},
      model: "sweepai/sweep-next-edit:latest",
      underlyingProviderName: "ollama",
    } as any;

    const modelProvider = {
      shouldInjectUniqueToken: vi.fn().mockReturnValue(false),
      getInferenceOptions: vi.fn().mockReturnValue({
        mode: "complete",
        completionOptions: {
          raw: true,
          stop: ["<|file_sep|>", "</s>"],
          temperature: 0,
        },
      }),
      extractCompletion: vi.fn((message: string) => message),
      handleFullFileDiff: vi.fn().mockResolvedValue({
        completion: "rewritten body",
        diffLines: [],
        editableRegionStartLine: 0,
        editableRegionEndLine: 20,
      }),
      handlePartialFileDiff: vi.fn(),
    } as any;

    const provider = Object.create(NextEditProvider.prototype) as any;
    provider.modelProvider = modelProvider;
    provider.endpointType = "fineTuned";
    provider.previousCompletions = [];
    provider.promptMetadata = {
      prompt: {
        role: "user",
        content: "PROMPT",
      },
      userEdits: "",
      userExcerpts: "",
    } satisfies PromptMetadata;
    provider.configHandler = { getActiveProfile: () => undefined };
    provider.ide = {};
    provider._prepareLlm = vi.fn().mockResolvedValue(llm);

    const helper = {
      prunedPrefix: "",
      prunedSuffix: "",
      pos: { line: 10, character: 0 },
      input: { completionId: "completion-id" },
    } as any;

    const result = await provider._handleCompletion(
      helper,
      [
        { role: "system", content: "" },
        { role: "user", content: "PROMPT" },
      ],
      new AbortController().signal,
      Date.now(),
      0,
      20,
      { withChain: false, usingFullFileDiff: true },
    );

    expect(llm.complete).toHaveBeenCalledWith(
      "PROMPT",
      expect.any(AbortSignal),
      expect.objectContaining({
        raw: true,
        stop: ["<|file_sep|>", "</s>"],
        temperature: 0,
      }),
    );
    expect(llm.chat).not.toHaveBeenCalled();
    expect(modelProvider.handleFullFileDiff).toHaveBeenCalledWith(
      expect.objectContaining({
        nextCompletion: "rewritten body",
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        completion: "rewritten body",
      }),
    );
  });

  it("keeps chat-mode inference for providers that do not request raw completion", async () => {
    const llm = {
      complete: vi.fn().mockResolvedValue("unused"),
      chat: vi
        .fn()
        .mockResolvedValue({ role: "assistant", content: "chat body" }),
      completionOptions: {},
      model: "instinct",
      underlyingProviderName: "ollama",
    } as any;

    const modelProvider = {
      shouldInjectUniqueToken: vi.fn().mockReturnValue(false),
      getInferenceOptions: vi.fn().mockReturnValue({
        mode: "chat",
      }),
      extractCompletion: vi.fn((message: string) => message),
      handleFullFileDiff: vi.fn().mockResolvedValue({
        completion: "chat body",
        diffLines: [],
        editableRegionStartLine: 0,
        editableRegionEndLine: 20,
      }),
      handlePartialFileDiff: vi.fn(),
    } as any;

    const provider = Object.create(NextEditProvider.prototype) as any;
    provider.modelProvider = modelProvider;
    provider.endpointType = "fineTuned";
    provider.previousCompletions = [];
    provider.promptMetadata = {
      prompt: {
        role: "user",
        content: "PROMPT",
      },
      userEdits: "",
      userExcerpts: "",
    } satisfies PromptMetadata;
    provider.configHandler = { getActiveProfile: () => undefined };
    provider.ide = {};
    provider._prepareLlm = vi.fn().mockResolvedValue(llm);

    const helper = {
      prunedPrefix: "",
      prunedSuffix: "",
      pos: { line: 10, character: 0 },
      input: { completionId: "completion-id" },
    } as any;

    await provider._handleCompletion(
      helper,
      [
        { role: "system", content: "" },
        { role: "user", content: "PROMPT" },
      ],
      new AbortController().signal,
      Date.now(),
      0,
      20,
      { withChain: false, usingFullFileDiff: true },
    );

    expect(llm.chat).toHaveBeenCalled();
    expect(llm.complete).not.toHaveBeenCalled();
  });
});
