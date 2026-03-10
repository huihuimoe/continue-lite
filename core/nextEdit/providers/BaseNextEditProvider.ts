import * as path from "path";

import { HelperVars } from "../../autocomplete/util/HelperVars.js";
import { myersDiff } from "../../diff/myers.js";
import type { DiffLine, IDE, ILLM, Position } from "../../index.js";
import { countTokens } from "../../llm/countTokens.js";
import {
  calculateFinalCursorPosition,
  DiffGroup,
  groupDiffLines,
} from "../diff/diff.js";
import {
  ModelSpecificContext,
  NextEditOutcome,
  Prompt,
  PromptMetadata,
} from "../types.js";
import { isWhitespaceOnlyDeletion } from "../utils.js";

/**
 * This class is used as an abstract base class for model-specific providers.
 * This and its children are responsible for pre/post processing of prompts and outcomes.
 * Different next edit models have very different requirements.
 */
export abstract class BaseNextEditModelProvider {
  protected readonly modelName: string;

  constructor(modelName: string) {
    this.modelName = modelName;
  }

  // Leave methods as abstract when you must have the models implement their own versions.
  abstract getSystemPrompt(): string;
  abstract generatePrompts(context: ModelSpecificContext): Promise<Prompt[]>;
  abstract extractCompletion(message: string): string;
  abstract buildPromptContext(context: ModelSpecificContext): any;
  abstract buildPromptMetadata(context: ModelSpecificContext): PromptMetadata;
  abstract getWindowSize(): { topMargin: number; bottomMargin: number };
  abstract calculateEditableRegion(
    helper: HelperVars,
    usingFullFileDiff: boolean,
  ): {
    editableRegionStartLine: number;
    editableRegionEndLine: number;
  };

  // Methods that can be used as default fallback.
  public async handlePartialFileDiff(params: {
    helper: HelperVars;
    editableRegionStartLine: number;
    editableRegionEndLine: number;
    startTime: number;
    llm: ILLM;
    nextCompletion: string;
    promptMetadata: PromptMetadata;
    ide: IDE;
    profileType?: "local" | "platform" | "control-plane";
  }): Promise<NextEditOutcome> {
    const {
      helper,
      editableRegionStartLine,
      editableRegionEndLine,
      startTime,
      llm,
      nextCompletion,
      promptMetadata,
      ide,
      profileType,
    } = params;
    const oldEditRangeSlice = helper.fileContents
      .split("\n")
      .slice(editableRegionStartLine, editableRegionEndLine + 1)
      .join("\n");

    const finalCursorPos = calculateFinalCursorPosition(
      helper.pos,
      editableRegionStartLine,
      oldEditRangeSlice,
      nextCompletion,
    );

    const outcome = await this.createNextEditOutcome({
      helper,
      startTime,
      llm,
      promptContent: promptMetadata.prompt.content,
      completion: nextCompletion,
      finalCursorPosition: finalCursorPos,
      editableRegionStartLine,
      editableRegionEndLine,
      userEdits: promptMetadata.userEdits,
      userExcerpts: promptMetadata.userExcerpts,
      originalEditableRange: oldEditRangeSlice,
      diffLines: [],
      ide,
      profileType,
    });

    return outcome;
  }

  public async handleFullFileDiff(params: {
    helper: HelperVars;
    editableRegionStartLine: number;
    editableRegionEndLine: number;
    startTime: number;
    llm: ILLM;
    nextCompletion: string;
    promptMetadata: PromptMetadata;
    ide: IDE;
    profileType?: "local" | "platform" | "control-plane";
  }): Promise<NextEditOutcome | undefined> {
    const {
      helper,
      editableRegionStartLine,
      editableRegionEndLine,
      startTime,
      llm,
      nextCompletion,
      promptMetadata,
      ide,
      profileType,
    } = params;
    const fileSlice = helper.fileLines
      .slice(editableRegionStartLine, editableRegionEndLine + 1)
      .join("\n");

    const diffLines = myersDiff(fileSlice, nextCompletion);
    const diffGroups = groupDiffLines(
      diffLines,
      editableRegionStartLine,
      5,
    ).filter((group) => !isWhitespaceOnlyDeletion(group.lines));
    const currentLine = helper.pos.line;
    const cursorLocalDiffGroup = this.findCursorLocalDiffGroup(
      diffGroups,
      currentLine,
    );

    if (cursorLocalDiffGroup) {
      return await this.createOutcomeFromDiffGroup({
        diffGroup: cursorLocalDiffGroup,
        helper,
        startTime,
        llm,
        completionId: helper.input.completionId,
        isCurrentCursorGroup: true,
        promptMetadata,
        ide,
        profileType,
      });
    }

    return undefined;
  }

  /**
   * Process diff groups and find the one containing the cursor.
   */
  private findCursorLocalDiffGroup(
    diffGroups: DiffGroup[],
    currentLine: number,
  ): DiffGroup | undefined {
    return diffGroups.find(
      (group) => currentLine >= group.startLine && currentLine <= group.endLine,
    );
  }

  private async createOutcomeFromDiffGroup(params: {
    diffGroup: DiffGroup;
    helper: HelperVars;
    startTime: number;
    llm: ILLM;
    completionId: string;
    isCurrentCursorGroup: boolean;
    promptMetadata: PromptMetadata;
    ide: IDE;
    profileType?: "local" | "platform" | "control-plane";
  }): Promise<NextEditOutcome> {
    const {
      diffGroup,
      helper,
      startTime,
      llm,
      completionId,
      isCurrentCursorGroup,
      promptMetadata,
      ide,
      profileType,
    } = params;
    const groupContent = diffGroup.lines
      .filter((l) => l.type !== "old")
      .map((l) => l.line)
      .join("\n");

    const originalContent = diffGroup.lines
      .filter((l) => l.type !== "new")
      .map((l) => l.line)
      .join("\n");

    const cursorPos = isCurrentCursorGroup
      ? helper.pos
      : { line: diffGroup.startLine, character: 0 };

    const finalCursorPos = calculateFinalCursorPosition(
      cursorPos,
      diffGroup.startLine,
      originalContent,
      groupContent,
    );

    const outcomeNext = await this.createNextEditOutcome({
      helper,
      startTime,
      llm,
      promptContent: promptMetadata.prompt.content,
      completion: groupContent,
      finalCursorPosition: finalCursorPos,
      editableRegionStartLine: diffGroup.startLine,
      editableRegionEndLine: diffGroup.endLine,
      userEdits: promptMetadata.userEdits,
      userExcerpts: promptMetadata.userExcerpts,
      originalEditableRange: originalContent,
      cursorPosition: cursorPos,
      completionId,
      diffLines: diffGroup.lines,
      ide,
      profileType,
    });

    return outcomeNext;
  }

  protected async createNextEditOutcome(outcomeCtx: {
    helper: HelperVars;
    startTime: number;
    llm: ILLM;
    promptContent: string;
    completion: string;
    finalCursorPosition: Position;
    editableRegionStartLine: number;
    editableRegionEndLine: number;
    userEdits: string;
    userExcerpts: string;
    originalEditableRange: string;
    cursorPosition?: Position;
    completionId?: string;
    diffLines: DiffLine[];
    ide: IDE;
    profileType?: "local" | "platform" | "control-plane";
  }): Promise<NextEditOutcome> {
    return {
      elapsed: Date.now() - outcomeCtx.startTime,
      modelProvider: outcomeCtx.llm.underlyingProviderName,
      modelName: outcomeCtx.llm.model,
      completionOptions: null,
      completionId:
        outcomeCtx.completionId || outcomeCtx.helper.input.completionId,
      gitRepo: await outcomeCtx.ide.getRepoName(outcomeCtx.helper.filepath),
      uniqueId: await outcomeCtx.ide.getUniqueId(),
      requestId: outcomeCtx.llm.lastRequestId,
      timestamp: Date.now(),
      fileUri: outcomeCtx.helper.filepath,
      workspaceDirUri:
        outcomeCtx.helper.workspaceUris[0] ??
        path.dirname(outcomeCtx.helper.filepath),
      prompt: outcomeCtx.promptContent,
      userEdits: outcomeCtx.userEdits ?? "",
      userExcerpts: outcomeCtx.userExcerpts ?? "",
      originalEditableRange: outcomeCtx.originalEditableRange ?? "",
      completion: outcomeCtx.completion,
      cursorPosition: outcomeCtx.cursorPosition || outcomeCtx.helper.pos,
      finalCursorPosition: outcomeCtx.finalCursorPosition,
      editableRegionStartLine: outcomeCtx.editableRegionStartLine,
      editableRegionEndLine: outcomeCtx.editableRegionEndLine,
      diffLines: outcomeCtx.diffLines,
      profileType: outcomeCtx.profileType,
      ...outcomeCtx.helper.options,
    };
  }

  // Shared utility for calculating editable regions.
  protected calculateOptimalEditableRegion(
    helper: HelperVars,
    maxTokens: number = 512,
    heuristic: "fourChars" | "tokenizer" = "tokenizer",
  ): {
    editableRegionStartLine: number;
    editableRegionEndLine: number;
  } {
    const cursorLine = helper.pos.line;
    const fileLines = helper.fileLines;

    let editableRegionStartLine = cursorLine;
    let editableRegionEndLine = cursorLine;

    let currentContent = fileLines[cursorLine];
    let totalTokens =
      heuristic === "tokenizer"
        ? countTokens(currentContent, helper.modelName)
        : Math.ceil(currentContent.length / 4);

    let addingAbove = true;

    while (totalTokens < maxTokens) {
      let addedLine = false;

      if (addingAbove) {
        if (editableRegionStartLine > 0) {
          editableRegionStartLine--;
          const lineContent = fileLines[editableRegionStartLine];
          const lineTokens =
            heuristic === "tokenizer"
              ? countTokens(lineContent, helper.modelName)
              : Math.ceil(lineContent.length / 4);

          totalTokens += lineTokens;
          addedLine = true;
        }
      } else {
        if (editableRegionEndLine < fileLines.length - 1) {
          editableRegionEndLine++;
          const lineContent = fileLines[editableRegionEndLine];
          const lineTokens =
            heuristic === "tokenizer"
              ? countTokens(lineContent, helper.modelName)
              : Math.ceil(lineContent.length / 4);

          totalTokens += lineTokens;
          addedLine = true;
        }
      }

      if (!addedLine) {
        if (
          editableRegionStartLine === 0 &&
          editableRegionEndLine === fileLines.length - 1
        ) {
          break;
        }
        addingAbove = !addingAbove;
        continue;
      }

      if (totalTokens > maxTokens) {
        if (addingAbove) {
          editableRegionStartLine++;
        } else {
          editableRegionEndLine--;
        }
        break;
      }

      addingAbove = !addingAbove;
    }

    return {
      editableRegionStartLine,
      editableRegionEndLine,
    };
  }

  // Optional methods with defaults.
  shouldInjectUniqueToken(): boolean {
    return false;
  }

  getUniqueToken(): string | null {
    return null;
  }
}
