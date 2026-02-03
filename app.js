import { initializeApp } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-app.js";
import { 
  getFirestore, collection, addDoc, deleteDoc, doc, updateDoc,
  query, orderBy, limit, serverTimestamp, onSnapshot,
  writeBatch, getDocs, increment, setDoc, getDoc, runTransaction, where
} from "https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js";

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

// ==========================================
// 1. STATE & DOM lalaa
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
  desktopEmojiPopup: document.getElementById('desktopEmojiPopup')
};

let currentTab = localStorage.getItem('freeform_tab_pref') || 'private';
const MY_USER_ID = getOrCreateUserId(); 
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

// At the top of your script
let visiblePosts = [];   
let postBuffer = [];     
let processedIds = new Set(); 
let dripTimeout = null;
let activePostListeners = new Map();
let isAppending = false;

// ==========================================
// 2. INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  runMigration();
  setRandomPlaceholder();
  
  const savedToggleState = localStorage.getItem('freeform_toggle_pref');
  DOM.toggle.checked = (savedToggleState === 'true');
  updateToggleUI(); 
  updateTabClasses(); 
  
  applyFontPreference(selectedFont);

  loadFeed(); 
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
      DOM.input.focus();
    });
  });

  DOM.modalOverlay.addEventListener('click', closeModal);
  DOM.closeBtn.addEventListener('click', closeModal);
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

 // ==========================================
// 1. UNIFIED EMOJI CLICK HANDLER
// ==========================================
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
let touchEndX = 0;

// 1. Capture where the finger starts
document.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX;
}, { passive: true });

// 2. Capture where the finger ends and calculate the distance
document.addEventListener('touchend', e => {
    touchEndX = e.changedTouches[0].screenX;
    handleSwipeGesture();
}, { passive: true });

function handleSwipeGesture() {
    const swipeDistance = touchEndX - touchStartX;
    const threshold = 70; // Min distance in pixels to trigger a switch

    // Check if we are inside a scrollable area (like a modal or comment input)
    // We don't want to switch tabs if the user is just scrolling through comments
    if (!DOM.modal.classList.contains('hidden')) return;

    // SWIPE RIGHT (Finger moves Left -> Right) => Go to Private
    if (swipeDistance > threshold && currentTab === 'public') {
        console.log("Swipe detected: Moving to Private");
        switchTab('private');
        triggerHapticFeedback(); // Optional extra polish
    } 
    
    // SWIPE LEFT (Finger moves Right -> Left) => Go to Public
    else if (swipeDistance < -threshold && currentTab === 'private') {
        console.log("Swipe detected: Moving to Public");
        switchTab('public');
        triggerHapticFeedback();
    }
}

// 🚀 BONUS: Vibration feedback for that "Premium" feel
function triggerHapticFeedback() {
    if ('vibrate' in navigator) {
        navigator.vibrate(10); // A tiny 10ms tap
    }
}

// ==========================================
// 2. DESKTOP POPUP TOGGLE LOGIC
// ==========================================
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
});

// ==========================================
// 0. NEW: ATOMIC COUNTER SYSTEM
// ==========================================
/**
 * Ensures sequential #hashtag IDs across all users using Firestore Transactions
 */
async function getNextUniqueTag() {
  const counterRef = doc(db, "metadata", "postCounter");

  try {
    const newCount = await runTransaction(db, async (transaction) => {
      const counterDoc = await transaction.get(counterRef);
      
      if (!counterDoc.exists()) {
        // Initialize if first time
        transaction.set(counterRef, { count: 1 });
        return 1;
      }

      const nextId = counterDoc.data().count + 1;
      transaction.update(counterRef, { count: nextId });
      return nextId;
    });

    return `UID:${newCount}`;
  } catch (e) {
    console.error("Counter transaction failed: ", e);
    // Fallback to timestamp if transaction fails to prevent blocking user
    return `#temp${Date.now().toString().slice(-4)}`;
  }
}

// ==========================================
// Drip Feed
// ==========================================
function startDripFeed() {
  if (dripTimeout) clearTimeout(dripTimeout);

  async function drip() {
    // 🚀 THE FIX: If the user switched tabs while we were waiting, STOP IMMEDIATELY
    if (currentTab !== 'public') return;

    if (postBuffer.length === 0) {
      await refillBufferRandomly(1);
    }

    // Double check again after the 'await' finishes
    if (currentTab !== 'public') return;

    if (postBuffer.length > 0) {
      const nextPost = postBuffer.shift();
      visiblePosts.unshift(nextPost);
      injectSinglePost(nextPost, 'top');

      if (visiblePosts.length > 50) {
        visiblePosts.pop();
        if (DOM.list.lastElementChild) DOM.list.lastElementChild.remove();
      }
    }
    
    dripTimeout = setTimeout(drip, 20000); 
  }

  drip();
}

function updateUISurgically(id, data) {
  // 1. ALWAYS update background storage (Keep the data fresh)
  updateLocalPostWithServerData(id, data.commentCount || 0, data.likeCount || 0);
  
  // 2. ONLY touch the DOM if we are on the Public Tab
  // This prevents the Global "Drip" or "Discovery" logic from messing with your Archive view
  if (currentTab !== 'public') return;

  const postEl = document.querySelector(`[data-id="${id}"]`);
  if (postEl) {
    const likeSpan = postEl.querySelector(`.count-like-${id}`);
    if (likeSpan) likeSpan.textContent = data.likeCount || 0;

    const commentSpan = postEl.querySelector(`.count-comment-${id}`);
    if (commentSpan) commentSpan.textContent = data.commentCount || 0;
  }
}

function watchPostCounts(postId) {
  if (activePostListeners.has(postId)) return;

  const postRef = doc(db, "globalPosts", postId);
  
  const unsubscribe = onSnapshot(postRef, (docSnap) => {
    // ✅ CASE A: The post exists
    if (docSnap.exists()) {
      const data = docSnap.data();
      
      // 🚀 THE FIX: Use updateUISurgically which handles the Tab Guard internally.
      // It will update LocalStorage but only touch the screen if currentTab === 'public'.
      updateUISurgically(postId, data);
    } 
    // 🚀 CASE B: The post was deleted remotely
    else {
      // 1. Always cleanup the listener locally
      if (activePostListeners.has(postId)) {
        const unsub = activePostListeners.get(postId);
        if (unsub) unsub();
        activePostListeners.delete(postId);
      }

      // 2. ONLY remove from screen if we are actually looking at the Global feed
      if (currentTab === 'public') {
        visiblePosts = visiblePosts.filter(p => p.id !== postId && p.firebaseId !== postId);

        const elToRemove = document.querySelector(`[data-id="${postId}"]`);
        if (elToRemove) {
          elToRemove.classList.add('opacity-0', 'scale-95', 'transition-all', 'duration-500');
          setTimeout(() => elToRemove.remove(), 500);
        }
      }
    }
  }, (err) => {
    console.warn("Post watch lost connection:", err);
  });

  activePostListeners.set(postId, unsubscribe);
}

async function refillBufferRandomly(count = 1, silent = false) {
  try {
    const counterRef = doc(db, "metadata", "postCounter");
    const counterSnap = await getDoc(counterRef);
    
    if (!counterSnap.exists()) return;
    const maxId = counterSnap.data().count;

    const windowSize = maxId < 50 ? maxId : 500;
    const minId = Math.max(1, maxId - windowSize);

    let attempts = 0;
    // We try up to 15 times to find 'count' valid posts
    while (postBuffer.length < count && attempts < 15) {
      attempts++;
      const rand = Math.floor(Math.random() * (maxId - minId + 1) + minId);
      const targetTag = `UID:${rand}`;

      const q = query(collection(db, "globalPosts"), where("uniqueTag", "==", targetTag));
      const snap = await getDocs(q);

      if (!snap.empty) {
        const docData = snap.docs[0];
        const post = { id: docData.id, ...docData.data(), isFirebase: true };
        
        // Ensure it's not already on screen OR already in the buffer
        const isDuplicate = processedIds.has(post.id) || postBuffer.some(p => p.id === post.id);
        
        if (!isDuplicate) {
          postBuffer.push(post);
        }
      }
    }
 
  } catch (err) {
    console.error("Sampler failed:", err);
  }
}

function injectSinglePost(item, position = 'top') {
  // Debug: Log every injection attempt
  console.log(`injectSinglePost called: tab=${currentTab}, isFirebase=${item.isFirebase}, content=${item.content}`);

  // 🚀 THE FIX: If we are in Private mode, DO NOT inject global posts into the list
  if (currentTab === 'private' && item.isFirebase) {
    console.warn(`injectSinglePost: Blocking global post in private tab: ${item.content}`);
    return; 
  }

  const postNode = createPostNode(item); 
  postNode.classList.add('animate-in', 'fade-in', 'slide-in-from-top-4', 'duration-500');

  if (position === 'top') {
    DOM.list.prepend(postNode);
  } else {
    DOM.list.appendChild(postNode);
  }

  watchPostCounts(item.id);
}

// ==========================================
// 3. CORE FUNCTIONS (Feed & Tabs)
// ==========================================

function applyFontPreference(font) {
  DOM.input.classList.remove('font-sans', 'font-serif', 'font-mono', 'font-hand');
  DOM.input.classList.add(font);

  DOM.fontBtns.forEach(btn => {
    if (btn.getAttribute('data-font') === font) {
      btn.classList.add('ring-2', 'ring-brand-500', 'ring-offset-1');
    } else {
      btn.classList.remove('ring-2', 'ring-brand-500', 'ring-offset-1');
    }
  });
}

function switchTab(tab) {
  if (currentTab === tab) return;
  
  // Add a quick fade-out to the list for a smoother transition
  DOM.list.style.opacity = '0';
  DOM.list.style.transform = tab === 'public' ? 'translateX(-10px)' : 'translateX(10px)';
  
  setTimeout(() => {
      currentTab = tab;
      localStorage.setItem('freeform_tab_pref', tab);
      currentLimit = BATCH_SIZE;
      
      updateTabClasses();
      loadFeed();
      
      if (tab === 'public') setupInfiniteScroll();

      // Fade it back in
      DOM.list.style.opacity = '1';
      DOM.list.style.transform = 'translateX(0)';
  }, 100);
}

function updateTabClasses() {
  const activeClass = "flex-1 pb-3 text-sm font-bold text-brand-600 border-b-2 border-brand-500 transition-all";
  const inactiveClass = "flex-1 pb-3 text-sm font-semibold text-slate-500 hover:text-slate-700 transition-all";

  if (currentTab === 'private') {
    DOM.tabPrivate.className = activeClass;
    DOM.tabPublic.className = inactiveClass;
  } else {
    DOM.tabPublic.className = activeClass;
    DOM.tabPrivate.className = inactiveClass;
  }
}

function updateToggleUI() {
  const isPublic = DOM.toggle.checked;
  DOM.label.textContent = isPublic ? "Public Mode" : "Private Mode";
  DOM.label.className = isPublic 
    ? "text-xs font-bold text-brand-600 transition-colors"
    : "text-xs font-semibold text-slate-500 transition-colors";
}

function loadFeed() {
  // 1. KILL THE GLOBAL HEARTBEAT (The Discovery Drip)
  if (dripTimeout) {
    clearTimeout(dripTimeout);
    dripTimeout = null;
  }

  // 2. RESET THE GLOBAL SNAPSHOT (The Ego-Listener)
  if (publicUnsubscribe) { 
    publicUnsubscribe(); 
    publicUnsubscribe = null; 
  }

  // 3. KILL ALL INDIVIDUAL POST WATCHERS
  if (activePostListeners && activePostListeners.size > 0) {
    activePostListeners.forEach((unsubscribe) => unsubscribe());
    activePostListeners.clear();
  }

  // 🚀 4. NEW: WIPE GLOBAL STATE ARRAYS
  // This prevents the "Discovery" posts from hanging around in memory 
  // and interfering with your Private Tab logic.
  visiblePosts = [];
  postBuffer = [];
  processedIds.clear();

  // 5. ROUTE TO CORRECT TAB
  if (currentTab === 'private') {
    // Load from LocalStorage
    allPrivatePosts = (JSON.parse(localStorage.getItem('freeform_v2')) || []).reverse();
    renderPrivateBatch();
    // Only listen for YOUR Global posts updates while in Private
    subscribeArchiveSync();
  } else {
    // Start Discovery Mode
	DOM.loadTrigger.style.display = 'flex';
    subscribePublicFeed();
  }
}

function renderPrivateBatch() {
  // Re-fetch to ensure we have the counts updated by the background sync
  allPrivatePosts = (JSON.parse(localStorage.getItem('freeform_v2')) || []).reverse();
  
  const visible = allPrivatePosts.slice(0, currentLimit);
  DOM.list.innerHTML = ''; 
  renderListItems(visible);
  DOM.loadTrigger.style.display = (currentLimit >= allPrivatePosts.length) ? 'none' : 'flex';
}

function subscribeArchiveSync() {
  if (publicUnsubscribe) { publicUnsubscribe(); publicUnsubscribe = null; }

  const q = query(
    collection(db, "globalPosts"), 
    where("authorId", "==", MY_USER_ID)
  );

  publicUnsubscribe = onSnapshot(q, (snapshot) => {
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const id = doc.id;
      
      // 1. Update background storage
      updateLocalPostWithServerData(id, data.commentCount || 0, data.likeCount || 0);

      // 2. ✅ THE FIX: Update the screen live in the Private Tab
      const postEl = document.querySelector(`[data-id="${id}"]`);
      if (postEl) {
        const likeSpan = postEl.querySelector(`.count-like-${id}`);
        if (likeSpan) likeSpan.textContent = data.likeCount || 0;

        const commentSpan = postEl.querySelector(`.count-comment-${id}`);
        if (commentSpan) commentSpan.textContent = data.commentCount || 0;
      }
    });
  }, (error) => {
    console.error("Archive sync failed:", error);
  });
}

// ==========================================
// 3. THE SUBSCRIBER (Fixed Syntax)
// ==========================================
async function subscribePublicFeed() {
  if (publicUnsubscribe) publicUnsubscribe();

  // 🛡️ THE FIX: Only reset state if we aren't just appending more posts
  if (!isAppending) {
    visiblePosts = [];
    postBuffer = []; 
    processedIds.clear();
    if (dripTimeout) clearTimeout(dripTimeout);
    DOM.list.innerHTML = '<div class="text-center py-20 opacity-50 font-medium italic">Scanning the horizon...</div>';
  }

  try {
    // 1. Fetch newest posts for immediate gratification
    const qInitial = query(collection(db, "globalPosts"), orderBy("createdAt", "desc"), limit(15));
    const initialSnap = await getDocs(qInitial);
    
    const newItems = [];
    initialSnap.forEach(doc => {
      const post = { id: doc.id, ...doc.data(), isFirebase: true };
      if (!processedIds.has(post.id)) {
        newItems.push(post);
        processedIds.add(doc.id);
      }
    });

    // 2. Render logic
    if (isAppending) {
        newItems.forEach(p => {
            visiblePosts.push(p);
            injectSinglePost(p, 'bottom');
        });
    } else {
        visiblePosts = newItems;
        renderListItems(visiblePosts);
        startDripFeed(); // Only start the loop on first load
    }

    DOM.loadTrigger.style.opacity = '0';

    // ============================================================
    // 3. Ego-Listener (Tweaked: The "Instant Feedback" Loop)
    // ============================================================
    
    // Capture the exact moment we started listening
    const listenStartTime = Date.now(); 

    const myPostsQuery = query(collection(db, "globalPosts"), where("authorId", "==", MY_USER_ID));
    
    publicUnsubscribe = onSnapshot(myPostsQuery, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const docId = change.doc.id;
        const data = change.doc.data();

        // 🛡️ TIME GATE CHECK
        // 1. !data.createdAt -> It's a local pending write (instant feedback)
        // 2. data.createdAt > listenStartTime -> It's a post confirmed by server AFTER we loaded
        const isNewPost = !data.createdAt || (data.createdAt.toMillis ? data.createdAt.toMillis() : Date.now()) > listenStartTime;

        if (change.type === "added" && !processedIds.has(docId)) {
          
          // If it's an old post (history), mark it processed so we ignore it, but DO NOT render it.
          if (!isNewPost) {
             processedIds.add(docId);
             return; 
          }

          // It is BRAND NEW -> Inject immediately
          const postObj = { id: docId, ...data, isFirebase: true };
          processedIds.add(docId);
          visiblePosts.unshift(postObj);
          
          injectSinglePost(postObj, 'top');
          
          // Nice touch: smooth scroll to top to confirm to user their post is live
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        if (change.type === "modified") {
          updateUISurgically(docId, data);
        }
      });
    });

  } catch (err) {
    console.error("Critical Load Error:", err);
    if(!isAppending) DOM.list.innerHTML = `<div class="text-center py-12">Feed offline.</div>`;
  }
}

// ==========================================
// 4. SMART SHARE SYSTEM (UPDATED COLORS)
// ==========================================

function getSmartShareButtons(text) {
  const urlToShare = window.location.href;
  const totalLength = (text ? text.length : 0) + urlToShare.length;
  
  // ✅ COLORS ADDED HERE: bg-x-50 text-x-600 by default for visibility
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

async function sharePost(text, platform) {
  const currentUrl = window.location.href;
  const urlText = encodeURIComponent(text);
  const urlLink = encodeURIComponent(currentUrl);

  // === 📋 COPY TO CLIPBOARD LOGIC ===
  if (platform === 'copy') {
    try {
      await navigator.clipboard.writeText(`${text}\n\n${currentUrl}`);
      
      // ✅ SUCCESS: Sleek Toast instead of Alert
      showToast("Copied to clipboard");
      
    } catch (err) {
      console.error('Failed to copy', err);
      
      // ❌ ERROR: Red Toast
      showToast("Manual copy required", "error");
    }
    return;
  }

  let url = '';
  switch(platform) {
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

  if (url) {
    window.open(url, '_blank', 'width=600,height=500,noopener,noreferrer');
  }
}

function createPostNode(item) {
  // 1. Create the base container
  const el = document.createElement('div');
  el.setAttribute('data-id', item.id);
  el.className = "feed-item bg-white p-5 rounded-xl shadow-sm border border-slate-100 mb-4 hover:shadow-md transition-shadow cursor-pointer relative";

  // 2. Logic: Time, Fonts, and Tags
  const time = getRelativeTime(item.createdAt);
  const fontClass = item.font || 'font-sans'; 
  const isMyGlobalPost = item.isFirebase && item.authorId === MY_USER_ID;
  
  const tagDisplay = item.uniqueTag 
    ? `<span class="text-brand-500 font-bold text-[11px] bg-brand-50 px-2 py-0.5 rounded-full">${item.uniqueTag}</span>`
    : `<span class="text-slate-400 font-medium text-[11px] bg-slate-50 px-2 py-0.5 rounded-full">#draft</span>`;

  // 3. Logic: Likes & Comments
  const hasCommentsAccess = item.isFirebase || item.firebaseId;
  const realId = item.isFirebase ? item.id : item.firebaseId;
  const commentCount = item.commentCount || 0; 
  const likeCount = item.likeCount || 0;
  
  const myLikes = JSON.parse(localStorage.getItem('my_likes_cache')) || {};
  const isLiked = !!myLikes[realId];
  const heartFill = isLiked ? 'fill-red-500 text-red-500' : 'fill-none text-slate-400 group-hover:text-red-500';
  const countColor = isLiked ? 'text-red-600' : 'text-slate-500';

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

  const actionArea = hasCommentsAccess ? interactiveButtonsHtml : `<span class="text-xs text-slate-400 font-medium italic">Private Draft</span>`;

  // 4. Logic: Share Menu
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

  const footerHtml = `<div class="mt-3 pt-3 border-t border-slate-50 flex items-center justify-between">${actionArea}${shareComponent}</div>`;

  // 5. Inject HTML
  el.innerHTML = `
    <div class="flex justify-between items-start mb-2">
      <div class="flex items-center gap-2">
        <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${item.isFirebase ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-500'}">
          ${item.isFirebase ? 'Global' : 'Local'}
        </span>
        <span class="text-xs text-slate-500 font-medium">${time}</span>
      </div>
    </div>
    <p class="text-slate-800 whitespace-pre-wrap leading-relaxed text-[15px] pointer-events-none ${fontClass}">${cleanText(item.content)}</p>
    ${footerHtml}
  `;

  // 6. Delete Button (Manual Node Creation)
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

  // 7. Click Handler for Modal
  el.onclick = (e) => {
  // ⚡ NEW: Don't open modal if share menu is currently open
  if (activeShareMenuId) {
    return;
  }

  // Original checks
  if (e.target.closest('button') || e.target.closest('.share-container') || e.target.closest('.like-trigger')) {
    return;
  }
  
  openModal(item);
};

  // 8. Share Button Handlers
  const platformBtns = el.querySelectorAll('.share-icon-btn');
  platformBtns.forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const platform = btn.getAttribute('data-platform');
      sharePost(item.content, platform);
      const menu = el.querySelector('.share-menu');
      if (menu) menu.classList.remove('active');
    };
  });

  return el;
}

// Helper Function for the Heart Animation
function showHeartAnimation(container) {
  const animContainer = container.querySelector('.animation-container');
  if (!animContainer) return;

  const heart = document.createElement('div');
  heart.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" class="w-20 h-20 text-red-500 fill-red-500 drop-shadow-lg" viewBox="0 0 24 24" stroke-width="0" stroke="currentColor">
       <path d="M19.5 12.572l-7.5 7.428l-7.5 -7.428a5 5 0 1 1 7.5 -6.566a5 5 0 1 1 7.5 6.572"></path>
    </svg>
  `;
  
  heart.className = "transform scale-0 opacity-0 transition-all duration-500 ease-out";
  animContainer.appendChild(heart);

  requestAnimationFrame(() => {
    heart.classList.remove('scale-0', 'opacity-0');
    heart.classList.add('scale-125', 'opacity-100');
    
    setTimeout(() => {
      heart.classList.remove('scale-125', 'opacity-100');
      heart.classList.add('scale-150', 'opacity-0');
      setTimeout(() => heart.remove(), 500);
    }, 400);
  });
}

function renderListItems(items) {
  DOM.list.innerHTML = ''; 
  
  if (items.length === 0) {
    DOM.list.innerHTML = `<div class="text-center py-12 border-2 border-dashed border-slate-100 rounded-xl"><p class="text-slate-500">No thoughts here yet.</p></div>`;
    return;
  }

  items.forEach(item => {
    const postNode = createPostNode(item);
    DOM.list.appendChild(postNode);
    
    // 🚀 THE FIX: Start watching these initial posts too
    watchPostCounts(item.id);
  });
}

// ==========================================
// ENHANCED SHARE MENU LOGIC (with Priority)
// ==========================================
window.toggleShare = function(event, menuId) {
  event.stopPropagation();
  const menu = document.getElementById(menuId);
  
  if (!menu) return;

  const isActive = menu.classList.contains('active');

  // If a different menu is open, close it first
  if (activeShareMenuId && activeShareMenuId !== menuId) {
    const oldMenu = document.getElementById(activeShareMenuId);
    if (oldMenu) oldMenu.classList.remove('active');
    const oldTrigger = oldMenu?.previousElementSibling;
    if (oldTrigger) oldTrigger.classList.remove('active');
  }

  if (isActive) {
    // CLOSING the menu
    menu.classList.remove('active');
    event.currentTarget.classList.remove('active');
    activeShareMenuId = null;
  } else {
    // OPENING the menu
    menu.classList.add('active');
    event.currentTarget.classList.add('active');
    activeShareMenuId = menuId;
  }
};

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

// ==========================================
// 5. POST ACTIONS & SCROLL
// ==========================================
function setupInfiniteScroll() {
  // 1. If an observer already exists, kill it first
  if (scrollObserver) {
    scrollObserver.disconnect();
  }

  // 2. Create the new observer
  scrollObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !isLoadingMore) {
      // Only trigger if we are actually on the public tab
      if (currentTab === 'public') {
        loadMoreData();
      }
    }
  }, { 
    root: null, 
    threshold: 0.1,
    rootMargin: '150px' // Increased margin for a smoother "Discovery" feel
  });
  
  // 3. Start watching the trigger
  if (DOM.loadTrigger) {
    scrollObserver.observe(DOM.loadTrigger);
  }
}

function loadMoreData() {
  if (isLoadingMore) return;
  isLoadingMore = true;

  DOM.loadTrigger.style.visibility = 'visible';
  DOM.loadTrigger.style.opacity = '1';

  if (currentTab === 'private') {
    currentLimit += BATCH_SIZE;
    renderPrivateBatch();
    isLoadingMore = false;
    DOM.loadTrigger.style.visibility = 'hidden';
  } else {
    // Discovery Mode: Fetch a batch of random posts to append to the bottom
    refillBufferRandomly(5, true).then(() => {
      if (postBuffer.length === 0) {
          // If randomizer found nothing, fallback to chronological
          isAppending = true;
          subscribePublicFeed().then(() => {
              isLoadingMore = false;
              isAppending = false;
              DOM.loadTrigger.style.visibility = 'hidden';
          });
      } else {
          // Append the random "discoveries" to the bottom
          while(postBuffer.length > 0) {
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

async function handlePost() {
  const text = DOM.input.value.trim();
  if (!text) return;
  const isPublic = DOM.toggle.checked;
  
  // --- 🚦 SPAM GUARD START ---
  if (isPublic) {
    if (!checkSpamGuard(text)) {
      return; // Stop execution only if it's public spam
    }
  }
  // --- 🚦 SPAM GUARD END ---
  
  DOM.btn.textContent = "...";
  DOM.btn.disabled = true;

  try {
    let firebaseId = null;
	let uniqueTag = null;

    if (isPublic) {
		
		uniqueTag = await getNextUniqueTag();
		
      const docRef = await addDoc(collection(db, "globalPosts"), { 
        content: text, 
        font: selectedFont, 
        authorId: MY_USER_ID,
		uniqueTag: uniqueTag,
        createdAt: serverTimestamp(),
        commentCount: 0,
		likeCount: 0
      });
      firebaseId = docRef.id; 
    }

    const newPost = { 
      id: Date.now().toString(), 
      content: text, 
      font: selectedFont, 
	  uniqueTag: uniqueTag,
      createdAt: new Date().toISOString(), 
      isFirebase: false,
      firebaseId: firebaseId,
      commentCount: 0
    };

    const posts = JSON.parse(localStorage.getItem('freeform_v2')) || [];
    posts.push(newPost);
    localStorage.setItem('freeform_v2', JSON.stringify(posts));
    updateMeter();

    if (isPublic) {
      if (currentTab === 'private') switchTab('public');
    } else {
      if (currentTab === 'public') switchTab('private');
      else { allPrivatePosts = posts.reverse(); renderPrivateBatch(); }
    }
    DOM.input.value = "";
    setRandomPlaceholder(); 

  } catch (error) { 
    showToast("Error posting", "error");
    console.error(error); 
  } finally { 
    DOM.btn.textContent = "Post"; 
    DOM.btn.disabled = false; 
  }
}

async function publishDraft(post) {
  // 1. Trigger the Custom Dialog (Blue Button)
  showDialog(
    "Publish to World?",
    "This note will be visible to everyone on the Global Feed.",
    "Publish",
    async () => {
      // === 🛡️ SPAM GUARD CHECK FIRST ===
      if (!checkSpamGuard(post.content)) {
        // User is either in jail or posting duplicate content
        // checkSpamGuard will show its own dialog
        return; // Stop here, don't publish
      }
      
      // === 🟢 PUBLISH LOGIC STARTS HERE ===
      try {
        const uniqueTag = await getNextUniqueTag();		
        
        const docRef = await addDoc(collection(db, "globalPosts"), { 
          content: post.content, 
          font: post.font || 'font-sans', 
          authorId: MY_USER_ID,
          uniqueTag: uniqueTag,
          createdAt: serverTimestamp(),
          commentCount: 0,
          likeCount: 0 
        });

        const posts = JSON.parse(localStorage.getItem('freeform_v2')) || [];
        const targetIndex = posts.findIndex(p => p.id === post.id);
        
        if (targetIndex !== -1) {
          // Link local post to the new global ID
          posts[targetIndex].firebaseId = docRef.id;
          posts[targetIndex].uniqueTag = uniqueTag;
          posts[targetIndex].commentCount = 0;
          posts[targetIndex].likeCount = 0;
          localStorage.setItem('freeform_v2', JSON.stringify(posts));
          
          allPrivatePosts = posts.reverse();
          loadFeed();
          
          // Re-open modal to show the new "Live" status
          const updatedPost = posts.find(p => p.id === post.id);
          openModal(updatedPost);
          
          // Success Toast
          showToast("Post is now live");
        }

      } catch (e) {
        console.error("Error publishing draft:", e);
        showToast("Could not publish. Check connection.", "error");
      }
    }
  );
}

async function deleteLocal(id) {
  // 1. Trigger the Dialog instead of window.confirm
  showDialog(
    "Delete from Archive?", 
    "This will permanently remove this note from your device and from the Global feed.",
    "Delete",
    async () => {
      // === 🔴 THE DELETION LOGIC STARTS HERE ===
      
      let posts = JSON.parse(localStorage.getItem('freeform_v2')) || [];
      const targetPost = posts.find(p => p.id === id);

      if (targetPost && targetPost.firebaseId) {
        try {
          const batch = writeBatch(db);
          const postRef = doc(db, "globalPosts", targetPost.firebaseId);
          const commentsRef = collection(db, "globalPosts", targetPost.firebaseId, "comments");
          const likesRef = collection(db, "globalPosts", targetPost.firebaseId, "likes");

          // Clean up sub-collections first
          const commentsSnapshot = await getDocs(commentsRef);
          commentsSnapshot.forEach(doc => batch.delete(doc.ref));
          
          const likesSnapshot = await getDocs(likesRef);
          likesSnapshot.forEach(doc => batch.delete(doc.ref));

          batch.delete(postRef);
          await batch.commit();
        } catch(e) {
          console.warn("Global version already gone or unreachable:", e);
        }
      }

      // Remove from Local Storage
      posts = posts.filter(p => p.id !== id);
      localStorage.setItem('freeform_v2', JSON.stringify(posts));
      
      // Update UI
      allPrivatePosts = posts.reverse();
      renderPrivateBatch();
      updateMeter();
      
      // Notify the user
      showToast("Note deleted from archive", "neutral");
    }
  );
}

async function deleteGlobal(postId) {
  // 1. Trigger the Custom Dialog instead of window.confirm
  showDialog(
    "Delete from Global?", 
    "This will permanently remove the post for everyone. Comments and likes will also be deleted.",
    "Delete", 
    async () => {
      // === 🔴 DELETION LOGIC STARTS HERE ===
      try {
        const batch = writeBatch(db);
        const postRef = doc(db, "globalPosts", postId);
        const commentsRef = collection(db, "globalPosts", postId, "comments");
        const likesRef = collection(db, "globalPosts", postId, "likes"); // <--- Added Likes cleanup
        
        // 2. Queue up Comment deletions
        const commentsSnapshot = await getDocs(commentsRef);
        commentsSnapshot.forEach((commentDoc) => {
          batch.delete(commentDoc.ref);
        });

        // 3. Queue up Like deletions (New)
        const likesSnapshot = await getDocs(likesRef);
        likesSnapshot.forEach((likeDoc) => {
           batch.delete(likeDoc.ref);
        });

        // 4. Delete the Post itself
        batch.delete(postRef);

        // 5. Commit all changes at once
        await batch.commit();
		
		// --- 🚀 START OF THE FIX ---

        // 1. Remove it from the JavaScript array so it's gone from memory
        visiblePosts = visiblePosts.filter(p => p.id !== postId && p.firebaseId !== postId);

        // 2. Surgically remove the HTML card from the screen immediately
        const elToRemove = document.querySelector(`[data-id="${postId}"]`);
        if (elToRemove) {
          elToRemove.classList.add('opacity-0', 'scale-95', 'transition-all', 'duration-300');
          setTimeout(() => elToRemove.remove(), 300);
        }

        // 3. Kill the "Live Watcher" for this post so it stops listening
        if (activePostListeners.has(postId)) {
          activePostListeners.get(postId)(); // Stop the listener
          activePostListeners.delete(postId); // Remove from the Map
        }
        
        // --- 🏁 END OF THE FIX ---
        
        console.log(`Successfully deleted post ${postId}, comments, and likes.`);

        // 6. Update Local Storage (Remove "Global" status)
        let posts = JSON.parse(localStorage.getItem('freeform_v2')) || [];
        let updated = false;

        posts = posts.map(p => {
          if (p.firebaseId === postId) {
            delete p.firebaseId; 
            // Also reset counts locally since it's no longer global
            p.commentCount = 0;
            p.likeCount = 0;
            updated = true;
          }
          return p;
        });

        if (updated) {
          localStorage.setItem('freeform_v2', JSON.stringify(posts));
          allPrivatePosts = posts.reverse();
          
          // Refresh UI if we are on the private tab
          if (currentTab === 'private') {
            renderPrivateBatch();
          }
        }
        
        // 7. Success Notification
        showToast("Post deleted from global feed");

      } catch (e) {
        console.error("Error during batch delete:", e);
        showToast("Delete failed. Check connection.", "error");
      }
    }
  );
}

async function toggleLike(event, postId) {
  event.stopPropagation(); // Don't open the modal
  if (!postId || postId === 'undefined') return;

  const myLikes = JSON.parse(localStorage.getItem('my_likes_cache')) || {};
  const currentlyLiked = !!myLikes[postId];

  // ==========================================
  // ⚡️ OPTIMISTIC UI UPDATE (Instant)
  // ==========================================
  const wrapper = event.currentTarget; // The div you clicked
  const icon = wrapper.querySelector('svg');
  const countSpan = wrapper.querySelector('span');
  
  // Get current number safely
  let currentCount = parseInt(countSpan.textContent) || 0;

  if (currentlyLiked) {
    // VISUAL: Turn Gray / Hollow
    icon.classList.remove('fill-red-500', 'text-red-500');
    icon.classList.add('fill-none', 'text-slate-400');
    
    // COUNT: Decrement
    countSpan.textContent = Math.max(0, currentCount - 1);
    countSpan.classList.remove('text-red-600');
    countSpan.classList.add('text-slate-500');
    
    // STATE: Remove from local cache immediately
    delete myLikes[postId];
  } else {
    // VISUAL: Turn Red / Filled
    icon.classList.remove('fill-none', 'text-slate-400');
    icon.classList.add('fill-red-500', 'text-red-500');
    
    // COUNT: Increment
    countSpan.textContent = currentCount + 1;
    countSpan.classList.remove('text-slate-500');
    countSpan.classList.add('text-red-600');
    
    // STATE: Add to local cache immediately
    myLikes[postId] = true;
  }
  
  // Save cache immediately so scrolling doesn't flicker
  localStorage.setItem('my_likes_cache', JSON.stringify(myLikes));

  // ==========================================
  // ☁️ FIREBASE UPDATE (Background)
  // ==========================================
  try {
    const postRef = doc(db, "globalPosts", postId);
    const likeRef = doc(db, "globalPosts", postId, "likes", MY_USER_ID);

    if (currentlyLiked) {
      await deleteDoc(likeRef);
      await updateDoc(postRef, { likeCount: increment(-1) });
    } else {
      await setDoc(likeRef, { createdAt: serverTimestamp() });
      await updateDoc(postRef, { likeCount: increment(1) });
    }
  } catch (error) {
    console.error("Like failed:", error);
    // Optional: Revert UI here if you really want to be safe
    alert("Connection failed. Like not saved.");
  }
}
window.toggleLike = toggleLike;

async function deleteComment(postId, commentId) {
  // 1. Swap 'confirm()' for your custom 'showDialog'
  showDialog(
    "Delete Comment", 
    "Are you sure you want to remove this?", 
    "Delete", // This triggers the red text logic in your showDialog
    async () => {
      // --- ALL YOUR ORIGINAL LOGIC STARTS HERE ---
      try {
        const commentRef = doc(db, "globalPosts", postId, "comments", commentId);
        await deleteDoc(commentRef);
        
        // Update count on parent doc (Decrement)
        const postRef = doc(db, "globalPosts", postId);
        await updateDoc(postRef, {
            commentCount: increment(-1)
        });

        console.log("Comment deleted successfully");
        
        // 2. Success! Show the toast instead of just a console log
        showToast("Comment deleted");

      } catch (e) {
        console.error("Error deleting comment:", e);
        
        // 3. Swap 'alert()' for a toast or dialog
        showToast("Could not delete comment", "error");
      }
      // --- ALL YOUR ORIGINAL LOGIC ENDS HERE ---
    }
  );
}

// ==========================================
// 6. MODAL LOGIC
// ==========================================
function openModal(post) {
  if (window.history.state?.modal !== 'open') {
    history.pushState({ modal: 'open' }, '');
  }
	
  if (DOM.input) {
    DOM.input.disabled = true;
  }

  const realFirestoreId = post.isFirebase ? post.id : post.firebaseId;
  activePostId = realFirestoreId; 
  
  DOM.modalContent.textContent = post.content;
  const fontClass = post.font || 'font-sans';
  DOM.modalContent.classList.remove('font-sans', 'font-serif', 'font-mono', 'font-hand');
  DOM.modalContent.classList.add(fontClass);
  DOM.modalDate.textContent = getRelativeTime(post.createdAt);
  
  DOM.modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  if (realFirestoreId) {
    if(DOM.commentInputBar) DOM.commentInputBar.style.display = 'block';
	
// ✅ SYNC: Watch for changes (and deletions!)
    const postRef = doc(db, "globalPosts", realFirestoreId);
    
    // We store this in a variable so we can clean it up if the post is deleted
    const modalAutoUnsubscribe = onSnapshot(postRef, (docSnap) => {
      if (docSnap.exists()) {
        const serverData = docSnap.data();
        updateLocalPostWithServerData(
            realFirestoreId, 
            serverData.commentCount || 0, 
            serverData.likeCount || 0
        );
      } 
      // 🚀 THE FIX: If someone else deletes the post while the modal is open
      else {
        modalAutoUnsubscribe(); // Stop listening
        closeModal();           // Kick user out of the modal
		
		const now = Date.now();
  if (now - lastGhostToastTime > 3000) { // 3000ms = 3 seconds
    showToast("Note no longer available", "neutral");
    lastGhostToastTime = now;
  }
        
        // Also remove it from the background feed so it's not there when the modal closes
        const el = document.querySelector(`[data-id="${realFirestoreId}"]`);
        if (el) el.remove();
      }
    });

    const q = query(collection(db, `globalPosts/${realFirestoreId}/comments`), orderBy("createdAt", "desc"));
    DOM.commentList.innerHTML = '<div class="text-center py-10 text-slate-300 text-sm">Loading...</div>';
    
    commentsUnsubscribe = onSnapshot(q, (snapshot) => {
      DOM.commentList.innerHTML = '';
      if (snapshot.empty) {
        DOM.commentList.innerHTML = `
          <div class="flex flex-col items-center justify-center py-10 text-center">
            <div class="text-3xl mb-2 opacity-30">💭</div>
            <div class="text-slate-400 text-sm">No comments yet.<br>Be the first.</div>
          </div>`;
        return;
      }
      snapshot.forEach(doc => {
        const c = doc.data();
        const div = document.createElement('div');
        const time = getRelativeTime(c.createdAt);
        const isMyComment = c.authorId === MY_USER_ID;
        div.className = "comment-bubble flex flex-col items-start w-full relative group";
        
        let deleteBtn = '';
        if (isMyComment) {
          deleteBtn = `<button class="delete-comment-btn ml-2 text-xs font-semibold text-red-300 hover:text-red-500 transition-colors cursor-pointer" data-id="${doc.id}">Delete</button>`;
        }

        div.innerHTML = `
          <div class="bg-gray-100 px-4 py-2.5 rounded-2xl rounded-tl-none max-w-[90%]">
             <p class="text-[15px] text-gray-800 leading-snug break-words font-sans">${cleanText(c.text)}</p>
          </div>
          <div class="flex items-center mt-1 ml-1">
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
    });

  } else {
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
    if(trigger) {
      trigger.onclick = () => publishDraft(post);
    }
    
    if(DOM.commentInputBar) DOM.commentInputBar.style.display = 'none';
  }
}

function closeModal() {
  // 1. Navigation: Handle the hardware back button logic
  if (window.history.state?.modal === 'open') {
    window.history.back();
  }
	
  // 2. UI Reset
  DOM.modal.classList.add('hidden');
  document.body.style.overflow = ''; 
  activePostId = null;

  // 3. Listener Cleanup
  if (commentsUnsubscribe) { 
    commentsUnsubscribe(); 
    commentsUnsubscribe = null; 
  }

  // 🚀 THE FIX: Stop the modal's specific live-count watcher
  // This ensures the "phone hangs up" on this post when you walk away
  if (typeof modalAutoUnsubscribe !== 'undefined' && modalAutoUnsubscribe) {
    modalAutoUnsubscribe();
    // We set it to null so it's ready for the next post
    // Note: ensure modalAutoUnsubscribe is declared with 'let' at the top of your script
  }
  
  if (DOM.input) {
    DOM.input.disabled = false;
  }
}

async function postComment() {
  const text = DOM.commentInput.value.trim();
  
  if (!checkSpamGuard(null)) return; 
  if (!text || !activePostId) return;

  // --- ⌨️ KEYBOARD SUPPRESSION ---
  DOM.commentInput.blur(); 
  DOM.commentInput.disabled = true; // "Hard Kill" focus so OS drops keyboard
  
  if ('virtualKeyboard' in navigator) {
    navigator.virtualKeyboard.hide();
  }

  DOM.sendComment.disabled = true;
  DOM.sendComment.style.opacity = "0.5";

  try {
    await addDoc(collection(db, `globalPosts/${activePostId}/comments`), {
      text: text,
      authorId: MY_USER_ID, 
      createdAt: serverTimestamp()
    });

    const postRef = doc(db, "globalPosts", activePostId);
    await updateDoc(postRef, { commentCount: increment(1) });

    DOM.commentInput.value = '';
    showToast("Comment added");
    
    const scrollArea = document.getElementById('modalScrollArea');
    if (scrollArea) scrollArea.scrollTop = 0; 

  } catch (e) { 
    console.error(e); 
  } finally { 
    // Re-enable UI after keyboard animation finishes
    setTimeout(() => {
      DOM.commentInput.disabled = false;
      DOM.sendComment.disabled = false; 
      DOM.sendComment.style.opacity = "1";
      // NOTE: We do NOT call .focus() here anymore.
    }, 300);
  }
}

// ==========================================
// 7. UTILITIES
// =========================================

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
  console.log("🔵 showDialog called:", { title, message, confirmText });
  
  const overlay = document.getElementById('custom-dialog');
  const titleEl = document.getElementById('dialog-title');
  const msgEl = document.getElementById('dialog-msg');
  const confirmBtn = document.getElementById('dialog-confirm-btn');

  // Check if elements exist
  if (!overlay || !titleEl || !msgEl || !confirmBtn) {
    console.error("❌ Dialog elements missing:", {
      overlay: !!overlay,
      titleEl: !!titleEl,
      msgEl: !!msgEl,
      confirmBtn: !!confirmBtn
    });
    return;
  }

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
    console.log("🖱️ Confirm button clicked");
    
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
  console.log("🔶 closeDialog called");
  console.trace("📍 Call stack:"); // This will show us WHO is calling closeDialog
  
  const overlay = document.getElementById('custom-dialog');
  
  if (!overlay) {
    console.error("❌ Can't close - overlay not found");
    return;
  }
  
  console.log("📂 Closing dialog, current classes:", overlay.className);
  overlay.classList.remove('dialog-open'); 
  
  // Reduced from 200 to 150 to match the CSS speed
  setTimeout(() => {
    overlay.classList.add('hidden');
    console.log("🔒 Dialog hidden after 150ms delay");
  }, 150); 
}

// Expose to window
window.showDialog = showDialog;
window.closeDialog = closeDialog;

// ==========================================
// SPAM GUARD (TRAFFIC LIGHT SYSTEM)
// ==========================================
function checkSpamGuard(newContent) {
  const COOLDOWN_MINUTES = 30;
  
  let history = JSON.parse(localStorage.getItem('spam_guard')) || {
    lastContent: '',
    repeatCount: 0,
    jailReleaseTime: 0
  };

  const now = Date.now();

  // 1. CHECK JAIL TIME (Applies to everyone)
  if (now < history.jailReleaseTime) {
    let minutesLeft = Math.ceil((history.jailReleaseTime - now) / 60000);
    
    // 🚨 REPLACED ALERT WITH DIALOG
    showDialog(
      "Penalty Box ❄️",
      `You are currently blocked from posting. Please wait ${minutesLeft} more minutes.`,
      "Okay",
      () => {} // No extra action needed, just close
    );
    
    return false; // BLOCK EVERYTHING
  }

  // 2. READ-ONLY CHECK (For Comments)
  // If we pass 'null', we just want to know if they are in jail. 
  // We return TRUE (allowed) because they passed step 1.
  if (newContent === null) return true;

  // 3. COMPARE CONTENT (For Posts)
  if (newContent === history.lastContent) {
    history.repeatCount++; 
  } else {
    // New unique content resets the counter
    history.lastContent = newContent;
    history.repeatCount = 0; 
  }

  // 4. TRAFFIC LIGHT JUDGMENT
  if (history.repeatCount >= 2) { 
    // RED LIGHT (3rd strike)
    history.jailReleaseTime = now + (COOLDOWN_MINUTES * 60 * 1000);
    localStorage.setItem('spam_guard', JSON.stringify(history));
    
    // 🚨 REPLACED ALERT WITH DIALOG
    showDialog(
      "Spam Detected 🚨",
      "You posted the exact same thing 3 times. You are taking a 30-minute break.",
      "Understood",
      () => {} // No extra action needed
    );

    return false; // BLOCK
  }

  // GREEN/YELLOW LIGHT (Allow)
  localStorage.setItem('spam_guard', JSON.stringify(history));
  return true; 
}

// Change "serverCount" to "serverCommentCount" for clarity, and ADD "serverLikeCount"
function updateLocalPostWithServerData(firebaseId, serverCommentCount, serverLikeCount) {
  let posts = JSON.parse(localStorage.getItem('freeform_v2')) || [];
  let updated = false;

  posts = posts.map(p => {
    if (p.firebaseId === firebaseId) {
      // Check if EITHER comments OR likes are different
      if (p.commentCount !== serverCommentCount || p.likeCount !== serverLikeCount) {
        p.commentCount = serverCommentCount;
        p.likeCount = serverLikeCount; // Now this variable exists!
        updated = true;
      }
    }
    return p;
  });

  if (updated) {
    localStorage.setItem('freeform_v2', JSON.stringify(posts));
    if (currentTab === 'private') {
      allPrivatePosts = posts.slice().reverse();
      renderPrivateBatch();
    }
  }
}

function getOrCreateUserId() {
  let id = localStorage.getItem('freeform_user_id');
  if (!id) {
    id = Math.random().toString(36).substring(2, 6) + '-' + Math.random().toString(36).substring(2, 6);
    localStorage.setItem('freeform_user_id', id);
  }
  return id;
}

function setRandomPlaceholder() {
  const phrases = [
    "What's on your mind?", "Share your ideas...", "What's the vibe today?",
    "Capture a thought...", "Everything starts with a note...", 
    "Unfinished thoughts welcome...", "Notes for your future self..."
  ];
  DOM.input.placeholder = phrases[Math.floor(Math.random() * phrases.length)];
}

function updateMeter() {
  const kb = (new Blob([localStorage.getItem('freeform_v2') || '']).size / 1024).toFixed(1);
  DOM.storage.textContent = `${kb} KB used`;
}

function cleanText(str) {
  if (!str) return "";
  return str.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

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

/**
 * BACK BUTTON INTERCEPTOR
 * Intercepts hardware back button/gestures to close the modal instead of exiting the site
 */
window.addEventListener('popstate', (event) => {
  // If the modal is visible, close it
  if (!DOM.modal.classList.contains('hidden')) {
    // We update UI directly here. 
    // Do NOT call closeModal() here because closeModal calls history.back(), 
    // which would cause an infinite loop or double-back.
    DOM.modal.classList.add('hidden');
    document.body.style.overflow = '';
    activePostId = null;
    if (commentsUnsubscribe) { commentsUnsubscribe(); commentsUnsubscribe = null; }
    if (DOM.input) DOM.input.disabled = false;
  }
});

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

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js')
    .then(() => console.log("Service Worker Registered"));
}
