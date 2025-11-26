///////////////////////////////////////////////////////////////
/// Level Meters + Audio (Browser) + MPX WebSocket          ///
///////////////////////////////////////////////////////////////

(() => {
const sampleRate = 96000;    // Do not touch - this value is automatically updated via the config file
const stereoBoost = 1;    // Do not touch - this value is automatically updated via the config file
const eqBoost = 1;    // Do not touch - this value is automatically updated via the config file

  ///////////////////////////////////////////////////////////////

  // Feature flags depending on MPX sample rate
  const RDS_ENABLED   = (sampleRate === 192000); // RDS is only valid at 192 kHz MPX
  const PILOT_ENABLED = (sampleRate !== 48000);  // Pilot deviation meter not available at 48 kHz
  const MPX_ENABLED   = (sampleRate === 192000); // MPX total meter only valid at 192 kHz

  // Global level values (accessible from outside via window.MetricsMeters)
  const levels = {
    left: 0,
    right: 0,
    hf: 0,
    hfBase: 0,    // Base RF value in dBf
    hfValue: 0,   // Display value in the currently selected unit
    stereoPilot: 0,
    rds: 0,
    mpxTotal: 0   // Total MPX modulation meter level (0..100 %)
  };

  // Peak-hold configuration & state for LEFT/RIGHT
  const PEAK_CONFIG = {
    smoothing: 0.85,
    holdMs: 5000
  };

  const peaks = {
    left:  { value: 0, lastUpdate: Date.now() },
    right: { value: 0, lastUpdate: Date.now() }
  };

  // --- MPX / Spectrum data (used for Pilot + RDS + MPX total) -------
  let mpxSpectrum = [];
  let mpxSmoothSpectrum = [];

  const MPX_DB_MIN   = -70;
  const MPX_DB_MAX   = 0;
  const MPX_FMAX     = 96000;
  const MPX_AVG      = 6;

  // Soft-smoothing for Pilot, RDS and MPX total meters
  let pilotSmooth    = 0;
  let rdsShortPrev   = 0;
  let rdsLongPrev    = 0;
  let mpxTotalSmooth = 0;

  const PILOT_SMOOTHING     = 0.15;
  const MPX_TOTAL_SMOOTHING = 0.85;  // (kept for possible future use)

  // RDS lock state (DEVA-like with HOLD / anti-flap)
  let rdsLocked    = false;
  let rdsLockTimer = 18; // number of frames to keep RDS "locked" (~ stable display)

  // dB → linear amplitude
  function dbToAmp(db) {
    return Math.pow(10, db / 20);
  }

  // Total power (amplitude^2) inside a frequency band around centerHz
  function bandPower(centerHz, bandHz) {
    if (!mpxSpectrum.length) return 0;

    const N       = mpxSpectrum.length;
    const maxFreq = MPX_FMAX;

    const fMin = centerHz - bandHz / 2;
    const fMax = centerHz + bandHz / 2;

    const idxMin = Math.max(0, Math.floor((fMin / maxFreq) * (N - 1)));
    const idxMax = Math.min(N - 1, Math.ceil((fMax / maxFreq) * (N - 1)));
    if (idxMax <= idxMin) return 0;

    let p = 0;
    for (let i = idxMin; i <= idxMax; i++) {
      const db = mpxSpectrum[i];
      if (!isFinite(db) || db <= MPX_DB_MIN) continue;
      const a = dbToAmp(db);
      p += a * a;   // Power ~ amplitude^2
    }
    return p;
  }

  // --- RF unit handling (dBf / dBµV / dBm) via global MetricsMonitor -
  let hfUnit = "dbf";
  let hfUnitListenerAttached = false;

  if (window.MetricsMonitor && typeof window.MetricsMonitor.getSignalUnit === "function") {
    const u = window.MetricsMonitor.getSignalUnit();
    if (u) {
      hfUnit = u.toLowerCase();
      console.log("[MetricsMeters] RF unit (init) =", hfUnit);
    }
  }

  // RF conversion (base is dBf, like in the scanner)
  // dBµV = dBf - 10.875
  // dBm  = dBf - 119.75
  function hfBaseToDisplay(baseHF) {
    const v = Number(baseHF);
    if (!isFinite(v)) return 0;
    const ssu = (hfUnit || "").toLowerCase();

    if (ssu === "dbuv" || ssu === "dbµv" || ssu === "dbμv") {
      return v - 10.875;          // dBµV
    } else if (ssu === "dbm") {
      return v - 119.75;          // dBm
    } else if (ssu === "dbf") {
      return v;                   // dBf
    }
    return v;
  }

  // Base RF (dBf) → 0..100 % for RF bar (internally mapped to 0..90 dBµV)
  function hfPercentFromBase(baseHF) {
    const v = Number(baseHF);
    if (!isFinite(v)) return 0;

    let dBuV = v - 10.875;       // dBµV
    if (isNaN(dBuV)) dBuV = 0;

    const clamped = Math.max(0, Math.min(90, dBuV));
    return (clamped / 90) * 100;
  }

  // RF scale labels depending on unit
  function buildHFScale(unit) {
    const baseScale_dBuV = [90, 80, 70, 60, 50, 40, 30, 20, 10, 0];
    const ssu = (unit || hfUnit || "").toLowerCase();

    function round10(v) {
      return Math.round(v / 10) * 10;
    }

    if (ssu === "dbm") {
      // dBm = dBµV - 108.875
      return baseScale_dBuV.map((v, idx) => {
        const dBm = v - 108.875;
        const rounded = round10(dBm);
        return idx === 0 ? `${rounded} dBm` : `${rounded}`;
      });
    }

    if (ssu === "dbf") {
      // dBf = dBµV + 10.875
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

  // --- Stereo audio directly from browser (Fallback.Player.Amplification) ---
  let stereoAudioContext    = null;
  let stereoSourceNode      = null;
  let stereoSplitter        = null;
  let stereoAnalyserL       = null;
  let stereoAnalyserR       = null;
  let stereoDataL           = null;
  let stereoDataR           = null;
  let stereoAnimationId     = null;
  let stereoSetupIntervalId = null;

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

  // Scale labels (LEFT/RIGHT/PILOT/RDS/RF/MPX)
  const scales = {
    left: [
      "+5,0 dB",
      "0,0",
      "-5,0",
      "-10,0",
      "-15,0",
      "-20,0",
      "-25,0",
      "-30,0",
      "-35,0 dB"
    ],
    right: [],
    stereoPilot: ["15,0","13,0","11,0","9,0","7,0","5,0","3,0","1,0","0 kHz"],
    hf: [], // will be built via buildHFScale(hfUnit)
    rds: ["10,0","9,0","8,0","7,0","6,0","5,0","4,0","3,0","2,0","1,0","0 kHz"],
    mpx: ["-120,0","-105,0","-90,0","-75,0","-60,0","-45,0","-30,0","-15,0","0 kHz"]
  };

  // Peak-hold update for LEFT / RIGHT
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

  // Draw peak segment for LEFT / RIGHT
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

    if (meterId && (meterId.includes("left") || meterId.includes("right"))) {
      seg.style.backgroundColor = stereoColorForPercent(peak, segments.length);
    }
  }

  // -------------------------------------------------------
  // Meter creation & update (DOM structure identical to EQ)
  // -------------------------------------------------------
  function createLevelMeter(id, label, container, scaleValues) {
    const levelMeter = document.createElement("div");
    levelMeter.classList.add("level-meter");

    const top = document.createElement("div");
    top.classList.add("meter-top");

    const meterBar = document.createElement("div");
    meterBar.classList.add("meter-bar");
    meterBar.setAttribute("id", id);

    // 30 vertical segments
    for (let i = 0; i < 30; i++) {
      const segment = document.createElement("div");
      segment.classList.add("segment");
      meterBar.appendChild(segment);
    }

    // Peak marker for LEFT/RIGHT
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

    if (id.includes("left"))  labelElement.classList.add("label-left");
    if (id.includes("right")) labelElement.classList.add("label-right");

    meterWrapper.appendChild(meterBar);
    meterWrapper.appendChild(labelElement);

    // Optional scale ticks
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

  // Update meter segments and colors
  function updateMeter(meterId, level) {
    const meter = document.getElementById(meterId);
    if (!meter) return;

    const isRds   = meterId.includes("rds");
    const isPilot = meterId.includes("stereo-pilot");
    const isMpx   = meterId.includes("mpx");

    const rdsDisabled   = isRds   && !RDS_ENABLED;
    const pilotDisabled = isPilot && !PILOT_ENABLED;
    const mpxDisabled   = isMpx   && !MPX_ENABLED;

    const safeLevel = Math.max(0, Math.min(100, Number(level) || 0));
    const segments = meter.querySelectorAll(".segment");
    const activeCount = Math.round((safeLevel / 100) * segments.length);

    segments.forEach((seg, i) => {
      // If a meter is disabled, keep it dark gray (no color)
      if (rdsDisabled || pilotDisabled || mpxDisabled) {
        seg.style.backgroundColor = "#333";
        return;
      }

      if (i < activeCount) {
        if (meterId.includes("left") || meterId.includes("right")) {
          // Stereo: green → red at top segments
          if (i >= segments.length - 5) {
            const red = Math.round((i / 10) * 125);
            seg.style.backgroundColor = `rgb(${red},0,0)`;
          } else {
            const green = 100 + Math.round((i / segments.length) * 155);
            seg.style.backgroundColor = `rgb(0,${green},0)`;
          }
        } else if (isPilot) {
          // Pilot: green → red depending on deviation
          if (i < segments.length * 0.5) {
            const green = 100 + Math.round((i / (segments.length * 0.5)) * 155);
            seg.style.backgroundColor = `rgb(0,${green},0)`;
          } else {
            const pos = (i - segments.length * 0.5) / (segments.length * 0.5);
            const red = 225 - Math.round(pos * 155);
            seg.style.backgroundColor = `rgb(${red},0,0)`;
          }
        } else if (isRds) {
          // RDS deviation color logic (green → yellow → red)
          const rdsThresholdIndex1 = Math.round((2.5 / 10) * segments.length);
          const rdsThresholdIndex2 = Math.round((3.5 / 10) * segments.length);
          if (i < rdsThresholdIndex1) {
            const green = 100 + Math.round((i / (segments.length * 0.5)) * 225);
            seg.style.backgroundColor = `rgb(0,${green},0)`;
          } else if (i >= rdsThresholdIndex1 && i <= rdsThresholdIndex2) {
            const yellowIntensity = 255 - Math.round(
              (i - rdsThresholdIndex1) / (rdsThresholdIndex2 - rdsThresholdIndex1) * 60
            );
            seg.style.backgroundColor =
              `rgb(${yellowIntensity + 150}, ${yellowIntensity}, 0)`;
          } else {
            const pos = (i - rdsThresholdIndex2) / (segments.length - rdsThresholdIndex2);
            const red = 225 - Math.round(pos * 155);
            seg.style.backgroundColor = `rgb(${red},0,0)`;
          }
        } else if (isMpx) {
          // MPX total: 0..75 kHz green, 75..80 kHz yellow, 80..120 kHz red
          const kHzMax       = 120;
          const idxGreenMax  = Math.round((75 / kHzMax) * segments.length);
          const idxYellowMax = Math.round((80 / kHzMax) * segments.length);

          if (i < idxGreenMax) {
            // Green gradient like LEFT/RF
            const green = 100 + Math.round((i / Math.max(1, idxGreenMax - 1)) * 155);
            seg.style.backgroundColor = `rgb(0,${green},0)`;
          } else if (i < idxYellowMax) {
            // Yellow transition area
            const pos = (i - idxGreenMax) / Math.max(1, idxYellowMax - idxGreenMax);
            const yellowIntensity = 255 - Math.round(pos * 60);
            seg.style.backgroundColor =
              `rgb(${yellowIntensity + 150}, ${yellowIntensity}, 0)`;
          } else {
            // Red area – same red gradient as the other meters
            const pos = (i - idxYellowMax) / Math.max(1, segments.length - idxYellowMax);
            const red = 225 - Math.round(pos * 155);
            seg.style.backgroundColor = `rgb(${red},0,0)`;
          }
        } else if (meterId.includes("hf")) {
          // RF color logic: low RF = more red, high RF = more green
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
          // Generic meter color fallback
          if (i < segments.length * 0.6) {
            seg.style.backgroundColor = "#4caf50";
          } else if (i < segments.length * 0.8) {
            seg.style.backgroundColor = "#ff9800";
          } else {
            seg.style.backgroundColor = "#f44336";
          }
        }
      } else {
        // Inactive segment
        seg.style.backgroundColor = "#333";
      }
    });

    // Peak hold for LEFT / RIGHT
    if (meterId.includes("left") || meterId.includes("right")) {
      const channel = meterId.includes("left") ? "left" : "right";
      updatePeakValue(channel, safeLevel);
      setPeakSegment(meter, peaks[channel].value, meterId);
    }
  }

  // ---------------------------------------------------------------
  // MPX data → smoothed dB spectrum
  // ---------------------------------------------------------------
  function handleMpxArray(data) {
    if (!Array.isArray(data) || data.length === 0) return;

    const arr = [];
    for (let i = 0; i < data.length; i++) {
      const mag = (data[i] && typeof data[i].m === "number") ? data[i].m : 0;
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
          (mpxSmoothSpectrum[i] * (MPX_AVG - 1) + arr[i]) / MPX_AVG;
      }
      if (arr.length > len) {
        for (let i = len; i < arr.length; i++) {
          mpxSmoothSpectrum[i] = arr[i];
        }
      }
    }

    mpxSpectrum = mpxSmoothSpectrum.slice();

    updatePilotFromSpectrum();
    updateRdsFromSpectrum();
    updateMpxTotalFromSpectrum();
  }

  // ---------------------------------------------------------------
  // 19 kHz Pilot — DEVA-like detection with RF gating + noise check
  // ---------------------------------------------------------------
  function updatePilotFromSpectrum() {

    if (!PILOT_ENABLED) {
      pilotSmooth = 0;
      levels.stereoPilot = 0;
      updateMeter("stereo-pilot-meter", 0);
      return;
    }

    if (!mpxSpectrum.length) return;

    const F_PILOT  = 19000;
    const PILOT_BW = 1600;   // softer bandwidth (±800 Hz around 19 kHz)
    const NOISE_BW = 3000;   // mid-band noise window

    const P_pilot = bandPower(F_PILOT, PILOT_BW);
    const P_noise = bandPower(25000, NOISE_BW);

    const pilotDb = 10 * Math.log10(P_pilot + 1e-15);
    const noiseDb = 10 * Math.log10(P_noise + 1e-15);

    // ---------------------------------------------------------
    // 1) RF gating – but soft (DX-friendly)
    // ---------------------------------------------------------
    const HF_THRESHOLD_PERCENT = 12;   // softer RF gating threshold
    const hfPercent = Number(levels.hf) || 0;

    if (hfPercent < HF_THRESHOLD_PERCENT) {
      // gently fade out pilot instead of hard zero
      pilotSmooth *= 0.92;
      levels.stereoPilot = pilotSmooth;
      updateMeter("stereo-pilot-meter", pilotSmooth);
      return;
    }

    // ---------------------------------------------------------
    // 2) Pilot must be above noise – but soft
    // ---------------------------------------------------------
    const MIN_SNR_DB = 1.2;   // mild SNR requirement

    if (pilotDb < noiseDb + MIN_SNR_DB) {
      pilotSmooth *= 0.92;
      levels.stereoPilot = pilotSmooth;
      updateMeter("stereo-pilot-meter", pilotSmooth);
      return;
    }

    // ---------------------------------------------------------
    // 3) Ratio check – very tolerant (avoids purely flat noise)
    // ---------------------------------------------------------
    const ratio = Math.sqrt(P_pilot) / Math.sqrt(P_noise);

    if (ratio < 1.1) {
      pilotSmooth *= 0.92;
      levels.stereoPilot = pilotSmooth;
      updateMeter("stereo-pilot-meter", pilotSmooth);
      return;
    }

    // ---------------------------------------------------------
    // 4) Compute deviation (kHz)
    // ---------------------------------------------------------
    const PILOT_DEV_MAX_KHZ   = 8.0;  // typical pilot deviation range
    const PILOT_SCALE_MAX_KHZ = 15.0; // meter scale upper end

    // Normalize roughly from -85..0 dB
    let norm = (pilotDb + 85) / 85;
    if (norm < 0) norm = 0;
    if (norm > 1) norm = 1;

    const devKHz = norm * PILOT_DEV_MAX_KHZ;
    let percent = (devKHz / PILOT_SCALE_MAX_KHZ) * 100;
    if (percent > 100) percent = 100;
    if (percent < 0)   percent = 0;

    // Smooth pilot meter (attack/decay)
    pilotSmooth = pilotSmooth * 0.88 + percent * 0.12;

    levels.stereoPilot = pilotSmooth;
    updateMeter("stereo-pilot-meter", pilotSmooth);
  }

  // ---------------------------------------------------------------
  // RDS detector — DEVA-like with HOLD / anti-flap
  // ---------------------------------------------------------------
  function updateRdsFromSpectrum() {

    if (!RDS_ENABLED) {
      updateMeter("rds-meter", 0);
      levels.rds = 0;
      return;
    }

    if (!mpxSpectrum.length) return;

    const F_PILOT = 19000;
    const F_RDS   = 57000;

    const PILOT_BW = 1800;
    const RDS_BW   = 1200;

    const P_pilot = bandPower(F_PILOT, PILOT_BW);
    const P_rds   = bandPower(F_RDS,   RDS_BW);
    const noise   = bandPower(52000,   3500);

    const rdsDb   = 10 * Math.log10(P_rds  + 1e-15);
    const noiseDb = 10 * Math.log10(noise  + 1e-15);
    const pilotDb = 10 * Math.log10(P_pilot + 1e-15);

    // -------------------------------
    // 1) Pilot must exist at all
    // -------------------------------
    const PILOT_ON = (pilotDb > -35);   // allow relatively weak pilot

    // -------------------------------
    // 2) RDS > noise (soft, dynamic)
    // -------------------------------
    const RDS_DETECTED = (rdsDb > noiseDb + 0.1);

    // -------------------------------
    // 3) Minimal RDS/Pilot ratio (very soft)
    // -------------------------------
    const ratio    = Math.sqrt(P_rds) / Math.sqrt(P_pilot);
    const ratioMin = 0.008;   // ~0.8% minimal
    const RATIO_OK = (ratio > ratioMin);

    // ============================================================
    // 4) RDS lock decision (with HOLD / anti-flap)
    // ============================================================
    let newLock = false;

    // Conditions for a valid RDS lock
    if (PILOT_ON && RDS_DETECTED && RATIO_OK) newLock = true;

    if (newLock) {
      rdsLocked    = true;
      rdsLockTimer = 18; // hold RDS for N frames to make the display stable
    } else {
      // If no new RDS frame, run down the hold timer
      if (rdsLockTimer > 0) {
        rdsLockTimer--;
        newLock = true;  // still show RDS while the timer is running
      } else {
        rdsLocked = false;
      }
    }

    // If finally no RDS → fade out smoothly instead of jumping to 0
    if (!newLock) {
      rdsShortPrev *= 0.92;
      rdsLongPrev  *= 0.96;
      updateMeter("rds-meter", rdsLongPrev);
      levels.rds = rdsLongPrev;
      return;
    }

    // ============================================================
    // 5) RDS deviation estimate
    // ============================================================
    const PILOT_DEV = 9.0;
    let dev = ratio * PILOT_DEV;

    if (dev < 0.3) dev = 0.3;
    if (dev > 6.0) dev = 6.0;

    let percent = (dev / 10.0) * 100;
    if (percent > 100) percent = 100;
    if (percent < 0)   percent = 0;

    // ============================================================
    // 6) Double smoothing (DEVA-like, slow + stable)
    // ============================================================
    const SHORT = 0.65;
    const LONG  = 0.93;

    const s1 = percent * (1 - SHORT) + rdsShortPrev * SHORT;
    rdsShortPrev = s1;

    const s2 = rdsLongPrev * LONG + s1 * (1 - LONG);
    rdsLongPrev = s2;

    updateMeter("rds-meter", s2);
    levels.rds = s2;
  }

  // ---------------------------------------------------------------
  // MPX total modulation (DEVA-like, with RF/Pilot gating)
  //
  //  • Based on the MPX spectrum (0..60 kHz)
  //  • Only shows MPX when RF and Pilot indicate a real signal
  //  • On noise / no signal → MPX = 0
  //  • Slightly boosted so full-scale is easier to see
  //  • Double-smoothing for a calm, DEVA-like display
  // ---------------------------------------------------------------
  let mpxPercentPrev = 0;   // Short smoothing state

  function updateMpxTotalFromSpectrum() {
    if (!MPX_ENABLED) {
      // MPX meter is not valid for this sample rate → force 0
      mpxPercentPrev  = 0;
      mpxTotalSmooth  = 0;
      levels.mpxTotal = 0;
      updateMeter("mpx-meter", 0);
      return;
    }

    if (!mpxSpectrum.length) return;

    // -----------------------------------------------------------
    // 0) Professional "No Signal" gating
    //    → without RF and Pilot there is NO MPX at all
    // -----------------------------------------------------------
    const HF_THRESHOLD_PERCENT    = 25; // RF < 25% = no station
    const PILOT_THRESHOLD_PERCENT = 5;  // Pilot < 5% = no pilot lock

    const hfPercent  = Number(levels.hf) || 0;          // 0..100 %
    const pilotLevel = Number(levels.stereoPilot) || 0; // 0..100 %

    if (hfPercent < HF_THRESHOLD_PERCENT ||
        pilotLevel < PILOT_THRESHOLD_PERCENT) {

      // Reset everything like professional devices do on "No Signal"
      mpxPercentPrev  = 0;
      mpxTotalSmooth  = 0;
      levels.mpxTotal = 0;
      updateMeter("mpx-meter", 0);
      return;
    }

    // -----------------------------------------------------------
    // 1) Average dB over the 0..60 kHz baseband area
    // -----------------------------------------------------------
    const N       = mpxSpectrum.length;
    const maxFreq = MPX_FMAX;      // e.g. 96000 Hz
    const fLimit  = 60000;         // integrate 0..60 kHz region

    let sumDb = 0;
    let count = 0;

    for (let i = 0; i < N; i++) {
      const freq = (i / (N - 1)) * maxFreq;
      if (freq > fLimit) break;

      const db = mpxSpectrum[i];
      if (!isFinite(db) || db < -140) continue;

      sumDb += db;
      count++;
    }

    if (!count) {
      mpxPercentPrev  = 0;
      mpxTotalSmooth  = 0;
      levels.mpxTotal = 0;
      updateMeter("mpx-meter", 0);
      return;
    }

    const avgDb = sumDb / count;

    // -----------------------------------------------------------
    // 2) DEVA-like MPX mapping
    //    -80 dB → 0 kHz, -60 → 25, -50 → 40, -40 → 60,
    //    -30 → 80, -20 → 100 kHz
    // -----------------------------------------------------------
    let devKHz;

    if (avgDb < -60) {
      devKHz = (avgDb + 80) * (25 / 20);           // 0..25 kHz
    } else if (avgDb < -50) {
      devKHz = 25 + ((avgDb + 60) * (15 / 10));    // 25..40 kHz
    } else if (avgDb < -40) {
      devKHz = 40 + ((avgDb + 50) * (20 / 10));    // 40..60 kHz
    } else if (avgDb < -30) {
      devKHz = 60 + ((avgDb + 40) * (20 / 10));    // 60..80 kHz
    } else {
      devKHz = 80 + ((avgDb + 30) * (20 / 10));    // 80..100 kHz
    }

    // Clamp deviation
    if (devKHz < 0)   devKHz = 0;
    if (devKHz > 120) devKHz = 120;

    // Slight boost so the meter uses more of the scale
    devKHz *= 1.30;   // adjust boost factor as needed

    let percent = (devKHz / 120) * 100;
    if (percent < 0)   percent = 0;
    if (percent > 100) percent = 100;

    // -----------------------------------------------------------
    // 3) DEVA-like double smoothing
    // -----------------------------------------------------------
    const shortSmoothFactor = 0.75;   // short-term smoothing (0..1)
    percent = percent * (1 - shortSmoothFactor) +
              mpxPercentPrev * shortSmoothFactor;
    mpxPercentPrev = percent;

    const longSmoothFactor = 0.93;    // long-term smoothing (0..1)
    mpxTotalSmooth = mpxTotalSmooth * longSmoothFactor +
                     percent * (1 - longSmoothFactor);

    levels.mpxTotal = mpxTotalSmooth;

    updateMeter("mpx-meter", mpxTotalSmooth);
  }

  // ---------------------------------------------------------------
  // Stereo audio meters: direct audio from browser
  // ---------------------------------------------------------------
  function setupAudioMeters() {
    if (
      typeof Stream === "undefined" ||
      !Stream.Fallback ||
      !Stream.Fallback.Player ||
      !Stream.Fallback.Player.Amplification
    ) {
      setTimeout(setupAudioMeters, 2000);
      return;
    }

    const player     = Stream.Fallback.Player;
    const sourceNode = player.Amplification;

    if (!sourceNode || !sourceNode.context) {
      console.warn("[MetricsMeters] No valid AudioNode for Amplification found – retrying…");
      setTimeout(setupAudioMeters, 2000);
      return;
    }

    try {
      const ctx = sourceNode.context;

      if (stereoAudioContext !== ctx) {
        stereoAudioContext = ctx;
        stereoSourceNode   = null;
        stereoSplitter     = null;
        stereoAnalyserL    = null;
        stereoAnalyserR    = null;
        stereoDataL        = null;
        stereoDataR        = null;
      }

      if (stereoSplitter && stereoAnalyserL && stereoAnalyserR) {
        if (!stereoAnimationId) {
          startStereoAnimation();
        }
        return;
      }

      stereoSourceNode = sourceNode;
      stereoSplitter   = stereoAudioContext.createChannelSplitter(2);
      stereoAnalyserL  = stereoAudioContext.createAnalyser();
      stereoAnalyserR  = stereoAudioContext.createAnalyser();

      stereoAnalyserL.fftSize = 2048;
      stereoAnalyserR.fftSize = 2048;

      stereoDataL = new Uint8Array(stereoAnalyserL.frequencyBinCount);
      stereoDataR = new Uint8Array(stereoAnalyserR.frequencyBinCount);

      stereoSourceNode.connect(stereoSplitter);
      stereoSplitter.connect(stereoAnalyserL, 0);
      stereoSplitter.connect(stereoAnalyserR, 1);

      if (!stereoAnimationId) {
        startStereoAnimation();
      }
    } catch (e) {
      console.error("[MetricsMeters] Error while setting up stereo audio analysers", e);
    }
  }

  // Main animation loop for LEFT/RIGHT audio meters
  function startStereoAnimation() {
    if (stereoAnimationId) cancelAnimationFrame(stereoAnimationId);

    const loop = () => {
      if (!stereoAnalyserL || !stereoAnalyserR || !stereoDataL || !stereoDataR) {
        stereoAnimationId = requestAnimationFrame(loop);
        return;
      }

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

      levels.left  = levelL;
      levels.right = levelR;

      updateMeter("left-meter",  levelL);
      updateMeter("right-meter", levelR);

      stereoAnimationId = requestAnimationFrame(loop);
    };

    stereoAnimationId = requestAnimationFrame(loop);
  }

  // ---------------------------------------------------------------
  // WebSocket for MPX / RDS / Pilot data
  // ---------------------------------------------------------------
  function setupMetricsWebSocket() {
    const currentURL    = window.location;
    const webserverPort = currentURL.port || (currentURL.protocol === "https:" ? "443" : "80");
    const protocol      = currentURL.protocol === "https:" ? "wss:" : "ws:";
    const webserverURL  = currentURL.hostname;
    const websocketURL  = `${protocol}//${webserverURL}:${webserverPort}/data_plugins`;

    const socket = new WebSocket(websocketURL);

    socket.onopen = () => {
      console.log("[MetricsMeters] WebSocket connection opened");
    };

    socket.onmessage = (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }

      if (Array.isArray(message)) {
        handleMpxArray(message);
        return;
      }

      if (!message || typeof message !== "object") return;
      const type = message.type ? String(message.type).toLowerCase() : "";

      if (type === "mpx") {
        handleMpxArray(message.value);
        return;
      }
    };

    socket.onerror = (error) => {
      console.error("[MetricsMeters] WebSocket error:", error);
    };

    socket.onclose = () => {
      console.log("[MetricsMeters] WebSocket connection closed");
    };
  }

  // ---------------------------------------------------------------
  // INIT – create LEFT / RIGHT / RF / PILOT / MPX / RDS meters
  // ---------------------------------------------------------------
  function initMeters(levelMeterContainer) {
    const container = levelMeterContainer;
    if (!container) return;

    container.innerHTML = "";

    // Stereo group (LEFT / RIGHT), similar to the equalizer layout
    const stereoGroup = document.createElement("div");
    stereoGroup.classList.add("stereo-group");

    createLevelMeter("left-meter",  "LEFT",  stereoGroup, scales.left);
    createLevelMeter("right-meter", "RIGHT", stereoGroup, scales.right);

    container.appendChild(stereoGroup);

    // RF meter with dynamic scale depending on global RF unit
    const hfScale = buildHFScale(hfUnit);
    createLevelMeter("hf-meter", "RF", container, hfScale);

    const hfLevelMeter = container.querySelector("#hf-meter")?.closest(".level-meter");
    if (hfLevelMeter) {
      // Small horizontal offset to align with layout
      hfLevelMeter.style.transform = "translateX(-5px)";
    }

    // Additional meters: PILOT, MPX total & RDS
    createLevelMeter("stereo-pilot-meter", "PILOT", container, scales.stereoPilot);
    createLevelMeter("mpx-meter",          "MPX",   container, scales.mpx);
    createLevelMeter("rds-meter",          "RDS",   container, scales.rds);

    // Visually grey out disabled meters (Pilot / RDS / MPX)
    const pilotMeterEl = container.querySelector("#stereo-pilot-meter")?.closest(".level-meter");
    if (pilotMeterEl && !PILOT_ENABLED) {
      pilotMeterEl.style.opacity = "0.4";
    }

    const rdsMeterEl = container.querySelector("#rds-meter")?.closest(".level-meter");
    if (rdsMeterEl && !RDS_ENABLED) {
      rdsMeterEl.style.opacity = "0.4";
    }

    const mpxMeterEl = container.querySelector("#mpx-meter")?.closest(".level-meter");
    if (mpxMeterEl && !MPX_ENABLED) {
      mpxMeterEl.style.opacity = "0.4";
    }

    // Initial values
    updateMeter("left-meter",  levels.left       || 0);
    updateMeter("right-meter", levels.right      || 0);
    updateMeter("hf-meter",    levels.hf         || 0);
    updateMeter("stereo-pilot-meter", levels.stereoPilot || 0);
    updateMeter("mpx-meter",   levels.mpxTotal   || 0);
    updateMeter("rds-meter",   levels.rds        || 0);

    // WebSocket & audio setup
    setupMetricsWebSocket();
    setupAudioMeters();
    if (!stereoSetupIntervalId) {
      stereoSetupIntervalId = setInterval(setupAudioMeters, 3000);
    }

    // Listen ONCE for RF unit changes from global MetricsMonitor
    if (!hfUnitListenerAttached &&
        window.MetricsMonitor &&
        typeof window.MetricsMonitor.onSignalUnitChange === "function") {

      hfUnitListenerAttached = true;

      window.MetricsMonitor.onSignalUnitChange((unit) => {
        if (window.MetricsMeters && typeof window.MetricsMeters.setHFUnit === "function") {
          window.MetricsMeters.setHFUnit(unit);
        }
      });
    }
  }

  // ---------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------
  window.MetricsMeters = {
    levels,
    updateMeter,
    initMeters,

    getStereoBoost() {
      return stereoBoost;
    },

    // NOTE:
    // stereoBoost is defined as const in the header and patched via config.
    // If you want to make it fully runtime-adjustable, change the header
    // declaration to "let stereoBoost = X;" and uncomment the assignment below.
    setStereoBoost(value) {
      const v = Number(value);
      if (!isNaN(v) && v > 0) {
        // stereoBoost = v;
      }
    },

    // RF is passed in BASE unit (dBf) like in the scanner:
    // -> display unit converted via hfUnit
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

    // Change RF unit at runtime (triggered from loader / dropdown)
    setHFUnit(unit) {
      console.log("[MetricsMeters] setHFUnit() :: new unit =", unit);

      if (!unit) {
        console.warn("[MetricsMeters] setHFUnit(): unit is empty");
        return;
      }

      hfUnit = unit.toLowerCase();

      const meterEl = document.getElementById("hf-meter");
      if (!meterEl) {
        console.warn("[MetricsMeters] setHFUnit(): RF meter not found in DOM!");
        return;
      }

      const levelMeter = meterEl.closest(".level-meter");
      if (!levelMeter) {
        console.warn("[MetricsMeters] setHFUnit(): level-meter wrapper missing!");
        return;
      }

      const scaleEl = levelMeter.querySelector(".meter-scale");
      if (!scaleEl) {
        console.warn("[MetricsMeters] setHFUnit(): scale element not found!");
        return;
      }

      const newScale = buildHFScale(hfUnit);
      console.log("[MetricsMeters] New RF scale =", newScale);

      const ticks = scaleEl.querySelectorAll("div");
      newScale.forEach((txt, idx) => {
        if (ticks[idx]) {
          ticks[idx].innerText = txt;
        }
      });

      if (typeof levels.hfBase === "number") {
        const displayHF = hfBaseToDisplay(levels.hfBase);
        levels.hfValue = displayHF;
        console.log("[MetricsMeters] Recalculated RF value =", displayHF);
      }
    }
  };
})();
