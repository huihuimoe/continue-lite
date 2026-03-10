import { HelperVars } from "../../autocomplete/util/HelperVars.js";
import { NEXT_EDIT_MODELS } from "../../llm/constants.js";
import { findUriInDirs } from "../../util/uri.js";
import {
  extractMetadataFromUnifiedDiff,
  type DiffMetadata,
} from "../context/diffFormatting.js";
import {
  NEXT_EDIT_MODEL_TEMPLATES,
  PromptTemplateRenderer,
} from "../templating/NextEditPromptEngine.js";
import {
  buildSweepFileTriplet,
  calculateSweepRewriteWindow,
  formatSweepDiffBlocks,
  SWEEP_REWRITE_WINDOW_LINE_COUNT,
  type SweepDiffBlock,
} from "../templating/sweepNextEdit.js";
import { ModelSpecificContext, Prompt, PromptMetadata } from "../types.js";
import { BaseNextEditModelProvider } from "./BaseNextEditProvider.js";

export class SweepNextEditProvider extends BaseNextEditModelProvider {
  private templateRenderer: PromptTemplateRenderer;

  constructor() {
    super(NEXT_EDIT_MODELS.SWEEP_NEXT_EDIT);

    const template =
      NEXT_EDIT_MODEL_TEMPLATES[NEXT_EDIT_MODELS.SWEEP_NEXT_EDIT];
    this.templateRenderer = new PromptTemplateRenderer(template.template);
  }

  getSystemPrompt(): string {
    return "";
  }

  getWindowSize() {
    return { topMargin: 10, bottomMargin: 10 };
  }

  extractCompletion(message: string): string {
    let completion = message.replace(/\r\n/g, "\n");

    completion = completion.replace(/^<\|file_sep\|>updated\/[^\n]*\n?/, "");
    completion = completion.split("\n<|file_sep|>")[0] ?? completion;
    completion = completion.split("</s>")[0] ?? completion;
    completion = completion.replace(/^\n+/, "").replace(/\n+$/, "");

    return completion
      .split("\n")
      .slice(0, SWEEP_REWRITE_WINDOW_LINE_COUNT)
      .join("\n");
  }

  buildPromptContext(context: ModelSpecificContext): any {
    const currentFilePath = this.toPromptPath(
      context.helper.filepath,
      context.helper.workspaceUris,
    );
    const currentFileContent = context.helper.fileContents;
    const originalFileContent = this.resolveOriginalFileContent(context);
    const updatedFileContent = "";
    const rewriteWindow = calculateSweepRewriteWindow(
      context.helper.fileLines.length,
      context.helper.pos.line,
    );

    return {
      currentFilePath,
      contextSnippets: this.formatContextSnippets(context),
      editDiffHistory: this.formatEditDiffHistory(context.diffContext),
      originalFileContent,
      currentFileContent,
      updatedFileContent,
      rewriteWindow,
      userExcerpts: buildSweepFileTriplet({
        filepath: currentFilePath,
        cursorLine: context.helper.pos.line,
        originalFileContent,
        currentFileContent,
        updatedFileContent,
      }),
    };
  }

  async generatePrompts(context: ModelSpecificContext): Promise<Prompt[]> {
    const metadata = this.buildPromptMetadata(context);

    return [
      {
        role: "system",
        content: this.getSystemPrompt(),
      },
      metadata.prompt,
    ];
  }

  buildPromptMetadata(context: ModelSpecificContext): PromptMetadata {
    const promptCtx = this.buildPromptContext(context);
    const windowedOriginal = this.sliceWindow(
      promptCtx.originalFileContent,
      promptCtx.rewriteWindow,
    );
    const windowedCurrent = this.sliceWindow(
      promptCtx.currentFileContent,
      promptCtx.rewriteWindow,
    );
    const windowedUpdated = this.sliceWindow(
      promptCtx.updatedFileContent,
      promptCtx.rewriteWindow,
    );

    const promptContent = this.templateRenderer.render({
      contextSnippets: promptCtx.contextSnippets,
      editDiffHistory: promptCtx.editDiffHistory,
      currentFilePath: promptCtx.currentFilePath,
      originalFileContent: windowedOriginal,
      currentFileContent: windowedCurrent,
      updatedFileContent: windowedUpdated,
    });

    return {
      prompt: {
        role: "user",
        content: promptContent,
      },
      userEdits: promptCtx.editDiffHistory,
      userExcerpts: promptCtx.userExcerpts,
    };
  }

  calculateEditableRegion(
    helper: HelperVars,
    _usingFullFileDiff: boolean,
  ): {
    editableRegionStartLine: number;
    editableRegionEndLine: number;
  } {
    const window = calculateSweepRewriteWindow(
      helper.fileLines.length,
      helper.pos.line,
    );

    return {
      editableRegionStartLine: window.startLine,
      editableRegionEndLine: window.endLine,
    };
  }

  private formatContextSnippets(context: ModelSpecificContext): string {
    return context.snippetPayload.recentlyVisitedRangesSnippets
      .map((snippet) => {
        const filepath = this.toPromptPath(
          snippet.filepath,
          context.helper.workspaceUris,
        );

        return `<|file_sep|>${filepath}\n${snippet.content}`;
      })
      .join("\n\n");
  }

  private formatEditDiffHistory(diffContext: string[]): string {
    const diffBlocks = diffContext
      .map((diff) => this.parseDiffBlock(diff))
      .filter((diff): diff is SweepDiffBlock => diff !== null);

    return formatSweepDiffBlocks(diffBlocks);
  }

  private parseDiffBlock(diff: string): SweepDiffBlock | null {
    const metadata = extractMetadataFromUnifiedDiff(diff);
    const filepath =
      metadata.newFilename ??
      metadata.oldFilename ??
      this.extractDiffFilePath(diff);
    if (!filepath || !metadata.hunks?.length) {
      return null;
    }

    return {
      filepath,
      original: this.renderDiffVersion(metadata, "original"),
      updated: this.renderDiffVersion(metadata, "updated"),
    };
  }

  private renderDiffVersion(
    metadata: DiffMetadata,
    version: "original" | "updated",
  ): string {
    return (metadata.hunks ?? [])
      .map((hunk) =>
        hunk.lines
          .filter((line) => {
            if (version === "original") {
              return line.type !== "addition";
            }

            return line.type !== "deletion";
          })
          .map((line) => line.content)
          .join("\n"),
      )
      .filter((content) => content.length > 0)
      .join("\n");
  }

  private resolveOriginalFileContent(context: ModelSpecificContext): string {
    if (!context.historyDiff) {
      return context.helper.fileContents;
    }

    const metadata = extractMetadataFromUnifiedDiff(context.historyDiff);
    if (!metadata.hunks?.length) {
      return context.helper.fileContents;
    }

    if (metadata.isNew) {
      return "";
    }

    return this.reconstructOriginalFileContent(
      context.helper.fileContents,
      metadata,
    );
  }

  private reconstructOriginalFileContent(
    currentFileContent: string,
    metadata: DiffMetadata,
  ): string {
    const originalLines = currentFileContent.split("\n");

    for (const hunk of [...(metadata.hunks ?? [])].reverse()) {
      const currentStart = Math.max(hunk.newStart - 1, 0);
      const currentLength = hunk.lines.filter(
        (line) => line.type !== "deletion",
      ).length;
      const originalHunkLines = hunk.lines
        .filter((line) => line.type !== "addition")
        .map((line) => line.content);

      originalLines.splice(currentStart, currentLength, ...originalHunkLines);
    }

    return originalLines.join("\n");
  }

  private toPromptPath(filepath: string, workspaceUris: string[]): string {
    return findUriInDirs(filepath, workspaceUris).relativePathOrBasename;
  }

  private extractDiffFilePath(diff: string): string | null {
    const newFileMatch = diff.match(/^\+\+\+ (?:b\/)?(.+)$/m);
    if (newFileMatch?.[1]) {
      return newFileMatch[1];
    }

    const oldFileMatch = diff.match(/^--- (?:a\/)?(.+)$/m);
    return oldFileMatch?.[1] ?? null;
  }

  private sliceWindow(
    content: string,
    window: { startLine: number; endLine: number },
  ): string {
    return content
      .split("\n")
      .slice(window.startLine, window.endLine + 1)
      .join("\n");
  }
}
