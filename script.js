/* ===========================================================
   KONFIGURASI
   =========================================================== */

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbydeV2Jp4RdzujD3V0OYQTACD9Z5OSzgIx-W07uoxVjlUCyfAfqscMt3RMKJTr5XCU/exec";

const SCAN_COOLDOWN_MS = 3000;

/* ===========================================================
   VARIABEL GLOBAL
   =========================================================== */

let html5QrCode = null;
let isProcessing = false;
let lastScannedCode = null;
let lastScannedTime = 0;
let audioCtx = null; // AudioContext disimpan global agar bisa di-unlock sekali

/* ===========================================================
   AMBIL ELEMEN-ELEMEN HTML YANG DIBUTUHKAN
   =========================================================== */

const btnStart = document.getElementById("btnStart");
const btnStop = document.getElementById("btnStop");
const resiText = document.getElementById("resiText");
const scanTime = document.getElementById("scanTime");
const statusBox = document.getElementById("statusBox");
const historyList = document.getElementById("historyList");

/* ===========================================================
   FUNGSI SUARA BIP (Web Audio API)
   =========================================================== */

// Bip 1x nada TINGGI = resi valid
function bipValid() {
  try {
    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.value = 1000;
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.15);
  } catch (e) {}
}

// Bip 2x nada RENDAH = resi duplicate
function bipDuplicate() {
  try {
    [0, 0.22].forEach((delay) => {
      const osc  = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.frequency.value = 380;
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + delay + 0.18);
      osc.start(audioCtx.currentTime + delay);
      osc.stop(audioCtx.currentTime + delay + 0.18);
    });
  } catch (e) {}
}

/* ===========================================================
   FUNGSI: MULAI KAMERA SCANNER
   =========================================================== */
function startScanner() {
  // Unlock Web Audio API saat user tap - wajib ada interaksi user dulu
  // sebelum browser mobile mengizinkan suara keluar
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  audioCtx.resume();

  html5QrCode = new Html5Qrcode("reader");

  const config = {
    fps: 10,
    qrbox: { width: 250, height: 150 },
    aspectRatio: 1.0,
  };

  html5QrCode
    .start(
      { facingMode: "environment" },
      config,
      onScanSuccess,
      onScanFailure
    )
    .then(() => {
      btnStart.disabled = true;
      btnStop.disabled = false;
    })
    .catch((err) => {
      console.error("Gagal memulai kamera:", err);
      setStatus("error", "❌ Gagal mengakses kamera. Pastikan izin kamera diaktifkan.");
    });
}

/* ===========================================================
   FUNGSI: HENTIKAN KAMERA SCANNER
   =========================================================== */
function stopScanner() {
  if (html5QrCode) {
    html5QrCode
      .stop()
      .then(() => {
        html5QrCode.clear();
        btnStart.disabled = false;
        btnStop.disabled = true;
      })
      .catch((err) => {
        console.error("Gagal menghentikan kamera:", err);
      });
  }
}

/* ===========================================================
   CALLBACK: DIPANGGIL OTOMATIS SAAT BARCODE/QR BERHASIL DIBACA
   =========================================================== */
function onScanSuccess(decodedText) {
  const now = Date.now();

  if (
    isProcessing ||
    (decodedText === lastScannedCode && now - lastScannedTime < SCAN_COOLDOWN_MS)
  ) {
    return;
  }

  lastScannedCode = decodedText;
  lastScannedTime = now;

  processResi(decodedText);
}

/* ===========================================================
   CALLBACK: FRAME GAGAL DIBACA - NORMAL, DIABAIKAN
   =========================================================== */
function onScanFailure(error) {}

/* ===========================================================
   FUNGSI: PROSES NOMOR RESI YANG TERBACA
   =========================================================== */
async function processResi(noResi) {
  isProcessing = true;

  resiText.textContent = noResi;
  const waktuSekarang = formatWaktu(new Date());
  scanTime.textContent = waktuSekarang;

  setStatus("loading", "⏳ Mengecek nomor resi...");

  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "checkAndSave",
        noResi: noResi,
        waktu: waktuSekarang,
      }),
    });

    const result = await response.json();

    if (result.status === "valid") {
      setStatus("valid", "✅ Resi Valid");
      addHistory(noResi, waktuSekarang, "valid");
      bipValid();       // 🔊 Bip 1x nada tinggi

    } else if (result.status === "duplicate") {
      setStatus("duplicate", "⚠️ Resi Sudah Pernah Discan");
      addHistory(noResi, waktuSekarang, "duplicate");
      bipDuplicate();   // 🔊 Bip 2x nada rendah

    } else {
      setStatus("error", "❌ Respon server tidak dikenali.");
    }
  } catch (err) {
    console.error("Gagal menghubungi server:", err);
    setStatus("error", "❌ Gagal terhubung ke server. Cek koneksi internet.");
  } finally {
    isProcessing = false;
  }
}

/* ===========================================================
   FUNGSI: UBAH TAMPILAN STATUS BOX
   =========================================================== */
function setStatus(type, message) {
  statusBox.className = "status-box status-" + type;
  statusBox.textContent = message;
}

/* ===========================================================
   FUNGSI: TAMBAHKAN ITEM KE RIWAYAT SCAN
   =========================================================== */
function addHistory(noResi, waktu, type) {
  const li = document.createElement("li");
  li.className = type === "valid" ? "history-valid" : "history-duplicate";

  const icon = type === "valid" ? "✅" : "⚠️";

  li.innerHTML = `
    <span>${icon} ${escapeHtml(noResi)}</span>
    <span class="h-time">${waktu}</span>
  `;

  historyList.prepend(li);
}

/* ===========================================================
   FUNGSI BANTUAN: FORMAT WAKTU
   =========================================================== */
function formatWaktu(dateObj) {
  const pad = (n) => String(n).padStart(2, "0");
  const tanggal = `${pad(dateObj.getDate())}/${pad(dateObj.getMonth() + 1)}/${dateObj.getFullYear()}`;
  const jam = `${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}:${pad(dateObj.getSeconds())}`;
  return `${tanggal} ${jam}`;
}

/* ===========================================================
   FUNGSI BANTUAN: ESCAPE HTML
   =========================================================== */
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/* ===========================================================
   EVENT LISTENER TOMBOL
   =========================================================== */
btnStart.addEventListener("click", startScanner);
btnStop.addEventListener("click", stopScanner);

window.addEventListener("DOMContentLoaded", () => {
  // Hapus tanda komentar di baris bawah jika ingin auto-start:
  // startScanner();
});
