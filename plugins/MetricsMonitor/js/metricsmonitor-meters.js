///////////////////////////////////////////////////////////////
//                                                           //
//  metricsmonitor-meters.js                        (V2.8b)  //
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

const MeterTiltCalibration = -900;           // Auto-updated via config file

    // Debug flags
    const ENABLE_DEBUG = false;
    const DEBUG_INTERVAL_MS = 2000;
    let lastDebugTime = 0;

    // Sample-rate dependent flags
    const RDS_ENABLED = (sampleRate === 192000);
    const PILOT_ENABLED = (sampleRate !== 48000);
    const MPX_ENABLED = (sampleRate === 192000);

    // Global levels state
    const levels = {
        left: 0,
        right: 0,
        hf: 0,
        hfBase: 0,
        hfValue: 0,
        stereoPilot: 0,
        rds: 0,
        mpxTotal: 0
    };

    // Externally set by the main RDS decoder when it has a valid lock
    let websocketRdsActive = false;

    // Gate delay for MPX meter
    let mpxGateDelayTimer = 0;
    const MPX_GATE_CONFIRMATION_FRAMES = 5; // ~150 ms (5 frames * 30 ms)

    // Peak hold configuration (2s hold)
    const PEAK_CONFIG = { smoothing: 0.85, holdMs: 2000 };

    // Peaks state - CENTRAL SOURCE OF TRUTH
    const peaks = {
        left: { value: 0, lastUpdate: Date.now() },
        right: { value: 0, lastUpdate: Date.now() },
        mpx: { value: 0, lastUpdate: Date.now() }
    };

    // MPX spectrum data
    let mpxSpectrum = [];
    let mpxSmoothSpectrum = [];

    // Raw values from the server
    let mpxPeakVal = 0;
    let pilotPeakVal = 0;
    let rdsPeakVal = 0;

    const MPX_DB_MIN = -90;
    const MPX_DB_MAX = 0;
    const MPX_FMAX = 96000;
    const MPX_AVG = 6;

    // Smoothed display values
    let mpxDisplayValue = 0;
    let rdsDisplayValue = 0;
    let pilotDisplayValue = 0;

    // RF unit handling
    let hfUnit = "dbf";
    let hfUnitListenerAttached = false;

    if (window.MetricsMonitor && typeof window.MetricsMonitor.getSignalUnit === "function") {
        const u = window.MetricsMonitor.getSignalUnit();
        if (u) hfUnit = u.toLowerCase();
    }

    // Stereo audio context variables
    let stereoAudioContext = null;
    let stereoSourceNode = null;
    let stereoSplitter = null;
    let stereoAnalyserL = null;
    let stereoAnalyserR = null;
    let stereoDataL = null;
    let stereoDataR = null;
    let stereoAnimationId = null;
    let stereoSetupIntervalId = null;
    
    // Smoothing state for stereo meters
    let smoothedLevelL = 0;
    let smoothedLevelR = 0;

    // WebSocket (shared hub)
    let metersHeartbeatInterval = null;
    let metersActive = false; // set true by setActive() when meters module is visible
    let metersHubUnsubscribe = null;

    // ==========================================================
    // Color helpers
    // ==========================================================
    function parseRgb(rgbStr) {
        const match = rgbStr.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (match) return { r: parseInt(match[1]), g: parseInt(match[2]), b: parseInt(match[3]) };
        return { r: 0, g: 255, b: 0 };
    }

    function applyIntensity(colorObj, intensity) {
        const r = Math.min(255, Math.round(colorObj.r * intensity));
        const g = Math.min(255, Math.round(colorObj.g * intensity));
        const b = Math.min(255, Math.round(colorObj.b * intensity));
        return `rgb(${r},${g},${b})`;
    }

    const getScaledColor = applyIntensity;

    // ==========================================================
    // Unit conversion
    // ==========================================================
    function hfBaseToDisplay(baseHF) {
        const v = Number(baseHF);
        if (!isFinite(v)) return 0;
        const ssu = (hfUnit || "").toLowerCase();

        if (ssu === "dbuv" || ssu === "dbµv" || ssu === "dbμv") return v - 10.875;
        if (ssu === "dbm") return v - 119.75;
        if (ssu === "dbf") return v;
        return v;
    }

    function hfPercentFromBase(baseHF) {
        const v = Number(baseHF);
        if (!isFinite(v)) return 0;

        let dBuV = v - 10.875;
        if (isNaN(dBuV)) dBuV = 0;

        const clamped = Math.max(0, Math.min(90, dBuV));
        return (clamped / 90) * 100;
    }

    function buildHFScale(unit) {
        const baseScale_dBuV = [90, 80, 70, 60, 50, 40, 30, 20, 10, 0];
        const ssu = (unit || hfUnit || "").toLowerCase();

        function round10(v) { return Math.round(v / 10) * 10; }
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

        return baseScale_dBuV.map((v, idx) => {
            const rounded = round10(v);
            return idx === lastIndex ? `${rounded} dBµV` : `${rounded}`;
        });
    }

    // ==========================================================
    // Peak helpers
    // ==========================================================
    function updatePeakValue(channel, current) {
        if (!peaks[channel]) peaks[channel] = { value: 0, lastUpdate: Date.now() };
        const p = peaks[channel];
        const now = Date.now();

        if (current >= p.value) {
            p.value = current;
            p.lastUpdate = now;
        } else if (now - p.lastUpdate > PEAK_CONFIG.holdMs) {
            // Decay logic
            p.value = Math.max(current, p.value - 2.5);
        }
    }

    // ==========================================================
    // Meter colors
    // ==========================================================
    function getStereoColorForPercent(p, totalSegments = 30) {
        const i = Math.max(0, Math.min(totalSegments - 1, Math.round((p / 100) * totalSegments) - 1));
        // Calculate the top 5 segments to be completely in the red zone (0 to +5 dB)
        const topBandStart = totalSegments - 5; 
        const cDanger = parseRgb(MeterColorDanger);
        const cSafe = parseRgb(MeterColorSafe);

        if (i >= topBandStart) {
            const intensity = 0.8 + (0.2 * (i / totalSegments));
            return getScaledColor(cDanger, intensity);
        } else {
            const intensity = 0.6 + ((i / totalSegments) * 0.4);
            return getScaledColor(cSafe, intensity);
        }
    }

    function getMpxColorForIndex(i, totalSegments) {
        const kHzMax = 120;
        const idxGreenMax = Math.round((72.9 / kHzMax) * totalSegments);
        const idxYellowMax = Math.round((75.1 / kHzMax) * totalSegments);

        const cSafe = parseRgb(MeterColorSafe);
        const cWarning = parseRgb(MeterColorWarning);
        const cDanger = parseRgb(MeterColorDanger);

        if (i < idxGreenMax) {
            const intensity = 0.4 + ((i / Math.max(1, idxGreenMax - 1)) * 0.4);
            return applyIntensity(cSafe, intensity);
        } else if (i < idxYellowMax) {
            const pos = (i - idxGreenMax) / Math.max(1, idxYellowMax - idxGreenMax);
            const intensity = 1.2 + (0.2 * pos);
            return applyIntensity(cWarning, intensity);
        } else {
            const pos = (i - idxYellowMax) / Math.max(1, totalSegments - idxYellowMax);
            const intensity = 0.8 + (0.2 * pos);
            return applyIntensity(cDanger, intensity);
        }
    }

    // Scale labels
    const scales = {
        left: ["+5 dB", "0", "-5", "-10", "-15", "-20", "-26 dB"],
        right: [],
        stereoPilot: ["16", "14", "12", "10", "8", "6", "4", "2", "0 kHz"],
        hf: [],
        rds: ["16", "14", "12", "10", "8", "6", "4", "2", "0 kHz"],
        mpx: ["120", "105", "90", "75", "60", "45", "30", "15", "0 kHz"]
    };

    // ==========================================================
    // Peak segment rendering
    // ==========================================================
function setPeakSegment(meterEl, peakPercent, meterId) {
    const segments = meterEl.querySelectorAll(".segment");
    if (!segments.length) return;

    // Clear ALL peak flags in this meter first (not just one)
    meterEl.querySelectorAll(".segment.peak-flag").forEach(prev => {
        prev.classList.remove("peak-flag");
        prev.style.removeProperty("background-color");
        prev.style.removeProperty("box-shadow");
        prev.style.removeProperty("opacity");
    });

    if (peakPercent <= 0) return; // No peak to draw

    const idx = Math.max(0, Math.min(segments.length - 1, Math.round((peakPercent / 100) * segments.length) - 1));
    const seg = segments[idx];
    if (!seg) return;

    seg.classList.add("peak-flag");

    let peakColor = "";
    if (meterId && (meterId.includes("left") || meterId.includes("right"))) {
        peakColor = PeakMode === "fixed" ? PeakColorFixed : getStereoColorForPercent(peakPercent, segments.length);
    } else if (meterId && meterId.includes("mpx")) {
        peakColor = getMpxColorForIndex(idx, segments.length);
    }

    if (peakColor) {
        seg.style.setProperty("background-color", peakColor, "important");
    }
}

    // ==========================================================
    // DOM creation
    // ==========================================================
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

        if (id.includes("left") || id.includes("right") || id.includes("mpx")) {
            const marker = document.createElement("div");
            marker.className = "peak-marker";
            meterBar.appendChild(marker);
        }

        const labelElement = document.createElement("div");
        labelElement.classList.add("label");
        labelElement.innerText = label;

        const meterWrapper = document.createElement("div");
        meterWrapper.classList.add("meter-wrapper");

        const valueDisplay = document.createElement("div");
        valueDisplay.classList.add("value-display");
        valueDisplay.innerText = "0.0";
        meterWrapper.appendChild(valueDisplay);

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

    // ==========================================================
    // Main update function - SYNCHRONIZED
    // ==========================================================
    function updateMeter(meterId, level, rawValueOverride = null) {
        const baseId = meterId;
        const targets = [];

        // 1. Standard module ID
        const el1 = document.getElementById(baseId);
        if (el1) targets.push(el1);

        // 2. Combo layout ID
        const el2 = document.getElementById(`mm-combo-${baseId}`);
        if (el2 && el2 !== el1) targets.push(el2);

        // 3. Scope layout ID
        const el3 = document.getElementById(`mm-scope-${baseId}`);
        if (el3 && el3 !== el1 && el3 !== el2) targets.push(el3);

        if (!targets.length) return;

        const safeLevel = Math.max(0, Math.min(100, Number(level) || 0));

        // Update Central Peak Store FIRST (before rendering any UI)
        if (meterId.includes("left")) updatePeakValue("left", safeLevel);
        else if (meterId.includes("right")) updatePeakValue("right", safeLevel);
        else if (meterId.includes("mpx")) updatePeakValue("mpx", safeLevel);

        // Pre-calculate text value once for all targets to ensure consistency
        let sharedText = "-";
        const rdsDisabled  = meterId.includes("rds")          && !RDS_ENABLED;
        const pilotDisabled = meterId.includes("stereo-pilot") && !PILOT_ENABLED;
        const mpxDisabled  = meterId.includes("mpx")          && !MPX_ENABLED;

        // MPX/RDS/Pilot update slower (1000 ms), audio meters update fast (50 ms)
        const isSlowUpdate = meterId.includes("mpx") || meterId.includes("rds") || meterId.includes("stereo-pilot");
        const updateInterval = isSlowUpdate ? 1000 : 50;
        const now = Date.now();

        if (!rdsDisabled && !pilotDisabled && !mpxDisabled) {
            if (meterId.includes("left")) {
                const dB = (peaks.left.value / 100) * 31 - 26;
                sharedText = dB.toFixed(1);
            } else if (meterId.includes("right")) {
                const dB = (peaks.right.value / 100) * 31 - 26;
                sharedText = dB.toFixed(1);
            } else if (meterId.includes("hf")) {
                let syncText = null;

                // Read the actual HTML text elements of the large SignalMeter directly
                const mainSpan = document.querySelector('[data-mm-signal="main"]')  || document.getElementById("data-signal");
                const decSpan  = document.querySelector('[data-mm-signal="decimal"]') || document.getElementById("data-signal-decimal");

                // If the large display is active and visible, concatenate the text
                if (mainSpan && mainSpan.innerText && mainSpan.innerText.trim() !== "-" && mainSpan.innerText.trim() !== "") {
                    syncText = mainSpan.innerText + (decSpan && decSpan.innerText ? decSpan.innerText : "");
                }

                // Use live display text if available; fall back to percentage calculation otherwise
                if (syncText) {
                    sharedText = syncText;
                } else {
                    const dBuV_from_percent = (safeLevel / 100) * 90;
                    const baseHF = dBuV_from_percent + 10.875;
                    sharedText = hfBaseToDisplay(baseHF).toFixed(1);
                }
            } else if (meterId.includes("stereo-pilot")) {
                sharedText = rawValueOverride !== null ? rawValueOverride.toFixed(1) : ((safeLevel / 100) * 16.0).toFixed(1);
            } else if (meterId.includes("rds")) {
                sharedText = rawValueOverride !== null ? rawValueOverride.toFixed(1) : ((safeLevel / 100) * 16.0).toFixed(1);
            } else if (meterId.includes("mpx")) {
                sharedText = rawValueOverride !== null ? rawValueOverride.toFixed(1) : ((safeLevel / 100) * 120.0).toFixed(1);
            } else {
                sharedText = safeLevel.toFixed(1);
            }
        }

        const cDanger  = parseRgb(MeterColorDanger);
        const cSafe    = parseRgb(MeterColorSafe);
        const cWarning = parseRgb(MeterColorWarning);

        // Render all targets
        targets.forEach((meter) => {
            const segments = meter.querySelectorAll(".segment");
            const activeCount = Math.round((safeLevel / 100) * segments.length);

            // FIX: Clear ALL existing peak-flags on this meter BEFORE the render loop.
            // This prevents ghost peaks caused by the old "skip if peak-flag" guard
            // which left stale colored segments behind when the peak marker moved.
            meter.querySelectorAll(".segment.peak-flag").forEach((prev) => {
                prev.classList.remove("peak-flag");
                prev.style.removeProperty("background-color");
                prev.style.removeProperty("box-shadow");
                prev.style.removeProperty("opacity");
            });

            // Bar Segments
            segments.forEach((seg, i) => {
                if (rdsDisabled || pilotDisabled || mpxDisabled) {
                    seg.style.setProperty("background-color", "#333", "important");
                    return;
                }
                // NOTE: the old "if peak-flag → return" guard has been removed.
                // Peak flags are now cleared above before this loop runs, so every
                // segment is always redrawn correctly on each frame.

                let finalColor = "#333";
                if (i < activeCount) {
                    if (meterId.includes("left") || meterId.includes("right")) {
                        // Top 5 segments = red zone (0 dB to +5 dB)
                        if (i >= segments.length - 5) finalColor = getScaledColor(cDanger, 1.0);
                        else finalColor = getScaledColor(cSafe, 0.4 + ((i / segments.length) * 0.4));
                    } else if (meterId.includes("stereo-pilot")) {
                        if (i < segments.length * 0.5)
                            finalColor = applyIntensity(cSafe,   0.4 + (i / (segments.length * 0.5)) * 0.4);
                        else
                            finalColor = applyIntensity(cDanger, 0.6 + (0.4 * ((i - segments.length * 0.5) / (segments.length * 0.5))));
                    } else if (meterId.includes("rds")) {
                        const idx1 = Math.round((2.5 / 16) * segments.length);
                        const idx2 = Math.round((3.5 / 16) * segments.length);
                        if (i < idx1)       finalColor = applyIntensity(cSafe,    0.4 + (i / idx1) * 0.4);
                        else if (i <= idx2) finalColor = applyIntensity(cWarning, 1.0);
                        else                finalColor = applyIntensity(cDanger,  0.6 + (0.4 * ((i - idx2) / (segments.length - idx2))));
                    } else if (meterId.includes("mpx")) {
                        finalColor = getMpxColorForIndex(i, segments.length);
                    } else if (meterId.includes("hf")) {
                        const hfIdx = Math.round((20 / 90) * segments.length);
                        if (i < hfIdx) finalColor = applyIntensity(cDanger, 0.6 + (0.4 * (i / hfIdx)));
                        else           finalColor = applyIntensity(cSafe,   0.4 + ((i / segments.length) * 0.4));
                    } else {
                        if      (i < segments.length * 0.6) finalColor = applyIntensity(cSafe,    1.0);
                        else if (i < segments.length * 0.8) finalColor = applyIntensity(cWarning, 1.0);
                        else                                finalColor = applyIntensity(cDanger,  1.0);
                    }
                }
                seg.style.setProperty("background-color", finalColor, "important");
            });

            // Draw peak flags AFTER the bar loop (so they always sit on top of bar colors)
            if      (meterId.includes("left"))  setPeakSegment(meter, peaks.left.value,  meterId);
            else if (meterId.includes("right")) setPeakSegment(meter, peaks.right.value, meterId);
            else if (meterId.includes("mpx"))   setPeakSegment(meter, peaks.mpx.value,   meterId);

            // Throttled text value update
            const wrapper = meter.closest(".meter-wrapper");
            if (wrapper) {
                const valDisp = wrapper.querySelector(".value-display");
                if (valDisp) {
                    const lastUpdate = parseInt(valDisp.getAttribute("data-last-update") || "0");
                    if (now - lastUpdate > updateInterval) {
                        valDisp.innerText = sharedText;
                        valDisp.setAttribute("data-last-update", now);
                    }
                }
            }
        });
    }

    // ==========================================================
    // MPX data handling
    // ==========================================================
    function handleMpxArray(data) {
        if (!data || (!Array.isArray(data) && !(data instanceof Float32Array) && !(data instanceof Uint8Array))) {
            return;
        }

        const mags = [];
        const dataLen = data.length;

        for (let i = 0; i < dataLen; i++) {
            const item = data[i];
            let mag = 0;

            if (typeof item === "number") {
                mag = item;
            } else if (item && typeof item === "object") {
                if (typeof item.m === "number") mag = item.m;
                else if (typeof item.mag === "number") mag = item.mag;
                else if (Array.isArray(item) && typeof item[0] === "number") {
                    const re = item[0], im = item[1];
                    mag = Math.sqrt(re * re + im * im);
                }
            }

            if (!isFinite(mag) || mag < 0) mag = 0;
            mags.push(mag);
        }

        const arr = [];
        for (let i = 0; i < mags.length; i++) {
            let db = 20 * Math.log10(mags[i] + 1e-15);
            if (db < MPX_DB_MIN) db = MPX_DB_MIN;
            if (db > MPX_DB_MAX) db = MPX_DB_MAX;
            arr.push(db);
        }

        if (mpxSmoothSpectrum.length === 0) {
            mpxSmoothSpectrum = arr.slice();
        } else {
            const len = Math.min(arr.length, mpxSmoothSpectrum.length);
            for (let i = 0; i < len; i++) {
                mpxSmoothSpectrum[i] = (mpxSmoothSpectrum[i] * (MPX_AVG - 1) + arr[i]) / MPX_AVG;
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

    // ==========================================================
    // RDS logic
    // ==========================================================
    function updateRdsFromSpectrum() {
        if (!RDS_ENABLED) {
            updateMeter("rds-meter", 0, 0);
            levels.rds = 0;
            rdsDisplayValue = 0;
            return;
        }

        let devKHz = websocketRdsActive ? rdsPeakVal : 0;
        if (devKHz < 0) devKHz = 0;

        rdsDisplayValue = rdsDisplayValue * 0.8 + devKHz * 0.2;
        if (rdsDisplayValue < 0.1) rdsDisplayValue = 0;

        const RDS_SCALE_MAX_KHZ = 16.0;
        let percent = Math.max(0, Math.min(100, (rdsDisplayValue / RDS_SCALE_MAX_KHZ) * 100));

        updateMeter("rds-meter", percent, rdsDisplayValue);
        levels.rds = percent;
    }

    // ==========================================================
    // Pilot logic
    // ==========================================================
    function updatePilotFromSpectrum() {
        if (!PILOT_ENABLED) {
            pilotDisplayValue = 0;
            levels.stereoPilot = 0;
            updateMeter("stereo-pilot-meter", 0, 0);
            return;
        }

        let devKHz = pilotPeakVal;
        if (devKHz < 0) devKHz = 0;

        pilotDisplayValue = pilotDisplayValue * 0.8 + devKHz * 0.2;
        if (pilotDisplayValue < 0.1) pilotDisplayValue = 0;

        const PILOT_SCALE_MAX_KHZ = 16.0;
        let percent = (pilotDisplayValue / PILOT_SCALE_MAX_KHZ) * 100;
        percent = Math.max(0, Math.min(100, percent));

        levels.stereoPilot = percent;
        updateMeter("stereo-pilot-meter", percent, pilotDisplayValue);
    }

    // ==========================================================
    // MPX total logic (with gate delay)
    // ==========================================================
    function updateMpxTotalFromSpectrum() {
        if (!MPX_ENABLED) {
            mpxDisplayValue = 0;
            levels.mpxTotal = 0;
            updateMeter("mpx-meter", 0, 0);
            return;
        }

        const isSignalConditionMet = pilotDisplayValue > 6.0 || websocketRdsActive;
        if (isSignalConditionMet) {
            if (mpxGateDelayTimer < MPX_GATE_CONFIRMATION_FRAMES) mpxGateDelayTimer++;
        } else {
            mpxGateDelayTimer = 0;
        }

        const isGateOpen = mpxGateDelayTimer >= MPX_GATE_CONFIRMATION_FRAMES;
        const currentMpxValue = isGateOpen ? mpxPeakVal : 0;

        mpxDisplayValue = mpxDisplayValue * 0.8 + currentMpxValue * 0.2;
        if (mpxDisplayValue < 0.1) mpxDisplayValue = 0;

        const percent = Math.min(100, Math.max(0, (mpxDisplayValue / 120) * 100));
        levels.mpxTotal = percent;

        updateMeter("mpx-meter", percent, mpxDisplayValue);
    }

    // ==========================================================
    // Audio setup & animation (ROBUST VERSION)
    // ==========================================================
    
    // Logarithmic dB scale parameters for the UI Meter
    // Scale goes from +5dB down to -26dB (Total range: 31dB)
    const METER_MAX_DB = 5;
    const METER_MIN_DB = -26;
    const METER_RANGE = METER_MAX_DB - METER_MIN_DB;

    // Convert digital peak amplitude to dBFS, then map to 0-100% based on our custom scale
    function amplitudeToMeterPercent(amplitude) {
        // Prevent log(0) calculation error
        if (amplitude < 0.00001) return 0;
        
        const linear = amplitude * StereoBoost;
        
        // Calculate physically accurate decibel value (dBFS)
        const db = 20 * Math.log10(linear);

        // Map to the 0-100% visual scale range (+5 dB to -26 dB)
        if (db <= METER_MIN_DB) return 0;
        if (db >= METER_MAX_DB) return 100;

        return ((db - METER_MIN_DB) / METER_RANGE) * 100;
    }

    function setupAudioMeters() {
        if (
            typeof Stream === "undefined" ||
            !Stream ||
            !Stream.Fallback ||
            !Stream.Fallback.Player ||
            !Stream.Fallback.Player.Amplification
        ) {
            // Not ready yet - loop will check again
            return;
        }

        const player = Stream.Fallback.Player;
        const sourceNode = player.Amplification;

        if (!sourceNode || !sourceNode.context) return;

        try {
            const ctx = sourceNode.context;

            // 1. Context Changed? -> Reset Everything
            if (stereoAudioContext !== ctx) {
                stereoAudioContext = ctx;
                stereoSourceNode = null;
                stereoSplitter = null;
                stereoAnalyserL = null;
                stereoAnalyserR = null;
                stereoDataL = null;
                stereoDataR = null;
                
                // Reset smoothing arrays when context resets
                smoothedLevelL = 0;
                smoothedLevelR = 0;
            }

            // 2. Ensure Analysers exist - Switch to 32-bit floats
            if (!stereoAnalyserL) {
                stereoAnalyserL = stereoAudioContext.createAnalyser();
                stereoAnalyserR = stereoAudioContext.createAnalyser();

                stereoAnalyserL.fftSize = 2048;
                stereoAnalyserR.fftSize = 2048;

                // Create Float32Arrays instead of Uint8Arrays to eliminate quantization
                stereoDataL = new Float32Array(stereoAnalyserL.fftSize);
                stereoDataR = new Float32Array(stereoAnalyserR.fftSize);
            }

            // 3. Source Connection Logic
            if (stereoSourceNode !== sourceNode) {
                stereoSourceNode = sourceNode;

                if (!stereoSplitter) {
                    stereoSplitter = stereoAudioContext.createChannelSplitter(2);
                    try { stereoSplitter.connect(stereoAnalyserL, 0); } catch(e){}
                    try { stereoSplitter.connect(stereoAnalyserR, 1); } catch(e){}
                }

                try {
                    stereoSourceNode.connect(stereoSplitter);
                } catch(e) {
                    if (e.name !== 'InvalidAccessError') {
                        console.warn("[MetricsMeters] Connect Error:", e);
                    }
                }
            }

            // 4. Ensure Loop is running
            if (!stereoAnimationId) {
                startStereoAnimation();
            }

        } catch (e) {
            console.error("[MetricsMeters] Audio Setup Fatal Error", e);
        }
    }

    function startStereoAnimation() {
        if (stereoAnimationId) cancelAnimationFrame(stereoAnimationId);

        const loop = () => {
            if (stereoAudioContext && stereoAudioContext.state === 'suspended') {
                stereoAnimationId = requestAnimationFrame(loop);
                return;
            }

            if (!stereoAnalyserL || !stereoAnalyserR) {
                stereoAnimationId = requestAnimationFrame(loop);
                return;
            }

            // Ensure the Float32Arrays exist and match the analysers
            if (!stereoDataL || stereoDataL.length !== stereoAnalyserL.fftSize) {
                stereoDataL = new Float32Array(stereoAnalyserL.fftSize);
                stereoDataR = new Float32Array(stereoAnalyserR.fftSize);
            }

            // High Precision 32-bit Float Audio Capture
            stereoAnalyserL.getFloatTimeDomainData(stereoDataL);
            stereoAnalyserR.getFloatTimeDomainData(stereoDataR);

            let maxL = 0;
            let maxR = 0;

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

            updateMeter("left-meter", levelL);
            updateMeter("right-meter", levelR);

            stereoAnimationId = requestAnimationFrame(loop);
        };

        stereoAnimationId = requestAnimationFrame(loop);
    }

    // ==========================================================
    // WebSocket setup with auto-reconnect
    // ==========================================================
    // WebSocket setup (shared hub)
    // ==========================================================
    function setupMetricsWebSocket() {
        if (metersHubUnsubscribe) return;

        metersHubUnsubscribe = window.MetricsMpxHub.subscribe((message) => {
            if (!message || typeof message !== "object") return;
            const type = message.type ? String(message.type).toLowerCase() : "";
            if (type === "mpx") {
                if (typeof message.peak === "number") {
                    mpxPeakVal = message.peak;
                    pilotPeakVal = (typeof message.pilotKHz === "number") ? message.pilotKHz : 0;
                    rdsPeakVal = (typeof message.rdsKHz === "number") ? message.rdsKHz : 0;
                }
                handleMpxArray(message.value);
            }
        });

        if (metersHeartbeatInterval) clearInterval(metersHeartbeatInterval);
        metersHeartbeatInterval = setInterval(() => {
            if (metersActive) window.MetricsMpxHub.send({ type: "meters_heartbeat" });
        }, 3000);
    }

    function closeMetricsWebSocket() {
        if (metersHeartbeatInterval) { clearInterval(metersHeartbeatInterval); metersHeartbeatInterval = null; }
        if (metersHubUnsubscribe) { metersHubUnsubscribe(); metersHubUnsubscribe = null; }
    }

    // ==========================================================
    // Initialization
    // ==========================================================
    function initMeters(levelMeterContainer) {
        if (window.MetricsMeters && typeof window.MetricsMeters.resetValues === "function") {
            window.MetricsMeters.resetValues();
        }

        const container = levelMeterContainer;
        if (!container) return;

        container.innerHTML = "";

        const stereoGroup = document.createElement("div");
        stereoGroup.classList.add("stereo-group");

        createLevelMeter("left-meter", "LEFT", stereoGroup, scales.left);
        createLevelMeter("right-meter", "RIGHT", stereoGroup, scales.right);

        container.appendChild(stereoGroup);

        const hfScale = buildHFScale(hfUnit);
        createLevelMeter("hf-meter", "RF", container, hfScale);

        const hfLevelMeter = container.querySelector("#hf-meter")?.closest(".level-meter");
        if (hfLevelMeter) {
            hfLevelMeter.style.transform = "translateX(0px)";
        }

        createLevelMeter("stereo-pilot-meter", "PILOT", container, scales.stereoPilot);
        createLevelMeter("mpx-meter", "MPX", container, scales.mpx);
        createLevelMeter("rds-meter", "RDS", container, scales.rds);

        const pilotMeterEl = container.querySelector("#stereo-pilot-meter")?.closest(".level-meter");
        if (pilotMeterEl && !PILOT_ENABLED) pilotMeterEl.style.opacity = "0.4";

        const rdsMeterEl = container.querySelector("#rds-meter")?.closest(".level-meter");
        if (rdsMeterEl && !RDS_ENABLED) rdsMeterEl.style.opacity = "0.4";

        const mpxMeterEl = container.querySelector("#mpx-meter")?.closest(".level-meter");
        if (mpxMeterEl && !MPX_ENABLED) mpxMeterEl.style.opacity = "0.4";

        updateMeter("left-meter", levels.left || 0);
        updateMeter("right-meter", levels.right || 0);
        updateMeter("hf-meter", levels.hf || 0);
        updateMeter("stereo-pilot-meter", levels.stereoPilot || 0);
        updateMeter("mpx-meter", levels.mpxTotal || 0);
        updateMeter("rds-meter", levels.rds || 0);

        setupMetricsWebSocket();

        // Immediate first try
        setupAudioMeters();

        // Clear existing interval if present
        if (stereoSetupIntervalId) clearInterval(stereoSetupIntervalId);
        
        // Start robust checking loop (1000ms like in Audiometer/SignalMeter)
        stereoSetupIntervalId = setInterval(setupAudioMeters, 1000);

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

    // Auto-init: decoupled from module sequence so it loads as long as the container exists
    document.addEventListener("DOMContentLoaded", () => {
        const container = document.getElementById("level-meter-container");
        if (container) initMeters(container);
    });

    // ==========================================================
    // Public API
    // ==========================================================
    window.MetricsMeters = {
        levels,
        updateMeter,
        initMeters,
        cleanup: closeMetricsWebSocket,
        createWebSocket: setupMetricsWebSocket,

        setActive(active) {
            metersActive = !!active;
            if (metersActive) window.MetricsMpxHub.send({ type: "meters_heartbeat" });
        },
        startAnimation: () => {
            if(!stereoAnimationId) startStereoAnimation();
        },

        resetValues() {
            mpxDisplayValue = 0;
            rdsDisplayValue = 0;
            pilotDisplayValue = 0;

            levels.mpxTotal = 0;
            levels.stereoPilot = 0;
            levels.rds = 0;

            mpxPeakVal = 0;
            pilotPeakVal = 0;
            rdsPeakVal = 0;

            mpxGateDelayTimer = 0;

            peaks.mpx.value = 0;
            peaks.left.value = 0;
            peaks.right.value = 0;
        },

        setRdsStatus(isActive) {
            websocketRdsActive = !!isActive;
        },

        getStereoBoost() { return StereoBoost; },
        setStereoBoost(value) {},

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
            const scaleEl = levelMeter.querySelector(".meter-scale");
            if (!scaleEl) return;
            const newScale = buildHFScale(hfUnit);
            const ticks = scaleEl.querySelectorAll("div");
            newScale.forEach((txt, idx) => { if (ticks[idx]) ticks[idx].innerText = txt; });
            if (typeof levels.hfBase === "number") {
                const displayHF = hfBaseToDisplay(levels.hfBase);
                levels.hfValue = displayHF;
            }
        }
    };
})();