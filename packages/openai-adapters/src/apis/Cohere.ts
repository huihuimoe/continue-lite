import { streamJSON } from "@continuedev/fetch";
import { OpenAI } from "openai/index";
import {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParams,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
  Completion,
  CompletionCreateParamsNonStreaming,
  CompletionCreateParamsStreaming,
  Model,
} from "openai/resources/index";
import { CohereConfig } from "../types.js";
import { chatCompletion, customFetch } from "../util.js";
import { EMPTY_CHAT_COMPLETION } from "../util/emptyChatCompletion.js";
import { BaseLlmApi, FimCreateParamsStreaming } from "./base.js";

export class CohereApi implements BaseLlmApi {
  apiBase: string = "https://api.cohere.com/v1";

  static maxStopSequences = 5;

  constructor(protected config: CohereConfig) {
    this.apiBase = config.apiBase ?? this.apiBase;
  }

  private _convertMessages(
    msgs: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  ): any[] {
    return msgs.map((m) => ({
      role: m.role === "assistant" ? "CHATBOT" : "USER",
      message: m.content,
    }));
  }

  private _convertBody(oaiBody: ChatCompletionCreateParams) {
    return {
      message: oaiBody.messages.pop()?.content,
      chat_history: this._convertMessages(
        oaiBody.messages.filter((msg) => msg.role !== "system"),
      ),
      preamble: oaiBody.messages.find((msg) => msg.role === "system")?.content,
      model: oaiBody.model,
      stream: oaiBody.stream,
      temperature: oaiBody.temperature,
      max_tokens: oaiBody.max_tokens,
      p: oaiBody.top_p,
      stop_sequences: oaiBody.stop?.slice(0, CohereApi.maxStopSequences),
      frequency_penalty: oaiBody.frequency_penalty,
      presence_penalty: oaiBody.presence_penalty,
    };
  }

  async chatCompletionNonStream(
    body: ChatCompletionCreateParamsNonStreaming,
    signal: AbortSignal,
  ): Promise<ChatCompletion> {
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.config.apiKey}`,
    };

    const resp = await customFetch(this.config.requestOptions)(
      new URL("chat", this.apiBase),
      {
        method: "POST",
        headers,
        body: JSON.stringify(this._convertBody(body)),
        signal,
      },
    );

    if (resp.status === 499) {
      return EMPTY_CHAT_COMPLETION;
    }

    const data = (await resp.json()) as any;
    const { input_tokens, output_tokens } = data.meta.tokens;
    return chatCompletion({
      model: body.model,
      id: data.id,
      content: data.text,
      usage: {
        total_tokens: input_tokens + output_tokens,
        completion_tokens: output_tokens,
        prompt_tokens: input_tokens,
      },
    });
  }

  async *chatCompletionStream(
    body: ChatCompletionCreateParamsStreaming,
    signal: AbortSignal,
  ): AsyncGenerator<ChatCompletionChunk> {
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.config.apiKey}`,
    };

    const resp = await customFetch(this.config.requestOptions)(
      new URL("chat", this.apiBase),
      {
        method: "POST",
        headers,
        body: JSON.stringify(this._convertBody(body)),
        signal,
      },
    );

    for await (const value of streamJSON(resp as any)) {
      if (value.event_type === "text-generation") {
        yield {
          id: value.id,
          object: "chat.completion.chunk",
          model: body.model,
          created: Date.now(),
          choices: [
            {
              index: 0,
              logprobs: undefined,
              finish_reason: null,
              delta: {
                role: "assistant",
                content: value.text,
              },
            },
          ],
          usage: undefined,
        };
      }
    }
  }
  completionNonStream(
    body: CompletionCreateParamsNonStreaming,
  ): Promise<Completion> {
    throw new Error("Method not implemented.");
  }
  completionStream(
    body: CompletionCreateParamsStreaming,
  ): AsyncGenerator<Completion> {
    throw new Error("Method not implemented.");
  }
  fimStream(
    body: FimCreateParamsStreaming,
  ): AsyncGenerator<ChatCompletionChunk> {
    throw new Error("Method not implemented.");
  }
  list(): Promise<Model[]> {
    throw new Error("Method not implemented.");
  }
}
