export interface StoreSchema {
  name: string,
  options?: IDBObjectStoreParameters,
  index?: {
    name: string,
    keyPath: string,
    options?: IDBIndexParameters,
  }[]
}

export interface CursorOptions {
  query?: IDBValidKey | IDBKeyRange;
  direction?: IDBCursorDirection;
  index?: string
}

export interface StoreOperations<T> {
  /**
   * Adds a value to the store.
   * @param value Value to be added.
   * @param key Optional key.
   * @returns Generated or provided key.
   */
  add(value: T, key?: IDBValidKey): Promise<IDBValidKey>;

  /**
   * Updates or inserts a value in the store.
   * @param value Value to be inserted/updated.
   * @param key Optional key.
   * @returns Generated or provided key.
   */
  put(value: T, key?: IDBValidKey): Promise<IDBValidKey>;

  /**
   * Retrieves a value by key.
   * @param key Key or range.
   * @returns Found value.
   */
  get(key: IDBValidKey | IDBKeyRange): Promise<T>;

  /**
   * Retrieves all values, optionally filtering by key/range and limiting the amount.
   * @param key Optional key or range.
   * @param count Optional limit.
   * @returns Array of values.
   */
  getAll(key?: IDBValidKey | IDBKeyRange, count?: number): Promise<T[]>;

  /**
   * Retrieves the key of a value.
   * @param key Key or range.
   * @returns Found key or undefined.
   */
  getKey(key: IDBValidKey | IDBKeyRange): Promise<IDBValidKey | undefined>;

  /**
   * Retrieves all keys, optionally filtering by key/range and limiting the amount.
   * @param key Optional key or range.
   * @param count Optional limit.
   * @returns Array of keys.
   */
  getAllKeys(key?: IDBValidKey | IDBKeyRange, count?: number): Promise<IDBValidKey[]>;

  /**
   * Counts the records in the store, optionally filtering by query.
   * @param query Optional key or range.
   * @returns Number of records.
   */
  count(query?: IDBValidKey | IDBKeyRange): Promise<number>;

  /**
   * Removes a record by key.
   * @param key Key or range.
   * @returns undefined.
   */
  delete(key: IDBValidKey | IDBKeyRange): Promise<undefined>;

  /**
   * Clears all records from the store.
   * @returns undefined.
   */
  clear(): Promise<undefined>;

  /**
   * Iterates over records using a cursor.
   * @param callback Function called for each cursor.
   * @returns Array of callback results.
   */
  openCursor(callback: (cursor: IDBCursorWithValue) => T): Promise<T[]>;
  openCursor(options: CursorOptions, callback: (cursor: IDBCursorWithValue) => T): Promise<T[]>;

  /**
   * Iterates over keys using a key cursor.
   * @param callback Function called for each cursor.
   * @returns Array of keys.
   */
  openKeyCursor(callback: (cursor: IDBCursor) => IDBValidKey | IDBKeyRange): Promise<(IDBValidKey | IDBKeyRange)[]>;
  openKeyCursor(options: CursorOptions, callback: (cursor: IDBCursor) => IDBValidKey | IDBKeyRange): Promise<(IDBValidKey | IDBKeyRange)[]>;
}

export interface Migration {
  version: number;
  migration: ({ db, transaction, oldVersion, newVersion, migrationVersion }: { db: IDBDatabase, transaction: IDBTransaction, oldVersion: number, newVersion: number, migrationVersion: number }) => Promise<void>
}

export interface IndexedDBConfig {
  name: string;
  version: number;
  stores: StoreSchema[];
  migrations?: Migration[];
  transactionTimeout?: number;
  events?: {
    /**
     * Called when an upgrade is blocked by another open connection.
     * @param oldVersion Previous database version.
     * @param newVersion Requested database version.
     * @returns Optionally returns an Error to be thrown.
     */
    onBlocked?: ({ oldVersion, newVersion }: { oldVersion: number, newVersion: number }) => Promise<Error | void>;
    /**
     * Called when an error occurs in IndexedDB.
     * @param error Error object.
     */
    onError?: (error: Error) => Promise<void>;
    /**
     * Called when a transaction exceeds the configured timeout.
     * @param storeNames Names of stores involved in the transaction.
     * @param timeout Timeout value in milliseconds.
     */
    onTransactionTimeout?: ({ db, storeNames, timeout }: { db: IDBDatabase, storeNames: string[], timeout: number }) => Promise<void>;
    /**
     * Called at the start of a database upgrade.
     * @param oldVersion Previous database version.
     * @param newVersion New database version.
     */
    onUpgradeStart?: ({ db, oldVersion, newVersion }: { db: IDBDatabase, oldVersion: number, newVersion: number }) => Promise<void>;
    /**
     * Called at the end of a database upgrade.
     * @param oldVersion Previous database version.
     * @param newVersion New database version.
     */
    onUpgradeEnd?: ({ db, oldVersion, newVersion }: { db: IDBDatabase, oldVersion: number, newVersion: number }) => Promise<void>;
    /**
     * Called when the database version changes while a connection is open.
     * @param oldVersion Previous database version.
     * @param newVersion New database version.
     */
    onVersionChange?: ({ db, oldVersion, newVersion }: { db: IDBDatabase, oldVersion: number, newVersion: number }) => Promise<void>;
  }
}

export interface IndexedDBInstance {
  db: IDBDatabase;
  /**
   * Gets operations for a specific store.
   * @param name Store name.
   * @returns Store operations.
   */
  useStore<T>(name: string): StoreOperations<T>;

  /**
   * Creates a transaction for the provided stores.
   * @param storeNames Names of stores involved.
   * @param mode Transaction mode (default "readwrite").
   * @param options Transaction options.
   * @returns Object containing the IDBTransaction, mapped stores and a done promise.
   */
  transaction(
    storeNames: string[],
    mode?: IDBTransactionMode,
    options?: IDBTransactionOptions
  ): {
    transaction: IDBTransaction;
    stores: Record<string, IDBObjectStore>;
    done: Promise<void>;
  };

  /**
   * Clears all stores in the database.
   * @returns Promise resolved when cleared.
   */
  clearDatabase: () => Promise<void>;

  /**
   * Deletes the database.
   * @returns Promise resolved when deleted.
   */
  deleteDatabase: () => Promise<void>;
}

/**
 * Creates an IndexedDB instance according to the configuration.
 * @param config Database configuration.
 * @returns IndexedDBInstance.
 */
export default async function openIndexedDB(config: IndexedDBConfig): Promise<IndexedDBInstance> {
  config.transactionTimeout = config.transactionTimeout ?? 5000

  return new Promise(async (resolve, reject) => {
    const indexedDBRequest = indexedDB.open(config.name, config.version);

    indexedDBRequest.onerror = async (event: Event) => {
      const request = event.target as IDBOpenDBRequest;
      const error = request.error;
      console.error("Error on open IndexedDB:", error);
      await config.events?.onError?.(error!);
      reject(error);
    }

    indexedDBRequest.onblocked = async (event) => {
      const oldVersion = event.oldVersion;
      const newVersion = event.newVersion ?? config.version;
      let error = new Error(`You are not allowed to upgrade the database when it is already active. Prevented from reopening the ${config.name} database in version ${newVersion} when the current version is ${oldVersion}.`);

      if (config.events?.onBlocked) {
        error = await config.events.onBlocked({ oldVersion, newVersion }) ?? error;
      }

      await config.events?.onError?.(error);
      reject(error);
    }

    indexedDBRequest.onupgradeneeded = async (event: IDBVersionChangeEvent) => {
      const request = event.target as IDBRequest;
      const db = request.result;
      const oldVersion = event.oldVersion;
      const newVersion = event.newVersion ?? config.version;

      await config.events?.onUpgradeStart?.({ db, oldVersion, newVersion });

      if (Array.isArray(config.migrations)) {
        const transaction = request.transaction!;
        const migrations = config.migrations.sort((a, b) => a.version - b.version);

        for (const migration of migrations) {
          if (migration.version > oldVersion && migration.version <= newVersion) {
            await migration.migration({ db: db, transaction, oldVersion, newVersion, migrationVersion: migration.version })
          }
        }
      } else {
        for (const storeName of db.objectStoreNames) {
          if (config.stores.every(store => store.name !== storeName)) {
            db.deleteObjectStore(storeName);
          }
        }

        for (const store of config.stores) {
          if (!db.objectStoreNames.contains(store.name)) {
            db.createObjectStore(store.name, store?.options);
          }

          const currentStore = request.transaction!.objectStore(store.name);

          for (const currentIndex of currentStore.indexNames) {
            if (!store?.index?.some(index => index.name == currentIndex)) {
              currentStore.deleteIndex(currentIndex);
            }
          }

          store?.index?.forEach(index => {
            if (!currentStore.indexNames.contains(index.name)) {
              currentStore.createIndex(index.name, index.keyPath, index?.options)
            }
          })
        }
      }

      await config.events?.onUpgradeEnd?.({ db, oldVersion, newVersion });
    }

    indexedDBRequest.onsuccess = (event: Event) => {
      const request = event.target as IDBOpenDBRequest;
      const db = request.result;

      db.onversionchange = async (event: IDBVersionChangeEvent) => {
        const oldVersion = event.oldVersion;
        const newVersion = event.newVersion ?? config.version;
        await config.events?.onVersionChange?.({ db, oldVersion, newVersion });

        db.close();
      }

      function useStore<T>(storeName: string): StoreOperations<T> {
        async function iDBPromise<T>(request: IDBRequest<T>): Promise<T> {
          return new Promise(async (resolve, reject) => {
            let finished = false;

            const timeout = setTimeout(async () => {
              if (!finished) {
                await config.events?.onTransactionTimeout?.({ db, storeNames: [storeName], timeout: config.transactionTimeout! });
                reject(new Error("Transaction timeout"));
              }
            }, config.transactionTimeout);

            request.onsuccess = () => {
              finished = true;
              clearTimeout(timeout);
              resolve(request.result);
            }

            request.onerror = async () => {
              clearTimeout(timeout);
              await config.events?.onError?.(request.error!);
              reject(request.error);
            }
          })
        }

        async function iDBCursorPromise<C extends IDBCursor | IDBCursorWithValue, T>(request: IDBRequest<C | null>, callback: (cursor: C) => T): Promise<T[]> {
          return new Promise(async (resolve, reject) => {
            let data: T[] = [];

            request.onsuccess = () => {
              const cursor = request.result;

              if (!cursor) {
                resolve(data);
                return;
              };

              const result = callback(cursor);

              if (result) {
                data.push(result);
              }

              cursor.continue();
            }

            request.onerror = async () => {
              await config.events?.onError?.(request.error!);
              reject(request.error);
            }
          })
        }
        async function add(value: T, key?: IDBValidKey): Promise<IDBValidKey> {
          const transaction = db.transaction(storeName, "readwrite");
          const store = transaction.objectStore(storeName);
          return iDBPromise(store.add(value, key));
        }

        async function put(value: T, key?: IDBValidKey): Promise<IDBValidKey> {
          const transaction = db.transaction(storeName, "readwrite");
          const store = transaction.objectStore(storeName);
          return iDBPromise(store.put(value, key));
        }

        async function get(key: IDBValidKey | IDBKeyRange): Promise<T> {
          const transaction = db.transaction(storeName, "readonly");
          const store = transaction.objectStore(storeName);
          return iDBPromise(store.get(key));
        }

        async function getAll(key?: IDBValidKey | IDBKeyRange, count?: number): Promise<T[]> {
          const transaction = db.transaction(storeName, "readonly");
          const store = transaction.objectStore(storeName);
          return iDBPromise(store.getAll(key, count));
        }

        async function getKey(key: IDBValidKey | IDBKeyRange): Promise<IDBValidKey | undefined> {
          const transaction = db.transaction(storeName, "readonly");
          const store = transaction.objectStore(storeName);
          return iDBPromise(store.getKey(key));
        }

        async function getAllKeys(key?: IDBValidKey | IDBKeyRange, count?: number): Promise<IDBValidKey[]> {
          const transaction = db.transaction(storeName, "readonly");
          const store = transaction.objectStore(storeName);
          return iDBPromise(store.getAllKeys(key, count));
        }

        async function openCursor(callback: (cursor: IDBCursorWithValue) => T): Promise<T[]>;
        async function openCursor(options: CursorOptions, callback: (cursor: IDBCursorWithValue) => T): Promise<T[]>;
        async function openCursor(arg1: any, arg2?: any): Promise<T[]> {
          const callback = typeof arg1 === "function" ? arg1 : arg2;
          const options: CursorOptions = typeof arg1 === "function" ? {} : arg1;
          const { query, direction, index } = options;
          const transaction = db.transaction(storeName, "readonly");
          const store = transaction.objectStore(storeName);
          const storeRequest = index ? store.index(index).openCursor(query, direction) : store.openCursor(query, direction);
          return iDBCursorPromise<IDBCursorWithValue, T>(storeRequest, callback);
        }

        async function openKeyCursor(callback: (cursor: IDBCursor) => IDBValidKey | IDBKeyRange): Promise<(IDBValidKey | IDBKeyRange)[]>;
        async function openKeyCursor(options: CursorOptions, callback: (cursor: IDBCursor) => IDBValidKey | IDBKeyRange): Promise<(IDBValidKey | IDBKeyRange)[]>;
        async function openKeyCursor(arg1: any, arg2?: any): Promise<(IDBValidKey | IDBKeyRange)[]> {
          const callback = typeof arg1 === "function" ? arg1 : arg2;
          const options: CursorOptions = typeof arg1 === "function" ? {} : arg1;
          const { query, direction, index } = options;
          const transaction = db.transaction(storeName, "readonly");
          const store = transaction.objectStore(storeName);
          const storeRequest = index ? store.index(index).openKeyCursor(query, direction) : store.openKeyCursor(query, direction);
          return iDBCursorPromise<IDBCursor, IDBValidKey | IDBKeyRange>(storeRequest, callback);
        }

        async function count(query?: IDBValidKey | IDBKeyRange): Promise<number> {
          const transaction = db.transaction(storeName, "readwrite");
          const store = transaction.objectStore(storeName);
          return iDBPromise(store.count(query));
        }

        async function clear(): Promise<undefined> {
          const transaction = db.transaction(storeName, "readwrite");
          const store = transaction.objectStore(storeName);
          return iDBPromise(store.clear());
        }

        async function del(key: IDBValidKey | IDBKeyRange): Promise<undefined> {
          const transaction = db.transaction(storeName, "readwrite");
          const store = transaction.objectStore(storeName);
          return iDBPromise(store.delete(key));
        }

        return {
          add,
          put,
          get,
          getAll,
          getKey,
          getAllKeys,
          openCursor,
          openKeyCursor,
          count,
          clear,
          delete: del
        }
      }

      function transaction(
        storeNames: string[],
        mode: IDBTransactionMode = "readwrite",
        options?: IDBTransactionOptions
      ) {
        const transaction = db.transaction(storeNames, mode, options);

        const stores = Object.fromEntries(
          storeNames.map((name) => [name, transaction.objectStore(name)])
        );

        let finished = false;

        const done = new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(async () => {
            if (!finished) {
              transaction.abort();
              await config.events?.onTransactionTimeout?.({
                db,
                storeNames,
                timeout: config.transactionTimeout!,
              });
              reject(new Error("Transaction timeout"));
            }
          }, config.transactionTimeout);

          transaction.oncomplete = () => {
            finished = true;
            clearTimeout(timeout);
            resolve();
          };

          transaction.onerror = async () => {
            finished = true;
            clearTimeout(timeout);
            await config.events?.onError?.(transaction.error!);
            reject(transaction.error ?? new Error("Transaction aborted"));
          };

          transaction.onabort = async () => {
            finished = true;
            clearTimeout(timeout);
            await config.events?.onError?.(transaction.error!);
            reject(transaction.error ?? new Error("Transaction aborted"));
          };
        });

        return { transaction, stores, done };
      }


      async function clearDatabase(): Promise<void> {
        for (const store of config.stores) {
          const currentStore = useStore(store.name);
          await currentStore.clear();
        }
      }

      async function deleteDatabase(): Promise<void> {
        db.close();

        return new Promise(async (resolve, reject) => {
          const request = indexedDB.deleteDatabase(config.name);

          request.onsuccess = () => resolve();
          request.onerror = async () => {
            await config.events?.onError?.(request.error!);
            reject(request.error);
          }
        })
      }

      const indexedDBInstance = {
        db,
        useStore,
        transaction,
        clearDatabase,
        deleteDatabase
      }

      resolve(indexedDBInstance);
    }
  })
}
