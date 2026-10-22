///////////////////////////////////////////////////////////////
//                                                           //
//  metricsmonitor-analyzer.js                      (V2.8b)  //
//                                                           //
//  by Highpoint               last update: 22.10.2026       //
//                                                           //
//  Thanks for support by                                    //
//  Jeroen Platenkamp, Bkram, Wötkylä, AmateurAudioDude      //
//  GOR and Bojcha                                           //
//                                                           //
//  https://github.com/Highpoint2000/metricsmonitor          //
//                                                           //
///////////////////////////////////////////////////////////////

(() => {
const sampleRate = 192000;    // Do not touch - this value is automatically updated via the config file
const MPXmode = "auto";    // Do not touch - this value is automatically updated via the config file
const MPXStereoDecoder = "off";    // Do not touch - this value is automatically updated via the config file
const MPXInputCard = "Mikrofon (3- HD USB Audio Device)";    // Do not touch - this value is automatically updated via the config file
const MPXTiltCalibration = 0;    // Do not touch - this value is automatically updated via the config file
const VisualDelayMs = 275;    // Do not touch - this value is automatically updated via the config file
const MeterInputCalibration = -0.4;    // Do not touch - this value is automatically updated via the config file
const MeterPilotCalibration = 0;    // Do not touch - this value is automatically updated via the config file
const MeterMPXCalibration = 0;    // Do not touch - this value is automatically updated via the config file
const MeterRDSCalibration = 0;    // Do not touch - this value is automatically updated via the config file
const MeterPilotScale = 116.857176;    // Do not touch - this value is automatically updated via the config file
const MeterRDSScale = 132.2072;    // Do not touch - this value is automatically updated via the config file
const fftSize = 4096;    // Do not touch - this value is automatically updated via the config file
const SpectrumAttackLevel = 3;    // Do not touch - this value is automatically updated via the config file
const SpectrumDecayLevel = 15;    // Do not touch - this value is automatically updated via the config file
const SpectrumSendInterval = 30;    // Do not touch - this value is automatically updated via the config file
const SpectrumYOffset = -40;    // Do not touch - this value is automatically updated via the config file
const SpectrumYDynamics = 2;    // Do not touch - this value is automatically updated via the config file
const ScopeInputCalibration = 9;    // Do not touch - this value is automatically updated via the config file
const StereoBoost = 2.3;    // Do not touch - this value is automatically updated via the config file
const AudioMeterBoost = 1.2;    // Do not touch - this value is automatically updated via the config file
const MODULE_SEQUENCE = [3,0,1,2,5,4];    // Do not touch - this value is automatically updated via the config file
const CANVAS_SEQUENCE = [2,5,4];    // Do not touch - this value is automatically updated via the config file
const MultipathMode = 0;    // Do not touch - this value is automatically updated via the config file
const LockVolumeSlider = true;    // Do not touch - this value is automatically updated via the config file
const EnableSpectrumOnLoad = true;    // Do not touch - this value is automatically updated via the config file
const EnableAnalyzerAdminMode = false;    // Do not touch - this value is automatically updated via the config file
const MeterColorSafe = "rgb(0, 255, 0)";    // Do not touch - this value is automatically updated via the config file
const MeterColorWarning = "rgb(255, 255,0)";    // Do not touch - this value is automatically updated via the config file
const MeterColorDanger = "rgb(255, 0, 0)";    // Do not touch - this value is automatically updated via the config file
const PeakMode = "dynamic";    // Do not touch - this value is automatically updated via the config file
const PeakColorFixed = "rgb(251, 174, 38)";    // Do not touch - this value is automatically updated via the config file

const MeterTiltCalibration = -900;    // Do not touch - this value is automatically updated via the config file

/////////////////////////////////////////////////////////////////
// Shared WebSocket Hub (delegates to global singleton)
/////////////////////////////////////////////////////////////////
const MpxHub = {
  subscribe(fn) {
    if (typeof fn !== "function") return () => {};
    const wrapper = (msg) => {
      if (!msg || typeof msg !== "object" || msg.type !== "MPX") return;
      fn(msg);
    };
    return window.MetricsMpxHub.subscribe(wrapper);
  },
  send: (data) => window.MetricsMpxHub.send(data),
  connect: () => window.MetricsMpxHub.reopen(),
};

function closeMpxSocket() {
  // Connection is shared via MetricsMpxHub — no-op here
}

/////////////////////////////////////////////////////////////////
// Keyboard Hub
/////////////////////////////////////////////////////////////////
const KeyboardHub = (() => {
  let installed = false;
  let active = null;

  function setActive(instance) { active = instance; }
  function installOnce() {
    if (installed) return;
    installed = true;

    window.addEventListener("keydown", (e) => {
      if (!active) return;
      active._onGlobalKeyDown?.(e);
    }, { passive: false });

    window.addEventListener("keyup", (e) => {
      if (!active) return;
      active._onGlobalKeyUp?.(e);
    }, { passive: false });
  }

  return { installOnce, setActive };
})();

/////////////////////////////////////////////////////////////////
// Instance Implementation
/////////////////////////////////////////////////////////////////
let __mmAnalyzerSeq = 0;
const __instances = new Map();

// --- GLOBAL Heartbeat Manager ---
let _heartbeatInterval = null;

function checkHeartbeatStatus() {
    const hasInstances = __instances.size > 0;

    if (hasInstances && !_heartbeatInterval) {
        // Start Heartbeat
        MpxHub.send({ type: "MPX", cmd: "spectrum_heartbeat" });
        _heartbeatInterval = setInterval(() => {
            MpxHub.send({ type: "MPX", cmd: "spectrum_heartbeat" });
        }, 2000);
    }
    else if (!hasInstances && _heartbeatInterval) {
        // Stop Heartbeat
        clearInterval(_heartbeatInterval);
        _heartbeatInterval = null;
    }
}

function createAnalyzerInstance(containerId = "level-meter-container", options = {}) {
  const id = (++__mmAnalyzerSeq);
  const instanceKey = String(options.instanceKey || id);

  // DOM Handling
  const parent = document.getElementById(containerId);
  if (!parent) return null;
  parent.innerHTML = "";

  const block = document.createElement("div");
  block.style.cssText = "display:block; margin:0; padding:0; width:100%; height:100%; position:relative;";

  const embedded = !!options.embedded;
  const wantLegacyCss = !embedded && (options.useLegacyCss !== false);

  const wrap = document.createElement("div");
  wrap.dataset.mmAnalyzerWrap = "1";
  wrap.id = wantLegacyCss ? "mpxCanvasContainer" : `mpxCanvasContainer-${instanceKey}`;

  const canvas = document.createElement("canvas");
  canvas.id = wantLegacyCss ? "mpxCanvas" : `mpxCanvas-${instanceKey}`;

  if (embedded) {
    wrap.style.cssText = "width:100%; height:100%; margin:0; padding:0; border:none; border-radius:0; box-shadow:none; overflow:hidden;";
    canvas.style.cssText = "display:block; width:100%; height:100%;";
  }

  wrap.appendChild(canvas);
  block.appendChild(wrap);
  parent.appendChild(block);

  // --- MODE LABEL (Bottom Left, non-clickable) ---
  const modeLabel = document.createElement("div");
  modeLabel.id = `mpx-mode-label-${instanceKey}`;
  modeLabel.title = "Spectrum view";
  modeLabel.style.cssText = `
    position: absolute;
    bottom: ${embedded ? '15px' : '6px'};
    left: 42px;
    color: rgba(255, 255, 255, 0.85);
    font-family: Arial, sans-serif;
    font-size: 12px;
    cursor: default;
    z-index: 50;
    user-select: none;
  `;
  modeLabel.innerText =
    sampleRate === 48000 ? "FM Audio Spectrum"
    : sampleRate === 96000 ? "FM Baseband Spectrum"
    : sampleRate === 192000 ? "MPX Spectrum"
    : "Spectrum Analyzer";
  block.appendChild(modeLabel);

  const ctx = canvas.getContext("2d");

  //////////////////////////////////////////////////////////////////
  // Instance State (Spectrum only)
  //////////////////////////////////////////////////////////////////
  let mpxSpectrum = [];
  let mpxSmoothSpectrum = [];

  const TOP_MARGIN = 18;
  const BOTTOM_MARGIN = 14;
  const OFFSET_X = 32;
  const Y_STRETCH = 0.8;
  const GRID_X_OFFSET = 30;

  const MPX_DB_MIN_DEFAULT = -80;
  const MPX_DB_MAX_DEFAULT = 0;

  // Configuration for Spectrum
  let MPX_FMAX_HZ = 76000;
  let CURVE_GAIN = 0.5;
  let CURVE_Y_OFFSET_DB = SpectrumYOffset;
  let CURVE_VERTICAL_DYNAMICS = SpectrumYDynamics;
  let CURVE_X_STRETCH = 1.40;
  let CURVE_X_SCALE = 1.0;
  let LABEL_CURVE_X_SCALE = 0.9;
  let LABEL_Y_OFFSET = -14;

  let zoomLevel = 1.0;
  let zoomCenterHz = 38000;
  const MAX_ZOOM = 20.0;
  const ZOOM_STEP = 1.3;

  let visibleStart = 0;
  let visibleEnd = MPX_FMAX_HZ;
  let viewCenter = 38000;

  let zoomLevelY = 1.0;
  let zoomCenterDB = -40; // For Spectrum
  const MIN_ZOOM_Y = 1.0;
  const MAX_ZOOM_Y = 5.0;
  const ZOOM_STEP_Y = 1.2;

  let visibleDbMin = MPX_DB_MIN_DEFAULT;
  let visibleDbMax = MPX_DB_MAX_DEFAULT;

  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartCenter = 0; // Center X at start of drag
  let dragStartCenterY = 0; // Center Y at start of drag
  let hasDragged = false;
  let hoverX = null;

  let magnifierArea = { x: 0, y: 0, width: 0, height: 0 };
  let isHoveringMagnifier = false;
  let tooltipElement = null;
  let ctrlKeyPressed = false;
  let ctrlKeyWasPressed = false;

  // Initialize View Parameters
  function initViewParams() {
      let FFT_MAX_HZ = sampleRate / 2;
      MPX_FMAX_HZ = 76000;

      if (sampleRate === 48000) {
        CURVE_X_STRETCH = 1.0;
        LABEL_CURVE_X_SCALE = 1.0;
        MPX_FMAX_HZ = 24000;
      } else if (sampleRate === 96000) {
        CURVE_X_STRETCH = 1.0;
        LABEL_CURVE_X_SCALE = 1.0;
        MPX_FMAX_HZ = 48000;
      } else {
        CURVE_X_STRETCH = 1.40;
        LABEL_CURVE_X_SCALE = 0.9;
        MPX_FMAX_HZ = 76000;
      }

      zoomLevel = 1.0;
      zoomLevelY = 1.0;

      visibleStart = 0;
      visibleEnd = MPX_FMAX_HZ;
      viewCenter = MPX_FMAX_HZ / 2;

      CURVE_GAIN = 0.5;
      CURVE_Y_OFFSET_DB = SpectrumYOffset;
      CURVE_VERTICAL_DYNAMICS = SpectrumYDynamics;

      visibleDbMin = MPX_DB_MIN_DEFAULT;
      visibleDbMax = MPX_DB_MAX_DEFAULT;
      zoomCenterDB = (visibleDbMin + visibleDbMax) / 2;

      updateZoomBounds();
      updateZoomBoundsY();
  }

  initViewParams();

  //////////////////////////////////////////////////////////////////
  // Helper Functions
  //////////////////////////////////////////////////////////////////
  function getDisplayRange() { return { min: visibleDbMin, max: visibleDbMax }; }

  function freqToBin(freqHz, totalBins) {
    const normalizedDisplayX = freqHz / (MPX_FMAX_HZ * LABEL_CURVE_X_SCALE);
    const binIndex = normalizedDisplayX * (totalBins - 1) / CURVE_X_STRETCH;
    return Math.round(Math.max(0, Math.min(totalBins - 1, binIndex)));
  }

  function binToFreq(binIndex, totalBins) {
    const normalizedDisplayX = (binIndex / (totalBins - 1)) * CURVE_X_STRETCH;
    const freqHz = normalizedDisplayX * MPX_FMAX_HZ * LABEL_CURVE_X_SCALE;
    return freqHz;
  }

  function updateZoomBounds() {
    const maxVal = MPX_FMAX_HZ;
    const visibleRange = maxVal / Math.max(1.0, zoomLevel);
    visibleStart = viewCenter - visibleRange / 2;
    visibleEnd = viewCenter + visibleRange / 2;

    if (visibleStart < 0) {
        visibleStart = 0;
        visibleEnd = visibleRange;
    }
    if (visibleEnd > maxVal) {
        visibleEnd = maxVal;
        visibleStart = maxVal - visibleRange;
    }
    viewCenter = (visibleStart + visibleEnd) / 2;
  }

  function setZoom(newZoomLevel, newCenter = null) {
    zoomLevel = Math.max(1.0, Math.min(MAX_ZOOM, newZoomLevel));
    if (newCenter !== null) viewCenter = newCenter;
    updateZoomBounds();
    updateCursor();
    drawMpxSpectrum();
  }

  function updateZoomBoundsY() {
    const totalDbRange = MPX_DB_MAX_DEFAULT - MPX_DB_MIN_DEFAULT;
    const visibleRangeDb = totalDbRange / zoomLevelY;
    visibleDbMin = zoomCenterDB - visibleRangeDb / 2;
    visibleDbMax = zoomCenterDB + visibleRangeDb / 2;

    if (visibleDbMin < MPX_DB_MIN_DEFAULT) {
      visibleDbMin = MPX_DB_MIN_DEFAULT;
      visibleDbMax = MPX_DB_MIN_DEFAULT + visibleRangeDb;
    }
    if (visibleDbMax > MPX_DB_MAX_DEFAULT) {
      visibleDbMax = MPX_DB_MAX_DEFAULT;
      visibleDbMin = MPX_DB_MAX_DEFAULT - visibleRangeDb;
    }
    zoomCenterDB = (visibleDbMin + visibleDbMax) / 2;
  }

  function setZoomY(newZoomLevel, newCenterY = null) {
    zoomLevelY = Math.max(MIN_ZOOM_Y, Math.min(MAX_ZOOM_Y, newZoomLevel));
    if (newCenterY !== null) zoomCenterDB = Math.max(MPX_DB_MIN_DEFAULT, Math.min(MPX_DB_MAX_DEFAULT, newCenterY));
    updateZoomBoundsY();
    updateCursor();
    drawMpxSpectrum();
  }

  function zoomReset() {
    const maxVal = MPX_FMAX_HZ;
    viewCenter = maxVal / 2;
    zoomLevel = 1.0;
    updateZoomBounds();

    zoomCenterDB = (MPX_DB_MIN_DEFAULT + MPX_DB_MAX_DEFAULT) / 2;
    zoomLevelY = 1.0;
    updateZoomBoundsY();

    updateCursor();
    drawMpxSpectrum();
  }

  function updateCursor() {
    if (!canvas) return;
    if (isHoveringMagnifier || ctrlKeyPressed) canvas.style.cursor = "help";
    else if (isDragging) canvas.style.cursor = "grabbing";
    else if (zoomLevel > 1.0 || zoomLevelY > 1.0) canvas.style.cursor = "grab";
    else canvas.style.cursor = "crosshair";
  }

  //////////////////////////////////////////////////////////////////
  // Tooltip Logic
  //////////////////////////////////////////////////////////////////
  function showTooltip() {
    if (tooltipElement) return;
    tooltipElement = document.createElement("div");
    tooltipElement.id = `mpx-zoom-tooltip-${instanceKey}`;
    tooltipElement.innerHTML = `
      <div style="margin-bottom: 5px; font-weight: bold;">Zoom Controls</div>
      <div style="margin-bottom: 4px;">• Scroll wheel: Horizontal zoom</div>
      <div style="margin-bottom: 4px;">• Ctrl + Scroll wheel: Vertical zoom</div>
      <div style="margin-bottom: 4px;">• Left-click + Drag: Pan view</div>
      <div style="margin-bottom: 4px;">• Right-click: Reset zoom</div>
      <div style="margin-top: 5px; border-top: 1px solid rgba(143, 234, 255, 0.2); padding-top: 5px;"></div>
      <div style="margin-bottom: 4px;">• Ctrl + Arrows: Fine Adjust</div>
      <div style="margin-bottom: 4px;">• Ctrl + Space: Reset</div>
    `;
    tooltipElement.style.cssText = `
      position: absolute;
      background: linear-gradient(to bottom, rgba(0, 40, 70, 0.95), rgba(0, 25, 50, 0.95));
      border: 1px solid rgba(143, 234, 255, 0.5);
      border-radius: 8px;
      padding: 12px 16px;
      color: #8feaff;
      font-family: Arial, sans-serif;
      font-size: 10px;
      line-height: 1.2;
      z-index: 10000;
      pointer-events: none;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
      opacity: 0;
      transition: opacity 0.2s ease-in-out;
      max-width: 320px;
      white-space: nowrap;
    `;

    const parentEl = canvas.parentElement;
    if (!parentEl) return;
    parentEl.style.position = "relative";
    parentEl.appendChild(tooltipElement);

    const tooltipWidth = 320;
    const tooltipLeft = (canvas.clientWidth - tooltipWidth) / 2;
    const tooltipTop = (magnifierArea.y || 0) - 170;

    tooltipElement.style.left = `${Math.max(5, tooltipLeft)}px`;
    tooltipElement.style.top = `${Math.max(5, tooltipTop)}px`;

    requestAnimationFrame(() => {
      if (tooltipElement) tooltipElement.style.opacity = "1";
    });
  }

  function hideTooltip() {
    if (!tooltipElement) return;
    tooltipElement.style.opacity = "0";
    setTimeout(() => {
      tooltipElement?.parentElement?.removeChild(tooltipElement);
      tooltipElement = null;
    }, 200);
  }

  //////////////////////////////////////////////////////////////////
  // Drawing Functions
  //////////////////////////////////////////////////////////////////
  function drawMpxBackground() {
    const h = canvas.clientHeight;
    const w = canvas.clientWidth;

    const grd = ctx.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, "#001225");
    grd.addColorStop(1, "#002044");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);
  }

  function drawMagnifierIcon() {
    const shiftX = embedded ? 0 : 35; 
    const x = (canvas.clientWidth / 2) + shiftX;
    const y = canvas.clientHeight - 13; 
    magnifierArea = { x: x - 10, y: y - 10, width: 20, height: 16 };
    const color = "rgba(143, 234, 255, 0.8)";
    ctx.save();
    ctx.font = "11px Arial";
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("1.0x", x, y);
    ctx.restore();
  }

  function generateFrequencyMarkers() {
    const visibleRange = visibleEnd - visibleStart;

    let step;
    if (visibleRange > 50000) step = 19000;
    else if (visibleRange > 20000) step = 10000;
    else if (visibleRange > 10000) step = 5000;
    else if (visibleRange > 5000) step = 2000;
    else if (visibleRange > 2000) step = 1000;
    else step = 500;

    const markers = [];
    const startMarker = Math.ceil(visibleStart / step) * step;
    for (let f = startMarker; f <= visibleEnd; f += step) {
      if (f === 0) continue;
      const label = f >= 1000 ? (f / 1000).toFixed(f % 1000 === 0 ? 0 : 1) + "k" : String(f);
      markers.push({ f, label });
    }
    return markers;
  }

  function generateDbMarkers() {
    const visibleRange = visibleDbMax - visibleDbMin;
    let step;
    if (visibleRange > 60) step = 10;
    else if (visibleRange > 30) step = 10;
    else if (visibleRange > 15) step = 5;
    else if (visibleRange > 8) step = 2;
    else step = 1;

    const markers = [];
    const startMarker = Math.ceil(visibleDbMin / step) * step;
    for (let db = startMarker; db <= visibleDbMax; db += step) markers.push(db);
    return markers;
  }

  function drawMpxGrid() {
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.font = "10px Arial";
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    const headerY = TOP_MARGIN - 6;

    const markers = (zoomLevel > 1) ? generateFrequencyMarkers() : [
      { f: 19000, label: "19k" }, { f: 38000, label: "38k" },
      { f: 57000, label: "57k" }, { f: 76000, label: "76k" },
      { f: 95000, label: "95k" },
    ];

    ctx.font = "11px Arial";
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    const gridTopY = TOP_MARGIN;
    const logicalHeight = canvas.clientHeight;
    const logicalWidth = canvas.clientWidth;
    const gridBottomY = logicalHeight - BOTTOM_MARGIN;

    // Draw labeled frequency markers
    markers.forEach(m => {
      let x;
      if (zoomLevel > 1) {
        if (m.f < visibleStart || m.f > visibleEnd) return;
        const normalizedPos = (m.f - visibleStart) / (visibleEnd - visibleStart);
        x = GRID_X_OFFSET + normalizedPos * (logicalWidth - GRID_X_OFFSET);
      } else {
        const horizontalScale = zoomLevel;
        x = GRID_X_OFFSET +
          (m.f / (MPX_FMAX_HZ * LABEL_CURVE_X_SCALE)) *
          (logicalWidth - GRID_X_OFFSET) * horizontalScale;
      }
      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      ctx.beginPath();
      ctx.moveTo(x, gridTopY);
      ctx.lineTo(x, gridBottomY);
      ctx.stroke();
      ctx.textAlign = "center";
      ctx.fillText(m.label, x, headerY);
    });

    // Draw unlabeled vertical lines for 16k, 22k, 54k, and 60k markers
    const silentMarkers = [16000, 22000, 54000, 60000];
    silentMarkers.forEach(f => {
      if (f > MPX_FMAX_HZ) return; // Skip if frequency exceeds current mode's max frequency
      
      let x;
      if (zoomLevel > 1) {
        if (f < visibleStart || f > visibleEnd) return;
        const normalizedPos = (f - visibleStart) / (visibleEnd - visibleStart);
        x = GRID_X_OFFSET + normalizedPos * (logicalWidth - GRID_X_OFFSET);
      } else {
        const horizontalScale = zoomLevel;
        x = GRID_X_OFFSET +
          (f / (MPX_FMAX_HZ * LABEL_CURVE_X_SCALE)) *
          (logicalWidth - GRID_X_OFFSET) * horizontalScale;
      }
      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      ctx.beginPath();
      ctx.moveTo(x, gridTopY);
      ctx.lineTo(x, gridBottomY);
      ctx.stroke();
    });

    const range = getDisplayRange();
    const usableHeight = logicalHeight - TOP_MARGIN - BOTTOM_MARGIN;
    const dbMarkers = generateDbMarkers();

    dbMarkers.forEach(v => {
      if (v < visibleDbMin || v > visibleDbMax) return;

      const norm = (v - range.min) / (range.max - range.min);
      const y = TOP_MARGIN + (1 - norm) * usableHeight * Y_STRETCH;

      if (y >= TOP_MARGIN && y <= logicalHeight - BOTTOM_MARGIN) {
        ctx.strokeStyle = "rgba(255,255,255,0.12)";
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(logicalWidth, y);
        ctx.stroke();

        if (v === 0) {
          ctx.fillStyle = "rgba(255,255,255,0.75)";
        } else {
          ctx.fillStyle = "rgba(255,255,255,0.35)";
        }

        ctx.textAlign = "right";
        ctx.fillText(`${v}`, OFFSET_X - 6, y + 10 + LABEL_Y_OFFSET);
      }
    });
  }

  function drawMpxSpectrumFill() {
    if (!mpxSpectrum || mpxSpectrum.length === 0) return;

    const range = getDisplayRange();
    const logicalWidth = canvas.clientWidth;
    const logicalHeight = canvas.clientHeight;
    const usableHeight = logicalHeight - TOP_MARGIN - BOTTOM_MARGIN;
    const usableWidth = logicalWidth - OFFSET_X;
    const bottomY = logicalHeight - BOTTOM_MARGIN;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, logicalWidth, logicalHeight);
    ctx.clip();

    ctx.beginPath();

    if (zoomLevel > 1) {
      const totalBins = mpxSpectrum.length;
      const startBin = freqToBin(visibleStart, totalBins);
      const endBin = freqToBin(visibleEnd, totalBins);

      let firstX = null;
      let lastX = null;

      for (let i = startBin; i <= endBin; i++) {
        const binFreq = binToFreq(i, totalBins);
        const normalizedX = (binFreq - visibleStart) / (visibleEnd - visibleStart);
        const x = OFFSET_X + normalizedX * usableWidth;

        let rawVal = mpxSpectrum[i];
        let val = (rawVal * CURVE_GAIN) + CURVE_Y_OFFSET_DB;
        val = MPX_DB_MIN_DEFAULT + (val - MPX_DB_MIN_DEFAULT) * CURVE_VERTICAL_DYNAMICS;

        if (val < MPX_DB_MIN_DEFAULT) val = MPX_DB_MIN_DEFAULT;
        if (val > MPX_DB_MAX_DEFAULT) val = MPX_DB_MAX_DEFAULT;

        const norm = (val - range.min) / (range.max - range.min);
        const y = TOP_MARGIN + (1 - norm) * usableHeight * Y_STRETCH;

        if (firstX === null) {
          firstX = x;
          ctx.moveTo(x, bottomY);
          ctx.lineTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        lastX = x;
      }

      if (lastX !== null) {
        ctx.lineTo(lastX, bottomY);
        ctx.closePath();
      }

    } else {
      const horizontalScale = zoomLevel;
      const usableWidthScale = (logicalWidth - OFFSET_X) * CURVE_X_SCALE;
      const leftStart = OFFSET_X;

      ctx.moveTo(leftStart, bottomY);

      for (let i = 0; i < mpxSpectrum.length; i++) {
        let rawVal = mpxSpectrum[i];
        let val = (rawVal * CURVE_GAIN) + CURVE_Y_OFFSET_DB;
        val = MPX_DB_MIN_DEFAULT + (val - MPX_DB_MIN_DEFAULT) * CURVE_VERTICAL_DYNAMICS;

        if (val < MPX_DB_MIN_DEFAULT) val = MPX_DB_MIN_DEFAULT;
        if (val > MPX_DB_MAX_DEFAULT) val = MPX_DB_MAX_DEFAULT;

        const norm = (val - range.min) / (range.max - range.min);
        const y = TOP_MARGIN + (1 - norm) * usableHeight * Y_STRETCH;

        const x = leftStart + ((i / (mpxSpectrum.length - 1)) * usableWidthScale * CURVE_X_STRETCH) * horizontalScale;
        ctx.lineTo(x, y);
      }

      const lastX = leftStart + usableWidthScale * CURVE_X_STRETCH * horizontalScale;
      ctx.lineTo(lastX, bottomY);
      ctx.closePath();
    }

    const fillGrad = ctx.createLinearGradient(0, TOP_MARGIN, 0, bottomY);
    fillGrad.addColorStop(0, "rgba(160, 245, 255, 0.4)");
    fillGrad.addColorStop(0.5, "rgba(80, 140, 200, 0.4)");
    fillGrad.addColorStop(1, "rgba(0, 30, 63, 0.5)");

    ctx.fillStyle = fillGrad;
    ctx.fill();
    ctx.restore();
  }

  function drawMpxSpectrumTrace() {
    if (!mpxSpectrum || mpxSpectrum.length === 0) return;

    const range = getDisplayRange();
    const logicalWidth = canvas.clientWidth;
    const logicalHeight = canvas.clientHeight;
    const usableHeight = logicalHeight - TOP_MARGIN - BOTTOM_MARGIN;
    const usableWidth = logicalWidth - OFFSET_X;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, logicalWidth, logicalHeight);
    ctx.clip();

    ctx.beginPath();
    ctx.strokeStyle = "#8feaff";
    ctx.lineWidth = 1.0;

    if (zoomLevel > 1) {
      const totalBins = mpxSpectrum.length;
      const startBin = freqToBin(visibleStart, totalBins);
      const endBin = freqToBin(visibleEnd, totalBins);
      let firstPoint = true;

      for (let i = startBin; i <= endBin; i++) {
        const binFreq = binToFreq(i, totalBins);
        const normalizedX = (binFreq - visibleStart) / (visibleEnd - visibleStart);
        const x = OFFSET_X + normalizedX * usableWidth;

        let rawVal = mpxSpectrum[i];
        let val = (rawVal * CURVE_GAIN) + CURVE_Y_OFFSET_DB;
        val = MPX_DB_MIN_DEFAULT + (val - MPX_DB_MIN_DEFAULT) * CURVE_VERTICAL_DYNAMICS;
        if (val < MPX_DB_MIN_DEFAULT) val = MPX_DB_MIN_DEFAULT;
        if (val > MPX_DB_MAX_DEFAULT) val = MPX_DB_MAX_DEFAULT;

        const norm = (val - range.min) / (range.max - range.min);
        const y = TOP_MARGIN + (1 - norm) * usableHeight * Y_STRETCH;

        if (firstPoint) {
          ctx.moveTo(x, y);
          firstPoint = false;
        } else {
          ctx.lineTo(x, y);
        }
      }
    } else {
      const horizontalScale = zoomLevel;
      const usableWidthScale = (logicalWidth - OFFSET_X) * CURVE_X_SCALE;
      const leftStart = OFFSET_X;

      for (let i = 0; i < mpxSpectrum.length; i++) {
        let rawVal = mpxSpectrum[i];
        let val = (rawVal * CURVE_GAIN) + CURVE_Y_OFFSET_DB;
        val = MPX_DB_MIN_DEFAULT + (val - MPX_DB_MIN_DEFAULT) * CURVE_VERTICAL_DYNAMICS;
        if (val < MPX_DB_MIN_DEFAULT) val = MPX_DB_MIN_DEFAULT;
        if (val > MPX_DB_MAX_DEFAULT) val = MPX_DB_MAX_DEFAULT;

        const norm = (val - range.min) / (range.max - range.min);
        const y = TOP_MARGIN + (1 - norm) * usableHeight * Y_STRETCH;
        const x = leftStart + ((i / (mpxSpectrum.length - 1)) * usableWidthScale * CURVE_X_STRETCH) * horizontalScale;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    }

    ctx.stroke();
    ctx.restore();
  }

  function drawHoverCursor() {
    if (hoverX === null || isDragging) return;
    if (hoverX < OFFSET_X) return;

    const logicalWidth = canvas.clientWidth;
    const graphWidth = logicalWidth - OFFSET_X;

    if (!mpxSpectrum.length) return;
    const totalBins = mpxSpectrum.length;

    let freqHz = 0;
    let bin = 0;

    if (zoomLevel > 1.0) {
      const pct = (hoverX - OFFSET_X) / graphWidth;
      freqHz = visibleStart + pct * (visibleEnd - visibleStart);

      if (freqHz < 0 || freqHz > MPX_FMAX_HZ) return;
      bin = freqToBin(freqHz, totalBins);
      
    } else {
      const screenFraction = (hoverX - OFFSET_X) / graphWidth;
      const maxVisualFreq = MPX_FMAX_HZ * LABEL_CURVE_X_SCALE;
      freqHz = screenFraction * maxVisualFreq;

      const binFraction = screenFraction / (CURVE_X_STRETCH * CURVE_X_SCALE);
      bin = Math.round(binFraction * (totalBins - 1));
      
      bin = Math.max(0, Math.min(totalBins - 1, bin));
    }

    if (bin < 0 || bin >= totalBins) return;

    let rawVal = mpxSpectrum[bin];
    let val = (rawVal * CURVE_GAIN) + CURVE_Y_OFFSET_DB;
    val = MPX_DB_MIN_DEFAULT + (val - MPX_DB_MIN_DEFAULT) * CURVE_VERTICAL_DYNAMICS;

    if (val < MPX_DB_MIN_DEFAULT) val = MPX_DB_MIN_DEFAULT;
    if (val > MPX_DB_MAX_DEFAULT) val = MPX_DB_MAX_DEFAULT;

    const range = getDisplayRange();
    const logicalHeight = canvas.clientHeight;
    const usableHeight = logicalHeight - TOP_MARGIN - BOTTOM_MARGIN;

    const normY = (val - range.min) / (range.max - range.min);
    const screenY = TOP_MARGIN + (1 - normY) * usableHeight * Y_STRETCH;

    ctx.beginPath();
    ctx.arc(hoverX, screenY, 4, 0, 2 * Math.PI);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = "12px Arial";
    ctx.textAlign = "center";

    const freqLabel =
      freqHz >= 1000 ? (freqHz / 1000).toFixed(1) + " kHz" : Math.round(freqHz) + " Hz";
    const dbLabel = val.toFixed(1) + " dB";

    let labelX = hoverX;
    if (labelX < 60) labelX = 60;
    if (labelX > logicalWidth - 60) labelX = logicalWidth - 60;

    ctx.fillText(`${freqLabel} (${dbLabel})`, labelX, screenY - 10);
  }

  function drawMpxSpectrum() {
    if (!ctx || !canvas) return;

    const logicalWidth = canvas.clientWidth;
    const logicalHeight = canvas.clientHeight;

    updateZoomBounds();
    updateZoomBoundsY();
    drawMpxBackground();
    drawMpxGrid();

    if (mpxSpectrum.length > 0) {
        drawMpxSpectrumFill();
        drawMpxSpectrumTrace();
        drawHoverCursor();
    } else {
        ctx.save();
        ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
        ctx.font = "italic 14px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("Waiting for Data...", logicalWidth / 2, logicalHeight / 2);
        ctx.restore();
    }

    if (zoomLevel !== 1.0 || zoomLevelY > 1.0) {
      let infoText = "";
      if (zoomLevel !== 1.0 && zoomLevelY > 1.0) infoText = `X:${zoomLevel.toFixed(1)}x Y:${zoomLevelY.toFixed(1)}x`;
      else if (zoomLevel !== 1.0) infoText = `${zoomLevel.toFixed(1)}x`;
      else infoText = `Y:${zoomLevelY.toFixed(1)}x`;

      const shiftX = embedded ? 0 : 35; 
      const x = (logicalWidth / 2) + shiftX;
      const y = logicalHeight - 10;

      ctx.fillStyle = "rgba(143, 234, 255, 0.8)";
      ctx.font = "11px Arial";
      ctx.textAlign = "center";
      ctx.fillText(infoText, x, y);
    } else {
        drawMagnifierIcon();
    }

    ctx.font = "12px Arial";
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(
      sampleRate + " Hz",
      logicalWidth - 8,
      logicalHeight - 10
    );
  }

  //////////////////////////////////////////////////////////////////
  // Data Handler (Spectrum only)
  //////////////////////////////////////////////////////////////////
  function handleMpxArray(msg) {
    if (!canvas || !canvas.isConnected) return;

    if (!msg || typeof msg !== "object") return;

    const arr = [];

    const sourceData = Array.isArray(msg.s) ? msg.s : (Array.isArray(msg.value) ? msg.value : []);
    if (sourceData.length === 0) {
        return;
    }

    for (let i = 0; i < sourceData.length; i++) {
      const mag = (typeof sourceData[i] === 'number') ? sourceData[i] : (sourceData[i]?.m || 0);
      let db = 20 * Math.log10(mag + 1e-15);
      if (db < MPX_DB_MIN_DEFAULT) db = MPX_DB_MIN_DEFAULT;
      if (db > MPX_DB_MAX_DEFAULT) db = MPX_DB_MAX_DEFAULT;
      arr.push(db);
    }

    if (mpxSmoothSpectrum.length === 0) {
      mpxSmoothSpectrum = new Array(arr.length).fill(MPX_DB_MIN_DEFAULT);
    }

    const len = Math.min(arr.length, mpxSmoothSpectrum.length);
    for (let i = 0; i < len; i++) {
      if (arr[i] > mpxSmoothSpectrum[i]) {
        mpxSmoothSpectrum[i] =
          (mpxSmoothSpectrum[i] * (SpectrumAttackLevel - 1) + arr[i]) / SpectrumAttackLevel;
      } else {
        mpxSmoothSpectrum[i] =
          (mpxSmoothSpectrum[i] * (SpectrumDecayLevel - 1) + arr[i]) / SpectrumDecayLevel;
      }
    }
    if (arr.length > len) {
      for (let i = len; i < arr.length; i++) mpxSmoothSpectrum[i] = arr[i];
    }
    mpxSpectrum = mpxSmoothSpectrum.slice();

    drawMpxSpectrum();
  }

  //////////////////////////////////////////////////////////////////
  // Resize Handler
  //////////////////////////////////////////////////////////////////
  function resize() {
    if (!canvas || !canvas.parentElement) return;
    const rect = canvas.parentElement.getBoundingClientRect();
    const w = rect.width > 0 ? rect.width : 400;
    const h = rect.height > 0 ? rect.height : 240;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    drawMpxSpectrum();
  }

  //////////////////////////////////////////////////////////////////
  // Mouse Event Setup
  //////////////////////////////////////////////////////////////////
  function setupMouseEvents() {
    canvas.addEventListener("mouseenter", () => {
      KeyboardHub.setActive(instance);
      updateCursor();
    });

    canvas.addEventListener("mousemove", (e) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const wasHovering = isHoveringMagnifier;
      if (zoomLevel === 1.0 && zoomLevelY <= MIN_ZOOM_Y) {
        isHoveringMagnifier =
          mouseX >= magnifierArea.x && mouseX <= magnifierArea.x + magnifierArea.width &&
          mouseY >= magnifierArea.y && mouseY <= magnifierArea.y + magnifierArea.height;
      } else {
        isHoveringMagnifier = false;
      }

      if (isHoveringMagnifier && !wasHovering) showTooltip();
      else if (!isHoveringMagnifier && wasHovering) hideTooltip();
      updateCursor();

      if (!isDragging) {
        hoverX = mouseX;
        drawMpxSpectrum();
      }

      if (!isDragging) return;
      if (Math.abs(e.clientX - dragStartX) > 5 || Math.abs(e.clientY - dragStartY) > 5) hasDragged = true;
      if (!hasDragged) return;
      e.preventDefault();
      e.stopPropagation();

      if (zoomLevel > 1.0) {
        const visibleRange = visibleEnd - visibleStart;
        const pixelsPerUnit = (canvas.clientWidth - OFFSET_X) / visibleRange;
        const delta = -(e.clientX - dragStartX) / pixelsPerUnit;
        viewCenter = dragStartCenter + delta;
      }

      if (zoomLevelY > MIN_ZOOM_Y) {
        const deltaDb = (e.clientY - dragStartY) / (((canvas.clientHeight - TOP_MARGIN - BOTTOM_MARGIN) * Y_STRETCH) / (visibleDbMax - visibleDbMin));
        zoomCenterDB = dragStartCenterY + deltaDb;
      }

      updateZoomBounds();
      updateZoomBoundsY();
      drawMpxSpectrum();
    });

    canvas.addEventListener("mouseleave", () => {
      hoverX = null;
      if (isHoveringMagnifier) {
        isHoveringMagnifier = false;
        hideTooltip();
      }
      if (isDragging) {
        isDragging = false;
        hasDragged = false;
        updateCursor();
      }
      drawMpxSpectrum();
    });

    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (isHoveringMagnifier || ctrlKeyPressed) {
        isHoveringMagnifier = false;
        hideTooltip();
      }

      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const zoomDelta = e.deltaY > 0 ? 1 / (e.ctrlKey ? ZOOM_STEP_Y : ZOOM_STEP) : (e.ctrlKey ? ZOOM_STEP_Y : ZOOM_STEP);

      if (e.ctrlKey) {
        const normY = (mouseY - TOP_MARGIN) / ((canvas.clientHeight - TOP_MARGIN - BOTTOM_MARGIN) * Y_STRETCH);
        const range = getDisplayRange();
        const dbAtMouse = range.max - normY * (range.max - range.min);
        setZoomY(zoomLevelY * zoomDelta, dbAtMouse);
      } else {
        const unitAtMouse = visibleStart + ((mouseX - OFFSET_X) / (canvas.clientWidth - OFFSET_X)) * (visibleEnd - visibleStart);
        setZoom(zoomLevel * zoomDelta, unitAtMouse);
      }
    }, { passive: false });

    canvas.addEventListener("mousedown", (e) => {
      if (e.button !== 0 || isHoveringMagnifier) return;
      e.preventDefault();
      e.stopPropagation();
      isDragging = true;
      hasDragged = false;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      dragStartCenter = viewCenter;
      dragStartCenterY = zoomCenterDB;
      updateCursor();
    });

    canvas.addEventListener("mouseup", (e) => {
      if (e.button === 0 && isDragging) {
        isDragging = false;
        updateCursor();
        if (hasDragged) e.stopPropagation();
      }
    });

    canvas.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      zoomReset();
    });

    canvas.addEventListener("click", (e) => {
      if (isHoveringMagnifier || hasDragged) {
        e.stopPropagation();
        hasDragged = false;
      }
    });
  }

  //////////////////////////////////////////////////////////////////
  // Keyboard Event Handlers
  //////////////////////////////////////////////////////////////////
  function onGlobalKeyDown(e) {
    if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA' || e.target?.isContentEditable) return;

    if (e.key === "Control" && !ctrlKeyWasPressed) {
      ctrlKeyPressed = true;
      ctrlKeyWasPressed = true;
      if (!tooltipElement) showTooltip();
      updateCursor();
    }

    if (!e.ctrlKey) return;

    let handled = false;
    switch (e.key) {
      case "ArrowUp":    setZoom(zoomLevel * ZOOM_STEP, viewCenter); handled = true; break;
      case "ArrowDown":  setZoom(zoomLevel / ZOOM_STEP, viewCenter); handled = true; break;
      case "ArrowLeft":
        if (zoomLevel > 1.0) {
          const range = visibleEnd - visibleStart;
          const panStep = range * 0.05;
          setZoom(zoomLevel, viewCenter - panStep);
        }
        handled = true;
        break;
      case "ArrowRight":
        if (zoomLevel > 1.0) {
          const range = visibleEnd - visibleStart;
          const panStep = range * 0.05;
          setZoom(zoomLevel, viewCenter + panStep);
        }
        handled = true;
        break;
      case " ":
        zoomReset();
        handled = true;
        break;
    }

    if (handled) {
      e.preventDefault();
      e.stopPropagation();
      hideTooltip();
    }
  }

  function onGlobalKeyUp(e) {
    if (e.key === "Control") {
      ctrlKeyPressed = false;
      ctrlKeyWasPressed = false;
      hideTooltip();
      updateCursor();
    }
  }

  //////////////////////////////////////////////////////////////////
  // Lifecycle Management
  //////////////////////////////////////////////////////////////////
  const unsubscribe = MpxHub.subscribe(handleMpxArray);

  function destroy() {
    try { unsubscribe?.(); } catch (e) {}
    hideTooltip();
    try { parent.innerHTML = ""; } catch (e) {}
    __instances.delete(instanceKey);
    checkHeartbeatStatus();
  }

  const instance = {
    id: instanceKey,
    containerId,
    wrap,
    canvas,
    resize,
    zoomReset,
    destroy,
    _onGlobalKeyDown: onGlobalKeyDown,
    _onGlobalKeyUp: onGlobalKeyUp,
  };

  KeyboardHub.installOnce();
  setupMouseEvents();
  __instances.set(instanceKey, instance);

  checkHeartbeatStatus();

  resize();
  updateZoomBounds();
  updateZoomBoundsY();
  updateCursor();
  drawMpxSpectrum();

  return instance;
}

/////////////////////////////////////////////////////////////////
// Public API
/////////////////////////////////////////////////////////////////
function init(containerId = "level-meter-container", options = {}) {
  const existing = [...__instances.values()].find(i => i.containerId === containerId);
  if (existing) {
    try { existing.destroy(); } catch (e) {}
  }
  return createAnalyzerInstance(containerId, options);
}

function zoomReset(target) {
  if (!target) {
    __instances.forEach(i => i.zoomReset?.());
    return;
  }
  const byKey = __instances.get(String(target));
  if (byKey) return byKey.zoomReset?.();
  const byContainer = [...__instances.values()].find(i => i.containerId === target);
  if (byContainer) return byContainer.zoomReset?.();
}

function resize(target) {
  if (!target) {
    __instances.forEach(i => i.resize?.());
    return;
  }
  const byKey = __instances.get(String(target));
  if (byKey) return byKey.resize?.();
  const byContainer = [...__instances.values()].find(i => i.containerId === target);
  if (byContainer) return byContainer.resize?.();
}

function destroy(target) {
  if (!target) {
    [...__instances.values()].forEach(i => i.destroy?.());
    return;
  }
  const byKey = __instances.get(String(target));
  if (byKey) return byKey.destroy?.();
  const byContainer = [...__instances.values()].find(i => i.containerId === target);
  if (byContainer) return byContainer.destroy?.();
}

// Global Exports
window.MetricsAnalyzer = window.MetricsAnalyzer || { cleanup: closeMpxSocket };
window.MetricsAnalyzer.init = init;
window.MetricsAnalyzer.zoomReset = zoomReset;
window.MetricsAnalyzer.resize = resize;
window.MetricsAnalyzer.destroy = destroy;

})();