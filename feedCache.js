// feedCache.js — IndexedDB relay cache for initial feedd

const CACHE_DB_NAME  = 'feedCache';
const CACHE_STORE    = 'posts';
const CACHE_VERSION  = 10;
const CACHE_KEY      = 'initialFeed';
const CACHE_V        = 7;  // ← bump this to wipe all user caches

console.log('📦 feedCache.js loaded — CACHE_V:', CACHE_V, '| CACHE_VERSION:', CACHE_VERSION, '| CACHE_DB_NAME:', CACHE_DB_NAME, '| CACHE_STORE:', CACHE_STORE);

function _openCacheDB() {
  return new Promise((resolve, reject) => {
    console.log('📦 _openCacheDB: opening DB...', { CACHE_DB_NAME, CACHE_VERSION });

    const req = indexedDB.open(CACHE_DB_NAME, CACHE_VERSION);

    req.onblocked = (e) => {
      console.warn('📦 _openCacheDB: BLOCKED — another tab has the DB open with an older version. Close other tabs!', e);
    };

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      console.log('📦 onupgradeneeded fired!', {
        oldVersion: e.oldVersion,
        newVersion: e.newVersion,
        storesBefore: Array.from(db.objectStoreNames),
      });

      if (db.objectStoreNames.contains(CACHE_STORE)) {
        console.log('📦 onupgradeneeded: deleting existing store:', CACHE_STORE);
        db.deleteObjectStore(CACHE_STORE);
      } else {
        console.log('📦 onupgradeneeded: store did not exist yet, nothing to delete');
      }

      db.createObjectStore(CACHE_STORE);
      console.log('📦 onupgradeneeded: store created. storesAfter:', Array.from(db.objectStoreNames));
    };

    req.onsuccess = (e) => {
      const db = e.target.result;
      const stores = Array.from(db.objectStoreNames);
      console.log('📦 onsuccess fired!', {
        name: db.name,
        version: db.version,
        objectStoreNames: stores,
      });

      if (!stores.includes(CACHE_STORE)) {
        console.error('📦 CRITICAL: onsuccess fired but store is MISSING. This usually means onupgradeneeded never ran (DB version already matched) but the store was somehow never created. Try deleting the DB in DevTools > Application > IndexedDB.');
      } else {
        console.log('📦 onsuccess: store found ✅:', CACHE_STORE);
      }

      db.onversionchange = () => {
        console.warn('📦 DB versionchange event — another tab is trying to upgrade. Closing this connection.');
        db.close();
      };

      resolve(db);
    };

    req.onerror = (e) => {
      console.error('📦 _openCacheDB: onerror fired', e.target.error);
      reject(e.target.error);
    };
  });
}

function shufflePosts(posts) {
  const arr = [...posts];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export async function readCache() {
  console.log('📦 readCache: called');
  try {
    const idb = await _openCacheDB();
    const stores = Array.from(idb.objectStoreNames);
    console.log('📦 readCache: DB opened. objectStoreNames:', stores, '| looking for:', CACHE_STORE);

    if (!stores.includes(CACHE_STORE)) {
      console.warn('📦 readCache: store missing — returning null');
      return null;
    }

    return new Promise((resolve) => {
      const tx = idb.transaction(CACHE_STORE, 'readonly');
      tx.onerror = (e) => console.error('📦 readCache tx error:', e.target.error);
      tx.onabort = (e) => console.error('📦 readCache tx aborted:', e.target.error);

      const req = tx.objectStore(CACHE_STORE).get(CACHE_KEY);
      req.onsuccess = () => {
        const result = req.result;
        console.log('📦 readCache raw result:', result);
        console.log('📦 readCache result.v:', result?.v, '| expected CACHE_V:', CACHE_V, '| match:', result?.v === CACHE_V);

        if (!result) {
          console.warn('📦 readCache: nothing stored under key:', CACHE_KEY);
          resolve(null);
          return;
        }
        if (result.v !== CACHE_V) {
          console.warn(`📦 readCache: version mismatch — stored: ${result.v}, expected: ${CACHE_V}. Returning null (stale cache).`);
          resolve(null);
          return;
        }

        const shuffled = { ...result, posts: shufflePosts(result.posts) };
        console.log(`📦 readCache: HIT ✅ — ${shuffled.posts.length} posts`);
        console.table(shuffled.posts.map((p, i) => ({ position: i + 1, id: p.id, createdAt: p.createdAt })));
        resolve(shuffled);
      };
      req.onerror = (e) => {
        console.error('📦 readCache get error:', e.target.error);
        resolve(null);
      };
    });
  } catch(e) {
    console.error('📦 readCache catch:', e);
    return null;
  }
}

export async function writeCache(data) {
  console.log('💾 writeCache: called with', data?.posts?.length, 'posts');
  const serialized = {
    ...data,
    v: CACHE_V,
    posts: shufflePosts(data.posts).map(post => ({
      ...post,
      createdAt: post.createdAt?.toMillis
        ? post.createdAt.toMillis()
        : post.createdAt
    }))
  };

  console.log(`💾 writeCache: serialized ${serialized.posts.length} posts (v=${serialized.v}):`);
  console.table(serialized.posts.map((p, i) => ({ position: i + 1, id: p.id, createdAt: p.createdAt })));

  try {
    const idb = await _openCacheDB();
    const stores = Array.from(idb.objectStoreNames);
    console.log('💾 writeCache: DB opened. objectStoreNames:', stores);

    if (!stores.includes(CACHE_STORE)) {
      console.error('💾 writeCache: store missing — aborting write');
      return false;
    }

    return new Promise((resolve) => {
      const tx = idb.transaction(CACHE_STORE, 'readwrite');
      tx.onerror = (e) => console.error('💾 writeCache tx error:', e.target.error);
      tx.onabort = (e) => console.error('💾 writeCache tx aborted:', e.target.error);

      const putReq = tx.objectStore(CACHE_STORE).put(serialized, CACHE_KEY);
      putReq.onsuccess = () => console.log('💾 writeCache: put() succeeded');
      putReq.onerror   = (e) => console.error('💾 writeCache: put() error:', e.target.error);

      tx.oncomplete = () => { console.log('💾 writeCache: tx complete ✅'); resolve(true); };
      tx.onerror    = (e) => { console.error('💾 writeCache: tx error:', e); resolve(false); };
    });
  } catch(e) {
    console.error('💾 writeCache catch:', e);
    return false;
  }
}

export async function clearCache() {
  console.log('🗑️ clearCache: called');
  try {
    const idb = await _openCacheDB();
    const stores = Array.from(idb.objectStoreNames);
    console.log('🗑️ clearCache: objectStoreNames:', stores);

    if (!stores.includes(CACHE_STORE)) {
      console.warn('🗑️ clearCache: store missing — nothing to clear');
      return false;
    }

    return new Promise((resolve) => {
      const tx = idb.transaction(CACHE_STORE, 'readwrite');
      tx.objectStore(CACHE_STORE).clear();
      tx.oncomplete = () => { console.log('🗑️ clearCache: done ✅'); resolve(true); };
      tx.onerror    = (e) => { console.error('🗑️ clearCache: error', e.target.error); resolve(false); };
    });
  } catch(e) {
    console.error('🗑️ clearCache catch:', e);
    return false;
  }
}
