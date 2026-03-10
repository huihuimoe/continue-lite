import { describe, expect, it } from "vitest";
import { AutocompleteSnippetType } from "../../autocomplete/snippets/types";
import type { HelperVars } from "../../autocomplete/util/HelperVars";
import { NEXT_EDIT_MODELS } from "../../llm/constants";
import { createDiff, DiffFormatType } from "../context/diffFormatting";
import type { ModelSpecificContext } from "../types";
import { NextEditProviderFactory } from "../NextEditProviderFactory";
import { SweepNextEditProvider } from "./SweepNextEditProvider";

function buildLines(prefix: string, lineCount: number): string {
  return Array.from(
    { length: lineCount },
    (_, index) => `${prefix}${index}`,
  ).join("\n");
}

function buildContext(overrides?: {
  currentFileContent?: string;
  originalFileContent?: string;
  cursorLine?: number;
  historyContextLines?: number;
}): ModelSpecificContext {
  const currentFileContent =
    overrides?.currentFileContent ?? buildLines("current-", 40);
  const originalFileContent =
    overrides?.originalFileContent ?? buildLines("original-", 40);
  const cursorLine = overrides?.cursorLine ?? 20;

  return {
    helper: {
      fileContents: currentFileContent,
      fileLines: currentFileContent.split("\n"),
      filepath: "file:///workspace/src/example.ts",
      workspaceUris: ["file:///workspace"],
      pos: { line: cursorLine, character: 0 },
      lang: { name: "typescript" },
      modelName: NEXT_EDIT_MODELS.SWEEP_NEXT_EDIT,
      input: {
        completionId: "completion-id",
      },
      options: {},
    } as unknown as HelperVars,
    snippetPayload: {
      rootPathSnippets: [],
      importDefinitionSnippets: [],
      ideSnippets: [],
      recentlyEditedRangeSnippets: [],
      recentlyVisitedRangesSnippets: [
        {
          filepath: "file:///workspace/src/context.ts",
          content: "export const shared = true;",
          type: AutocompleteSnippetType.Code,
        },
      ],
      diffSnippets: [],
      clipboardSnippets: [],
      recentlyOpenedFileSnippets: [],
      staticSnippet: [],
    },
    editableRegionStartLine: 0,
    editableRegionEndLine: 0,
    diffContext: [
      createDiff({
        beforeContent: "const value = 1;\n",
        afterContent: "const value = 2;\n",
        filePath: "file:///workspace/src/example.ts",
        diffType: DiffFormatType.Unified,
        contextLines: 3,
        workspaceDir: "file:///workspace",
      }),
    ],
    autocompleteContext: "",
    historyDiff: createDiff({
      beforeContent: originalFileContent,
      afterContent: currentFileContent,
      filePath: "file:///workspace/src/example.ts",
      diffType: DiffFormatType.Unified,
      contextLines: overrides?.historyContextLines ?? 40,
      workspaceDir: "file:///workspace",
    }),
  };
}

describe("SweepNextEditProvider", () => {
  it("builds prompt metadata with repeated file blocks and rewrite triplets", () => {
    const provider = new SweepNextEditProvider();
    const metadata = provider.buildPromptMetadata(buildContext());

    expect(metadata.prompt.role).toBe("user");
    expect(metadata.prompt.content).toContain(
      "<|file_sep|>src/context.ts\nexport const shared = true;",
    );
    expect(metadata.prompt.content).toContain(
      "<|file_sep|>src/example.ts.diff\noriginal:\nconst value = 1;\nupdated:\nconst value = 2;",
    );
    expect(metadata.userExcerpts).toContain(
      "<|file_sep|>original/src/example.ts",
    );
    expect(metadata.userExcerpts).toContain(
      "<|file_sep|>current/src/example.ts",
    );
    expect(metadata.userExcerpts).toContain(
      "<|file_sep|>updated/src/example.ts",
    );
    expect(metadata.prompt.content).toContain(metadata.userExcerpts);
    expect(metadata.prompt.content).toContain(
      buildLines("current-", 40).split("\n").slice(10, 31).join("\n"),
    );
  });

  it("extracts only the rewritten 21-line body", () => {
    const provider = new SweepNextEditProvider();
    const rewrittenBody = buildLines("rewritten-", 21);

    expect(
      provider.extractCompletion(
        `<|file_sep|>updated/src/example.ts\n${rewrittenBody}\n<|file_sep|>src/ignored.ts\nignored`,
      ),
    ).toBe(rewrittenBody);
  });

  it("reconstructs original window content from compact history diffs", () => {
    const provider = new SweepNextEditProvider();
    const originalLines = Array.from({ length: 40 }, (_, index) => `line-${index}`);
    const currentLines = [...originalLines];
    currentLines[20] = "line-20-updated";

    const metadata = provider.buildPromptMetadata(
      buildContext({
        originalFileContent: originalLines.join("\n"),
        currentFileContent: currentLines.join("\n"),
        historyContextLines: 3,
      }),
    );

    const expectedOriginalWindow = originalLines.slice(10, 31).join("\n");

    expect(metadata.prompt.content).toContain(
      `<|file_sep|>original/src/example.ts\n${expectedOriginalWindow}`,
    );
    expect(metadata.userExcerpts).toContain(expectedOriginalWindow);
  });

  it("preserves indentation on the first extracted completion line", () => {
    const provider = new SweepNextEditProvider();
    const indentedBody = "    if (ready) {\n      run();\n    }";

    expect(
      provider.extractCompletion(
        `<|file_sep|>updated/src/example.ts\n${indentedBody}\n</s>`,
      ),
    ).toBe(indentedBody);
  });

  it("factory selects the sweep provider for supported model names", () => {
    expect(
      NextEditProviderFactory.createProvider(NEXT_EDIT_MODELS.SWEEP_NEXT_EDIT),
    ).toBeInstanceOf(SweepNextEditProvider);
    expect(
      NextEditProviderFactory.createProvider("sweepai/sweep-next-edit"),
    ).toBeInstanceOf(SweepNextEditProvider);
    expect(
      NextEditProviderFactory.createProvider("sweepai/sweep-next-edit:latest"),
    ).toBeInstanceOf(SweepNextEditProvider);
  });
});
