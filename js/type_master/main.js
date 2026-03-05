const FALLBACK_TEXTS = [
  "The quick brown fox jumps over the lazy dog near the riverbank.",
  "Every line of code is a step toward building something meaningful and lasting.",
  "Good software is built on clean architecture and thoughtful design patterns.",
  "Typing speed improves with consistent practice and proper finger placement.",
  "A developer who writes clean code is someone others love to work with.",
  "Performance optimization requires understanding both the code and the hardware.",
  "The best debugging tool is a good night sleep and fresh eyes in the morning.",
  "Open source software thrives on collaboration trust and shared knowledge.",
  "Consistency and discipline are the foundations of any great skill over time.",
  "Every bug fixed is a lesson learned and a step toward better engineering.",
];

let TEXTS = [];

let selectedTime = 60;
let currentTime = 60;
let timerInterval = null;
let started = false;
let finished = false;
let currentText = "";
let currentIndex = 0;
let correctCount = 0;
let errorCount = 0;
let totalTyped = 0;
let combo = 0;
let charStates = []; // track state per char: 'pending'|'correct'|'wrong'
let charCounts = []; // per char: { correct, error, totalTyped }

// --- SFX (WebAudio) ---
// Referencing dino_run_v2.html: synth SFX via OscillatorNode (no external audio assets).
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;
let masterGain = null;
let sfxMuted = false;
let sfxVolume = 0.825; // 0..1.5（slider 55 → gain 0.825）

function ensureAudio() {
  if (!AudioCtx) return false;
  if (!audioCtx) {
    audioCtx = new AudioCtx();
    masterGain = audioCtx.createGain();
    // Louder by default; individual beeps also have their own envelopes.
    masterGain.gain.value = sfxMuted ? 0 : sfxVolume;
    masterGain.connect(audioCtx.destination);
  }
  if (audioCtx.state === "suspended") {
    // Must be triggered by a user gesture; all callers are user events.
    audioCtx.resume().catch(() => {});
  }
  return true;
}

function setSfxMuted(muted) {
  sfxMuted = !!muted;
  if (masterGain) masterGain.gain.value = sfxMuted ? 0 : sfxVolume;
  const btn = document.getElementById("sfx-btn");
  if (btn) btn.textContent = sfxMuted ? "SFX: OFF" : "SFX: ON";
}

function setSfxVolume01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return;
  sfxVolume = Math.max(0, Math.min(1.5, n));
  if (masterGain) masterGain.gain.value = sfxMuted ? 0 : sfxVolume;
}

function beep({
  freq = 440,
  freq2 = null,
  duration = 0.08,
  vol = 0.12,
  type = "square",
} = {}) {
  if (sfxMuted) return;
  if (!ensureAudio()) return;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const t = audioCtx.currentTime;

  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (typeof freq2 === "number" && freq2 > 0) {
    osc.frequency.exponentialRampToValueAtTime(freq2, t + duration);
  }

  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(t);
  osc.stop(t + duration + 0.01);
}

// 機械鍵盤三層合成：tick（觸發）+ clack（觸底）+ thud（震動）
function keyClick({ vol = 0.4, pitchMult = 1.0, error = false } = {}) {
  if (sfxMuted) return;
  if (!ensureAudio()) return;

  const t = audioCtx.currentTime;
  const sr = audioCtx.sampleRate;
  // 每次按鍵 ±10% 隨機音高，模擬真實鍵盤的自然差異
  const pm = pitchMult * (0.9 + Math.random() * 0.2);

  // Layer 1: 極短 highpass 噪音 → switch 觸發的 "tick"（0~3ms）
  const tickDur = 0.003;
  const tickBuf = audioCtx.createBuffer(1, Math.ceil(sr * tickDur), sr);
  const tickData = tickBuf.getChannelData(0);
  for (let i = 0; i < tickData.length; i++) tickData[i] = Math.random() * 2 - 1;

  const tickSrc = audioCtx.createBufferSource();
  tickSrc.buffer = tickBuf;

  const tickHp = audioCtx.createBiquadFilter();
  tickHp.type = "highpass";
  tickHp.frequency.value = 8000 * pm;

  const tickGain = audioCtx.createGain();
  tickGain.gain.setValueAtTime(vol * 1.5, t);
  tickGain.gain.exponentialRampToValueAtTime(0.0001, t + tickDur);

  tickSrc.connect(tickHp);
  tickHp.connect(tickGain);
  tickGain.connect(masterGain);
  tickSrc.start(t);
  tickSrc.stop(t + tickDur + 0.005);

  // Layer 2: bandpass 噪音 → keycap 觸底的 "clack"（2ms 後延遲觸發）
  const clackDur = error ? 0.04 : 0.025;
  const clackBuf = audioCtx.createBuffer(1, Math.ceil(sr * clackDur), sr);
  const clackData = clackBuf.getChannelData(0);
  for (let i = 0; i < clackData.length; i++) clackData[i] = Math.random() * 2 - 1;

  const clackSrc = audioCtx.createBufferSource();
  clackSrc.buffer = clackBuf;

  const clackBp = audioCtx.createBiquadFilter();
  clackBp.type = "bandpass";
  clackBp.frequency.value = (error ? 1200 : 2800) * pm;
  clackBp.Q.value = 1.5;

  const clackGain = audioCtx.createGain();
  clackGain.gain.setValueAtTime(0.0001, t + 0.002);
  clackGain.gain.exponentialRampToValueAtTime(vol * 0.85, t + 0.005);
  clackGain.gain.exponentialRampToValueAtTime(0.0001, t + clackDur);

  clackSrc.connect(clackBp);
  clackBp.connect(clackGain);
  clackGain.connect(masterGain);
  clackSrc.start(t);
  clackSrc.stop(t + clackDur + 0.005);

  // Layer 3: sine 頻率下掃 → 鍵帽撞板的低頻 "thud"
  const osc = audioCtx.createOscillator();
  const oscGain = audioCtx.createGain();
  osc.type = "sine";
  const thudFreq = (error ? 60 : 100) * pm;
  osc.frequency.setValueAtTime(thudFreq * 1.8, t);
  osc.frequency.exponentialRampToValueAtTime(thudFreq, t + 0.01);
  osc.frequency.exponentialRampToValueAtTime(thudFreq * 0.35, t + 0.055);
  oscGain.gain.setValueAtTime(0.0001, t);
  oscGain.gain.exponentialRampToValueAtTime(vol * 0.6, t + 0.003);
  oscGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
  osc.connect(oscGain);
  oscGain.connect(masterGain);
  osc.start(t);
  osc.stop(t + 0.07);
}

function sfxStart() {
  keyClick({ vol: 0.45, pitchMult: 1.1 });
}
function sfxCorrect() {
  keyClick({ vol: 0.4 });
}
function sfxWrong() {
  keyClick({ vol: 0.45, pitchMult: 0.65, error: true });
}
function sfxReset() {
  beep({ freq: 330, freq2: 220, duration: 0.06, vol: 0.3, type: "triangle" });
}
function sfxNewText() {
  beep({ freq: 523, freq2: 659, duration: 0.05, vol: 0.25, type: "square" });
}
function sfxEnd() {
  beep({ freq: 196, freq2: 98, duration: 0.18, vol: 0.45, type: "sawtooth" });
}

function newText() {
  if (!TEXTS.length) TEXTS = FALLBACK_TEXTS.slice();
  currentText = TEXTS[Math.floor(Math.random() * TEXTS.length)];
}

async function loadTexts() {
  const res = await fetch("type_master_texts.php", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load texts: HTTP ${res.status}`);
  const data = await res.json();
  if (!data || !Array.isArray(data.texts)) throw new Error("Invalid texts JSON");

  const texts = data.texts
    .filter((t) => typeof t === "string")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  if (!texts.length) throw new Error("No texts found");
  TEXTS = texts;
}

function renderText() {
  charStates = currentText.split("").map(() => "pending");
  charCounts = currentText
    .split("")
    .map(() => ({ correct: 0, error: 0, totalTyped: 0 }));
  const display = document.getElementById("text-display");

  // Group chars into words so we can wrap each word in inline-block
  // This prevents mid-word line breaks
  let html = "";
  let charIndex = 0;
  const words = currentText.split(" ");
  words.forEach((word, wi) => {
    html += '<span class="word">';
    for (let ci = 0; ci < word.length; ci++) {
      const i = charIndex;
      html += `<span class="char" data-index="${i}" data-state="pending" data-space="0">${word[ci]}</span>`;
      charIndex++;
    }
    html += "</span>";
    if (wi < words.length - 1) {
      html += `<span class="char" data-index="${charIndex}" data-state="pending" data-space="1">&nbsp;</span>`;
      charIndex++;
    }
  });

  display.innerHTML = html;
  const spans = display.querySelectorAll(".char");
  if (spans[0]) spans[0].dataset.state = "current";
  updateDisplay();
}

function updateDisplay() {
  document.querySelectorAll("#text-display .char").forEach((span) => {
    const state = span.dataset.state;
    const isSpace = span.dataset.space === "1";
    span.className = "char" + (isSpace ? " space-char" : "") + " " + state;
  });
}

function resetStats() {
  currentIndex = 0;
  correctCount = 0;
  errorCount = 0;
  totalTyped = 0;
  combo = 0;
  charStates = [];
  charCounts = [];
  started = false;
  finished = false;
  clearInterval(timerInterval);
  timerInterval = null;
  currentTime = selectedTime;
  document.getElementById("wpm-val").textContent = "0";
  document.getElementById("timer-val").textContent = selectedTime;
  document.getElementById("acc-val").textContent = "100%";
  document.getElementById("combo-val").textContent = "0";
  document.getElementById("progress-bar").style.width = "0%";
  document.getElementById("click-hint").style.display = "block";
}

function resetGame() {
  resetStats();
  newText();
  renderText();
}

function startTimer() {
  if (timerInterval) return;
  timerInterval = setInterval(() => {
    currentTime--;
    document.getElementById("timer-val").textContent = currentTime;
    if (currentTime <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      endGame();
    }
  }, 1000);
}

function calcWPM() {
  const elapsed = selectedTime - currentTime || 1;
  return Math.round(correctCount / 5 / (elapsed / 60));
}

function calcAcc() {
  if (totalTyped === 0) return 100;
  return Math.round((correctCount / totalTyped) * 100);
}

function endGame() {
  finished = true;
  sfxEnd();
  const wpm = calcWPM();
  const acc = calcAcc();
  document.getElementById("res-wpm").textContent = wpm;
  document.getElementById("res-acc").textContent = acc + "%";
  document.getElementById("res-chars").textContent = totalTyped;
  document.getElementById("res-correct").textContent = correctCount;
  document.getElementById("res-errors").textContent = errorCount;

  let rank, color;
  if (wpm >= 100) {
    rank = "🏆 S RANK — LEGENDARY";
    color = "#FFD700";
  } else if (wpm >= 80) {
    rank = "⚡ A RANK — EXCELLENT";
    color = "#00ff88";
  } else if (wpm >= 60) {
    rank = "✦ B RANK — SKILLED";
    color = "#7eb8f7";
  } else if (wpm >= 40) {
    rank = "◆ C RANK — AVERAGE";
    color = "#ff6b35";
  } else {
    rank = "▲ D RANK — KEEP GOING";
    color = "#7b5ea7";
  }

  const rankEl = document.getElementById("res-rank");
  rankEl.textContent = rank;
  rankEl.style.color = color;
  rankEl.style.borderTop = `2px solid ${color}`;
  rankEl.style.borderBottom = `2px solid ${color}`;
  document.getElementById("result-overlay").classList.add("show");
}

function closeResult() {
  document.getElementById("result-overlay").classList.remove("show");
}

function handleKey(key) {
  if (key === "Tab" || key === "Escape") {
    closeResult();
    resetGame();
    return;
  }
  if (document.getElementById("result-overlay").classList.contains("show"))
    return;
  if (finished) return;

  const spans = document.querySelectorAll("#text-display .char");

  // --- BACKSPACE ---
  if (key === "Backspace") {
    if (currentIndex === 0) return;
    // Undo current cursor
    spans[currentIndex] && (spans[currentIndex].dataset.state = "pending");
    currentIndex--;
    // Undo stats of the char we're going back to
    const prev = charStates[currentIndex];
    if (prev === "correct") {
      correctCount--;
      totalTyped--;
    }
    if (prev === "wrong") {
      errorCount--;
      totalTyped--;
    }
    charStates[currentIndex] = "pending";
    spans[currentIndex].dataset.state = "current";
    combo = 0;
    updateDisplay();
    document.getElementById("progress-bar").style.width =
      (currentIndex / currentText.length) * 100 + "%";
    document.getElementById("wpm-val").textContent = calcWPM();
    document.getElementById("acc-val").textContent = calcAcc() + "%";
    document.getElementById("combo-val").textContent = combo;
    return;
  }

  if (key.length !== 1) return;

  if (!started) {
    started = true;
    document.getElementById("click-hint").style.display = "none";
    sfxStart();
    startTimer();
  }

  const expected = currentText[currentIndex];
  totalTyped++;

  if (key === expected) {
    charStates[currentIndex] = "correct";
    spans[currentIndex].dataset.state = "correct";
    correctCount++;
    combo++;
    sfxCorrect();
  } else {
    charStates[currentIndex] = "wrong";
    spans[currentIndex].dataset.state = "wrong";
    errorCount++;
    combo = 0;
    sfxWrong();
    const disp = document.getElementById("text-display");
    disp.classList.remove("shake-active");
    void disp.offsetWidth;
    disp.classList.add("shake-active");
  }
  updateDisplay();

  currentIndex++;
  if (spans[currentIndex]) {
    spans[currentIndex].dataset.state = "current";
    updateDisplay();
  }

  document.getElementById("progress-bar").style.width =
    (currentIndex / currentText.length) * 100 + "%";
  document.getElementById("wpm-val").textContent = calcWPM();
  document.getElementById("acc-val").textContent = calcAcc() + "%";
  document.getElementById("combo-val").textContent = combo;

  if (currentIndex >= currentText.length) {
    newText();
    currentIndex = 0;
    document.getElementById("progress-bar").style.width = "0%";
    renderText();
  }
}

// Listen on document AND window for broader capture
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (["Tab", "Escape", "Backspace"].includes(e.key)) e.preventDefault();
  if (e.key.length === 1) e.preventDefault();
  handleKey(e.key);
});

// Buttons
document.getElementById("restart-btn").addEventListener("click", () => {
  sfxReset();
  resetGame();
});
document.getElementById("newtext-btn").addEventListener("click", () => {
  sfxNewText();
  newText();
  resetStats();
  renderText();
});
document.getElementById("play-again-btn").addEventListener("click", () => {
  sfxReset();
  closeResult();
  resetGame();
});

// SFX toggle
const sfxBtn = document.getElementById("sfx-btn");
if (sfxBtn) {
  sfxBtn.addEventListener("click", () => {
    // Creating/resuming the AudioContext here improves the odds of sfx working immediately.
    ensureAudio();
    setSfxMuted(!sfxMuted);
    try {
      localStorage.setItem("type_master_sfx_muted", sfxMuted ? "1" : "0");
    } catch {}
  });
}

const sfxVol = document.getElementById("sfx-vol");
const sfxVolVal = document.getElementById("sfx-vol-val");
if (sfxVol) {
  const applyUi = () => {
    if (sfxVolVal) sfxVolVal.textContent = String(sfxVol.value);
  };

  sfxVol.addEventListener("input", () => {
    ensureAudio();
    const v01 = Number(sfxVol.value) / 100 * 1.5;
    setSfxVolume01(v01);
    applyUi();
    try {
      localStorage.setItem("type_master_sfx_vol", String(sfxVol.value));
    } catch {}
  });

  // 放手時播放示意音，讓使用者感受當前音量
  sfxVol.addEventListener("change", () => {
    keyClick({ vol: 0.4 });
  });

  // Will be updated from storage in init().
  applyUi();
}

// Mode buttons
document.querySelectorAll(".mode-btn[data-mode]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".mode-btn[data-mode]")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    selectedTime = parseInt(btn.dataset.mode, 10);
    sfxReset();
    resetGame();
  });
});

// Init
async function init() {
  // Restore preferences early so they apply on the first SFX.
  try {
    const storedVol = localStorage.getItem("type_master_sfx_vol");
    if (storedVol != null) {
      const vNum = Number(storedVol);
      if (Number.isFinite(vNum)) {
        const clamped = Math.max(0, Math.min(100, Math.round(vNum)));
        const el = document.getElementById("sfx-vol");
        const out = document.getElementById("sfx-vol-val");
        if (el) el.value = String(clamped);
        if (out) out.textContent = String(clamped);
        setSfxVolume01(clamped / 100 * 1.5);
      }
    } else {
      const el = document.getElementById("sfx-vol");
      const out = document.getElementById("sfx-vol-val");
      if (el) el.value = String(Math.round(sfxVolume / 1.5 * 100));
      if (out) out.textContent = String(Math.round(sfxVolume / 1.5 * 100));
    }

    const storedMuted = localStorage.getItem("type_master_sfx_muted");
    if (storedMuted != null) setSfxMuted(storedMuted === "1");
    else setSfxMuted(false);
  } catch {
    setSfxMuted(false);
  }

  const hint = document.getElementById("click-hint");
  if (hint) {
    hint.textContent = "[ LOADING TEXTS... ]";
    hint.style.display = "block";
  }

  try {
    await loadTexts();
  } catch (e) {
    // If the page isn't served by PHP (e.g. opened via file://), fall back to embedded texts.
    TEXTS = FALLBACK_TEXTS.slice();
    console.warn(e);
  }

  if (hint) hint.textContent = "[ PRESS ANY KEY TO START ]";
  resetGame();
}

init();
