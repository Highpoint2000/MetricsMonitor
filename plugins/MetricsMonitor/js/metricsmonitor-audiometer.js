///////////////////////////////////////////////////////////////
//                                                           //
//  metricsmonitor-audiometer.js                    (V2.8b)  //
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

    // ==========================================================
    // CSS FIXES FOR ZOOMING
    // ==========================================================
    const style = document.createElement('style');
    style.innerHTML = `
      /* Fix for sub-pixel rendering gaps on zoom */
      .meter-bar .segment {
        border-bottom: 1px solid rgba(0,0,0,0.8) !important; 
        margin-bottom: 0 !important; 
        box-sizing: border-box;      
      }
      /* Ensure Peak Flags overlay correctly */
      .segment.peak-flag {
        z-index: 10;
        box-shadow: 0 0 4px rgba(255, 255, 255, 0.4);
      }
    `;
    document.head.appendChild(style);

// Internal Unit State
let hfUnit = "dbf";
let hfUnitListenerAttached = false;

// Levels (Publicly accessible)
const levels = {
  hf: 0,
  hfValue: 0,
  hfBase: 0,
  left: 0,
  right: 0
};

const EQ_BAND_COUNT = 5;

// EQ Display State
const eqLevels = new Array(EQ_BAND_COUNT).fill(0);

// Smoothing state for stereo meters (to prevent instant drops)
let smoothedLevelL = 0;
let smoothedLevelR = 0;

// Peak Hold Configuration
const PEAK_CONFIG = {
  smoothing: 0.85,
  holdMs: 3000
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

// Audio Context Variables
let eqAudioContext = null;
let eqAnalyser = null;
let eqDataArray = null;
let eqAnimationId = null;
let eqSourceNode = null;

// Stereo Analyser Variables
let stereoSplitter = null;
let stereoAnalyserL = null;
let stereoAnalyserR = null;
let stereoDataL = null;
let stereoDataR = null;

// Setup Interval
let eqSetupIntervalId = null;

// -------------------------------------------------------
// Helper: Parse RGB String to Object & Apply Intensity
// -------------------------------------------------------
function parseRgb(rgbStr) {
  const match = rgbStr.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (match) {
    return { r: parseInt(match[1]), g: parseInt(match[2]), b: parseInt(match[3]) };
  }
  return { r: 0, g: 255, b: 0 }; // Default fallback
}

function getScaledColor(colorObj, intensity) {
  // Clamp intensity to 255
  const r = Math.min(255, Math.round(colorObj.r * intensity));
  const g = Math.min(255, Math.round(colorObj.g * intensity));
  const b = Math.min(255, Math.round(colorObj.b * intensity));
  return `rgb(${r},${g},${b})`;
}

// -------------------------------------------------------
// HF Unit Conversion Helpers
// -------------------------------------------------------

// Convert Base HF (dBf) to Display Value
function hfBaseToDisplay(baseHF) {
  const ssu = (hfUnit || "").toLowerCase();
  const v = Number(baseHF);
  if (!isFinite(v)) return 0;

  if (ssu === "dbuv" || ssu === "dbµv" || ssu === "dbμv") {
    return v - 10.875;
  } else if (ssu === "dbm") {
    return v - 119.75;
  } else if (ssu === "dbf") {
    return v;
  }
  return v;
}

// Convert Base HF (dBf) to Percentage (for meter bar)
function hfPercentFromBase(baseHF) {
  const v = Number(baseHF);
  if (!isFinite(v)) return 0;

  let dBuV = v - 10.875;
  if (isNaN(dBuV)) dBuV = 0;

  const clamped = Math.max(0, Math.min(90, dBuV));
  return (clamped / 90) * 100;
}

// Build Scale labels based on unit
function buildHFScale(unit) {
  const baseScale_dBuV = [90, 80, 70, 60, 50, 40, 30, 20, 10, 0];
  const ssu = (unit || hfUnit || "").toLowerCase();

  function round10(v) {
    return Math.round(v / 10) * 10;
  }

  const lastIndex = baseScale_dBuV.length - 1;

  if (ssu === "dbm") {
    return baseScale_dBuV.map((v, idx) => {
      const dBm = v - 108.875;
      const rounded = round10(dBm);
      return idx === lastIndex ? `${rounded} dBm` : `${rounded}`;
    });
  }

  if (ssu === "dbf") {
    return baseScale_dBuV.map((v, idx) => {
      const dBf = v + 10.875;
      const rounded = round10(dBf);
      return idx === lastIndex ? `${rounded} dBf` : `${rounded}`;
    });
  }

  // Default: dBµV
  return baseScale_dBuV.map((v, idx) => {
    const rounded = round10(v);
    return idx === lastIndex ? `${rounded} dBµV` : `${rounded}`;
  });
}

// -------------------------------------------------------
// Peak & Color Helpers
// -------------------------------------------------------
function updatePeakValue(channel, current) {
  const p = peaks[channel];
  if (!p) return;

  const now = Date.now();

  if (current > p.value) {
    // New peak
    p.value = current;
    p.lastUpdate = now;
  } else if (now - p.lastUpdate > PEAK_CONFIG.holdMs) {
    // Linear decay instead of multiplicative smoothing
    p.value = Math.max(current, p.value - 2.5);

    // Clamp to zero
    if (p.value < 0.5) p.value = 0;
  }
}

// Calculate color with gradient logic based on CONFIG COLORS
function stereoColorForPercent(p, totalSegments = 30) {
  const i = Math.max(
    0,
    Math.min(totalSegments - 1, Math.round((p / 100) * totalSegments) - 1)
  );
  // Changed from totalSegments - 5 to start red at 0.0 dB
  const topBandStart = totalSegments - 5;
  const cDanger = parseRgb(MeterColorDanger);
  const cSafe = parseRgb(MeterColorSafe);

  if (i >= topBandStart) {
    return MeterColorDanger;
  } else {
    const intensity = 0.4 + ((i / totalSegments) * 0.6); 
    return getScaledColor(cSafe, intensity);
  }
}

function setPeakSegment(meterEl, peak, meterId) {
  const segments = meterEl.querySelectorAll('.segment');
  if (!segments.length) return;

  // Clear ALL previous peak flags + remove inline peak styling
  const prevAll = meterEl.querySelectorAll('.segment.peak-flag');
  prevAll.forEach((prev) => {
    prev.classList.remove('peak-flag');
    prev.style.removeProperty("background-color");
    prev.style.removeProperty("box-shadow");
    prev.style.removeProperty("opacity");
  });

  const idx = Math.max(0, Math.min(segments.length - 1, Math.round((peak / 100) * segments.length) - 1));
  const seg = segments[idx];
  if (!seg) return;

  seg.classList.add('peak-flag');

  let peakColor = "";
  // Added "meterId.startsWith('eq')" to apply the fixed peak color to the 5-band audiometers
  if (PeakMode === "fixed" && (meterId.includes('left') || meterId.includes('right') || meterId.startsWith('eq'))) {
    peakColor = PeakColorFixed;
  } else {
	 if (
		meterId &&
		(meterId.includes('left') || meterId.includes('right') || meterId.startsWith('eq'))
	 ) {
	   // EQ peaks should use the same meter color/gradient as stereo meters
	   peakColor = stereoColorForPercent(peak, segments.length);
	 } else if (meterId.includes('hf')) {
      const hfThresholdIndex = Math.round((20 / 90) * segments.length);
      if (idx < hfThresholdIndex) {
        const cDanger = parseRgb(MeterColorDanger);
        const pos = idx / hfThresholdIndex;
        const intensity = 0.6 + (pos * 0.4);
        peakColor = getScaledColor(cDanger, intensity);
      } else {
        const cSafe = parseRgb(MeterColorSafe);
        const intensity = 0.4 + ((idx / segments.length) * 0.6);
        peakColor = getScaledColor(cSafe, intensity);
      }
    }
  }

  if (peakColor) {
    seg.style.setProperty("background-color", peakColor, "important");
  }
}

// -------------------------------------------------------
// Meter Creation & Updating
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

  // Peak Marker only for Stereo channels
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
    scale.classList.add("meter-scale-AudioMeter");
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

  // Parse Config Colors
  const cDanger = parseRgb(MeterColorDanger);
  const cSafe = parseRgb(MeterColorSafe);
  const cWarning = parseRgb(MeterColorWarning);

  segments.forEach((seg, i) => {
    let finalColor = "#333";

    if (i < activeCount) {
      // --- Stereo & EQ Meters ---
      if (
        meterId.includes("left") ||
        meterId.includes("right") ||
        meterId.startsWith("eq")
      ) {
        // Changed from segments.length - 5 to start red at 0.0 dB
        if (i >= segments.length - 5) {
          finalColor = MeterColorDanger;
        } else {
          const intensity = 0.4 + ((i / segments.length) * 0.6);
          finalColor = getScaledColor(cSafe, intensity);
        }

      // --- HF / RF Meter ---
      } else if (meterId.includes("hf")) {
        const hfThresholdIndex = Math.round((20 / 90) * segments.length);
        
        if (i < hfThresholdIndex) {
            const pos = i / hfThresholdIndex; 
            const intensity = 0.6 + (pos * 0.4);
            finalColor = getScaledColor(cDanger, intensity);
        } else {
            const intensity = 0.4 + ((i / segments.length) * 0.6);
            finalColor = getScaledColor(cSafe, intensity);
        }

      // --- Default Meters (Fallback) ---
      } else {
        if (i < segments.length * 0.6) {
           const intensity = 0.4 + ((i / segments.length) * 0.6);
           finalColor = getScaledColor(cSafe, intensity);
        } else if (i < segments.length * 0.8) {
           finalColor = MeterColorWarning;
        } else {
           finalColor = MeterColorDanger;
        }
      }
    } 

    // Apply color with !important to override any other styles/scripts
    seg.style.setProperty("background-color", finalColor, "important");
  });

  const isStereo = meterId.includes("left") || meterId.includes("right");
  const isEq = meterId.startsWith("eq");

  if (isStereo || isEq) {
    let key;
    if (isStereo) {
      if (meterId.includes("left")) key = "left";
      else if (meterId.includes("right")) key = "right";
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
// EQ Calculation (Accurate isolated 5-Band mapping)
// -------------------------------------------------------
function mmCompute5BandLevels(freqData, ctxSampleRate, analyserFftSize) {
  // Calculate how many Hertz each frequency bin represents
  const binWidth = ctxSampleRate / analyserFftSize;

  function getPeakInBand(minFreq, maxFreq) {
    let startBin = Math.floor(minFreq / binWidth);
    let endBin = Math.ceil(maxFreq / binWidth);
    
    // Clamp to array bounds
    startBin = Math.max(0, startBin);
    endBin = Math.min(freqData.length - 1, endBin);
    
    let maxVal = 0;
    // Look for the peak energy in this isolated frequency band
    for (let i = startBin; i <= endBin; i++) {
      if (freqData[i] > maxVal) {
        maxVal = freqData[i];
      }
    }
    return maxVal;
  }

  // Use separated ~1-octave bands centered closely around the target frequencies.
  return [
    getPeakInBand(45, 100),      // Band 1: Center ~64 Hz
    getPeakInBand(140, 560),     // Band 2: Center ~256 Hz
    getPeakInBand(590, 2050),    // Band 3: Center ~1 kHz
    getPeakInBand(2090, 5600),   // Band 4: Center ~4 kHz
    getPeakInBand(5650, 16000)   // Band 5: Center ~10 kHz
  ];
}

// -------------------------------------------------------
// UI Overlay Helpers
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
// Audio Setup (Web Audio API)
// -------------------------------------------------------
function setupAudioEQ() {
  // Check stream presence more robustly
  if (
    typeof Stream === "undefined" ||
    !Stream ||
    !Stream.Fallback ||
    !Stream.Fallback.Player ||
    !Stream.Fallback.Player.Amplification
  ) {
    // Keep trying - user might not have clicked play yet
    return;
  }
  
  const player = Stream.Fallback.Player;
  const sourceNode = player.Amplification;

  if (!sourceNode || !sourceNode.context) {
    return;
  }

  try {
    const ctx = sourceNode.context;

    // Reset if AudioContext changed OR if we haven't initialized yet
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
      
      // Reset smoothing arrays when context resets
      smoothedLevelL = 0;
      smoothedLevelR = 0;
    }

    // Connect source only if changed or disconnected
    if (eqSourceNode !== sourceNode) {
      eqSourceNode = sourceNode;
    }

    if (!stereoSplitter) {
      stereoSplitter  = eqAudioContext.createChannelSplitter(2);
      stereoAnalyserL = eqAudioContext.createAnalyser();
      stereoAnalyserR = eqAudioContext.createAnalyser();

      // Increased FFT size for smoother and more accurate extraction
      stereoAnalyserL.fftSize = 4096;
      stereoAnalyserR.fftSize = 4096;
      
      // Apply the smoothing and dB bounds to both Left and Right analyzers
      stereoAnalyserL.smoothingTimeConstant = 0.6;
      stereoAnalyserL.minDecibels = -80; 
      stereoAnalyserL.maxDecibels = -15; 
      
      stereoAnalyserR.smoothingTimeConstant = 0.6;
      stereoAnalyserR.minDecibels = -80; 
      stereoAnalyserR.maxDecibels = -15; 

      // Initialize high precision 32-bit float arrays
      stereoDataL = new Float32Array(stereoAnalyserL.fftSize);
      stereoDataR = new Float32Array(stereoAnalyserR.fftSize);
      
      // Initialize EQ data array from one of the analyzers
      eqDataArray = new Uint8Array(stereoAnalyserL.frequencyBinCount);

      try { eqSourceNode.connect(stereoSplitter); } catch(e){
        if (e.name !== 'InvalidAccessError') console.warn('AudioMeter splitter connect error:', e);
      }
      try { stereoSplitter.connect(stereoAnalyserL, 0); } catch(e){}
      try { stereoSplitter.connect(stereoAnalyserR, 1); } catch(e){}
    }

    if (!eqAnimationId) {
      startEqAnimation();
    }

    hideEqHint();
  } catch (e) {
    console.error("MetricsAudioMeter: Error while setting up audio analyser", e);
  }
}


// Logarithmic dB scale parameters for the UI Meter
// Scale goes from +5dB down to -26dB (Total range: 31dB)
const METER_MAX_DB = 5;
const METER_MIN_DB = -26;
const METER_RANGE = METER_MAX_DB - METER_MIN_DB;

// Convert digital peak amplitude to dBFS, then map to 0-100% based on our custom scale
function amplitudeToMeterPercent(amplitude) {
  // Prevent log(0) calculation error
  if (amplitude < 0.00001) return 0;
  
  // Use StereoBoost for this module specifically to maintain 0dB integrity when = 1.0
  const linear = amplitude * StereoBoost;
  
  // Calculate physically accurate decibel value (dBFS)
  const db = 20 * Math.log10(linear);

  // Map to the 0-100% visual scale range (+5 dB to -26 dB)
  if (db <= METER_MIN_DB) return 0;
  if (db >= METER_MAX_DB) return 100;

  return ((db - METER_MIN_DB) / METER_RANGE) * 100;
}

function startEqAnimation() {
  if (eqAnimationId) cancelAnimationFrame(eqAnimationId);
  
  // ==========================================
  // EQ ATTACK & DECAY CONTROLS
  // ==========================================
  const eqAttack = 0.8;   // Fast attack (1.0 = instant)
  const eqDecay  = 0.06;  // Slow decay/release (lower = slower)
  
  const EQ_NOISE_GATE = 30; 
  const bandWeights = [1.03, 1.05, 1.15, 1.3, 1.6];

  const loop = () => {
    // If context is suspended or closed
    if (eqAudioContext && eqAudioContext.state === 'suspended') {
        eqAnimationId = requestAnimationFrame(loop);
        return;
    }

    if (!stereoAnalyserL || !stereoAnalyserR || !eqDataArray) {
      eqAnimationId = requestAnimationFrame(loop);
      return;
    }

    // ---- AudioMeter Calculation (Frequency / EQ) ----
    const currentSampleRate = eqAudioContext.sampleRate || 48000;
    
    // Get Frequency data for LEFT channel
    stereoAnalyserL.getByteFrequencyData(eqDataArray);
    const bandsL = mmCompute5BandLevels(eqDataArray, currentSampleRate, stereoAnalyserL.fftSize);
    
    // Get Frequency data for RIGHT channel
    stereoAnalyserR.getByteFrequencyData(eqDataArray);
    const bandsR = mmCompute5BandLevels(eqDataArray, currentSampleRate, stereoAnalyserR.fftSize);

    // Merge the two channels by taking the highest value for each frequency band
    const bands5 = [];
    for (let i = 0; i < EQ_BAND_COUNT; i++) {
        bands5[i] = Math.max(bandsL[i] || 0, bandsR[i] || 0);
    }

    for (let i = 0; i < EQ_BAND_COUNT; i++) {
      let targetPercent = 0;
      if (bands5 && bands5[i] != null) {
        let rawValue = bands5[i];
        
        if (rawValue <= EQ_NOISE_GATE) {
            rawValue = 0;
        } else {
            rawValue = (rawValue - EQ_NOISE_GATE) / (255 - EQ_NOISE_GATE);
        }
        
        rawValue = rawValue * bandWeights[i];
        if (rawValue > 1.0) rawValue = 1.0;
        
        let normalized = Math.pow(rawValue, 1.2);
        
        // Multiply by 83.87 so that a full signal perfectly aligns with the visual 0 dB line (26 / 31 range mapping)
        targetPercent = normalized * 83.87 * AudioMeterBoost;
      }

      if (targetPercent > 100) targetPercent = 100;
      if (targetPercent < 0) targetPercent = 0;

      // Split logic for Attack (rising) and Decay/Release (falling)
      if (targetPercent > eqLevels[i]) {
        eqLevels[i] += (targetPercent - eqLevels[i]) * eqAttack;
      } else {
        eqLevels[i] += (targetPercent - eqLevels[i]) * eqDecay;
      }

      if (eqLevels[i] < 0.5) eqLevels[i] = 0;
      updateMeter(`eq${i + 1}-meter`, eqLevels[i]);
    }

    // ---- Stereo Calculation (Time Domain / Logarithmic dBFS) ----
    if (stereoAnalyserL && stereoAnalyserR && stereoDataL && stereoDataR) {
      // Use Float32Array to get exact waveform floats (-1.0 to 1.0) for highly accurate dB translation
      stereoAnalyserL.getFloatTimeDomainData(stereoDataL);
      stereoAnalyserR.getFloatTimeDomainData(stereoDataR);

      let maxL = 0;
      let maxR = 0;

      // Extract absolute peak values representing true digital peak amplitude
      for (let i = 0; i < stereoDataL.length; i++) {
        const absL = Math.abs(stereoDataL[i]);
        if (absL > maxL) maxL = absL;
      }
      for (let i = 0; i < stereoDataR.length; i++) {
        const absR = Math.abs(stereoDataR[i]);
        if (absR > maxR) maxR = absR;
      }

      // Convert accurate physical peak level to our UI percentage scale based on Log/dB
      const rawTargetPercentL = amplitudeToMeterPercent(maxL);
      const rawTargetPercentR = amplitudeToMeterPercent(maxR);

      // Apply asymmetric smoothing: fast attack, slow smooth decay
      const attack = 0.8;   // Fast attack (1.0 = instant)
      const decay = 0.6;    // Slow decay/release (lower = slower) 

      smoothedLevelL += (rawTargetPercentL > smoothedLevelL) 
          ? (rawTargetPercentL - smoothedLevelL) * attack 
          : (rawTargetPercentL - smoothedLevelL) * decay;

      smoothedLevelR += (rawTargetPercentR > smoothedLevelR) 
          ? (rawTargetPercentR - smoothedLevelR) * attack 
          : (rawTargetPercentR - smoothedLevelR) * decay;

      let levelL = Math.min(100, Math.max(0, smoothedLevelL));
      let levelR = Math.min(100, Math.max(0, smoothedLevelR));

      levels.left = levelL;
      levels.right = levelR;

      updateMeter("eq-left-meter", levelL);
      updateMeter("eq-right-meter", levelR);
    }

    eqAnimationId = requestAnimationFrame(loop);
  };

  eqAnimationId = requestAnimationFrame(loop);
}

// -------------------------------------------------------
// Public Initialization
// -------------------------------------------------------
function initAudioMeter(containerOrId = "level-meter-container") {
  const container =
    typeof containerOrId === "string"
      ? document.getElementById(containerOrId)
      : containerOrId;

  if (!container) return;

  // Cleanup old interval if exists
  if (eqSetupIntervalId) {
      clearInterval(eqSetupIntervalId);
      eqSetupIntervalId = null;
  }

  if (window.MetricsMonitor && typeof window.MetricsMonitor.getSignalUnit === "function") {
    const u = window.MetricsMonitor.getSignalUnit();
    if (u) {
      hfUnit = u.toLowerCase();
    }
  }

  container.innerHTML = "";

  const signalMetersGroup = document.createElement("div");
  signalMetersGroup.classList.add("signal-meters-group");

  const stereoGroup = document.createElement("div");
  stereoGroup.classList.add("stereo-group");
  
  const stereoScale = [
    "+5 dB",
    "0",
    "-5",
    "-10",
    "-15",
    "-20",
    "-26 dB"
  ];
  
  createLevelMeter("eq-left-meter", "LEFT", stereoGroup, stereoScale);
  createLevelMeter("eq-right-meter", "RIGHT", stereoGroup, []);
  
  signalMetersGroup.appendChild(stereoGroup);

  const hfScale = buildHFScale(hfUnit);
  createLevelMeter("hf-meter", "RF", signalMetersGroup, hfScale);
  
  container.appendChild(signalMetersGroup);

  const eqGroup = document.createElement("div");
  eqGroup.classList.add("eq-group");

  const eqTitle = document.createElement("div");
  eqTitle.id = "eqTitle";
  eqTitle.innerText = "5-BAND AUDIOMETER";
  eqGroup.appendChild(eqTitle);

  const eqHintWrapper = document.createElement("div");
  eqHintWrapper.id = "eqHintWrapper";
  const eqHintText = document.createElement("div");
  eqHintText.id = "eqHintText";
  eqHintText.innerText = "Click play to show";
  eqHintWrapper.style.top = "-5%";
  eqHintWrapper.style.left = "-10%";
  eqHintWrapper.appendChild(eqHintText);
  stereoGroup.appendChild(eqHintWrapper);

  const eqBars = document.createElement("div");
  eqBars.classList.add("eq-bars");

  const eqFrequencyLabels = ["64", "256", "1k", "4k", "10k"];
  for (let i = 0; i < EQ_BAND_COUNT; i++) {
    const label = eqFrequencyLabels[i] || "";
    createLevelMeter(`eq${i + 1}-meter`, label, eqBars, []);
  }

  eqGroup.appendChild(eqBars);
  container.appendChild(eqGroup);

  // Initial Values
  updateMeter("eq-left-meter", levels.left);
  updateMeter("eq-right-meter", levels.right);
  updateMeter("hf-meter", levels.hf || 0);
  for (let i = 1; i <= EQ_BAND_COUNT; i++) {
    updateMeter(`eq${i}-meter`, 0);
  }

  // Attempt initial setup immediately
  setupAudioEQ();
  
  // Start robust interval to check for audio start
  eqSetupIntervalId = setInterval(setupAudioEQ, 1000);

  if (!hfUnitListenerAttached && window.MetricsMonitor && typeof window.MetricsMonitor.onSignalUnitChange === "function") {
    hfUnitListenerAttached = true;
    window.MetricsMonitor.onSignalUnitChange((unit) => {
      if (window.MetricsAudioMeter && typeof window.MetricsAudioMeter.setHFUnit === "function") {
        window.MetricsAudioMeter.setHFUnit(unit);
      }
    });
  }
}

// -------------------------------------------------------
// Public API
// -------------------------------------------------------
window.MetricsAudioMeter = {
  init: initAudioMeter,

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

  setHFUnit(unit) {
    if (!unit) return;
    hfUnit = unit.toLowerCase();

    const meterEl = document.getElementById("hf-meter");
    if (!meterEl) return;

    const levelMeter = meterEl.closest(".level-meter");
    if (!levelMeter) return;

    const scaleEl = levelMeter.querySelector(".meter-scale-AudioMeter");
    if (!scaleEl) return;

    const newScale = buildHFScale(hfUnit);
    const ticks = scaleEl.querySelectorAll("div");
    newScale.forEach((txt, idx) => {
      if (ticks[idx]) {
        ticks[idx].innerText = txt;
      }
    });

    if (typeof levels.hfBase === "number") {
      const displayHF = hfBaseToDisplay(levels.hfBase);
      levels.hfValue = displayHF;
    }
  },

  levels,
  updateMeter
};

})();