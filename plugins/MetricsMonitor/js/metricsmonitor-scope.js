///////////////////////////////////////////////////////////////
//                                                           //
//  metricsmonitor-scope.js                         (V2.8b)  //
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
const sampleRate = 192000;
const MPXmode = "auto";
const MPXStereoDecoder = "off";
const MPXInputCard = "";
const MPXTiltCalibration = 0;
const MeterInputCalibration = 0;
const MeterPilotCalibration = -9.6;
const MeterMPXCalibration = -22.7;
const MeterRDSCalibration = -3;
const MeterPilotScale = 400;
const MeterRDSScale = 750;
const fftSize = 4096;
const SpectrumAttackLevel = 3;
const SpectrumDecayLevel = 15;
const SpectrumSendInterval = 30;
const SpectrumYOffset = -40;
const SpectrumYDynamics = 2;
const StereoBoost = 0.9;
const AudioMeterBoost = 1;
const MODULE_SEQUENCE = [3,0,1,2,4];
const CANVAS_SEQUENCE = [2,4];
const LockVolumeSlider = true;
const EnableSpectrumOnLoad = true;
const EnableAnalyzerAdminMode = false;
const MeterColorSafe = "rgb(0, 255, 0)";
const MeterColorWarning = "rgb(255, 255,0)";
const MeterColorDanger = "rgb(255, 0, 0)";
const PeakMode = "dynamic";
const PeakColorFixed = "rgb(251, 174, 38)";
const MeterTiltCalibration = -900;

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
let __mmScopeSeq = 0;
const __instances = new Map();

/////////////////////////////////////////////////////////////////
// GLOBAL Heartbeat Manager (Scope)
/////////////////////////////////////////////////////////////////
let _heartbeatInterval = null;

function checkHeartbeatStatus() {
  const hasInstances = __instances.size > 0;

  if (hasInstances && !_heartbeatInterval) {
    MpxHub.send({ type: "MPX", cmd: "scope_heartbeat" });
    _heartbeatInterval = setInterval(() => {
      MpxHub.send({ type: "MPX", cmd: "scope_heartbeat" });
    }, 2000);
  }
  else if (!hasInstances && _heartbeatInterval) {
    clearInterval(_heartbeatInterval);
    _heartbeatInterval = null;
  }
}

/////////////////////////////////////////////////////////////////
// MPX Power calculation (shared, global)
// Exported via window.MetricsSharedMpxPowerDbr for external panels
/////////////////////////////////////////////////////////////////
const MPX_POWER_WINDOW_SEC = 60;
const MPX_POWER_CAL_OFFSET_DB = +0.1;
const MPX_POWER_FLOOR = 1e-12;

let _mpxPowerChunks = [];
let _mpxPowerDbr = null;
let _mpxPowerDisplayDbr = null;

function updateMpxPower(sourceData) {
  if (!sourceData || sourceData.length === 0) return;

  let sumSquares = 0;
  const count = sourceData.length;
  for (let i = 0; i < count; i++) {
    const v = sourceData[i];
    sumSquares += v * v;
  }

  const meanSquare = Math.max(MPX_POWER_FLOOR, sumSquares / count);
  const now = performance.now();

  _mpxPowerChunks.push({ t: now, meanSquare });

  const cutoff = now - (MPX_POWER_WINDOW_SEC * 1000);
  while (_mpxPowerChunks.length > 0 && _mpxPowerChunks[0].t < cutoff) {
    _mpxPowerChunks.shift();
  }

  if (_mpxPowerChunks.length > 0) {
    let windowSum = 0;
    for (let i = 0; i < _mpxPowerChunks.length; i++) {
      windowSum += _mpxPowerChunks[i].meanSquare;
    }
    const windowMeanSquare = Math.max(MPX_POWER_FLOOR, windowSum / _mpxPowerChunks.length);

    const refAmp = 19 / 75;
    const refMeanSquare = (refAmp * refAmp) / 2;
    const rawDbr = 10 * Math.log10(windowMeanSquare / refMeanSquare);
    _mpxPowerDbr = rawDbr + MPX_POWER_CAL_OFFSET_DB;

    if (_mpxPowerDisplayDbr == null) {
      _mpxPowerDisplayDbr = _mpxPowerDbr;
    } else {
      _mpxPowerDisplayDbr = (_mpxPowerDisplayDbr * 0.75) + (_mpxPowerDbr * 0.25);
    }
    window.MetricsSharedMpxPowerDbr = _mpxPowerDisplayDbr;
  }
}

function createScopeInstance(containerId = "level-meter-container", options = {}) {
  const id = (++__mmScopeSeq);
  const instanceKey = String(options.instanceKey || id);

  const parent = document.getElementById(containerId);
  if (!parent) return null;
  parent.innerHTML = "";

  const block = document.createElement("div");
  block.style.cssText = "display:block; margin:0; padding:0; width:100%; height:100%; position:relative;";

  const embedded = !!options.embedded;
  const wantLegacyCss = !embedded && (options.useLegacyCss !== false);

  const wrap = document.createElement("div");
  wrap.dataset.mmScopeWrap = "1";
  wrap.id = wantLegacyCss ? "mpxScopeContainer" : `mpxScopeContainer-${instanceKey}`;

  const canvas = document.createElement("canvas");
  canvas.id = wantLegacyCss ? "mpxScopeCanvas" : `mpxScopeCanvas-${instanceKey}`;

  if (embedded) {
    wrap.style.cssText = "width:100%; height:100%; margin:0; padding:0; border:none; border-radius:0; box-shadow:none; overflow:hidden;";
    canvas.style.cssText = "display:block; width:100%; height:100%;";
  }

  wrap.appendChild(canvas);
  block.appendChild(wrap);
  parent.appendChild(block);

  // Mode labels (bottom-left)
  const modeWrap = document.createElement("div");
  modeWrap.style.cssText = `
    position: absolute; bottom: 9px; left: 8px;
    display: flex; gap: 14px; align-items: baseline; z-index: 50;
    font-family: Arial, sans-serif; font-size: 12px; line-height: 1;
    user-select: none;
  `;
  const scopeLabel = document.createElement("div");
  scopeLabel.id = `mpx-scope-label-${instanceKey}`;
  scopeLabel.innerText = "Oscilloscope";
  scopeLabel.style.cssText = "cursor: pointer; transition: color 0.3s ease;";

  const waveformLabel = document.createElement("div");
  waveformLabel.id = `mpx-waveform-label-${instanceKey}`;
  waveformLabel.innerText = "Waveform";
  waveformLabel.style.cssText = "cursor: pointer; transition: color 0.3s ease;";

  modeWrap.appendChild(scopeLabel);
  modeWrap.appendChild(waveformLabel);
  block.appendChild(modeWrap);

  const ctx = canvas.getContext("2d", { alpha: false });

  //////////////////////////////////////////////////////////////////
  // Scope state
  //////////////////////////////////////////////////////////////////
  let displayMode = "scope"; // "scope" or "waveform"

  let scopeWave = [];
  const SCOPE_SAMPLES = 1024;
  const SCOPE_GAIN = 1.0;
  const MPX_REF_LEVEL = 1.0;

  // Phosphor effect
  const MAX_PHOSPHOR = 23;
  let phosphorBuffer = [];

  let zoomLevel = 1.0;
  let viewCenter = SCOPE_SAMPLES / 2;
  const MIN_ZOOM = 0.1;
  const MAX_ZOOM = 20.0;
  const ZOOM_STEP = 1.3;

  let visibleStart = 0;
  let visibleEnd = SCOPE_SAMPLES;

  let zoomLevelY = 1.0;
  const MIN_ZOOM_Y = 1.0;
  const MAX_ZOOM_Y = 5.0;
  const ZOOM_STEP_Y = 1.2;

  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartCenter = 0;
  let hasDragged = false;
  let hoverX = null;

  let magnifierArea = { x: 0, y: 0, width: 0, height: 0 };
  let isHoveringMagnifier = false;
  let tooltipElement = null;
  let ctrlKeyPressed = false;
  let ctrlKeyWasPressed = false;

  let globalScopeMax = 0;
  let globalScopeMin = 0;

  // Set to 0.99 for smooth peak decay matching 60FPS animation frame rate
  const SCOPE_PEAK_DECAY = 0.99;

  const TOP_MARGIN = 18;
  const BOTTOM_MARGIN = 14;
  const OFFSET_X = 32;
  const Y_STRETCH = 0.8;

  // Waveform specific state
  const WAVEFORM_SECONDS = 25;
  let waveformBars = [];
  let waveformLastPush = 0;
  let latestWaveformBar = { min: 0, max: 0 };
  let pageWasHidden = false;

  //////////////////////////////////////////////////////////////////
  // Mode toggle UI
  //////////////////////////////////////////////////////////////////
  function updateModeButtons() {
    if (displayMode === "scope") {
      scopeLabel.style.color = "rgba(0, 255, 255, 0.8)"; // Cyan (Active)
      waveformLabel.style.color = "rgba(255, 255, 255, 0.75)"; // Inactive (Matches Hz text)
    } else {
      waveformLabel.style.color = "rgba(0, 255, 255, 0.8)"; // Cyan (Active)
      scopeLabel.style.color = "rgba(255, 255, 255, 0.75)"; // Inactive (Matches Hz text)
    }
  }

  function toggleDisplayMode(mode = null) {
    if (mode === "scope" || mode === "waveform") {
      displayMode = mode;
    } else {
      displayMode = (displayMode === "scope") ? "waveform" : "scope";
    }
    
    if (displayMode === "waveform") {
        waveformBars = [];
        waveformLastPush = performance.now();
        latestWaveformBar = { min: 0, max: 0 };
    }
    
    updateModeButtons();
  }

  scopeLabel.addEventListener("click", (e) => { e.stopPropagation(); toggleDisplayMode("scope"); });
  waveformLabel.addEventListener("click", (e) => { e.stopPropagation(); toggleDisplayMode("waveform"); });
  updateModeButtons();

  function handleVisibilityChange() {
    if (document.hidden) {
      pageWasHidden = true;
    } else if (pageWasHidden) {
      waveformLastPush = performance.now();
      pageWasHidden = false;
    }
  }
  document.addEventListener("visibilitychange", handleVisibilityChange);

  //////////////////////////////////////////////////////////////////
  // Zoom helpers
  //////////////////////////////////////////////////////////////////
  function updateZoomBounds() {
    const maxVal = SCOPE_SAMPLES;
    const effectiveZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomLevel));
    const visibleRange = maxVal / effectiveZoom;
    visibleStart = viewCenter - visibleRange / 2;
    visibleEnd = viewCenter + visibleRange / 2;

    if (visibleRange >= maxVal) {
      visibleStart = (maxVal - visibleRange) / 2;
      visibleEnd = (maxVal + visibleRange) / 2;
      viewCenter = maxVal / 2;
    } else {
      if (visibleStart < 0) { visibleStart = 0; visibleEnd = visibleRange; }
      if (visibleEnd > maxVal) { visibleEnd = maxVal; visibleStart = maxVal - visibleRange; }
      viewCenter = (visibleStart + visibleEnd) / 2;
    }
  }

  function updateZoomBoundsY() {
    // Intentionally minimal: Y-zoom is applied as a multiplier in drawing.
  }

  function setZoom(newZoomLevel, newCenter = null) {
    zoomLevel = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoomLevel));
    if (newCenter !== null) viewCenter = newCenter;
    updateZoomBounds();
    updateCursor();
  }

  function setZoomY(newZoomLevel) {
    zoomLevelY = Math.max(MIN_ZOOM_Y, Math.min(MAX_ZOOM_Y, newZoomLevel));
    updateZoomBoundsY();
    updateCursor();
  }

  function zoomReset() {
    viewCenter = SCOPE_SAMPLES / 2;
    zoomLevel = 1.0;
    updateZoomBounds();
    zoomLevelY = 1.0;
    updateZoomBoundsY();
    updateCursor();
  }

  function updateCursor() {
    if (!canvas) return;
    if (isHoveringMagnifier || ctrlKeyPressed) canvas.style.cursor = "help";
    else if (isDragging) canvas.style.cursor = "grabbing";
    else if (zoomLevel !== 1.0 || zoomLevelY > 1.0) canvas.style.cursor = "grab";
    else canvas.style.cursor = "crosshair";
  }

  //////////////////////////////////////////////////////////////////
  // Tooltip
  //////////////////////////////////////////////////////////////////
  function showTooltip() {
    if (tooltipElement) return;
    tooltipElement = document.createElement("div");
    tooltipElement.id = `mpx-scope-zoom-tooltip-${instanceKey}`;
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
      border-radius: 8px; padding: 12px 16px;
      color: #8feaff; font-family: Arial, sans-serif; font-size: 10px; line-height: 1.2;
      z-index: 10000; pointer-events: none;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
      opacity: 0; transition: opacity 0.2s ease-in-out;
      max-width: 320px; white-space: nowrap;
    `;
    const parentEl = canvas.parentElement;
    if (!parentEl) return;
    parentEl.style.position = "relative";
    parentEl.appendChild(tooltipElement);
    const tooltipLeft = (canvas.clientWidth - 320) / 2;
    const tooltipTop = (magnifierArea.y || 0) - 170;
    tooltipElement.style.left = `${Math.max(5, tooltipLeft)}px`;
    tooltipElement.style.top = `${Math.max(5, tooltipTop)}px`;
    requestAnimationFrame(() => { if (tooltipElement) tooltipElement.style.opacity = "1"; });
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
  // Drawing
  //////////////////////////////////////////////////////////////////
  function drawBackground() {
    const h = canvas.clientHeight;
    const w = canvas.clientWidth;
    const grd = ctx.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, "#001225");
    grd.addColorStop(1, "#002044");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);
  }

  function drawMagnifierIcon() {
    // Offset by +40 pixels to physically center it between the left labels and right text
    const x = (canvas.clientWidth / 2) + 40; 
    const y = canvas.clientHeight - 10;
    magnifierArea = { x: x - 10, y: y - 10, width: 20, height: 16 };
    const color = "rgba(143, 234, 255, 0.8)";
    ctx.save();
    ctx.font = "12px Arial"; // Adjusted to 12px to match
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic"; // Align baseline with 192000 Hz
    ctx.fillText("1.0x", x, y);
    ctx.restore();
  }

  function drawGrid() {
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.font = "10px Arial";
    ctx.fillStyle = "rgba(255,255,255,0.75)";

    const logicalHeight = canvas.clientHeight;
    const logicalWidth = canvas.clientWidth;
    const usableHeight = logicalHeight - TOP_MARGIN - BOTTOM_MARGIN;

    const centerY = TOP_MARGIN + 0.5 * usableHeight * Y_STRETCH;
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.beginPath();
    ctx.moveTo(OFFSET_X, centerY);
    ctx.lineTo(logicalWidth, centerY);
    ctx.stroke();

    const scaleY = (usableHeight * Y_STRETCH / 2.0) * zoomLevelY;
    const refTopY = centerY - (MPX_REF_LEVEL * scaleY);
    const refBotY = centerY - (-MPX_REF_LEVEL * scaleY);

    ctx.strokeStyle = "rgba(0, 255, 255, 0.4)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 2]);

    if (refTopY >= TOP_MARGIN && refTopY <= logicalHeight - BOTTOM_MARGIN) {
      ctx.fillStyle = "rgba(0, 255, 255, 0.8)";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = "bold 11px Arial";
      ctx.fillText("REF", OFFSET_X - 26, refTopY);
      ctx.beginPath();
      ctx.moveTo(OFFSET_X, refTopY);
      ctx.lineTo(logicalWidth, refTopY);
      ctx.stroke();
    }

    if (refBotY >= TOP_MARGIN && refBotY <= logicalHeight - BOTTOM_MARGIN) {
      ctx.fillStyle = "rgba(0, 255, 255, 0.8)";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = "bold 11px Arial";
      ctx.fillText("REF", OFFSET_X - 26, refBotY);
      ctx.beginPath();
      ctx.moveTo(OFFSET_X, refBotY);
      ctx.lineTo(logicalWidth, refBotY);
      ctx.stroke();
    }

    ctx.setLineDash([]);
  }

  function drawScopeTrace(wave, alpha = 1.0) {
    if (!wave || !wave.length) return;

    const logicalWidth = canvas.clientWidth;
    const logicalHeight = canvas.clientHeight;
    const usableHeight = logicalHeight - TOP_MARGIN - BOTTOM_MARGIN;
    const usableWidth = logicalWidth - OFFSET_X;
    const centerY = TOP_MARGIN + 0.5 * usableHeight * Y_STRETCH;
    const scaleY = (usableHeight * Y_STRETCH / 2.0) * zoomLevelY;

    let startSample = Math.floor(visibleStart) - 2;
    let endSample = Math.ceil(visibleEnd) + 2;
    startSample = Math.max(0, startSample);
    endSample = Math.min(wave.length - 1, endSample);

    const visibleSampleCount = visibleEnd - visibleStart;
    if (visibleSampleCount <= 0) return;

    // Peak-hold background band (only on the latest/current wave)
    if (alpha === 1.0) {
      const yGlobalMax = centerY - (globalScopeMax * SCOPE_GAIN * scaleY);
      const yGlobalMin = centerY - (globalScopeMin * SCOPE_GAIN * scaleY);
      if (Number.isFinite(yGlobalMax) && Number.isFinite(yGlobalMin)) {
        ctx.fillStyle = "rgba(143, 234, 255, 0.08)";
        ctx.fillRect(0, yGlobalMax, logicalWidth, yGlobalMin - yGlobalMax);
      }
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.strokeStyle = "#8feaff";
    ctx.lineWidth = 1.0;

    let first = true;
    for (let i = startSample; i <= endSample; i++) {
      const x = OFFSET_X + ((i - visibleStart) / visibleSampleCount) * usableWidth;
      const val = wave[i] * SCOPE_GAIN;
      const y = centerY - (val * scaleY);
      if (first) { ctx.moveTo(x, y); first = false; }
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawWaveform(bars) {
      if (!bars || bars.length < 1) return;

      const logicalWidth = canvas.clientWidth;
      const logicalHeight = canvas.clientHeight;
      const usableHeight = logicalHeight - TOP_MARGIN - BOTTOM_MARGIN;
      const usableWidth = logicalWidth - OFFSET_X;
      const centerY = TOP_MARGIN + 0.5 * usableHeight * Y_STRETCH;
      const scaleY = (usableHeight * Y_STRETCH / 2.0) * zoomLevelY; 

      const visibleSampleCount = visibleEnd - visibleStart;
      const barWidth = Math.max(1, zoomLevel);

      ctx.save();

      // Pass 1: Outer Glow (matches oscilloscope color #8feaff but subtle)
      ctx.fillStyle = "rgba(143, 234, 255, 0.15)";
      for (let i = 0; i < bars.length; i++) {
          const virtualI = (i / usableWidth) * SCOPE_SAMPLES;
          if (virtualI < visibleStart - 10 || virtualI > visibleEnd + 10) continue;

          const px = OFFSET_X + ((virtualI - visibleStart) / visibleSampleCount) * usableWidth;
          
          const bar = bars[i];
          const y0 = centerY - bar.min * scaleY;
          const y1 = centerY - bar.max * scaleY;
          const height = Math.max(1, Math.abs(y1 - y0));
          const y = Math.min(y0, y1);
          ctx.fillRect(px - 1, y - 1, barWidth + 2, height + 2);
      }

      // Pass 2: Inner Core (exact oscilloscope color #8feaff with 85% opacity)
      ctx.fillStyle = "rgba(143, 234, 255, 0.85)";
      for (let i = 0; i < bars.length; i++) {
          const virtualI = (i / usableWidth) * SCOPE_SAMPLES;
          if (virtualI < visibleStart - 10 || virtualI > visibleEnd + 10) continue;

          const px = OFFSET_X + ((virtualI - visibleStart) / visibleSampleCount) * usableWidth;

          const bar = bars[i];
          const y0 = centerY - bar.min * scaleY;
          const y1 = centerY - bar.max * scaleY;
          const height = Math.max(1, Math.abs(y1 - y0));
          const y = Math.min(y0, y1);
          ctx.fillRect(px, y, barWidth, height);
      }
      
      ctx.restore();
  }

  function drawScope() {
    if (!ctx || !canvas) return;

    updateZoomBounds();
    updateZoomBoundsY();
    drawBackground();
    drawGrid();

    if (displayMode === "scope") {
        if (phosphorBuffer.length > 0) {
          for (let i = 0; i < phosphorBuffer.length; i++) {
            const alpha = (i === phosphorBuffer.length - 1)
              ? 1.0
              : ((i + 1) / phosphorBuffer.length) * 0.25;
            drawScopeTrace(phosphorBuffer[i], alpha);
          }
        } else {
          ctx.save();
          ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
          ctx.font = "italic 14px Arial";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("Waiting for Data...", canvas.clientWidth / 2, canvas.clientHeight / 2);
          ctx.restore();
        }
    } else {
        // Waveform mode
        const usableWidth = Math.max(1, Math.floor(canvas.clientWidth - OFFSET_X));
        const barsPerSec = usableWidth / WAVEFORM_SECONDS;
        const stepInterval = 1000 / barsPerSec;
        const now = performance.now();
        if (!waveformLastPush) waveformLastPush = now;

        while ((now - waveformLastPush) >= stepInterval) {
            waveformBars.push({ ...latestWaveformBar });
            waveformLastPush += stepInterval;
            if (waveformBars.length > usableWidth) waveformBars.shift();
        }

        if (waveformBars.length > 0) {
            drawWaveform(waveformBars);
        } else {
            ctx.save();
            ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
            ctx.font = "italic 14px Arial";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("Waiting for Data...", canvas.clientWidth / 2, canvas.clientHeight / 2);
            ctx.restore();
        }
    }

    // Draw Zoom Info for BOTH modes
    if (zoomLevel !== 1.0 || zoomLevelY > 1.0) {
      let infoText = "";
      if (zoomLevel !== 1.0 && zoomLevelY > 1.0) infoText = `X:${zoomLevel.toFixed(1)}x Y:${zoomLevelY.toFixed(1)}x`;
      else if (zoomLevel !== 1.0) infoText = `${zoomLevel.toFixed(1)}x`;
      else infoText = `Y:${zoomLevelY.toFixed(1)}x`;

      const x = (canvas.clientWidth / 2) + 40; // Center in remaining space
      
      ctx.fillStyle = "rgba(143, 234, 255, 0.8)";
      ctx.font = "12px Arial"; // Match font size
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic"; // Align baseline
      ctx.fillText(infoText, x, canvas.clientHeight - 10);
    } else {
      drawMagnifierIcon();
    }

    ctx.font = "12px Arial";
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(sampleRate + " Hz", canvas.clientWidth - 8, canvas.clientHeight - 10);
  }

  //////////////////////////////////////////////////////////////////
  // Data handler (Scope)
  //////////////////////////////////////////////////////////////////

  function pushWaveformBar(sourceData) {
      if (!sourceData || sourceData.length === 0) return;
      let min = 1, max = -1;
      for (let i = 0; i < sourceData.length; i++) {
          const v = sourceData[i];
          if (v < min) min = v;
          if (v > max) max = v;
      }
      latestWaveformBar = { min, max };
  }

  function handleMpxScope(msg) {
    if (!canvas || !canvas.isConnected) return;
    if (!msg || typeof msg !== "object") return;

    const sourceData = Array.isArray(msg.o) ? msg.o :
      (Array.isArray(msg.scope) ? msg.scope :
      (Array.isArray(msg.w) ? msg.w : []));

    if (sourceData.length > 0) {
      scopeWave = [];
      for (let i = 0; i < sourceData.length; i++) {
        const v = sourceData[i];
        scopeWave.push(v);
        if (v > globalScopeMax) globalScopeMax = v;
        if (v < globalScopeMin) globalScopeMin = v;
      }
      
      pushWaveformBar(sourceData);
      
      // Update global MPX power calculation (shared across all instances)
      updateMpxPower(sourceData);
    }
  }

  //////////////////////////////////////////////////////////////////
  // Continuous Rendering Loop (Decoupled from WebSocket)
  //////////////////////////////////////////////////////////////////
  let animationId = null;

  function renderLoop() {
    if (!canvas || !canvas.isConnected) return;

    // Decay peaks continuously per frame (at ~60 FPS)
    globalScopeMax *= SCOPE_PEAK_DECAY;
    globalScopeMin *= SCOPE_PEAK_DECAY;

    // Update phosphor buffer with latest wave data
    if (displayMode === "scope" && scopeWave.length > 0) {
      phosphorBuffer.push([...scopeWave]);
      if (phosphorBuffer.length > MAX_PHOSPHOR) phosphorBuffer.shift();
    }

    drawScope();
    animationId = requestAnimationFrame(renderLoop);
  }

  //////////////////////////////////////////////////////////////////
  // Resize
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
  }

  //////////////////////////////////////////////////////////////////
  // Mouse events
  //////////////////////////////////////////////////////////////////
  function setupMouseEvents() {
    canvas.addEventListener("mouseenter", () => {
      KeyboardHub.setActive(instance);
      updateCursor();
    });

    canvas.addEventListener("mousemove", (e) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;

      const wasHovering = isHoveringMagnifier;
      if (zoomLevel === 1.0 && zoomLevelY <= MIN_ZOOM_Y) {
        isHoveringMagnifier =
          mouseX >= magnifierArea.x &&
          mouseX <= magnifierArea.x + magnifierArea.width;
      } else {
        isHoveringMagnifier = false;
      }

      if (isHoveringMagnifier && !wasHovering) showTooltip();
      else if (!isHoveringMagnifier && wasHovering) hideTooltip();
      updateCursor();

      if (!isDragging) { hoverX = mouseX; }
      if (!isDragging) return;

      if (Math.abs(e.clientX - dragStartX) > 5 || Math.abs(e.clientY - dragStartY) > 5) hasDragged = true;
      if (!hasDragged) return;
      e.preventDefault(); e.stopPropagation();

      const visibleRange = visibleEnd - visibleStart;
      const pixelsPerUnit = (canvas.clientWidth - OFFSET_X) / visibleRange;
      const delta = -(e.clientX - dragStartX) / pixelsPerUnit;
      viewCenter = dragStartCenter + delta;
      updateZoomBounds();
      updateZoomBoundsY();
    });

    canvas.addEventListener("mouseleave", () => {
      hoverX = null;
      if (isHoveringMagnifier) { isHoveringMagnifier = false; hideTooltip(); }
      if (isDragging) { isDragging = false; hasDragged = false; updateCursor(); }
    });

    canvas.addEventListener("wheel", (e) => {
      e.preventDefault(); e.stopPropagation();
      if (isHoveringMagnifier || ctrlKeyPressed) { isHoveringMagnifier = false; hideTooltip(); }

      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const zoomDelta = e.deltaY > 0 ? 1 / (e.ctrlKey ? ZOOM_STEP_Y : ZOOM_STEP) : (e.ctrlKey ? ZOOM_STEP_Y : ZOOM_STEP);

      if (e.ctrlKey) {
        setZoomY(zoomLevelY * zoomDelta);
      } else {
        const usableWidth = (canvas.clientWidth - OFFSET_X);
        const totalVisualWidth = usableWidth * zoomLevel;
        const leftPadding = (usableWidth - totalVisualWidth) / 2;

        let unitAtMouse = SCOPE_SAMPLES / 2;
        if (mouseX >= OFFSET_X + leftPadding && mouseX <= OFFSET_X + leftPadding + totalVisualWidth) {
          const relX = mouseX - (OFFSET_X + leftPadding);
          unitAtMouse = (relX / totalVisualWidth) * SCOPE_SAMPLES;
        }
        setZoom(zoomLevel * zoomDelta, unitAtMouse);
      }
    }, { passive: false });

    canvas.addEventListener("mousedown", (e) => {
      if (e.button !== 0 || isHoveringMagnifier) return;
      e.preventDefault(); e.stopPropagation();
      isDragging = true; hasDragged = false;
      dragStartX = e.clientX; dragStartY = e.clientY; dragStartCenter = viewCenter;
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
      e.preventDefault(); e.stopPropagation();
      zoomReset();
    });

    canvas.addEventListener("click", (e) => {
      if (isHoveringMagnifier || hasDragged) { e.stopPropagation(); hasDragged = false; }
    });
  }

  //////////////////////////////////////////////////////////////////
  // Keyboard event handlers
  //////////////////////////////////////////////////////////////////
  function onGlobalKeyDown(e) {
    if (e.target?.tagName === "INPUT" || e.target?.tagName === "TEXTAREA" || e.target?.isContentEditable) return;

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
        if (zoomLevel > MIN_ZOOM) {
          const range = visibleEnd - visibleStart;
          const panStep = range * 0.05;
          setZoom(zoomLevel, viewCenter - panStep);
        }
        handled = true;
        break;
      case "ArrowRight":
        if (zoomLevel > MIN_ZOOM) {
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
  // Lifecycle
  //////////////////////////////////////////////////////////////////
  const unsubscribe = MpxHub.subscribe(handleMpxScope);

  function destroy() {
    try { unsubscribe?.(); } catch (e) {}
    try { document.removeEventListener("visibilitychange", handleVisibilityChange); } catch (e) {}
    if (animationId) cancelAnimationFrame(animationId);
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

  // Start the continuous animation loop
  renderLoop();

  return instance;
}

/////////////////////////////////////////////////////////////////
// Public API
/////////////////////////////////////////////////////////////////
function init(containerId = "level-meter-container", options = {}) {
  const existing = [...__instances.values()].find(i => i.containerId === containerId);
  if (existing) { try { existing.destroy(); } catch (e) {} }
  return createScopeInstance(containerId, options);
}

function zoomReset(target) {
  if (!target) { __instances.forEach(i => i.zoomReset?.()); return; }
  const byKey = __instances.get(String(target));
  if (byKey) return byKey.zoomReset?.();
  const byContainer = [...__instances.values()].find(i => i.containerId === target);
  if (byContainer) return byContainer.zoomReset?.();
}

function resize(target) {
  if (!target) { __instances.forEach(i => i.resize?.()); return; }
  const byKey = __instances.get(String(target));
  if (byKey) return byKey.resize?.();
  const byContainer = [...__instances.values()].find(i => i.containerId === target);
  if (byContainer) return byContainer.resize?.();
}

function destroy(target) {
  if (!target) { [...__instances.values()].forEach(i => i.destroy?.()); return; }
  const byKey = __instances.get(String(target));
  if (byKey) return byKey.destroy?.();
  const byContainer = [...__instances.values()].find(i => i.containerId === target);
  if (byContainer) return byContainer.destroy?.();
}

// Global exports
window.MetricsScope = window.MetricsScope || { cleanup: closeMpxSocket };
window.MetricsScope.init = init;
window.MetricsScope.zoomReset = zoomReset;
window.MetricsScope.resize = resize;
window.MetricsScope.destroy = destroy;

})();