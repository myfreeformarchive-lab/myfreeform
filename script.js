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
  const PUBLIC_MODE_KEY = "publicModeEnabled";

  // Toggle Public Mode
  const toggle = document.getElementById("publicModeToggle");
  const label = document.getElementById("publicModeLabel");
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

  const isPublicMode = () => localStorage.getItem(PUBLIC_MODE_KEY) === "true";

  const getStorageSize = key => {
    const item = localStorage.getItem(key);
    return item ? new Blob([item]).size : 0;
  };

  const updateStorageInfo = () => {
    const keys = ["beliefs", "inProgress", "ideas", "writings"];
    const sizes = keys.map(getStorageSize);
    const total = sizes.reduce((a, b) => a + b, 0);
    const max = 5 * 1024 * 1024;
    const infoEl = document.getElementById("storageInfo");

    if (infoEl) {
      infoEl.innerHTML = `
        <strong>Storage Used:</strong> ${(total / 1024).toFixed(1)} KB 
        &nbsp;|&nbsp; 
        <strong>Free:</strong> ${((max - total) / 1024).toFixed(1)} KB 
        &nbsp;|&nbsp; 
        <strong>${((total / max) * 100).toFixed(2)}% of 5MB</strong>`;
    }
  };

  const pruneCollection = async (collectionName) => {
    const snapshot = await db.collection(collectionName).orderBy("createdAt", "desc").get();
    if (snapshot.size <= 6) return;
    const docsToDelete = snapshot.docs.slice(6);
    for (const doc of docsToDelete) await doc.ref.delete();
    console.log(`[PRUNE] ${collectionName}: deleted ${docsToDelete.length}`);
  };

  // ========== PAGE DETECTION ==========
  const path = window.location.pathname.toLowerCase();

  // ------- PAGE DEFINITIONS -------
  const pageConfig = [
    {
      match: "index.html",
      localKeys: ["beliefs", "inProgress"],
      setup: () => {
        // Core Beliefs
        setupList("beliefs", "beliefInput", "addBeliefBtn", "beliefList", "publicBeliefs", item => item.text);
        // In Progress
        setupList("inProgress", "progressInput", "addProgressBtn", "progressList", "publicInProgress", item => item.text);
      }
    },
    {
      match: "ideas.html",
      localKeys: ["ideas"],
      setup: () => setupList("ideas", "ideaInput", "addIdeaBtn", "ideaList", "publicIdeas", item => item.content)
    },
    {
      match: "writings.html",
      localKeys: ["writings"],
      setup: () => {
        const titleEl = document.getElementById("writingTitle");
        const contentEl = document.getElementById("writingContent");
        const btn = document.getElementById("addWritingBtn");
        const list = document.getElementById("writingList");
        let writings = JSON.parse(localStorage.getItem("writings")) || [];

        const render = () => {
          list.innerHTML = "";
          writings.slice(-5).reverse().forEach(entry => {
            const box = document.createElement("div");
            box.className = "entry-box";
            box.innerHTML = `
              <p class="entry-text writing-title">${entry.title}</p>
              <p class="entry-text writing-date">Date: ${entry.date ?? ""}</p>
              <p class="entry-text writing-content">${entry.content?.substring(0, 200) ?? ""}...</p>`;
            list.appendChild(box);
          });
        };

        btn?.addEventListener("click", async () => {
          const title = titleEl.value.trim();
          const content = contentEl.value.trim();
          if (!title || !content) return;

          const entry = { title, content, date: new Date().toLocaleDateString(), firebaseId: null };
          try {
            if (isPublicMode()) {
              const docRef = await db.collection("publicWritings").add({
                title, content, createdAt: firebase.firestore.FieldValue.serverTimestamp()
              });
              entry.firebaseId = docRef.id;
              await pruneCollection("publicWritings");
            }
            writings.push(entry);
            localStorage.setItem("writings", JSON.stringify(writings));
            titleEl.value = "";
            contentEl.value = "";
            render();
            updateStorageInfo();
          } catch (e) {
            alert("⚠️ Storage full! Cannot save new writing.");
            console.error(e);
          }
        });

        render();
      }
    }
  ];

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

  // ========= HANDLERS =========

  function setupList(key, inputId, btnId, listId, firebaseCol, extractText) {
    const input = document.getElementById(inputId);
    const btn = document.getElementById(btnId);
    const list = document.getElementById(listId);
    let items = JSON.parse(localStorage.getItem(key)) || [];

    const render = () => {
      list.innerHTML = "";
      items.slice(-5).reverse().forEach(item => {
        const box = document.createElement("div");
        box.className = "entry-box";
        box.innerHTML = `<p class="entry-text">${extractText(item)}</p>`;
        list.appendChild(box);
      });
    };

    btn?.addEventListener("click", async () => {
      const text = input.value.trim();
      if (!text) return;

      const entry = { [key === "ideas" ? "content" : "text"]: text, firebaseId: null };
      try {
        if (isPublicMode()) {
          const docRef = await db.collection(firebaseCol).add({
            content: text,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          entry.firebaseId = docRef.id;
          await pruneCollection(firebaseCol);
        }

        items.push(entry);
        localStorage.setItem(key, JSON.stringify(items));
        input.value = "";
        render();
        updateStorageInfo();
      } catch (e) {
        alert("⚠️ Storage full! Cannot save new entry.");
        console.error(e);
      }
    });

    render();
  }

  // ========= ROUTING =========
  let found = false;
  for (const page of pageConfig) {
    if (path.includes(page.match)) {
      page.setup();
      found = true;
      break;
    }
  }

  if (!found) {
    const file = path.split("/").pop();
    const config = historyPages[file];
    if (config) {
      const { key, containerId, firebaseCol, extractText } = config;
      const container = document.getElementById(containerId);
      let entries = JSON.parse(localStorage.getItem(key)) || [];

      const render = () => {
        container.innerHTML = "";
        if (!entries.length) {
          container.innerHTML = `<p>No entries saved yet.</p>`;
          return;
        }

        entries.slice().reverse().forEach((item, i) => {
          const index = entries.length - 1 - i;

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

            if (isPublicMode() && item.firebaseId) {
              try {
                await db.collection(firebaseCol).doc(item.firebaseId).delete();
                console.log("🔥 Deleted from Firestore:", item.firebaseId);
              } catch (e) {
                console.error("❌ Firebase delete failed:", e);
              }
            }

            entries.splice(index, 1);
            localStorage.setItem(key, JSON.stringify(entries));
            render();
            updateStorageInfo();
          };

          box.appendChild(content);
          box.appendChild(delBtn);
          container.appendChild(box);
        });
      };

      render();
    }
  }

  updateStorageInfo();
});
