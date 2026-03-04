// feedCache.js — IndexedDB relay cache for initial feed

const CACHE_DB_NAME  = 'feedCache';
const CACHE_STORE    = 'posts';
const CACHE_VERSION  = 1;
const CACHE_KEY      = 'initialFeed';

function _openCacheDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(CACHE_DB_NAME, CACHE_VERSION);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(CACHE_STORE);
    };
    req.onsuccess  = (e) => resolve(e.target.result);
    req.onerror    = (e) => reject(e.target.error);
  });
}

export async function readCache() {
  try {
    const idb = await _openCacheDB();
    return new Promise((resolve) => {
      const req = idb.transaction(CACHE_STORE, 'readonly')
                     .objectStore(CACHE_STORE)
                     .get(CACHE_KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror   = () => resolve(null);
    });
  } catch { return null; }
}

export async function writeCache(posts) {
  try {
    const idb = await _openCacheDB();
    return new Promise((resolve) => {
      const tx = idb.transaction(CACHE_STORE, 'readwrite');
      tx.objectStore(CACHE_STORE).put(posts, CACHE_KEY);
      tx.oncomplete = () => resolve(true);
      tx.onerror    = () => resolve(false);
    });
  } catch { return false; }
}

export async function clearCache() {
  try {
    const idb = await _openCacheDB();
    return new Promise((resolve) => {
      const tx = idb.transaction(CACHE_STORE, 'readwrite');
      tx.objectStore(CACHE_STORE).clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror    = () => resolve(false);
    });
  } catch { return false; }
}