console.log("Philosophy archive loaded.");

document.addEventListener("DOMContentLoaded", () => {

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
    latestFive.forEach(text => {
      const box = document.createElement("div");
      box.className = "entry-box";

      const p = document.createElement("p");
      p.className = "entry-text";
      p.textContent = text;

      box.appendChild(p);
      beliefList.appendChild(box);
    });
  };

  if (addBeliefBtn && beliefInput) {
    addBeliefBtn.addEventListener("click", () => {
      const text = beliefInput.value.trim();
      if (!text) return;

      beliefs.push(text);

      try {
        localStorage.setItem("beliefs", JSON.stringify(beliefs));
      } catch (e) {
        alert("⚠️ Storage full! Cannot save new belief.");
        console.error("Storage limit reached for beliefs:", e);
        beliefs.pop(); // rollback
        return;
      }

      beliefInput.value = "";
      renderBeliefs();
      updateStorageInfo(); // ✅ update after saving
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
    latestFive.forEach(text => {
      const box = document.createElement("div");
      box.className = "entry-box";

      const p = document.createElement("p");
      p.className = "entry-text";
      p.textContent = text;

      box.appendChild(p);
      progressList.appendChild(box);
    });
  };

  if (addProgressBtn && progressInput) {
    addProgressBtn.addEventListener("click", () => {
      const text = progressInput.value.trim();
      if (!text) return;

      inProgress.push(text);

      try {
        localStorage.setItem("inProgress", JSON.stringify(inProgress));
      } catch (e) {
        alert("⚠️ Storage full! Cannot save new idea.");
        console.error("Storage limit reached for inProgress:", e);
        inProgress.pop(); // rollback
        return;
      }

      progressInput.value = "";
      renderProgress();
      updateStorageInfo(); // ✅ update after saving
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
