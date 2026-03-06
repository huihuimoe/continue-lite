import { LLMOptions } from "../../index.js";
import OpenAI from "./OpenAI.js";

class Voyage extends OpenAI {
  static providerName = "voyage";
  static defaultOptions: Partial<LLMOptions> | undefined = {
    apiBase: "https://api.voyageai.com/v1/",
  };
}

export default Voyage;
