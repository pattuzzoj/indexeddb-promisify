import { describe, test, expect } from 'vitest';
import "fake-indexeddb/auto";
import openIndexedDB from "../src/index";
import type { IndexedDBConfig, Migration } from "../src/index";

describe("Schema sync and migration system", () => {
  test("should sync schema: add/remove stores and indexes", async () => {
    // Initial schema
    const configV1: IndexedDBConfig = {
      name: "db-schema-sync",
      version: 1,
      stores: [
        { name: "store1" },
        {
          name: "store2",
          options: { keyPath: "id", autoIncrement: true },
          index: [{ name: "idx_name", keyPath: "name" }]
        }
      ]
    };
    const dbV1 = await openIndexedDB(configV1);
    expect(dbV1.db?.objectStoreNames.contains("store1")).toBeTruthy();
    expect(dbV1.db?.objectStoreNames.contains("store2")).toBeTruthy();
    const store2 = dbV1.db?.transaction("store2").objectStore("store2");
    expect(store2?.indexNames.contains("idx_name")).toBeTruthy();
    await dbV1.deleteDatabase();

    // Updated schema: remove store1, add store3, remove idx_name, add idx_new
    const configV2: IndexedDBConfig = {
      name: "db-schema-sync",
      version: 2,
      stores: [
        {
          name: "store2",
          options: { keyPath: "id", autoIncrement: true },
          index: [{ name: "idx_new", keyPath: "newField" }]
        },
        { name: "store3" }
      ]
    };
    const dbV2 = await openIndexedDB(configV2);
    expect(dbV2.db?.objectStoreNames.contains("store1")).toBeFalsy();
    expect(dbV2.db?.objectStoreNames.contains("store2")).toBeTruthy();
    expect(dbV2.db?.objectStoreNames.contains("store3")).toBeTruthy();
    const store2v2 = dbV2.db?.transaction("store2").objectStore("store2");
    expect(store2v2?.indexNames.contains("idx_name")).toBeFalsy();
    expect(store2v2?.indexNames.contains("idx_new")).toBeTruthy();
    await dbV2.deleteDatabase();
  });

  test("should run migrations on version upgrade", async () => {
    const configV1: IndexedDBConfig = {
      name: "db-schema-migration",
      version: 1,
      stores: [
        { name: "storeA" }
      ]
    };
    const dbV1 = await openIndexedDB(configV1);
    expect(dbV1.db?.objectStoreNames.contains("storeA")).toBeTruthy();
    await dbV1.deleteDatabase();

    // Migration: add storeB and index idx_migrate
    const migration: Migration = {
      version: 2,
      migration: async ({ db, transaction }) => {
        db.createObjectStore("storeB", { keyPath: "id" });
        const storeB = transaction.objectStore("storeB");
        storeB.createIndex("idx_migrate", "field");
      }
    };
    const configV2: IndexedDBConfig = {
      name: "db-schema-migration",
      version: 2,
      stores: [
        { name: "storeA" },
        { name: "storeB", options: { keyPath: "id" }, index: [{ name: "idx_migrate", keyPath: "field" }] }
      ],
      migrations: [migration]
    };
    const dbV2 = await openIndexedDB(configV2);
    expect(dbV2.db?.objectStoreNames.contains("storeB")).toBeTruthy();
    const storeB = dbV2.db?.transaction("storeB").objectStore("storeB");
    expect(storeB?.indexNames.contains("idx_migrate")).toBeTruthy();
    await dbV2.deleteDatabase();
  });
});
