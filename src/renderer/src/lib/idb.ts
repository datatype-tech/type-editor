/**
 * A very small IndexedDB wrapper.
 *
 * Everything the app remembers — settings, the document that was open, the
 * files it has seen — lives in one object store keyed by name. IndexedDB rather
 * than localStorage because documents can be large and because writes do not
 * block the main thread while someone is typing.
 */

const DB_NAME = 'type-editor'
const DB_VERSION = 1
const STORE = 'state'

let connection: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (connection) return connection

  connection = new Promise<IDBDatabase>((resolve, reject) => {
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION)
    } catch (error) {
      reject(error)
      return
    }

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('IndexedDB is blocked by another window'))
  })

  // A failed open must not be remembered as the connection.
  connection.catch(() => {
    connection = null
  })
  return connection
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode)
        const request = work(transaction.objectStore(STORE))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
        transaction.onabort = () => reject(transaction.error)
      })
  )
}

export function idbGet<T>(key: string): Promise<T | null> {
  return run<T | undefined>('readonly', (store) => store.get(key) as IDBRequest<T | undefined>).then(
    (value) => (value === undefined ? null : value)
  )
}

export function idbSet(key: string, value: unknown): Promise<void> {
  return run('readwrite', (store) => store.put(value, key) as IDBRequest<IDBValidKey>).then(
    () => undefined
  )
}

export function idbDelete(key: string): Promise<void> {
  return run('readwrite', (store) => store.delete(key) as IDBRequest<undefined>).then(
    () => undefined
  )
}
