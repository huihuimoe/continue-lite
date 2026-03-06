import { ModelProvider } from "../types.js";

export const Voyage: ModelProvider = {
  models: [
    {
      model: "voyage-code-2",
      displayName: "Voyage Code 2",
      contextLength: 8096,
    },
    {
      model: "voyage-code-3",
      displayName: "Voyage Code 3",
      contextLength: 8096,
    },
  ],
  id: "voyage",
  displayName: "Voyage",
};
