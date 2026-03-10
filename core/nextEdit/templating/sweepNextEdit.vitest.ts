import { describe, expect, it } from "vitest";
import { NEXT_EDIT_MODELS } from "../../llm/constants";
import {
  INSTINCT_USER_PROMPT_PREFIX,
  MERCURY_CURRENT_FILE_CONTENT_OPEN,
  MERCURY_EDIT_DIFF_HISTORY_OPEN,
  MERCURY_RECENTLY_VIEWED_CODE_SNIPPETS_OPEN,
} from "../constants";
import {
  PromptTemplateRenderer,
  getTemplateForModel,
} from "./NextEditPromptEngine";
import {
  buildSweepFileTriplet,
  calculateSweepRewriteWindow,
  formatSweepDiffBlocks,
} from "./sweepNextEdit";

function buildLineContent(prefix: string, lineCount: number) {
  return Array.from({ length: lineCount }, (_, i) => `${prefix}${i}`).join(
    "\n",
  );
}

function renderSweepPrompt() {
  const renderer = new PromptTemplateRenderer(
    getTemplateForModel(NEXT_EDIT_MODELS.SWEEP_NEXT_EDIT),
  );

  return renderer.render({
    contextSnippets: "<|file_sep|>src/context.ts\nexport const shared = true;",
    editDiffHistory:
      "<|file_sep|>src/example.ts.diff\noriginal:\nconst value = 1;\nupdated:\nconst value = 2;",
    currentFilePath: "src/example.ts",
    originalFileContent: "const value = 1;",
    currentFileContent: "const value = 2;",
    updatedFileContent: "const value = 3;",
  });
}

describe("sweep-next-edit prompt template", () => {
  it("renders the official rewrite prompt shape", () => {
    expect(renderSweepPrompt()).toBe(
      "<|file_sep|>src/context.ts\n" +
        "export const shared = true;\n\n" +
        "<|file_sep|>src/example.ts.diff\n" +
        "original:\n" +
        "const value = 1;\n" +
        "updated:\n" +
        "const value = 2;\n\n" +
        "<|file_sep|>original/src/example.ts\n" +
        "const value = 1;\n\n" +
        "<|file_sep|>current/src/example.ts\n" +
        "const value = 2;\n\n" +
        "<|file_sep|>updated/src/example.ts\n" +
        "const value = 3;",
    );
  });

  it("does not reuse instinct or mercury prompt markers", () => {
    const prompt = renderSweepPrompt();

    expect(prompt).not.toContain(INSTINCT_USER_PROMPT_PREFIX);
    expect(prompt).not.toContain("### Context:");
    expect(prompt).not.toContain("### User Edits:");
    expect(prompt).not.toContain("### User Excerpt:");
    expect(prompt).not.toContain(MERCURY_CURRENT_FILE_CONTENT_OPEN);
    expect(prompt).not.toContain(MERCURY_EDIT_DIFF_HISTORY_OPEN);
    expect(prompt).not.toContain(MERCURY_RECENTLY_VIEWED_CODE_SNIPPETS_OPEN);
  });
});

describe("formatSweepDiffBlocks", () => {
  it("renders each recent change as its own .diff pseudo-file block", () => {
    expect(
      formatSweepDiffBlocks([
        {
          filepath: "src/example.ts",
          original: "const value = 1;",
          updated: "const value = 2;",
        },
        {
          filepath: "src/other.ts",
          original: "before",
          updated: "after",
        },
      ]),
    ).toBe(
      "<|file_sep|>src/example.ts.diff\n" +
        "original:\n" +
        "const value = 1;\n" +
        "updated:\n" +
        "const value = 2;\n\n" +
        "<|file_sep|>src/other.ts.diff\n" +
        "original:\n" +
        "before\n" +
        "updated:\n" +
        "after",
    );
  });
});

describe("buildSweepFileTriplet", () => {
  it("builds original/current/updated rewrite windows around the cursor", () => {
    expect(
      buildSweepFileTriplet({
        filepath: "src/example.ts",
        cursorLine: 15,
        originalFileContent: buildLineContent("original-", 30),
        currentFileContent: buildLineContent("current-", 30),
        updatedFileContent: buildLineContent("updated-", 30),
      }),
    ).toBe(
      "<|file_sep|>original/src/example.ts\n" +
        buildLineContent("original-", 30).split("\n").slice(5, 26).join("\n") +
        "\n\n<|file_sep|>current/src/example.ts\n" +
        buildLineContent("current-", 30).split("\n").slice(5, 26).join("\n") +
        "\n\n<|file_sep|>updated/src/example.ts\n" +
        buildLineContent("updated-", 30).split("\n").slice(5, 26).join("\n"),
    );
  });
});

describe("calculateSweepRewriteWindow", () => {
  it("centers the 21-line window around the cursor when possible", () => {
    expect(calculateSweepRewriteWindow(40, 20)).toEqual({
      startLine: 10,
      endLine: 30,
    });
  });

  it("pins the window to the top of the file near the start", () => {
    expect(calculateSweepRewriteWindow(40, 2)).toEqual({
      startLine: 0,
      endLine: 20,
    });
  });

  it("pins the window to the bottom of the file near the end", () => {
    expect(calculateSweepRewriteWindow(40, 38)).toEqual({
      startLine: 19,
      endLine: 39,
    });
  });

  it("returns the full file when it is shorter than 21 lines", () => {
    expect(calculateSweepRewriteWindow(8, 4)).toEqual({
      startLine: 0,
      endLine: 7,
    });
  });
});
