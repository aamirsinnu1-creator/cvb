// Hand-sign recognition for one or two hands (MediaPipe landmarks, 21 points per hand).
const d3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

// Normalised landmarks -> pixel-like coordinates so real proportions are kept
export const toPixels = (lm, w, h) => lm.map(p => ({ x: p.x * w, y: p.y * h, z: p.z * w }));
export const handScale = p => d3(p[0], p[9]) || 1;

// [thumb, index, middle, ring, pinky] -> 1 when extended
export function fingers(p) {
  const ext = (tip, pip) => d3(p[tip], p[0]) > d3(p[pip], p[0]) * 1.05;
  return [d3(p[4], p[5]) > handScale(p) * 0.75, ext(8, 6), ext(12, 10), ext(16, 14), ext(20, 18)].map(Number);
}

// hands: [{p, f}] sorted left-to-right on screen. 63 numbers per hand + offset between the two wrists.
export function buildFeature(hands) {
  const v = new Array(129).fill(0);
  hands.forEach((h, slot) => {
    const s = handScale(h.p), w = h.p[0];
    let i = slot * 63;
    for (const q of h.p) { v[i++] = (q.x - w.x) / s; v[i++] = (q.y - w.y) / s; v[i++] = (q.z - w.z) / s; }
  });
  if (hands.length === 2) {
    const a = hands[0].p[0], b = hands[1].p[0], s = handScale(hands[0].p);
    v[126] = (b.x - a.x) / s; v[127] = (b.y - a.y) / s; v[128] = (b.z - a.z) / s;
  }
  return v;
}

export function dist(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) { const x = a[i] - b[i]; s += x * x; }
  return Math.sqrt(s);
}

// Your recorded signs: K nearest samples inside the strictness threshold vote on the word
export function matchRecorded(vec, signs, threshold, K = 5) {
  const near = signs.map(s => ({ label: s.label, d: dist(vec, s.vec) }))
    .sort((a, b) => a.d - b.d).slice(0, K).filter(n => n.d < threshold);
  if (!near.length) return null;
  const votes = {};
  near.forEach(n => { votes[n.label] = (votes[n.label] || 0) + 1 / (n.d + 0.05); });
  return Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0];
}

export const ONE_HAND = {
  "01000": "One", "01100": "Two", "01110": "Three", "01111": "Four", "11111": "Hello",
  "00000": "Yes", "10000": "Good", "10001": "Call me", "11001": "I love you"
};
export const TWO_HANDS = {
  Namaste: "Both palms together", Welcome: "Both open hands apart",
  "Very good": "Both thumbs up", Stop: "Both fists"
};

export function builtin(hands) {
  const k = hands.map(h => h.f.join(""));
  if (hands.length === 1) {
    if (k[0] === "10000" && hands[0].p[4].y > hands[0].p[0].y) return "No"; // thumb down
    return ONE_HAND[k[0]] || null;
  }
  if (hands.length === 2) {
    const open = x => x === "11111" || x === "01111";
    if (open(k[0]) && open(k[1])) {
      const avg = (handScale(hands[0].p) + handScale(hands[1].p)) / 2;
      const gap = d3(hands[0].p[9], hands[1].p[9]);
      if (gap < avg) return "Namaste";
      if (gap > avg * 2.5) return "Welcome";
      return null;
    }
    if (k[0] === "10000" && k[1] === "10000") return "Very good";
    if (k[0] === "00000" && k[1] === "00000") return "Stop";
  }
  return null;
}
