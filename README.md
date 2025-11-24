# indexedb-async

`indexedb-async` is an async wrapper for IndexedDB that provides an ergonomic interface for working with browser databases. Every operation runs inside a transaction to ensure consistency. For multi-store operations, the `transaction` helper allows safe handling of multiple object stores and provides a `done` promise to wait for the commit.

## Installation

Install easily using your favorite package manager:

```bash
npm install indexedb-async
# or
yarn add indexedb-async
# or
pnpm add indexedb-async
```
---

## Configuration

The configuration follows the `IndexedDBConfig` interface:

```ts
import openIndexedDB, { IndexedDBConfig } from 'indexedb-async';

const config: IndexedDBConfig = {
  name: 'my-database',
  version: 1,
  stores: [
    {
      name: 'users',
      options: { keyPath: 'id', autoIncrement: true },
      index: [
        { name: 'name_idx', keyPath: 'name', options: { unique: false } }
      ]
    }
  ],
  transactionTimeout: 5000,
  events: {
    onError: (error) => console.error(error),
    onBlocked: ({ oldVersion, newVersion }) => {},
    onUpgradeStart: ({ db, oldVersion, newVersion }) => {},
    onUpgradeEnd: ({ db, oldVersion, newVersion }) => {},
    onVersionChange: ({ db, oldVersion, newVersion }) => {},
    onTransactionTimeout: ({ db, storeNames, timeout }) => {},
  }
};

const db = await openIndexedDB(config);
```

### Explanation

* `name` – database name
* `version` – database version
* `stores` – object store definitions (key path, auto increment, indexes)
* `transactionTimeout` – maximum time for transactions before aborting (default: 5000ms)
* `events` – lifecycle and error callbacks:

  * `onError` – triggered on any database error
  * `onBlocked` – triggered when an upgrade is blocked by other open connections
  * `onUpgradeStart` / `onUpgradeEnd` – triggered before and after upgrades
  * `onVersionChange` – triggered when the version changes while a connection is open
  * `onTransactionTimeout` – triggered when a transaction exceeds the configured timeout

---

## IndexedDBInstance API

`openIndexedDB` returns an `IndexedDBInstance` with the following properties and methods:

```ts
const { db, useStore, transaction, clearDatabase, deleteDatabase } = await openIndexedDB(config);

// Get operations for a specific store
const users = useStore<{ id?: number; name: string }>('users');
await users.add({ name: 'Alice' });

// Create a transaction across multiple stores
const { stores, done } = transaction(['users', 'orders']);
stores.users.add({ name: 'Bob' });
stores.orders.add({ orderId: 123, userId: 1 });
await done; // commit happens here

// Utility methods
await clearDatabase(); // clear all stores
await deleteDatabase(); // delete the database entirely
```

**Explanation:**

* `db` – the underlying `IDBDatabase`
* `useStore` – get operations for a single store
* `transaction` – multi-store transaction with a `done` promise
* `clearDatabase` – clears all records in all stores
* `deleteDatabase` – closes and deletes the database

---

## Store Schema & Migrations

`indexedb-async` allows you to define your database schema through the `stores` configuration and optionally handle upgrades via `migrations`.

### Store Schema

```ts
export interface StoreSchema {
  name: string;
  options?: IDBObjectStoreParameters;
  index?: { name: string; keyPath: string; options?: IDBIndexParameters }[];
}
```

* `name` – name of the object store
* `options` – store options (e.g., `keyPath`, `autoIncrement`)
* `index` – optional indexes with name, keyPath, and options

### Schema Synchronization

By default, `indexedb-async` synchronizes the schema automatically:

1. Deletes object stores not present in the configuration.
2. Creates missing stores.
3. Deletes obsolete indexes.
4. Creates missing indexes.

> **Note:** If migrations are provided, automatic schema synchronization is **disabled**. Migrations are responsible for all store/index creation, deletion, or modification.

### Migrations

Define migrations to safely upgrade your database:

```ts
export interface Migration {
  version: number;
  migration: ({
    db,
    transaction,
    oldVersion,
    newVersion,
    migrationVersion
  }: {
    db: IDBDatabase;
    transaction: IDBTransaction;
    oldVersion: number;
    newVersion: number;
    migrationVersion: number;
  }) => Promise<void>;
}
```

**Example migrations:**

```ts
const migrations: Migration[] = [
  {
    version: 2,
    migration: async ({ db, transaction, oldVersion, newVersion, migrationVersion }) => {
      // Create a new store
      if (!db.objectStoreNames.contains('orders')) {
        db.createObjectStore('orders', { keyPath: 'orderId', autoIncrement: true });
      }
      // Create an index on an existing store
      const usersStore = transaction.objectStore('users');
      if (!usersStore.indexNames.contains('email_idx')) {
        usersStore.createIndex('email_idx', 'email', { unique: true });
      }
    },
  },
  {
    version: 3,
    migration: async ({ db, transaction, oldVersion, newVersion, migrationVersion }) => {
      // Remove an obsolete store
      if (db.objectStoreNames.contains('temp')) {
        db.deleteObjectStore('temp');
      }
      // Add a new index
      const ordersStore = transaction.objectStore('orders');
      if (!ordersStore.indexNames.contains('user_idx')) {
        ordersStore.createIndex('user_idx', 'userId', { unique: false });
      }
    },
  },
];
```

* Migrations run in ascending order by version.

* Each migration receives:

  * `db` – the database instance
  * `transaction` – the upgrade transaction
  * `oldVersion` – database version before the migration
  * `newVersion` – target database version
  * `migrationVersion` – the version of the migration itself

* You are responsible for creating, modifying, or deleting stores and indexes within migrations.

---

## Store Operations

Use `useStore<T>` to access CRUD and cursor operations for a given object store:

```ts
const users = db.useStore<{ id?: number; name: string }>('users');

await users.add({ name: 'Alice' });
await users.put({ id: 1, name: 'Alice Smith' });
const user = await users.get(1);
const allUsers = await users.getAll();
await users.delete(1);
```

### Available Methods

| Method          | Description                                                                 |
| --------------- | --------------------------------------------------------------------------- |
| `add`           | Inserts a value into the store, returns generated or provided key           |
| `put`           | Updates or inserts a value, returns generated or provided key               |
| `get`           | Retrieves a value by key or key range                                       |
| `getAll`        | Retrieves all values, optionally filtered by key/range and limited by count |
| `getKey`        | Retrieves the key of a value                                                |
| `getAllKeys`    | Retrieves all keys, optionally filtered and limited                         |
| `count`         | Returns the number of records in the store                                  |
| `delete`        | Removes a record by key or key range                                        |
| `clear`         | Clears all records in the store                                             |
| `openCursor`    | Iterates over records using a cursor; returns results of the callback       |
| `openKeyCursor` | Iterates over keys using a key cursor; returns keys or ranges               |

### Cursor Options

```ts
interface CursorOptions {
  query?: IDBValidKey | IDBKeyRange;
  direction?: IDBCursorDirection;
  index?: string;
}
```

* `query` – key or key range filter
* `direction` – cursor direction (`next`, `prev`, etc.)
* `index` – specify which index to use

---

## Transactions

`indexedb-async` provides a flexible `transaction` helper that wraps one or more object stores in a single `IDBTransaction` and exposes a `done` promise for commit handling.

### Basic Usage

```ts
const { transaction, stores, done } = db.transaction(['users'], 'readwrite');

stores.users.add({ name: 'Bob' });
stores.users.add({ name: 'Carol' });

await done; // waits for the transaction to commit
```

* `transaction` – the `IDBTransaction` object
* `stores` – mapped object stores for direct access
* `done` – promise resolved when the transaction completes successfully

### Multi-Store Example

```ts
try {
  const { stores, done } = db.transaction(['users']);
  stores.users.add({ name: 'Eve' });
  await done;
} catch (err) {
  console.error('Transaction failed', err);
}
```

### Notes

* Transactions automatically respect the configured `transactionTimeout`.
* Errors inside a transaction reject the `done` promise and abort the transaction.
* Always wrap transaction usage in a try-catch if you need to handle runtime errors safely

---

## Events

All event callbacks are now promise-based and receive the `db` instance when applicable.

* **onBlocked** – Triggered when a database upgrade is blocked by another open connection. Returns a promise that can resolve to an `Error`. If no error is provided, a default upgrade-blocked error is used. The upgrade is rejected either way, and the database is closed automatically if the upgrade cannot proceed.

* **onError** – Triggered whenever an error occurs in the database. Receives the error object.

* **onTransactionTimeout** – Triggered when a transaction exceeds the configured timeout. Receives the database instance, the store names involved, and the timeout duration.

* **onUpgradeStart** – Called at the beginning of a database upgrade. Receives the database, old version, and new version.

* **onUpgradeEnd** – Called at the end of a database upgrade. Receives the database, old version, and new version.

* **onVersionChange** – Called when the database version changes while a connection is open. Receives the database, old version, and new version. After this event, the database is automatically closed to prevent conflicts.

---

## Notes

* **Transactions timeout** – All transactions are wrapped with a timeout (default 5000ms). If a transaction exceeds this limit, it is aborted and `onTransactionTimeout` is triggered.

* **Schema sync vs. migrations** – Automatic schema synchronization (adding/removing stores and indexes) is **disabled** when `migrations` are provided. In that case, database changes must be handled via migrations.

* **Automatic database closure** – The database is automatically closed when a version change is detected or when an upgrade is blocked by another open connection. This ensures that pending transactions are not interrupted unexpectedly.

* **Event promises** – All event handlers now return promises, allowing asynchronous handling before the system continues.

* **Default errors** – If `onBlocked` or other events do not provide a custom `Error`, a default error is thrown and the operation is rejected.

* **Multi-store transactions** – Use the `transaction` helper for operations spanning multiple object stores. The returned `done` promise ensures that all operations are committed before continuing.

* **Use with caution** – While `useStore` provides convenient single-store operations, prefer transactions for multi-step workflows to maintain atomicity and consistency.

---