import { describe, expect, it } from "vitest";
import { AutocompleteSnippetType } from "../../autocomplete/snippets/types";
import { SweepNextEditProvider } from "./SweepNextEditProvider";

describe("SweepNextEditProvider", () => {
  it("uses completion endpoint with fixed decode params", () => {
    const provider = new SweepNextEditProvider();

    expect(provider.getInferenceConfig()).toEqual({
      mode: "complete",
      options: {
        raw: true,
        stream: false,
        temperature: 0,
        maxTokens: 512,
        stop: ["<|file_sep|>", "</s>"],
      },
    });
  });

  it("builds prompt with file_sep original/current/updated segments", async () => {
    const provider = new SweepNextEditProvider();

    const prompts = await provider.generatePrompts({
      helper: {
        filepath: "/repo/src/a.ts",
        fileContents: "const a = 1;\n",
        fileLines: ["const a = 1;"],
        pos: { line: 0, character: 0 },
      },
      snippetPayload: {
        rootPathSnippets: [],
        importDefinitionSnippets: [],
        ideSnippets: [],
        recentlyEditedRangeSnippets: [],
        recentlyVisitedRangesSnippets: [
          {
            filepath: "/repo/src/b.ts",
            content: "export const b = 2;",
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
      diffContext: [],
      autocompleteContext: "",
      workspaceDirs: ["/repo"],
    } as any);

    const userPrompt = prompts.find((p) => p.role === "user")?.content;

    expect(userPrompt).toContain("<|file_sep|>src/b.ts");
    expect(userPrompt).toContain("<|file_sep|>original/src/a.ts");
    expect(userPrompt).toContain("<|file_sep|>current/src/a.ts");
    expect(userPrompt).toContain("<|file_sep|>updated/src/a.ts");
  });

  it("strips stop tokens and markdown fences from output", () => {
    const provider = new SweepNextEditProvider();
    const output = provider.extractCompletion(
      ["```ts", "const x = 1;", "```", "<|file_sep|>", "ignored", "</s>"].join(
        "\n",
      ),
    );

    expect(output).toBe("const x = 1;");
  });
});
