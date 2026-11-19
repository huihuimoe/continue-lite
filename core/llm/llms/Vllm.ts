import { LLMOptions } from "../../index.js";

import OpenAI from "./OpenAI.js";

class Vllm extends OpenAI {
  static providerName = "vllm";
  private _userExplicitContextLength: boolean;
  private _userExplicitModel: boolean;

  constructor(options: LLMOptions) {
    super(options);

    this._userExplicitContextLength = options.contextLength !== undefined;
    this._userExplicitModel =
      options.model !== undefined && options.model !== "";

    if (options.isFromAutoDetect) {
      this._setupCompletionOptions();
    }
  }

  supportsFim(): boolean {
    return false;
  }

  private _setupCompletionOptions() {
    this.fetch(this._getEndpoint("models"), {
      method: "GET",
      headers: this._getHeaders(),
    })
      .then(async (response) => {
        if (response.status !== 200) {
          console.warn(
            "Error calling vLLM /models endpoint: ",
            await response.text(),
          );
          return;
        }
        const json = await response.json();
        const data = json.data[0];
        if (!this._userExplicitModel) {
          this.model = data.id;
        }
        if (!this._userExplicitContextLength) {
          this._contextLength = Number.parseInt(data.max_model_len);
        }
      })
      .catch((e) => {
        console.log(`Failed to list models for vLLM: ${e.message}`);
      });
  }
}

export default Vllm;
