import test from "node:test";
import assert from "node:assert/strict";

import {
  findMatchingModelEntry,
  getDefaultEvidenceFilename,
  parseArgs,
  summarizeShowResponse,
} from "./sweep-next-edit-smoke.mjs";

test("findMatchingModelEntry matches tagged Ollama model names", () => {
  const entry = findMatchingModelEntry(
    [
      { name: "other/model:latest" },
      { name: "sweepai/sweep-next-edit:latest", digest: "abc123" },
    ],
    "sweepai/sweep-next-edit",
  );

  assert.deepEqual(entry, {
    name: "sweepai/sweep-next-edit:latest",
    digest: "abc123",
  });
});

test("getDefaultEvidenceFilename switches to error artifact for expect-missing", () => {
  assert.equal(
    getDefaultEvidenceFilename({ mode: "fim", expectMissing: false }),
    "task-5-ollama-fim-smoke.json",
  );
  assert.equal(
    getDefaultEvidenceFilename({ mode: "fim", expectMissing: true }),
    "task-5-ollama-fim-smoke-error.json",
  );
  assert.equal(
    getDefaultEvidenceFilename({ mode: "next-edit", expectMissing: false }),
    "task-10-ollama-next-edit-smoke.json",
  );
});

test("parseArgs accepts next-edit mode", () => {
  const args = parseArgs(["--mode=next-edit"]);
  assert.equal(args.mode, "next-edit");
});

test("summarizeShowResponse keeps metadata needed for FIM preflight", () => {
  const summary = summarizeShowResponse({
    template: "{{ .Prompt }}{{ .Suffix }}",
    capabilities: ["completion"],
    details: { parameter_size: "1.4B" },
    model_info: { "qwen2.context_length": 32768 },
    tensors: [{ name: "big" }],
  });

  assert.equal(summary.templateHasSuffix, true);
  assert.deepEqual(summary.capabilities, ["completion"]);
  assert.deepEqual(summary.details, { parameter_size: "1.4B" });
  assert.deepEqual(summary.modelInfo, { qwen2ContextLength: 32768 });
  assert.ok(!("tensors" in summary));
});
