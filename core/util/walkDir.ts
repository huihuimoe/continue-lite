import ignore, { Ignore } from "ignore";

import { getGlobalContinueIgArray } from "./continueignore";
import { defaultIgnoreFileAndDir, gitIgArrayFromFile } from "./ignore";
import { joinPathsToUri } from "./uri";

type WalkDirFileType = number;

interface WalkDirIDE {
  listDir(dir: string): Promise<[string, WalkDirFileType][]>;
  getWorkspaceDirs(): Promise<string[]>;
  readFile(filepath: string): Promise<string>;
}

export interface WalkerOptions {
  include?: "dirs" | "files" | "both";
  returnRelativeUrisPaths?: boolean;
  source?: string;
  overrideDefaultIgnores?: Ignore;
  recursive?: boolean;
}

type Entry = [string, WalkDirFileType];

const LIST_DIR_CACHE_TIME = 30_000;
const IGNORE_FILE_CACHE_TIME = 30_000;

type WalkableEntry = {
  name: string;
  relativeUriPath: string;
  uri: string;
  type: WalkDirFileType;
  entry: Entry;
};

type WalkContext = {
  walkableEntry: WalkableEntry;
  ignoreContexts: IgnoreContext[];
};

type IgnoreContext = {
  ignore: Ignore;
  dirname: string;
};

class WalkDirCache {
  dirListCache: Map<
    string,
    {
      time: number;
      entries: Promise<[string, WalkDirFileType][]>;
    }
  > = new Map();
  dirIgnoreCache: Map<
    string,
    {
      time: number;
      ignore: Promise<Ignore>;
    }
  > = new Map();

  invalidate() {
    this.dirListCache.clear();
    this.dirIgnoreCache.clear();
  }
}

export const walkDirCache = new WalkDirCache();

class DFSWalker {
  constructor(
    private readonly uri: string,
    private readonly ide: WalkDirIDE,
    private readonly options: WalkerOptions,
  ) {}

  public async *walk(): AsyncGenerator<string> {
    const defaultAndGlobalIgnores = ignore()
      .add(this.options.overrideDefaultIgnores ?? defaultIgnoreFileAndDir)
      .add(getGlobalContinueIgArray());

    const rootContext: WalkContext = {
      walkableEntry: {
        name: "",
        relativeUriPath: "",
        uri: this.uri,
        type: 2,
        entry: ["", 2],
      },
      ignoreContexts: [],
    };
    const stack = [rootContext];

    for (let cur = stack.pop(); cur; cur = stack.pop()) {
      let entries: [string, WalkDirFileType][] = [];
      const cachedListdir = walkDirCache.dirListCache.get(cur.walkableEntry.uri);
      if (
        cachedListdir &&
        cachedListdir.time > Date.now() - LIST_DIR_CACHE_TIME
      ) {
        entries = await cachedListdir.entries;
      } else {
        const promise = this.ide.listDir(cur.walkableEntry.uri);
        walkDirCache.dirListCache.set(cur.walkableEntry.uri, {
          time: Date.now(),
          entries: promise,
        });
        entries = await promise;
      }

      let newIgnore: Ignore;
      const cachedIgnore = walkDirCache.dirIgnoreCache.get(cur.walkableEntry.uri);
      if (
        cachedIgnore &&
        cachedIgnore.time > Date.now() - IGNORE_FILE_CACHE_TIME
      ) {
        newIgnore = await cachedIgnore.ignore;
      } else {
        const ignorePromise = getIgnoreContext(
          cur.walkableEntry.uri,
          entries,
          this.ide,
          defaultAndGlobalIgnores,
        );
        walkDirCache.dirIgnoreCache.set(cur.walkableEntry.uri, {
          time: Date.now(),
          ignore: ignorePromise,
        });
        newIgnore = await ignorePromise;
      }

      const ignoreContexts = [
        ...cur.ignoreContexts,
        {
          ignore: newIgnore,
          dirname: cur.walkableEntry.relativeUriPath,
        },
      ];

      for (const entry of entries) {
        if (this.entryIsSymlink(entry)) {
          continue;
        }

        const walkableEntry = {
          name: entry[0],
          relativeUriPath: `${cur.walkableEntry.relativeUriPath}${cur.walkableEntry.relativeUriPath ? "/" : ""}${entry[0]}`,
          uri: joinPathsToUri(cur.walkableEntry.uri, entry[0]),
          type: entry[1],
          entry,
        };

        let relPath = walkableEntry.relativeUriPath;
        if (this.entryIsDirectory(entry)) {
          relPath = `${relPath}/`;
        } else if (this.options.include === "dirs") {
          continue;
        }

        let shouldIgnore = false;
        for (const ig of ignoreContexts) {
          if (shouldIgnore) {
            continue;
          }

          const prefixLength = ig.dirname.length === 0 ? 0 : ig.dirname.length + 1;
          const matchPath = relPath.substring(prefixLength);
          if (ig.ignore.ignores(matchPath)) {
            shouldIgnore = true;
          }
        }

        if (shouldIgnore) {
          continue;
        }

        if (this.entryIsDirectory(entry)) {
          if (this.options.recursive) {
            stack.push({
              walkableEntry,
              ignoreContexts,
            });
          }
          if (this.options.include !== "files") {
            const trailingSlash = this.options.include === "dirs" ? "" : "/";
            yield this.options.returnRelativeUrisPaths
              ? walkableEntry.relativeUriPath + trailingSlash
              : walkableEntry.uri + trailingSlash;
          }
        } else if (this.options.include !== "dirs") {
          yield this.options.returnRelativeUrisPaths
            ? walkableEntry.relativeUriPath
            : walkableEntry.uri;
        }
      }
    }
  }

  private entryIsDirectory(entry: Entry) {
    return entry[1] === 2;
  }

  private entryIsSymlink(entry: Entry) {
    return entry[1] === 64;
  }
}

const defaultOptions: WalkerOptions = {
  include: "files",
  returnRelativeUrisPaths: false,
  recursive: true,
};

export async function* walkDirAsync(
  path: string,
  ide: WalkDirIDE,
  _optionOverrides?: WalkerOptions,
): AsyncGenerator<string> {
  const options = { ...defaultOptions, ..._optionOverrides };
  yield* new DFSWalker(path, ide, options).walk();
}

export async function walkDir(
  uri: string,
  ide: WalkDirIDE,
  _optionOverrides?: WalkerOptions,
): Promise<string[]> {
  const urisOrRelativePaths: string[] = [];
  for await (const p of walkDirAsync(uri, ide, _optionOverrides)) {
    urisOrRelativePaths.push(p);
  }
  return urisOrRelativePaths;
}

export async function walkDirs(
  ide: WalkDirIDE,
  _optionOverrides?: WalkerOptions,
  dirs?: string[],
): Promise<string[]> {
  const workspaceDirs = dirs ?? (await ide.getWorkspaceDirs());
  const results = await Promise.all(
    workspaceDirs.map((dir) => walkDir(dir, ide, _optionOverrides)),
  );
  return results.flat();
}

export async function getIgnoreContext(
  currentDir: string,
  currentDirEntries: Entry[],
  ide: WalkDirIDE,
  defaultAndGlobalIgnores: Ignore,
) {
  const dirFiles = currentDirEntries
    .filter(([_, entryType]) => entryType === 1)
    .map(([name]) => name);

  const gitIgnoreFile = dirFiles.find((name) => name === ".gitignore");
  const continueIgnoreFile = dirFiles.find((name) => name === ".continueignore");

  const getGitIgnorePatterns = async () => {
    if (gitIgnoreFile) {
      const contents = await ide.readFile(`${currentDir}/.gitignore`);
      return gitIgArrayFromFile(contents);
    }
    return [];
  };

  const getContinueIgnorePatterns = async () => {
    if (continueIgnoreFile) {
      const contents = await ide.readFile(`${currentDir}/.continueignore`);
      return gitIgArrayFromFile(contents);
    }
    return [];
  };

  const ignoreArrays = await Promise.all([
    getGitIgnorePatterns(),
    getContinueIgnorePatterns(),
  ]);

  if (ignoreArrays[0].length === 0 && ignoreArrays[1].length === 0) {
    return defaultAndGlobalIgnores;
  }

  return ignore()
    .add(ignoreArrays[0])
    .add(defaultAndGlobalIgnores)
    .add(ignoreArrays[1]);
}
