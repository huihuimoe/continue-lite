import { afterEach, describe, expect, test, vi } from "vitest";

import { BaseLLM } from "../index.js";
import Ollama from "./Ollama.js";
import OpenAI from "./OpenAI.js";

async function collect(generator: AsyncGenerator<string>) {
  const chunks: string[] = [];
  for await (const chunk of generator) {
    chunks.push(chunk);
  }
  return chunks;
}

describe("supportsFim provider gating", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("Ollama marks suffix-aware templates as FIM capable", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "development";

      vi.spyOn(BaseLLM.prototype, "fetch").mockResolvedValue(
        new Response(
          JSON.stringify({
            parameters: "",
            template: "{{ .Prompt }}{{ .Suffix }}",
          }),
          { status: 200 },
        ),
      );

      const ollama = new Ollama({
        apiBase: "http://localhost:11434",
        model: "sweepai/sweep-next-edit",
      });

      await vi.waitFor(() => {
        expect(ollama.supportsFim()).toBe(true);
      });
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  test("Ollama streamFim fails explicitly without suffix prompt support", async () => {
    const ollama = new Ollama({
      apiBase: "http://localhost:11434",
      model: "sweepai/sweep-next-edit",
    });
    const fetchSpy = vi.fn();
    (ollama as any).fetch = fetchSpy;

    await expect(
      collect(
        ollama.streamFim("before", "after", new AbortController().signal, {}),
      ),
    ).rejects.toThrow(/suffix/i);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("OpenAI streamFim fails explicitly without fim endpoint support", async () => {
    const openai = new OpenAI({
      apiBase: "https://api.openai.com/v1",
      apiKey: "test-api-key",
      model: "sweep-next-edit",
    });
    const fetchSpy = vi.fn();

    (openai as any).fetch = fetchSpy;
    (openai as any).useOpenAIAdapterFor = [];

    await expect(
      collect(
        openai.streamFim("before", "after", new AbortController().signal, {}),
      ),
    ).rejects.toThrow(/fim\/completions/i);

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
