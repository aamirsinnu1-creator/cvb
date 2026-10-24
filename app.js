import { HandLandmarker, FilesetResolver, DrawingUtils } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
import { toPixels, fingers, buildFeature, matchRecorded, builtin } from "./gestures.js";

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const KEY = "signbridge_signs_v2", STABLE = 6, HOLD = 20, LOST = 10;

const $ = id => document.getElementById(id);
const video = $("video"), canvas = $("overlay"), ctx = canvas.getContext("2d");
let landmarker, stream, running = false, lastTime = -1;
let signs = JSON.parse(localStorage.getItem(KEY) || "[]");
let sentence = [], candidate = null, streak = 0, lost = 0, lastAdded = null, rec = null;
const setStatus = m => { $("status").textContent = m; };
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(signs)); } catch { setStatus("Could not save signs. Use Export to keep a backup."); } };

/* ---------- sentence + speech ---------- */
function renderSentence() {
  const s = sentence.join(" ");
  $("text").textContent = s || "Signs will appear here.";
  $("text").classList.toggle("empty", !s);
}
function speak(t) {
  if (!("speechSynthesis" in window)) return setStatus("Speech is not supported in this browser.");
  if (!t) return;
  const u = new SpeechSynthesisUtterance(t);
  u.lang = $("lang").value;
  speechSynthesis.cancel(); speechSynthesis.speak(u);
}

/* ---------- camera ---------- */
async function start() {
  $("startBtn").disabled = true; setStatus("Loading hand tracking model…");
  try {
    if (!landmarker) {
      const fs = await FilesetResolver.forVisionTasks(WASM);
      const make = delegate => HandLandmarker.createFromOptions(fs, {
        baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: "VIDEO", numHands: 2,
        minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5
      });
      try { landmarker = await make("GPU"); } catch { landmarker = await make("CPU"); }
    }
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 960 }, height: { ideal: 720 }, facingMode: "user" }, audio: false });
    video.srcObject = stream;
    await new Promise(r => { video.onloadeddata = r; });
    await video.play();
    $("placeholder").hidden = true; $("hands").hidden = false; $("stopBtn").hidden = false;
    $("stage").classList.add("on");
    running = true; setStatus("Camera on. Show a sign.");
    requestAnimationFrame(loop);
  } catch (e) {
    if (stream) stream.getTracks().forEach(t => t.stop());
    setStatus(e.name === "NotAllowedError" ? "Camera blocked. Allow camera access in your browser and try again." : "Could not start: " + e.message);
  }
  $("startBtn").disabled = false;
}
function stop() {
  running = false;
  if (stream) stream.getTracks().forEach(t => t.stop());
  video.srcObject = null; ctx.clearRect(0, 0, canvas.width, canvas.height);
  $("placeholder").hidden = false; $("hands").hidden = true; $("stopBtn").hidden = true;
  $("stage").classList.remove("on"); setStatus("Camera stopped.");
}

function loop() {
  if (!running) return;
  if (video.readyState >= 2 && video.currentTime !== lastTime) {
    lastTime = video.currentTime;
    const now = performance.now();
    const res = landmarker.detectForVideo(video, now);
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const du = new DrawingUtils(ctx);
    for (const lm of res.landmarks || []) {
      du.drawConnectors(lm, HandLandmarker.HAND_CONNECTIONS, { color: "#ffc857", lineWidth: 3 });
      du.drawLandmarks(lm, { color: "#ffffff", radius: 3 });
    }
    const hands = (res.landmarks || []).map(lm => { const p = toPixels(lm, video.videoWidth, video.videoHeight); return { p, f: fingers(p) }; })
      .sort((a, b) => a.p[0].x - b.p[0].x).slice(0, 2);
    $("hands").textContent = "Hands: " + hands.length;
    $("hands").classList.toggle("ok", hands.length === 2);
    const vec = hands.length ? buildFeature(hands) : null;
    updateRecording(vec, now);
    detect(!rec && vec ? recognise(hands, vec) : null);
  }
  requestAnimationFrame(loop);
}

function recognise(hands, vec) {
  const mine = matchRecorded(vec, signs, parseFloat($("threshold").value));
  if (mine) return mine;
  return $("builtinOn").checked ? builtin(hands) : null;
}

// A sign must be steady (STABLE frames) to show and held (HOLD frames) to join the sentence.
function detect(label) {
  if (label === candidate) streak++; else { candidate = label; streak = 1; }
  const live = $("liveLabel"), meter = $("meter");
  if (!label) {
    if (++lost >= LOST) lastAdded = null;
    if (streak >= STABLE) { live.textContent = "–"; meter.style.width = "0"; }
    return;
  }
  lost = 0;
  if (streak >= STABLE) live.textContent = label;
  meter.style.width = Math.min(100, streak / HOLD * 100) + "%";
  if (streak >= HOLD && label !== lastAdded) {
    lastAdded = label; sentence.push(label); renderSentence();
    if ($("autoSpeak").checked) speak(label);
  }
}

/* ---------- record your own signs ---------- */
function startRecording() {
  const label = $("teachLabel").value.trim();
  if (!running) return setStatus("Start the camera first.");
  if (!label) return setStatus("Type the word for this sign first.");
  rec = { label, phase: "count", until: performance.now() + 3000, samples: [], last: 0 };
  $("recBtn").disabled = true;
}
function updateRecording(vec, now) {
  if (!rec) return;
  const left = Math.ceil((rec.until - now) / 1000);
  if (rec.phase === "count") {
    if (left > 0) { $("recStatus").textContent = "Get ready… " + left; return; }
    rec.phase = "grab"; rec.until = now + 3000;
  }
  $("recStatus").textContent = vec ? `Recording “${rec.label}”… ${Math.max(left, 1)} (${rec.samples.length} samples)` : "Show your hand(s)!";
  if (vec && now - rec.last > 80) { rec.samples.push(vec); rec.last = now; }
  if (now >= rec.until) {
    if (rec.samples.length < 5) $("recStatus").textContent = "No hands were seen. Try again.";
    else {
      rec.samples.forEach(v => signs.push({ label: rec.label, vec: v.map(x => Math.round(x * 1000) / 1000) }));
      save(); renderSigns(); $("recStatus").textContent = `Saved ${rec.samples.length} samples for “${rec.label}”.`;
    }
    rec = null; $("recBtn").disabled = false;
  }
}
function renderSigns() {
  const n = {}; signs.forEach(s => { n[s.label] = (n[s.label] || 0) + 1; });
  $("mine").innerHTML = "";
  Object.keys(n).forEach(label => {
    const li = document.createElement("li"), b = document.createElement("button");
    li.textContent = `${label} (${n[label]})`; b.textContent = "✕"; b.setAttribute("aria-label", "Delete " + label);
    b.onclick = () => { signs = signs.filter(s => s.label !== label); save(); renderSigns(); };
    li.append(b); $("mine").append(li);
  });
}

/* ---------- events ---------- */
$("startBtn").onclick = start; $("stopBtn").onclick = stop; $("recBtn").onclick = startRecording;
$("speakBtn").onclick = () => speak(sentence.join(" "));
$("backBtn").onclick = () => { sentence.pop(); renderSentence(); };
$("clearBtn").onclick = () => { sentence = []; renderSentence(); speechSynthesis.cancel(); };
$("exportBtn").onclick = () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(signs)], { type: "application/json" }));
  a.download = "my-signs.json"; a.click(); URL.revokeObjectURL(a.href);
};
$("importBtn").onclick = () => $("importFile").click();
$("importFile").onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!Array.isArray(d) || d.some(s => !s.label || !Array.isArray(s.vec))) throw 0;
    signs = signs.concat(d); save(); renderSigns(); setStatus("Signs imported.");
  } catch { setStatus("That file is not a valid signs export."); }
  e.target.value = "";
};
$("resetBtn").onclick = () => { if (confirm("Delete all your recorded signs?")) { signs = []; save(); renderSigns(); } };
renderSigns(); renderSentence();
