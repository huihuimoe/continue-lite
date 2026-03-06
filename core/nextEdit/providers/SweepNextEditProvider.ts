import type { HelperVars } from "../../autocomplete/util/HelperVars.js";
import { NEXT_EDIT_MODELS } from "../../llm/constants.js";
import { localPathOrUriToPath } from "../../util/pathToUri.js";
import {
  buildContextFilesBlock,
  buildRecentDiffsBlock,
  toSweepRelativePath,
} from "../templating/sweepNextEdit.js";
import {
  NEXT_EDIT_MODEL_TEMPLATES,
  PromptTemplateRenderer,
} from "../templating/NextEditPromptEngine.js";
import type {
  ModelSpecificContext,
  NextEditInferenceConfig,
  Prompt,
  PromptMetadata,
} from "../types.js";
import { DocumentHistoryTracker } from "../DocumentHistoryTracker.js";
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

  getInferenceConfig(): NextEditInferenceConfig {
    return {
      mode: "complete",
      options: {
        raw: true,
        stream: false,
        temperature: 0,
        maxTokens: 512,
        stop: ["<|file_sep|>", "</s>"],
      },
    };
  }

  getWindowSize() {
    return { topMargin: 0, bottomMargin: 5 };
  }

  shouldInjectUniqueToken(): boolean {
    return false;
  }

  extractCompletion(message: string): string {
    let completion = message;

    const stopIndices = [
      completion.indexOf("<|file_sep|>"),
      completion.indexOf("</s>"),
    ].filter((index) => index >= 0);

    if (stopIndices.length > 0) {
      completion = completion.slice(0, Math.min(...stopIndices));
    }

    completion = completion
      .replace(/^```[a-zA-Z0-9_-]*\n?/, "")
      .replace(/\n```\s*$/, "")
      .trim();

    return completion;
  }

  buildPromptContext(context: ModelSpecificContext): any {
    const workspaceDirs = context.workspaceDirs ?? [];
    const currentFilePath = toSweepRelativePath(
      context.helper.filepath,
      workspaceDirs,
    );

    const originalContent =
      DocumentHistoryTracker.getInstance().getMostRecentDocumentHistory(
        localPathOrUriToPath(context.helper.filepath),
      ) ?? context.helper.fileContents;

    return {
      contextFilesBlock: buildContextFilesBlock(
        context.snippetPayload.recentlyVisitedRangesSnippets,
        workspaceDirs,
        context.helper.filepath,
      ),
      recentDiffsBlock: buildRecentDiffsBlock(
        context.diffContext,
        workspaceDirs,
      ),
      currentFilePath,
      originalContent,
      currentContent: context.helper.fileContents,
      userEdits: context.diffContext.join("\n"),
    };
  }

  async generatePrompts(context: ModelSpecificContext): Promise<Prompt[]> {
    const templateVars = this.buildPromptContext(context);
    const userPromptContent = this.templateRenderer.render(templateVars);

    return [
      {
        role: "system",
        content: this.getSystemPrompt(),
      },
      {
        role: "user",
        content: userPromptContent,
      },
    ];
  }

  buildPromptMetadata(context: ModelSpecificContext): PromptMetadata {
    const templateVars = this.buildPromptContext(context);
    const userPromptContent = this.templateRenderer.render(templateVars);

    return {
      prompt: {
        role: "user",
        content: userPromptContent,
      },
      userEdits: templateVars.userEdits,
      userExcerpts: templateVars.currentContent,
    };
  }

  calculateEditableRegion(
    helper: HelperVars,
    usingFullFileDiff: boolean,
  ): {
    editableRegionStartLine: number;
    editableRegionEndLine: number;
  } {
    if (usingFullFileDiff) {
      return this.calculateOptimalEditableRegion(helper, 512, "tokenizer");
    }

    const { topMargin, bottomMargin } = this.getWindowSize();

    return {
      editableRegionStartLine: Math.max(helper.pos.line - topMargin, 0),
      editableRegionEndLine: Math.min(
        helper.pos.line + bottomMargin,
        helper.fileLines.length - 1,
      ),
    };
  }
}
