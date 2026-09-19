/**
 * A tiny key-value wrapper over one IndexedDB object store (SPEC §5.6,
 * §10): auto-save's persistence layer. Every method returns a Promise
 * that rejects on failure — including a synchronous `indexedDB.open`
 * throw (e.g. private browsing in older engines), caught by the
 * `new Promise` executor itself — so callers never need a `try/catch`
 * around a call, only a `.catch()`.
 */

const STORE_NAME = 'kv';

/**
 * @param {string} name
 * @returns {Promise<IDBDatabase>}
 */
function openDb(name) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * @param {string} [name]
 * @returns {{
 *   get: (key: string) => Promise<*>,
 *   put: (key: string, value: *) => Promise<void>,
 *   del: (key: string) => Promise<void>,
 * }}
 */
export function openStore(name = 'flatland') {
  const dbPromise = openDb(name);

  return {
    get(key) {
      return dbPromise.then(
        (db) =>
          new Promise((resolve, reject) => {
            const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
          }),
      );
    },
    put(key, value) {
      return dbPromise.then(
        (db) =>
          new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).put(value, key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          }),
      );
    },
    del(key) {
      return dbPromise.then(
        (db) =>
          new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).delete(key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          }),
      );
    },
  };
}
