import { ConfigResult } from "@continuedev/config-yaml";
import type {
  BrowserSerializedContinueConfig,
  IndexingStatus,
} from "../index.js";

export type ToWebviewFromIdeOrCoreProtocol = {
  configUpdate: [
    {
      result: ConfigResult<BrowserSerializedContinueConfig>;
    },
    void,
  ];
  getDefaultModelTitle: [undefined, string | undefined];
  "indexing/statusUpdate": [IndexingStatus, void]; // Docs, etc.
  didCloseFiles: [{ uris: string[] }, void];
  isContinueInputFocused: [undefined, boolean];
  setTTSActive: [boolean, void];
  getWebviewHistoryLength: [undefined, number];
  getCurrentSessionId: [undefined, string];
  "jetbrains/setColors": [Record<string, string | null | undefined>, void];
  freeTrialExceeded: [undefined, void];
};
