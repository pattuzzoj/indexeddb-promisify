import { describe, test, afterEach, beforeEach } from 'vitest';
import "fake-indexeddb/auto";
import openIndexedDB from "../src/index";
import type { IndexedDBConfig } from "../src/index";

describe("indexeddb operations", async () => {
  const config: IndexedDBConfig = {
    name: "db-useStore",
    version: 1,
    stores: [
      {
        name: "users",
        options: { keyPath: "id" },
        index: [{ name: "id_idx", keyPath: "id" }]
      }
    ]
  };

  let db: Awaited<ReturnType<typeof openIndexedDB>>;
  let store: ReturnType<typeof db.useStore<{ id?: number, name: string }>>;

  beforeEach(async () => {
    db = await openIndexedDB(config);
    store = db.useStore("users");
  });

  afterEach(async () => {
    await db.deleteDatabase();
  });

  test("add and get", async ({ expect }) => {
    const id = await store.add({ id: 1, name: "Alice" });
    const user = await store.get(id);
    expect(user.name).toBe("Alice");
  });

  test("put", async ({ expect }) => {
    const id = await store.add({ id: 1, name: "Bob" });
    await store.put({ id: id as number, name: "Bob Updated" });
    const user = await store.get(id);
    expect(user.name).toBe("Bob Updated");
  });

  test("getAll", async ({ expect }) => {
    await store.add({ id: 0, name: "Carol" });
    const users = await store.getAll();
    expect(users.length).toBe(1);
  });

  test("getKey", async ({ expect }) => {
    const id = await store.add({ id: 0, name: "Dave" });
    const key = await store.getKey(id);
    expect(key).toBe(id);
  });

  test("getAllKeys", async ({ expect }) => {
    const key1 = await store.add({ id: 0, name: "Dave" });
    const key2 = await store.add({ id: 1, name: "Bruna" });
    const keys = await store.getAllKeys();
    expect(keys.length).toBe(2);
  });

  test("count", async ({ expect }) => {
    await store.add({ id: 0, name: "Eve" });
    const count = await store.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("delete", async ({ expect }) => {
    const id = await store.add({ id: 0, name: "Eve" });
    await store.delete(id);
    const user = await store.get(id);
    expect(user).toBeUndefined();
  });

  test("clear", async ({ expect }) => {
    await store.add({ id: 0, name: "Temp" });
    await store.clear();
    const count = await store.count();
    expect(count).toBe(0);
  });

  test("openCursor", async ({ expect }) => {
    await store.add({ id: 0, name: "Frank" });
    const results = await store.openCursor(cursor => cursor.value.name);
    expect(results).toContain("Frank");
  });

  test("openKeyCursor", async ({ expect }) => {
    await store.add({ id: 1, name: "Frank" });
    await store.add({ id: 2, name: "Eve" });
    const results = await store.openKeyCursor(cursor => cursor.key);
    expect(results.length).toBe(2);
  });

  test("transaction", async ({ expect }) => {
    const { stores, done } = db.transaction(["users"], "readwrite");
    const users = stores["users"];
    users.add({ id: 101, name: "UserA" });
    users.add({ id: 102, name: "UserB" });
    users.delete(101);
    await done;

    const userA = await store.get(101);
    const userB = await store.get(102);
    expect(userA).toBeUndefined();
    expect(userB.name).toBe("UserB");
  });
});