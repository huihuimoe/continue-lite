import { describe, expect, it } from "vitest";

import { getTemplateForModel } from "../AutocompleteTemplate";

function renderSweepFimPrompt(prefix: string, suffix: string) {
  const filepath = "file:///repo/src/example.ts";
  const workspaceUris = ["file:///repo"];
  const template = getTemplateForModel("sweepai/sweep-next-edit-1.5b");

  expect(template.compilePrefixSuffix).toBeDefined();
  expect(typeof template.template).toBe("function");

  const [compiledPrefix, compiledSuffix] = template.compilePrefixSuffix!(
    prefix,
    suffix,
    filepath,
    "repo",
    [],
    workspaceUris,
  );

  const prompt = (template.template as Function)(
    compiledPrefix,
    compiledSuffix,
    filepath,
    "repo",
    "TypeScript",
    [],
    workspaceUris,
  );

  return { prompt, compiledPrefix, compiledSuffix };
}

describe("sweep-next-edit FIM template", () => {
  it("renders qwen-style FIM tokens for autocomplete prompts", () => {
    const { prompt, compiledPrefix, compiledSuffix } = renderSweepFimPrompt(
      "function greet() {\n  ",
      "\n}\n",
    );

    expect(compiledPrefix).toBe(
      "<|file_sep|>src/example.ts\n<|fim_prefix|>function greet() {\n  ",
    );
    expect(compiledSuffix).toBe("\n}\n");
    expect(prompt).toBe(
      "<|file_sep|>src/example.ts\n<|fim_prefix|>function greet() {\n  <|fim_suffix|>\n}\n<|fim_middle|>",
    );
  });

  it("never emits next-edit rewrite markers in FIM mode", () => {
    const { prompt } = renderSweepFimPrompt(
      "const value = ",
      "\nconsole.log(value);\n",
    );

    expect(prompt).toContain("<|fim_prefix|>");
    expect(prompt).toContain("<|fim_suffix|>");
    expect(prompt).toContain("<|fim_middle|>");
    expect(prompt).not.toContain("original/");
    expect(prompt).not.toContain("current/");
    expect(prompt).not.toContain("updated/");
    expect(prompt).not.toContain(".diff");
    expect(prompt).not.toContain("original:");
    expect(prompt).not.toContain("updated:");
  });
});
