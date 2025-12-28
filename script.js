console.log("Philosophy archive loaded.");

document.addEventListener("DOMContentLoaded", () => {
	
const toggle = document.getElementById("publicModeToggle");
const label = document.getElementById("publicModeLabel");

if (toggle && label) {
  toggle.addEventListener("change", () => {
    label.textContent = toggle.checked
      ? "Public Mode: ON"
      : "Public Mode: OFF";
  });
}

// =======================
// 🔹 CORE BELIEFS LOGIC
// =======================
const beliefInput = document.getElementById("beliefInput");
const addBeliefBtn = document.getElementById("addBeliefBtn");
const beliefList = document.getElementById("beliefList");

let beliefs = JSON.parse(localStorage.getItem("beliefs")) || [];

const renderBeliefs = () => {
  if (!beliefList) return;
  beliefList.innerHTML = "";
  const latestFive = beliefs.slice(-5).reverse();

  latestFive.forEach(item => {
    const box = document.createElement("div");
    box.className = "entry-box";

    const p = document.createElement("p");
    p.className = "entry-text";
    p.textContent = item.text ?? item;

    box.appendChild(p);
    beliefList.appendChild(box);
  });
};

if (addBeliefBtn && beliefInput) {
  addBeliefBtn.addEventListener("click", async () => {
    const text = beliefInput.value.trim();
    if (!text) return;

    const belief = { text };

    console.log("💡 Saving belief:", text);

    try {
      // only attempt Firebase if public mode is on
      if (toggle && toggle.checked) {
        console.log("🔄 Public Mode is ON — attempting Firestore save...");

        if (typeof db === "undefined") {
          console.warn("⚠️ db is undefined — Firebase not initialized or script order issue.");
        } else {
          try {
            const docRef = await db.collection("publicBeliefs").add({
              content: text,
              createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            belief.firebaseId = docRef.id;
            console.log("✅ Firestore saved — ID:", belief.firebaseId);
          } catch (firebaseErr) {
            console.error("❌ Firebase saving error:", firebaseErr);
          }
        }
      } else {
        console.log("ℹ️ Public Mode is OFF — skipping Firestore save.");
      }

      // now save locally
      beliefs.push(belief);
      localStorage.setItem("beliefs", JSON.stringify(beliefs));
      console.log("💾 Saved locally:", belief);

    } catch (e) {
      alert("⚠️ Storage full! Cannot save new belief.");
      console.error("LocalStorage error:", e);
      return;
    }

    beliefInput.value = "";
    renderBeliefs();
    updateStorageInfo();
  });
}

renderBeliefs();

// ==========================
// 🔸 IN PROGRESS LOGIC
// ==========================
const progressInput = document.getElementById("progressInput");
const addProgressBtn = document.getElementById("addProgressBtn");
const progressList = document.getElementById("progressList");

let inProgress = JSON.parse(localStorage.getItem("inProgress")) || [];

const renderProgress = () => {
  if (!progressList) return;
  progressList.innerHTML = "";
  const latestFive = inProgress.slice(-5).reverse();

  latestFive.forEach(item => {
    const box = document.createElement("div");
    box.className = "entry-box";

    const p = document.createElement("p");
    p.className = "entry-text";
    p.textContent = item.text ?? item;

    box.appendChild(p);
    progressList.appendChild(box);
  });
};

if (addProgressBtn && progressInput) {
  addProgressBtn.addEventListener("click", async () => {
    const text = progressInput.value.trim();
    if (!text) return;

    const entry = { text };
    console.log("💡 Saving in-progress thought:", text);

    try {
      // 🔥 First, save to Firebase (if Public Mode is ON and db exists)
      if (toggle && toggle.checked) {
        console.log("🔄 Public Mode is ON — trying Firestore save...");

        if (typeof db === "undefined") {
          console.warn("⚠️ Firebase 'db' not defined.");
        } else {
          try {
            const docRef = await db.collection("publicInProgress").add({
              content: text,
              createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            entry.firebaseId = docRef.id;
            console.log("✅ Firestore saved — ID:", entry.firebaseId);
          } catch (firebaseErr) {
            console.error("❌ Firebase error (inProgress):", firebaseErr);
          }
        }
      } else {
        console.log("ℹ️ Public Mode is OFF — skipping Firebase.");
      }

      // ✅ Then save to localStorage
      inProgress.push(entry);
      localStorage.setItem("inProgress", JSON.stringify(inProgress));
      console.log("💾 Saved locally:", entry);

    } catch (e) {
      alert("⚠️ Storage full! Cannot save new entry.");
      console.error("Storage error:", e);
      return;
    }

    progressInput.value = "";
    renderProgress();
    updateStorageInfo();
  });
}

renderProgress();

  // ========================
  // 💾 STORAGE USAGE METER
  // ========================
  function getStorageSize(key) {
    const item = localStorage.getItem(key);
    return item ? new Blob([item]).size : 0;
  }

  function updateStorageInfo() {
    const beliefsSize = getStorageSize("beliefs");
    const progressSize = getStorageSize("inProgress");
    const totalUsed = beliefsSize + progressSize;

    const maxStorage = 5 * 1024 * 1024; // 5MB in bytes
    const percentUsed = ((totalUsed / maxStorage) * 100).toFixed(2);
    const usedKB = (totalUsed / 1024).toFixed(1);
    const freeKB = ((maxStorage - totalUsed) / 1024).toFixed(1);

    const infoText = `
      <strong>Storage Used:</strong> ${usedKB} KB 
      &nbsp;|&nbsp; 
      <strong>Free:</strong> ${freeKB} KB 
      &nbsp;|&nbsp; 
      <strong>${percentUsed}% of 5MB</strong>
    `;

    const infoEl = document.getElementById("storageInfo");
    if (infoEl) infoEl.innerHTML = infoText;
  }

  updateStorageInfo(); // Initial call
});
