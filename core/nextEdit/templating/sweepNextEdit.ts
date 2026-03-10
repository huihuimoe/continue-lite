import {
  SWEEP_CURRENT_FILE_PREFIX,
  SWEEP_DIFF_FILE_SUFFIX,
  SWEEP_DIFF_ORIGINAL_LABEL,
  SWEEP_DIFF_UPDATED_LABEL,
  SWEEP_FILE_SEPARATOR_TOKEN,
  SWEEP_ORIGINAL_FILE_PREFIX,
  SWEEP_UPDATED_FILE_PREFIX,
} from "../constants";

export const SWEEP_REWRITE_WINDOW_LINE_COUNT = 21;

export interface SweepDiffBlock {
  filepath: string;
  original: string;
  updated: string;
}

export interface SweepFileTripletInput {
  filepath: string;
  cursorLine: number;
  originalFileContent: string;
  currentFileContent: string;
  updatedFileContent: string;
}

export interface SweepRewriteWindow {
  startLine: number;
  endLine: number;
}

export function formatSweepDiffBlocks(diffBlocks: SweepDiffBlock[]): string {
  return diffBlocks
    .map((diffBlock) =>
      [
        `${SWEEP_FILE_SEPARATOR_TOKEN}${diffBlock.filepath}${SWEEP_DIFF_FILE_SUFFIX}`,
        SWEEP_DIFF_ORIGINAL_LABEL,
        diffBlock.original,
        SWEEP_DIFF_UPDATED_LABEL,
        diffBlock.updated,
      ].join("\n"),
    )
    .join("\n\n");
}

export function buildSweepFileTriplet({
  filepath,
  cursorLine,
  originalFileContent,
  currentFileContent,
  updatedFileContent,
}: SweepFileTripletInput): string {
  const currentFileLines = currentFileContent.split("\n");
  const window = calculateSweepRewriteWindow(
    currentFileLines.length,
    cursorLine,
  );

  return [
    formatSweepFileBlock(
      `${SWEEP_ORIGINAL_FILE_PREFIX}${filepath}`,
      sliceLines(originalFileContent, window),
    ),
    formatSweepFileBlock(
      `${SWEEP_CURRENT_FILE_PREFIX}${filepath}`,
      sliceLines(currentFileContent, window),
    ),
    formatSweepFileBlock(
      `${SWEEP_UPDATED_FILE_PREFIX}${filepath}`,
      sliceLines(updatedFileContent, window),
    ),
  ].join("\n\n");
}

export function calculateSweepRewriteWindow(
  totalLineCount: number,
  cursorLine: number,
): SweepRewriteWindow {
  if (totalLineCount <= SWEEP_REWRITE_WINDOW_LINE_COUNT) {
    return {
      startLine: 0,
      endLine: Math.max(totalLineCount - 1, 0),
    };
  }

  const clampedCursorLine = Math.min(
    Math.max(cursorLine, 0),
    totalLineCount - 1,
  );
  const linesAboveCursor = Math.floor(SWEEP_REWRITE_WINDOW_LINE_COUNT / 2);

  let startLine = clampedCursorLine - linesAboveCursor;
  let endLine = startLine + SWEEP_REWRITE_WINDOW_LINE_COUNT - 1;

  if (startLine < 0) {
    endLine = Math.min(totalLineCount - 1, endLine - startLine);
    startLine = 0;
  }

  if (endLine >= totalLineCount) {
    const overflow = endLine - totalLineCount + 1;
    startLine = Math.max(0, startLine - overflow);
    endLine = totalLineCount - 1;
  }

  return { startLine, endLine };
}

function formatSweepFileBlock(filepath: string, content: string): string {
  return `${SWEEP_FILE_SEPARATOR_TOKEN}${filepath}\n${content}`;
}

function sliceLines(content: string, window: SweepRewriteWindow): string {
  return content
    .split("\n")
    .slice(window.startLine, window.endLine + 1)
    .join("\n");
}
