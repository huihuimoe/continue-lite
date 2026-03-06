import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import { createSqliteConnection, type SqliteConnection } from "./nodeSqlite";

describe("nodeSqlite", () => {
  const tempDirs: string[] = [];
  const openConnections: SqliteConnection[] = [];

  function createDbPath(name: string) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "continue-sqlite-"));
    tempDirs.push(tempDir);
    return path.join(tempDir, `${name}.sqlite`);
  }

  afterEach(() => {
    while (openConnections.length > 0) {
      openConnections.pop()?.close();
    }

    while (tempDirs.length > 0) {
      const tempDir = tempDirs.pop();
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  });

  it("creates a database file and supports parameterized writes", () => {
    const dbPath = createDbPath("basic");
    const db = createSqliteConnection(dbPath);
    openConnections.push(db);

    db.exec(`
      CREATE TABLE test_rows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        value INTEGER NOT NULL
      )
    `);

    db.run("INSERT INTO test_rows (name, value) VALUES (?, ?)", "first", 42);

    expect(fs.existsSync(dbPath)).toBe(true);
    expect(
      db.get<{ name: string; value: number }>(
        "SELECT name, value FROM test_rows WHERE name = ?",
        "first",
      ),
    ).toEqual({ name: "first", value: 42 });
  });

  it("returns rows from all() using object-shaped results", () => {
    const dbPath = createDbPath("all");
    const db = createSqliteConnection(dbPath);
    openConnections.push(db);

    db.exec(
      "CREATE TABLE counters (category TEXT NOT NULL, count INTEGER NOT NULL)",
    );
    db.run("INSERT INTO counters (category, count) VALUES (?, ?)", "a", 1);
    db.run("INSERT INTO counters (category, count) VALUES (?, ?)", "b", 2);

    expect(
      db.all<{ category: string; count: number }>(
        "SELECT category, count FROM counters ORDER BY count ASC",
      ),
    ).toEqual([
      { category: "a", count: 1 },
      { category: "b", count: 2 },
    ]);
  });

  it("supports explicit transaction rollback", () => {
    const dbPath = createDbPath("transaction");
    const db = createSqliteConnection(dbPath);
    openConnections.push(db);

    db.exec("CREATE TABLE events (name TEXT NOT NULL)");

    expect(() =>
      db.transaction(() => {
        db.run("INSERT INTO events (name) VALUES (?)", "before-error");
        throw new Error("boom");
      }),
    ).toThrow("boom");

    expect(db.all<{ name: string }>("SELECT name FROM events")).toEqual([]);
  });
});
