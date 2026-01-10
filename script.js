console.log("💡 My Freeform logic loaded.");

// ========== FIREBASE INIT ==========
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

// ========== DOM READY ==========
document.addEventListener("DOMContentLoaded", () => {
  const path = window.location.pathname;
  const currentFile = path.split("/").pop(); // fixes everything

  // ========== TOGGLE SHARED ==========
  const toggle = document.getElementById("publicModeToggle");
  const label = document.getElementById("publicModeLabel");
  const PUBLIC_MODE_KEY = "publicModeEnabled";

  if (toggle && label) {
    const saved = localStorage.getItem(PUBLIC_MODE_KEY) === "true";
    toggle.checked = saved;
    label.textContent = saved ? "Public Mode: ON" : "Public Mode: OFF";
    toggle.addEventListener("change", () => {
      const val = toggle.checked;
      localStorage.setItem(PUBLIC_MODE_KEY, val);
      label.textContent = val ? "Public Mode: ON" : "Public Mode: OFF";
    });
  }

  // ========== FIREBASE PRUNE ==========
  async function pruneCollection(collectionName) {
    const snapshot = await db
      .collection(collectionName)
      .orderBy("createdAt", "desc")
      .get();

    if (snapshot.size <= 30) return;
    const docsToDelete = snapshot.docs.slice(30);
    for (const doc of docsToDelete) await doc.ref.delete();

    console.log(`[PRUNE] ${collectionName}: deleted ${docsToDelete.length}`);
  }

  // ========== SHARED HELPERS ==========
  const getStorageSize = (key) => {
    const item = localStorage.getItem(key);
    return item ? new Blob([item]).size : 0;
  };

  const updateStorageInfo = () => {
    const keys = ["beliefs", "inProgress", "ideas", "writings"];
    const sizes = keys.map(getStorageSize);
    const total = sizes.reduce((a, b) => a + b, 0);

    const max = 5 * 1024 * 1024;
    const usedKB = (total / 1024).toFixed(1);
    const freeKB = ((max - total) / 1024).toFixed(1);
    const percent = ((total / max) * 100).toFixed(2);

    const infoEl = document.getElementById("storageInfo");
    if (infoEl) {
      infoEl.innerHTML = `
        <strong>Storage Used:</strong> ${usedKB} KB 
        &nbsp;|&nbsp; 
        <strong>Free:</strong> ${freeKB} KB 
        &nbsp;|&nbsp; 
        <strong>${percent}% of 5MB</strong>`;
    }
  };

  const isPublicMode = () => localStorage.getItem(PUBLIC_MODE_KEY) === "true";

  // -----------------------------
  // 🧠 INDEX PAGE — beliefs / inProgress
  // -----------------------------
  if (currentFile === "index.html" || currentFile === "") {
    const beliefInput = document.getElementById("beliefInput");
    const addBeliefBtn = document.getElementById("addBeliefBtn");
    const beliefList = document.getElementById("beliefList");

    let beliefs = JSON.parse(localStorage.getItem("beliefs")) || [];

    const renderBeliefs = () => {
      beliefList.innerHTML = "";
      beliefs.slice(-5).reverse().forEach(item => {
        const box = document.createElement("div");
        box.className = "entry-box";
        box.innerHTML = `<p class="entry-text">${item.text}</p>`;
        beliefList.appendChild(box);
      });
    };

    addBeliefBtn?.addEventListener("click", async () => {
      const text = beliefInput.value.trim();
      if (!text) return;

      const belief = { text, firebaseId: null };
      try {
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
      } catch (e) {
        alert("⚠️ Storage full! Cannot save new belief.");
        console.error(e);
      }
    });

    renderBeliefs();

    const progressInput = document.getElementById("progressInput");
    const addProgressBtn = document.getElementById("addProgressBtn");
    const progressList = document.getElementById("progressList");

    let inProgress = JSON.parse(localStorage.getItem("inProgress")) || [];

    const renderProgress = () => {
      progressList.innerHTML = "";
      inProgress.slice(-5).reverse().forEach(item => {
        const box = document.createElement("div");
        box.className = "entry-box";
        box.innerHTML = `<p class="entry-text">${item.text}</p>`;
        progressList.appendChild(box);
      });
    };

    addProgressBtn?.addEventListener("click", async () => {
      const text = progressInput.value.trim();
      if (!text) return;

      const entry = { text, firebaseId: null };
      try {
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
      } catch (e) {
        alert("⚠️ Storage full! Cannot save new entry.");
        console.error(e);
      }
    });

    renderProgress();
  }

  // -----------------------------
  // 💡 IDEAS PAGE
  // -----------------------------
  else if (currentFile === "ideas.html") {
    const ideaInput = document.getElementById("ideaInput");
    const addIdeaBtn = document.getElementById("addIdeaBtn");
    const ideaList = document.getElementById("ideaList");

    let ideas = JSON.parse(localStorage.getItem("ideas")) || [];

    const renderIdeas = () => {
      ideaList.innerHTML = "";
      ideas.slice(-5).reverse().forEach(item => {
        const box = document.createElement("div");
        box.className = "entry-box";
        box.innerHTML = `<p class="entry-text">${item.content}</p>`;
        ideaList.appendChild(box);
      });
    };

    addIdeaBtn?.addEventListener("click", async () => {
      const text = ideaInput.value.trim();
      if (!text) return;

      const entry = { content: text, firebaseId: null };
      try {
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
      } catch (e) {
        alert("⚠️ Storage full! Cannot save new idea.");
        console.error(e);
      }
    });

    renderIdeas();
  }

  // -----------------------------
  // ✍️ WRITINGS PAGE
  // -----------------------------
  else if (currentFile === "writings.html") {
    const writingTitle = document.getElementById("writingTitle");
    const writingContent = document.getElementById("writingContent");
    const addWritingBtn = document.getElementById("addWritingBtn");
    const writingList = document.getElementById("writingList");

    let writings = JSON.parse(localStorage.getItem("writings")) || [];

    const renderWritings = () => {
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
    };

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

      try {
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
      } catch (e) {
        alert("⚠️ Storage full! Cannot save new writing.");
        console.error(e);
      }
    });

    renderWritings();
  }

  // -----------------------------
  // 🗂️ HISTORY PAGES HANDLER
  // -----------------------------
  const historyPages = {
    "belief-history.html": {
      key: "beliefs",
      containerId: "fullBeliefList",
      firebaseCol: "publicBeliefs",
      extractText: item => item.text
    },
    "in-progress-history.html": {
      key: "inProgress",
      containerId: "fullProgressList",
      firebaseCol: "publicInProgress",
      extractText: item => item.text
    },
    "idea-history.html": {
      key: "ideas",
      containerId: "fullIdeaList",
      firebaseCol: "publicIdeas",
      extractText: item => item.content
    },
    "writing-history.html": {
      key: "writings",
      containerId: "fullWritingList",
      firebaseCol: "publicWritings",
      extractText: item => `${item.title} - ${item.date || ""}<br>${item.content}`
    }
  };

  if (historyPages[currentFile]) {
    const { key, containerId, firebaseCol, extractText } = historyPages[currentFile];
    const container = document.getElementById(containerId);
    let entries = JSON.parse(localStorage.getItem(key)) || [];

    const renderHistory = () => {
      container.innerHTML = "";
      if (!entries.length) {
        container.innerHTML = `<p>No entries saved yet.</p>`;
        return;
      }

      entries.slice().reverse().forEach((item, indexFromEnd) => {
        const index = entries.length - 1 - indexFromEnd;

        const box = document.createElement("div");
        box.className = "entry-box";

        const content = document.createElement("p");
        content.className = "entry-text";
        content.innerHTML = extractText(item);

        const delBtn = document.createElement("button");
        delBtn.className = "delete-entry-btn";
        delBtn.textContent = "Delete";

        delBtn.onclick = async () => {
          if (!confirm("Are you sure you want to delete this entry?")) return;

          const publicMode = isPublicMode();
          if (publicMode && item.firebaseId) {
            try {
              await db.collection(firebaseCol).doc(item.firebaseId).delete();
              console.log("🔥 Deleted from Firestore:", item.firebaseId);
            } catch (e) {
              console.error("❌ Firebase delete failed:", e);
            }
          }

          entries.splice(index, 1);
          localStorage.setItem(key, JSON.stringify(entries));
          renderHistory();
          updateStorageInfo();
        };

        box.appendChild(content);
        box.appendChild(delBtn);
        container.appendChild(box);
      });
    };

    renderHistory();
  }

  // Final shared storage meter update
  updateStorageInfo();
});

