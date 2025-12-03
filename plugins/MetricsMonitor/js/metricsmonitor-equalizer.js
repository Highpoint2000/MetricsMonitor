///////////////////////////////////////////////////////////////
///  METRICS MONITOR – Equalizer + Signal-Meter Module      ///
///////////////////////////////////////////////////////////////

(() => {
const sampleRate = 48000;    // Do not touch - this value is automatically updated via the config file
const stereoBoost = 1;    // Do not touch - this value is automatically updated via the config file
const eqBoost = 1;    // Do not touch - this value is automatically updated via the config file
const fftSize = 512;    // Do not touch - this value is automatically updated via the config file
const SpectrumAverageLevel = 30;    // Do not touch - this value is automatically updated via the config file
const minSendIntervalMs = 15;    // Do not touch - this value is automatically updated via the config file
const MPXmode = "off";    // Do not touch - this value is automatically updated via the config file

///////////////////////////////////////////////////////////////

// internal: "dbf", "dbuv", "dbm"
let hfUnit = "dbf";
// Flag to ensure we only attach the unit-change listener once
let hfUnitListenerAttached = false;

// Levels (can be read/set from outside)
//  - hf:      0..100 % for the bar
//  - hfValue: physical value in current unit (dBµV / dBm / dBf)
//  - hfBase:  base value (dBf, aligned with Scanner)
const levels = {
  hf: 0,
  hfValue: 0,
  hfBase: 0,
  left: 0,
  right: 0
};

const EQ_BAND_COUNT = 5;

// Internal state for EQ display (5 bands)
const eqLevels = new Array(EQ_BAND_COUNT).fill(0);

// Peak-hold configuration & state
const PEAK_CONFIG = {
  smoothing: 0.85,
  holdMs: 5000
};

const peaks = {
  left:  { value: 0, lastUpdate: Date.now() },
  right: { value: 0, lastUpdate: Date.now() },
  eq1:   { value: 0, lastUpdate: Date.now() },
  eq2:   { value: 0, lastUpdate: Date.now() },
  eq3:   { value: 0, lastUpdate: Date.now() },
  eq4:   { value: 0, lastUpdate: Date.now() },
  eq5:   { value: 0, lastUpdate: Date.now() }
};

// AudioContext / analysers / buffers
let eqAudioContext = null;
let eqAnalyser = null;
let eqDataArray = null;
let eqAnimationId = null;
let eqSourceNode = null;

// Stereo analyser
let stereoSplitter = null;
let stereoAnalyserL = null;
let stereoAnalyserR = null;
let stereoDataL = null;
let stereoDataR = null;

// Interval for regular re-setup
let eqSetupIntervalId = null;

// -------------------------------------------------------
// HF unit conversion & scale
//
// Base unit = dBf
//   dBµV = dBf - 10.875
//   dBm  = dBf - 119.75
//   dBf  = dBf
// -------------------------------------------------------

// Base HF (dBf) -> display in current unit (dBµV / dBm / dBf)
function hfBaseToDisplay(baseHF) {
  const ssu = (hfUnit || "").toLowerCase();
  const v = Number(baseHF);
  if (!isFinite(v)) return 0;

  if (ssu === "dbuv" || ssu === "dbµv" || ssu === "dbμv") {
    // dBµV
    return v - 10.875;
  } else if (ssu === "dbm") {
    // dBm
    return v - 119.75;
  } else if (ssu === "dbf") {
    // dBf
    return v;
  }
  return v;
}

// Base HF (dBf) -> 0..100 % for HF bar, internally always mapped to 0..90 dBµV
function hfPercentFromBase(baseHF) {
  const v = Number(baseHF);
  if (!isFinite(v)) return 0;

  // internal reference always dBµV: dBµV = dBf - 10.875
  let dBuV = v - 10.875;
  if (isNaN(dBuV)) dBuV = 0;

  const clamped = Math.max(0, Math.min(90, dBuV));
  return (clamped / 90) * 100;
}

// Build HF scale depending on current unit
function buildHFScale(unit) {
  const baseScale_dBuV = [90, 80, 70, 60, 50, 40, 30, 20, 10, 0];
  const ssu = (unit || hfUnit || "").toLowerCase();

  // Helper: round to nearest 10
  function round10(v) {
    return Math.round(v / 10) * 10;
  }

  // dBm = dBµV - 108.875
  if (ssu === "dbm") {
    return baseScale_dBuV.map((v, idx) => {
      const dBm = v - 108.875;
      const rounded = round10(dBm);
      return idx === 0 ? `${rounded} dBm` : `${rounded}`;
    });
  }

  // dBf = dBµV + 10.875
  if (ssu === "dbf") {
    return baseScale_dBuV.map((v, idx) => {
      const dBf = v + 10.875;
      const rounded = round10(dBf);
      return idx === 0 ? `${rounded} dBf` : `${rounded}`;
    });
  }

  // Default: dBµV
  return baseScale_dBuV.map((v, idx) => {
    const rounded = round10(v);
    return idx === 0 ? `${rounded} dBµV` : `${rounded}`;
  });
}


// -------------------------------------------------------
// Helpers: peaks & colors
// -------------------------------------------------------
function updatePeakValue(channel, current /* 0..100 */) {
  const p = peaks[channel];
  if (!p) return;

  const now = Date.now();

  if (current > p.value) {
    p.value = current;
    p.lastUpdate = now;
  } else if (now - p.lastUpdate > PEAK_CONFIG.holdMs) {
    p.value = p.value * PEAK_CONFIG.smoothing;
    if (p.value < 0.5) p.value = 0;
  }
}

function stereoColorForPercent(p /* 0..100 */, totalSegments = 30) {
  const i = Math.max(
    0,
    Math.min(totalSegments - 1, Math.round((p / 100) * totalSegments) - 1)
  );
  const topBandStart = totalSegments - 5;

  if (i >= topBandStart) {
    const red = Math.round((i / 10) * 125);
    return `rgb(${red},0,0)`;
  } else {
    const green = 100 + Math.round((i / totalSegments) * 155);
    return `rgb(0,${green},0)`;
  }
}

function setPeakSegment(meterEl, peak /* 0..100 */, meterId) {
  const segments = meterEl.querySelectorAll(".segment");
  if (!segments.length) return;

  const prev = meterEl.querySelector(".segment.peak-flag");
  if (prev) prev.classList.remove("peak-flag");

  const idx = Math.max(
    0,
    Math.min(segments.length - 1, Math.round((peak / 100) * segments.length) - 1)
  );
  const seg = segments[idx];
  if (!seg) return;

  seg.classList.add("peak-flag");

  // Stereo color
  if (meterId && (meterId.includes("left") || meterId.includes("right"))) {
    seg.style.backgroundColor = stereoColorForPercent(peak, segments.length);

  // EQ color
  } else if (meterId && meterId.startsWith("eq")) {
    if (idx >= segments.length - 5) {
      const red = Math.round((idx / 10) * 125);
      seg.style.setProperty("background-color", `rgb(${red},0,0)`, "important");
    } else {
      const green = 100 + Math.round((idx / segments.length) * 155);
      seg.style.setProperty("background-color", `rgb(0,${green},0)`, "important");
    }
  }
}

// -------------------------------------------------------
// Meter creation & update
// -------------------------------------------------------
function createLevelMeter(id, label, container, scaleValues) {
  const levelMeter = document.createElement("div");
  levelMeter.classList.add("level-meter");

  const top = document.createElement("div");
  top.classList.add("meter-top");

  const meterBar = document.createElement("div");
  meterBar.classList.add("meter-bar");
  meterBar.setAttribute("id", id);

  for (let i = 0; i < 30; i++) {
    const segment = document.createElement("div");
    segment.classList.add("segment");
    meterBar.appendChild(segment);
  }

  // Peak marker for LEFT/RIGHT (EQ uses only peak-flag)
  if (id.includes("left") || id.includes("right")) {
    const marker = document.createElement("div");
    marker.className = "peak-marker";
    meterBar.appendChild(marker);
  }

  const labelElement = document.createElement("div");
  labelElement.classList.add("label");
  labelElement.innerText = label;

  const meterWrapper = document.createElement("div");
  meterWrapper.classList.add("meter-wrapper");

  if (id.includes("left")) labelElement.classList.add("label-left");
  if (id.includes("right")) labelElement.classList.add("label-right");

  meterWrapper.appendChild(meterBar);
  meterWrapper.appendChild(labelElement);

  if (scaleValues && scaleValues.length > 0) {
    const scale = document.createElement("div");
    scale.classList.add("meter-scale");
    scaleValues.forEach((v) => {
      const tick = document.createElement("div");
      tick.innerText = v;
      scale.appendChild(tick);
    });
    top.appendChild(scale);
  }

  top.appendChild(meterWrapper);
  levelMeter.appendChild(top);
  container.appendChild(levelMeter);
}

function updateMeter(meterId, level) {
  const meter = document.getElementById(meterId);
  if (!meter) return;

  const safeLevel = Math.max(0, Math.min(100, Number(level) || 0));
  const segments = meter.querySelectorAll(".segment");
  const activeCount = Math.round((safeLevel / 100) * segments.length);

  segments.forEach((seg, i) => {
    if (i < activeCount) {
      if (
        meterId.includes("left") ||
        meterId.includes("right") ||
        meterId.startsWith("eq")
      ) {
        // Stereo & EQ: green → red
        if (i >= segments.length - 5) {
          const red = Math.round((i / 10) * 125);
          seg.style.backgroundColor = `rgb(${red},0,0)`;
        } else {
          const green = 100 + Math.round((i / segments.length) * 155);
          seg.style.backgroundColor = `rgb(0,${green},0)`;
        }
      } else if (meterId.includes("hf")) {
        // HF: red in lower range, then green
        // (internally still based on dBµV threshold at 20/90)
        const hfThresholdIndex = Math.round((20 / 90) * segments.length);
        if (i < hfThresholdIndex) {
          const pos = i / hfThresholdIndex;
          const red = 150 + Math.round(pos * 185);
          seg.style.backgroundColor = `rgb(${red},0,0)`;
        } else {
          const green = 100 + Math.round((i / segments.length) * 155);
          seg.style.backgroundColor = `rgb(0,${green},0)`;
        }
      } else {
        // Default gradient
        if (i < segments.length * 0.6) {
          seg.style.backgroundColor = "#4caf50";
        } else if (i < segments.length * 0.8) {
          seg.style.backgroundColor = "#ff9800";
        } else {
          seg.style.backgroundColor = "#f44336";
        }
      }
    } else {
      seg.style.backgroundColor = "#333";
    }
  });

  const isStereo = meterId.includes("left") || meterId.includes("right");
  const isEq = meterId.startsWith("eq");

  if (isStereo || isEq) {
    let key;
    if (isStereo) {
      key = meterId.includes("left") ? "left" : "right";
    } else {
      const match = meterId.match(/^eq(\d+)-/);
      if (match) key = `eq${match[1]}`;
    }
    if (key && peaks[key]) {
      updatePeakValue(key, safeLevel);
      setPeakSegment(meter, peaks[key].value, meterId);
    }
  }
}

// -------------------------------------------------------
// EQ calculation (10-band → 5-band)
// -------------------------------------------------------
function mmCompute10BandLevels(freqData) {
  const bands = new Array(10).fill(0);
  const ranges = [
    [0, 2],   // Sub-bass
    [3, 5],   // Bass
    [6, 8],   // Low-mid
    [9, 12],  // Mid
    [13, 18], // High-mid
    [19, 25], // Presence
    [26, 32], // Brilliance 1
    [33, 40], // Brilliance 2
    [41, 48], // Air 1
    [49, 63]  // Air 2
  ];

  ranges.forEach((range, idx) => {
    let sum = 0;
    let count = 0;
    for (let i = range[0]; i <= range[1] && i < freqData.length; i++) {
      sum += freqData[i];
      count++;
    }
    bands[idx] = count > 0 ? sum / count : 0;
  });

  return bands;
}

function mmCollapse10To5(bands10) {
  if (!bands10 || bands10.length < 10) return null;

  const bands5 = [];
  bands5[0] = (bands10[0] + bands10[1]) / 2; // ~64 Hz
  bands5[1] = (bands10[2] + bands10[3]) / 2; // ~256 Hz
  bands5[2] = (bands10[4] + bands10[5]) / 2; // ~1 kHz
  bands5[3] = (bands10[6] + bands10[7]) / 2; // ~4 kHz
  bands5[4] = (bands10[8] + bands10[9]) / 2; // ~10 kHz
  return bands5;
}

// -------------------------------------------------------
// Equalizer hint overlay
// -------------------------------------------------------
function hideEqHint() {
  const hint = document.getElementById("eqHintText");
  if (!hint) return;
  hint.style.opacity = "0";
  setTimeout(() => {
    if (hint) hint.style.display = "none";
  }, 300);
}

// -------------------------------------------------------
// Audio EQ setup (Stream.Fallback.Player.Amplification)
// -------------------------------------------------------
function setupAudioEQ() {
  // Wait until Stream object is available
  if (
    typeof Stream === "undefined" ||
    !Stream.Fallback ||
    !Stream.Fallback.Player ||
    !Stream.Fallback.Player.Amplification
  ) {
    // retry later
    setTimeout(setupAudioEQ, 2000);
    return;
  }

  const player = Stream.Fallback.Player;
  const sourceNode = player.Amplification;

  if (!sourceNode || !sourceNode.context) {
    console.warn("MetricsEqualizer: No valid AudioNode for Amplification found – retry…");
    setTimeout(setupAudioEQ, 2000);
    return;
  }

  try {
    const ctx = sourceNode.context;

    // If AudioContext changed → reset graph
    if (eqAudioContext !== ctx) {
      eqAudioContext   = ctx;
      eqAnalyser       = null;
      eqDataArray      = null;
      stereoSplitter   = null;
      stereoAnalyserL  = null;
      stereoAnalyserR  = null;
      stereoDataL      = null;
      stereoDataR      = null;
      eqSourceNode     = null;
    }

    // Create main EQ analyser if needed
    if (!eqAnalyser || !eqDataArray) {
      eqAnalyser = eqAudioContext.createAnalyser();
      eqAnalyser.fftSize = 4096;
      eqAnalyser.smoothingTimeConstant = 0.6;
      eqDataArray = new Uint8Array(eqAnalyser.frequencyBinCount);
    }

    // Store source node
    eqSourceNode = sourceNode;

    // Connect main analyser
    eqSourceNode.connect(eqAnalyser);

    // Create stereo split
    if (!stereoSplitter) {
      stereoSplitter  = eqAudioContext.createChannelSplitter(2);
      stereoAnalyserL = eqAudioContext.createAnalyser();
      stereoAnalyserR = eqAudioContext.createAnalyser();

      stereoAnalyserL.fftSize = 2048;
      stereoAnalyserR.fftSize = 2048;

      stereoDataL = new Uint8Array(stereoAnalyserL.frequencyBinCount);
      stereoDataR = new Uint8Array(stereoAnalyserR.frequencyBinCount);

      eqSourceNode.connect(stereoSplitter);
      stereoSplitter.connect(stereoAnalyserL, 0);
      stereoSplitter.connect(stereoAnalyserR, 1);
    }

    // Start animation loop only once
    if (!eqAnimationId) {
      startEqAnimation();
    }

    hideEqHint();
  } catch (e) {
    console.error("MetricsEqualizer: Error while setting up audio analyser", e);
  }
}

function startEqAnimation() {
  if (eqAnimationId) cancelAnimationFrame(eqAnimationId);

  const loop = () => {
    if (!eqAnalyser || !eqDataArray) {
      eqAnimationId = requestAnimationFrame(loop);
      return;
    }

    // ---- Equalizer (frequency domain) ----
    eqAnalyser.getByteFrequencyData(eqDataArray);
    const levels10 = mmCompute10BandLevels(eqDataArray);
    const bands5 = mmCollapse10To5(levels10);

    for (let i = 0; i < EQ_BAND_COUNT; i++) {
      let targetPercent = 0;
      if (bands5 && bands5[i] != null) {
        // Base level from FFT → 0..100 %
        targetPercent = (bands5[i] / 255) * 100;
        // Manual gain control for equalizer
        targetPercent *= eqBoost;
      }

      // clamp, so nothing goes above 100 %
      if (targetPercent > 100) targetPercent = 100;
      if (targetPercent < 0) targetPercent = 0;

      // smooth towards target (no HF gating anymore)
      eqLevels[i] += (targetPercent - eqLevels[i]) * 0.4;

      if (eqLevels[i] < 0.5) eqLevels[i] = 0;
      updateMeter(`eq${i + 1}-meter`, eqLevels[i]);
    }

    // ---- Stereo LEFT / RIGHT (time domain) ----
    if (stereoAnalyserL && stereoAnalyserR && stereoDataL && stereoDataR) {
      stereoAnalyserL.getByteTimeDomainData(stereoDataL);
      stereoAnalyserR.getByteTimeDomainData(stereoDataR);

      let maxL = 0;
      let maxR = 0;

      for (let i = 0; i < stereoDataL.length; i++) {
        const d = Math.abs(stereoDataL[i] - 128);
        if (d > maxL) maxL = d;
      }
      for (let i = 0; i < stereoDataR.length; i++) {
        const d = Math.abs(stereoDataR[i] - 128);
        if (d > maxR) maxR = d;
      }

      let levelL = ((maxL / 128) * 100) * stereoBoost;
      let levelR = ((maxR / 128) * 100) * stereoBoost;

      levelL = Math.min(100, Math.max(0, levelL));
      levelR = Math.min(100, Math.max(0, levelR));

      // No HF gating here anymore – pure audio
      levels.left = levelL;
      levels.right = levelR;

      updateMeter("left-meter", levelL);
      updateMeter("right-meter", levelR);
    }

    eqAnimationId = requestAnimationFrame(loop);
  };

  eqAnimationId = requestAnimationFrame(loop);
}

// -------------------------------------------------------
// Public init
// -------------------------------------------------------
function initEqualizer(containerOrId = "level-meter-container") {
  const container =
    typeof containerOrId === "string"
      ? document.getElementById(containerOrId)
      : containerOrId;

  if (!container) {
    console.error(
      "MetricsEqualizer: Level-meter container not found:",
      containerOrId
    );
    return;
  }

  // Get HF unit from global MetricsMonitor (if available)
  if (window.MetricsMonitor && typeof window.MetricsMonitor.getSignalUnit === "function") {
    const u = window.MetricsMonitor.getSignalUnit();
    if (u) {
      hfUnit = u.toLowerCase();
    }
  }

  console.log("[MetricsEqualizer] HF unit (init):", hfUnit);

  // clear existing content
  container.innerHTML = "";

  // Stereo group
  const stereoGroup = document.createElement("div");
  stereoGroup.classList.add("stereo-group");

  const stereoScale = [
    "+5,0 dB",
    "0,0",
    "-5,0",
    "-10,0",
    "-15,0",
    "-20,0",
    "-25,0",
    "-30,0",
    "-35,0 dB"
  ];

  createLevelMeter("left-meter", "LEFT", stereoGroup, stereoScale);
  createLevelMeter("right-meter", "RIGHT", stereoGroup, []);

  container.appendChild(stereoGroup);

  // HF meter – scale now dynamic depending on hfUnit
  const hfScale = buildHFScale(hfUnit);
  createLevelMeter("hf-meter", "RF", container, hfScale);

  // Slightly shift HF meter to the left (like original)
  const hfLevelMeter = container.querySelector("#hf-meter")?.closest(".level-meter");
  if (hfLevelMeter) {
    hfLevelMeter.style.transform = "translateX(-5px)";
  }

  // EQ group
  const eqGroup = document.createElement("div");
  eqGroup.classList.add("eq-group");

  const eqTitle = document.createElement("div");
  eqTitle.id = "eqTitle";
  eqTitle.innerText = "5-BAND EQUALIZER";
  eqGroup.appendChild(eqTitle);

  const eqHintWrapper = document.createElement("div");
  eqHintWrapper.id = "eqHintWrapper";
  const eqHintText = document.createElement("div");
  eqHintText.id = "eqHintText";
  eqHintText.innerText = "Click play to show";
  eqHintWrapper.appendChild(eqHintText);
  eqGroup.appendChild(eqHintWrapper);

  const eqBars = document.createElement("div");
  eqBars.classList.add("eq-bars");

  const eqFrequencyLabels = ["64", "256", "1k", "4k", "10k"];
  for (let i = 0; i < EQ_BAND_COUNT; i++) {
    const label = eqFrequencyLabels[i] || "";
    createLevelMeter(`eq${i + 1}-meter`, label, eqBars, []);
  }

  eqGroup.appendChild(eqBars);
  container.appendChild(eqGroup);

  // initial values
  updateMeter("left-meter", levels.left);
  updateMeter("right-meter", levels.right);
  updateMeter("hf-meter", levels.hf || 0);
  for (let i = 1; i <= EQ_BAND_COUNT; i++) {
    updateMeter(`eq${i}-meter`, 0);
  }

  // Start audio EQ + periodic re-setup
  setupAudioEQ();
  if (!eqSetupIntervalId) {
    eqSetupIntervalId = setInterval(setupAudioEQ, 3000);
  }

  // Attach global unit-change listener only once
  if (!hfUnitListenerAttached && window.MetricsMonitor && typeof window.MetricsMonitor.onSignalUnitChange === "function") {
    hfUnitListenerAttached = true;
    window.MetricsMonitor.onSignalUnitChange((unit) => {
      if (window.MetricsEqualizer && typeof window.MetricsEqualizer.setHFUnit === "function") {
        window.MetricsEqualizer.setHFUnit(unit);
      }
    });
  }
}

// -------------------------------------------------------
// Public API
// -------------------------------------------------------
window.MetricsEqualizer = {
  init: initEqualizer,

  // HF is passed in BASE unit (dBf), same as Scanner:
  // -> display unit computed via hfUnit
  // -> bar level internally mapped from 0..90 dBµV to 0..100 %
  setHF(baseValue) {
    const v = Number(baseValue);
    if (!isFinite(v)) return;

    levels.hfBase = v;
    const displayHF = hfBaseToDisplay(v);
    levels.hfValue = displayHF;

    const percent = hfPercentFromBase(v);
    levels.hf = percent;
    updateMeter("hf-meter", percent);
  },

  // Change HF unit at runtime (e.g. when dropdown in loader changes)
  setHFUnit(unit) {
    console.log("[Equalizer] setHFUnit() :: new unit =", unit);

    if (!unit) {
      console.warn("[Equalizer] setHFUnit(): unit is empty");
      return;
    }

    hfUnit = unit.toLowerCase();

    const meterEl = document.getElementById("hf-meter");
    if (!meterEl) {
      console.warn("[Equalizer] setHFUnit(): HF meter not in DOM!");
      return;
    }

    const levelMeter = meterEl.closest(".level-meter");
    if (!levelMeter) {
      console.warn("[Equalizer] setHFUnit(): .level-meter wrapper missing!");
      return;
    }

    const scaleEl = levelMeter.querySelector(".meter-scale");
    if (!scaleEl) {
      console.warn("[Equalizer] setHFUnit(): scale container not found!");
      return;
    }

    const newScale = buildHFScale(hfUnit);
    console.log("[Equalizer] New HF scale =", newScale);

    const ticks = scaleEl.querySelectorAll("div");
    newScale.forEach((txt, idx) => {
      if (ticks[idx]) {
        ticks[idx].innerText = txt;
      }
    });

    if (typeof levels.hfBase === "number") {
      const displayHF = hfBaseToDisplay(levels.hfBase);
      levels.hfValue = displayHF;
      console.log("[Equalizer] Recalculated HF value =", displayHF);
    }
  },

  levels,
  updateMeter
};

})();
