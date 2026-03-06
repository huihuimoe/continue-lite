import fs from "fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getDevDataSqlitePath } from "../util/paths";
import { DevDataSqliteDb } from "./devdataSqlite";

type ClosableDb = {
  close?: () => Promise<void> | void;
};

interface TokensPerDayRow {
  day: string;
  promptTokens: number;
  generatedTokens: number;
}

interface TokensPerModelRow {
  model: string;
  promptTokens: number;
  generatedTokens: number;
}

describe("DevDataSqliteDb", () => {
  beforeEach(async () => {
    const existingDb = DevDataSqliteDb.db as ClosableDb | null;
    await existingDb?.close?.();
    DevDataSqliteDb.db = null;

    const dbPath = getDevDataSqlitePath();
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  afterEach(async () => {
    const existingDb = DevDataSqliteDb.db as ClosableDb | null;
    await existingDb?.close?.();
    DevDataSqliteDb.db = null;
  });

  it("creates the sqlite file on first write", async () => {
    const dbPath = getDevDataSqlitePath();

    await DevDataSqliteDb.logTokensGenerated("model-a", "provider-a", 5, 7);

    expect(fs.existsSync(dbPath)).toBe(true);
  });

  it("aggregates tokens by day", async () => {
    await DevDataSqliteDb.logTokensGenerated("model-a", "provider-a", 5, 7);
    await DevDataSqliteDb.logTokensGenerated("model-b", "provider-b", 11, 13);

    const rows = (await DevDataSqliteDb.getTokensPerDay()) as TokensPerDayRow[];

    expect(rows).toHaveLength(1);
    expect(rows[0]?.promptTokens).toBe(16);
    expect(rows[0]?.generatedTokens).toBe(20);
  });

  it("aggregates tokens by model", async () => {
    await DevDataSqliteDb.logTokensGenerated("model-a", "provider-a", 1, 2);
    await DevDataSqliteDb.logTokensGenerated("model-a", "provider-a", 3, 4);
    await DevDataSqliteDb.logTokensGenerated("model-b", "provider-b", 10, 20);

    const rows =
      (await DevDataSqliteDb.getTokensPerModel()) as TokensPerModelRow[];

    expect(rows).toEqual([
      { model: "model-a", promptTokens: 4, generatedTokens: 6 },
      { model: "model-b", promptTokens: 10, generatedTokens: 20 },
    ]);
  });
});
