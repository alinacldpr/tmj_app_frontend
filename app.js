// --- keys for localStorage ---
const LS_KEY_PAT = "tmj.patient";
const LS_KEY_CASES = "tmj.cases";

// DOM
const pName = document.getElementById("pName");
const pAge = document.getElementById("pAge");
const pDate = document.getElementById("pDate");
const saveBtn = document.getElementById("savePatient");
const saveMsg = document.getElementById("saveMsg");
const caseList = document.getElementById("caseList");
const messages = document.getElementById("messages");
const clearAllBtn = document.getElementById("clearAll");

// hidden pickers (mobile native camera & uploads)
const photoPicker = document.getElementById("photoPicker");
const videoPicker = document.getElementById("videoPicker");
const photoUpload = document.getElementById("photoUpload");
const videoUpload = document.getElementById("videoUpload");

// quick access buttons
const btnNewPhoto = document.getElementById("newPhoto");
const btnNewVideo = document.getElementById("newVideo");
const btnUploadPhoto = document.getElementById("uploadPhoto");
const btnUploadVideo = document.getElementById("uploadVideo");

// webcam modal (desktop)
const camModal = document.getElementById("camModal");
const camVideo = document.getElementById("camVideo");
const btnSnap = document.getElementById("snapPhoto");
const btnStart = document.getElementById("startRec");
const btnStop = document.getElementById("stopRec");
const btnClose = document.getElementById("closeCam");

let camStream = null,
  mediaRec = null,
  recChunks = [],
  currentKind = null;

// ---------- init ----------
(function init() {
  const p = JSON.parse(localStorage.getItem(LS_KEY_PAT) || "{}");
  if (p.name) pName.value = p.name;
  if (p.age) pAge.value = p.age;
  pDate.value = p.date || new Date().toISOString().slice(0, 10);
  renderCases();
})();

// ---------- patient save ----------
saveBtn.onclick = () => {
  const obj = {
    name: pName.value.trim(),
    age: pAge.value.trim(),
    date: pDate.value,
  };
  localStorage.setItem(LS_KEY_PAT, JSON.stringify(obj));
  saveMsg.textContent = "Saved.";
  setTimeout(() => (saveMsg.textContent = ""), 1500);
};

// ---------- add case utility ----------
async function addCase(kind, file, captured) {
  const pat = JSON.parse(localStorage.getItem(LS_KEY_PAT) || "{}");
  const reader = new FileReader();
  reader.onload = () => {
    const url = reader.result; // data URL for MVP
    const id = Date.now().toString();
    const rec = {
      id,
      kind,
      captured,
      ts: new Date().toISOString(),
      patient: pat,
      status: "Awaiting Analysis",
      thumb: kind === "photo" ? url : null,
      media: url,
    };
    const list = JSON.parse(localStorage.getItem(LS_KEY_CASES) || "[]");
    list.unshift(rec);
    localStorage.setItem(LS_KEY_CASES, JSON.stringify(list));
    messages.textContent = `${kind === "photo" ? "Photo" : "Video"} added for ${
      pat.name || "patient"
    }.`;
    renderCases();
  };
  reader.readAsDataURL(file);
}

// ---------- delete helpers ----------
function deleteCase(id) {
  const list = JSON.parse(localStorage.getItem(LS_KEY_CASES) || "[]");
  const newList = list.filter((c) => c.id !== id);
  localStorage.setItem(LS_KEY_CASES, JSON.stringify(newList));
  messages.textContent = "Case deleted.";
  renderCases();
}

clearAllBtn.onclick = () => {
  const list = JSON.parse(localStorage.getItem(LS_KEY_CASES) || "[]");
  if (!list.length) return;
  if (confirm(`Delete all ${list.length} case(s)? This cannot be undone.`)) {
    localStorage.removeItem(LS_KEY_CASES);
    messages.textContent = "All cases deleted.";
    renderCases();
  }
};

// ---------- render recent cases ----------
function renderCases() {
  const list = JSON.parse(localStorage.getItem(LS_KEY_CASES) || "[]");
  caseList.innerHTML = "";
  if (!list.length) {
    caseList.innerHTML = '<div class="note">No cases yet.</div>';
    return;
  }
  for (const c of list) {
    const row = document.createElement("div");
    row.className = "case";

    const mediaEl = document.createElement(
      c.kind === "photo" ? "img" : "video"
    );
    mediaEl.className = "thumb";
    mediaEl.src = c.thumb || c.media;
    if (c.kind === "video") {
      mediaEl.muted = true;
      mediaEl.loop = true;
      mediaEl.autoplay = true;
      mediaEl.playsInline = true;
    }
    row.appendChild(mediaEl);

    const meta = document.createElement("div");
    meta.innerHTML = `
      <div><strong>${c.patient?.name || "Unnamed"}</strong> — ${
      c.kind === "photo" ? "Photo" : "Video"
    }</div>
      <div class="muted">${new Date(c.ts).toLocaleString()}</div>
      <div class="kvs">
        <div class="muted">Age: ${c.patient?.age || "-"}</div>
        <div class="muted">Date: ${c.patient?.date || "-"}</div>
      </div>`;
    row.appendChild(meta);

    const badge = document.createElement("span");
    badge.className =
      "badge " + (c.status.includes("Await") ? "await" : "ready");
    badge.textContent = c.status;
    badge.classList.add("status");
    row.appendChild(badge);

    const del = document.createElement("button");
    del.className = "mini danger";
    del.textContent = "Delete";
    del.title = "Delete this case";
    del.onclick = () => {
      if (confirm("Delete this case?")) deleteCase(c.id);
    };
    row.appendChild(del);

    caseList.appendChild(row);
  }
}

// ---------- mobile vs desktop helpers ----------
function isMobile() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

// ---------- desktop webcam modal ----------
async function openCam(kind) {
  currentKind = kind; // 'photo' or 'video'

  // On mobile, prefer native camera UI via file inputs
  if (isMobile()) {
    (kind === "photo" ? photoPicker : videoPicker).click();
    return;
  }

  try {
    camStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });
  } catch (e) {
    alert("Could not access camera: " + e.message);
    return;
  }
  camVideo.srcObject = camStream;
  btnStart.disabled = false;
  btnStop.disabled = true;
  camModal.style.display = "flex";
}

function closeCam() {
  if (mediaRec && mediaRec.state === "recording") mediaRec.stop();
  if (camStream) {
    camStream.getTracks().forEach((t) => t.stop());
    camStream = null;
  }
  camModal.style.display = "none";
}

btnClose.onclick = closeCam;

// Photo capture (desktop)
btnSnap.onclick = async () => {
  if (!camStream) return;
  const track = camStream.getVideoTracks()[0];
  let blob = null;

  if ("ImageCapture" in window) {
    try {
      const ic = new ImageCapture(track);
      blob = await ic.takePhoto();
    } catch {
      blob = null;
    }
  }

  if (!blob) {
    // fallback via canvas
    const cvs = document.createElement("canvas");
    cvs.width = camVideo.videoWidth;
    cvs.height = camVideo.videoHeight;
    cvs.getContext("2d").drawImage(camVideo, 0, 0);
    blob = await new Promise((res) => cvs.toBlob(res, "image/jpeg", 0.9));
  }

  await addCase(
    "photo",
    new File([blob], `photo_${Date.now()}.jpg`, { type: "image/jpeg" }),
    true
  );
  closeCam();
};

// Video record (desktop)
btnStart.onclick = () => {
  if (!camStream) return;
  recChunks = [];
  const mime = MediaRecorder.isTypeSupported("video/mp4;codecs=h264")
    ? "video/mp4;codecs=h264"
    : "video/webm;codecs=vp8";
  mediaRec = new MediaRecorder(camStream, { mimeType: mime });
  mediaRec.ondataavailable = (e) => {
    if (e.data && e.data.size) recChunks.push(e.data);
  };
  mediaRec.onstop = async () => {
    const blob = new Blob(recChunks, { type: mediaRec.mimeType });
    const ext = blob.type.includes("mp4") ? "mp4" : "webm";
    await addCase(
      "video",
      new File([blob], `video_${Date.now()}.${ext}`, { type: blob.type }),
      true
    );
    closeCam();
  };
  mediaRec.start(100);
  btnStart.disabled = true;
  btnStop.disabled = false;
};
btnStop.onclick = () => {
  if (mediaRec && mediaRec.state === "recording") mediaRec.stop();
};

// ---------- quick access wiring ----------
btnNewPhoto.onclick = (e) => {
  e.preventDefault();
  openCam("photo");
};
btnNewVideo.onclick = (e) => {
  e.preventDefault();
  openCam("video");
};
btnUploadPhoto.onclick = (e) => {
  e.preventDefault();
  photoUpload.click();
};
btnUploadVideo.onclick = (e) => {
  e.preventDefault();
  videoUpload.click();
};

// mobile/native + desktop uploads
photoPicker.onchange = async () => {
  const f = photoPicker.files?.[0];
  if (f) await addCase("photo", f, true);
};
videoPicker.onchange = async () => {
  const f = videoPicker.files?.[0];
  if (f) await addCase("video", f, true);
};
photoUpload.onchange = async () => {
  const f = photoUpload.files?.[0];
  if (f) await addCase("photo", f, false);
};
videoUpload.onchange = async () => {
  const f = videoUpload.files?.[0];
  if (f) await addCase("video", f, false);
};
