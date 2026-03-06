import * as path from "path";
import type { AutocompleteCodeSnippet } from "../../autocomplete/snippets/types.js";
import { localPathOrUriToPath } from "../../util/pathToUri.js";
import { getUriPathBasename } from "../../util/uri.js";

const FILE_SEP_TOKEN = "<|file_sep|>";
const MAX_CONTEXT_FILES = 8;

function normalizePath(filePath: string): string {
  return localPathOrUriToPath(filePath);
}

export function toSweepRelativePath(
  filePath: string,
  workspaceDirs: string[] = [],
): string {
  const normalizedFilePath = normalizePath(filePath);

  for (const workspaceDir of workspaceDirs) {
    const normalizedWorkspaceDir = normalizePath(workspaceDir);
    const relative = path.relative(normalizedWorkspaceDir, normalizedFilePath);

    if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
      return relative.replace(/\\/g, "/");
    }
  }

  return getUriPathBasename(normalizedFilePath);
}

export function buildContextFilesBlock(
  snippets: AutocompleteCodeSnippet[],
  workspaceDirs: string[] = [],
  currentFilePath?: string,
): string {
  const deduped = new Map<string, string>();
  const normalizedCurrentFilePath = currentFilePath
    ? normalizePath(currentFilePath)
    : undefined;

  for (let i = snippets.length - 1; i >= 0; i--) {
    const snippet = snippets[i];
    const normalizedSnippetPath = normalizePath(snippet.filepath);

    if (normalizedCurrentFilePath === normalizedSnippetPath) {
      continue;
    }

    const relativePath = toSweepRelativePath(snippet.filepath, workspaceDirs);
    if (!deduped.has(relativePath)) {
      deduped.set(relativePath, snippet.content);
    }
  }

  return Array.from(deduped.entries())
    .slice(0, MAX_CONTEXT_FILES)
    .map(
      ([relativePath, content]) =>
        `${FILE_SEP_TOKEN}${relativePath}\n${content}`,
    )
    .join("\n");
}

interface SweepRecentDiff {
  filePath: string;
  original: string;
  updated: string;
}

function extractDiffFilePath(diff: string): string | undefined {
  const indexMatch = diff.match(/^Index:\s+(.+)$/m);
  if (indexMatch) {
    return indexMatch[1].trim();
  }

  const newFileMatch = diff.match(/^\+\+\+\s+(?:b\/)?(.+?)(?:\t.+)?$/m);
  if (newFileMatch) {
    return newFileMatch[1].trim();
  }

  const oldFileMatch = diff.match(/^---\s+(?:a\/)?(.+?)(?:\t.+)?$/m);
  if (oldFileMatch) {
    return oldFileMatch[1].trim();
  }

  return undefined;
}

function parseUnifiedDiff(diff: string): SweepRecentDiff | undefined {
  const normalized = diff.replace(/\r\n/g, "\n");
  const filePath = extractDiffFilePath(normalized);

  if (!filePath) {
    return undefined;
  }

  const originalLines: string[] = [];
  const updatedLines: string[] = [];

  for (const line of normalized.split("\n")) {
    if (
      line.startsWith("Index: ") ||
      line.startsWith("===") ||
      line.startsWith("--- ") ||
      line.startsWith("+++ ") ||
      line.startsWith("@@") ||
      line.startsWith("\\ No newline at end of file")
    ) {
      continue;
    }

    if (line.startsWith("+")) {
      updatedLines.push(line.slice(1));
    } else if (line.startsWith("-")) {
      originalLines.push(line.slice(1));
    } else if (line.startsWith(" ")) {
      const content = line.slice(1);
      originalLines.push(content);
      updatedLines.push(content);
    }
  }

  if (!originalLines.length && !updatedLines.length) {
    return undefined;
  }

  return {
    filePath,
    original: originalLines.join("\n"),
    updated: updatedLines.join("\n"),
  };
}

export function buildRecentDiffsBlock(
  diffContext: string[],
  workspaceDirs: string[] = [],
): string {
  return diffContext
    .map(parseUnifiedDiff)
    .filter((diff): diff is SweepRecentDiff => !!diff)
    .map((diff) => {
      const relativePath = toSweepRelativePath(diff.filePath, workspaceDirs);
      return [
        `${FILE_SEP_TOKEN}${relativePath}.diff`,
        "original:",
        diff.original,
        "updated:",
        diff.updated,
      ].join("\n");
    })
    .join("\n");
}
