import { initializeApp } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-app.js";
import { 
  getFirestore, collection, addDoc, deleteDoc, doc, updateDoc,
  query, orderBy, limit, serverTimestamp, onSnapshot,
  writeBatch, getDocs, increment
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
  // Modal Elements
  modal: document.getElementById('commentModal'),
  modalOverlay: document.getElementById('closeModalOverlay'),
  closeBtn: document.getElementById('closeModalBtn'),
  modalContent: document.getElementById('modalPostContent'),
  modalDate: document.getElementById('modalPostDate'),
  commentList: document.getElementById('commentsList'),
  commentInput: document.getElementById('commentInput'),
  commentInputBar: document.querySelector('#commentModal .border-t'), 
  sendComment: document.getElementById('sendCommentBtn'),
  emojiButtons: document.querySelectorAll('.emoji-btn')
};

// Application State
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

  DOM.emojiButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      DOM.commentInput.value += btn.getAttribute('data-char');
      DOM.commentInput.focus();
    });
  });

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
  currentTab = tab;
  localStorage.setItem('freeform_tab_pref', tab);
  currentLimit = BATCH_SIZE;
  updateTabClasses();
  loadFeed();
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

// ==========================================
// 4. SMART SHARE SYSTEM
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
      classes: 'hover:bg-slate-800 hover:border-slate-800 hover:text-white'
    },
    { 
      id: 'x', 
      limit: 280, 
      name: 'X',
      icon: '<span class="text-[13px] font-bold leading-none">𝕏</span>', 
      classes: 'hover:bg-black hover:border-black hover:text-white'
    },
    { 
      id: 'threads', 
      limit: 500, 
      name: 'Threads',
      icon: '<span class="text-[15px] font-sans font-bold leading-none mt-[1px]">@</span>', 
      classes: 'hover:bg-black hover:border-black hover:text-white'
    },
    { 
      id: 'whatsapp', 
      limit: 2000, 
      name: 'WhatsApp',
      icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M13.601 2.326A7.854 7.854 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.933 7.933 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.898 7.898 0 0 0 13.6 2.326zM7.994 14.521a6.573 6.573 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.557 6.557 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592z"/></svg>', 
      classes: 'hover:bg-green-500 hover:border-green-500 hover:text-white'
    },
    { 
      id: 'messenger', 
      limit: 1000, 
      name: 'Messenger',
      icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M0 7.76C0 3.301 3.493 0 8 0s8 3.301 8 7.76-3.493 7.76-8 7.76c-1.087 0-2.119-.199-3.072-.559L1.4 16l.84-3.525C1.173 11.53 0 9.735 0 7.76zm5.546-1.459-2.35 3.728c-.225.358.214.761.551.506l2.525-1.916a.48.48 0 0 1 .577-.002l2.152 1.628c.456.345 1.086.136 1.258-.419l1.614-3.695c.224-.356-.214-.76-.549-.506l-2.53 1.918a.48.48 0 0 1-.58.002L6.046 5.86c-.456-.345-1.087-.137-1.256.419z"/></svg>', 
      classes: 'hover:bg-blue-500 hover:border-blue-500 hover:text-white'
    },
    { 
      id: 'telegram', 
      limit: 4000, 
      name: 'Telegram',
      icon: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zM8.287 5.906c-.778.324-2.334.994-4.666 2.01-.378.15-.577.298-.595.442-.03.243.275.339.69.47l.175.055c.408.133.958.288 1.243.287.427-.001.826-.115 1.118-.348 1.325-1.054 2.189-1.728 2.593-2.022.287-.21.57-.18.463.15-.173.53-1.026 1.341-1.581 1.913-.393.407-.735.632-1.066.868-.344.246-.688.492-1.428 1.234.338.567.925.753 1.956 1.433.844.555 1.517.994 2.146 1.063.535.059.972-.218 1.109-.854.275-1.272.846-4.653 1.056-6.176.064-.46-.038-.853-.292-1.127-.376-.402-1.023-.427-1.397-.333z"/></svg>', 
      classes: 'hover:bg-sky-500 hover:border-sky-500 hover:text-white'
    },
    { 
      id: 'facebook', 
      limit: 60000, 
      name: 'Facebook',
      icon: '<span class="text-[14px] font-bold leading-none font-serif">f</span>', 
      classes: 'hover:bg-blue-700 hover:border-blue-700 hover:text-white'
    }
  ];

  return platforms.filter(p => totalLength <= p.limit);
}

async function sharePost(text, platform) {
  const currentUrl = window.location.href;
  const urlText = encodeURIComponent(text);
  const urlLink = encodeURIComponent(currentUrl);

  if (platform === 'copy') {
    try {
      await navigator.clipboard.writeText(`${text}\n\n${currentUrl}`);
      alert("Copied to clipboard!");
    } catch (err) {
      console.error('Failed to copy', err);
      alert("Manual copy required.");
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

function renderListItems(items) {
  if (items.length === 0) {
    DOM.list.innerHTML = `<div class="text-center py-12 border-2 border-dashed border-slate-100 rounded-xl"><p class="text-slate-500">No thoughts here yet.</p></div>`;
    return;
  }

  items.forEach(item => {
    const el = document.createElement('div');
    el.className = "feed-item bg-white p-5 rounded-xl shadow-sm border border-slate-100 mb-4 hover:shadow-md transition-shadow cursor-pointer relative";
    const time = getRelativeTime(item.createdAt);
    const fontClass = item.font || 'font-sans'; 
    const isMyGlobalPost = item.isFirebase && item.authorId === MY_USER_ID;
    
    // Logic for counting comments
    const hasCommentsAccess = item.isFirebase || item.firebaseId;
    const commentCount = item.commentCount || 0; // Display 0 if undefined

    const allowedPlatforms = getSmartShareButtons(item.content);
    
    let menuHtml = '';
    allowedPlatforms.forEach(p => {
      menuHtml += `
        <button class="share-icon-btn ${p.classes}" 
          data-platform="${p.id}" 
          title="Share on ${p.name}">
          ${p.icon}
        </button>
      `;
    });

    const shareComponent = `
      <div class="share-container relative z-20">
        <div class="share-menu" id="menu-${item.id}">
          ${menuHtml}
        </div>
        <button class="share-trigger-btn" onclick="toggleShare(event, 'menu-${item.id}')" title="Share Options">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
            <path d="M13.5 1a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM11 2.5a2.5 2.5 0 1 1 .603 1.628l-6.718 3.12a2.499 2.499 0 0 1 0 1.504l6.718 3.12a2.5 2.5 0 1 1-.488.876l-6.718-3.12a2.5 2.5 0 1 1 0-3.256l6.718-3.12A2.5 2.5 0 0 1 11 2.5zm-8.5 4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm11 5.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"/>
          </svg>
        </button>
      </div>
    `;

    // 🆕 UPDATED COMMENT BUBBLE UI
    const commentButtonHtml = `
      <div class="group flex items-center gap-1.5 relative cursor-pointer text-brand-500 hover:text-brand-700 transition-colors">
        <div class="hover:scale-110 transition-transform duration-200">
          <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-message-circle-2" width="22" height="22" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
             <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
             <path d="M3 20l1.3 -3.9a9 8 0 1 1 3.4 2.9l-4.7 1"></path>
          </svg>
        </div>
        
        <span class="text-sm font-semibold">${commentCount}</span>

        <!-- Tooltip -->
        <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-[10px] font-medium text-white bg-slate-800 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap shadow-lg">
          Comments
          <div class="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-800"></div>
        </div>
      </div>
    `;

    // Only show comment bubble if it has access (Global or Linked Local), otherwise show "Private Draft" text
    const actionArea = hasCommentsAccess 
      ? commentButtonHtml
      : `<span class="text-xs text-slate-400 font-medium italic">Private Draft</span>`;

    const footerHtml = `
      <div class="mt-3 pt-3 border-t border-slate-50 flex items-center justify-between">
        ${actionArea}
        ${shareComponent}
      </div>
    `;

    el.innerHTML = `
      <div class="flex justify-between items-start mb-2">
        <div class="flex items-center gap-2">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${item.isFirebase ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-500'}">
            ${item.isFirebase ? 'Global' : 'Local'}
          </span>
          <span class="text-xs text-slate-500 font-medium">${time}</span>
        </div>
      </div>
      <p class="text-slate-800 whitespace-pre-wrap leading-relaxed text-[17px] pointer-events-none ${fontClass}">${cleanText(item.content)}</p>
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

    el.onclick = (e) => {
      if (e.target.closest('button') || e.target.closest('.share-container')) return;
      openModal(item);
    };

    const platformBtns = el.querySelectorAll('.share-icon-btn');
    platformBtns.forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const platform = btn.getAttribute('data-platform');
        sharePost(item.content, platform);
        
        const menu = el.querySelector('.share-menu');
        const trigger = el.querySelector('.share-trigger-btn');
        if (menu) menu.classList.remove('active');
        if (trigger) trigger.classList.remove('active');
      };
    });
    
    DOM.list.appendChild(el);
  });
}

window.toggleShare = function(event, menuId) {
  event.stopPropagation();
  const menu = document.getElementById(menuId);
  const trigger = event.currentTarget;
  
  if (!menu) return;

  const isActive = menu.classList.contains('active');

  document.querySelectorAll('.share-menu.active').forEach(m => {
    m.classList.remove('active');
    if(m.nextElementSibling) m.nextElementSibling.classList.remove('active');
  });

  if (!isActive) {
    menu.classList.add('active');
    trigger.classList.add('active');
  }
};

// ==========================================
// 5. POST ACTIONS & SCROLL
// ==========================================
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
    let firebaseId = null;

    if (isPublic) {
      const docRef = await addDoc(collection(db, "globalPosts"), { 
        content: text, 
        font: selectedFont, 
        authorId: MY_USER_ID,
        createdAt: serverTimestamp(),
        commentCount: 0 // Initialize count
      });
      firebaseId = docRef.id; 
    }

    const newPost = { 
      id: Date.now().toString(), 
      content: text, 
      font: selectedFont, 
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
    alert("Error: " + error.message); 
  } finally { 
    DOM.btn.textContent = "Post"; 
    DOM.btn.disabled = false; 
  }
}

async function publishDraft(post) {
  if (!confirm("Are you sure you want to make this post public? It will appear in the Global Feed.")) return;
  
  try {
    const docRef = await addDoc(collection(db, "globalPosts"), { 
      content: post.content, 
      font: post.font || 'font-sans', 
      authorId: MY_USER_ID,
      createdAt: serverTimestamp(),
      commentCount: 0
    });

    const posts = JSON.parse(localStorage.getItem('freeform_v2')) || [];
    const targetIndex = posts.findIndex(p => p.id === post.id);
    
    if (targetIndex !== -1) {
      posts[targetIndex].firebaseId = docRef.id;
      posts[targetIndex].commentCount = 0;
      localStorage.setItem('freeform_v2', JSON.stringify(posts));
      
      allPrivatePosts = posts.reverse();
      loadFeed();
      
      const updatedPost = posts.find(p => p.id === post.id);
      openModal(updatedPost);
    }

  } catch (e) {
    console.error("Error publishing draft:", e);
    alert("Could not publish post. Check connection.");
  }
}

async function deleteLocal(id) {
  if (!confirm("Delete from Archive?")) return;
  
  let posts = JSON.parse(localStorage.getItem('freeform_v2')) || [];
  const targetPost = posts.find(p => p.id === id);

  if (targetPost && targetPost.firebaseId) {
    try {
      const batch = writeBatch(db);
      const postRef = doc(db, "globalPosts", targetPost.firebaseId);
      const commentsRef = collection(db, "globalPosts", targetPost.firebaseId, "comments");
      const commentsSnapshot = await getDocs(commentsRef);

      commentsSnapshot.forEach(doc => batch.delete(doc.ref));
      batch.delete(postRef);
      await batch.commit();
    } catch(e) {
      console.warn("Global version already gone or unreachable:", e);
    }
  }

  posts = posts.filter(p => p.id !== id);
  localStorage.setItem('freeform_v2', JSON.stringify(posts));
  allPrivatePosts = posts.reverse();
  renderPrivateBatch();
  updateMeter();
}

async function deleteGlobal(postId) {
  if (!confirm("Delete from Global?")) return;

  try {
    const batch = writeBatch(db);
    const postRef = doc(db, "globalPosts", postId);
    const commentsRef = collection(db, "globalPosts", postId, "comments");
    const commentsSnapshot = await getDocs(commentsRef);

    commentsSnapshot.forEach((commentDoc) => {
      batch.delete(commentDoc.ref);
    });

    batch.delete(postRef);

    await batch.commit();
    
    console.log(`Successfully deleted post ${postId} and ${commentsSnapshot.size} comments.`);

    let posts = JSON.parse(localStorage.getItem('freeform_v2')) || [];
    let updated = false;

    posts = posts.map(p => {
      if (p.firebaseId === postId) {
        delete p.firebaseId; 
        updated = true;
      }
      return p;
    });

    if (updated) {
      localStorage.setItem('freeform_v2', JSON.stringify(posts));
      allPrivatePosts = posts.reverse();
      if (currentTab === 'private') {
        renderPrivateBatch();
      }
    }

  } catch (e) {
    console.error("Error during batch delete:", e);
    alert("Delete failed. You might not have permission or a connection issue.");
  }
}

async function deleteComment(postId, commentId) {
  if (!confirm("Delete this comment?")) return;

  try {
    const commentRef = doc(db, "globalPosts", postId, "comments", commentId);
    await deleteDoc(commentRef);
    
    // 🆕 Update count on parent doc (Decrement)
    const postRef = doc(db, "globalPosts", postId);
    await updateDoc(postRef, {
        commentCount: increment(-1)
    });

    console.log("Comment deleted successfully");
  } catch (e) {
    console.error("Error deleting comment:", e);
    alert("Could not delete comment. You might not have permission.");
  }
}

// ==========================================
// 6. MODAL LOGIC
// ==========================================
function openModal(post) {
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
             <p class="text-sm text-gray-800 leading-snug break-words font-sans">${cleanText(c.text)}</p>
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
  DOM.modal.classList.add('hidden');
  document.body.style.overflow = ''; 
  activePostId = null;
  if (commentsUnsubscribe) { commentsUnsubscribe(); commentsUnsubscribe = null; }
  
  if (DOM.input) {
    DOM.input.disabled = false;
  }
}

async function postComment() {
  const text = DOM.commentInput.value.trim();
  if (!text || !activePostId) return;

  DOM.sendComment.disabled = true;
  DOM.sendComment.style.opacity = "0.5";

  try {
    await addDoc(collection(db, `globalPosts/${activePostId}/comments`), {
      text: text,
      authorId: MY_USER_ID, 
      createdAt: serverTimestamp()
    });

    // 🆕 Update count on parent doc (Increment)
    const postRef = doc(db, "globalPosts", activePostId);
    await updateDoc(postRef, {
        commentCount: increment(1)
    });

    DOM.commentInput.value = '';
    
    const scrollArea = document.getElementById('modalScrollArea');
    scrollArea.scrollTop = 0; 

  } catch (e) { console.error(e); } 
  finally { 
    DOM.sendComment.disabled = false; 
    DOM.sendComment.style.opacity = "1";
    DOM.commentInput.focus();
  }
}

// ==========================================
// 7. UTILITIES
// ==========================================
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
