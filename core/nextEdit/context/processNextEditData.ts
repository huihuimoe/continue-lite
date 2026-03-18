import { IDE, ILLM, Position } from "../..";
import { AutocompleteCodeSnippet } from "../../autocomplete/snippets/types";
import { GetLspDefinitionsFunction } from "../../autocomplete/types";
import { ConfigHandler } from "../../config/ConfigHandler";
import { DataLogger } from "../../data/log";
import { DEFAULT_AUTOCOMPLETE_OPTS } from "../../util/parameters";
import { NextEditProvider } from "../NextEditProvider";
import { RecentlyEditedRange } from "../types";
import { getAutocompleteContext } from "./autocompleteContextFetching";
import { createDiff, DiffFormatType } from "./diffFormatting";
import {
  getPrevEditsDescending,
  prevEdit,
  prevEditLruCache,
  setPrevEdit,
} from "./prevEditLruCache";

interface ProcessNextEditDataParams {
  filePath: string;
  beforeContent: string;
  afterContent: string;
  cursorPosBeforeEdit: Position;
  cursorPosAfterPrevEdit: Position;
  ide: IDE;
  configHandler: ConfigHandler;
  getDefinitionsFromLsp: GetLspDefinitionsFunction;
  recentlyEditedRanges: RecentlyEditedRange[];
  recentlyVisitedRanges: AutocompleteCodeSnippet[];
  workspaceDir: string;
  modelNameOrInstance?: string | ILLM | undefined;
}

interface filenameAndDiff {
  filename: string;
  diff: string;
}

function resolveAutocompleteModelMetadata(
  configuredModels: ILLM[],
  modelNameOrInstance: string | ILLM | undefined,
  selectedAutocompleteModel: ILLM | undefined,
): {
  autocompleteModel?: string | ILLM;
  modelName?: string;
  modelProvider?: string;
  modelTitle?: string;
  maxPromptTokens: number;
} {
  let autocompleteModel: string | ILLM | undefined =
    modelNameOrInstance ?? selectedAutocompleteModel;

  if (typeof autocompleteModel === "string") {
    autocompleteModel =
      configuredModels.find(
        (model) =>
          model.title === autocompleteModel ||
          model.model === autocompleteModel,
      ) ?? autocompleteModel;
  }

  const resolvedModel =
    typeof autocompleteModel === "string"
      ? configuredModels.find(
          (model) =>
            model.title === autocompleteModel ||
            model.model === autocompleteModel,
        )
      : autocompleteModel;

  return {
    autocompleteModel,
    modelName:
      typeof autocompleteModel === "string"
        ? (resolvedModel?.model ?? autocompleteModel)
        : autocompleteModel?.model,
    modelProvider:
      resolvedModel?.providerName ?? resolvedModel?.underlyingProviderName,
    modelTitle:
      typeof autocompleteModel === "string"
        ? (resolvedModel?.title ?? autocompleteModel)
        : (autocompleteModel?.title ?? autocompleteModel?.model),
    maxPromptTokens:
      resolvedModel?.autocompleteOptions?.maxPromptTokens ??
      DEFAULT_AUTOCOMPLETE_OPTS.maxPromptTokens,
  };
}

export const processNextEditData = async ({
  filePath,
  beforeContent,
  afterContent,
  cursorPosBeforeEdit,
  cursorPosAfterPrevEdit,
  ide,
  configHandler,
  getDefinitionsFromLsp,
  recentlyEditedRanges,
  recentlyVisitedRanges,
  workspaceDir,
  modelNameOrInstance,
}: ProcessNextEditDataParams) => {
  const { config } = await configHandler.loadConfig();
  const configuredAutocompleteModels = (config?.modelsByRole.autocomplete ??
    []) as ILLM[];
  const selectedAutocompleteModel = config?.selectedModelByRole.autocomplete as
    | ILLM
    | undefined;

  const {
    autocompleteModel,
    modelName,
    modelProvider,
    modelTitle,
    maxPromptTokens,
  } = resolveAutocompleteModelMetadata(
    configuredAutocompleteModels,
    modelNameOrInstance,
    selectedAutocompleteModel,
  );

  const autocompleteContext = await getAutocompleteContext(
    filePath,
    cursorPosBeforeEdit,
    ide,
    configHandler,
    getDefinitionsFromLsp,
    recentlyEditedRanges,
    recentlyVisitedRanges,
    maxPromptTokens,
    beforeContent,
    autocompleteModel,
  );

  NextEditProvider.getInstance().addAutocompleteContext(autocompleteContext);

  // console.log(
  //   createDiff(beforeContent, afterContent, filePath, DiffFormatType.Unified),
  // );

  let filenamesAndDiffs: filenameAndDiff[] = [];

  const timestamp = Date.now();
  let prevEdits: prevEdit[] = getPrevEditsDescending(); // edits from most to least recent
  if (prevEdits.length > 0) {
    // if last edit was 10+ minutes ago or the workspace changed, forget previous edits
    if (
      timestamp - prevEdits[0].timestamp >= 1000 * 60 * 10 ||
      workspaceDir !== prevEdits[0].workspaceUri
    ) {
      prevEditLruCache.clear();
      prevEdits = [];
    }

    // extract filenames and diffs for logging
    filenamesAndDiffs = prevEdits.map(
      (edit) =>
        ({
          // filename relative to workspace dir
          filename: edit.fileUri
            .replace(edit.workspaceUri, "")
            .replace(/^[/\\]/, ""),

          // diff without the first 4 lines (the file header)
          diff: edit.unidiff.split("\n").slice(4).join("\n"),
        }) as filenameAndDiff,
    );
  }

  if (filenamesAndDiffs.length > 0) {
    // if there are previous edits, log
    void DataLogger.getInstance().logDevData({
      name: "nextEditWithHistory",
      data: {
        previousEdits: filenamesAndDiffs,
        fileURI: filePath,
        workspaceDirURI: workspaceDir,
        beforeContent,
        afterContent,
        beforeCursorPos: cursorPosBeforeEdit,
        afterCursorPos: cursorPosAfterPrevEdit,
        context: autocompleteContext,
        modelProvider,
        modelName,
        modelTitle,
      },
    });
  }

  // add current edit to history
  const thisEdit: prevEdit = {
    unidiff: createDiff({
      beforeContent: beforeContent,
      afterContent: afterContent,
      filePath: filePath,
      diffType: DiffFormatType.Unified,
      contextLines: 25, // storing many context lines for downstream trimming
      workspaceDir: workspaceDir,
    }),
    fileUri: filePath,
    workspaceUri: workspaceDir,
    timestamp: timestamp,
  };

  setPrevEdit(thisEdit);
};
