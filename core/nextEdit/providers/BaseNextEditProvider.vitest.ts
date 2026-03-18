import { describe, expect, it } from "vitest";

import type { HelperVars } from "../../autocomplete/util/HelperVars";
import type { IDE, ILLM } from "../../index";
import type { ModelSpecificContext, Prompt, PromptMetadata } from "../types";
import { BaseNextEditModelProvider } from "./BaseNextEditProvider";

class TestProvider extends BaseNextEditModelProvider {
  constructor() {
    super("test-provider");
  }

  getSystemPrompt(): string {
    return "";
  }

  async generatePrompts(_context: ModelSpecificContext): Promise<Prompt[]> {
    return [];
  }

  extractCompletion(message: string): string {
    return message;
  }

  buildPromptContext(_context: ModelSpecificContext): any {
    return {};
  }

  buildPromptMetadata(_context: ModelSpecificContext): PromptMetadata {
    return {
      prompt: {
        role: "user",
        content: "prompt",
      },
      userEdits: "",
      userExcerpts: "",
    };
  }

  getWindowSize() {
    return { topMargin: 0, bottomMargin: 0 };
  }

  calculateEditableRegion(_helper: HelperVars, _usingFullFileDiff: boolean) {
    return {
      editableRegionStartLine: 0,
      editableRegionEndLine: 9,
    };
  }
}

describe("BaseNextEditModelProvider full-file diff jump metadata", () => {
  it("keeps the nearest non-cursor diff group as jump metadata", async () => {
    const provider = new TestProvider();

    const helper = {
      fileLines: [
        "const a = 1;",
        "const b = 2;",
        "const c = 3;",
        "const d = 4;",
        "const e = 5;",
        "const f = 6;",
        "const g = 7;",
        "const h = 8;",
        "const i = 9;",
        "const j = 10;",
      ],
      fileContents: [
        "const a = 1;",
        "const b = 2;",
        "const c = 3;",
        "const d = 4;",
        "const e = 5;",
        "const f = 6;",
        "const g = 7;",
        "const h = 8;",
        "const i = 9;",
        "const j = 10;",
      ].join("\n"),
      pos: { line: 1, character: 0 },
      input: { completionId: "completion-id" },
      filepath: "file:///workspace/example.ts",
      workspaceUris: ["file:///workspace"],
      options: {},
    } as unknown as HelperVars;

    const llm = {
      underlyingProviderName: "test",
      model: "test-model",
      lastRequestId: "request-id",
    } as ILLM;

    const ide = {
      getRepoName: async () => "repo",
      getUniqueId: async () => "unique-id",
    } as IDE;

    const outcome = await provider.handleFullFileDiff({
      helper,
      editableRegionStartLine: 0,
      editableRegionEndLine: 9,
      startTime: Date.now(),
      llm,
      nextCompletion: [
        "const a = 1;",
        "const b = 20;",
        "const c = 3;",
        "const d = 4;",
        "const e = 5;",
        "const f = 6;",
        "const g = 70;",
        "const h = 8;",
        "const i = 9;",
        "const j = 10;",
      ].join("\n"),
      promptMetadata: {
        prompt: {
          role: "user",
          content: "prompt",
        },
        userEdits: "",
        userExcerpts: "",
      },
      ide,
    });

    expect(outcome).toEqual(
      expect.objectContaining({
        completion: "const b = 20;",
        nextJumpPosition: { line: 6, character: 0 },
        nextJumpContent: "const g = 70;",
      }),
    );
  });

  it("rebases jump metadata onto post-acceptance lines when the accepted hunk inserts lines above it", async () => {
    const provider = new TestProvider();

    const helper = {
      fileLines: [
        "const a = 1;",
        "const b = 2;",
        "const c = 3;",
        "const d = 4;",
        "const e = 5;",
        "const f = 6;",
        "const g = 7;",
        "const h = 8;",
        "const i = 9;",
        "const j = 10;",
      ],
      fileContents: [
        "const a = 1;",
        "const b = 2;",
        "const c = 3;",
        "const d = 4;",
        "const e = 5;",
        "const f = 6;",
        "const g = 7;",
        "const h = 8;",
        "const i = 9;",
        "const j = 10;",
      ].join("\n"),
      pos: { line: 1, character: 0 },
      input: { completionId: "completion-id" },
      filepath: "file:///workspace/example.ts",
      workspaceUris: ["file:///workspace"],
      options: {},
    } as unknown as HelperVars;

    const llm = {
      underlyingProviderName: "test",
      model: "test-model",
      lastRequestId: "request-id",
    } as ILLM;

    const ide = {
      getRepoName: async () => "repo",
      getUniqueId: async () => "unique-id",
    } as IDE;

    const outcome = await provider.handleFullFileDiff({
      helper,
      editableRegionStartLine: 0,
      editableRegionEndLine: 9,
      startTime: Date.now(),
      llm,
      nextCompletion: [
        "const a = 1;",
        "const b = 20;",
        "const bExtra = 21;",
        "const bExtraTwo = 22;",
        "const c = 3;",
        "const d = 4;",
        "const e = 5;",
        "const f = 6;",
        "const g = 70;",
        "const h = 8;",
        "const i = 9;",
        "const j = 10;",
      ].join("\n"),
      promptMetadata: {
        prompt: {
          role: "user",
          content: "prompt",
        },
        userEdits: "",
        userExcerpts: "",
      },
      ide,
    });

    expect(outcome).toEqual(
      expect.objectContaining({
        completion: [
          "const b = 20;",
          "const bExtra = 21;",
          "const bExtraTwo = 22;",
        ].join("\n"),
        nextJumpPosition: { line: 8, character: 0 },
        nextJumpContent: "const g = 70;",
      }),
    );
  });
});
