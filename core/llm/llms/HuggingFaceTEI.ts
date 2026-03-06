import { LLMOptions } from "../../index.js";
import { BaseLLM } from "../index.js";

class HuggingFaceTEIEmbeddingsProvider extends BaseLLM {
  static providerName = "huggingface-tei";

  static defaultOptions: Partial<LLMOptions> | undefined = {
    apiBase: "http://localhost:8080",
    model: "tei",
  };

  constructor(options: LLMOptions) {
    super(options);

    this.doInfoRequest()
      .then((response) => {
        this.model = response.model_id;
      })
      .catch((error) => {
        console.error(
          "Failed to fetch info from HuggingFace TEI Embeddings Provider:",
          error,
        );
      });
  }

  async doInfoRequest(): Promise<TEIInfoResponse> {
    // TODO - need to use custom fetch for this request?
    const resp = await this.fetch(new URL("info", this.apiBase), {
      method: "GET",
    });
    if (!resp.ok) {
      throw new Error(await resp.text());
    }
    return (await resp.json()) as TEIInfoResponse;
  }
}

type TEIInfoResponse = {
  model_id: string;
  model_sha: string;
  model_dtype: string;
  model_type: {
    embedding: {
      pooling: string;
    };
  };
  max_concurrent_requests: number;
  max_input_length: number;
  max_batch_tokens: number;
  max_batch_requests: number;
  max_client_batch_size: number;
  auto_truncate: boolean;
  tokenization_workers: number;
  version: string;
  sha: string;
  docker_label: string;
};

export default HuggingFaceTEIEmbeddingsProvider;
