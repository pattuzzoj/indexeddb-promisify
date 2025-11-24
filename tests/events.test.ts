import { describe, test, vi } from 'vitest';
import "fake-indexeddb/auto";
import openIndexedDB from "../src/index.ts";
import type { IndexedDBConfig } from "../src/index";

describe("IndexedDB Events", () => {
  const dbName = "test-db";

  const baseConfig = {
    name: dbName,
    version: 1,
    stores: [{ name: "users", options: { keyPath: "id" } }],
    events: {}
  };

  test("should call onBlocked when open indexeddb is blocked", async ({ expect }) => {
    const onBlockSpy = vi.spyOn(indexedDB, "open").mockImplementation(() => {
      const request = {
        onblocked: async (event: any) => { },
        triggerOnBlocked: () => request.onblocked({ oldVersion: 1, newVersion: 2 }),
      };
      setTimeout(() => request.triggerOnBlocked(), 0);
      return request;
    });

    const onBlocked = vi.fn(({ oldVersion, newVersion }) => {
      expect(oldVersion).toBe(1);
      expect(newVersion).toBe(2);
    });

    const config: IndexedDBConfig = {
      ...baseConfig,
      events: {
        onBlocked
      }
    };

    try {
      await openIndexedDB(config);
    } catch (error) { }

    expect(onBlocked).toHaveBeenCalled();

    onBlockSpy.mockRestore();
  });

  test("should call onError when open indexeddb fails", async ({ expect }) => {
    const onErrorSpy = vi.spyOn(indexedDB, "open").mockImplementation(() => {
      const request = {
        onerror: async (event: Event) => { },
        triggerOnError: () => request.onerror({ target: { error: new Error("Error") } })
      }

      setTimeout(() => request.triggerOnError(), 0);
      return request;
    });

    const onError = vi.fn();

    const config: IndexedDBConfig = {
      ...baseConfig,
      events: {
        onError
      }
    }

    try {
      await openIndexedDB(config);
    } catch (error) { }

    expect(onError).toHaveBeenCalled();

    onErrorSpy.mockRestore();
  });

  test("should call onError when duplicate key is added", async ({ expect }) => {
    const onError = vi.fn();

    const config: IndexedDBConfig = {
      ...baseConfig,
      events: {
        onError
      }
    }

    const { db, useStore, deleteDatabase } = await openIndexedDB(config);
    const store = useStore("users");

    await store.add({ id: 1, name: "John" });

    try {
      await store.add({ id: 1, name: "John" });
    } catch (error) { }

    expect(onError).toHaveBeenCalled();

    db?.close();
    await deleteDatabase();
  });

  test("should call onTransactionTimeout when a transaction exceeds timeout", async ({ expect }) => {
    const onTransactionTimeout = vi.fn();

    const config: IndexedDBConfig = {
      ...baseConfig,
      transactionTimeout: 10,
      events: { onTransactionTimeout }
    };

    const { db, transaction, deleteDatabase } = await openIndexedDB(config);


    try {
      const { stores, done } = transaction(["users"]);
      const users = stores["users"];
      users.add({
        id: 1,
        name: "User",
        payload: "x".repeat(500000000)
      });
      await done;
    } catch (error) { }

    expect(onTransactionTimeout).toHaveBeenCalled();

    db?.close();
    await deleteDatabase();
  });

  test("should call onTransactionTimeout when a transaction operation exceeds timeout", async ({ expect }) => {
    const onTransactionTimeout = vi.fn();

    const config: IndexedDBConfig = {
      ...baseConfig,
      transactionTimeout: 1,
      events: { onTransactionTimeout }
    };

    const { db, useStore, deleteDatabase } = await openIndexedDB(config);
    const store = useStore("users");

    try {
      for (let i = 0; i < 5000; i++) {
        await store.add({
          id: i,
          name: `User ${i}`,
          payload: "x".repeat(1024) // 1 KB
        });
      }

      await store.getAll();
    } catch (error) { }

    expect(onTransactionTimeout).toHaveBeenCalled();

    db?.close();
    await deleteDatabase();
  });

  test("should call onUpgradeStart and onUpgradeEnd during upgrade", async ({ expect }) => {
    await openIndexedDB({
      ...baseConfig,
      version: 1
    });

    const onUpgradeStart = vi.fn();
    const onUpgradeEnd = vi.fn();

    await openIndexedDB({
      ...baseConfig,
      version: 2,
      events: { onUpgradeStart, onUpgradeEnd }
    });

    expect(onUpgradeStart).toBeCalled();
    expect(onUpgradeEnd).toBeCalled();

    indexedDB.deleteDatabase(baseConfig.name);
  });


  test("should call onVersionChange when version changes and db is open", async ({ expect }) => {
    const onVersionChange = vi.fn();

    const { db } = await openIndexedDB({
      ...baseConfig,
      version: 1,
      events: { onVersionChange }
    });

    await openIndexedDB({
      ...baseConfig,
      version: 2
    });

    expect(onVersionChange).toBeCalled();
    db?.close();
  });
});
