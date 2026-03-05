// feedCache.js — IndexedDB relay cache for initial feedd

const CACHE_DB_NAME  = 'feedCache';
const CACHE_STORE    = 'posts';
const CACHE_VERSION  = 4;
const CACHE_KEY      = 'initialFeed';
const CACHE_V        = 5;  // ← bump this to wipe all user caches

function _openCacheDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(CACHE_DB_NAME, CACHE_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        db.createObjectStore(CACHE_STORE);
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

export async function readCache() {
  try {
    const idb = await _openCacheDB();
    if (!idb.objectStoreNames.contains(CACHE_STORE)) return null;
    return new Promise((resolve) => {
      const req = idb.transaction(CACHE_STORE, 'readonly')
                     .objectStore(CACHE_STORE)
                     .get(CACHE_KEY);
      req.onsuccess = () => {
        const result = req.result;
        if (!result || result.v !== CACHE_V) { resolve(null); return; }  // ← stale, treat as empty
        console.log('📦 readCache result:', result);
        resolve(result);
      };
      req.onerror = () => resolve(null);
    });
  } catch(e) { console.error('📦 readCache error:', e); return null; }
}

export async function writeCache(data) {
  const serialized = {
    ...data,
    v: CACHE_V,  // ← stamp the version
    posts: data.posts.map(post => ({
      ...post,
      createdAt: post.createdAt?.toMillis
        ? post.createdAt.toMillis()
        : post.createdAt
    }))
  };
  
  console.log('💾 writeCache called with:', serialized);
  try {
    const idb = await _openCacheDB();
    if (!idb.objectStoreNames.contains(CACHE_STORE)) return false;
    return new Promise((resolve) => {
      const tx = idb.transaction(CACHE_STORE, 'readwrite');
      tx.objectStore(CACHE_STORE).put(serialized, CACHE_KEY);
      tx.oncomplete = () => { console.log('💾 writeCache success'); resolve(true); };
      tx.onerror    = (e) => { console.error('💾 writeCache error:', e); resolve(false); };
    });
  } catch(e) { console.error('💾 writeCache catch:', e); return false; }
}

export async function clearCache() {
  try {
    const idb = await _openCacheDB();
    if (!idb.objectStoreNames.contains(CACHE_STORE)) return false; // ← guard
    return new Promise((resolve) => {
      const tx = idb.transaction(CACHE_STORE, 'readwrite');
      tx.objectStore(CACHE_STORE).clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror    = () => resolve(false);
    });
  } catch { return false; }
}
