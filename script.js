/* ===========================================================
   KONFIGURASI
   =========================================================== */

// GANTI URL ini dengan URL Web App hasil deploy Google Apps Script kamu
// Cara mendapatkan URL ini ada di panduan (README) yang disertakan
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbydeV2Jp4RdzujD3V0OYQTACD9Z5OSzgIx-W07uoxVjlUCyfAfqscMt3RMKJTr5XCU/exec";

// Jeda minimum (ms) sebelum boleh scan barcode yang SAMA lagi.
// Ini mencegah kamera membaca ulang barcode yang sama berkali-kali
// dalam waktu singkat saat barcode masih ada di depan kamera.
const SCAN_COOLDOWN_MS = 3000;

/* ===========================================================
   VARIABEL GLOBAL
   =========================================================== */

let html5QrCode = null;       // Instance scanner dari library html5-qrcode
let isProcessing = false;     // Flag: true saat sedang proses cek ke Google Sheets
let lastScannedCode = null;   // Menyimpan kode terakhir yang discan
let lastScannedTime = 0;      // Menyimpan waktu (timestamp) scan terakhir

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
   FUNGSI: MULAI KAMERA SCANNER
   =========================================================== */
function startScanner() {
  // Buat instance scanner, "reader" adalah id div tempat video kamera ditampilkan
  html5QrCode = new Html5Qrcode("reader");

  // Konfigurasi area kotak pemindaian (qrbox) dan FPS kamera
  const config = {
    fps: 10,                 // Frame per second untuk proses scan
    qrbox: { width: 250, height: 150 }, // Ukuran kotak fokus pemindaian
    aspectRatio: 1.0,
  };

  // Gunakan kamera belakang (environment) karena ini perangkat HP untuk scan barcode
  html5QrCode
    .start(
      { facingMode: "environment" },
      config,
      onScanSuccess,   // Callback dipanggil otomatis saat barcode terbaca
      onScanFailure    // Callback dipanggil saat frame gagal dibaca (boleh diabaikan)
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

  // ---- ANTI DOUBLE SCAN (level kamera/frontend) ----
  // Jika kode yang sama discan ulang dalam waktu cooldown, abaikan saja.
  // Ini mencegah 1 barcode yang sama terbaca berkali-kali saat masih di depan kamera.
  if (
    isProcessing ||
    (decodedText === lastScannedCode && now - lastScannedTime < SCAN_COOLDOWN_MS)
  ) {
    return;
  }

  lastScannedCode = decodedText;
  lastScannedTime = now;

  // Langsung proses tanpa perlu klik tombol apapun
  processResi(decodedText);
}

/* ===========================================================
   CALLBACK: DIPANGGIL SAAT FRAME GAGAL DIBACA (NORMAL, BOLEH DIABAIKAN)
   =========================================================== */
function onScanFailure(error) {
  // Tidak perlu ditampilkan ke user, ini terjadi terus-menerus
  // setiap frame yang belum menemukan barcode. Cukup diabaikan.
}

/* ===========================================================
   FUNGSI: PROSES NOMOR RESI YANG TERBACA
   - Tampilkan ke UI
   - Cek ke Google Sheets apakah sudah pernah discan
   - Tampilkan status sesuai hasil
   =========================================================== */
async function processResi(noResi) {
  isProcessing = true;

  // Tampilkan dulu nomor resi yang terbaca ke area "Hasil Scan"
  resiText.textContent = noResi;
  const waktuSekarang = formatWaktu(new Date());
  scanTime.textContent = waktuSekarang;

  // Tampilkan status loading sementara proses pengecekan berjalan
  setStatus("loading", "⏳ Mengecek nomor resi...");

  try {
    // Kirim request ke Google Apps Script untuk cek + simpan data
    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      // Gunakan text/plain agar request tidak memicu CORS preflight,
      // karena Apps Script Web App tidak menangani preflight OPTIONS dengan baik.
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "checkAndSave",
        noResi: noResi,
        waktu: waktuSekarang,
      }),
    });

    const result = await response.json();

    if (result.status === "valid") {
      // Resi belum pernah discan -> sudah disimpan oleh Apps Script
      setStatus("valid", "✅ Resi Valid");
      addHistory(noResi, waktuSekarang, "valid");
    } else if (result.status === "duplicate") {
      // Resi sudah ada sebelumnya -> tidak disimpan ulang
      setStatus("duplicate", "⚠️ Resi Sudah Pernah Discan");
      addHistory(noResi, waktuSekarang, "duplicate");
    } else {
      // Status tidak dikenali dari server
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
   FUNGSI: UBAH TAMPILAN STATUS BOX (idle/loading/valid/duplicate/error)
   =========================================================== */
function setStatus(type, message) {
  // Hapus semua class status sebelumnya, lalu pasang class baru sesuai tipe
  statusBox.className = "status-box status-" + type;
  statusBox.textContent = message;
}

/* ===========================================================
   FUNGSI: TAMBAHKAN ITEM KE RIWAYAT SCAN (HANYA TAMPILAN LOKAL)
   =========================================================== */
function addHistory(noResi, waktu, type) {
  const li = document.createElement("li");
  li.className = type === "valid" ? "history-valid" : "history-duplicate";

  const icon = type === "valid" ? "✅" : "⚠️";

  li.innerHTML = `
    <span>${icon} ${escapeHtml(noResi)}</span>
    <span class="h-time">${waktu}</span>
  `;

  // Tambahkan riwayat baru di paling atas list
  historyList.prepend(li);
}

/* ===========================================================
   FUNGSI BANTUAN: FORMAT WAKTU MENJADI STRING YANG MUDAH DIBACA
   =========================================================== */
function formatWaktu(dateObj) {
  const pad = (n) => String(n).padStart(2, "0");
  const tanggal = `${pad(dateObj.getDate())}/${pad(dateObj.getMonth() + 1)}/${dateObj.getFullYear()}`;
  const jam = `${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}:${pad(dateObj.getSeconds())}`;
  return `${tanggal} ${jam}`;
}

/* ===========================================================
   FUNGSI BANTUAN: MENCEGAH INJEKSI HTML SAAT MENAMPILKAN NOMOR RESI
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

/* ===========================================================
   AUTO START KAMERA SAAT HALAMAN DIBUKA (opsional)
   Jika tidak mau auto start, hapus/komentari baris di bawah ini
   dan user harus klik tombol "Mulai Kamera" secara manual.
   =========================================================== */
window.addEventListener("DOMContentLoaded", () => {
  // Dikomentari secara default supaya user yang menentukan kapan kamera aktif
  // (lebih aman dari sisi privasi & sesuai kebiasaan aplikasi gudang).
  // Hapus tanda komentar di baris bawah jika ingin auto-start:
  // startScanner();
});