// ==========================================
// 1. CONFIG & IMPORTS
// ==========================================

// --- Browser Quirks ---
history.scrollRestoration = 'manual';
if (window.chrome && chrome.runtime && chrome.runtime.id) {
  document.body.classList.add('extension-view');
}

// --- Firebase ---
import { readCache, writeCache } from './feedCache.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-app.js";
import { 
  getFirestore, collection, addDoc, deleteDoc, doc, updateDoc,
  query, orderBy, limit, serverTimestamp, onSnapshot,
  writeBatch, getDocs, increment, setDoc, getDoc, runTransaction, where, Timestamp
} from "https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js";
import { 
  getAuth, signInAnonymously, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.2.0/firebase-auth.js";
import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.2.4/+esm';

const firebaseConfig = {
  apiKey: "AIzaSyBD-8hcoAuTFaAhgSy-WIyQX_iI37uokTw",
  authDomain: "myfreeformarchive-8a786.firebaseapp.com",
  projectId: "myfreeformarchive-8a786",
  storageBucket: "myfreeformarchive-8a786.appspot.com",
  messagingSenderId: "16237442482",
  appId: "1:16237442482:web:424f8f2e344a58e7f6a0ab"
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- Supabase ---
const supabaseUrl = 'https://ipgtvatyzwhkifnsstux.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlwZ3R2YXR5endoa2lmbnNzdHV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2NDcyMzIsImV4cCI6MjA4NjIyMzIzMn0.OH7Dru0KKKdewj1nsWofvI73cT6tKIZbTVMPJA2oPvI'; 
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);
window._supabase = window._supabase || (typeof _supabase !== 'undefined' ? _supabase : null);

// ==========================================
// 2.  STATE & DOM
// ==========================================
const DOM = {
  input: document.getElementById('postInput'),
  btn: document.getElementById('postBtn'),
  list: document.getElementById('feedList'),
  toggle: document.getElementById('publicToggle'),
  label: document.getElementById('publicLabel'),
  tabPrivate: document.getElementById('tabPrivate'),
  tabPublic: document.getElementById('tabPublic'),
  storage: document.getElementById('storageInfo'),
  loadTrigger: document.getElementById('loadTrigger'),
  fontBtns: document.querySelectorAll('.font-btn'),
  modal: document.getElementById('commentModal'),
  modalOverlay: document.getElementById('closeModalOverlay'),
  closeBtn: document.getElementById('closeModalBtn'),
  modalContent: document.getElementById('modalPostContent'),
  modalDate: document.getElementById('modalPostDate'),
  commentList: document.getElementById('commentsList'),
  commentInput: document.getElementById('commentInput'),
  commentInputBar: document.querySelector('#commentModal .border-t'), 
  sendComment: document.getElementById('sendCommentBtn'),
  emojiButtons: document.querySelectorAll('.emoji-btn'),
  desktopEmojiTrigger: document.getElementById('desktopEmojiTrigger'),
  desktopEmojiPopup: document.getElementById('desktopEmojiPopup'),
  usernameInput: document.getElementById('usernameInput'),
  profileHeader: document.getElementById('profileHeaderTitle'),
  saveCheck: document.getElementById('saveCheck'),
  charCounter: document.getElementById('charCounter'),
  inputModal: document.getElementById('inputModal')
};

let currentTab = localStorage.getItem('freeform_tab_pref') || 'private'; 
const BATCH_SIZE = 15;
let currentLimit = BATCH_SIZE;
let isLoadingMore = false;
let allPrivatePosts = []; 
let selectedFont = localStorage.getItem('freeform_font_pref') || 'font-sans'; 
let publicUnsubscribe = null;
let commentsUnsubscribe = null;
let activePostId = null; 
let activeShareMenuId = null;
let modalAutoUnsubscribe = null;
let scrollObserver = null;
let lastGhostToastTime = 0;
let visiblePosts = [];   
let postBuffer = [];     
let processedIds = new Set(); 
let dripTimeout = null;
let activePostListeners = new Map();
let isAppending = false;
let isRefilling = false;
let totalGlobalPosts = 0;
let feedLoaded = false;
let feedSafetyTimeout = null;
let loadFeedToken = 0;
let currentDripId = 0;
let saveTimeout;
let isCacheRefilling = false;
let pendingUrl = "";

window.pendingPostUpdates = 0;

// ==========================================
// 3. IDENTITY & LOCALE
// ==========================================

// --- User ID ---
// Generates a short random ID (e.g. "x4k2-9mzq") and persists it in localStorage.
// This is the user's permanent anonymous identity across sessions.
function getOrCreateUserId() {
  let id = localStorage.getItem('freeform_user_id');
  if (!id) {
    id = Math.random().toString(36).substring(2, 6) + '-' + Math.random().toString(36).substring(2, 6);
    localStorage.setItem('freeform_user_id', id);
  }
  return id;
}

const MY_USER_ID = getOrCreateUserId();

// --- Locale ---
// Reads the browser's language/region (e.g. "en-US") and saves it to localStorage.
// Called once on startup so Translator.init() can pick it up immediately after.
function getOrCreateUserLocale() {
  const locale = navigator.language || 'en-US';
  const parts = locale.split('-');
  const language = parts[0].toLowerCase();
  const region = parts.length > 1 ? parts[1].toUpperCase() : null;
  localStorage.setItem('freeform_language', language);
  if (region) localStorage.setItem('freeform_region', region);
  return { language, region };
}

// --- Profile ---
// Displays the user's short ID in the profile modal so they can identify themselves.
function setupProfile() {
  const userId = getOrCreateUserId();
  const displayEl = document.getElementById('displayUserId');
  if (displayEl) displayEl.textContent = userId;
}

// --- Username ---
// Strips non-alphanumeric characters and saves the handle to localStorage.
// Only saves if the value actually changed to avoid unnecessary writes.
function saveUsername(value) {
  const clean = value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 24);
  const currentSaved = localStorage.getItem('freeform_username') || '';
  if (clean !== currentSaved) {
    localStorage.setItem('freeform_username', clean);
    if (clean !== '') showSuccessFeedback();
  }
}

// Flashes a green checkmark and highlights the input border for 1.5s after a successful save.
function showSuccessFeedback() {
  DOM.saveCheck.classList.remove('opacity-0', 'translate-x-2');
  DOM.saveCheck.classList.add('opacity-100', 'translate-x-0');
  DOM.usernameInput.classList.add('border-emerald-400');
  DOM.usernameInput.classList.remove('border-slate-300');
  setTimeout(() => {
    DOM.saveCheck.classList.add('opacity-0', 'translate-x-2');
    DOM.saveCheck.classList.remove('opacity-100', 'translate-x-0');
    DOM.usernameInput.classList.remove('border-emerald-400');
    DOM.usernameInput.classList.add('border-slate-300');
  }, 1500);
}

// Reads saved username from localStorage and populates the input + profile header on load.
function loadUsername() {
  const name = localStorage.getItem('freeform_username') || '';
  DOM.usernameInput.value = name;
  DOM.charCounter.textContent = `${name.length}/24`;
  if (name) DOM.profileHeader.textContent = `@${name.toUpperCase()}`;
  return name;
}

// Live input handler: strips invalid chars, updates char counter and profile header,
// then debounces the actual save by 800ms so we don't write on every keystroke.
DOM.usernameInput.addEventListener('input', (e) => {
  const val = e.target.value.replace(/[^a-zA-Z0-9_]/g, '');
  e.target.value = val;
  const len = val.length;
  DOM.charCounter.textContent = `${len}/24`;
  if (len >= 20) {
    DOM.charCounter.classList.add('text-amber-500');
    DOM.charCounter.classList.remove('text-slate-300');
  } else {
    DOM.charCounter.classList.remove('text-amber-500');
    DOM.charCounter.classList.add('text-slate-300');
  }
  if (len > 0) {
    DOM.profileHeader.textContent = `@${val.toUpperCase()}`;
    DOM.profileHeader.classList.add('text-brand-500');
  } else {
    DOM.profileHeader.textContent = 'MY PROFILE';
    DOM.profileHeader.classList.remove('text-brand-500');
  }
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => saveUsername(val), 800);
});

// --- Migration ---
// One-time migration that pulls posts from old localStorage keys (beliefs, ideas, etc.)
// into the unified freeform_v2 store. Runs once then sets a flag so it never runs again.
function runMigration() {
  if (localStorage.getItem('freeform_migrated_v3')) return;
  let newStore = JSON.parse(localStorage.getItem('freeform_v2')) || [];
  ['beliefs', 'inProgress', 'ideas', 'writings'].forEach(key => {
    const old = JSON.parse(localStorage.getItem(key));
    if (Array.isArray(old)) old.forEach(item => {
        const txt = item.content || item.text || (item.title ? `${item.title}\n${item.content}` : "");
        if (txt) newStore.push({ id: Date.now() + Math.random().toString(), content: `[Archived ${key}]: ${txt}`, createdAt: item.date || new Date().toISOString(), isFirebase: false });
    });
  });
  localStorage.setItem('freeform_v2', JSON.stringify(newStore));
  localStorage.setItem('freeform_migrated_v3', 'true');
}

// ==========================================
// 4.  FEED ENGINE
// ==========================================

// Main feed loader — called on tab switch and auth ready.
// Uses a token system to cancel stale calls if loadFeed is triggered again mid-flight.
// Private tab: reads localStorage and subscribes to archive sync.
// Public tab: checks cache first (warm start), falls back to Firebase (cold start).
async function loadFeed() {
  const myToken = ++loadFeedToken;

  // --- Cleanup previous session ---
  if (feedSafetyTimeout) clearTimeout(feedSafetyTimeout);
  if (dripTimeout) { clearTimeout(dripTimeout); dripTimeout = null; }
  if (publicUnsubscribe) { publicUnsubscribe(); publicUnsubscribe = null; }
  if (activePostListeners.size > 0) {
    activePostListeners.forEach((unsubscribe) => unsubscribe());
    activePostListeners.clear();
    window.pendingPostUpdates = 0;
  }

  visiblePosts = [];
  postBuffer = [];
  processedIds.clear();

  // --- Private tab ---
  if (currentTab === 'private') {
    allPrivatePosts = (JSON.parse(localStorage.getItem('freeform_v2')) || []).reverse();
    renderPrivateBatch();
    subscribeArchiveSync();
    return;
  }

  // --- Public tab: try cache first ---
  const cached = await readCache();
  if (myToken !== loadFeedToken) return; // Stale call — a newer loadFeed fired

  if (cached?.posts?.length > 0) {
    // Warm start: show cached posts immediately, drip new ones in after a delay
    DOM.loadTrigger.style.visibility = 'hidden';
    const toShow    = cached.posts.slice(0, 15);
    const remainder = cached.posts.slice(15);

    visiblePosts = toShow;
    toShow.forEach(p => processedIds.add(p.id));
    DOM.list.innerHTML = '';
    renderListItems(visiblePosts);

    // Randomized drip delay so new posts trickle in naturally
    const dripDelay = Math.random() * (4500 - 1800) + 1800;
    dripTimeout = setTimeout(() => {
      if (currentTab !== 'public') return;
      startDripFeed();
    }, dripDelay);

    writeCache({ posts: remainder, html: DOM.list.innerHTML });
    rotateAndRefillCache(remainder);
    subscribePublicFeed({ silent: true, token: myToken });

  } else {
    // Cold start: no cache, fetch directly from Firebase
    DOM.loadTrigger.style.visibility = 'visible';

    // Safety net: if still showing "Scanning" after 5s, network is too slow
    feedSafetyTimeout = setTimeout(() => {
      const placeholder = document.getElementById('public-placeholder');
      if (placeholder && placeholder.innerText.includes('Scanning')) {
        console.warn("[UI Guard] Network is too slow. Showing empty state.");
        showPublicPlaceholder('empty');
      }
    }, 5000);

    subscribePublicFeed({ silent: false, token: myToken });
  }
}

// Fetches and renders the public feed. Called by loadFeed with two modes:
// - silent: cache already displayed, just background-refresh with proportional buckets
// - cold: no cache, fetch newest 30 from Firebase and render fresh
// Also opens an "ego-listener" that watches for the current user's own new posts
// so they appear at the top instantly after posting.
async function subscribePublicFeed({ silent = false, token = null } = {}) {
  if (currentTab !== 'public') return;
  if (token !== null && token !== loadFeedToken) return;

  if (publicUnsubscribe) {
    publicUnsubscribe();
    publicUnsubscribe = null;
  }

  if (!isAppending && !silent) {
    visiblePosts = [];
    postBuffer = [];
    processedIds.clear();
    if (dripTimeout) clearTimeout(dripTimeout);
    showPublicPlaceholder('scanning');
  }

  try {
    const newItems = [];

    if (silent) {
      // Warm start — fetch proportional buckets in background
      if (!isCacheRefilling) {
        isCacheRefilling = true;
        try {
          const fresh = await fetchProportionalFeed();
          fresh.forEach(post => {
            if (!processedIds.has(post.id)) {
              newItems.push(post);
              processedIds.add(post.id);
            }
          });
        } finally {
          isCacheRefilling = false;
        }
      }
    } else {
      // Cold start — newest 30 posts from Firebase
      const qInitial = query(collection(db, "globalPosts"), orderBy("createdAt", "desc"), limit(30));
      const initialSnap = await getDocs(qInitial);
      initialSnap.forEach(doc => {
        const post = { id: doc.id, ...doc.data(), isFirebase: true };
        if (!processedIds.has(post.id)) {
          newItems.push(post);
          processedIds.add(post.id);
        }
      });
      Ledger.log("subscribePublicFeed", initialSnap.docs.length, 0, 0);
    }

    if (token !== null && token !== loadFeedToken) return; // Stale after fetch

    if (isAppending) {
      // Infinite scroll: add posts to bottom
      newItems.forEach(p => {
        visiblePosts.push(p);
        injectSinglePost(p, 'bottom');
      });
    } else if (!silent) {
      // Cold render: show posts and start drip
      visiblePosts = newItems;
      renderListItems(visiblePosts);
      const dripDelay = Math.random() * (4500 - 1800) + 1800;
      setTimeout(() => startDripFeed(), dripDelay);
    }
    // Silent: cache already visible, nothing to render

    if (!isAppending && !silent) {
      writeCache({ posts: newItems, html: DOM.list.innerHTML });
    }

    DOM.loadTrigger.style.visibility = 'hidden';

    // Ego-listener: watches only the current user's posts so new ones
    // appear at the top of the feed immediately after posting.
    const listenStartTime = Date.now();
    const myPostsQuery = query(collection(db, "globalPosts"), where("authorId", "==", MY_USER_ID));
    publicUnsubscribe = onSnapshot(myPostsQuery, (snapshot) => {
      const billedChanges = snapshot.docChanges().length;
      if (billedChanges > 0) Ledger.log("subscribePublicFeed_Live", billedChanges, 0, 0);

      snapshot.docChanges().forEach((change) => {
        const docId = change.doc.id;
        const data  = change.doc.data();
        const isNewPost = !data.createdAt ||
          (data.createdAt.toMillis ? data.createdAt.toMillis() : Date.now()) > listenStartTime;

        if (change.type === "added" && !processedIds.has(docId)) {
          if (!isNewPost) { processedIds.add(docId); return; }
          const postObj = { id: docId, ...data, isFirebase: true };
          processedIds.add(docId);
          visiblePosts.unshift(postObj);
          injectSinglePost(postObj, 'top');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        if (change.type === "modified") {
          updateUISurgically(docId, data);
        }
      });
    });

  } catch (err) {
    console.error("[subscribePublicFeed] error:", err);
    if (!isAppending && !silent) {
      DOM.list.innerHTML = `<div class="text-center py-12">Feed offline.</div>`;
    }
  }
}

// Realtime sync for the private tab — listens to Supabase for any changes
// (likes, comments) on the current user's own posts and updates localStorage
// and the DOM without a full re-render.
// Reuses publicUnsubscribe so switchTab can cleanly kill it when leaving private.
async function subscribeArchiveSync() {
  if (publicUnsubscribe) { 
    await publicUnsubscribe();
    publicUnsubscribe = null; 
  }

  const channel = _supabase
    .channel('user_posts_sync')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'posts',
      filter: `author_id=eq.${MY_USER_ID}`
    }, async (payload) => {
      const id = payload.new?.id || payload.old?.id;
      if (!id) return;

      try {
        const { data, error } = await _supabase
          .from('posts')
          .select('like_count, comment_count')
          .eq('id', id)
          .single();

        if (error) throw error;

        const likeCount = data?.like_count || 0;
        const commentCount = data?.comment_count || 0;

        updateLocalPostWithServerData(id, commentCount, likeCount);

        const postEl = document.querySelector(`[data-id="${id}"]`);
        if (postEl) {
          const likeSpan = postEl.querySelector(`.count-like-${id}`);
          if (likeSpan) likeSpan.textContent = likeCount;
          const commentSpan = postEl.querySelector(`.count-comment-${id}`);
          if (commentSpan) commentSpan.textContent = commentCount;
        }

        Ledger.log("subscribeArchiveSync", 1, 0, 0);
      } catch (error) {
        console.error('Sync error:', error);
      }
    })
    .subscribe();

  // Safely tears down the channel — guards against WebSocket race conditions
  // where Supabase throws if we remove a channel that's still in "joining" state.
  publicUnsubscribe = async () => {
    if (!channel) return;
    try {
      if (channel.state === 'joined' || channel.state === 'joining') {
        await _supabase.removeChannel(channel);
      }
    } catch (e) {
      console.warn(`WebSocket race condition handled:`, e.message);
    }
  };
}

// Trickles new posts into the top of the public feed one at a time.
// Uses a random 20-40s delay between drips to feel organic, not algorithmic.
// The currentDripId token ensures only one drip loop runs at a time —
// if startDripFeed is called again, the old loop self-terminates.
// Caps visible posts at 50 to prevent the DOM from growing unbounded.
function startDripFeed() {
  if (dripTimeout) clearTimeout(dripTimeout);

  const myId = ++currentDripId;

  async function drip() {
    if (currentTab !== 'public' || myId !== currentDripId) return;

    // Refill buffer if empty before attempting to drip
    if (postBuffer.length === 0) {
      await refillBufferRandomly(5);
      Ledger.log("refillBuffer", 1, 0, 0);
    }

    if (currentTab !== 'public' || myId !== currentDripId) return;

    if (postBuffer.length > 0) {
      const nextPost = postBuffer.shift();
      if (!document.getElementById(`post-${nextPost.id}`)) {
        visiblePosts.unshift(nextPost);
        injectSinglePost(nextPost, 'top');

        // Keep DOM lean — remove oldest post if over the cap
        if (visiblePosts.length > 50) {
          visiblePosts.pop();
          if (DOM.list.lastElementChild) DOM.list.lastElementChild.remove();
        }
      }
    }

    const getRandomDelay = (min, max) =>
      Math.floor(Math.random() * (max - min + 1) + min) * 1000;

    dripTimeout = setTimeout(drip, getRandomDelay(20, 40));
  }

  dripTimeout = setTimeout(drip, 3000);
}

// Fills the postBuffer with random posts from Firebase using a serialId trick —
// picks a random number in the ID range, then queries for the nearest post >= that number.
// This gives cheap random sampling without a full collection scan.
// Gates itself with isRefilling to prevent parallel runs.
// ignoreProcessed: used by brute force mode to bypass the "already seen" filter.
async function refillBufferRandomly(count = 5, silent = false, ignoreProcessed = false) {
  const placeholder = document.getElementById('public-placeholder');

  if (isRefilling) {
    console.warn("Refill already in progress — skipping.");
    return;
  }
  isRefilling = true;

  try {
    const counterRef = doc(db, "metadata", "postCounter");
    const counterSnap = await getDoc(counterRef);

    if (!counterSnap.exists()) {
      console.warn("No postCounter found in metadata.");
      totalGlobalPosts = 0;
      return;
    }

    Ledger.log("refillBufferRandomly", 1, 0, 0);

    const maxId = counterSnap.data().count;
    totalGlobalPosts = maxId;
    const minId = 1;
    let attempts = 0;
    const MAX_ATTEMPTS = 25;

    while (postBuffer.length < count && attempts < MAX_ATTEMPTS) {
      attempts++;
      const rand = Math.floor(Math.random() * (maxId - minId + 1) + minId);

      const q = query(
        collection(db, "globalPosts"),
        where("serialId", ">=", rand),
        orderBy("serialId", "asc"),
        limit(1)
      );

      const snap = await getDocs(q);
      Ledger.log("refillBufferRandomly_Attempt", 1, 0, 0);

      if (snap.empty) continue;

      const docData = snap.docs[0];
      const post = { id: docData.id, ...docData.data(), isFirebase: true };
      const isDuplicate = (!ignoreProcessed && processedIds.has(post.id)) ||
                          postBuffer.some(p => p.id === post.id);

      if (!isDuplicate) {
        postBuffer.push(post);
        processedIds.add(post.id);

        // Remove placeholder as soon as we have something to show
        if (placeholder) {
          placeholder.remove();
          const extra = document.getElementById('public-placeholder');
          if (extra) extra.outerHTML = '';
        }
      }
    }

    if (attempts >= MAX_ATTEMPTS && postBuffer.length < count) {
      console.warn(`MAX_ATTEMPTS reached. Found ${postBuffer.length}/${count} posts.`);
    }

  } catch (err) {
    console.error("Error in refillBufferRandomly:", err);
  } finally {
    isRefilling = false;
  }
}

// Fetches posts proportionally across 4 time buckets (last 24h, 48h, 72h, 7 days)
// so the feed feels time-balanced rather than just newest-first.
// Each bucket picks a random cursor within its window for variety.
// If a bucket comes back short, falls back to a full window scan for that range.
// All 4 buckets fire in parallel via Promise.all for speed.
async function fetchProportionalFeed() {
  const now = Date.now();
  const H24 = 24 * 60 * 60 * 1000;

  const buckets = [
    { start: now - H24,      end: now,           count: 10 },
    { start: now - 2 * H24,  end: now - H24,     count: 10 },
    { start: now - 3 * H24,  end: now - 2 * H24, count: 6  },
    { start: now - 7 * H24,  end: now - 3 * H24, count: 4  },
  ];

  const fetchBucket = async ({ start, end, count }) => {
    const randomMs = start + Math.random() * (end - start);
    const q = query(
      collection(db, "globalPosts"),
      where("createdAt", ">=", Timestamp.fromMillis(randomMs)),
      where("createdAt", "<=", Timestamp.fromMillis(end)),
      orderBy("createdAt", "desc"),
      limit(count)
    );

    let snap = await getDocs(q);

    // If random cursor returned too few results, retry with full window
    if (snap.docs.length < count) {
      const fallback = query(
        collection(db, "globalPosts"),
        where("createdAt", ">=", Timestamp.fromMillis(start)),
        where("createdAt", "<=", Timestamp.fromMillis(end)),
        orderBy("createdAt", "desc"),
        limit(count)
      );
      snap = await getDocs(fallback);
    }

    Ledger.log("fetchProportionalFeed_bucket", snap.docs.length, 0, 0);
    return snap.docs.map(d => ({ id: d.id, ...d.data(), isFirebase: true }));
  };

  const bucketResults = await Promise.all(buckets.map(fetchBucket));

  // Deduplicate across buckets (a post can appear in multiple time windows)
  const seen = new Set();
  const posts = [];
  for (const bucket of bucketResults) {
    for (const post of bucket) {
      if (!seen.has(post.id)) {
        seen.add(post.id);
        posts.push(post);
      }
    }
  }

  return posts;
}

// Background cache maintenance — called after a warm start to top up the cache
// with fresh posts so the next session also gets a fast warm start.
// Skips if cache is already healthy (30+ posts) or a refill is already running.
// Caps the cache at 45 posts to keep localStorage lean.
async function rotateAndRefillCache(existingPosts) {
  if (isCacheRefilling) return;
  if (existingPosts.length >= 30) return;

  isCacheRefilling = true;
  try {
    const fresh = await fetchProportionalFeed();
    const existingIds = new Set(existingPosts.map(p => p.id));
    const deduped = fresh.filter(p => !existingIds.has(p.id));
    const refilled = [...existingPosts, ...deduped].slice(0, 45);
    writeCache({ posts: refilled, html: DOM.list.innerHTML });
  } finally {
    isCacheRefilling = false;
  }
}

// Renders the current page of private posts from localStorage.
// Always re-reads from localStorage first to pick up any count updates
// from the background archive sync before rendering.
function renderPrivateBatch() {
  allPrivatePosts = (JSON.parse(localStorage.getItem('freeform_v2')) || []).reverse();
  const visible = allPrivatePosts.slice(0, currentLimit);
  DOM.list.innerHTML = '';
  renderListItems(visible);
  DOM.loadTrigger.style.visibility = (currentLimit >= allPrivatePosts.length) ? 'hidden' : 'visible';
}

// Core render function — takes an array of posts and builds the feed DOM.
// Handles empty states differently for private (encouragement message) vs
// public (scanning/empty placeholder, with brute force fallback if needed).
// Runs all posts through Translator.translateBatch before rendering so
// non-English users see content in their language.
// Bails early if post count updates are still in flight (pendingPostUpdates > 0)
// to avoid rendering stale like/comment counts.
async function renderListItems(items) {
  if (feedSafetyTimeout) {
    clearTimeout(feedSafetyTimeout);
    feedSafetyTimeout = null;
  }

  // Wait for any pending realtime count updates before rendering
  if (window.pendingPostUpdates > 0) return;

  const placeholder = document.getElementById('public-placeholder');

  // --- Empty state ---
  if (items.length === 0) {
    DOM.list.innerHTML = '';

    if (currentTab === 'private') {
      DOM.list.innerHTML = `
        <div class="flex flex-col items-center justify-center w-full text-center px-6 border-2 border-dashed border-slate-100 lg:border-slate-200 rounded-xl mx-auto max-w-[95%]"
             style="scroll-snap-align: start; scroll-margin-top: calc(112px + 24px); min-height: calc(100vh - 418px);">
          <div class="mb-4 text-slate-300">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 3c7.2 0 9 1.8 9 9s-1.8 9-9 9-9-1.8-9-9 1.8-9 9-9"/>
              <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
              <line x1="9" y1="9" x2="9.01" y2="9"/>
              <line x1="15" y1="9" x2="15.01" y2="9"/>
            </svg>
          </div>
          <p class="text-slate-700 font-medium tracking-tight">Awaiting inspiration.</p>
          <p class="text-slate-600 text-xs mt-2">
            The best ideas are the ones you
            <span onclick="document.getElementById('postInput').scrollIntoView({ behavior: 'smooth', block: 'center' })"
                class="underline cursor-pointer text-slate-600 hover:text-slate-800 transition-colors">
              write down
            </span>
          </p>
        </div>`;
    } else {
      if (totalGlobalPosts === 0) {
        showPublicPlaceholder('empty');
      } else if (!window.isBruteFetching) {
        // Start brute force fetch and show scanning state
        showPublicPlaceholder('scanning');
        window.isBruteFetching = true;
        handleBruteForce();
      } else {
        // Already brute fetching but still empty — give up and show empty state
        showPublicPlaceholder('empty');
      }
    }
    return;
  }

  // --- Translate all posts before rendering ---
  const postTexts = items.map(item => item.content || item.text || '');
  const translatedTexts = await Translator.translateBatch(postTexts);
  const translatedItems = items.map((item, i) => ({
    ...item,
    _translatedContent: translatedTexts[i]
  }));

  // --- Render posts ---
  const existingCount = DOM.list.querySelectorAll('.feed-item').length;
  const isFreshRender = existingCount === 0;

  translatedItems.forEach((item) => {
    if (placeholder) {
      placeholder.remove();
      const ghost = document.getElementById('public-placeholder');
      if (ghost) ghost.remove();
    }

    const postNode = createPostNode(item);
    postNode.classList.add(isFreshRender ? 'feed-item-enter' : 'feed-item-enter-2');
    postNode.style.animationDelay = '0ms';

    DOM.list.appendChild(postNode);
    window.pendingPostUpdates++;
    watchPostCounts(item.id);
  });

  refreshSnap();
}

// Injects a single post into the feed without a full re-render.
// Top injection (drip feed): uses a random 1.5-4.5s delay to feel organic,
// then compensates for scroll position shift so the user's view doesn't jump.
// If the user is scrolled down or hovering, locks their position by adjusting
// scrollY by the exact pixel height the new post added.
// Bottom injection (infinite scroll): appends immediately, no delay needed.
function injectSinglePost(item, position = 'top') {
  if (document.getElementById(`post-${item.id}`)) return;
  if (currentTab === 'private' && item.isFirebase) return;

  const postNode = createPostNode(item);
  postNode.classList.add('animate-in');

  if (position === 'top') {
    const randomDelay = Math.floor(Math.random() * (4500 - 1500 + 1) + 1500);

    setTimeout(() => {
      if (currentTab !== 'public' || document.getElementById(`post-${item.id}`)) return;

      const ghost = document.getElementById('public-placeholder');
      if (ghost) ghost.remove();

      const scrollBefore = window.scrollY;
      const heightBefore = document.documentElement.scrollHeight;
      const shouldLock = DOM.list.matches(':hover') || scrollBefore > 10;

      DOM.list.prepend(postNode);
      watchPostCounts(item.id);

      requestAnimationFrame(() => {
        if (shouldLock) {
          // Shift scroll by exactly how much the page grew
          const heightDifference = document.documentElement.scrollHeight - heightBefore;
          window.scrollTo({ top: scrollBefore + heightDifference, behavior: 'instant' });
        } else {
          window.scrollTo(0, 0);
        }
        requestAnimationFrame(refreshSnap);
      });
    }, randomDelay);

  } else {
    if (!document.getElementById(`post-${item.id}`)) {
      DOM.list.appendChild(postNode);
      watchPostCounts(item.id);
    }
  }
}

// Surgically updates like/comment counts on a single post card without re-rendering.
// Uses ?? instead of || so a server value of 0 is respected, not treated as falsy.
// Also syncs the new counts back to localStorage via updateLocalPostWithServerData.
function updateUISurgically(id, data) {
  const finalComments = data.commentCount ?? 0;
  const finalLikes = data.likeCount ?? 0;

  updateLocalPostWithServerData(id, finalComments, finalLikes);

  if (currentTab !== 'public') return;

  const postEl = document.querySelector(`[data-id="${id}"]`);
  if (postEl) {
    const likeSpan = postEl.querySelector(`.count-like-${id}`);
    if (likeSpan) likeSpan.textContent = finalLikes;
    const commentSpan = postEl.querySelector(`.count-comment-${id}`);
    if (commentSpan) commentSpan.textContent = finalComments;
  } else {
    console.warn(`Post ${id} not found in DOM — may have scrolled off.`);
  }
}

// Opens a Supabase realtime listener for a single post's like/comment counts.
// First does a one-time fetch to get current counts immediately (fire-and-forget),
// then keeps a live channel open for any future updates.
// Guards against duplicate listeners via activePostListeners Map.
// On DELETE: removes the post from the DOM and cleans up the listener automatically.
// pendingPostUpdates tracks in-flight fetches so renderListItems knows when it's
// safe to render without stale counts.
function watchPostCounts(postId) {
  // Already watching this post — don't open a second listener
  if (activePostListeners.has(postId)) {
    window.pendingPostUpdates--;
    return;
  }

  // Private post IDs are numeric timestamps (>10 digits) — no Supabase record exists
  if (!isNaN(postId) && postId.length > 10) {
    window.pendingPostUpdates--;
    return;
  }

  // --- One-time fetch for immediate count display ---
  _supabase
    .from('posts')
    .select('id, like_count, comment_count')
    .eq('id', postId)
    .maybeSingle()
    .then(({ data }) => {
      window.pendingPostUpdates--;
      if (data) {
        updateUISurgically(postId, {
          id: data.id,
          likeCount: data.like_count,
          commentCount: data.comment_count
        });
        Ledger.log("watchPostCounts", 1, 0, 0);
      }
    });

  // --- Live listener for realtime updates ---
  const channel = _supabase
    .channel(`public:posts:${postId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'posts',
      filter: `id=eq.${postId}`
    }, (payload) => {
      if (payload.eventType === 'UPDATE') {
        updateUISurgically(postId, {
          id: payload.new.id,
          likeCount: payload.new.like_count,
          commentCount: payload.new.comment_count
        });
        Ledger.log("watchPostCounts", 1, 0, 0);
      }

      else if (payload.eventType === 'DELETE') {
        console.warn(`Post ${postId} was deleted from the database.`);
        if (activePostListeners.has(postId)) {
          activePostListeners.get(postId)();
          activePostListeners.delete(postId);
        }
        if (currentTab === 'public') {
          visiblePosts = visiblePosts.filter(p => p.id !== postId && p.firebaseId !== postId);
          const elToRemove = document.querySelector(`[data-id="${postId}"]`);
          if (elToRemove) {
            elToRemove.classList.add('opacity-0', 'scale-95', 'transition-all', 'duration-500');
            setTimeout(() => elToRemove.remove(), 500);
          }
        }
      }
    })
    .subscribe();

  // Cleanup function — stored in activePostListeners so switchTab can kill all watchers
  const unsubscribe = () => {
    _supabase.removeChannel(channel)
      .catch((err) => {
        console.error(`Failed to remove channel for post ${postId}:`, err);
      });
  };

  activePostListeners.set(postId, unsubscribe);
}

// Sets up an IntersectionObserver on the invisible loadTrigger element at the
// bottom of the feed. When it scrolls into view, loadMoreData fires.
// Safe to call multiple times — disconnects any existing observer first.
// rootMargin of 150px means it triggers slightly before the user hits the bottom.
function setupInfiniteScroll() {
  if (scrollObserver) scrollObserver.disconnect();

  scrollObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !isLoadingMore) {
      loadMoreData();
    }
  }, {
    root: null,
    threshold: 0.1,
    rootMargin: '150px'
  });

  if (DOM.loadTrigger) {
    scrollObserver.observe(DOM.loadTrigger);
  } else {
    console.error("CRITICAL: DOM.loadTrigger is null — infinite scroll won't work.");
  }
}

// Loads the next batch of posts when the user reaches the bottom of the feed.
// Private: slices the next BATCH_SIZE posts from localStorage and injects them.
// Public: refills the random buffer first, falls back to chronological
// subscribePublicFeed if the buffer comes back empty.
// Uses isLoadingMore as a lock to prevent parallel calls from firing.
function loadMoreData() {
  if (isLoadingMore) return;
  isLoadingMore = true;

  if (currentTab === 'private') {
    const previousLimit = currentLimit;
    currentLimit += BATCH_SIZE;

    allPrivatePosts = (JSON.parse(localStorage.getItem('freeform_v2')) || []).reverse();
    const newPosts = allPrivatePosts.slice(previousLimit, currentLimit);
    newPosts.forEach(p => {
      visiblePosts.push(p);
      injectSinglePost(p, 'bottom');
    });

    DOM.loadTrigger.style.visibility = (currentLimit >= allPrivatePosts.length) ? 'hidden' : 'visible';
    isLoadingMore = false;

  } else {
    DOM.loadTrigger.style.visibility = 'visible';
    DOM.loadTrigger.style.opacity = '1';

    refillBufferRandomly(5, true).then(() => {
      if (postBuffer.length === 0) {
        // Buffer empty — fall back to chronological fetch
        console.warn("Random buffer empty — falling back to chronological feed.");
        isAppending = true;
        subscribePublicFeed().then(() => {
          isLoadingMore = false;
          isAppending = false;
          DOM.loadTrigger.style.visibility = 'hidden';
        });
      } else {
        while (postBuffer.length > 0) {
          const p = postBuffer.shift();
          visiblePosts.push(p);
          injectSinglePost(p, 'bottom');
        }
        isLoadingMore = false;
        DOM.loadTrigger.style.visibility = 'hidden';
      }
    });
  }
}

// Renders a full-height placeholder in the public feed.
// 'empty': shown when there are genuinely no posts to display.
// 'scanning': shown while fetching — includes a 4s watchdog timer that
// force-reloads the page if still stuck on "Scanning" (network too slow / hung).
function showPublicPlaceholder(type) {
  let html = '';

  if (type === 'empty') {
    html = `
      <div id="public-placeholder" class="flex flex-col items-center justify-center w-full text-center px-6 border-2 border-dashed border-slate-100 lg:border-slate-200 rounded-xl mx-auto max-w-[95%]" style="min-height: calc(100vh - 418px);">
        <div class="mb-4 text-slate-300 animate-pulse">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.39 6.23L7 9s.5 4 4 5c1 0 3-1 3-1l3.5-3.5S14 6 10.39 6.23z" />
            <path d="M7 9c3 3 7 1.5 7 1.5" />
            <path d="M19 15.5c-2.5 0-4.5 2-4.5 4.5s2 4.5 4.5 4.5c0-2.5 2-4.5 4.5-4.5s-4.5-2-4.5-4.5z" opacity="0.5" />
            <path d="M2 12h4m10 0h6" stroke-dasharray="4 4" />
          </svg>
        </div>
        <p class="text-slate-500 font-medium tracking-tight">It's quiet here.</p>
        <p class="text-slate-400 text-xs mt-2">Waiting for a whisper to break the silence.</p>
      </div>`;

  } else if (type === 'scanning') {
    html = `
      <div id="public-placeholder" class="flex flex-col items-center justify-center w-full text-center px-6 border-2 border-dashed border-slate-100 lg:border-slate-200 rounded-xl mx-auto max-w-[95%]" style="min-height: calc(100vh - 418px);">
        <div class="mb-4 text-slate-300 animate-pulse">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.35-4.35"/>
          </svg>
        </div>
        <p class="text-slate-500 font-medium tracking-tight">Scanning the horizon...</p>
        <p class="text-slate-400 text-xs mt-2">Searching for something worth reading.</p>
      </div>`;

    // Watchdog: if still stuck on "Scanning" after 4s, something hung — force reload
    setTimeout(() => {
      const stillScanning = document.getElementById('public-placeholder');
      if (stillScanning && stillScanning.innerText.includes('Scanning')) {
        console.error("STUCK DETECTED: feed failed to load — forcing reload.");
        window.location.reload();
      }
    }, 4000);
  }

  DOM.list.innerHTML = html;
}

// Last-resort fetch when the normal feed pipeline returns nothing.
// Clears processedIds so previously seen posts are eligible again,
// then forces a refillBufferRandomly with ignoreProcessed=true.
// The 2s cooldown in finally prevents rapid retry loops.
async function handleBruteForce() {
  if (window.isBruteFetching) return;
  window.isBruteFetching = true;

  try {
    // Clear seen IDs so we don't filter out everything
    processedIds.clear();

    // Nuke placeholder before we start fetching
    const placeholder = document.getElementById('public-placeholder');
    if (placeholder) {
      placeholder.remove();
      const extra = document.getElementById('public-placeholder');
      if (extra) extra.outerHTML = '';
    }

    await refillBufferRandomly(5, false, true);

    if (postBuffer.length > 0) {
      while (postBuffer.length > 0) {
        const post = postBuffer.shift();
        if (!visiblePosts.some(p => p.id === post.id)) {
          visiblePosts.push(post);
        }
      }
      renderListItems(visiblePosts);
    } else {
      // Truly nothing found — show empty state
      totalGlobalPosts = 0;
      renderListItems([]);
    }
  } catch (err) {
    // Silent fail — renderListItems([]) will show empty state on next trigger
  } finally {
    setTimeout(() => {
      window.isBruteFetching = false;
    }, 2000);
  }
}

// ==========================================
// 5.  POST ACTIONS
// ==========================================
// Optimistic like toggle — updates the UI instantly before the server confirms.
// Locally caches liked post IDs in my_likes_cache so the heart state
// persists across page reloads without a server round-trip.
// The actual count is updated atomically in Supabase via RPC to prevent race conditions.
async function toggleLike(event, postId) {
  event.stopPropagation();
  if (!postId || postId === 'undefined') return;

  const myLikes = JSON.parse(localStorage.getItem('my_likes_cache')) || {};
  const currentlyLiked = !!myLikes[postId];

  const wrapper = event.currentTarget;
  const icon = wrapper.querySelector('svg');
  const countSpan = wrapper.querySelector('span');
  let currentCount = parseInt(countSpan.textContent) || 0;

  // --- Optimistic UI update ---
  if (currentlyLiked) {
    icon.classList.remove('fill-red-500', 'text-red-500');
    icon.classList.add('fill-none', 'text-slate-400');
    countSpan.textContent = Math.max(0, currentCount - 1);
    countSpan.classList.remove('text-red-600');
    countSpan.classList.add('text-slate-500');
    delete myLikes[postId];
  } else {
    icon.classList.remove('fill-none', 'text-slate-400');
    icon.classList.add('fill-red-500', 'text-red-500');
    countSpan.textContent = currentCount + 1;
    countSpan.classList.remove('text-slate-500');
    countSpan.classList.add('text-red-600');
    myLikes[postId] = true;
  }
  localStorage.setItem('my_likes_cache', JSON.stringify(myLikes));

  // --- Sync to Supabase in background ---
  try {
    const { error } = await _supabase.rpc('toggle_like_atomic', {
      p_post_id: postId,
      p_increment: currentlyLiked ? -1 : 1
    });
    if (error) throw error;
    Ledger.log("toggleLike", 0, 2, 0);
  } catch (error) {
    console.error('Toggle like error:', error);
    showToast("Connection failed. Like not saved.");
  }
}
window.toggleLike = toggleLike;

// Deletes a comment from Firebase and atomically decrements the comment count in Supabase.
// Wrapped in a confirmation dialog so users can't accidentally delete.
async function deleteComment(postId, commentId) {
  showDialog(
    "Delete Comment",
    "Are you sure you want to remove this?",
    "Delete",
    async () => {
      try {
        const commentRef = doc(db, "globalPosts", postId, "comments", commentId);
        await deleteDoc(commentRef);

        const { error } = await _supabase.rpc('toggle_comment_count_atomic', {
          p_post_id: postId,
          p_increment: -1
        });
        if (error) throw error;

        Ledger.log("deleteComment", 0, 1, 1);
        showToast("Comment deleted");
      } catch (error) {
        console.error('Delete comment error:', error);
        showToast("Could not delete comment", "error");
      }
    }
  );
}

// Submits a comment on the active post.
// Sanitizes input, checks spam guard, then writes to Firebase subcollection
// and atomically increments the comment count in Supabase.
// Keyboard suppression: forcibly blurs and disables the input so the mobile
// keyboard drops immediately — re-enabled after 300ms in finally.
async function postComment() {
  const rawText = DOM.commentInput.value.trim();

  if (!checkSpamGuard(null)) return;
  if (!rawText || !activePostId) return;

  const text = getSafeText(rawText);
  if (!text.trim()) {
    showToast("Invalid comment");
    return;
  }

  // --- Keyboard suppression ---
  DOM.commentInput.blur();
  DOM.commentInput.disabled = true;
  if ('virtualKeyboard' in navigator) navigator.virtualKeyboard.hide();
  DOM.sendComment.disabled = true;
  DOM.sendComment.style.opacity = "0.5";

  try {
    const currentHandle = localStorage.getItem('freeform_username') || '';

    await addDoc(collection(db, `globalPosts/${activePostId}/comments`), {
      text: text,
      authorId: MY_USER_ID,
      authorHandle: currentHandle,
      userId: auth.currentUser?.uid,
      createdAt: serverTimestamp()
    });

    const { error } = await _supabase.rpc('toggle_comment_count_atomic', {
      p_post_id: activePostId,
      p_increment: 1
    });
    if (error) throw error;

    Ledger.log("postComment", 0, 2, 0);
    DOM.commentInput.value = '';
    showToast("Comment added");

    const scrollArea = document.getElementById('modalScrollArea');
    if (scrollArea) scrollArea.scrollTop = 0;

  } catch (e) {
    console.error('Post comment error:', e);
    showToast("Connection failed. Comment not added.");
  } finally {
    setTimeout(() => {
      DOM.commentInput.disabled = false;
      DOM.sendComment.disabled = false;
      DOM.sendComment.style.opacity = "1";
    }, 300);
  }
}

// Generates a globally unique sequential ID for each post using a Firestore transaction.
// The transaction ensures no two users get the same number even if they post simultaneously.
// Falls back to a timestamp-based temp ID if the transaction fails,
// so posting always works even if the counter is temporarily unreachable.
async function getNextUniqueTag() {
  const counterRef = doc(db, "metadata", "postCounter");
  try {
    const newCount = await runTransaction(db, async (transaction) => {
      const counterDoc = await transaction.get(counterRef);
      if (!counterDoc.exists()) {
        transaction.set(counterRef, { count: 1 });
        return 1;
      }
      const nextId = counterDoc.data().count + 1;
      transaction.update(counterRef, { count: nextId });
      return nextId;
    });

    Ledger.log("getNextUniqueTag", 1, 1, 0);
    return { num: newCount, tag: `UID:${newCount}` };

  } catch (e) {
    // Transaction failed — use timestamp as fallback so posting isn't blocked
    const tempNum = Date.now();
    return { num: tempNum, tag: `#temp${tempNum.toString().slice(-4)}` };
  }
}

// Main post handler — triggered by the Post button.
// Sanitizes input, checks spam guard for public posts, then:
// - Public: writes to Firebase globalPosts + creates a Supabase counter record
// - Private: saves to localStorage only
// Always saves to localStorage as the local source of truth regardless of visibility.
// Switches tabs automatically to show the post in the right feed after posting.
async function handlePost() {
  const rawText = DOM.input.value.trim();
  const text = getSafeText(rawText);
  if (!text) return;

  const isPublic = DOM.toggle.checked;
  if (isPublic && !checkSpamGuard(text)) return;

  DOM.btn.textContent = "...";
  DOM.btn.disabled = true;

  try {
    let firebaseId = null;
    let uniqueTag = null;
    let serialId = null;

    if (isPublic) {
      // --- Write to Firebase ---
      const idData = await getNextUniqueTag();
      uniqueTag = idData.tag;
      serialId = idData.num;
      const currentHandle = localStorage.getItem('freeform_username') || '';

      const docRef = await addDoc(collection(db, "globalPosts"), {
        content: text,
        font: selectedFont,
        authorId: MY_USER_ID,
        authorHandle: currentHandle,
        uniqueTag: uniqueTag,
        serialId: serialId,
        userId: auth.currentUser?.uid,
        createdAt: serverTimestamp()
      });
      firebaseId = docRef.id;
      Ledger.log("handlePost", 0, 1, 0);

      // Create Supabase counter record so likes/comments can be tracked
      _supabase.from('posts').insert({
        id: firebaseId,
        like_count: 0,
        comment_count: 0,
        author_id: MY_USER_ID,
        supabase_uid: (await _supabase.auth.getUser()).data.user?.id
      }).then(({ error }) => {
        if (error) console.error("Supabase Insert Error:", error.message);
      });
    }

    // --- Always save to localStorage ---
    const newPost = {
      id: Date.now().toString(),
      content: text,
      font: selectedFont,
      uniqueTag: uniqueTag,
      serialId: serialId,
      createdAt: new Date().toISOString(),
      isFirebase: false,
      firebaseId: firebaseId,
      commentCount: 0,
      likeCount: 0
    };

    const posts = JSON.parse(localStorage.getItem('freeform_v2')) || [];
    posts.push(newPost);
    localStorage.setItem('freeform_v2', JSON.stringify(posts));
    updateMeter();

    // --- Navigate to the right tab ---
    if (isPublic) {
      if (currentTab === 'private') switchTab('public');
    } else {
      if (currentTab === 'public') switchTab('private');
      else { allPrivatePosts = posts.reverse(); renderPrivateBatch(); }
    }

    DOM.input.value = "";
    setRandomPlaceholder();
	closeInputModal();

  } catch (error) {
    showToast("Error posting", "error");
  } finally {
    DOM.btn.textContent = "Post";
    DOM.btn.disabled = false;
  }
}

// Promotes a private draft to the global public feed.
// Confirms via dialog first, then checks spam guard before publishing.
// Writes to Firebase + creates Supabase counter record (same as handlePost),
// then links the local draft to its new Firebase ID so likes/comments
// start tracking. Re-opens the modal so the user sees the "Live" status immediately.
async function publishDraft(post) {
  showDialog(
    "Publish to World?",
    "This note will be visible to everyone on the Global Feed.",
    "Publish",
    async () => {
      if (!checkSpamGuard(post.content)) return;

      try {
        const idData = await getNextUniqueTag();
        const currentHandle = localStorage.getItem('freeform_username') || '';

        // --- Write to Firebase ---
        const docRef = await addDoc(collection(db, "globalPosts"), {
          content: post.content,
          font: post.font || 'font-sans',
          authorId: MY_USER_ID,
          authorHandle: currentHandle,
          uniqueTag: idData.tag,
          serialId: idData.num,
          userId: auth.currentUser?.uid,
          createdAt: serverTimestamp()
        });
        Ledger.log("publishDraft", 0, 1, 0);

        // Create Supabase counter record so likes/comments can be tracked
        _supabase.from('posts').insert({
          id: docRef.id,
          like_count: 0,
          comment_count: 0,
          author_id: MY_USER_ID,
          supabase_uid: (await _supabase.auth.getUser()).data.user?.id
        }).then(({ error }) => {
          if (error) console.error("Supabase Insert Error:", error.message);
        });

        // --- Link local draft to its new Firebase ID ---
        const posts = JSON.parse(localStorage.getItem('freeform_v2')) || [];
        const targetIndex = posts.findIndex(p => p.id === post.id);

        if (targetIndex !== -1) {
          posts[targetIndex].firebaseId = docRef.id;
          posts[targetIndex].uniqueTag = idData.tag;
          posts[targetIndex].serialId = idData.num;
          posts[targetIndex].commentCount = 0;
          posts[targetIndex].likeCount = 0;
          localStorage.setItem('freeform_v2', JSON.stringify(posts));

          allPrivatePosts = posts.reverse();
          loadFeed();

          // Re-open modal to show the post is now live
          const updatedPost = posts.find(p => p.id === post.id);
          openModal(updatedPost);
          showToast("Post is now live");
        }

      } catch (e) {
        showToast("Could not publish. Check connection.", "error");
      }
    }
  );
}

// Deletes a post from the private archive.
// If the post was published, also cleans up Firebase (post + comments + likes)
// and removes the Supabase counter record — all in a batch to stay atomic.
// Always removes from localStorage regardless of cloud status.
async function deleteLocal(id) {
  showDialog(
    "Delete from Archive?",
    "This will permanently remove this note from your device and from the Global feed.",
    "Delete",
    async () => {
      let posts = JSON.parse(localStorage.getItem('freeform_v2')) || [];
      const targetPost = posts.find(p => p.id === id);

      if (targetPost && targetPost.firebaseId) {
        try {
          // --- Firebase cleanup: delete post + all subcollections in one batch ---
          const batch = writeBatch(db);
          const postRef = doc(db, "globalPosts", targetPost.firebaseId);
          const commentsRef = collection(db, "globalPosts", targetPost.firebaseId, "comments");
          const likesRef = collection(db, "globalPosts", targetPost.firebaseId, "likes");

          const [commentsSnapshot, likesSnapshot] = await Promise.all([
            getDocs(commentsRef),
            getDocs(likesRef)
          ]);

          commentsSnapshot.forEach(doc => batch.delete(doc.ref));
          likesSnapshot.forEach(doc => batch.delete(doc.ref));
          batch.delete(postRef);
          await batch.commit();
          Ledger.log("deleteLocal", 0, 0, commentsSnapshot.size + likesSnapshot.size + 1);

          // --- Supabase cleanup: remove counter record ---
          const { error } = await _supabase
            .from('posts')
            .delete()
            .eq('id', targetPost.firebaseId);
          if (error) console.error("Supabase cleanup failed:", error.message);

        } catch(e) {
          console.error("Cloud deletion failed:", e);
        }
      }

      // --- Always clean up locally ---
      posts = posts.filter(p => p.id !== id);
      localStorage.setItem('freeform_v2', JSON.stringify(posts));
      allPrivatePosts = posts.reverse();
      renderPrivateBatch();
      updateMeter();
      showToast("Note deleted from archive", "neutral");
    }
  );
}

// Deletes a post from the global public feed for everyone.
// Cleans up Firebase (post + comments + likes subcollections) in a single batch,
// then removes the Supabase counter record.
// Surgically removes the card from the DOM with a fade animation and kills
// the realtime watcher for that post.
// Demotes the post back to a private draft in localStorage (removes firebaseId)
// so it still exists in the user's archive without its global status.
async function deleteGlobal(postId) {
  showDialog(
    "Delete from Global?",
    "This will permanently remove the post for everyone. Comments and likes will also be deleted.",
    "Delete",
    async () => {
      try {
        // --- Firebase: batch delete post + all subcollections ---
        const batch = writeBatch(db);
        const postRef = doc(db, "globalPosts", postId);
        const commentsRef = collection(db, "globalPosts", postId, "comments");
        const likesRef = collection(db, "globalPosts", postId, "likes");

        const commentsSnapshot = await getDocs(commentsRef);
        Ledger.log("deleteGlobal", commentsSnapshot.size, 0, 0);
        commentsSnapshot.forEach(commentDoc => batch.delete(commentDoc.ref));

        const likesSnapshot = await getDocs(likesRef);
        Ledger.log("deleteGlobal", likesSnapshot.size, 0, 0);
        likesSnapshot.forEach(likeDoc => batch.delete(likeDoc.ref));

        batch.delete(postRef);
        await batch.commit();
        Ledger.log("deleteGlobal", 0, 0, commentsSnapshot.size + likesSnapshot.size + 1);

        // --- Supabase: remove counter record ---
        const { error } = await _supabase.from('posts').delete().eq('id', postId);
        if (error) throw error;

        // --- DOM: fade out and remove the card ---
        visiblePosts = visiblePosts.filter(p => p.id !== postId && p.firebaseId !== postId);
        const elToRemove = document.querySelector(`[data-id="${postId}"]`);
        if (elToRemove) {
          elToRemove.classList.add('opacity-0', 'scale-95', 'transition-all', 'duration-300');
          setTimeout(() => elToRemove.remove(), 300);
        }

        // --- Kill the realtime watcher for this post ---
        if (activePostListeners.has(postId)) {
          activePostListeners.get(postId)();
          activePostListeners.delete(postId);
        }

        // If feed is now empty, show placeholder
        setTimeout(() => {
          if (document.querySelectorAll('.feed-item').length === 0) {
            totalGlobalPosts = 0;
            renderListItems([]);
          }
        }, 350);

        // --- Demote to private draft in localStorage ---
        let posts = JSON.parse(localStorage.getItem('freeform_v2')) || [];
        let updated = false;
        posts = posts.map(p => {
          if (p.firebaseId === postId) {
            delete p.firebaseId;
            p.commentCount = 0;
            p.likeCount = 0;
            updated = true;
          }
          return p;
        });

        if (updated) {
          localStorage.setItem('freeform_v2', JSON.stringify(posts));
          allPrivatePosts = posts.reverse();
          if (currentTab === 'private') renderPrivateBatch();
        }

        showToast("Post deleted from global feed");

      } catch (e) {
        showToast("Delete failed. Check connection.", "error");
      }
    }
  );
}

// ==========================================
// 6.  UI COMPONENTS
// ==========================================
// Builds and returns a complete post card DOM element.
// Handles all visual states: private draft vs global post, own post vs others,
// liked vs unliked heart, handle vs anonymous identity.
// Click logic: single tap opens modal (local/comments), double tap triggers heart animation + like.
// Delete button only appears on your own posts.
// DM button only appears on other people's global posts.
function createPostNode(item) {
  const el = document.createElement('div');
  el.id = `post-${item.id}`;
  el.setAttribute('data-id', item.id);
  const cursorClass = item.isFirebase ? "" : "cursor-pointer";
  el.className = `feed-item block w-full bg-white px-4 py-3 mb-3 pb-6 border-b border-slate-100 lg:border-b-[1px] lg:border-slate-200 relative transition-colors ${cursorClass}`;

  // --- Identity & metadata ---
  const time = getRelativeTime(item.createdAt);
  const fontClass = item.font || 'font-sans';
  const isMyGlobalPost = item.isFirebase && item.authorId === MY_USER_ID;
  const isMe = item.authorId === MY_USER_ID;
  const handle = item.authorHandle;
  const hasHandle = handle && handle.trim() !== '';
  const identityText = hasHandle ? `@${handle.toLowerCase()}` : (item.isFirebase ? 'Global' : 'Local');
  const identityClass = (item.isFirebase || hasHandle)
    ? 'text-brand-600'
    : 'text-slate-500';

  // --- Like & comment state ---
  const hasCommentsAccess = item.isFirebase || item.firebaseId;
  const realId = item.isFirebase ? item.id : item.firebaseId;
  const commentCount = item.commentCount || 0;
  const likeCount = item.likeCount || 0;
  const myLikes = JSON.parse(localStorage.getItem('my_likes_cache')) || {};
  const isLiked = !!myLikes[realId];
  const heartFill = isLiked ? 'fill-red-500 text-red-500' : 'fill-none text-slate-400 group-hover:text-red-500';
  const countColor = isLiked ? 'text-red-600' : 'text-slate-500';

  // --- Interactive buttons (like + comment) ---
  const interactiveButtonsHtml = `
    <div class="flex items-center gap-5">
      <div class="like-trigger group flex items-center gap-1.5 cursor-pointer transition-colors"
           onclick="toggleLike(event, '${realId}')">
        <div class="hover:scale-110 transition-transform duration-200">
          <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-heart ${heartFill}" width="22" height="22" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
            <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
            <path d="M19.5 12.572l-7.5 7.428l-7.5 -7.428a5 5 0 1 1 7.5 -6.566a5 5 0 1 1 7.5 6.572"></path>
          </svg>
        </div>
        <span class="text-sm font-semibold ${countColor} count-like-${realId}">${likeCount}</span>
      </div>

      <div class="group flex items-center gap-1.5 relative cursor-pointer text-brand-500 hover:text-brand-700 transition-colors">
        <div class="hover:scale-110 transition-transform duration-200">
          <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-message-circle-2" width="22" height="22" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
            <path d="M3 20l1.3 -3.9a9 8 0 1 1 3.4 2.9l-4.7 1"></path>
          </svg>
        </div>
        <span class="text-sm font-semibold count-comment-${realId}">${commentCount}</span>
      </div>
    </div>
  `;

  const actionArea = hasCommentsAccess
    ? interactiveButtonsHtml
    : `<span class="text-xs text-slate-400 font-medium italic">Private Draft</span>`;

  // --- Share menu ---
  const allowedPlatforms = getSmartShareButtons(item.content);
  let menuHtml = '';
  allowedPlatforms.forEach(p => {
    menuHtml += `<button class="share-icon-btn ${p.classes}" data-platform="${p.id}" title="Share on ${p.name}">${p.icon}</button>`;
  });

  const shareComponent = `
    <div class="share-container relative z-20">
      <div class="share-menu" id="menu-${item.id}">${menuHtml}</div>
      <button class="share-trigger-btn" onclick="toggleShare(event, 'menu-${item.id}')" title="Share Options">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
          <path d="M13.5 1a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM11 2.5a2.5 2.5 0 1 1 .603 1.628l-6.718 3.12a2.499 2.499 0 0 1 0 1.504l6.718 3.12a2.5 2.5 0 1 1-.488.876l-6.718-3.12a2.5 2.5 0 1 1 0-3.256l6.718-3.12A2.5 2.5 0 0 1 11 2.5zm-8.5 4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm11 5.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"/>
        </svg>
      </button>
    </div>
  `;

  const footerHtml = `<div class="mt-3 pt-3 flex items-center justify-between">${actionArea}${shareComponent}</div>`;

  // --- DM button (only on other people's global posts) ---
  const dmButtonHtml = (item.isFirebase && !isMe) ? `
    <button onclick="window.openDirectMessage(event, '${item.authorId}', '')"
            class="relative z-30 p-1.5 rounded-full bg-slate-50 text-slate-400 hover:bg-brand-50 hover:text-brand-500 transition-all active:scale-95 cursor-pointer">
      <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 pointer-events-none" viewBox="1 -2 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 1 1-7.6-14h1.4c2 0 4 2 4 4v2"></path>
        <path d="M9 11l.01 0"></path>
        <path d="M15 11l.01 0"></path>
      </svg>
    </button>
  ` : '';

  // --- Assemble HTML ---
  el.innerHTML = `
    <div class="animation-container absolute inset-0 flex items-center justify-center pointer-events-none z-30"></div>

    <div class="flex justify-between items-start mb-3">
      <div class="flex items-center gap-2">
        <span class="px-0 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${identityClass}">
          ${identityText}
        </span>
        <span class="text-xs text-slate-400 font-medium">${time}</span>
      </div>
      <div class="flex items-center">
        ${dmButtonHtml}
      </div>
    </div>

    <p class="post-body text-slate-800 whitespace-pre-wrap leading-relaxed text-[15px] relative z-10 ${fontClass} break-keep break-words">${renderSmartText(item._translatedContent || item.content)}</p>

    ${footerHtml}
  `;

  // --- Delete button (own posts only) ---
  if (!item.isFirebase || isMyGlobalPost) {
    const delBtn = document.createElement('button');
    delBtn.className = "absolute top-4 right-4 text-slate-300 hover:text-red-500 transition-colors z-10 p-2";
    delBtn.innerHTML = "✕";
    delBtn.onclick = (e) => {
      e.stopPropagation();
      item.isFirebase ? deleteGlobal(item.id) : deleteLocal(item.id);
    };
    el.appendChild(delBtn);
  }

  // --- Click handler: single tap = modal, double tap = heart animation + like ---
  let clickTimer = null;
  let clickCount = 0;

  el.onclick = (e) => {
    if (activeShareMenuId) return;
    if (e.target.closest('a')) return;
    if (e.target.closest('button') || e.target.closest('.share-container') || e.target.closest('.like-trigger')) return;

    const isCommentIcon = e.target.closest('.icon-tabler-message-circle-2');

    clickCount++;
    if (clickCount === 1) {
      clickTimer = setTimeout(() => {
        if (!item.isFirebase || isCommentIcon) openModal(item);
        clickCount = 0;
      }, 250);
    } else if (clickCount === 2) {
      clearTimeout(clickTimer);
      clickCount = 0;
      showHeartAnimation(el);
      if (hasCommentsAccess) {
        const likeButton = el.querySelector('.like-trigger');
        if (likeButton) {
          const heartIcon = likeButton.querySelector('svg');
          if (heartIcon && !heartIcon.classList.contains('fill-red-500')) {
            setTimeout(() => likeButton.click(), 50);
          }
        }
      }
    }
  };

  // --- Share button handlers ---
  el.querySelectorAll('.share-icon-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      sharePost(item.content, btn.getAttribute('data-platform'));
      const menu = el.querySelector('.share-menu');
      if (menu) menu.classList.remove('active');
    };
  });

  return el;
}

// Escapes < and > to prevent raw HTML from rendering in plain text contexts.
function cleanText(str) {
  if (!str) return "";
  return str.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Scans text for URLs and converts them into pretty clickable pills.
// Strips leading/trailing punctuation, skips @mentions, handles subdomains
// (e.g. "en.wikipedia.org" → "wikipedia"), and routes clicks through
// the exit modal so users see where they're going before leaving the app.
function renderSmartText(rawText) {
  if (!rawText) return "";
  const urlPattern = /((?<!@)(?:(?:https?:\/\/|www\.)[^\s()<>[\]{}|\\^%§¶•°¬!]+|(?:\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(?:\/[^\s()<>[\]{}|\\^%§¶•°¬!]*)?)|(?:\b[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s()<>[\]{}|\\^%§¶•°¬!]*)?)))/ig;

  return rawText.replace(urlPattern, (url) => {
    try {
      const leadingMatch = url.match(/^[([<{]+/);
      const leadingPunct = leadingMatch ? leadingMatch[0] : '';
      const trailingMatch = url.match(/[\])>}§$%&*~^@!#<>¶•°¬!,.;:]+$/);
      const trailingPunct = trailingMatch ? trailingMatch[0] : '';

      let cleanUrl = url.substring(leadingPunct.length, url.length - trailingPunct.length);
      if (!cleanUrl) return url;

      let tempUrl = /^https?:\/\//i.test(cleanUrl) ? cleanUrl : `https://${cleanUrl}`;
      const urlObj = new URL(tempUrl);

      const domain = urlObj.hostname.includes('xn--') && typeof punycode !== 'undefined'
        ? punycode.toUnicode(urlObj.hostname).replace('www.', '')
        : decodeURI(urlObj.hostname).replace('www.', '');

      // Skip technical subdomains to show the real brand name
      const domainParts = domain.split('.');
      let brandName = domainParts[0];
      const techSubdomains = ['en', 'm', 'www', 'mobile', 'dev'];
      if (techSubdomains.includes(brandName) && domainParts.length > 1) {
        brandName = domainParts[1];
      }

      return `${leadingPunct}<a href="javascript:void(0)"
        onclick="event.stopPropagation(); openExitModal('${tempUrl}')"
        class="dm-pretty-link"
        title="${tempUrl}"
      ><span>${brandName}</span></a>${trailingPunct}`;

    } catch (e) {
      return url;
    }
  });
}
window.renderSmartText = renderSmartText;

// Converts a timestamp to a human-readable relative string.
// Handles both Firestore Timestamps (.toDate()) and ISO strings.
function getRelativeTime(timestamp) {
  if (!timestamp) return "Just now";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now = new Date();
  const diff = Math.floor((now - date) / 1000);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return date.toLocaleDateString();
}

// Instagram-style heart burst animation on double-tap.
// Creates a floating heart element centered over the post card,
// scales it up then fades it out, then removes it from the DOM.
function showHeartAnimation(container) {
  const rect = container.getBoundingClientRect();

  const heart = document.createElement('div');
  heart.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" class="w-20 h-20 text-red-500 fill-red-500 drop-shadow-lg" viewBox="0 0 24 24" stroke-width="0" stroke="currentColor">
      <path d="M19.5 12.572l-7.5 7.428l-7.5 -7.428a5 5 0 1 1 7.5 -6.566a5 5 0 1 1 7.5 6.572"></path>
    </svg>
  `;

  heart.style.cssText = `
    position: fixed;
    left: ${rect.left + rect.width / 2 - 40}px;
    top: ${rect.top + rect.height / 2 - 40}px;
    transform: scale(0);
    opacity: 0;
    transition: all 500ms ease-out;
    will-change: transform, opacity;
    pointer-events: none;
    z-index: 9999;
  `;

  document.body.appendChild(heart);
  requestAnimationFrame(() => {
    heart.style.transform = 'scale(1.25)';
    heart.style.opacity = '1';
    setTimeout(() => {
      heart.style.transform = 'scale(1.5)';
      heart.style.opacity = '0';
      setTimeout(() => heart.remove(), 500);
    }, 400);
  });
}

// Nudges scroll by 1px down then back up to force the browser to
// recalculate scroll snap positions after DOM changes.
function refreshSnap() {
  window.scrollBy(0, 1);
  window.scrollBy(0, -1);
}

// Applies the selected font to the post input and highlights
// the matching font button with a ring indicator.
function applyFontPreference(font) {
  DOM.input.classList.remove('font-sans', 'font-serif', 'font-mono', 'font-hand');
  DOM.input.classList.add(font);

  // Update font picker trigger to show selected font style
  const label = document.getElementById('fontPickerLabel');
  if (label) label.className = `${font} text-xs font-bold`;

  DOM.fontBtns.forEach(btn => {
    if (btn.getAttribute('data-font') === font) {
      btn.classList.add('ring-2', 'ring-brand-500', 'ring-offset-1');
    } else {
      btn.classList.remove('ring-2', 'ring-brand-500', 'ring-offset-1');
    }
  });
}

//     → updateTabClasses, updateToggleUI, switchTab
// Updates the active/inactive style on the Private and Public tab buttons
// to reflect whichever tab is currently selected.
function updateTabClasses() {
  const activeClass = "flex-1 pb-3 text-sm font-bold text-brand-600 border-b-2 border-brand-500 transition-all";
  const inactiveClass = "flex-1 pb-3 text-sm font-semibold text-slate-500 hover:text-slate-700 transition-all border-b-2 border-transparent";

  if (currentTab === 'private') {
    DOM.tabPrivate.className = activeClass;
    DOM.tabPublic.className = inactiveClass;
  } else {
    DOM.tabPublic.className = activeClass;
    DOM.tabPrivate.className = inactiveClass;
  }
}

// Updates the toggle label text and color to match the current Public/Private state.
// The __toggleUISet flag lets other code suppress one update cycle
// (e.g. when the toggle is set programmatically rather than by user interaction).
function updateToggleUI() {
  if (window.__toggleUISet) {
    window.__toggleUISet = false;
    return;
  }

  const isPublic = DOM.toggle.checked;
  const newText = isPublic ? "Public" : "Private";

  if (DOM.label.textContent !== newText) {
    DOM.label.textContent = newText;
    DOM.label.className = isPublic
      ? "text-xs font-bold text-brand-600 transition-colors"
      : "text-xs font-semibold text-slate-500 transition-colors";
  }
}

// Switches between Private and Public tabs with a fade transition.
// Immediately locks currentTab to prevent double-fires, kills all active
// realtime listeners from the previous tab, then fades the feed out,
// swaps content, and fades back in.
// The 300ms timeout matches the CSS fade duration so content loads
// after the old feed has fully disappeared.
function switchTab(tab) {
  history.scrollRestoration = 'manual';
  if (currentTab === tab) return;

  currentTab = tab; // Lock immediately to prevent double-fire

  // Kill all realtime listeners from the previous tab
  if (activePostListeners.size > 0) {
    activePostListeners.forEach((unsubscribe) => unsubscribe());
    activePostListeners.clear();
    window.pendingPostUpdates = 0;
  }

  // Force-reset transitions to avoid stale animation state
  DOM.list.style.transition = 'none';
  DOM.list.style.transform = '';
  DOM.list.style.opacity = '';
  const _ = DOM.list.offsetHeight; // Force reflow
  DOM.list.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
  DOM.list.style.opacity = '0';
  DOM.list.innerHTML = '';

  setTimeout(() => {
    localStorage.setItem('freeform_tab_pref', tab);
    currentLimit = BATCH_SIZE;
    updateTabClasses();
    loadFeed();
    if (tab === 'public') setupInfiniteScroll();

    requestAnimationFrame(() => {
      DOM.list.style.opacity = '1';
      DOM.list.style.transform = 'translateX(0)';
      window.scrollTo({ top: 0, behavior: 'instant' });
      setTimeout(() => refreshSnap(), 100);
    });
  }, 300);
}

// ==========================================
//  // 7.  MODAL SYSTEM
// ==========================================

// Opens the comment modal for a post.
// Global posts: opens a Firebase listener for live comment updates,
// fetches true like/comment counts from Supabase, and watches for
// post deletion (auto-closes modal with a toast if the post disappears).
// Private drafts: shows a locked state with a prompt to publish.
// Pushes a history state so the back button closes the modal naturally.
function openModal(post) {
  if (window.history.state?.modal !== 'open') {
    history.pushState({ modal: 'open' }, '');
  }

  if (DOM.input) DOM.input.disabled = true;

  const realFirestoreId = post.isFirebase ? post.id : post.firebaseId;
  activePostId = realFirestoreId;

  // --- Populate modal content ---
  DOM.modalContent.innerHTML = renderSmartText(post.content);
  const fontClass = post.font || 'font-sans';
  DOM.modalContent.classList.remove('font-sans', 'font-serif', 'font-mono', 'font-hand');
  DOM.modalContent.classList.add(fontClass);
  DOM.modalDate.textContent = getRelativeTime(post.createdAt);
  DOM.modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  if (realFirestoreId) {
    if (DOM.commentInputBar) DOM.commentInputBar.style.display = 'block';

    // --- Watch for post deletion while modal is open ---
    const postRef = doc(db, "globalPosts", realFirestoreId);
    const modalAutoUnsubscribe = onSnapshot(postRef, (docSnap) => {
      if (docSnap.exists()) {
        // Fetch true counts from Supabase and update modal counters
        _supabase
          .from('posts')
          .select('id, like_count, comment_count')
          .eq('id', realFirestoreId)
          .maybeSingle()
          .then(({ data, error }) => {
            if (data && !error) {
              updateLocalPostWithServerData(realFirestoreId, data.comment_count, data.like_count);
              const mLike = DOM.modal.querySelector(`.count-like-${realFirestoreId}`);
              const mComm = DOM.modal.querySelector(`.count-comment-${realFirestoreId}`);
              if (mLike) mLike.textContent = data.like_count;
              if (mComm) mComm.textContent = data.comment_count;
              Ledger.log("openModal_SupabaseSync", 1, 0, 0);
            }
          });

        // Keep realtime count updates ticking while user reads
        if (typeof watchPostCounts === 'function') {
          watchPostCounts(realFirestoreId);
        }

      } else {
        // Post was deleted while modal was open — close and notify
        modalAutoUnsubscribe();
        closeModal();
        const now = Date.now();
        if (now - lastGhostToastTime > 3000) {
          showToast("Note no longer available", "neutral");
          lastGhostToastTime = now;
        }
        const el = document.querySelector(`[data-id="${realFirestoreId}"]`);
        if (el) el.remove();
      }
    });

    // --- Live comments listener ---
    const q = query(
      collection(db, `globalPosts/${realFirestoreId}/comments`),
      orderBy("createdAt", "desc")
    );
    DOM.commentList.innerHTML = '<div class="text-center py-10 text-slate-300 text-sm">Loading...</div>';

    commentsUnsubscribe = onSnapshot(q, (snapshot) => {
      DOM.commentList.innerHTML = '';

      if (snapshot.empty) {
        DOM.commentList.innerHTML = `
          <div class="flex flex-col items-center justify-center py-10 text-center">
            <div class="mb-1 opacity-30">${getThoughtBubbleSVG()}</div>
            <div class="text-slate-400 text-sm">No comments yet.<br>Be the first.</div>
          </div>`;
        return;
      }

      snapshot.forEach(doc => {
        const c = doc.data();
        const div = document.createElement('div');
        const time = getRelativeTime(c.createdAt);
        const isMyComment = c.authorId === MY_USER_ID;
        const authorDisplay = c.authorHandle ? c.authorHandle : c.authorId;
        div.className = "comment-bubble flex flex-col items-start w-full relative group";

        const deleteBtn = isMyComment
          ? `<button class="delete-comment-btn ml-2 text-xs font-semibold text-red-300 hover:text-red-500 transition-colors cursor-pointer" data-id="${doc.id}">Delete</button>`
          : '';

        div.innerHTML = `
          <span class="text-[11px] font-semibold text-gray-400 mb-1 ml-1 block">${authorDisplay}</span>
          <div class="bg-gray-100 lg:bg-gray-200 px-4 py-2.5 rounded-2xl rounded-tl-none max-w-[90%]">
            <p class="text-[15px] text-gray-800 leading-snug break-words font-sans">${renderSmartText(c.text)}</p>
          </div>
          <div class="flex items-center gap-1.5 mt-1 ml-1">
            <span class="text-[10px] text-gray-400">${time}</span>
            ${deleteBtn}
          </div>
        `;

        if (isMyComment) {
          const btn = div.querySelector('.delete-comment-btn');
          if (btn) btn.onclick = () => deleteComment(realFirestoreId, doc.id);
        }

        DOM.commentList.appendChild(div);
      });

      Ledger.log("openModal", snapshot.docs.length, 0, 0);
    });

  } else {
    // --- Private draft: show locked state ---
    DOM.commentList.innerHTML = `
      <div class="flex flex-col items-center justify-center py-12 text-center opacity-50">
        <div class="text-3xl mb-2">🔒</div>
        <p class="text-sm font-medium">Private Draft</p>
        <p class="text-xs mt-1">
          <span id="triggerPublish" class="text-brand-600 font-bold underline cursor-pointer hover:text-brand-700">Share this post</span>
          to enable comments.
        </p>
      </div>`;

    const trigger = document.getElementById('triggerPublish');
    if (trigger) trigger.onclick = () => publishDraft(post);
    if (DOM.commentInputBar) DOM.commentInputBar.style.display = 'none';
  }
}

// Closes the comment modal and cleans up all associated listeners.
// Calls history.back() to match the pushState in openModal so the
// browser back button works correctly.
// shouldFocus: pass true when closing via keyboard (Escape) to return
// focus to the post input so the user can keep typing.
function closeModal(shouldFocus = false) {
  if (window.history.state?.modal === 'open') {
    window.history.back();
  }

  DOM.modal?.classList.add('hidden');
  document.body.style.overflow = '';

  // --- Cleanup listeners ---
  if (commentsUnsubscribe) {
    commentsUnsubscribe();
    commentsUnsubscribe = null;
  }

  if (typeof modalAutoUnsubscribe !== 'undefined' && modalAutoUnsubscribe) {
    modalAutoUnsubscribe();
  }

  if (activePostId && activePostListeners.has(activePostId)) {
    const unsubscribe = activePostListeners.get(activePostId);
    if (typeof unsubscribe === 'function') unsubscribe();
    activePostListeners.delete(activePostId);
  }

  activePostId = null;

  // --- Restore input ---
  if (DOM.input) {
    DOM.input.disabled = false;
    if (shouldFocus) {
      setTimeout(() => {
        DOM.input.focus();
        const length = DOM.input.value.length;
        DOM.input.setSelectionRange(length, length);
      }, 50);
    }
  }
}

// Generic modal opener — used for Profile, Chat, and any future modals.
// Pushes a history state so the back button closes the modal naturally.
// Disables the post input while any modal is open to prevent background interaction.
function showUIModal(modalElement) {
  if (window.history.state?.modal !== 'open') {
    history.pushState({ modal: 'open' }, '');
  }
  if (DOM.input) DOM.input.disabled = true;
  modalElement.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

// Generic modal closer — pairs with showUIModal.
// shouldFocus: pass true to return cursor to the post input after closing,
// with a cursor-to-end trick to avoid the browser resetting the caret position.
function hideUIModal(modalElement, shouldFocus = false) {
  if (window.history.state?.modal === 'open') {
    window.history.back();
  }
  modalElement.classList.add('hidden');
  document.body.style.overflow = '';

  if (DOM.input) {
    DOM.input.disabled = false;
    if (shouldFocus) {
      setTimeout(() => {
        DOM.input.focus();
        // Re-set value to move cursor to end
        const val = DOM.input.value;
        DOM.input.value = '';
        DOM.input.value = val;
      }, 50);
    }
  }
}

// Intercepts outbound links and shows a confirmation modal before
// leaving the app. Gives users a chance to see the destination URL
// before navigating away. Closes if user clicks the dark backdrop.

window.openExitModal = function(url) {
  document.getElementById('target-url-display').textContent = url;
  document.getElementById('confirm-exit-btn').href = url;
  document.getElementById('link-exit-modal').style.display = 'flex';
};

window.closeExitModal = function() {
  document.getElementById('link-exit-modal').style.display = 'none';
};

// Close exit modal when clicking the dark backdrop
window.onclick = function(event) {
  const modal = document.getElementById('link-exit-modal');
  if (event.target === modal) window.closeExitModal();
};

// Opens the compose sheet — unlike other modals, keeps input enabled
// so the keyboard opens immediately when the modal appears.
function openInputModal() {
  if (window.history.state?.modal !== 'open') {
    history.pushState({ modal: 'open' }, '');
  }
  
  // Carry over whatever the dummy trigger is showing
  const triggerText = document.getElementById('inputTriggerPlaceholder')?.textContent;
  if (triggerText) DOM.input.placeholder = triggerText;

  DOM.inputModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  setTimeout(() => DOM.input.focus(), 400);
}

// Closes the compose sheet and restores scroll.
function closeInputModal() {
  if (window.history.state?.modal === 'open') {
    window.history.back();
  }
  DOM.inputModal.classList.add('hidden');
  document.body.style.overflow = '';
}

// Handles the browser back button for all modals.
// Strategy: always hide everything first, then selectively re-open
// based on the history state we land on.
// If state is 'open' it means the user backed into the chat list — reopen it.
// Otherwise run the caret killer: blur, clear selection, and flush the input
// so the mobile keyboard doesn't get stuck and swipe gestures re-enable.
window.addEventListener('popstate', (event) => {
  const dmModal = document.getElementById('dmModal');
  const chatModal = document.getElementById('chatModal');
  const profileModal = document.getElementById('profileModal');
  const commentModal = document.getElementById('commentModal');
  const state = event.state;

  // Hide all modals first
  [dmModal, chatModal, profileModal, commentModal, DOM.inputModal].forEach(m => m?.classList.add('hidden'));
  document.body.style.overflow = '';

  if (state?.modal === 'open') {
    chatModal?.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    renderChatList();
  } else {
    document.activeElement?.blur();
    window.getSelection()?.removeAllRanges();
    if (DOM.input) {
      DOM.input.disabled = true;
      setTimeout(() => {
        DOM.input.disabled = false;
      }, 50);
    }
  }
});

// ==========================================
//  8. SHARE SYSTEM
// ==========================================

// Returns the list of share platforms that support the post's character length.
// Each platform has a character limit — longer posts automatically hide
// platforms that can't fit the content (e.g. X drops off at 280 chars).
function getSmartShareButtons(text) {
  const urlToShare = window.location.href;
  const totalLength = (text ? text.length : 0) + urlToShare.length;

  const platforms = [
    {
      id: 'copy',
      limit: 999999,
      name: 'Copy Text',
      icon: '<span class="text-[14px] font-bold leading-none">📋</span>',
      classes: 'bg-slate-50 text-slate-600 hover:bg-slate-800 hover:border-slate-800 hover:text-white'
    },
    {
      id: 'x',
      limit: 280,
      name: 'X',
      icon: '<span class="text-[13px] font-bold leading-none">𝕏</span>',
      classes: 'bg-slate-50 text-slate-800 hover:bg-black hover:border-black hover:text-white'
    },
    {
      id: 'threads',
      limit: 500,
      name: 'Threads',
      icon: '<span class="text-[15px] font-sans font-bold leading-none mt-[1px]">@</span>',
      classes: 'bg-slate-50 text-slate-800 hover:bg-black hover:border-black hover:text-white'
    },
    {
      id: 'whatsapp',
      limit: 2000,
      name: 'WhatsApp',
      icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M13.601 2.326A7.854 7.854 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.933 7.933 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.898 7.898 0 0 0 13.6 2.326zM7.994 14.521a6.573 6.573 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.557 6.557 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592z"/></svg>',
      classes: 'bg-green-50 text-green-600 border-green-200 hover:bg-green-500 hover:border-green-500 hover:text-white'
    },
    {
      id: 'messenger',
      limit: 1000,
      name: 'Messenger',
      icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M0 7.76C0 3.301 3.493 0 8 0s8 3.301 8 7.76-3.493 7.76-8 7.76c-1.087 0-2.119-.199-3.072-.559L1.4 16l.84-3.525C1.173 11.53 0 9.735 0 7.76zm5.546-1.459-2.35 3.728c-.225.358.214.761.551.506l2.525-1.916a.48.48 0 0 1 .577-.002l2.152 1.628c.456.345 1.086.136 1.258-.419l1.614-3.695c.224-.356-.214-.76-.549-.506l-2.53 1.918a.48.48 0 0 1-.58.002L6.046 5.86c-.456-.345-1.087-.137-1.256.419z"/></svg>',
      classes: 'bg-blue-50 text-blue-500 border-blue-200 hover:bg-blue-500 hover:border-blue-500 hover:text-white'
    },
    {
      id: 'telegram',
      limit: 4000,
      name: 'Telegram',
      icon: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zM8.287 5.906c-.778.324-2.334.994-4.666 2.01-.378.15-.577.298-.595.442-.03.243.275.339.69.47l.175.055c.408.133.958.288 1.243.287.427-.001.826-.115 1.118-.348 1.325-1.054 2.189-1.728 2.593-2.022.287-.21.57-.18.463.15-.173.53-1.026 1.341-1.581 1.913-.393.407-.735.632-1.066.868-.344.246-.688.492-1.428 1.234.338.567.925.753 1.956 1.433.844.555 1.517.994 2.146 1.063.535.059.972-.218 1.109-.854.275-1.272.846-4.653 1.056-6.176.064-.46-.038-.853-.292-1.127-.376-.402-1.023-.427-1.397-.333z"/></svg>',
      classes: 'bg-sky-50 text-sky-500 border-sky-200 hover:bg-sky-500 hover:border-sky-500 hover:text-white'
    },
    {
      id: 'facebook',
      limit: 60000,
      name: 'Facebook',
      icon: '<span class="text-[14px] font-bold leading-none font-serif">f</span>',
      classes: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-700 hover:border-blue-700 hover:text-white'
    }
  ];

  return platforms.filter(p => totalLength <= p.limit);
}

// Shares a post to the selected platform.
// Strips all HTML tags and entities from the text before sharing
// so platforms receive clean plain text.
// Cleans up index.html from the URL so shared links look tidy.
// 'copy' writes to clipboard directly — all other platforms open
// a new window with the platform's share intent URL.
async function sharePost(text, platform) {

  // --- Strip HTML and decode entities ---
  const cleanText = text
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '...')
    .replace(/\s+/g, ' ')
    .trim();

  // --- Clean up URL ---
  let currentUrl = window.location.href;
  if (currentUrl.endsWith('/index.html')) {
    currentUrl = currentUrl.replace('/index.html', '/');
  } else if (currentUrl.endsWith('index.html')) {
    currentUrl = currentUrl.replace('index.html', '');
  }

  const urlText = encodeURIComponent(cleanText);
  const urlLink = encodeURIComponent(currentUrl);

  // --- Copy to clipboard ---
  if (platform === 'copy') {
    try {
      await navigator.clipboard.writeText(`${cleanText}\n\n${currentUrl}`);
      showToast("Copied to clipboard");
    } catch (err) {
      showToast("Manual copy required", "error");
    }
    return;
  }

  // --- Platform share URLs ---
  let url = '';
  switch (platform) {
    case 'x':
      url = `https://twitter.com/intent/tweet?text=${urlText}&url=${urlLink}`;
      break;
    case 'threads':
      url = `https://www.threads.net/intent/post?text=${urlText}%20${urlLink}`;
      break;
    case 'whatsapp':
      url = `https://wa.me/?text=${urlText}%20${urlLink}`;
      break;
    case 'telegram':
      url = `https://t.me/share/url?url=${urlLink}&text=${urlText}`;
      break;
    case 'messenger':
      url = `http://www.facebook.com/dialog/send?link=${urlLink}&app_id=${firebaseConfig.appId}&redirect_uri=${urlLink}`;
      break;
    case 'facebook':
      url = `https://www.facebook.com/sharer/sharer.php?u=${urlLink}&quote=${urlText}`;
      break;
  }

  if (url) window.open(url, '_blank', 'width=600,height=500,noopener,noreferrer');
}

// Toggles the share menu for a post open or closed.
// Ensures only one share menu can be open at a time — if a different
// menu is already open, it closes that one first before opening the new one.
// activeShareMenuId tracks the currently open menu so click-outside
// logic elsewhere in the file knows what to close.
window.toggleShare = function(event, menuId) {
  event.stopPropagation();
  const menu = document.getElementById(menuId);
  if (!menu) return;

  const isActive = menu.classList.contains('active');

  // Close any other open share menu first
  if (activeShareMenuId && activeShareMenuId !== menuId) {
    const oldMenu = document.getElementById(activeShareMenuId);
    if (oldMenu) oldMenu.classList.remove('active');
    const oldTrigger = oldMenu?.previousElementSibling;
    if (oldTrigger) oldTrigger.classList.remove('active');
  }

  if (isActive) {
    menu.classList.remove('active');
    event.currentTarget.classList.remove('active');
    activeShareMenuId = null;
  } else {
    menu.classList.add('active');
    event.currentTarget.classList.add('active');
    activeShareMenuId = menuId;
  }
};

// ==========================================
//  9.  DM & MESSAGING
// ==========================================

window.openDirectMessage = function(e, targetUserId, targetHandle, fromNotification = false) {
//	console.log("%c 🚀 STEP 1: openDirectMessage triggered!", "color: white; background: red; font-size: 16px; font-weight: bold;");
  //  console.log("📍 Target User:", targetUserId);
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
  
    // 1. DIRECT SWAP (Avoids the history.back conflict)
    const chatModal = document.getElementById('chatModal');
    const dmModal = document.getElementById('dmModal');
	const dmOverlay = document.getElementById('dmOverlay');
    
    if (chatModal) chatModal.classList.add('hidden'); // Hide Inbox
    if (dmModal) dmModal.classList.remove('hidden'); // Show DM
	if (dmOverlay) dmOverlay.classList.remove('hidden');
	
	if (!dmModal) {
        console.error("❌ ERROR: Could not find #dmModal in the HTML!");
        return;
    }
	
	const comingFromList = chatModal && !chatModal.classList.contains('hidden');
	
	// --- TRACK THE SOURCE ---
    history.pushState({ 
        modal: 'dm', 
        fromList: comingFromList 
    }, "");
    
    // Ensure background remains locked
    document.body.style.overflow = 'hidden';

    // 2. Setup IDs and Logic
    const myId = MY_USER_ID;
    const roomId = [myId, targetUserId].sort().join('--chat--');
	console.log(`%c 🔎 ROOM ID TRACE: [${MY_USER_ID}, ${targetUserId}].sort().join('--chat--') ===> ${roomId}`, "color: cyan; background: #002244; font-weight: bold; padding: 4px;");
	//console.log(`%c 🆔 STEP 2: Room ID generated: ${roomId}`, "color: yellow; background: black; font-size: 12px;");
    const title = document.getElementById('dmModalTitle');
	const displayIdentifier = (targetHandle && targetHandle !== 'undefined' && targetHandle !== '') 
        ? `@${targetHandle.toLowerCase()}` 
        : `ID:${targetUserId}`;
    const container = document.getElementById('dmMessagesContainer');
  
    if (title) {
        title.innerText = displayIdentifier;
        // Store the raw ID in a data attribute so sendMessage can find it
        title.setAttribute('data-target-id', targetUserId);
    }
    
    // 3. Set the Handshake UI
    if (container) {
	//	console.log("%c 🏗️ STEP 3: Setting Handshake UI...", "color: cyan; font-weight: bold;");
      container.innerHTML = `
        <div class="flex flex-col items-center text-center py-12">
          <div class="w-20 h-20 rounded-3xl bg-brand-50 flex items-center justify-center text-brand-500 mb-6 border border-brand-100 shadow-sm animate-pulse">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
            </svg>
          </div>
          <div class="px-3 py-2 bg-slate-50 border border-slate-100 rounded-xl mb-4 max-w-[90%]">
            <p class="text-[9px] text-slate-400 uppercase font-black tracking-widest mb-1">Secure Channel ID</p>
            <p class="text-[11px] font-mono text-slate-600 break-all leading-relaxed">${roomId}</p>
          </div>
          <p class="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">P2P Handshake Verified</p>
        </div>`;
    }
	
	// 4. Render real messages if they exist
   // console.log(`%c 🔍 STEP 4: Calling window.renderMessages('${roomId}')...`, "color: white; background: green; font-weight: bold;");
    
    if (typeof window.renderMessages !== 'function') {
        console.error("%c ❌ ERROR: window.renderMessages is NOT a function!", "color: white; background: red; font-size: 18px;");
    } else {
        window.renderMessages(roomId);
		window.clearUnread(roomId);
	}
};

// 2. THE CLOSE FUNCTION
window.closeDMModal = function(shouldFocus = false) {
  const modal = document.getElementById('dmModal');
  const overlay = document.getElementById('dmOverlay');
  console.log("%c 🔒 closeDMModal triggered", "color: white; background: #6366f1; padding: 2px 6px;");

  if (modal && !modal.classList.contains('hidden')) {
    modal.classList.add('hidden');
    if (overlay) overlay.classList.add('hidden');
    console.log("%c ✅ DM Modal hidden", "color: #10b981;");
    
    // Restore scrolling
    document.body.style.overflow = '';

    // ✅ Refresh inbox if it's open behind the DM
    const chatModal = document.getElementById('chatModal');
    if (chatModal && !chatModal.classList.contains('hidden')) {
        console.log("%c 📋 chatModal is open — calling renderChatList()", "color: #f59e0b;");
        renderChatList();
    } else {
        console.log("%c ⏭️ chatModal not open — skipping renderChatList()", "color: #94a3b8;");
    }

    // Handle History
    console.log("%c 🕰️ history.state:", "color: #38bdf8;", history.state);
    if (history.state && (history.state.modalOpen || history.state.modal === 'open' || history.state.modal === 'dm')) {
      console.log("%c ⬅️ Calling history.back()", "color: #f97316;");
      history.back();
    } else {
      console.log("%c ⏭️ No matching history state — skipping history.back()", "color: #94a3b8;");
    }

    // THE GLOBAL FOCUS FIX
    if (DOM.input) {
      DOM.input.disabled = false;
      if (shouldFocus) {
        setTimeout(() => {
          console.log("%c 🎯 Focusing input", "color: #a3e635;");
          DOM.input.focus();
        }, 50);
      } 
    }
  } else {
    console.warn("⚠️ closeDMModal: modal already hidden or not found — aborting.");
  }
};

// 3. SECURE LISTENERS
document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('dmOverlay');
  if (overlay) {
    overlay.addEventListener('click', () => window.closeDMModal());
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') window.closeDMModal();
  });
  
});

/**
 * MAIN SEND FUNCTION
 * Triggered by the Send Button or 'Enter' key
 */
window.sendMessage = async function() {
    const input = document.getElementById('dmInput');
    const container = document.getElementById('dmMessagesContainer');
    
    // 1. Grab raw text and immediately sanitize it using your helper
    const rawText = input.value.trim();
    const messageText = getSafeText(rawText);
    
    // Safety checks: if empty after sanitization, stop.
    if (!messageText) return;
    
	const titleEl = document.getElementById('dmModalTitle');
    const targetUserId = titleEl.getAttribute('data-target-id');
	const myHandle = localStorage.getItem('freeform_username') || '';
    if (!targetUserId) return;

    const roomId = [MY_USER_ID, targetUserId].sort().join('--chat--');
	console.log(`%c 🔎 ROOM ID TRACE: [${MY_USER_ID}, ${targetUserId}].sort().join('--chat--') ===> ${roomId}`, "color: cyan; background: #002244; font-weight: bold; padding: 4px;");

    // Create the Message Object with the sanitized text
    const messageData = {
        id: crypto.randomUUID(),
        senderId: MY_USER_ID,
		senderHandle: myHandle,
        receiverId: targetUserId,
        roomId: roomId,
        text: messageText, // Now safe from injection
        timestamp: Date.now(),
        status: 'delivered' 
    };

    // STEP 1: Save to local storage (Sender side)
    window.saveToLocal(roomId, messageData);

    // STEP 2: Clear UI Input and Refresh
    input.value = '';
    window.renderMessages(roomId);

    // STEP 3: Push to Supabase Relay
    try {
        const { error } = await _supabase
            .from('dm_relay')
            .insert([{
                id: messageData.id,
                room_id: roomId,
                receiver_id: targetUserId,
				author_handle: myHandle,
                payload: messageData,
				supabase_uid: (await _supabase.auth.getUser()).data.user?.id
            }]);

        if (error) throw error;
    } catch (err) {
        console.error("Relay failed:", err.message);
        // Optional: Trigger a UI "retry" state or toast here
    }
};

/**
 * STEP 1 helper: Save to LocalStorage
 */
window.saveToLocal = function(roomId, msgObj) {
    // We use the roomId directly as the key now (e.g., "userA--chat--userB")
    const key = roomId; 
    
    let history = [];
    try {
        history = JSON.parse(localStorage.getItem(key) || '[]');
    } catch (e) {
        console.error("Malformed JSON in local storage, resetting history.");
        history = [];
    }
    
    // Avoid duplicates (important for the sync step)
    if (!history.find(m => m.id === msgObj.id)) {
        history.push(msgObj);
        localStorage.setItem(key, JSON.stringify(history));
        console.log(`💾 Saved to LocalStorage: ${key}`);
    }
};

/**
 * UI RENDERER
 * Pulls from LocalStorage and displays in the modal
 */
window.renderMessages = function(roomId) {
  //  console.log(`%c 📥 renderMessages started for: ${roomId}`, "color: orange; font-weight: bold;");
    
    // Check if the container exists
    const container = document.getElementById('dmMessagesContainer');
    if (!container) return;

    // --- THE FIX: Remove 'secure_chat_' prefix ---
    // We want the key to match exactly what's in LocalStorage: "user1--chat--user2"
    const history = JSON.parse(localStorage.getItem(roomId) || '[]');
    
 //   console.log("📦 Loaded History Count:", history.length);

    // 1. If no history exists, STOP HERE so the "Splash Screen" stays visible
    if (history.length === 0) {
        console.warn("⚠️ No messages found in LocalStorage for room:", roomId);
        return;
    }

    // 2. If history exists, render the messages
    container.innerHTML = history.map(msg => {
    const isMe = msg.senderId === MY_USER_ID;
	// Process the text to catch links and turn them into pretty pills
        const processedText = renderSmartText(msg.text);
    return `
        <div class="flex ${isMe ? 'justify-end' : 'justify-start'} mb-4 w-full px-2">
            <div class="max-w-[85%] md:max-w-[75%] rounded-2xl px-4 py-2 ${
                isMe 
                ? 'bg-brand-500 text-white rounded-tr-none' 
                : 'bg-slate-100 lg:bg-slate-200 text-slate-800 rounded-tl-none'
            }">
                <div class="flow-root">
                    <p class="text-sm inline break-words leading-normal">
                        ${processedText}&nbsp;
                        <span class="float-right mt-2 ml-4 text-[10px] opacity-70 leading-none">
                            ${new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </span>
                    </p>
                </div>
            </div>
        </div>
    `;
}).join('');

    // 3. Auto-scroll to the latest messagee
    container.scrollTop = container.scrollHeight;
};

// 4. ATTACH LISTENERS
document.addEventListener('DOMContentLoaded', () => {
    const sendBtn = document.getElementById('sendDMBtn');
    const dmInput = document.getElementById('dmInput');

    if (sendBtn) sendBtn.onclick = window.sendMessage;

    if (dmInput) {
        dmInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                window.sendMessage();
            }
        });
    }
});

window.renderChatList = function() {
    const listContainer = document.getElementById('chatListContainer');
    if (!listContainer) return;

    const chats = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        
        // Only look for our specific P2P room format
        if (key.includes('--chat--')) { 
            try {
                const history = JSON.parse(localStorage.getItem(key));
                if (history && Array.isArray(history) && history.length > 0) {
                    const lastMsg = history[history.length - 1];
                    
                    // The key IS the roomId now. No replacement needed.
                    const roomId = key; 
                    
                    const participants = roomId.split('--chat--');
                    const otherUser = participants.find(id => id !== MY_USER_ID);

                    // Only push if we successfully identified the other person
                    if (otherUser) {
						let otherHandle = "";
                        for (let j = history.length - 1; j >= 0; j--) {
                            if (history[j].senderId === otherUser && history[j].senderHandle) {
                                otherHandle = history[j].senderHandle;
                                break; // Found the latest handle, stop looking
                            }
                        }
                        chats.push({
                            roomId: roomId,
                            otherUser: otherUser,
							otherHandle: otherHandle,
                            lastText: lastMsg.text || "",
                            timestamp: lastMsg.timestamp || Date.now()
                        });
                    }
                }
            } catch (e) {
                console.error("Error parsing chat history for key:", key, e);
            }
        }
    }

    // Sort: Newest messages at the top
    chats.sort((a, b) => b.timestamp - a.timestamp);

    if (chats.length === 0) {
        listContainer.innerHTML = `
            <div class="flex flex-col items-center justify-center py-20 text-slate-400">
                <p class="text-sm font-medium">No secure messages yet.</p>
                <p class="text-[10px] mt-1 opacity-60 uppercase tracking-widest">End-to-End Encrypted</p>
            </div>`;
        return;
    }

    listContainer.innerHTML = chats.map(chat => {
	
	const stencil = window.getStencilData(chat.otherUser);
    const initials = chat.otherUser.substring(0, 2).toUpperCase();

// Handle vs ID Display Logic
    const displayName = chat.otherHandle ? `@${chat.otherHandle.toLowerCase()}` : `ID:${chat.otherUser.slice(0,8)}`;
	
    const words = (chat.lastText || "").split(' ');
    const previewText = words.length > 8 
        ? words.slice(0, 8).join(' ') + '...' 
        : chat.lastText;
		
	// ── Unread logic ──────────────────────────────
        const unread = window.getUnreadCount(chat.roomId);
        const previewClass = unread > 0
            ? 'text-xs text-gray-900 font-semibold truncate pr-4'
            : 'text-xs text-gray-500 truncate pr-4';
        const unreadBadge = unread > 0
            ? `<span class="min-w-[20px] h-5 bg-brand-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                   ${unread > 99 ? '99+' : unread}
               </span>`
            : `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
               </svg>`;	

    return `
        <div onclick="window.openDirectMessage(event, '${chat.otherUser}', '${chat.otherHandle || ''}')" 
             class="group flex items-center gap-4 px-4 py-4 border-b border-gray-50 hover:bg-slate-50 cursor-pointer transition-colors active:bg-slate-100">
            
            <div class="stencil-avatar w-12 h-12 flex-shrink-0 flex items-center justify-center ${stencil.radius} shadow-sm overflow-hidden relative"
             style="background-color: ${stencil.color}">
            
            <svg class="w-7 h-7 text-white fill-current drop-shadow-sm" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="${stencil.path}" />
            </svg>

            <span class="initials absolute text-[10px] font-bold text-white uppercase tracking-tighter opacity-0 group-hover:opacity-100 transition-opacity">
                ${initials}
            </span>
        </div>

            <div class="flex-1 min-w-0">
                <div class="flex justify-between items-baseline mb-0.5">
                    <h4 class="font-bold text-gray-900 text-sm truncate">${displayName}</h4>
                    <span class="text-[10px] text-gray-400">
                        ${new Date(chat.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </span>
                </div>
                <p class="text-xs text-gray-500 truncate pr-4">${previewText}</p>
            </div>

            <div class="flex items-center gap-2">
                <button onclick="window.deleteConversation(event, '${chat.roomId}')" 
                        class="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-100 active:scale-90">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                </button>
                ${unreadBadge}
            </div>
        </div>
    `;
}).join('');
};

// Helper to get a unique but consistent icon/shape based oonn User ID
window.getStencilData = function(userId) {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
        hash = userId.charCodeAt(i) + ((hash << 5) - hash);
    }
    hash = Math.abs(hash);

    const icons = [
        'M12 2a9 9 0 0 0-9 9v11l3-3 3 3 3-3 3 3 3-3 3 3V11a9 9 0 0 0-9-9zm-3 10a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm6 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4z', // Ghost
        'M12 3L2 18h20L12 3zm0 5l5 9H7l5-9z', // Wizard
        'M5 16l-2-11 5.5 5L12 4l3.5 6 5.5-5-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z', // Crown
        'M7 2v11h3v9l7-12h-4l4-8z', // Bolt
        'M18.8 15C17 13.5 16 11 16 8.5V8c0-2.2-1.8-4-4-4S8 5.8 8 8v.5c0 2.5-1 5-2.8 6.5C4.5 15.6 4 16.2 4 17c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2 0-.8-.5-1.4-1.2-2zM12 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4z', // Santa
        'M12 2c-4.4 0-8 3.6-8 8 0 2.2 1.8 4 4 4h1l-1 4 4-2 4 2-1-4h1c2.2 0 4-1.8 4-4 0-4.4-3.6-8-8-8zm-3 8a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm6 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z', // Dragon
        'M12 2c-4.4 0-8 3.1-8 7 0 2.5 1.8 4.6 4.3 6l-.3 3c0 .6.4 1 1 1h6c.6 0 1-.4 1-1l-.3-3c2.5-1.4 4.3-3.5 4.3-6 0-3.9-3.6-7-8-7zm-3 8a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm6 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4z', // Skull
        'M21 16.5C21 16.88 20.79 17.21 20.47 17.38L12.57 21.82C12.41 21.94 12.21 22 12 22C11.79 22 11.59 21.94 11.43 21.82L3.53 17.38C3.21 17.21 3 16.88 3 16.5V7.5C3 7.12 3.21 6.79 3.53 6.62L11.43 2.18C11.59 2.06 11.79 2 12 2C12.21 2 12.41 2.06 12.57 2.18L20.47 6.62C20.79 6.79 21 7.12 21 7.5V16.5Z', // Robot
        'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z', // Eye
        'M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z', // Key
        'M12 2a7 7 0 0 0-7 7c0 2.3 1.1 4.3 2.8 5.6L6 22h2l1-3h6l1 3h2l-1.8-7.4c1.7-1.3 2.8-3.3 2.8-5.6a7 7 0 0 0-7-7zM9 9a1 1 0 1 1 2 0 1 1 0 0 1-2 0zm5 1a1 1 0 1 1 0-2 1 1 0 0 1 0 2z', // Alien
        'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z' // Shield
    ];

    // Generate a unique HSL color based on the hash
    // We keep saturation and lightness consistent so it stays "on brand"
    const hue = hash % 360;
    const color = `hsl(${hue}, 65%, 45%)`;

    return {
        path: icons[hash % icons.length],
        radius: ['rounded-none', 'rounded-xl', 'rounded-full'][hash % 3],
        color: color
    };
};

window.deleteConversation = function(event, roomId) {
    // 1. Prevent the chat from opening
    event.stopPropagation();
    event.preventDefault();

    // 2. Extract the username for a personalized message
    const otherUser = roomId.split('--chat--').find(id => id !== MY_USER_ID);

    // 3. Trigger the Pretty Dialog
    showDialog(
        "Delete Chat?", 
        `All messages with @${otherUser} will be removed from this device.`, 
        "Delete", 
        () => {
            // This code runs ONLY if the user clicks the Red "Delete" button
            
            // Perform Deletion
            localStorage.removeItem(roomId);
			window.clearUnread(roomId);

            // Clear active view if it's the same room
            const container = document.getElementById('dmMessagesContainer');
            if (container && window.currentChatRoomId === roomId) {
                container.innerHTML = '';
                // Optional: Close the DM modal if you want to kick them back to the list
                // window.closeDMModal(); 
            }

            // Refresh the List
            window.renderChatList();

            // 4. Show the Success Toast
            showToast("Conversation deleted");
            
           console.log(`🗑️ Conversation ${roomId} deleted via custom dialog.`);
        }
    );
};

window.syncIncomingMessages = async function() {
   // console.log("🔍 Sync: Checking 'dm_relay' for messages...");

    // 1. Fetch messages where I am the receiver
    const { data, error } = await _supabase
        .from('dm_relay')
        .select('*')
        .eq('receiver_id', MY_USER_ID);

    if (error) {
        console.error("❌ Sync Error:", error.message);
        return;
    }

    if (!data || data.length === 0) {
      //  console.log("📥 Sync: No new messages found.");
        return;
    }
	
	let latestHandle = null;
    let senderOfLatestHandle = null;

  //  console.log(`📩 Sync: Found ${data.length} messages. Processing...`);

    for (const row of data) {
        const msg = row.payload;
        
        // Use the raw roomId directly from the message payload
        const roomId = msg.roomId;
		
		// Capture handle from the relay row (author_handle) or payload
        if (row.author_handle) {
            latestHandle = row.author_handle;
            senderOfLatestHandle = msg.senderId;
        }

    //    console.log(`💾 Sync: Saving to local storage for room: ${roomId}`);
        window.saveToLocal(roomId, msg);
		
		// ✅ ADD THIS: Only count as unread if this chat isn't currently open
    const openModal = document.getElementById('dmModal');
    const openTitle = document.getElementById('dmModalTitle');
    const currentOpenRoom = openTitle
        ? [MY_USER_ID, openTitle.getAttribute('data-target-id')].sort().join('--chat--')
        : null;

    const chatIsOpen = openModal && !openModal.classList.contains('hidden') && currentOpenRoom === roomId;
    if (!chatIsOpen) {
        window.incrementUnread(roomId);
    }
    // ✅ END ADD
        
        // 2. Delete from Supabase immediately (Ephemeral)
        const { error: delError } = await _supabase
            .from('dm_relay')
            .delete()
            .eq('id', row.id);
        
        if (delError) console.error("⚠️ Sync: Cleanup failed for ID:", row.id);
    }
    
    // 3. UI Auto-Refresh
    const dmModal = document.getElementById('dmModal');
    const chatModal = document.getElementById('chatModal');

    // If the DM window is open, refresh the messages
    if (dmModal && !dmModal.classList.contains('hidden')) {
        const title = document.getElementById('dmModalTitle');
		const targetUserId = title.getAttribute('data-target-id');
        if (targetUserId) {
			if (senderOfLatestHandle === targetUserId && latestHandle) {
                title.innerText = `@${latestHandle.toLowerCase()}`;
            }
            const currentRoomId = [MY_USER_ID, targetUserId].sort().join('--chat--');
			console.log(`%c 🔄 Syncing Live Room: ${currentRoomId}`, "color: #10b981; font-weight: bold;");
            window.renderMessages(currentRoomId);
        }
    }

    // If the Inbox list is open, refresh the list
    if (chatModal && !chatModal.classList.contains('hidden')) {
        renderChatList();
    }
    
   // console.log("✅ Sync: All messages processed and UI updated.");
};

// ==========================================
//  10. NOTIFICATIONS & UNREAD
// ==========================================

const UNREAD_KEY = 'unread_counts';

function getUnreadMap() {
    try { return JSON.parse(localStorage.getItem(UNREAD_KEY) || '{}'); }
    catch { return {}; }
}

function saveUnreadMap(map) {
    localStorage.setItem(UNREAD_KEY, JSON.stringify(map));
}

// Call when a new message arrives for a room that isn't currently open
window.incrementUnread = function(roomId) {
    const map = getUnreadMap();
    map[roomId] = (map[roomId] || 0) + 1;
    saveUnreadMap(map);
    window.updateUnreadBadge();
};

// Call when a user opens a conversation
window.clearUnread = function(roomId) {
    const map = getUnreadMap();
    delete map[roomId];
    saveUnreadMap(map);
    window.updateUnreadBadge();
};

// Returns unread count for a specific room (used in chat list UI)
window.getUnreadCount = function(roomId) {
    return getUnreadMap()[roomId] || 0;
};

// Returns total unread across ALL rooms
window.getTotalUnread = function() {
    return Object.values(getUnreadMap()).reduce((sum, n) => sum + n, 0);
};

// ── Nav Badge Renderer ────────────────────────────────────────────────────
window.updateUnreadBadge = function() {
    const badge = document.querySelector('#navMessages .absolute');
    if (!badge) return;

    const total = window.getTotalUnread();

    if (total === 0) {
        badge.className = 'absolute top-0 right-0 w-3 h-3 border-2 border-white rounded-full hidden';
        badge.textContent = '';
        return;
    }

    if (total === 1) {
        // Plain dot — matches your original design
        badge.textContent = '';
        badge.className = 'absolute top-0 right-0 w-3 h-3 bg-brand-500 border-2 border-white rounded-full';
    } else {
        // Count badge
        badge.textContent = total > 99 ? '99+' : total;
        badge.className = 'absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-brand-500 border-2 border-white rounded-full text-white text-[9px] font-bold flex items-center justify-center px-[3px]';
    }
};

window.enableNotifications = async function() {
    const permission = await Notification.requestPermission();
   if (permission !== 'granted') return console.log("Permission denied");
    const registration = await navigator.serviceWorker.ready;
    const PUBLIC_VAPID_KEY = 'BNtfmLDVxafsxgDlp8882ZXfuWY7jbgUhtcN69himY5iUkZ2Kw4MmnZlhrHEcFBe3n-tAsGjJtH9Jfrp5VChG1U';
    const convertedKey = urlBase64ToUint8Array(PUBLIC_VAPID_KEY);
    try {
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: convertedKey
        });
        // We use the MY_USER_ID that was set by getOrCreateUserId() at the start
        const { data: { user } } = await _supabase.auth.getUser();

if (!user) {
  console.error("Supabase auth not ready");
  return;
}

const { error } = await _supabase
    .from('user_push_tokens') 
    .upsert({ 
        user_id: MY_USER_ID, 
        token: JSON.stringify(subscription),
        supabase_uid: user.id
    });
        if (error) throw error;
    //    console.log("🔔 Notifications Linked for user:", MY_USER_ID);
    } catch (err) {
        console.error("Subscription failed:", err);
    }
}

window.subscribeToPush = async function() {
    const registration = await navigator.serviceWorker.ready;
    
    // Check if they already have a subscription
    let subscription = await registration.pushManager.getSubscription();
    
    if (!subscription) {
        // Replace with your real VAPID Public Key
        const PUBLIC_VAPID_KEY = 'BNtfmLDVxafsxgDlp8882ZXfuWY7jbgUhtcN69himY5iUkZ2Kw4MmnZlhrHEcFBe3n-tAsGjJtH9Jfrp5VChG1U';
        
        subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: PUBLIC_VAPID_KEY
        });
    }

    // SAVE THIS TO SUPABASE
    // We need to know which token belongs to which user
    const { error } = await _supabase
        .from('profiles') // or a new 'push_subscriptions' table
        .update({ push_token: JSON.stringify(subscription) })
        .eq('id', MY_USER_ID);

   // if (!error) console.log("🔔 Push Subscription synced to Supabase!");
};

// --- NOTIFICATION SETUP ---
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

// ==========================================
//  11. UTILITIES
// ==========================================

function getSafeText(input) {
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: ['#text'], // No HTML allowed (Nuclear Option)
    ALLOWED_ATTR: [], // No attributes (onclick, etc) allowed
    KEEP_CONTENT: true // Keeps the text inside the tags, just removes the tags themselves
  });
}

function showToast(message, type = "success") {
  const container = document.getElementById('toast-container');
  if (!container) return;

  // Only checks for actual elements, not whitespace/text nodes
  if (container.children.length > 0) {
    return;
  }

  const toast = document.createElement('div');
  toast.className = `toast-enter toast-glass pointer-events-auto px-6 py-2.5 rounded-full text-[13px] font-bold mt-3 text-center`;
  toast.innerHTML = `<span>${message}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.replace('toast-enter', 'toast-exit');
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

function showDialog(title, message, confirmText, onConfirm) {
  const overlay = document.getElementById('custom-dialog');
  const titleEl = document.getElementById('dialog-title');
  const msgEl = document.getElementById('dialog-msg');
  const confirmBtn = document.getElementById('dialog-confirm-btn');

  // Check if elements exist
  if (!overlay || !titleEl || !msgEl || !confirmBtn) return;

  // 1. Set Content
  titleEl.textContent = title;
  msgEl.textContent = message;
  confirmBtn.textContent = confirmText || "Confirm";

  // 2. VIBE CHECK (Text Colors)
  const isDestructive = confirmText && confirmText.toLowerCase().includes('delete');
  
  // Reset base classes
  confirmBtn.className = "w-full py-3.5 font-bold border-t border-slate-100 hover:bg-slate-50 transition-colors outline-none";
  
  if (isDestructive) {
    // 🚨 RED TEXT (Delete)
    confirmBtn.classList.add('text-red-500');
  } else if (confirmText === "Okay" || confirmText === "Understood") {
    // ⚫️ SLATE TEXT (Info / Spam)
    confirmBtn.classList.add('text-slate-700');
  } else {
    // 🔵 BRAND BLUE TEXT (Publish)
    confirmBtn.classList.add('text-brand-600');
  }

  // 3. Show
  overlay.classList.remove('hidden');
  requestAnimationFrame(() => {
    overlay.classList.add('dialog-open');
  });

  // 4. Setup Button - FIX HERE
  const newBtn = confirmBtn.cloneNode(true);
  confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);
  
  newBtn.onclick = () => {
    
    // Store current dialog state
    const wasOpen = !overlay.classList.contains('hidden');
    
    // Run the callback
    onConfirm();
    
    // Only close if no new dialog was opened
    // Check with a small delay to let any new dialog setup
    setTimeout(() => {
      // If the dialog is still the same one (not replaced by a new dialog)
      if (wasOpen && overlay.querySelector('#dialog-confirm-btn') === newBtn) {
        closeDialog();
      }
    }, 10);
  };
}

function closeDialog() {
  const overlay = document.getElementById('custom-dialog');
  
  if (!overlay) return;
  
  overlay.classList.remove('dialog-open'); 
  
  setTimeout(() => {
    overlay.classList.add('hidden');
  }, 150); 
}

window.showDialog = showDialog;
window.closeDialog = closeDialog;

function checkSpamGuard(newContent) {
  const COOLDOWN_MINUTES = 30;
  
  let history = JSON.parse(localStorage.getItem('spam_guard')) || {
    lastContent: '',
    repeatCount: 0,
    jailReleaseTime: 0
  };
  const now = Date.now();
  if (now < history.jailReleaseTime) {
    let minutesLeft = Math.ceil((history.jailReleaseTime - now) / 60000);
    
    showDialog(
      "Penalty Box ❄️",
      `You are currently blocked from posting. Please wait ${minutesLeft} more minutes.`,
      "Okay",
      () => {}
    );
    return false;
  }
  if (newContent === null) return true;
  if (newContent === history.lastContent) {
    history.repeatCount++; 
  } else {
    history.lastContent = newContent;
    history.repeatCount = 0; 
  }

  if (history.repeatCount >= 2) { 
    history.jailReleaseTime = now + (COOLDOWN_MINUTES * 60 * 1000);
    localStorage.setItem('spam_guard', JSON.stringify(history));
    showDialog(
      "Spam Detected 🚨",
      "You posted the exact same thing 3 times. You are taking a 30-minute break.",
      "Understood",
      () => {} 
    );
    return false;
  }
  localStorage.setItem('spam_guard', JSON.stringify(history));
  return true; 
}

async function updateLocalPostWithServerData(postId, serverCommentCount = null, serverLikeCount = null) {
  try {
    // 🚦 TRAP FIX: Explicitly check for null/undefined so 0 doesn't trigger a fetch
    let needsFetch = (serverCommentCount === null || serverLikeCount === null);
    
    let finalComments = serverCommentCount;
    let finalLikes = serverLikeCount;

    if (needsFetch) {
		console.log(`[Storage] 🔍 No data provided for ${postId}, fetching from Supabase...`);
      const { data, error } = await _supabase
        .from('posts')
        .select('like_count, comment_count')
        .eq('id', postId)
        .maybeSingle();

      if (error || !data) {
        console.error(`[Storage] ❌ Fetch failed for ${postId}`, error);
        return; 
      }
	 
      finalComments = data.comment_count;
      finalLikes = data.like_count;
    }

    // 💾 STORAGE LOGIC
    let posts = JSON.parse(localStorage.getItem('freeform_v2')) || [];
    let updated = false;

    posts = posts.map(p => {
      if (p.firebaseId === postId || p.id === postId) {
        // 🛠️ TYPE FIX: Force both to Numbers to ensure the comparison is accurate
        const currentLocalLikes = Number(p.likeCount) || 0;
        const currentLocalComments = Number(p.commentCount) || 0;
        const incomingLikes = Number(finalLikes) || 0;
        const incomingComments = Number(finalComments) || 0;

        if (currentLocalComments !== incomingComments || currentLocalLikes !== incomingLikes) {
			
			console.log(`[Storage] 🔄 Syncing Post ${postId}:
            Likes: ${currentLocalLikes} -> ${incomingLikes}
            Comments: ${currentLocalComments} -> ${incomingComments}`);
			
          p.commentCount = incomingComments;
          p.likeCount = incomingLikes;
          updated = true;
        }
      }
      return p;
    });

    if (updated) {
      localStorage.setItem('freeform_v2', JSON.stringify(posts));
      // Only refresh the heavy UI if we're actually on that tab
	  console.log(`[Storage] ✅ LocalStorage updated for ${postId}`);
      if (currentTab === 'private') {
		  console.log(`[UI] 🏎️ Private tab active, re-rendering batch...`);
        allPrivatePosts = posts.slice().reverse();
        renderPrivateBatch();
      }
    }
  } catch (error) {
    console.error('Update local post error:', error);
  }
}

// ─── TRANSLATION MODULE ───────────────────────────────────────────────
var Translator = (function() {
  const WORKER_URL = 'https://freeform-translate.myfreeformarchive.workers.dev';
  const STORAGE_KEY = 'freeform_lang';
  const supportedLangs = [
  'AR', 'BG', 'CS', 'DA', 'DE', 'EL', 'EN', 'ES', 'ET', 'FI', 
  'FR', 'HU', 'ID', 'IT', 'JA', 'KO', 'LT', 'LV', 'NB', 'NL', 
  'PL', 'PT', 'RO', 'RU', 'SK', 'SL', 'SV', 'TR', 'UK', 'VI', 'ZH'
];
  
  let currentLang = null; // lazy — not set until first use
  let cache = {};

  // Called once, after getOrCreateUserId() has run
  function init() {
  const storedLang = localStorage.getItem(STORAGE_KEY);
  if (storedLang) {
    currentLang = storedLang;
  } else {
    const language = localStorage.getItem('freeform_language') || 'en'; // 👈 updated
    const baseCode = language.toUpperCase();

    currentLang = (baseCode === 'EN' || !supportedLangs.includes(baseCode))
                  ? 'EN'
                  : baseCode;
  }
  console.log(`🌐 Translator initialized — target: ${currentLang}`);
}

  async function translateText(text) {
    if (!text?.trim()) return text;
    if (currentLang === 'EN') return text;
    if (cache[text]) return cache[text];
    try {
      const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts: [text], targetLang: currentLang })
      });
      const data = await res.json();
      const translated = data.translations?.[0] ?? text;
      cache[text] = translated;
      return translated;
    } catch (err) {
      console.error('Translation error:', err);
      return text;
    }
  }

  async function translateBatch(texts) {
    if (currentLang === 'EN') return texts;
    const uncached = texts.filter(t => !cache[t]);
    if (uncached.length > 0) {
      try {
        const res = await fetch(WORKER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texts: uncached, targetLang: currentLang })
        });
        const data = await res.json();
        uncached.forEach((t, i) => {
          cache[t] = data.translations?.[i] ?? t;
        });
      } catch (err) {
        console.error('Translation batch error:', err);
      }
    }
    return texts.map(t => cache[t] ?? t);
  }

  function setLang(lang) {
    currentLang = supportedLangs.includes(lang) ? lang : 'EN';
    localStorage.setItem(STORAGE_KEY, currentLang);
  }

  function getLang() { return currentLang; }

  return { init, translateText, translateBatch, setLang, getLang };
})();
console.log("📦 Translator module is now fully defined and ready.");

function updateThemeSelectionUI(activeKey) {
    document.querySelectorAll('.theme-btn').forEach(btn => {
        if (btn.dataset.theme === activeKey) {
            // Add a "ring" and a checkmark-like border to show it's selected
            btn.classList.add('ring-2', 'ring-slate-400', 'ring-offset-2', 'border-white');
        } else {
            btn.classList.remove('ring-2', 'ring-slate-400', 'ring-offset-2', 'border-white');
        }
    });
}

const themes = {
  lavender:   '#9D60FF',  // brand
  bright:     '#D4BCFF',  // soft pastel — the "light" 
  deep:       '#2D1B69',  // rich dark   — the "dark"
  dusk:       '#7C6AE8',  // purple leaning blue
  bloom:      '#B96FD8',  // purple leaning pink
  slate:      '#4A3F6B',  // muted, grounded
  mist:       '#C8B8F0',  // airy, quiet
  mauve:      '#8B6E9A',  // most silent
};

// 3. Apply Theme Function
// This takes a hex color and generates the variations 
function applyTheme(colorKey) {
    const primaryColor = themes[colorKey];
    if (!primaryColor) return;

    // We only need to set ONE variable now! 
    // CSS color-mix handles all the other shades (50, 100, 600, etc.)
    document.documentElement.style.setProperty('--brand-primary', primaryColor);
	
	// 2. ✅ ADD THIS: Update the Status Bar live
    const metaTag = document.querySelector('meta[name="theme-color"]');
    if (metaTag) {
        metaTag.setAttribute('content', primaryColor);
    }
    
    // Save preference
    localStorage.setItem('selected_theme', colorKey);
    // Optional: Visual feedback for the active button
    updateThemeSelectionUI(colorKey);
}

// 4. Build Theme Grid UI
function renderThemeGrid() {
    const grid = document.getElementById('themeGrid');
    if (!grid) return;
    grid.innerHTML = ''; // Clear existing to prevent duplicates

    Object.keys(themes).forEach(key => {
        const btn = document.createElement('button');
        // Added 'theme-btn' class for easy tracking
        btn.className = `theme-btn w-full aspect-square rounded-2xl border-4 border-transparent shadow-sm transition-all active:scale-95 cursor-pointer hover:scale-105`;
        btn.style.backgroundColor = themes[key];
        btn.dataset.theme = key;
        
        btn.onclick = () => applyTheme(key);
        grid.appendChild(btn);
    });
}

// 5. Initialize
function initProfileAndTheme() {
    setupProfile();
    renderThemeGrid();
    
    const savedTheme = localStorage.getItem('selected_theme') || 'lavender';
    applyTheme(savedTheme);
}

function setRandomPlaceholder() {
  const phrases = [
    "What's on your mind?", "Share your ideas...", "What's the vibe today?",
    "Capture a thought...", "Everything starts with a note...",
    "Unfinished thoughts welcome...", "Notes for your future self..."
  ];
  const phrase = phrases[Math.floor(Math.random() * phrases.length)];
  DOM.input.placeholder = phrase;
  const trigger = document.getElementById('inputTriggerPlaceholder');
  if (trigger) trigger.textContent = phrase;
}

async function resetAppCompletely() {
  const toastContainer = document.getElementById('toast-container');

  showDialog(
    "Reset Local Data", 
    "This will wipe your ID and settings from this device. NOTE: This does NOT delete posts or comments already sent to the cloud; it only resets your local app state.", 
    "Delete Local Data", // Still contains 'Delete' to trigger your red styling
    async () => {
      try {
        showToast("Wiping local data...", "warning");

        // --- THE SYSTEM WIPE ---
        localStorage.clear();
        sessionStorage.clear();

        const cookies = document.cookie.split(";");
        for (let i = 0; i < cookies.length; i++) {
          const cookie = cookies[i];
          const eqPos = cookie.indexOf("=");
          const name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie;
          document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
        }

        const dbs = await indexedDB.databases();
for (const db of dbs) {
  await new Promise(resolve => {
    const req = indexedDB.deleteDatabase(db.name);
    req.onsuccess = () => { console.log(`🗑️ Deleted IDB: ${db.name}`); resolve(); };
    req.onerror = () => { console.warn(`⚠️ Failed to delete IDB: ${db.name}`); resolve(); };
    req.onblocked = () => { console.warn(`⏳ IDB blocked: ${db.name}`); resolve(); };
  });
}

        if ('caches' in window) {
          const cacheNames = await caches.keys();
          for (const name of cacheNames) {
            await caches.delete(name);
          }
        }

        document.documentElement.style.removeProperty('--brand-primary');

        // --- TOAST FIX ---
        if (toastContainer) toastContainer.innerHTML = ''; 
        
        showToast("App reset successfully.", "success");

        // Hard Restart
        setTimeout(() => {
          window.location.replace(window.location.origin);
        }, 1200);

      } catch (error) {
        console.error("Wipe failed:", error);
        window.location.reload();
      }
    }
  );
}

// Hook it up to your button
document.getElementById('resetAppBtn').onclick = resetAppCompletely;

function updateMeter() {
  let totalBytes = 0;

  // Loop through every single item in LocalStorage
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    const value = localStorage.getItem(key);
    
    // We measure the size of the key and the value combined
    totalBytes += new Blob([key + value]).size;
  }

  // Convert bytes to KB (1024 bytes = 1 KB)
  const kb = (totalBytes / 1024).toFixed(1);

  // Update the UI
  if (DOM.storage) {
    DOM.storage.textContent = `${kb} KB used`;
    
    // Optional: Add a visual warning if getting close to the 5MB limit
    // 5MB is roughly 5120 KB
    if (kb > 4000) {
        DOM.storage.style.color = '#ef4444'; // Red if > 4MB
    } else {
        DOM.storage.style.color = ''; // Default
    }
  }
}

const Ledger = {
  reads: 0,
  writes: 0,
  deletes: 0,
  categories: {},

  log: function(category, r = 0, w = 0, d = 0) {
    this.reads += r;
    this.writes += w;
    this.deletes += d;

    if (!this.categories[category]) {
      this.categories[category] = { reads: 0, writes: 0, deletes: 0 };
    }

    this.categories[category].reads += r;
    this.categories[category].writes += w;
    this.categories[category].deletes += d;

    // Firebase Pricing (approx): Reads: $0.06/100k, Writes: $0.18/100k, Deletes: $0.02/100k
    const cost = (
      (this.reads / 100000) * 0.06 +
      (this.writes / 100000) * 0.18 +
      (this.deletes / 100000) * 0.02
    ).toFixed(5);

 //   console.groupCollapsed(`💰 Ledger: [${category}] +${r}R/+${w}W/+${d}D`);
 //   console.log(`Session Totals: ${this.reads}R | ${this.writes}W | ${this.deletes}D`);
//    console.log(`Estimated Session Cost: $${cost}`);
 //   console.table(this.categories);
 //   console.groupEnd();
  }
};
window.Ledger = Ledger;

  // SVG Thought Bubble 
function getThoughtBubbleSVG(className = "w-20 h-20") {
    return `<svg class="${className}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <path d="M 32 38 C 28 32, 34 27, 40 30 C 43 25, 52 25, 55 30 C 58 25, 66 28, 68 34 C 73 36, 73 46, 68 48 C 66 54, 58 54, 55 49 C 52 55, 43 55, 40 49 C 34 54, 28 48, 32 40 Z" stroke="#6B7280" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="35" cy="59" r="3.5" stroke="#6B7280" fill="none" stroke-width="2.5"/>
        <circle cx="30" cy="69" r="2.5" stroke="#6B7280" fill="none" stroke-width="2.5"/>
    </svg>`;
}
window.getThoughtBubbleSVG = getThoughtBubbleSVG;

// ==========================================
// 12. INITIALIZATION
// ==========================================
//     → DOMContentLoaded, handleAutoOpen, service worker
//     → All event listeners, modal wiring

document.addEventListener('DOMContentLoaded', async () => {
	
	signInAnonymously(auth);    
	onAuthStateChanged(auth, (user) => {
		console.log('🔐 onAuthStateChanged fired');
  if (user && !feedLoaded) {
    feedLoaded = true;
	console.log('🍔 loadFeed triggered from onAuthStateChanged');
    loadFeed();
  }
});

const { data: { session } } = await _supabase.auth.getSession();
if (!session) {
  _supabase.auth.signInAnonymously(); // Supabase — only if no existing session
}

_supabase.auth.onAuthStateChange((event, session) => {
  console.log('🔐 Supabase auth state:', event, session?.user?.id);
});

const localeReady = getOrCreateUserLocale(); // runs first, sets freeform_language

  if (localeReady) {
    Translator.init();
  } else {
    console.error('❌ Locale not ready — Translator init skipped.');
  }
  
  runMigration();
  loadUsername();
  initProfileAndTheme();
  window.updateUnreadBadge();
  
  requestAnimationFrame(() => {
    const skelFooter = document.querySelector('.animate-pulse .mt-6.pt-5');
    console.log('Skeleton footer height:', skelFooter?.offsetHeight);
  });
  
  const savedToggleState = localStorage.getItem('freeform_toggle_pref');
  DOM.toggle.checked = (savedToggleState === 'true');
  updateToggleUI(); 
  updateTabClasses(); 
  
  applyFontPreference(selectedFont);
  updateMeter();
  setupInfiniteScroll();

  DOM.btn.addEventListener('click', handlePost);
  
  DOM.toggle.addEventListener('change', () => {
    localStorage.setItem('freeform_toggle_pref', DOM.toggle.checked);
    updateToggleUI();
  });

  DOM.tabPrivate.addEventListener('click', () => switchTab('private'));
  DOM.tabPublic.addEventListener('click', () => switchTab('public'));

  DOM.fontBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const font = btn.getAttribute('data-font');
    selectedFont = font;
    localStorage.setItem('freeform_font_pref', font);
    applyFontPreference(font);
    // Close popup after selection
    document.getElementById('fontPickerPopup')?.classList.add('hidden');
  });
});

document.getElementById('fontPickerTrigger')?.addEventListener('click', (e) => {
  e.stopPropagation();
  document.getElementById('fontPickerPopup')?.classList.toggle('hidden');
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('#fontPickerContainer')) {
    document.getElementById('fontPickerPopup')?.classList.add('hidden');
  }
});

document.getElementById('inputTrigger')?.addEventListener('click', () => openInputModal());
document.getElementById('closeInputModalBtn')?.addEventListener('click', () => closeInputModal());
document.getElementById('inputModalOverlay')?.addEventListener('click', () => closeInputModal());

  DOM.modalOverlay.addEventListener('click', () => closeModal());

DOM.closeBtn?.addEventListener('click', () => closeModal()); 

  DOM.sendComment.addEventListener('click', postComment);
  
  DOM.commentInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') postComment();
  });
  
  const modalContentCard = document.querySelector('#commentModal .bg-white');
  if (modalContentCard) {
    modalContentCard.addEventListener('click', (e) => {
      e.stopPropagation(); // ✋ Tells the browser: "If I click text/comments, don't close"
    });
  }

  // 2. Standard desktop behavior: Close modal when pressing the 'Escape' key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !DOM.modal.classList.contains('hidden')) {
      closeModal();
    }
  });

//  UNIFIED EMOJI CLICK HANDLER
DOM.emojiButtons.forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation(); // Stop bubble so we don't immediately close desktop popup
    
    // 1. Insert Emoji
    DOM.commentInput.value += btn.getAttribute('data-char');

    // 2. Check context: Is this the Desktop Popup or the Mobile Bar?
    const isDesktopPopup = btn.closest('#desktopEmojiPopup');

    if (isDesktopPopup) {
      // 💻 DESKTOP BEHAVIOR
      // Focus the input immediately so they can keep typing
      DOM.commentInput.focus();
      
      // Close the popup
      DOM.desktopEmojiPopup.classList.add('hidden');
      DOM.desktopEmojiTrigger.classList.remove('text-brand-500', 'bg-brand-50');
      
    } else {
      // 📱 MOBILE BEHAVIOR (Your existing Keyboard Suppression Hack)
      DOM.commentInput.blur();
      DOM.commentInput.disabled = true;

      if ('virtualKeyboard' in navigator) {
        navigator.virtualKeyboard.hide();
      }

      setTimeout(() => {
        DOM.commentInput.disabled = false;
      }, 300);
    }
  });
});

// --- 📱 MOBILE SWIPE GESTURE LOGIC ---

let touchStartX = 0;
let touchStartY = 0;
let touchEndX = 0;
let touchEndY = 0;

// 1. Capture where the finger starts
document.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
}, { passive: true });

// 2. Capture where the finger ends and calculate the distance
document.addEventListener('touchend', e => {
    touchEndX = e.changedTouches[0].screenX;
    touchEndY = e.changedTouches[0].screenY;
    handleSwipeGesture();
}, { passive: true });

function handleSwipeGesture() {
    const swipeDistanceX = touchEndX - touchStartX;
    const swipeDistanceY = touchEndY - touchStartY;
    const threshold = 60; // Min distance in pixels to trigger a switch

    const anyModalOpen = !document.getElementById('dmModal')?.classList.contains('hidden') || 
                         !document.getElementById('chatModal')?.classList.contains('hidden') ||
                         !DOM.modal?.classList.contains('hidden');
	
	if (anyModalOpen) return;
    
    if (Math.abs(swipeDistanceY) > Math.abs(swipeDistanceX)) {
        return; 
    }

    // SWIPE RIGHT (Finger moves Left -> Right) => Go to Public
    if (swipeDistanceX > threshold && currentTab === 'private') {
        switchTab('public');
        triggerHapticFeedback();
    } 
    
    // SWIPE LEFT (Finger moves Right -> Left) => Go to Private
    else if (swipeDistanceX < -threshold && currentTab === 'public') {
        switchTab('private');
        triggerHapticFeedback();
    }
}

function triggerHapticFeedback() {
    if ('vibrate' in navigator) {
        navigator.vibrate(10);
    }
}

// DESKTOP POPUP TOGGLE LOGIC
if (DOM.desktopEmojiTrigger && DOM.desktopEmojiPopup) {
  
  // Toggle Popup
  DOM.desktopEmojiTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isHidden = DOM.desktopEmojiPopup.classList.contains('hidden');
    
    if (isHidden) {
      DOM.desktopEmojiPopup.classList.remove('hidden');
      DOM.desktopEmojiTrigger.classList.add('text-brand-500', 'bg-brand-50');
    } else {
      DOM.desktopEmojiPopup.classList.add('hidden');
      DOM.desktopEmojiTrigger.classList.remove('text-brand-500', 'bg-brand-50');
    }
  });

  // Close when clicking anywhere else on the document
  document.addEventListener('click', (e) => {
    // If click is NOT inside popup AND NOT on the trigger button
    if (!DOM.desktopEmojiPopup.contains(e.target) && e.target !== DOM.desktopEmojiTrigger) {
      DOM.desktopEmojiPopup.classList.add('hidden');
      DOM.desktopEmojiTrigger.classList.remove('text-brand-500', 'bg-brand-50');
    }
  });
}

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.share-container')) {
      document.querySelectorAll('.share-menu.active').forEach(menu => {
        menu.classList.remove('active');
        if(menu.nextElementSibling) menu.nextElementSibling.classList.remove('active');
      });
    }
  });

// --- INITIALIZE REALTIME ---
if (MY_USER_ID) {
	window.syncIncomingMessages();
	enableNotifications();
    const dmSubscription = _supabase
        .channel('dm-relay-changes')
        .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'dm_relay',
            filter: `receiver_id=eq.${MY_USER_ID}` 
        }, (payload) => {
          //  console.log("%c 🔔 REALTIME: New message detected!", "background: #22c55e; color: white; padding: 2px 5px;");
            window.syncIncomingMessages();
        })
        .subscribe();
} else {
    console.warn("⚠️ Realtime not started: MY_USER_ID is missing.");
}
  
});

// --- AUTO-OPEN LOGIC ---
function handleAutoOpen() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('open') === 'chat') {
        const targetId = params.get('user'); 
		const targetHandle = params.get('handle') || '';
        if (!targetId) return;

        const checkExist = setInterval(() => {
            if (typeof window.openDirectMessage === 'function') {
				const cleanUrl = window.location.origin + window.location.pathname;
				history.replaceState({ modal: 'base' }, '', cleanUrl);
                history.pushState({ modal: 'open' }, '', cleanUrl);
				console.log("%c 📚 history.length after stack setup:", "color: #38bdf8;", history.length);
				// 2. Open the DM (this will pushState { modal: 'dm' } internally)
                window.openDirectMessage(null, targetId, targetHandle); 
                console.log("%c 📌 history.state after open:", "color: #38bdf8;", history.state);
                console.log("%c 📚 history.length after open:", "color: #38bdf8;", history.length);

                clearInterval(checkExist);
            }
        }, 100);

        // Stop checking after 5 seconds
        setTimeout(() => clearInterval(checkExist), 5000);
    }
}

window.addEventListener('load', handleAutoOpen);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js')
    .then(reg => console.log('SW Registered!', reg))
    .catch(err => console.error('SW Registration Failed', err));
}

// NEW: Intercept ALL document clicks to enforce menu priority
document.addEventListener('click', (e) => {
  // If no menu is open, do nothing special
  if (!activeShareMenuId) return;

  const activeMenu = document.getElementById(activeShareMenuId);
  if (!activeMenu) return;

  // 1. If clicking INSIDE the menu or its trigger → allow it
  const isClickInMenu = activeMenu.contains(e.target);
  const trigger = activeMenu.nextElementSibling; // The share button is next to the menu
  const isClickOnTrigger = trigger && trigger.contains(e.target);
  
  if (isClickInMenu || isClickOnTrigger) {
    return; // Let the click pass through
  }

  // 2. Menu is open and click is OUTSIDE → close menu and BLOCK other handlers
  e.stopPropagation();
  activeMenu.classList.remove('active');
  if (trigger) trigger.classList.remove('active');
  activeShareMenuId = null;
  
  // Optional: Prevent default to be extra safe
  if (e.target.closest('.feed-item')) {
    e.preventDefault();
  }
}, true); // ← IMPORTANT: Use CAPTURE phase so this runs first
/**
 * BACKGROUND/RESUME KEYBOARD SUPPRESSION
 * Prevents the keyboard from auto-popping when re-entering the app
 */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    // 1. The app is being minimized or the user switched tabs
    // We "Hard Kill" the focus right now so the browser has nothing 
    // to restore when the user comes back.
    if (!DOM.modal.classList.contains('hidden')) {
      DOM.commentInput.blur();
      DOM.commentInput.disabled = true;
    }
  } else {
    // 2. The user has returned to the app
    // We wait a tiny bit for the "resume" logic to finish, then 
    // make the input usable again WITHOUT focusing it.
    setTimeout(() => {
      DOM.commentInput.disabled = false;
    }, 300);
  }
});

document.addEventListener('DOMContentLoaded', () => {
    // 1. Scroll to Top
    document.getElementById('logoHome')?.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // 3 & 4. Tabs
    document.getElementById('tabPublic')?.addEventListener('click', () => switchTab('public'));
    document.getElementById('tabPrivate')?.addEventListener('click', () => switchTab('private'));

    // 5. Close Dialog
    document.getElementById('dialogCancel')?.addEventListener('click', () => closeDialog());

    // 6 & 7. Exit Modal
    document.getElementById('exitModalBack')?.addEventListener('click', () => closeExitModal());
    document.getElementById('confirm-exit-btn')?.addEventListener('click', () => closeExitModal());
	
});

// 1. Get references to the new elements
const profileModal = document.getElementById('profileModal');
const chatModal = document.getElementById('chatModal');

// 2. Open Profile
document.getElementById('navProfile').onclick = () => {
  showUIModal(profileModal);
};

document.getElementById('navMessages').onclick = () => {
    // First, show the modal using your existing function
    showUIModal(chatModal);
    
    // Second, run the list logic to populate it
    window.renderChatList(); 
};

// 4. Close Listeners (Buttons and Overlays)
document.getElementById('closeProfileBtn').onclick = () => hideUIModal(profileModal);
document.getElementById('profileOverlay').onclick = () => hideUIModal(profileModal);

document.getElementById('closeChatBtn').onclick = () => hideUIModal(chatModal);
document.getElementById('chatOverlay').onclick = () => hideUIModal(chatModal);

// Listen for clicks on the document itself
document.addEventListener('click', (e) => {
    // Check if the clicked element (or its parent) is our send button
    const btn = e.target.closest('#sendDMBtn');
    
    if (btn) {
        console.log("Found the button via delegation!");
        e.preventDefault();
        window.sendMessage();
    }
});
