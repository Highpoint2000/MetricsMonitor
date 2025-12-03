///////////////////////////////////////////////////////////////
// METRICS MONITOR — ANALYZER MODULE (MPX Spectrum)          //
///////////////////////////////////////////////////////////////

(() => {
const sampleRate = 48000;    // Do not touch - this value is automatically updated via the config file
const stereoBoost = 1;    // Do not touch - this value is automatically updated via the config file
const eqBoost = 1;    // Do not touch - this value is automatically updated via the config file
const fftSize = 512;    // Do not touch - this value is automatically updated via the config file
const SpectrumAverageLevel = 30;    // Do not touch - this value is automatically updated via the config file
const minSendIntervalMs = 15;    // Do not touch - this value is automatically updated via the config file
const MPXmode = "off";    // Do not touch - this value is automatically updated via the config file

/////////////////////////////////////////////////////////////////

let mpxCanvas = null;
let mpxCtx = null;

let mpxSpectrum = [];
let mpxSmoothSpectrum = [];

const TOP_MARGIN = 18;
const BOTTOM_MARGIN = 4;
const OFFSET_X = 32;
const Y_STRETCH = 0.8;
const GRID_X_OFFSET = 30;
const BASE_SCALE_DB = [0, -10, -20, -30, -40, -50];

let MPX_AVERAGE_LEVELS = SpectrumAverageLevel;
let MPX_DB_MIN = -58;
let MPX_DB_MAX = 0;
let MPX_FMAX_HZ = 76000;

let CURVE_GAIN = 0.80;
let CURVE_Y_OFFSET_DB = -3;
let CURVE_X_STRETCH = 1.4;
let CURVE_X_SCALE = 1.0;

let LABEL_CURVE_X_SCALE = 0.9;
let LABEL_X_OFFSET = -66;
let LABEL_Y_OFFSET = 3;

if (sampleRate === 48000) {
  CURVE_X_STRETCH = 1.163;
  CURVE_GAIN = 0.85;
  LABEL_CURVE_X_SCALE = 0.27;
  LABEL_Y_OFFSET = 3;
}
if (sampleRate === 96000) {
  CURVE_X_STRETCH = 1.157;
  LABEL_CURVE_X_SCALE = 0.54;
  CURVE_Y_OFFSET_DB = -4;
}

const currentURL = window.location;
const PORT = currentURL.port || (currentURL.protocol === "https:" ? "443" : "80");
const protocol = currentURL.protocol === "https:" ? "wss:" : "ws:";
const HOST = currentURL.hostname;
const WS_URL = `${protocol}//${HOST}:${PORT}/data_plugins`;

let mpxSocket = null;

function getDisplayRange() {
  return { min: MPX_DB_MIN, max: MPX_DB_MAX };
}

/////////////////////////////////////////////////////////////////
// Resize
/////////////////////////////////////////////////////////////////
function resizeMpxCanvas() {
  if (!mpxCanvas || !mpxCanvas.parentElement) return;

  const rect = mpxCanvas.parentElement.getBoundingClientRect();
  mpxCanvas.width = rect.width > 0 ? rect.width : 400;
  mpxCanvas.height = rect.height > 0 ? rect.height : 240;

  drawMpxSpectrum();
}

window.addEventListener("resize", resizeMpxCanvas);

/////////////////////////////////////////////////////////////////
// Handle MPX array
/////////////////////////////////////////////////////////////////
function handleMpxArray(data) {
  if (!Array.isArray(data) || data.length === 0) return;

  const arr = [];

  for (let i = 0; i < data.length; i++) {
    const mag = data[i].m || 0;
    let db = 20 * Math.log10(mag + 1e-15);

    if (db < MPX_DB_MIN) db = MPX_DB_MIN;
    if (db > MPX_DB_MAX) db = MPX_DB_MAX;

    arr.push(db);
  }

  if (mpxSmoothSpectrum.length === 0) {
    mpxSmoothSpectrum = arr.slice();
  } else {
    const len = Math.min(arr.length, mpxSmoothSpectrum.length);

    for (let i = 0; i < len; i++) {
      mpxSmoothSpectrum[i] =
        (mpxSmoothSpectrum[i] * (MPX_AVERAGE_LEVELS - 1) + arr[i]) /
        MPX_AVERAGE_LEVELS;
    }

    if (arr.length > len) {
      for (let i = len; i < arr.length; i++) {
        mpxSmoothSpectrum[i] = arr[i];
      }
    }
  }

  mpxSpectrum = mpxSmoothSpectrum.slice();
  drawMpxSpectrum();
}

/////////////////////////////////////////////////////////////////
// Drawing
/////////////////////////////////////////////////////////////////
function drawMpxBackground() {
  const grd = mpxCtx.createLinearGradient(0, 0, 0, mpxCanvas.height);
  grd.addColorStop(0, "#001225");
  grd.addColorStop(1, "#002044");
  mpxCtx.fillStyle = grd;
  mpxCtx.fillRect(0, 0, mpxCanvas.width, mpxCanvas.height);
}

/////////////////////////////////////////////////////////////////
// FIXED GRID – NEVER MOVES
/////////////////////////////////////////////////////////////////
function drawMpxGrid() {
  mpxCtx.lineWidth = 0.5;
  mpxCtx.strokeStyle = "rgba(255,255,255,0.12)";
  mpxCtx.font = "10px Arial";
  mpxCtx.fillStyle = "rgba(255,255,255,0.75)";

  const headerY = TOP_MARGIN - 6;

  mpxCtx.textAlign = "left";
  mpxCtx.fillText("dB", 15, headerY);

  const markers = [
    { f: 19000, label: "19k" },
    { f: 38000, label: "38k" },
    { f: 57000, label: "57k" },
    { f: 76000, label: "76k" },
    { f: 95000, label: "95k" },
  ];

  mpxCtx.font = "11px Arial";
  mpxCtx.fillStyle = "rgba(255,255,255,0.65)";

  const gridTopY = TOP_MARGIN;
  const gridBottomY = mpxCanvas.height - BOTTOM_MARGIN;

  markers.forEach(m => {
    const x =
      GRID_X_OFFSET +
      (m.f / (MPX_FMAX_HZ * LABEL_CURVE_X_SCALE)) *
      (mpxCanvas.width - GRID_X_OFFSET);

    mpxCtx.strokeStyle = "rgba(255,255,255,0.10)";
    mpxCtx.beginPath();
    mpxCtx.moveTo(x, gridTopY);
    mpxCtx.lineTo(x, gridBottomY);
    mpxCtx.stroke();

    mpxCtx.fillText(m.label, x + 60 + LABEL_X_OFFSET, headerY);
  });

  const range = getDisplayRange();
  const usableHeight = mpxCanvas.height - TOP_MARGIN - BOTTOM_MARGIN;

  BASE_SCALE_DB.forEach(v => {
    const norm = (v - range.min) / (range.max - range.min);

    const y = TOP_MARGIN + (1 - norm) * usableHeight * Y_STRETCH;

    mpxCtx.strokeStyle = "rgba(255,255,255,0.12)";
    mpxCtx.beginPath();
    mpxCtx.moveTo(0, y);
    mpxCtx.lineTo(mpxCanvas.width, y);
    mpxCtx.stroke();

    mpxCtx.textAlign = "right";
    mpxCtx.fillText(`${v}`, OFFSET_X - 6, y + 10 + LABEL_Y_OFFSET);
  });
}

/////////////////////////////////////////////////////////////////
// FIXED, CORRECT, ABSOLUTE ANALYZER CURVE (DEVA STYLE)
/////////////////////////////////////////////////////////////////
function drawMpxSpectrumTrace() {
  if (!mpxSpectrum.length) return;

  const usableWidth = (mpxCanvas.width - OFFSET_X) * CURVE_X_SCALE;
  const leftStart =
    OFFSET_X +
    (mpxCanvas.width - OFFSET_X - usableWidth);

  const range = getDisplayRange();
  const usableHeight = mpxCanvas.height - TOP_MARGIN - BOTTOM_MARGIN;

  mpxCtx.beginPath();
  mpxCtx.strokeStyle = "#8feaff";
  mpxCtx.lineWidth = 1.0;

  for (let i = 0; i < mpxSpectrum.length; i++) {

    // ------------------------------
    // APPLY MANUAL Y-OFFSET IN dB
    // ------------------------------
    let val = (mpxSpectrum[i] * CURVE_GAIN) + CURVE_Y_OFFSET_DB;

    // Soft clip (avoid sticking)
    if (val < MPX_DB_MIN) val = MPX_DB_MIN;
    if (val > MPX_DB_MAX) val = MPX_DB_MAX;

    const norm = (val - range.min) / (range.max - range.min);

    const y =
      TOP_MARGIN +
      (1 - norm) *
      usableHeight *
      Y_STRETCH;

    const x =
      leftStart +
      (i / (mpxSpectrum.length - 1)) *
      usableWidth *
      CURVE_X_STRETCH;

    if (i === 0) mpxCtx.moveTo(x, y);
    else mpxCtx.lineTo(x, y);
  }

  mpxCtx.stroke();
}

function drawMpxSpectrum() {
  if (!mpxCtx || !mpxCanvas) return;
  drawMpxBackground();
  drawMpxGrid();
  drawMpxSpectrumTrace();

  // ------------------------------
  // SELECT NAME BASED ON SAMPLERATE
  // ------------------------------
  let spectrumName = "Spectrum Analyzer";

  if (sampleRate === 48000) {
    spectrumName = "FM Audio Spectrum";
  } 
  else if (sampleRate === 96000) {
    spectrumName = "FM Baseband Spectrum";
  } 
  else if (sampleRate === 192000) {
    spectrumName = "MPX Spectrum";
  }

  // ------------------------------
  // DRAW TEXT
  // ------------------------------
  mpxCtx.font = "12px Arial";
  mpxCtx.fillStyle = "rgba(255,255,255,0.85)";
  mpxCtx.textAlign = "left";

  // bottom left label (dynamic)
  mpxCtx.fillText(spectrumName, 8, mpxCanvas.height - 10);

  // bottom right (samplerate)
  mpxCtx.textAlign = "right";
  mpxCtx.fillText(sampleRate + " Hz", mpxCanvas.width - 8, mpxCanvas.height - 10);
}


/////////////////////////////////////////////////////////////////
// WebSocket
/////////////////////////////////////////////////////////////////
function setupMpxSocket() {
  if (
    mpxSocket &&
    (mpxSocket.readyState === WebSocket.OPEN ||
      mpxSocket.readyState === WebSocket.CONNECTING)
  ) return;

  try {
    mpxSocket = new WebSocket(WS_URL);

    mpxSocket.onmessage = evt => {
      let msg;
      try {
        msg = JSON.parse(evt.data);
      } catch {
        return;
      }

      if (!msg || typeof msg !== "object") return;
      if (msg.type !== "MPX") return;

      if (Array.isArray(msg.value)) handleMpxArray(msg.value);
    };
  } catch {
    setTimeout(setupMpxSocket, 5000);
  }
}

/////////////////////////////////////////////////////////////////
// Public API
/////////////////////////////////////////////////////////////////
function init(containerId = "level-meter-container") {
  const parent = document.getElementById(containerId);
  parent.innerHTML = "";

  const block = document.createElement("div");
  block.style.display = "block";
  block.style.margin = "0 auto";
  block.style.padding = "0";

  const wrap = document.createElement("div");
  wrap.id = "mpxCanvasContainer";

  const canvas = document.createElement("canvas");
  canvas.id = "mpxCanvas";

  wrap.appendChild(canvas);
  block.appendChild(wrap);
  parent.appendChild(block);

  mpxCanvas = canvas;
  mpxCtx = canvas.getContext("2d");

  resizeMpxCanvas();
  block.style.width = mpxCanvas.width + "px";

  setupMpxSocket();
}

window.MetricsAnalyzer = { init };

})();
