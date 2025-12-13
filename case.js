// Same keys used on Home
const LS_KEY_CASES = "tmj.cases";

// --- helpers ---
const qs = (id) => document.getElementById(id);
const getParam = (k) => new URL(window.location.href).searchParams.get(k);

// --- backend endpoint ---
const BACKEND = "https://alinacldpr-tmj-app-backend.hf.space/analyze";

// --- DOM refs ---
const content = qs("content");
const errorBox = qs("errorBox");

const runBtn = qs("runAnalysis");
const btnCalibrate = qs("btnCalibrate");
const calibMsg = qs("calibMsg");

const anMsg = qs("anMsg");
const anBlock = qs("analysisBlock");
const anNums = qs("anNums");
const anGrid = qs("anGrid");

const mediaBox = qs("mediaBox");
const meta = qs("meta");

const btnDelete = qs("deleteCase");
const btnSave = qs("saveObs");
const saveMsg = qs("saveMsg");

const clicksLeftEl = qs("obsClicksLeft");
const clicksRightEl = qs("obsClicksRight");
const clicksBothEl = qs("obsClicksBoth");
const widthEl = qs("obsWidth");
const notesEl = qs("obsNotes");

// radio group helpers (per side)
const soundRadios = {
  left: {
    none: qs("soundLeftNone"),
    clear: qs("soundLeftClear"),
    discreet: qs("soundLeftDiscreet"),
  },
  right: {
    none: qs("soundRightNone"),
    clear: qs("soundRightClear"),
    discreet: qs("soundRightDiscreet"),
  },
  both: {
    none: qs("soundBothNone"),
    clear: qs("soundBothClear"),
    discreet: qs("soundBothDiscreet"),
  },
};

function getSound(side) {
  const g = soundRadios[side];
  if (!g) return null;
  return g.none.checked
    ? "none"
    : g.clear.checked
    ? "clear"
    : g.discreet.checked
    ? "discreet"
    : null;
}

function setSound(side, value) {
  const g = soundRadios[side];
  if (!g) return;
  const v = value || "none";
  (g[v] || g.none).checked = true;
}

// ------- calibration state -------
let isCalibrating = false;
let calibCanvas = null;
let calibCtx = null;

let calibPxDist = null; // distance in REAL image pixels (natural)
let calibPxPerMm = null;

let calibNaturalPoints = []; // [{x,y}] natural coords
let calibHoverNatural = null; // {x,y} while moving mouse

function redrawCalibOverlay(img) {
  if (!calibCtx || !calibCanvas) return;

  // clear
  calibCtx.clearRect(0, 0, calibCanvas.width, calibCanvas.height);

  // draw points (use display coords)
  const rect = img.getBoundingClientRect();
  const sx = rect.width / img.naturalWidth;
  const sy = rect.height / img.naturalHeight;

  for (const p of calibNaturalPoints) {
    const xd = p.x * sx;
    const yd = p.y * sy;

    calibCtx.beginPath();
    calibCtx.arc(xd, yd, 5, 0, Math.PI * 2);
    calibCtx.fillStyle = "#22c55e"; // green dot
    calibCtx.fill();
    calibCtx.lineWidth = 2;
    calibCtx.strokeStyle = "#0b0e14"; // dark outline
    calibCtx.stroke();
  }

  // draw segment
  if (calibNaturalPoints.length === 2) {
    const a = calibNaturalPoints[0];
    const b = calibNaturalPoints[1];

    const ax = a.x * sx;
    const ay = a.y * sy;
    const bx = b.x * sx;
    const by = b.y * sy;

    // line
    calibCtx.beginPath();
    calibCtx.moveTo(ax, ay);
    calibCtx.lineTo(bx, by);
    calibCtx.lineWidth = 3;
    calibCtx.strokeStyle = "#22c55e";
    calibCtx.stroke();

    // ---- label (mm) ----
    const mm = widthEl.value ? Number(widthEl.value) : null;
    if (mm) {
      const mx = (ax + bx) / 2;
      const my = (ay + by) / 2 - 10; // above the line

      calibCtx.font = "12px system-ui, sans-serif";
      calibCtx.fillStyle = "#22c55e";
      calibCtx.textAlign = "center";
      calibCtx.textBaseline = "bottom";

      calibCtx.fillText(`${mm} mm`, mx, my);
    }
  }

  // live preview line (after first click)
  if (calibNaturalPoints.length === 1 && calibHoverNatural) {
    const a = calibNaturalPoints[0];
    const b = calibHoverNatural;

    calibCtx.beginPath();
    calibCtx.moveTo(a.x * sx, a.y * sy);
    calibCtx.lineTo(b.x * sx, b.y * sy);
    calibCtx.setLineDash([6, 6]);
    calibCtx.lineWidth = 2;
    calibCtx.strokeStyle = "#22c55e";
    calibCtx.stroke();
    calibCtx.setLineDash([]);
  }
}

function handleCalibClick(e) {
  if (!isCalibrating) return;
  if (e.cancelable) e.preventDefault();

  const img = e.currentTarget;
  const rect = img.getBoundingClientRect();

  // click position in displayed image coords
  const xd = e.clientX - rect.left;
  const yd = e.clientY - rect.top;

  // scale from display -> natural image pixels
  const sx = img.naturalWidth / rect.width;
  const sy = img.naturalHeight / rect.height;

  // convert to natural coords
  const xn = xd * sx;
  const yn = yd * sy;

  calibNaturalPoints.push({ x: xn, y: yn });
  calibHoverNatural = null;
  redrawCalibOverlay(img);

  if (calibNaturalPoints.length === 2) {
    const dx = calibNaturalPoints[1].x - calibNaturalPoints[0].x;
    const dy = calibNaturalPoints[1].y - calibNaturalPoints[0].y;
    calibPxDist = Math.sqrt(dx * dx + dy * dy);

    calibMsg.textContent = "Now enter incisors width (mm)";
    updateCalibrationFromInputs();
  } else if (calibNaturalPoints.length > 2) {
    // 3rd click → restart
    calibNaturalPoints = [{ x: xn, y: yn }];
    calibPxDist = null;
    calibPxPerMm = null;
    calibMsg.textContent = "Restarted calibration: click 2 points";

    calibHoverNatural = null;
    redrawCalibOverlay(img);
  }
}

function updateCalibrationFromInputs() {
  const mm = widthEl.value ? Number(widthEl.value) : null;
  if (!mm || !calibPxDist) return;

  calibPxPerMm = calibPxDist / mm;
  // isCalibrating = false;

  calibMsg.textContent = `Calibrated: ${calibPxPerMm.toFixed(2)} px/mm`;
  console.log("px_per_mm =", calibPxPerMm);
}

// When the user types mm, compute if we already have 2 points
widthEl.addEventListener("input", () => {
  if (calibPxDist) updateCalibrationFromInputs();
  if (calibCanvas && calibCtx && calibNaturalPoints.length === 2) {
    const img = mediaBox.querySelector("img");
    if (img) redrawCalibOverlay(img);
  }
});

// ------- load case -------
const id = getParam("id");

function showError(msg) {
  errorBox.style.display = "block";
  errorBox.textContent = msg;
}

let current = null;
let list = [];

(function load() {
  if (!id) {
    showError("Missing case id");
    return;
  }

  try {
    list = JSON.parse(localStorage.getItem(LS_KEY_CASES) || "[]");
  } catch {
    list = [];
  }

  current = list.find((c) => c.id === id);
  if (!current) {
    showError("Case not found in this browser's storage");
    return;
  }

  content.style.display = "grid";
  errorBox.style.display = "none";

  // Render media
  mediaBox.innerHTML = "";

  if (current.kind === "photo") {
    const img = document.createElement("img");
    img.src = current.media;
    img.alt = "Case photo";
    img.style.cursor = "crosshair";

    // img.addEventListener("click", handleCalibClick);
    img.addEventListener("pointerdown", handleCalibClick);
    img.addEventListener("dblclick", () => img.requestFullscreen?.());
    // img.addEventListener("mousemove", (e) => {
    img.addEventListener("pointermove", (e) => {
      if (!isCalibrating || calibNaturalPoints.length !== 1) return;
      if (e.cancelable) e.preventDefault();

      const rect = img.getBoundingClientRect();
      const xd = e.clientX - rect.left;
      const yd = e.clientY - rect.top;

      const sx = img.naturalWidth / rect.width;
      const sy = img.naturalHeight / rect.height;

      calibHoverNatural = {
        x: xd * sx,
        y: yd * sy,
      };

      redrawCalibOverlay(img);
    });

    // NEW: canvas overlay (for drawing points/lines)
    calibCanvas = document.createElement("canvas");
    calibCanvas.className = "calibOverlay";
    calibCtx = calibCanvas.getContext("2d");

    // Put image first, canvas on top
    mediaBox.appendChild(img);
    mediaBox.appendChild(calibCanvas);

    // Keep canvas size synced to displayed image size
    function resizeCanvas() {
      const r = img.getBoundingClientRect();
      calibCanvas.width = Math.max(1, Math.round(r.width));
      calibCanvas.height = Math.max(1, Math.round(r.height));
    }

    img.addEventListener("load", resizeCanvas);
    if (img.complete) resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    runBtn.style.display = "inline-block";
    btnCalibrate.style.display = "inline-block";
  } else {
    const vid = document.createElement("video");
    vid.src = current.media;
    vid.controls = true;
    vid.playsInline = true;
    vid.style.background = "#000";
    mediaBox.appendChild(vid);

    runBtn.style.display = "none";
    btnCalibrate.style.display = "none";
  }

  meta.textContent = `${current.patient?.name || "Unnamed"} — ${
    current.kind === "photo" ? "Photo" : "Video"
  } • ${new Date(current.ts).toLocaleString()} • Age ${
    current.patient?.age || "-"
  } • Date ${current.patient?.date || "-"}`;

  // Load observations
  if (current.observations) {
    const o = current.observations;

    clicksLeftEl.value = o.clicksLeft ?? "";
    clicksRightEl.value = o.clicksRight ?? "";
    clicksBothEl.value = o.clicksBoth ?? (o.clicks != null ? o.clicks : "");

    widthEl.value = o.incisorsWidthMm ?? "";
    notesEl.value = o.notes ?? "";

    setSound("left", o.soundLeft || o.clickSound || "none");
    setSound("right", o.soundRight || o.clickSound || "none");
    setSound("both", o.soundBoth || o.clickSound || "none");

    if (o.pxPerMmManual != null) {
      calibPxPerMm = o.pxPerMmManual;
      calibMsg.textContent = `Calibrated (saved): ${calibPxPerMm.toFixed(
        2
      )} px/mm`;
    }
  } else {
    setSound("left", "none");
    setSound("right", "none");
    setSound("both", "none");
  }

  btnDelete.onclick = () => {
    if (!confirm("Delete this case?")) return;
    const newList = list.filter((c) => c.id !== id);
    localStorage.setItem(LS_KEY_CASES, JSON.stringify(newList));
    window.location.href = "index.html";
  };
})();

// ------- Calibrate button -------
btnCalibrate.onclick = () => {
  isCalibrating = true;
  calibNaturalPoints = [];
  calibHoverNatural = null;
  calibPxDist = null;
  calibPxPerMm = null;

  calibMsg.textContent = "Calibration ON: click 2 points";
  if (calibCtx && calibCanvas)
    calibCtx.clearRect(0, 0, calibCanvas.width, calibCanvas.height);
};

btnSave.onclick = () => {
  const listNow = JSON.parse(localStorage.getItem(LS_KEY_CASES) || "[]");
  const idx = listNow.findIndex((c) => c.id === id);
  if (idx === -1) return;

  // recompute px/mm if possible
  updateCalibrationFromInputs();

  listNow[idx].observations = {
    clicksLeft: clicksLeftEl.value ? Number(clicksLeftEl.value) : null,
    clicksRight: clicksRightEl.value ? Number(clicksRightEl.value) : null,
    clicksBoth: clicksBothEl.value ? Number(clicksBothEl.value) : null,

    soundLeft: getSound("left"),
    soundRight: getSound("right"),
    soundBoth: getSound("both"),

    notes: (notesEl.value || "").trim(),
    incisorsWidthMm: widthEl.value ? Number(widthEl.value) : null,

    pxPerMmManual: calibPxPerMm, // calibration saved
  };

  localStorage.setItem(LS_KEY_CASES, JSON.stringify(listNow));

  //keep in-memory variables in sync (so Analyze uses it too)
  list = listNow;
  current = listNow[idx];

  saveMsg.textContent = "Saved.";
  setTimeout(() => (saveMsg.textContent = ""), 1500);
};

// ------- analyze case (photos) -------
runBtn.onclick = async () => {
  anMsg.textContent = "Running analysis…";
  runBtn.disabled = true;

  try {
    const known = widthEl.value
      ? Number(widthEl.value)
      : current?.observations?.incisorsWidthMm || null;

    const manualPxPerMm =
      calibPxPerMm != null
        ? calibPxPerMm
        : current?.observations?.pxPerMmManual ?? null;

    const res = await fetch(BACKEND, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image_data_url: current.media,
        known_centrals_mm: known || null,
        px_per_mm: manualPxPerMm,
      }),
    });

    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Analysis failed");

    const px = data.gap_px;
    const mm = data.gap_mm != null ? data.gap_mm.toFixed(2) + " mm" : "—";
    const scale =
      data.px_per_mm != null ? data.px_per_mm.toFixed(2) + " px/mm" : "—";

    anNums.innerHTML =
      `<strong>AB:</strong> ${px} px &nbsp; <strong>(${mm})</strong> ` +
      `&nbsp; <span class="muted">scale ${scale}</span>`;

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
