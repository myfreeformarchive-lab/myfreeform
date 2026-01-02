console.log("💡 My Freeform logic loaded.");

// =========================
// 🚀 FIREBASE INIT
// =========================
const firebaseConfig = {
  apiKey: "AIzaSyBD-8hcoAuTFaAhgSy-WIyQX_iI37uokTw",
  authDomain: "myfreeformarchive-8a786.firebaseapp.com",
  projectId: "myfreeformarchive-8a786",
  storageBucket: "myfreeformarchive-8a786.appspot.com",
  messagingSenderId: "16237442482",
  appId: "1:16237442482:web:424f8f2e344a58e7f6a0ab"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// =========================
// 🧠 DOM READY
// =========================
document.addEventListener("DOMContentLoaded", () => {

  const PUBLIC_MODE_KEY = "publicModeEnabled";

  // ---- PUBLIC MODE TOGGLE ----
  const toggle = document.getElementById("publicModeToggle");
  const label = document.getElementById("publicModeLabel");

  if (toggle && label) {
    const saved = localStorage.getItem(PUBLIC_MODE_KEY) === "true";
    toggle.checked = saved;
    label.textContent = saved ? "Public Mode: ON" : "Public Mode: OFF";
    toggle.addEventListener("change", () => {
      localStorage.setItem(PUBLIC_MODE_KEY, toggle.checked);
      label.textContent = toggle.checked ? "Public Mode: ON" : "Public Mode: OFF";
    });
  }

  const isPublicMode = () => localStorage.getItem(PUBLIC_MODE_KEY) === "true";

  // ---- STORAGE METER ----
  const getStorageSize = key => {
    const item = localStorage.getItem(key);
    return item ? new Blob([item]).size : 0;
  };

  const updateStorageInfo = () => {
    const keys = ["beliefs", "inProgress", "ideas", "writings"];
    const total = keys.reduce((sum, k) => sum + getStorageSize(k), 0);
    const max = 5 * 1024 * 1024;
    const usedKB = (total / 1024).toFixed(1);
    const freeKB = ((max - total) / 1024).toFixed(1);
    const infoEl = document.getElementById("storageInfo");

    if (infoEl) {
      infoEl.innerHTML = `
        <strong>Storage Used:</strong> ${usedKB} KB
        &nbsp;|&nbsp;
        <strong>Free:</strong> ${freeKB} KB
        &nbsp;|&nbsp;
        <strong>${((total / max) * 100).toFixed(2)}% of 5MB</strong>
      `;
    }
  };

  // ---- PRUNE FIRESTORE ----
  async function pruneCollection(collectionName) {
    const snapshot = await db
      .collection(collectionName)
      .orderBy("createdAt", "desc")
      .get();

    if (snapshot.size <= 6) return;

    const docsToDelete = snapshot.docs.slice(6);
    for (const doc of docsToDelete) {
      await doc.ref.delete();
    }
    console.log(`[PRUNE] ${collectionName}: deleted ${docsToDelete.length}`);
  }

  // =========================
  // 🧾 DETERMINE PAGE
  // =========================
  const currentPath = window.location.pathname.toLowerCase();
  const currentFile = currentPath.split("/").pop();

  // =========================
  // 📂 MAIN PAGES
  // =========================

  // -------- INDEX PAGE --------
  if (currentFile === "" || currentFile === "index.html") {
    // ---- Beliefs ----
    let beliefs = JSON.parse(localStorage.getItem("beliefs")) || [];
    const beliefList = document.getElementById("beliefList");
    const beliefInput = document.getElementById("beliefInput");
    const addBeliefBtn = document.getElementById("addBeliefBtn");

    function renderBeliefs() {
      beliefList.innerHTML = "";
      beliefs.slice(-5).reverse().forEach(item => {
        const box = document.createElement("div");
        box.className = "entry-box";
        box.innerHTML = `<p class="entry-text">${item.text}</p>`;
        beliefList.appendChild(box);
      });
    }

    addBeliefBtn?.addEventListener("click", async () => {
      const text = beliefInput.value.trim();
      if (!text) return;

      const belief = { text, firebaseId: null };
      if (isPublicMode()) {
        const docRef = await db.collection("publicBeliefs").add({
          content: text,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        belief.firebaseId = docRef.id;
        await pruneCollection("publicBeliefs");
      }

      beliefs.push(belief);
      localStorage.setItem("beliefs", JSON.stringify(beliefs));
      beliefInput.value = "";
      renderBeliefs();
      updateStorageInfo();
    });

    renderBeliefs();

    // ---- In Progress ----
    let inProgress = JSON.parse(localStorage.getItem("inProgress")) || [];
    const progressList = document.getElementById("progressList");
    const progressInput = document.getElementById("progressInput");
    const addProgressBtn = document.getElementById("addProgressBtn");

    function renderProgress() {
      progressList.innerHTML = "";
      inProgress.slice(-5).reverse().forEach(item => {
        const box = document.createElement("div");
        box.className = "entry-box";
        box.innerHTML = `<p class="entry-text">${item.text}</p>`;
        progressList.appendChild(box);
      });
    }

    addProgressBtn?.addEventListener("click", async () => {
      const text = progressInput.value.trim();
      if (!text) return;

      const entry = { text, firebaseId: null };
      if (isPublicMode()) {
        const docRef = await db.collection("publicInProgress").add({
          content: text,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        entry.firebaseId = docRef.id;
        await pruneCollection("publicInProgress");
      }

      inProgress.push(entry);
      localStorage.setItem("inProgress", JSON.stringify(inProgress));
      progressInput.value = "";
      renderProgress();
      updateStorageInfo();
    });

    renderProgress();
    updateStorageInfo();
  }

  // -------- IDEAS PAGE --------
  if (currentFile === "ideas.html") {
    let ideas = JSON.parse(localStorage.getItem("ideas")) || [];
    const ideaList = document.getElementById("ideaList");
    const ideaInput = document.getElementById("ideaInput");
    const addIdeaBtn = document.getElementById("addIdeaBtn");

    function renderIdeas() {
      ideaList.innerHTML = "";
      ideas.slice(-5).reverse().forEach(item => {
        const box = document.createElement("div");
        box.className = "entry-box";
        box.innerHTML = `<p class="entry-text">${item.content}</p>`;
        ideaList.appendChild(box);
      });
    }

    addIdeaBtn?.addEventListener("click", async () => {
      const text = ideaInput.value.trim();
      if (!text) return;

      const entry = { content: text, firebaseId: null };
      if (isPublicMode()) {
        const docRef = await db.collection("publicIdeas").add({
          content: text,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        entry.firebaseId = docRef.id;
        await pruneCollection("publicIdeas");
      }

      ideas.push(entry);
      localStorage.setItem("ideas", JSON.stringify(ideas));
      ideaInput.value = "";
      renderIdeas();
      updateStorageInfo();
    });

    renderIdeas();
    updateStorageInfo();
  }

  // -------- WRITINGS PAGE --------
  if (currentFile === "writings.html") {
    let writings = JSON.parse(localStorage.getItem("writings")) || [];
    const writingList = document.getElementById("writingList");
    const writingTitle = document.getElementById("writingTitle");
    const writingContent = document.getElementById("writingContent");
    const addWritingBtn = document.getElementById("addWritingBtn");

    function renderWritings() {
      writingList.innerHTML = "";
      writings.slice(-5).reverse().forEach(entry => {
        const box = document.createElement("div");
        box.className = "entry-box";
        box.innerHTML = `
          <p class="entry-text writing-title">${entry.title}</p>
          <p class="entry-text writing-date">Date: ${entry.date ?? ""}</p>
          <p class="entry-text writing-content">
            ${entry.content?.substring(0, 200) ?? ""}...
          </p>`;
        writingList.appendChild(box);
      });
    }

    addWritingBtn?.addEventListener("click", async () => {
      const title = writingTitle.value.trim();
      const content = writingContent.value.trim();
      if (!title || !content) return;

      const entry = {
        title,
        content,
        date: new Date().toLocaleDateString(),
        firebaseId: null
      };

      if (isPublicMode()) {
        const docRef = await db.collection("publicWritings").add({
          title,
          content,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        entry.firebaseId = docRef.id;
        await pruneCollection("publicWritings");
      }

      writings.push(entry);
      localStorage.setItem("writings", JSON.stringify(writings));
      writingTitle.value = "";
      writingContent.value = "";
      renderWritings();
      updateStorageInfo();
    });

    renderWritings();
    updateStorageInfo();
  }

  // =========================
  // 🗂 HISTORY PAGE HANDLER
  // =========================
  const historyMap = {
    "belief-history.html":   { key: "beliefs",     containerId: "fullBeliefList",      firebaseCol: "publicBeliefs",     extract: i => i.text },
    "in-progress-history.html": { key: "inProgress",  containerId: "fullProgressList",     firebaseCol: "publicInProgress",  extract: i => i.text },
    "idea-history.html":     { key: "ideas",       containerId: "fullIdeaList",        firebaseCol: "publicIdeas",       extract: i => i.content },
    "writing-history.html":  { key: "writings",    containerId: "fullWritingList",     firebaseCol: "publicWritings",    extract: i => `${i.title} - ${i.date}<br>${i.content}` }
  };

  const histConfig = historyMap[currentFile];
  if (histConfig) {
    let entries = JSON.parse(localStorage.getItem(histConfig.key)) || [];
    const container = document.getElementById(histConfig.containerId);

    function renderHistory() {
      container.innerHTML = "";
      if (!entries.length) {
        container.innerHTML = "<p>No entries saved yet.</p>";
        return;
      }
      entries.slice().reverse().forEach((item, idx) => {
        const realIndex = entries.length - 1 - idx;
        const box = document.createElement("div");
        box.className = "entry-box";

        const p = document.createElement("p");
        p.className = "entry-text";
        p.innerHTML = histConfig.extract(item);

        const delBtn = document.createElement("button");
        delBtn.className = "delete-entry-btn";
        delBtn.textContent = "Delete";

        delBtn.onclick = async () => {
          if (!confirm("Delete this entry?")) return;
          if (isPublicMode() && item.firebaseId) {
            try {
              await db.collection(histConfig.firebaseCol).doc(item.firebaseId).delete();
            } catch (e) { console.error(e); }
          }
          entries.splice(realIndex, 1);
          localStorage.setItem(histConfig.key, JSON.stringify(entries));
          renderHistory();
          updateStorageInfo();
        };

        box.appendChild(p);
        box.appendChild(delBtn);
        container.appendChild(box);
      });
    }

    renderHistory();
    updateStorageInfo();
  }
});
