import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";

type SqliteBindValue = string | number | bigint | Uint8Array | null;

export interface SqliteConnection {
  exec(sql: string): void;
  run(sql: string, ...params: SqliteBindValue[]): void;
  get<T>(sql: string, ...params: SqliteBindValue[]): T | undefined;
  all<T>(sql: string, ...params: SqliteBindValue[]): T[];
  transaction<T>(callback: () => T): T;
  close(): void;
}

class NodeSqliteConnection implements SqliteConnection {
  constructor(private readonly db: DatabaseSync) {}

  exec(sql: string) {
    this.db.exec(sql);
  }

  run(sql: string, ...params: SqliteBindValue[]) {
    this.db.prepare(sql).run(...params);
  }

  get<T>(sql: string, ...params: SqliteBindValue[]) {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }

  all<T>(sql: string, ...params: SqliteBindValue[]) {
    return this.db.prepare(sql).all(...params) as T[];
  }

  transaction<T>(callback: () => T) {
    this.exec("BEGIN TRANSACTION");

    try {
      const result = callback();
      this.exec("COMMIT");
      return result;
    } catch (error) {
      this.exec("ROLLBACK");
      throw error;
    }
  }

  close() {
    this.db.close();
  }
}

export function createSqliteConnection(filename: string): SqliteConnection {
  fs.mkdirSync(path.dirname(filename), { recursive: true });

  const db = new DatabaseSync(filename);
  db.exec("PRAGMA busy_timeout = 3000;");

  return new NodeSqliteConnection(db);
}
