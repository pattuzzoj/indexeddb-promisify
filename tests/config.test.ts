import { describe, test } from 'vitest';
import "fake-indexeddb/auto";
import openIndexedDB from "../src/index";
import type { IndexedDBConfig } from "../src/index";

describe("Database creation with different configurations", () => {
  test("should create a basic database", async ({ expect }) => {
    const config: IndexedDBConfig = {
      name: "db-basic",
      version: 1,
      stores: [
        { name: "store1" }
      ]
    }

    const { db, deleteDatabase } = await openIndexedDB(config);

    expect(db?.objectStoreNames.contains("store1")).toBeTruthy();
    await deleteDatabase();
  });

  test("should create a database with multiple stores", async ({ expect }) => {
    const config: IndexedDBConfig = {
      name: "db-multi-store",
      version: 1,
      stores: [
        { name: "store1" },
        { name: "store2", options: { keyPath: "key" } }
      ]
    }

    const { db, deleteDatabase } = await openIndexedDB(config);
    expect(db?.objectStoreNames.contains("store1")).toBeTruthy();
    expect(db?.objectStoreNames.contains("store2")).toBeTruthy();
    await deleteDatabase();
  });

  test("should create a database with indexed store", async ({ expect }) => {
    const config: IndexedDBConfig = {
      name: "db-with-index",
      version: 1,
      stores: [
        {
          name: "store1",
          options: { keyPath: "id", autoIncrement: true },
          index: [{ name: "idx_name", keyPath: "name" }]
        }
      ]
    }

    const { db, deleteDatabase } = await openIndexedDB(config);
    expect(db?.objectStoreNames.contains("store1")).toBeTruthy();
    const store = db?.transaction("store1").objectStore("store1");
    expect(store?.indexNames.contains("idx_name")).toBeTruthy();
    await deleteDatabase();
  });
});
