import { DevDataLogEvent } from "@continuedev/config-yaml";

import type { AutocompleteCodeSnippet } from "../autocomplete/snippets/types";
import type { GetLspDefinitionsFunction } from "../autocomplete/types";
import {
  AutocompleteInput,
  RecentlyEditedRange,
} from "../autocomplete/util/types";
import type { ConfigHandler } from "../config/ConfigHandler";
import type { IdeSettings, Range, RangeInFileWithNextEditInfo } from "../";
import type { NextEditOutcome } from "../nextEdit/types";

export type ToCoreFromIdeOrWebviewProtocol = {
  // Special
  ping: [string, string];
  abort: [undefined, void];
  "devdata/log": [DevDataLogEvent, void];

  // Config
  "config/ideSettingsUpdate": [IdeSettings, void];

  // Autocomplete
  "autocomplete/complete": [AutocompleteInput, string[]];
  "autocomplete/cancel": [undefined, void];
  "autocomplete/accept": [{ completionId: string }, void];

  // Next Edit
  "nextEdit/predict": [
    {
      input: AutocompleteInput;
      options?: {
        withChain?: boolean;
        usingFullFileDiff?: boolean;
      };
    },
    NextEditOutcome | undefined,
  ];
  "nextEdit/reject": [{ completionId: string }, void];
  "nextEdit/accept": [{ completionId: string }, void];
  "nextEdit/startChain": [undefined, void];
  "nextEdit/deleteChain": [undefined, void];
  "nextEdit/isChainAlive": [undefined, boolean];
  // File changes
  "files/changed": [{ uris?: string[] }, void];
  "files/opened": [{ uris?: string[] }, void];
  "files/created": [{ uris?: string[] }, void];
  "files/deleted": [{ uris?: string[] }, void];
  "files/closed": [{ uris?: string[] }, void];
  "files/smallEdit": [
    {
      actions: RangeInFileWithNextEditInfo[];
      configHandler: ConfigHandler;
      getDefsFromLspFunction: GetLspDefinitionsFunction;
      recentlyEditedRanges: RecentlyEditedRange[];
      recentlyVisitedRanges: AutocompleteCodeSnippet[];
    },
    void,
  ];
};
