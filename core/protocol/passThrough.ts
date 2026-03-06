import {
  ToCoreFromWebviewProtocol,
  ToWebviewFromCoreProtocol,
} from "./coreWebview.js";

// Message types to pass through from webview to core
// Note: If updating these values, make a corresponding update in
// extensions/intellij/src/main/kotlin/com/github/continuedev/continueintellijextension/toolWindow/ContinueBrowser.kt
export const WEBVIEW_TO_CORE_PASS_THROUGH: (keyof ToCoreFromWebviewProtocol)[] =
  [
    "ping",
    "abort",
    "devdata/log",
    "config/ideSettingsUpdate",
    "autocomplete/complete",
    "autocomplete/cancel",
    "autocomplete/accept",
    "nextEdit/predict",
    "nextEdit/reject",
    "nextEdit/accept",
    "nextEdit/startChain",
    "nextEdit/deleteChain",
    "nextEdit/isChainAlive",
  ];

// Message types to pass through from core to webview
// Note: If updating these values, make a corresponding update in
// extensions/intellij/src/main/kotlin/com/github/continuedev/continueintellijextension/constants/MessageTypes.kt
export const CORE_TO_WEBVIEW_PASS_THROUGH: (keyof ToWebviewFromCoreProtocol)[] =
  [
    "configUpdate",
    "indexing/statusUpdate", // Docs, etc.
    "isContinueInputFocused",
    "setTTSActive",
    "getWebviewHistoryLength",
    "getCurrentSessionId",
    "didCloseFiles",
    "freeTrialExceeded",
  ];
