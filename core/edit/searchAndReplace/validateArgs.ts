import { ContinueError, ContinueErrorReason } from "../../util/errors";
import { resolveRelativePathInDir } from "../../util/ideUtils";

interface SearchAndReplacePathIDE {
  getWorkspaceDirs(): Promise<string[]>;
  fileExists(filepath: string): Promise<boolean>;
  getCurrentFile(): Promise<
    | undefined
    | {
        isUntitled: boolean;
        path: string;
        contents: string;
      }
  >;
}

export async function validateSearchAndReplaceFilepath(
  filepath: unknown,
  ide: SearchAndReplacePathIDE,
) {
  if (!filepath || typeof filepath !== "string") {
    throw new ContinueError(
      ContinueErrorReason.FindAndReplaceMissingFilepath,
      "filepath (string) is required",
    );
  }
  const resolvedFilepath = await resolveRelativePathInDir(filepath, ide);
  if (!resolvedFilepath) {
    throw new ContinueError(
      ContinueErrorReason.FileNotFound,
      `File ${filepath} does not exist`,
    );
  }
  return resolvedFilepath;
}
