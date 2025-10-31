// Same keys used on Home
const LS_KEY_CASES = "tmj.cases";

// --- helpers ---
const qs = (id) => document.getElementById(id);
const getParam = (k) => new URL(window.location.href).searchParams.get(k);

// --- backend endpoint (replace with your deployed FastAPI URL) ---
const BACKEND = "https://YOUR_BACKEND_URL/analyze";

// --- DOM refs ---
const runBtn = qs("runAnalysis");
const anMsg = qs("anMsg");
const anBlock = qs("analysisBlock");
const anNums = qs("anNums");
const anGrid = qs("anGrid");

const mediaBox = qs("mediaBox");
const meta = qs("meta");
const btnDelete = qs("deleteCase");
const btnSave = qs("saveObs");
const saveMsg = qs("saveMsg");

const clicksEl = qs("obsClicks");
const widthEl = qs("obsWidth");
const notesEl = qs("obsNotes");

// radio group helpers
const soundRadios = {
  none: qs("soundNone"),
  clear: qs("soundClear"),
  discreet: qs("soundDiscreet"),
};
function getSound() {
  return soundRadios.none.checked
    ? "none"
    : soundRadios.clear.checked
    ? "clear"
    : soundRadios.discreet.checked
    ? "discreet"
    : null;
}
function setSound(v) {
  (soundRadios[v] || soundRadios.none).checked = true;
}

// ------- load case -------
const id = getParam("id");
if (!id) {
  alert("Missing case id");
  window.location.href = "index.html";
}

let current = null;
let list = [];

(function load() {
  list = JSON.parse(localStorage.getItem(LS_KEY_CASES) || "[]");
  current = list.find((c) => c.id === id);
  if (!current) {
    alert("Case not found");
    window.location.href = "index.html";
    return;
  }

  // Render media
  mediaBox.innerHTML = "";
  if (current.kind === "photo") {
    const img = document.createElement("img");
    img.src = current.media;
    img.alt = "Case photo";
    img.style.cursor = "zoom-in";
    img.onclick = () => img.requestFullscreen?.();
    mediaBox.appendChild(img);

    // show Analyze button for photos
    if (runBtn) runBtn.style.display = "inline-block";
  } else {
    const vid = document.createElement("video");
    vid.src = current.media;
    vid.controls = true;
    vid.playsInline = true;
    vid.style.background = "#000";
    mediaBox.appendChild(vid);

    // hide Analyze for videos (for now)
    if (runBtn) runBtn.style.display = "none";
  }

  // Meta
  meta.textContent = `${current.patient?.name || "Unnamed"} — ${
    current.kind === "photo" ? "Photo" : "Video"
  } • ${new Date(current.ts).toLocaleString()} • Age ${
    current.patient?.age || "-"
  } • Date ${current.patient?.date || "-"}`;

  // Fill observations if present
  if (current.observations) {
    clicksEl.value = current.observations.clicks ?? "";
    widthEl.value = current.observations.incisorsWidthMm ?? "";
    notesEl.value = current.observations.notes ?? "";
    setSound(current.observations.clickSound || "none");
  } else {
    setSound("none");
  }

  // Delete case
  btnDelete.onclick = () => {
    if (!confirm("Delete this case?")) return;
    const newList = list.filter((c) => c.id !== id);
    localStorage.setItem(LS_KEY_CASES, JSON.stringify(newList));
    window.location.href = "index.html";
  };
})();

// ------- save observations -------
btnSave.onclick = () => {
  const listNow = JSON.parse(localStorage.getItem(LS_KEY_CASES) || "[]");
  const idx = listNow.findIndex((c) => c.id === id);
  if (idx === -1) return;

  const obs = {
    clicks: clicksEl.value ? Number(clicksEl.value) : null,
    clickSound: getSound(),
    notes: (notesEl.value || "").trim(),
    incisorsWidthMm: widthEl.value ? Number(widthEl.value) : null,
  };

  listNow[idx].observations = obs;
  localStorage.setItem(LS_KEY_CASES, JSON.stringify(listNow));

  saveMsg.textContent = "Saved.";
  setTimeout(() => (saveMsg.textContent = ""), 1500);
};

// ------- analyze case (photos) -------
if (runBtn) {
  runBtn.onclick = async () => {
    anMsg.textContent = "Running analysis…";
    runBtn.disabled = true;

    try {
      const known = widthEl.value
        ? Number(widthEl.value)
        : current?.observations?.incisorsWidthMm || null;

      const res = await fetch(BACKEND, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_data_url: current.media, // base64 data URL saved in localStorage
          known_centrals_mm: known || null,
        }),
      });

      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Analysis failed");

      // Numbers
      const px = data.gap_px;
      const mm = data.gap_mm != null ? data.gap_mm.toFixed(2) + " mm" : "—";
      const scale =
        data.px_per_mm != null ? data.px_per_mm.toFixed(2) + " px/mm" : "—";
      anNums.innerHTML =
        `<strong>AB:</strong> ${px} px &nbsp; <strong>(${mm})</strong> ` +
        `&nbsp; <span class="muted">scale ${scale}</span>`;

      // 2×2 images
      anGrid.innerHTML = "";
      const tile = (title, src) => {
        const box = document.createElement("div");
        box.style.background = "#111826";
        box.style.border = "1px solid #232835";
        box.style.borderRadius = "10px";
        box.style.padding = "8px";
        const cap = document.createElement("div");
        cap.textContent = title;
        cap.style.fontSize = "12px";
        cap.style.color = "#9aa3af";
        cap.style.marginBottom = "6px";
        const img = document.createElement("img");
        img.src = src;
        img.style.width = "100%";
        img.style.borderRadius = "8px";
        box.appendChild(cap);
        box.appendChild(img);
        anGrid.appendChild(box);
      };
      tile("Original", data.images.original);
      tile("Model overlay", data.images.overlay);
      tile("Binary mask", data.images.binary);
      tile("Measured (AB)", data.images.measured);

      // Show panel and persist analysis (optional)
      anBlock.style.display = "block";
      const i = list.findIndex((c) => c.id === id);
      if (i !== -1) {
        list[i].analysis = {
          gap_px: data.gap_px,
          gap_mm: data.gap_mm,
          px_per_mm: data.px_per_mm,
          images: data.images,
        };
        localStorage.setItem(LS_KEY_CASES, JSON.stringify(list));
      }

      anMsg.textContent = "Done.";
    } catch (e) {
      console.error(e);
      anMsg.textContent = "Error: " + e.message;
    } finally {
      runBtn.disabled = false;
      setTimeout(() => (anMsg.textContent = ""), 2500);
    }
  };
}
