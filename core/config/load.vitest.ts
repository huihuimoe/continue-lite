import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { LLMLogger } from "../llm/logger";
import FileSystemIde from "../util/filesystem";
import { TEST_DIR, setUpTestDir, tearDownTestDir } from "../test/testDir";

describe("loadContinueConfigFromJson config.ts loading", () => {
  let continueGlobalDir: string;

  beforeEach(() => {
    setUpTestDir();
    continueGlobalDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "continue-config-load-"),
    );
    process.env.CONTINUE_GLOBAL_DIR = continueGlobalDir;
    delete process.env.IS_BINARY;
    vi.resetModules();
  });

  afterEach(() => {
    tearDownTestDir();
    fs.rmSync(continueGlobalDir, { recursive: true, force: true });
    delete process.env.CONTINUE_GLOBAL_DIR;
    vi.restoreAllMocks();
  });

  test("does not apply stale config.js after a later config.ts build failure", async () => {
    const { loadContinueConfigFromJson } = await import("./load");
    const { getConfigJsPath, getConfigTsPath } = await import("../util/paths");

    const ide = new FileSystemIde(TEST_DIR);
    const ideSettings = await ide.getIdeSettings();
    const ideInfo = await ide.getIdeInfo();

    fs.writeFileSync(
      getConfigTsPath(),
      `export function modifyConfig(config: Config): Config {
  config.systemMessage = "fresh system message";
  return config;
}`,
    );

    const initialLoad = await loadContinueConfigFromJson(
      ide,
      ideSettings,
      ideInfo,
      "test-unique-id",
      new LLMLogger(),
      { models: [] } as any,
    );

    expect((initialLoad.config as any)?.systemMessage).toBe(
      "fresh system message",
    );
    expect(fs.existsSync(getConfigJsPath())).toBe(true);

    fs.writeFileSync(
      getConfigTsPath(),
      `export function modifyConfig(config: Config): Config {
  config.systemMessage = "broken";
  return config;
`,
    );

    const loadAfterFailedBuild = await loadContinueConfigFromJson(
      ide,
      ideSettings,
      ideInfo,
      "test-unique-id",
      new LLMLogger(),
      { models: [] } as any,
    );

    expect((loadAfterFailedBuild.config as any)?.systemMessage).toBeUndefined();
  });
});
