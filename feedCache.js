// feedCache.js — Instrumented for deep debugging
const CACHE_DB_NAME = 'feedCache';
const CACHE_STORE = 'posts';
const CACHE_VERSION = 10; // 💡 BUMPED TO 10 to force onupgradeneeded to fire
const CACHE_KEY = 'initialFeed';
const CACHE_V = 7; 

console.log(`🚀 [INIT] feedCache.js loaded. Target DB Version: ${CACHE_VERSION}, Data Schema: ${CACHE_V}`);

function _openCacheDB() {
  console.log('🔍 [1] _openCacheDB: Attempting to open IndexedDB...');
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(CACHE_DB_NAME, CACHE_VERSION);

    req.onblocked = () => {
      console.warn('⚠️ [!] DB Open Blocked: Please close other tabs of this app!');
    };

    req.onupgradeneeded = (e) => {
      console.log('🛠️ [2] onupgradeneeded: Schema update triggered.');
      const db = e.target.result;
      console.log('🛠️ [2a] Current stores before upgrade:', Array.from(db.objectStoreNames));
      
      if (db.objectStoreNames.contains(CACHE_STORE)) {
        console.log(`🛠️ [2b] Deleting old store: ${CACHE_STORE}`);
        db.deleteObjectStore(CACHE_STORE);
      }
      
      console.log(`🛠️ [2c] Creating fresh store: ${CACHE_STORE}`);
      db.createObjectStore(CACHE_STORE);
      console.log('🛠️ [2d] Store creation complete.');
    };

    req.onsuccess = (e) => {
      const db = e.target.result;
      console.log('✅ [3] onsuccess: Database connection established.');
      console.log('✅ [3a] Final stores available:', Array.from(db.objectStoreNames));
      
      db.onversionchange = () => {
        console.warn('⚠️ [!] DB Version changed elsewhere. Closing connection...');
        db.close();
      };
      
      resolve(db);
    };

    req.onerror = (e) => {
      console.error('❌ [!] DB Open Error:', e.target.error);
      reject(e.target.error);
    };
  });
}

function shufflePosts(posts) {
  if (!posts) return [];
  console.log(`🔀 Shuffling ${posts.length} posts...`);
  const arr = [...posts];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export async function readCache() {
  console.log('📖 [readCache] Starting...');
  try {
    const idb = await _openCacheDB();
    if (!idb.objectStoreNames.contains(CACHE_STORE)) {
      console.error(`📖 [readCache] Store "${CACHE_STORE}" NOT FOUND in db stores!`);
      return null;
    }

    return new Promise((resolve) => {
      console.log('📖 [readCache] Opening readonly transaction...');
      const tx = idb.transaction(CACHE_STORE, 'readonly');
      const store = tx.objectStore(CACHE_STORE);
      const req = store.get(CACHE_KEY);

      req.onsuccess = () => {
        const result = req.result;
        console.log('📖 [readCache] Raw result from IDB:', result);
        
        if (!result) {
          console.log('📖 [readCache] Cache empty (no record found).');
          return resolve(null);
        }
        if (result.v !== CACHE_V) {
          console.log(`📖 [readCache] Schema mismatch! App: ${CACHE_V}, Cache: ${result.v}`);
          return resolve(null);
        }

        const shuffled = { ...result, posts: shufflePosts(result.posts) };
        console.log(`📖 [readCache] Success. Returning ${shuffled.posts.length} posts.`);
        resolve(shuffled);
      };

      req.onerror = (e) => {
        console.error('📖 [readCache] Transaction error:', e.target.error);
        resolve(null);
      };
    });
  } catch(e) { 
    console.error('📖 [readCache] Critical catch:', e); 
    return null; 
  }
}

export async function writeCache(data) {
  console.log('💾 [writeCache] Starting write...');
  if (!data || !data.posts) {
    console.error('💾 [writeCache] Aborting: No data/posts provided.');
    return false;
  }

  const serialized = {
    ...data,
    v: CACHE_V,
    posts: shufflePosts(data.posts).map(post => ({
      ...post,
      createdAt: post.createdAt?.toMillis ? post.createdAt.toMillis() : post.createdAt
    }))
  };

  try {
    const idb = await _openCacheDB();
    if (!idb.objectStoreNames.contains(CACHE_STORE)) {
      console.error('💾 [writeCache] Store missing! Cannot write.');
      return false;
    }

    return new Promise((resolve) => {
      console.log('💾 [writeCache] Opening readwrite transaction...');
      const tx = idb.transaction(CACHE_STORE, 'readwrite');
      const store = tx.objectStore(CACHE_STORE);
      
      store.put(serialized, CACHE_KEY);

      tx.oncomplete = () => {
        console.log('💾 [writeCache] Transaction complete. Saved successfully.');
        resolve(true);
      };

      tx.onerror = (e) => {
        console.error('💾 [writeCache] Transaction failed:', e.target.error);
        resolve(false);
      };
    });
  } catch(e) { 
    console.error('💾 [writeCache] Critical catch:', e); 
    return false; 
  }
}

export async function clearCache() {
  console.log('🧹 [clearCache] Starting wipe...');
  try {
    const idb = await _openCacheDB();
    return new Promise((resolve) => {
      const tx = idb.transaction(CACHE_STORE, 'readwrite');
      tx.objectStore(CACHE_STORE).clear();
      tx.oncomplete = () => {
        console.log('🧹 [clearCache] Done.');
        resolve(true);
      };
    });
  } catch(e) { 
    console.error('🧹 [clearCache] Error:', e);
    return false; 
  }
}
