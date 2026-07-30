/* ===========================================================
   KONFIGURASI — ganti URL dengan milik kamu
   =========================================================== */
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzauinKu_WmUfeyXpidFHjCWVyPa9s74z6uWczZ3a2iVcbhFY2U4bHL2-M9g5tgkFVF/exec";

const SCAN_COOLDOWN_MS = 3000;

// Kredensial login (bisa diubah sesuai kebutuhan)
const VALID_USER = "admin";
const VALID_PASS = "admin";

/* ===========================================================
   DAFTAR PREFIX KURIR
   Urutan: prefix lebih panjang/spesifik duluan
   =========================================================== */
const COURIER_PREFIXES = [
  { prefix: "SPXID", name: "Shopee Express" },
  { prefix: "SPX",   name: "Shopee Express" },
  { prefix: "WHID",  name: "Wahana" },
  { prefix: "WHE",   name: "Wahana" },
  { prefix: "JY",   name: "J&T Express" },
  { prefix: "JX",    name: "J&T Express" },
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

/* ===========================================================
   VARIABEL GLOBAL
   =========================================================== */
let html5QrCode    = null;
let isProcessing   = false;
let lastScannedCode = null;
let lastScannedTime = 0;
let audioCtx       = null;

/* ===========================================================
   ELEMEN HTML
   =========================================================== */
// Login
const loginPage  = document.getElementById("loginPage");
const mainPage   = document.getElementById("mainPage");
const inputUser  = document.getElementById("inputUser");
const inputPass  = document.getElementById("inputPass");
const btnLogin   = document.getElementById("btnLogin");
const loginError = document.getElementById("loginError");
const btnLogout  = document.getElementById("btnLogout");

// Scan
const btnStart    = document.getElementById("btnStart");
const btnStop     = document.getElementById("btnStop");
const statusBox   = document.getElementById("statusBox");
const statusResi  = document.getElementById("statusResi");
const resiText    = document.getElementById("resiText");
const courierText = document.getElementById("courierText");
const scanTime    = document.getElementById("scanTime");
const historyList = document.getElementById("historyList");

/* ===========================================================
   LOGIN & LOGOUT
   =========================================================== */
function doLogin() {
  const user = inputUser.value.trim();
  const pass = inputPass.value;

  if (user === VALID_USER && pass === VALID_PASS) {
    loginError.style.display = "none";
    loginPage.style.display  = "none";
    mainPage.style.display   = "flex";
  } else {
    loginError.style.display = "block";
    inputPass.value = "";
    inputPass.focus();
  }
}

function doLogout() {
  // Stop kamera dulu jika aktif
  if (html5QrCode) {
    html5QrCode.stop().catch(() => {}).finally(() => {
      html5QrCode.clear();
      html5QrCode = null;
      resetScanState();
    });
  }
  mainPage.style.display  = "none";
  loginPage.style.display = "flex";
  inputUser.value = "";
  inputPass.value = "";
}

function resetScanState() {
  btnStart.disabled = false;
  btnStop.disabled  = true;
  setStatus("idle", "📷", "Siap Scan", "");
  resiText.textContent    = "-";
  courierText.textContent = "-";
  scanTime.textContent    = "-";
}

// Tombol login & logout
btnLogin.addEventListener("click", doLogin);
btnLogout.addEventListener("click", doLogout);

// Tekan Enter di field password = login
inputPass.addEventListener("keydown", (e) => {
  if (e.key === "Enter") doLogin();
});
inputUser.addEventListener("keydown", (e) => {
  if (e.key === "Enter") inputPass.focus();
});

/* ===========================================================
   DETEKSI KURIR DARI PREFIX NOMOR RESI
   =========================================================== */
function detectCourier(noResi) {
  const upper = String(noResi).trim().toUpperCase();
  for (const c of COURIER_PREFIXES) {
    if (upper.startsWith(c.prefix)) return c.name;
  }
  return "Tidak Dikenali";
}

/* ===========================================================
   SUARA BIP — Web Audio API
   Dibuat baru tiap panggilan agar tidak ada masalah state
   =========================================================== */
function playBeep(frequency, duration, times = 1, gap = 0.22) {
  try {
    // Buat AudioContext baru tiap kali — paling kompatibel di Android
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    for (let i = 0; i < times; i++) {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "square"; // square lebih keras & jelas dari sine di speaker HP kecil
      osc.frequency.value = frequency;
      const start = ctx.currentTime + i * (duration + gap);
      gain.gain.setValueAtTime(0.4, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      osc.start(start);
      osc.stop(start + duration);
    }
    // Tutup context setelah semua selesai
    const totalDuration = times * (duration + gap) + 0.1;
    setTimeout(() => ctx.close(), totalDuration * 1000);
  } catch (e) {
    console.warn("Audio error:", e);
  }
}

// Bip 1x nada TINGGI = valid ✅
function bipValid()     { playBeep(1000, 0.15, 1); }

// Bip 2x nada RENDAH = duplicate ⚠️
function bipDuplicate() { playBeep(400, 0.18, 2); }

/* ===========================================================
   KAMERA SCANNER
   =========================================================== */
function startScanner() {
  html5QrCode = new Html5Qrcode("reader");

  html5QrCode
    .start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 260, height: 160 } },
      onScanSuccess,
      () => {} // onScanFailure diabaikan
    )
    .then(() => {
      btnStart.disabled = true;
      btnStop.disabled  = false;
      setStatus("idle", "📷", "Arahkan ke Barcode", "");
    })
    .catch((err) => {
      console.error(err);
      setStatus("error", "❌", "Gagal akses kamera", "Pastikan izin kamera aktif");
    });
}

function stopScanner() {
  if (html5QrCode) {
    html5QrCode.stop().then(() => {
      html5QrCode.clear();
      html5QrCode    = null;
      btnStart.disabled = false;
      btnStop.disabled  = true;
      setStatus("idle", "📷", "Siap Scan", "");
    }).catch(console.error);
  }
}

/* ===========================================================
   CALLBACK SCAN BERHASIL
   =========================================================== */
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

/* ===========================================================
   PROSES RESI — cek ke Google Sheets
   =========================================================== */
async function processResi(noResi) {
  isProcessing = true;

  const kurir         = detectCourier(noResi);
  const waktuSekarang = formatWaktu(new Date());

  // Tampilkan info di kartu info
  resiText.textContent    = noResi;
  courierText.textContent = kurir;
  scanTime.textContent    = waktuSekarang;

  setStatus("loading", "⏳", "Mengecek...", noResi);

  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "checkAndSave",
        noResi: noResi,
        kurir:  kurir,
        waktu:  waktuSekarang,
      }),
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
    console.error(err);
    setStatus("error", "❌", "Gagal ke Server", "Cek koneksi internet");
  } finally {
    isProcessing = false;
  }
}

/* ===========================================================
   UPDATE STATUS BOX
   =========================================================== */
function setStatus(type, icon, text, resiInfo) {
  statusBox.className = "status-box status-" + type;
  statusBox.querySelector(".status-icon").textContent = icon;
  statusBox.querySelector(".status-text").textContent = text;
  statusResi.textContent = resiInfo || "";
}

/* ===========================================================
   TAMBAH RIWAYAT
   =========================================================== */
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

/* ===========================================================
   UTILITY
   =========================================================== */
function formatWaktu(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/* ===========================================================
   EVENT LISTENER KAMERA
   =========================================================== */
btnStart.addEventListener("click", startScanner);
btnStop.addEventListener("click", stopScanner);
