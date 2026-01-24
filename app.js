import { initializeApp } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-app.js";
import { 
  getFirestore, collection, addDoc, 
  query, orderBy, limit, serverTimestamp, onSnapshot 
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

// === STATE ===
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
  // Modal
  modal: document.getElementById('commentModal'),
  modalOverlay: document.getElementById('closeModalOverlay'),
  closeBtn: document.getElementById('closeModalBtn'),
  modalContent: document.getElementById('modalPostContent'),
  modalDate: document.getElementById('modalPostDate'),
  commentList: document.getElementById('commentsList'),
  commentInput: document.getElementById('commentInput'),
  sendComment: document.getElementById('sendCommentBtn'),
  emojiButtons: document.querySelectorAll('.emoji-btn')
};

let currentTab = 'private';
let publicUnsubscribe = null;
let activePostId = null;
let commentsUnsubscribe = null;
const BATCH_SIZE = 15;
let currentLimit = BATCH_SIZE;
let isLoadingMore = false;
let allPrivatePosts = []; 

// === INIT ===
document.addEventListener('DOMContentLoaded', () => {
  runMigration();
  setRandomPlaceholder();
  loadFeed(); 
  updateMeter();
  setupInfiniteScroll();

  DOM.btn.addEventListener('click', handlePost);
  DOM.toggle.addEventListener('change', updateToggleUI);
  DOM.tabPrivate.addEventListener('click', () => switchTab('private'));
  DOM.tabPublic.addEventListener('click', () => switchTab('public'));

  DOM.modalOverlay.addEventListener('click', closeModal);
  DOM.closeBtn.addEventListener('click', closeModal);
  DOM.sendComment.addEventListener('click', postComment);
  
  DOM.commentInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') postComment();
  });

  DOM.emojiButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const char = btn.getAttribute('data-char');
      DOM.commentInput.value += char;
      DOM.commentInput.focus();
    });
  });
});

function setRandomPlaceholder() {
  const phrases = [
    "What's on your mind?", "Share your ideas...", "What's the vibe today?",
    "Capture a thought...", "Everything starts with a note...", 
    "Unfinished thoughts welcome...", "Notes for your future self..."
  ];
  DOM.input.placeholder = phrases[Math.floor(Math.random() * phrases.length)];
}

// === TABS & FEED ===
function switchTab(tab) {
  if (currentTab === tab) return;
  currentTab = tab;
  currentLimit = BATCH_SIZE;
  const activeClass = "flex-1 pb-3 text-sm font-bold text-brand-600 border-b-2 border-brand-500 transition-all";
  const inactiveClass = "flex-1 pb-3 text-sm font-semibold text-slate-500 hover:text-slate-700 transition-all";

  if (tab === 'private') {
    DOM.tabPrivate.className = activeClass;
    DOM.tabPublic.className = inactiveClass;
  } else {
    DOM.tabPublic.className = activeClass;
    DOM.tabPrivate.className = inactiveClass;
  }
  loadFeed();
}

function updateToggleUI() {
  const isPublic = DOM.toggle.checked;
  DOM.label.textContent = isPublic ? "Public Mode" : "Private Mode";
  DOM.label.className = isPublic 
    ? "text-xs font-bold text-brand-600 transition-colors"
    : "text-xs font-semibold text-slate-500 transition-colors";
}

function loadFeed() {
  DOM.list.innerHTML = ''; 
  if (publicUnsubscribe) { publicUnsubscribe(); publicUnsubscribe = null; }

  if (currentTab === 'private') {
    allPrivatePosts = (JSON.parse(localStorage.getItem('freeform_v2')) || []).reverse();
    renderPrivateBatch();
  } else {
    subscribePublicFeed();
  }
}

function renderPrivateBatch() {
  const visible = allPrivatePosts.slice(0, currentLimit);
  DOM.list.innerHTML = ''; 
  renderListItems(visible);
  DOM.loadTrigger.style.display = (currentLimit >= allPrivatePosts.length) ? 'none' : 'flex';
}

function subscribePublicFeed() {
  if (publicUnsubscribe) publicUnsubscribe();
  const q = query(collection(db, "globalPosts"), orderBy("createdAt", "desc"), limit(currentLimit));
  DOM.loadTrigger.style.display = 'flex'; 

  publicUnsubscribe = onSnapshot(q, (snapshot) => {
    const posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), isFirebase: true }));
    DOM.list.innerHTML = '';
    renderListItems(posts);
    isLoadingMore = false;
    DOM.loadTrigger.style.opacity = '0';
  });
}

function renderListItems(items) {
  if (items.length === 0) {
    DOM.list.innerHTML = `<div class="text-center py-12 border-2 border-dashed border-slate-100 rounded-xl"><p class="text-slate-400">No thoughts here yet.</p></div>`;
    return;
  }

  items.forEach(item => {
    const el = document.createElement('div');
    el.className = "feed-item bg-white p-5 rounded-xl shadow-sm border border-slate-100 mb-4 hover:shadow-md transition-shadow cursor-pointer";
    const time = getRelativeTime(item.createdAt);

    el.innerHTML = `
      <div class="flex justify-between items-start mb-2">
        <div class="flex items-center gap-2">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${item.isFirebase ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-500'}">
            ${item.isFirebase ? 'Global' : 'Local'}
          </span>
          <span class="text-xs text-slate-400 font-medium">${time}</span>
        </div>
      </div>
      <p class="text-slate-800 whitespace-pre-wrap leading-relaxed text-[15px] pointer-events-none">${cleanText(item.content)}</p>
      ${item.isFirebase ? `<div class="mt-3 pt-3 border-t border-slate-50 flex items-center text-xs text-brand-500 font-medium gap-1"><span class="text-base">💬</span> View Comments</div>` : ''}
    `;

    if (item.isFirebase) {
      el.onclick = () => openModal(item);
    } else {
      const delBtn = document.createElement('button');
      delBtn.className = "absolute top-4 right-4 text-slate-300 hover:text-red-500 transition-colors z-10 p-2";
      delBtn.innerHTML = "✕";
      delBtn.onclick = (e) => { e.stopPropagation(); deleteLocal(item.id); };
      el.style.position = 'relative';
      el.appendChild(delBtn);
    }
    DOM.list.appendChild(el);
  });
}

function setupInfiniteScroll() {
  const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !isLoadingMore) loadMoreData();
  }, { root: null, threshold: 0.1 });
  observer.observe(DOM.loadTrigger);
}

function loadMoreData() {
  isLoadingMore = true;
  DOM.loadTrigger.style.opacity = '1'; 
  setTimeout(() => {
    currentLimit += BATCH_SIZE;
    if (currentTab === 'private') {
      renderPrivateBatch();
      isLoadingMore = false;
      DOM.loadTrigger.style.opacity = '0';
    } else {
      subscribePublicFeed(); 
    }
  }, 500);
}

async function handlePost() {
  const text = DOM.input.value.trim();
  if (!text) return;
  const isPublic = DOM.toggle.checked;
  DOM.btn.textContent = "...";
  DOM.btn.disabled = true;

  try {
    const posts = JSON.parse(localStorage.getItem('freeform_v2')) || [];
    posts.push({ id: Date.now().toString(), content: text, createdAt: new Date().toISOString(), isFirebase: false });
    localStorage.setItem('freeform_v2', JSON.stringify(posts));
    updateMeter();

    if (isPublic) {
      await addDoc(collection(db, "globalPosts"), { content: text, createdAt: serverTimestamp() });
      if (currentTab === 'private') switchTab('public');
    } else {
      if (currentTab === 'public') switchTab('private');
      else { allPrivatePosts = posts.reverse(); renderPrivateBatch(); }
    }
    DOM.input.value = "";
    setRandomPlaceholder(); 
  } catch (error) { alert("Error: " + error.message); } 
  finally { DOM.btn.textContent = "Post"; DOM.btn.disabled = false; }
}

function deleteLocal(id) {
  if (!confirm("Delete?")) return;
  let posts = JSON.parse(localStorage.getItem('freeform_v2')) || [];
  posts = posts.filter(p => p.id !== id);
  localStorage.setItem('freeform_v2', JSON.stringify(posts));
  allPrivatePosts = posts.reverse();
  renderPrivateBatch();
  updateMeter();
}

// ==========================================
// 💬 MODAL (COMMENTS - NEWEST FIRST)
// ==========================================
function openModal(post) {
  activePostId = post.id;
  DOM.modalContent.textContent = post.content;
  DOM.modalDate.textContent = getRelativeTime(post.createdAt);
  
  DOM.modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  // CHANGED: 'asc' -> 'desc' (Newest at Top)
  const q = query(collection(db, `globalPosts/${post.id}/comments`), orderBy("createdAt", "desc"));
  
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

      div.className = "comment-bubble flex flex-col items-start";
      div.innerHTML = `
        <div class="bg-gray-100 px-4 py-2.5 rounded-2xl rounded-tl-none max-w-[90%]">
           <p class="text-sm text-gray-800 leading-snug break-words">${cleanText(c.text)}</p>
        </div>
        <span class="text-[10px] text-gray-400 mt-1 ml-1">${time}</span>
      `;
      DOM.commentList.appendChild(div);
    });
    
    // REMOVED: Auto-scroll to bottom. 
    // Since newest are at the top, the default scroll position (top) is correct.
  });
}

function closeModal() {
  DOM.modal.classList.add('hidden');
  document.body.style.overflow = ''; 
  activePostId = null;
  if (commentsUnsubscribe) { commentsUnsubscribe(); commentsUnsubscribe = null; }
}

async function postComment() {
  const text = DOM.commentInput.value.trim();
  if (!text || !activePostId) return;

  DOM.sendComment.disabled = true;
  DOM.sendComment.style.opacity = "0.5";

  try {
    await addDoc(collection(db, `globalPosts/${activePostId}/comments`), {
      text: text,
      createdAt: serverTimestamp()
    });
    DOM.commentInput.value = '';
    
    // Slight scroll to top to ensure user sees their new comment
    const scrollArea = document.getElementById('modalScrollArea');
    scrollArea.scrollTop = 0; 

  } catch (e) { console.error(e); } 
  finally { 
    DOM.sendComment.disabled = false; 
    DOM.sendComment.style.opacity = "1";
    DOM.commentInput.focus();
  }
}

// === UTILS ===
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
