import fs from "fs";
import os from "os";
import path from "path";
import { localPathOrUriToPath, localPathToUri } from "../util/pathToUri";

const TEST_WORKER_ID =
  process.env.VITEST_POOL_ID ??
  process.env.VITEST_WORKER_ID ??
  process.env.JEST_WORKER_ID ??
  "main";
export const TEST_DIR_PATH = path.join(
  os.tmpdir(),
  `testWorkspaceDir-${TEST_WORKER_ID}-${process.pid}`,
);
export const TEST_DIR = localPathToUri(TEST_DIR_PATH); // URI

export function setUpTestDir() {
  fs.rmSync(TEST_DIR_PATH, { recursive: true, force: true });
  fs.mkdirSync(TEST_DIR_PATH, { recursive: true });
}

export function tearDownTestDir() {
  fs.rmSync(TEST_DIR_PATH, { recursive: true, force: true });
}

/*
  accepts array of items in 3 formats, e.g.
  "index/" creates index directory
  "index/index.ts" creates an empty index/index.ts
  ["index/index.ts", "hello"] creates index/index.ts with contents "hello"
*/
export function addToTestDir(pathsOrUris: (string | [string, string])[]) {
  // Allow tests to use URIs or local paths
  const paths = pathsOrUris.map((val) => {
    if (Array.isArray(val)) {
      return [localPathOrUriToPath(val[0]), val[1]];
    } else {
      return localPathOrUriToPath(val);
    }
  });

  for (const p of paths) {
    const filepath = path.join(TEST_DIR_PATH, Array.isArray(p) ? p[0] : p);
    fs.mkdirSync(path.dirname(filepath), { recursive: true });

    if (Array.isArray(p)) {
      fs.writeFileSync(filepath, p[1]);
    } else if (p.endsWith("/")) {
      fs.mkdirSync(filepath, { recursive: true });
    } else {
      fs.writeFileSync(filepath, "");
    }
  }
}
