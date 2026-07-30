const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyWxPp-orsGxOglLbhkq2DaaN2jf3o58TRxFJcMb2CcsB9_CNVxRu-48mvoWC_RWh51/exec";
const SCAN_COOLDOWN_MS = 3000;

let html5QrCode     = null;
let isProcessing    = false;
let lastScannedCode = null;
let lastScannedTime = 0;

const btnStart    = document.getElementById("btnStart");
const btnStop     = document.getElementById("btnStop");
const statusBox   = document.getElementById("statusBox");
const statusResi  = document.getElementById("statusResi");
const resiText    = document.getElementById("resiText");
const scanTime    = document.getElementById("scanTime");
const historyList = document.getElementById("historyList");

function playBeep(frequency, duration, times, gap) {
  times = times || 1;
  gap   = gap   || 0.22;
  try {
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    for (var i = 0; i < times; i++) {
      var osc  = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "square";
      osc.frequency.value = frequency;
      var start = ctx.currentTime + i * (duration + gap);
      gain.gain.setValueAtTime(0.4, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      osc.start(start);
      osc.stop(start + duration);
    }
    setTimeout(function() { ctx.close(); }, (times * (duration + gap) + 0.3) * 1000);
  } catch(e) {}
}

function bipValid()     { playBeep(1000, 0.15, 1); }
function bipDuplicate() { playBeep(400,  0.18, 2); }

function startScanner() {
  html5QrCode = new Html5Qrcode("reader");
  html5QrCode
    .start(
      { facingMode: "environment" },
      { fps: 25, qrbox: { width: 300, height: 100 } },
      onScanSuccess,
      function() {}
    )
    .then(function() {
      btnStart.disabled = true;
      btnStop.disabled  = false;
      setStatus("idle", "📷", "Arahkan ke Barcode", "");
    })
    .catch(function() {
      setStatus("error", "❌", "Gagal akses kamera", "Pastikan izin kamera aktif");
    });
}

function stopScanner() {
  if (html5QrCode) {
    html5QrCode.stop().then(function() {
      html5QrCode.clear();
      html5QrCode       = null;
      btnStart.disabled = false;
      btnStop.disabled  = true;
      setStatus("idle", "📷", "Siap Scan", "");
    }).catch(function(){});
  }
}

function onScanSuccess(decodedText) {
  var now = Date.now();
  if (isProcessing || (decodedText === lastScannedCode && now - lastScannedTime < SCAN_COOLDOWN_MS)) return;
  lastScannedCode = decodedText;
  lastScannedTime = now;
  processResi(decodedText);
}

async function processResi(noResi) {
  isProcessing = true;
  var waktuSekarang = formatWaktu(new Date());

  resiText.textContent = noResi;
  scanTime.textContent = waktuSekarang;
  setStatus("loading", "⏳", "Mengecek...", noResi);

  try {
    var response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "checkAndSave",
        noResi: noResi,
        waktu:  waktuSekarang
      }),
    });
    var result = await response.json();

    if (result.status === "valid") {
      setStatus("valid", "✅", "Resi Valid", noResi);
      addHistory(noResi, waktuSekarang, "valid");
      bipValid();
    } else if (result.status === "duplicate") {
      setStatus("duplicate", "⚠️", "Sudah Pernah Discan", noResi);
      addHistory(noResi, waktuSekarang, "duplicate");
      bipDuplicate();
    } else {
      setStatus("error", "❓", "Respon Tidak Dikenali", "");
    }
  } catch(err) {
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

function addHistory(noResi, waktu, type) {
  var li = document.createElement("li");
  li.className = type === "valid" ? "h-valid" : "h-duplicate";
  var icon = type === "valid" ? "✅" : "⚠️";
  li.innerHTML = '<span class="h-resi">' + icon + ' ' + escapeHtml(noResi) + '</span><span class="h-time">' + waktu + '</span>';
  historyList.prepend(li);
}

function formatWaktu(d) {
  var p = function(n) { return String(n).padStart(2, "0"); };
  return p(d.getDate()) + "/" + p(d.getMonth()+1) + "/" + d.getFullYear() + " " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
}

function escapeHtml(text) {
  var div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

btnStart.addEventListener("click", startScanner);
btnStop.addEventListener("click", stopScanner);
