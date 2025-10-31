// Same keys used on Home
const LS_KEY_CASES = "tmj.cases";

// Helpers
function qs(id) {
  return document.getElementById(id);
}
function getParam(name) {
  const u = new URL(window.location.href);
  return u.searchParams.get(name);
}

const mediaBox = qs("mediaBox");
const meta = qs("meta");
const btnOpen = qs("openInNew");
const btnDelete = qs("deleteCase");
const btnSave = qs("saveObs");
const saveMsg = qs("saveMsg");

const clicksEl = qs("obsClicks");
const widthEl = qs("obsWidth");
const notesEl = qs("obsNotes");

// radio group helpers
const soundRadios = {
  none: document.getElementById("soundNone"),
  clear: document.getElementById("soundClear"),
  discreet: document.getElementById("soundDiscreet"),
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
  if (!v) return;
  (soundRadios[v] || soundRadios.none).checked = true;
}

// Load case
const id = getParam("id");
if (!id) {
  alert("Missing case id");
  window.location.href = "index.html";
}

let current = null;
(function load() {
  const list = JSON.parse(localStorage.getItem(LS_KEY_CASES) || "[]");
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
  } else {
    const vid = document.createElement("video");
    vid.src = current.media;
    vid.controls = true;
    vid.playsInline = true;
    vid.style.background = "#000";
    mediaBox.appendChild(vid);
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

  // Wire buttons
  btnOpen.onclick = () => window.open(current.media, "_blank");
  btnDelete.onclick = () => {
    if (!confirm("Delete this case?")) return;
    const newList = list.filter((c) => c.id !== id);
    localStorage.setItem(LS_KEY_CASES, JSON.stringify(newList));
    window.location.href = "index.html";
  };
})();

// Save observations
btnSave.onclick = () => {
  const list = JSON.parse(localStorage.getItem(LS_KEY_CASES) || "[]");
  const idx = list.findIndex((c) => c.id === id);
  if (idx === -1) return;

  const obs = {
    clicks: clicksEl.value ? Number(clicksEl.value) : null,
    clickSound: getSound(),
    notes: (notesEl.value || "").trim(),
    incisorsWidthMm: widthEl.value ? Number(widthEl.value) : null,
  };

  list[idx].observations = obs;
  localStorage.setItem(LS_KEY_CASES, JSON.stringify(list));

  saveMsg.textContent = "Saved.";
  setTimeout(() => (saveMsg.textContent = ""), 1500);
};
