if (window.chrome && chrome.runtime && chrome.runtime.id) {
  document.body.classList.add('extension-view');
}

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-app.js";
import { 
  getFirestore, collection, addDoc, deleteDoc, doc, updateDoc,
  query, orderBy, limit, serverTimestamp, onSnapshot,
  writeBatch, getDocs, increment, setDoc, getDoc, runTransaction, where
} from "https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js";

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

// ==========================================
// 1. STATE & DOM
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

let totalGlobalPosts = 0;

const supabaseUrl = 'https://ipgtvatyzwhkifnsstux.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlwZ3R2YXR5endoa2lmbnNzdHV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2NDcyMzIsImV4cCI6MjA4NjIyMzIzMn0.OH7Dru0KKKdewj1nsWofvI73cT6tKIZbTVMPJA2oPvI'; 
// Use _supabase (with an underscore) to avoid clashing with the library name
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

window.pendingPostUpdates = 0;

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

    if (!DOM.modal.classList.contains('hidden')) return;
    
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
        transaction.set(counterRef, { count: 1 });
        return 1;
      }
      const nextId = counterDoc.data().count + 1;
      transaction.update(counterRef, { count: nextId });
      return nextId;
    });
	Ledger.log("getNextUniqueTag", 1, 1, 0);
    return {
      num: newCount,
      tag: `UID:${newCount}`
    };
  } catch (e) {
  const tempNum = Date.now();
  return { num: tempNum, tag: `#temp${tempNum.toString().slice(-4)}` };
}
}

// ==========================================
// Drip Feed
// ==========================================
let currentDripId = 0;

function startDripFeed() {
  if (dripTimeout) clearTimeout(dripTimeout);
  
  const myId = ++currentDripId;

  async function drip() {
    if (currentTab !== 'public' || myId !== currentDripId) return;
    if (postBuffer.length === 0) {
      await refillBufferRandomly(1);
	  Ledger.log("refillBuffer", 1, 0, 0);
    }
    if (currentTab !== 'public' || myId !== currentDripId) return;
    if (postBuffer.length > 0) {
      const nextPost = postBuffer.shift();  
	  if (!document.getElementById(`post-${nextPost.id}`)) {
          visiblePosts.unshift(nextPost);
          injectSinglePost(nextPost, 'top');
          if (visiblePosts.length > 50) {
            visiblePosts.pop();
            if (DOM.list.lastElementChild) DOM.list.lastElementChild.remove();
          }
      }
      }
    
    const getRandomDelay = (minSecs, maxSecs) => {
  return Math.floor(Math.random() * (maxSecs - minSecs + 1) + minSecs) * 1000;
};
const Variable = getRandomDelay(20, 40);
dripTimeout = setTimeout(drip, Variable);
  }
  drip();
}

function updateUISurgically(id, data) {
  // Use ?? to ensure we respect a 0 sent from the server
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
  }
}

function watchPostCounts(postId) {
  // 1. If we are already watching, stop.
  if (activePostListeners.has(postId)){
	window.pendingPostUpdates--;  
  return;
  }

  if (!isNaN(postId) && postId.length > 10) {
	  window.pendingPostUpdates--;
      return; 
  }

  // 3. FIRE-AND-FORGET (No 'await')
  // We trigger the fetch, but we do NOT pause the code here.
  _supabase
    .from('posts')
    .select('id, like_count, comment_count')
    .eq('id', postId)
    .maybeSingle()
    .then(({ data, error }) => {
		window.pendingPostUpdates--;
		
		if (window.pendingPostUpdates === 0) {
             console.log(`[watchPostCounts] 🟢 GREEN LIGHT. All updates finished.`);
        }
		
        if (data) {
            const uiData = {
                id: data.id, 
                likeCount: data.like_count, 
                commentCount: data.comment_count 
            };
            updateUISurgically(postId, uiData);
            Ledger.log("watchPostCounts", 1, 0, 0);
        }
    });

  // 4. SETUP LIVE LISTENER (Standard)
  const channel = _supabase
    .channel(`public:posts:${postId}`)
    .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'posts', 
        filter: `id=eq.${postId}` 
    }, (payload) => {

      if (payload.eventType === 'UPDATE') {
        const uiData = {
            id: payload.new.id,
            likeCount: payload.new.like_count,
            commentCount: payload.new.comment_count
        };
        updateUISurgically(postId, uiData);
        Ledger.log("watchPostCounts", 1, 0, 0);
      } 
      
      else if (payload.eventType === 'DELETE') {
        if (activePostListeners.has(postId)) {
           const unsub = activePostListeners.get(postId);
           if (unsub) unsub();
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

// 5. CLEANUP
  const unsubscribe = () => {
    const currentState = channel.state; // 'closed', 'errored', 'joined', or 'joining'
    
    console.log(`[Socket Debug] 🔴 Removing ${postId}. State was: ${currentState}`);

    _supabase.removeChannel(channel)
      .then(() => {
        console.log(`[Socket Debug] ✅ Successfully cleaned up ${postId}`);
      })
      .catch((err) => {
        // This is where that WebSocket error usually gets swallowed or throws
        console.error(`[Socket Debug] ❌ Failed to remove ${postId}:`, err);
      });
  };

  activePostListeners.set(postId, unsubscribe);
}

async function refillBufferRandomly(count = 1, silent = false, ignoreProcessed = false) {
	const placeholder = document.getElementById('public-placeholder');
	console.log(`%c🔄 Starting refillBufferRandomly (Target: ${count})`, "color: cyan; font-weight: bold;");
  try {
    const counterRef = doc(db, "metadata", "postCounter");
    const counterSnap = await getDoc(counterRef);
    
    if (!counterSnap.exists()) {
		console.warn("⚠️ No postCounter found in metadata.");
      totalGlobalPosts = 0; 
      return;
    }
	Ledger.log("refillBufferRandomly", 1, 0, 0);
	
    const maxId = counterSnap.data().count;
    totalGlobalPosts = maxId;
	const safetyOffset = 30; 
        // We ensure we don't go below 1 if the DB is small (e.g. only 20 posts)
        const searchMaxId = Math.max(1, maxId - safetyOffset);
	
    const windowSize = searchMaxId < 50 ? searchMaxId : 500;
    const minId = Math.max(1, searchMaxId - windowSize);
	
	console.log(`📊 DB Stats: Real Total: ${maxId} | Safe Max: ${searchMaxId} (-${safetyOffset}) | Search Window: ${minId} to ${searchMaxId}`);
	
    let attempts = 0;
    const MAX_ATTEMPTS = 15; 
    while (postBuffer.length < count && attempts < MAX_ATTEMPTS) {
      attempts++;
      const rand = Math.floor(Math.random() * (searchMaxId - minId + 1) + minId);    
console.log(`[Attempt ${attempts}] 🎲 Generated random start ID: ${rand}`);	  
      const q = query(
        collection(db, "globalPosts"), 
        where("serialId", ">=", rand), 
        orderBy("serialId", "asc"), 
        limit(1)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const docData = snap.docs[0];
        const post = { id: docData.id, ...docData.data(), isFirebase: true };
        const isDuplicate = (!ignoreProcessed && processedIds.has(post.id)) || 
                           postBuffer.some(p => p.id === post.id);      
        if (!isDuplicate) {
          postBuffer.push(post);
		  console.log(`  ✅ Added Post ${post.serialId}. Buffer size: ${postBuffer.length}/${count}`);
          if (placeholder) {
            placeholder.remove();   
            if (document.getElementById('public-placeholder')) {     
                document.getElementById('public-placeholder').outerHTML = ''; 
            } else {      
            }
          }	  
        }else {
                    // LOG: Failure Reason
                    const reason = (!ignoreProcessed && processedIds.has(post.id)) ? "Already in processedIds" : "Already in postBuffer";
                    console.log(`  ❌ Duplicate found: Post ${post.serialId}. Reason: ${reason}`);
                }
		Ledger.log("refillBufferRandomly", 1, 0, 0);
      } else {
		  console.log(`  ❓ Query returned empty for serialId >= ${rand}`);
        continue; 
      }
    }
	if (attempts >= MAX_ATTEMPTS) {
            console.warn("🛑 MAX_ATTEMPTS reached. Stopping loop.");
        }
  } catch (err) {
	  console.error("🔥 Error in refillBufferRandomly:", err);
  }
}

function injectSinglePost(item, position = 'top') {
  if (document.getElementById(`post-${item.id}`)) return;
  if (currentTab === 'private' && item.isFirebase) return;
  const postNode = createPostNode(item); 
  postNode.classList.add('animate-in');
  if (position === 'top') {
	const randomDelay = Math.floor(Math.random() * (4500 - 1500 + 1) + 1500);  
    setTimeout(() => {
      if (currentTab !== 'public' || document.getElementById(`post-${item.id}`)) {
        return; 
      }
	  
	  const ghost = document.getElementById('public-placeholder');
      if (ghost) ghost.remove();
	  
      const currentScrollTop = window.scrollY;
      DOM.list.prepend(postNode);
      watchPostCounts(item.id);
      requestAnimationFrame(() => {
        window.scrollTo(0, currentScrollTop);
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
  
  // 🕵️‍♂️ MOVE THE LOGS HERE (Before the 300ms wait)
  console.log(`[DEBUG] switchTab initiated to: ${tab}. Current counter: ${window.pendingPostUpdates}`);
  
  if (activePostListeners && activePostListeners.size > 0) {
      console.log(`[DEBUG] Immediate cleanup of ${activePostListeners.size} listeners...`);
      activePostListeners.forEach((unsubscribe, id) => {
          unsubscribe(); // This should now trigger your "State was: ..." logs immediately
      });
      activePostListeners.clear();
  }
  
  DOM.list.style.transition = 'none';
  DOM.list.style.transform = '';
  DOM.list.style.opacity = '';
  const _ = DOM.list.offsetHeight; 

  DOM.list.style.transition = 'transform 0.3s ease, opacity 0.3s ease'; // Restore transitions
  DOM.list.style.opacity = '0';
  DOM.list.style.transform = tab === 'public' ? 'translateX(0px)' : 'translateX(0px)';

  setTimeout(() => {
    currentTab = tab;
    localStorage.setItem('freeform_tab_pref', tab);
    currentLimit = BATCH_SIZE;
    updateTabClasses();
    loadFeed();
    if (tab === 'public') setupInfiniteScroll();
    requestAnimationFrame(() => {
      DOM.list.style.opacity = '1'; 
      DOM.list.style.transform = 'translateX(0)'; 
      setTimeout(refreshSnap, 100); 
    });

  }, 300); 
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
let feedSafetyTimeout = null;
function loadFeed() {
	if (feedSafetyTimeout) clearTimeout(feedSafetyTimeout);
  if (dripTimeout) {
    clearTimeout(dripTimeout);
    dripTimeout = null;
  }

  if (publicUnsubscribe) { 
    publicUnsubscribe(); 
    publicUnsubscribe = null; 
  }

  if (activePostListeners && activePostListeners.size > 0) {
	  console.log(`[loadFeed] 🧨 STARTING CLEANUP: Killing ${activePostListeners.size} listeners...`);
    activePostListeners.forEach((unsubscribe) => unsubscribe());
    activePostListeners.clear();
	console.log(`[loadFeed] 🧹 activePostListeners Map cleared.`);
  }
  
  visiblePosts = [];
  postBuffer = [];
  processedIds.clear();

  if (currentTab === 'private') {
    allPrivatePosts = (JSON.parse(localStorage.getItem('freeform_v2')) || []).reverse();
    renderPrivateBatch();
    subscribeArchiveSync();
  } else {
	DOM.loadTrigger.style.display = 'flex';
	
	// 🟢 NEW: Start the 5-second timer
    feedSafetyTimeout = setTimeout(() => {
      const placeholder = document.getElementById('public-placeholder');
      // If we are still 'scanning', give up and show 'empty'
      if (placeholder && placeholder.innerText.includes('Scanning')) {
        console.warn("[UI Guard] Network is too slow. Showing empty state.");
        showPublicPlaceholder('empty');
      }
    }, 5000);
	
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

async function subscribeArchiveSync() {
	console.log(`[Private Debug] 🛰️ subscribeArchiveSync starting. Tab: ${currentTab}`);
  if (publicUnsubscribe) { 
    await publicUnsubscribe(); // Wait for the old one to die before born-ing the new one
    publicUnsubscribe = null; 
}

  // Supabase real-time channel for your posts
  const channel = _supabase
    .channel('user_posts_sync')
    .on('postgres_changes', {
      event: '*',  // Listen for INSERT, UPDATE, DELETE
      schema: 'public',
      table: 'posts',
      filter: `author_id=eq.${MY_USER_ID}`  // Only your posts
    }, async (payload) => {
      const id = payload.new?.id || payload.old?.id;  // Post ID
      if (!id) return;

      try {
        // Fetch latest counts from Supabase
        const { data, error } = await _supabase
          .from('posts')
          .select('like_count, comment_count')
          .eq('id', id)
          .single();

        if (error) throw error;

        const likeCount = data?.like_count || 0;
        const commentCount = data?.comment_count || 0;

        // Update localStorage (like the original)
        updateLocalPostWithServerData(id, commentCount, likeCount);

        // Update UI elements
        const postEl = document.querySelector(`[data-id="${id}"]`);
        if (postEl) {
          const likeSpan = postEl.querySelector(`.count-like-${id}`);
          if (likeSpan) likeSpan.textContent = likeCount;
          const commentSpan = postEl.querySelector(`.count-comment-${id}`);
          if (commentSpan) commentSpan.textContent = commentCount;
        }

        Ledger.log("subscribeArchiveSync", 1, 0, 0);  // Log per change
      } catch (error) {
        console.error('Sync error:', error);
      }
    })
    .subscribe();

// Store unsubscribe function with a safety check
  publicUnsubscribe = async () => {
    if (!channel) return;

    const state = channel.state;
    console.log(`[Socket Debug] 🔴 Unsubscribing. State: ${state}`);

    // If it's still joining, Supabase might throw if we remove it too fast
    try {
      if (state === 'joined' || state === 'joining') {
        await _supabase.removeChannel(channel);
        console.log(`[Socket Debug] ✅ Channel removed.`);
      }
    } catch (e) {
      console.warn(`[Socket Debug] ⚠️ Handled WebSocket race condition:`, e.message);
    }
  };
}

// ==========================================
// 3. THE SUBSCRIBER (Fixed Syntax)
// ==========================================
async function subscribePublicFeed() {
  if (publicUnsubscribe) {
    publicUnsubscribe();
    publicUnsubscribe = null;
  }
  if (!isAppending) {
    visiblePosts = [];
    postBuffer = []; 
    processedIds.clear();
    if (dripTimeout) clearTimeout(dripTimeout);
    showPublicPlaceholder('scanning');
  }
  try {
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
	Ledger.log("subscribePublicFeed", initialSnap.docs.length, 0, 0);
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
    
    const listenStartTime = Date.now(); 
    const myPostsQuery = query(collection(db, "globalPosts"), where("authorId", "==", MY_USER_ID)); 
    publicUnsubscribe = onSnapshot(myPostsQuery, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const docId = change.doc.id;
        const data = change.doc.data();
        const isNewPost = !data.createdAt || (data.createdAt.toMillis ? data.createdAt.toMillis() : Date.now()) > listenStartTime;

        if (change.type === "added" && !processedIds.has(docId)) {
          if (!isNewPost) {
             processedIds.add(docId);
             return; 
          }
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
	   Ledger.log("subscribePublicFeed", snapshot.docs.length, 0, 0);
    });

  } catch (err) {
	  console.error("Error in subscribePublicFeed:", err);
    if(!isAppending) DOM.list.innerHTML = `<div class="text-center py-12">Feed offline.</div>`;
  }
}

// ==========================================
// 4. SMART SHARE SYSTEM (UPDATED COLORS)
// ==========================================

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

async function sharePost(text, platform) {
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
  
  let currentUrl = window.location.href;
  if (currentUrl.endsWith('/index.html')) {
    currentUrl = currentUrl.replace('/index.html', '/');
  } else if (currentUrl.endsWith('index.html')) {
    currentUrl = currentUrl.replace('index.html', '');
  }
  const urlText = encodeURIComponent(cleanText);
  const urlLink = encodeURIComponent(currentUrl);
  if (platform === 'copy') {
    try {
      await navigator.clipboard.writeText(`${cleanText}\n\n${currentUrl}`);   
      showToast("Copied to clipboard");    
    } catch (err) {
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
  el.id = `post-${item.id}`;
  el.setAttribute('data-id', item.id);
  const cursorClass = item.isFirebase ? "" : "cursor-pointer";
  el.className = `feed-item block w-full bg-white px-4 py-3 mb-4 pb-6 border-b border-slate-100 lg:border-b-[1px] lg:border-slate-300 relative transition-colors ${cursorClass}`;

  const time = getRelativeTime(item.createdAt);
  const fontClass = item.font || 'font-sans'; 
  const isMyGlobalPost = item.isFirebase && item.authorId === MY_USER_ID;
  const tagDisplay = item.uniqueTag 
    ? `<span class="text-brand-500 font-bold text-[11px] bg-brand-50 px-2 py-0.5 rounded-full">${item.uniqueTag}</span>`
    : `<span class="text-slate-400 font-medium text-[11px] bg-slate-50 px-2 py-0.5 rounded-full">#draft</span>`;

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

  const footerHtml = `<div class="mt-6 pt-5 flex items-center justify-between">${actionArea}${shareComponent}</div>`;

  el.innerHTML = `
<div class="animation-container absolute inset-0 flex items-center justify-center pointer-events-none z-30"></div>
 
<div class="flex justify-between items-start mb-6"> <div class="flex items-center gap-2">
    <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${item.isFirebase ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-500'}">
      ${item.isFirebase ? 'Global' : 'Local'}
    </span>
    <span class="text-xs text-slate-400 font-medium">${time}</span>
  </div>
</div>

<p class="post-body text-slate-800 whitespace-pre-wrap leading-relaxed text-[15px] relative z-10 ${fontClass} break-keep break-words">${renderSmartText(item.content)}</p>

${footerHtml}
`;

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

  let clickTimer = null;
  let clickCount = 0;

  el.onclick = (e) => {
    if (activeShareMenuId) return;

    // A. THE LINK SHIELD: If they clicked a link, let the link handle itself.
    if (e.target.closest('a')) return;

    // B. THE BUTTON SHIELD: Same for buttons and icons
    if (e.target.closest('button') || e.target.closest('.share-container') || e.target.closest('.like-trigger')) {
      return;
    }
    const isCommentIcon = e.target.closest('.icon-tabler-message-circle-2');
    if (item.isFirebase && !isCommentIcon) {

    }

    clickCount++;
    if (clickCount === 1) {
      clickTimer = setTimeout(() => {
        // DECISION: Open modal if it's Local OR we clicked the Comment Icon
        if (!item.isFirebase || isCommentIcon) {
          openModal(item);
        }
        clickCount = 0;
      }, 250);
    } else if (clickCount === 2) {
      clearTimeout(clickTimer);
      clickCount = 0;
      
      // Instagram-style double-tap heart (Works for Global & Local)
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

function showHeartAnimation(container) {
  const rect = container.getBoundingClientRect();
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
  
  const heart = document.createElement('div');
  heart.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" class="w-20 h-20 text-red-500 fill-red-500 drop-shadow-lg" viewBox="0 0 24 24" stroke-width="0" stroke="currentColor">
       <path d="M19.5 12.572l-7.5 7.428l-7.5 -7.428a5 5 0 1 1 7.5 -6.566a5 5 0 1 1 7.5 6.572"></path>
    </svg>
  `;
  
  heart.style.cssText = `
    position: fixed;
    left: ${rect.left + rect.width/2 - 40}px;
    top: ${rect.top + rect.height/2 - 40}px;
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

function renderListItems(items) {
	
	if (feedSafetyTimeout) {
    clearTimeout(feedSafetyTimeout);
    feedSafetyTimeout = null;
  }
	
	if (window.pendingPostUpdates > 0) {
      console.log(`[renderListItems] 🚦 RED LIGHT. Waiting for ${window.pendingPostUpdates} updates to finish.`);
      return; 
  }

	const placeholder = document.getElementById('public-placeholder');
	
  if (items.length === 0) {
	  DOM.list.innerHTML = ''; 
	  
	  if (currentTab === 'private') {
    DOM.list.innerHTML = `
      <div class="flex flex-col items-center justify-center w-full text-center px-6 border-2 border-dashed border-slate-100 lg:border-slate-300 rounded-xl mx-auto max-w-[95%]"
           style="scroll-snap-align: start; scroll-margin-top: calc(112px + 24px); min-height: calc(100vh - 418px);">
        <div class="mb-4 text-slate-300">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 3c7.2 0 9 1.8 9 9s-1.8 9-9 9-9-1.8-9-9 1.8-9 9-9"/>
            <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
            <line x1="9" y1="9" x2="9.01" y2="9"/>
            <line x1="15" y1="9" x2="15.01" y2="9"/>
          </svg>
        </div>
        <p class="text-slate-500 font-medium tracking-tight">Awaiting inspiration.</p>
        <p class="text-slate-400 text-xs mt-2">
  The best ideas are the ones you 
  <span onclick="document.getElementById('postInput').scrollIntoView({ behavior: 'smooth', block: 'center' })" 
      class="underline cursor-pointer hover:text-slate-600 transition-colors">
    write down
</span>.
</p>
      </div>`;
	  }
	  else { 
	  if (totalGlobalPosts === 0) {
      showPublicPlaceholder('empty');
    } else {
        
          if (!window.isBruteFetching) {
          showPublicPlaceholder('scanning'); // Only show scanning if we are actually starting a fetch
          window.isBruteFetching = true;
          handleBruteForce();
        } else {
          // 🚀 THE FIX: If we are already brute fetching and still have 0 items, 
          // stop showing "Scanning" and show "Empty" so the user isn't stuck.
          showPublicPlaceholder('empty');
        }
      }
    }
		
    return; 
  }
  
  items.forEach(item => {
    // If we have a placeholder, kill it
    if (placeholder) {
      placeholder.remove();
      // Double check for any lingering ghost by ID
      const ghost = document.getElementById('public-placeholder');
      if (ghost) ghost.remove();
    }
    const postNode = createPostNode(item);
    DOM.list.appendChild(postNode);
	window.pendingPostUpdates++;
    watchPostCounts(item.id);
  });
  refreshSnap();
}

function showPublicPlaceholder(type) {
  let html = '';
  if (type === 'empty') {
    html = `
      <div id="public-placeholder" class="flex flex-col items-center justify-center w-full text-center px-6 border-2 border-dashed border-slate-100 lg:border-slate-300 rounded-xl mx-auto max-w-[95%]" style="min-height: calc(100vh - 418px);">
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
      <div id="public-placeholder" class="text-center py-20 opacity-50 font-medium italic">
        Scanning the horizon...
      </div>`;

    // 🕒 THE 3-SECOND PANIC TIMER
    console.log("[UI] Scanning started. 3s timeout armed.");
    
    setTimeout(() => {
      const stillScanning = document.getElementById('public-placeholder');
      if (stillScanning && stillScanning.innerText.includes('Scanning')) {
        console.error("🚨 STUCK DETECTED: Forcing internal reload.");
        
        // We use window.location.reload() or re-trigger your loadFeed()
        // But a reload is the most "billion-dollar" way to guarantee a fresh state
        window.location.reload(); 
      }
    }, 3000);
  }
  DOM.list.innerHTML = html;
  
}

async function handleBruteForce() {
	const placeholder = document.getElementById('public-placeholder');
  // 1. Double check we aren't already fetching
  if (window.isBruteFetching) return;
  
  window.isBruteFetching = true;

  try {
    // 2. Clear IDs so the sampler doesn't ignore the 11 posts
    processedIds.clear(); 
    
	if (placeholder) {
       
        placeholder.remove();
        
        // Final nuke check
        if (document.getElementById('public-placeholder')) {
            document.getElementById('public-placeholder').outerHTML = '';
        }
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
      totalGlobalPosts = 0; 
      renderListItems([]);
    }
  } catch (err) {
	  
  } finally {
    setTimeout(() => { 
      window.isBruteFetching = false; 
    }, 2000);
  }
}

function refreshSnap() {
  const scroller = window; 
  scroller.scrollBy(0, 1);
  scroller.scrollBy(0, -1);
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

function getSafeText(input) {
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: ['#text'], // No HTML allowed (Nuclear Option)
    ALLOWED_ATTR: [], // No attributes (onclick, etc) allowed
    KEEP_CONTENT: true // Keeps the text inside the tags, just removes the tags themselves
  });
}

async function handlePost() {
  // Sanitize input text
  const rawText = DOM.input.value.trim();
  const text = getSafeText(rawText);
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
	let serialId = null;

    if (isPublic) {
      const idData = await getNextUniqueTag();
      uniqueTag = idData.tag;
	  serialId = idData.num;

      const docRef = await addDoc(collection(db, "globalPosts"), { 
        content: text, 
        font: selectedFont, 
        authorId: MY_USER_ID,
        uniqueTag: uniqueTag,
		serialId: serialId,
        createdAt: serverTimestamp()
      });
      firebaseId = docRef.id;
	   Ledger.log("handlePost", 0, 1, 0);
	   
	   // --- 👇 ADD THIS BLOCK HERE 👇 ---
      // Sync to Supabase immediately so the Watcher finds it
      _supabase.from('posts').insert({
          id: firebaseId,      // The same ID Firebase just created
          like_count: 0,       // Initialize likes
          comment_count: 0,
          author_id: MY_USER_ID	  // Initialize comments
      }).then(({ error }) => {
          if (error) console.error("Supabase Insert Error:", error.message);
      });
      // --- 👆 END BLOCK 👆 ---
	   
    }

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
        const idData = await getNextUniqueTag();		
        
        const docRef = await addDoc(collection(db, "globalPosts"), { 
          content: post.content, 
          font: post.font || 'font-sans', 
          authorId: MY_USER_ID,
          uniqueTag: idData.tag,
		  serialId: idData.num,
          createdAt: serverTimestamp()
        });
		
		Ledger.log("publishDraft", 0, 1, 0);
		
		// --- 👇 ADD THIS BLOCK HERE 👇 ---
      // Sync to Supabase so the counters exist
      _supabase.from('posts').insert({
          id: docRef.id,       // Use the new Firebase ID
          like_count: 0,
          comment_count: 0,
		  author_id: MY_USER_ID
      }).then(({ error }) => {
          if (error) console.error("Supabase Insert Error:", error.message);
      });
      // --- 👆 END BLOCK 👆 ---

        const posts = JSON.parse(localStorage.getItem('freeform_v2')) || [];
        const targetIndex = posts.findIndex(p => p.id === post.id);
        
        if (targetIndex !== -1) {
          // Link local post to the new global ID
          posts[targetIndex].firebaseId = docRef.id;
          posts[targetIndex].uniqueTag = idData.tag;
		  posts[targetIndex].serialId = idData.num;
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
        showToast("Could not publish. Check connection.", "error");
      }
    }
  );
}

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
          // 1. FIREBASE CLEANUP (Content & Sub-collections)
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

          // 2. SUPABASE CLEANUP (Counters)
          // We use the firebaseId because that's what we used as the ID in Supabase!
          const { error } = await _supabase
            .from('posts')
            .delete()
            .eq('id', targetPost.firebaseId);

          if (error) {
            console.error("Supabase cleanup failed:", error.message);
          } else {
            console.log("Supabase record purged.");
          }

        } catch(e) {
          console.error("Cloud deletion failed:", e);
        }
      }

      // 3. LOCAL STORAGE CLEANUP
      posts = posts.filter(p => p.id !== id);
      localStorage.setItem('freeform_v2', JSON.stringify(posts));
      
      // Update UI
      allPrivatePosts = posts.reverse();
      renderPrivateBatch();
      updateMeter();
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
		Ledger.log("deleteGlobal", commentsSnapshot.size, 0, 0);
        commentsSnapshot.forEach((commentDoc) => {
          batch.delete(commentDoc.ref);
        });

        // 3. Queue up Like deletions (New)
        const likesSnapshot = await getDocs(likesRef);
		Ledger.log("deleteGlobal", likesSnapshot.size, 0, 0);
        likesSnapshot.forEach((likeDoc) => {
           batch.delete(likeDoc.ref);
        });

        // 4. Delete the Post itself
        batch.delete(postRef);

        // 5. Commit all changes at once
        await batch.commit();
		
		Ledger.log("deleteGlobal", 0, 0, commentsSnapshot.size + likesSnapshot.size + 1);
		
		// 🚀 NEW: Delete from Supabase (full removal)
        const { error } = await _supabase
          .from('posts')
          .delete()
          .eq('id', postId);

        if (error) throw error;
		
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
		
		setTimeout(() => {
          const currentVisible = document.querySelectorAll('.feed-item'); // or whatever your post class is
          if (currentVisible.length === 0) {
            console.log("[Delete] 🧹 Screen is empty, triggering placeholder.");
			totalGlobalPosts = 0;
            renderListItems([]); 
          }
        }, 350);
        
       

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
    const incrementValue = currentlyLiked ? -1 : 1;
    
    // Call the atomic procedure
    const { error } = await _supabase.rpc('toggle_like_atomic', {
      p_post_id: postId,
      p_increment: incrementValue
    });

    if (error) throw error;
    Ledger.log("toggleLike", 0, 2, 0);
  } catch (error) {
    console.error('Toggle like error:', error);
    showToast("Connection failed. Like not saved.");
  }
}
window.toggleLike = toggleLike;

async function deleteComment(postId, commentId) {
  showDialog(
    "Delete Comment",
    "Are you sure you want to remove this?",
    "Delete",
    async () => {
      try {
        // Keep Firebase: Delete comment from subcollection
        const commentRef = doc(db, "globalPosts", postId, "comments", commentId);
        await deleteDoc(commentRef);

        // Swap to Supabase: Decrement comment_count atomically
        const { error } = await _supabase.rpc('toggle_comment_count_atomic', {
          p_post_id: postId,
          p_increment: -1  // Decrement
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
  
  DOM.modalContent.innerHTML = renderSmartText(post.content);
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
    // 1. Firebase confirms the post is alive.
    // 2. Now we fetch the "True Counts" from Supabase.
    _supabase
      .from('posts')
      .select('id, like_count, comment_count')
      .eq('id', realFirestoreId)
      .maybeSingle()
      .then(({ data, error }) => {
  if (data && !error) {
    updateLocalPostWithServerData(realFirestoreId, data.comment_count, data.like_count);

    // ✅ ADD THESE: Update the Modal's own UI counters immediately
    const mLike = DOM.modal.querySelector(`.count-like-${realFirestoreId}`);
    const mComm = DOM.modal.querySelector(`.count-comment-${realFirestoreId}`);
    if (mLike) mLike.textContent = data.like_count;
    if (mComm) mComm.textContent = data.comment_count;
    
    Ledger.log("openModal_SupabaseSync", 1, 0, 0);
  }
});

    // 3. Keep the Real-time listener active so counts tick up while user reads
    if (typeof watchPostCounts === 'function') {
      watchPostCounts(realFirestoreId);
    }

  } else {
    // 🚀 THE DELETE FIX: If post is gone from Firebase, kill everything
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

    const q = query(collection(db, `globalPosts/${realFirestoreId}/comments`), orderBy("createdAt", "desc"));
    DOM.commentList.innerHTML = '<div class="text-center py-10 text-slate-300 text-sm">Loading...</div>';
    
    commentsUnsubscribe = onSnapshot(q, (snapshot) => {
      DOM.commentList.innerHTML = '';
      if (snapshot.empty) {
    DOM.commentList.innerHTML = `
      <div class="flex flex-col items-center justify-center py-10 text-center">
        <div class="mb-1 opacity-30">
          ${getThoughtBubbleSVG()}
        </div>
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
             <p class="text-[15px] text-gray-800 leading-snug break-words font-sans">${renderSmartText(c.text)}</p>
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
	  Ledger.log("openModal", snapshot.docs.length, 0, 0);
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
  
  if (activePostId && activePostListeners.has(activePostId)) {
    const unsubscribe = activePostListeners.get(activePostId);
    if (typeof unsubscribe === 'function') {
      unsubscribe(); // This triggers _supabase.removeChannel()
    }
    activePostListeners.delete(activePostId); // Wipe from the Map
  }
  
  activePostId = null;
  
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
    // Keep Firebase: Add comment to subcollection
    await addDoc(collection(db, `globalPosts/${activePostId}/comments`), {
      text: text,
      authorId: MY_USER_ID, 
      createdAt: serverTimestamp()
    });

    // Swap to Supabase: Increment comment_count atomically
    const { error } = await _supabase.rpc('toggle_comment_count_atomic', {
      p_post_id: activePostId,
      p_increment: 1  // Increment
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

async function updateLocalPostWithServerData(postId, serverCommentCount = null, serverLikeCount = null) {
  try {
    // 🚦 TRAP FIX: Explicitly check for null/undefined so 0 doesn't trigger a fetch
    let needsFetch = (serverCommentCount === null || serverLikeCount === null);
    
    let finalComments = serverCommentCount;
    let finalLikes = serverLikeCount;

    if (needsFetch) {
      const { data, error } = await _supabase
        .from('posts')
        .select('like_count, comment_count')
        .eq('id', postId)
        .maybeSingle();

      if (error || !data) return; 
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
      if (currentTab === 'private') {
        allPrivatePosts = posts.slice().reverse();
        renderPrivateBatch();
      }
    }
  } catch (error) {
    console.error('Update local post error:', error);
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
			
            const pathParts = urlObj.pathname.split('/').filter(p => p.length > 0);      
            const firstPath = pathParts.length > 0 ? `/${decodeURI(pathParts[0])}` : '';
            let displayLink = domain + firstPath;
            if (displayLink.length > 30) {
                const parts = displayLink.split('/');
                if (parts.length > 1) {
                    const d = parts[0];
                    const lastPart = parts[parts.length - 1];                  
                    if (d.length + lastPart.length + 4 < 30) {
                        displayLink = `${d}/.../${lastPart}`;
                    } else {
                        displayLink = displayLink.slice(0, 27) + '...';
                    }
                } else {
                    displayLink = displayLink.slice(0, 27) + '...';
                }
            }
    return `${leadingPunct}<a href="javascript:void(0)" 

                onclick="event.stopPropagation(); openExitModal('${cleanUrl}')" 

                class="text-blue-500 hover:text-blue-400 underline decoration-1 underline-offset-4"

                >${displayLink}</a>${trailingPunct}`;
				
        } catch (e) {
            return url;
        }
    });
}

let pendingUrl = "";

function openExitModal(url) {
    pendingUrl = url;
    document.getElementById('target-url-display').textContent = url;
    document.getElementById('confirm-exit-btn').href = url;
    document.getElementById('link-exit-modal').style.display = 'flex';
}

// Close modal if user clicks the dark background
window.onclick = function(event) {
    const modal = document.getElementById('link-exit-modal');
    if (event.target == modal) closeExitModal();
}

// Add these to the window object so the HTML onclick can see them
window.openExitModal = function(url) {
    // We don't need 'pendingUrl = url' anymore because we set the href directly
    document.getElementById('target-url-display').textContent = url;
    document.getElementById('confirm-exit-btn').href = url;
    document.getElementById('link-exit-modal').style.display = 'flex';
}

window.closeExitModal = function() {
    document.getElementById('link-exit-modal').style.display = 'none';
}

// Also make sure renderSmartText is available if needed, 
// though it's usually called inside your script logic
window.renderSmartText = renderSmartText;

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
  navigator.serviceWorker.register('sw.js');
}

document.addEventListener('DOMContentLoaded', () => {
    // 1. Scroll to Top
    document.getElementById('logoHome')?.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // 2. Focus Textarea when clicking section
    document.getElementById('inputSection')?.addEventListener('click', () => {
        document.getElementById('postInput')?.focus();
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

    console.groupCollapsed(`💰 Ledger: [${category}] +${r}R/+${w}W/+${d}D`);
    console.log(`Session Totals: ${this.reads}R | ${this.writes}W | ${this.deletes}D`);
    console.log(`Estimated Session Cost: $${cost}`);
    console.table(this.categories);
    console.groupEnd();
  }
};

// Attach to window for console access
window.Ledger = Ledger;

// publicUnsubscribe, commentsUnsubscribe, activePostListeners
// runMigration, loadFeed, updateMeter, switchTab, postComment, handlePost, 
// handleSwipeGesture for desktop vs mobile logging
