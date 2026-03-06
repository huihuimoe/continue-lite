import fs from "fs";

import { getDevDataSqlitePath } from "../util/paths.js";
import { createSqliteConnection, type SqliteConnection } from "./nodeSqlite.js";

/* The Dev Data SQLITE table is only used for local tokens generated */
interface TableInfoRow {
  name: string;
}

export class DevDataSqliteDb {
  static db: SqliteConnection | null = null;

  private static async createTables(db: SqliteConnection) {
    db.exec(
      `CREATE TABLE IF NOT EXISTS tokens_generated (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            model TEXT NOT NULL,
            provider TEXT NOT NULL,
            tokens_generated INTEGER NOT NULL,
            tokens_prompt INTEGER NOT NULL DEFAULT 0,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
    );

    // Add tokens_prompt column if it doesn't exist
    const columnCheckResult = db.all<TableInfoRow>(
      "PRAGMA table_info(tokens_generated);",
    );
    const columnExists = columnCheckResult.some(
      (column) => column.name === "tokens_prompt",
    );
    if (!columnExists) {
      db.exec(
        "ALTER TABLE tokens_generated ADD COLUMN tokens_prompt INTEGER NOT NULL DEFAULT 0;",
      );
    }
  }

  public static async logTokensGenerated(
    model: string,
    provider: string,
    promptTokens: number,
    generatedTokens: number,
  ) {
    const db = await DevDataSqliteDb.get();
    db?.run(
      "INSERT INTO tokens_generated (model, provider, tokens_prompt, tokens_generated) VALUES (?, ?, ?, ?)",
      model,
      provider,
      promptTokens,
      generatedTokens,
    );
  }

  public static async getTokensPerDay() {
    const db = await DevDataSqliteDb.get();
    const result = db?.all(
      // Return a sum of tokens_generated and tokens_prompt columns aggregated by day
      `SELECT date(timestamp) as day, sum(tokens_prompt) as promptTokens, sum(tokens_generated) as generatedTokens
        FROM tokens_generated
        GROUP BY date(timestamp)`,
    );
    return result ?? [];
  }

  public static async getTokensPerModel() {
    const db = await DevDataSqliteDb.get();
    const result = db?.all(
      // Return a sum of tokens_generated and tokens_prompt columns aggregated by model
      `SELECT model, sum(tokens_prompt) as promptTokens, sum(tokens_generated) as generatedTokens
        FROM tokens_generated
        GROUP BY model`,
    );
    return result ?? [];
  }

  static async get() {
    const devDataSqlitePath = getDevDataSqlitePath();
    if (DevDataSqliteDb.db && fs.existsSync(devDataSqlitePath)) {
      return DevDataSqliteDb.db;
    }

    DevDataSqliteDb.db = createSqliteConnection(devDataSqlitePath);

    await DevDataSqliteDb.createTables(DevDataSqliteDb.db!);

    return DevDataSqliteDb.db;
  }
}
