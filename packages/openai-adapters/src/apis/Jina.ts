import {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
  Completion,
  CompletionCreateParamsNonStreaming,
  CompletionCreateParamsStreaming,
  Model,
} from "openai/resources/index";
import { JinaConfig } from "../types.js";
import { BaseLlmApi, FimCreateParamsStreaming } from "./base.js";

export class JinaApi implements BaseLlmApi {
  apiBase: string = "https://api.jina.ai/v1/";

  constructor(protected config: JinaConfig) {
    this.apiBase = config.apiBase ?? this.apiBase;
  }

  async chatCompletionNonStream(
    _body: ChatCompletionCreateParamsNonStreaming,
  ): Promise<ChatCompletion> {
    throw new Error("Method not implemented.");
  }
  async *chatCompletionStream(
    _body: ChatCompletionCreateParamsStreaming,
  ): AsyncGenerator<ChatCompletionChunk, any, unknown> {
    throw new Error("Method not implemented.");
  }
  async completionNonStream(
    _body: CompletionCreateParamsNonStreaming,
  ): Promise<Completion> {
    throw new Error("Method not implemented.");
  }
  async *completionStream(
    _body: CompletionCreateParamsStreaming,
  ): AsyncGenerator<Completion, any, unknown> {
    throw new Error("Method not implemented.");
  }
  async *fimStream(
    _body: FimCreateParamsStreaming,
  ): AsyncGenerator<ChatCompletionChunk, any, unknown> {
    throw new Error("Method not implemented.");
  }

  list(): Promise<Model[]> {
    throw new Error("Method not implemented.");
  }
}
