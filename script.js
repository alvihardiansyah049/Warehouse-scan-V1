const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyeHLqTN_L6A6ZLft1t33_yu5f9EQ1ZX3XFH-M5vmmVFvURSnJI6BVYMXks20JYfBrS/exec";
const SCAN_COOLDOWN_MS = 3000;

const COURIER_PREFIXES = [
  { prefix: "SPXID", name: "Shopee Express" },
  { prefix: "SPX",   name: "Shopee Express" },
  { prefix: "WHID",  name: "Wahana" },
  { prefix: "WHE",   name: "Wahana" },
  { prefix: "JNT",   name: "J&T Express" },
  { prefix: "JX",    name: "J&T Express" },
  { prefix: "JY",    name: "J&T Express" },
  { prefix: "NJV",   name: "Ninja Xpress" },
  { prefix: "ANT",   name: "Anteraja" },
  { prefix: "TKP",   name: "Tiki" },
  { prefix: "AWB",   name: "SiCepat" },
  { prefix: "GE",    name: "SiCepat" },
  { prefix: "TG",    name: "JNE" },
  { prefix: "JD",    name: "JNE" },
  { prefix: "CM",    name: "JNE" },
  { prefix: "LP",    name: "LION Parcel" },
  { prefix: "FX",    name: "First Logistics" },
  { prefix: "POS",   name: "Pos Indonesia" },
  { prefix: "RZ",    name: "RPX" },
  { prefix: "DP",    name: "Anteraja" },
];

let html5QrCode     = null;
let isProcessing    = false;
let lastScannedCode = null;
let lastScannedTime = 0;

const btnStart    = document.getElementById("btnStart");
const btnStop     = document.getElementById("btnStop");
const statusBox   = document.getElementById("statusBox");
const statusResi  = document.getElementById("statusResi");
const resiText    = document.getElementById("resiText");
const courierText = document.getElementById("courierText");
const scanTime    = document.getElementById("scanTime");
const historyList = document.getElementById("historyList");

function detectCourier(noResi) {
  const upper = String(noResi).trim().toUpperCase();
  for (const c of COURIER_PREFIXES) {
    if (upper.startsWith(c.prefix)) return c.name;
  }
  return "Tidak Dikenali";
}

function playBeep(frequency, duration, times = 1, gap = 0.22) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    for (let i = 0; i < times; i++) {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "square";
      osc.frequency.value = frequency;
      const start = ctx.currentTime + i * (duration + gap);
      gain.gain.setValueAtTime(0.4, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      osc.start(start);
      osc.stop(start + duration);
    }
    setTimeout(() => ctx.close(), (times * (duration + gap) + 0.2) * 1000);
  } catch (e) {}
}

function bipValid()     { playBeep(1000, 0.15, 1); }
function bipDuplicate() { playBeep(400,  0.18, 2); }

function startScanner() {
  html5QrCode = new Html5Qrcode("reader");
  html5QrCode
    .start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 260, height: 160 } },
      onScanSuccess,
      () => {}
    )
    .then(() => {
      btnStart.disabled = true;
      btnStop.disabled  = false;
      setStatus("idle", "📷", "Arahkan ke Barcode", "");
    })
    .catch(() => {
      setStatus("error", "❌", "Gagal akses kamera", "Pastikan izin kamera aktif");
    });
}

function stopScanner() {
  if (html5QrCode) {
    html5QrCode.stop().then(() => {
      html5QrCode.clear();
      html5QrCode       = null;
      btnStart.disabled = false;
      btnStop.disabled  = true;
      setStatus("idle", "📷", "Siap Scan", "");
    }).catch(() => {});
  }
}

function onScanSuccess(decodedText) {
  const now = Date.now();
  if (
    isProcessing ||
    (decodedText === lastScannedCode && now - lastScannedTime < SCAN_COOLDOWN_MS)
  ) return;
  lastScannedCode = decodedText;
  lastScannedTime = now;
  processResi(decodedText);
}

async function processResi(noResi) {
  isProcessing = true;
  const kurir         = detectCourier(noResi);
  const waktuSekarang = formatWaktu(new Date());

  resiText.textContent    = noResi;
  courierText.textContent = kurir;
  scanTime.textContent    = waktuSekarang;
  setStatus("loading", "⏳", "Mengecek...", noResi);

  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "checkAndSave", noResi, kurir, waktu: waktuSekarang }),
    });
    const result = await response.json();

    if (result.status === "valid") {
      setStatus("valid", "✅", "Resi Valid", noResi);
      addHistory(noResi, kurir, waktuSekarang, "valid");
      bipValid();
    } else if (result.status === "duplicate") {
      setStatus("duplicate", "⚠️", "Sudah Pernah Discan", noResi);
      addHistory(noResi, kurir, waktuSekarang, "duplicate");
      bipDuplicate();
    } else {
      setStatus("error", "❓", "Respon Tidak Dikenali", "");
    }
  } catch (err) {
    setStatus("error", "❌", "Gagal ke Server", "Cek koneksi internet");
  } finally {
    isProcessing = false;
  }
}

function setStatus(type, icon, text, resiInfo) {
  statusBox.className = "status-box status-" + type;
  statusBox.querySelector(".status-icon").textContent = icon;
  statusBox.querySelector(".status-text").textContent = text;
  statusResi.textContent = resiInfo || "";
}

function addHistory(noResi, kurir, waktu, type) {
  const li = document.createElement("li");
  li.className = type === "valid" ? "h-valid" : "h-duplicate";
  li.innerHTML = `
    <span class="h-resi">
      ${type === "valid" ? "✅" : "⚠️"} ${escapeHtml(noResi)}
      <br><span class="h-courier">${escapeHtml(kurir)}</span>
    </span>
    <span class="h-time">${waktu}</span>
  `;
  historyList.prepend(li);
}

function formatWaktu(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

btnStart.addEventListener("click", startScanner);
btnStop.addEventListener("click", stopScanner);
