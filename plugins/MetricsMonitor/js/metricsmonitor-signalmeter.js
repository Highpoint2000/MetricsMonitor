///////////////////////////////////////////////////////////////
//                                                           //
//  metricsmonitor-signalmeter.js                  (V2.8a)   //
//                                                           //
//  by Highpoint               last update: 11.05.2026       //
//                                                           //
//  Thanks for support by                                    //
//  Jeroen Platenkamp, Bkram, Wötkylä, AmateurAudioDude,     //
//  GOR and Bojcha                                           //
//                                                           //
//  https://github.com/Highpoint2000/metricsmonitor          //
//                                                           //
//                                                           //
///////////////////////////////////////////////////////////////

(() => {
const sampleRate = 192000;    // Do not touch - this value is automatically updated via the config file
const MPXmode = "auto";    // Do not touch - this value is automatically updated via the config file
const MPXStereoDecoder = "off";    // Do not touch - this value is automatically updated via the config file
const MPXInputCard = "Mikrofon (HD USB Audio Device)";    // Do not touch - this value is automatically updated via the config file
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
const ScopeInputCalibration = 4;    // Do not touch - this value is automatically updated via the config file
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
const MeterTiltCalibration = -900;    

const CONFIG = (window.MetricsMonitor && window.MetricsMonitor.Config) ? window.MetricsMonitor.Config : {};

  // -------------------------------------------------------
  // CSS FIXES FOR ZOOMING (Signal Meter specific)
  // -------------------------------------------------------
const style = document.createElement('style');
style.innerHTML = `
  .signal-meter-bar .segment {
    border-bottom: 1px solid rgba(0,0,0,0.8) !important;
    margin-bottom: 0 !important;
    box-sizing: border-box;
  }
  .signal-meter-bar .segment.peak-flag {
    z-index: 10;
    box-shadow: 0 0 4px rgba(255, 255, 255, 0.4);
  }
`;
document.head.appendChild(style);

  // -------------------------------------------------------
  // Utility Functions
  // -------------------------------------------------------
  const HUB_KEY = '__MM_SIGNALMETER_HUB__';
  const cssEscape = (s) => {
    try {
      if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(String(s));
    } catch {}
    return String(s).replace(/[^a-zA-Z0-9_\-]/g, '\\$&');
  };
  const uid = (prefix = 'mm-sigm-') => `${prefix}${Math.random().toString(36).slice(2, 10)}`;

  // --- COLOR HELPERS ---
  function parseRgb(rgbStr) {
    const match = rgbStr.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (match) {
      return { r: parseInt(match[1]), g: parseInt(match[2]), b: parseInt(match[3]) };
    }
    return { r: 0, g: 255, b: 0 };
  }

  function applyIntensity(colorObj, intensity) {
    const r = Math.min(255, Math.round(colorObj.r * intensity));
    const g = Math.min(255, Math.round(colorObj.g * intensity));
    const b = Math.min(255, Math.round(colorObj.b * intensity));
    return `rgb(${r},${g},${b})`;
  }

  // --- MP COLOR LOGIC ---
  function mpColorForIndex(i, totalSegments) {
    const cSafe = parseRgb(MeterColorSafe);
    const cWarning = parseRgb(MeterColorWarning);
    const cDanger = parseRgb(MeterColorDanger);

    const idxYellowStart = Math.round((10 / 100) * totalSegments);
    const idxRedStart    = Math.round((30 / 100) * totalSegments);

    if (i < idxYellowStart) {
      const pos = i / Math.max(1, idxYellowStart - 1);
      return applyIntensity(cSafe, 0.45 + (0.3 * pos));
    } else if (i < idxRedStart) {
      const pos = (i - idxYellowStart) / Math.max(1, idxRedStart - idxYellowStart);
      return applyIntensity(cWarning, 0.6 + (0.4 * pos));
    } else {
      const pos = (i - idxRedStart) / Math.max(1, totalSegments - idxRedStart);
      return applyIntensity(cDanger, 0.6 + (0.4 * pos));
    }
  }

  // -------------------------------------------------------
  // Unit Conversion
  // -------------------------------------------------------
  function hfBaseToDisplay(unit, baseHF) {
    const ssu = (unit || '').toLowerCase();
    const v = Number(baseHF);
    if (!isFinite(v)) return 0;
    if (ssu === 'dbuv' || ssu === 'dbµv' || ssu === 'dbμv') return v - 10.875;
    if (ssu === 'dbm') return v - 119.75;
    return v;
  }

  function formatUnit(unit) {
    const ssu = (unit || '').toLowerCase();
    if (ssu === 'dbm') return 'dBm';
    if (ssu === 'dbf') return 'dBf';
    return 'dBµV';
  }

  function hfPercentFromBase(baseHF) {
    const v = Number(baseHF);
    if (!isFinite(v)) return 0;
    let dBuV = v - 10.875;
    if (isNaN(dBuV)) dBuV = 0;
    return (Math.max(0, Math.min(90, dBuV)) / 90) * 100;
  }

  // -------------------------------------------------------
  // Multipath calculation
  // -------------------------------------------------------
  const MULTIPATH_SIGNAL_THRESHOLD_DBF = 25;
  const MULTIPATH_TIMEOUT_DURATION = 250;

  function smoothInterpolationMultipath(raw) {
    let isTefMode = true;
    if (window.MetricsMonitor && window.MetricsMonitor.Config && window.MetricsMonitor.Config.MultipathMode !== undefined) {
      isTefMode = (window.MetricsMonitor.Config.MultipathMode === 1);
    } else {
      isTefMode = (MultipathMode === 1);
    }
    const v = Number(raw);
    if (!isFinite(v)) return 0;
    if (!isTefMode) return Math.min(99, Math.max(0, parseInt(raw, 10)));
    if (v <= 3) return 0;
    if (v >= 40) return 99;
    return parseInt(Math.pow((v - 3) / (40 - 3), 1) * 99, 10);
  }

  // -------------------------------------------------------
  // Meter Drawing Helpers
  // -------------------------------------------------------
  function stereoColorForPercent(p, totalSegments = 30) {
    const i = Math.max(0, Math.min(totalSegments - 1, Math.round((p / 100) * totalSegments) - 1));
    const topBandStart = totalSegments - 5;
    const cDanger = parseRgb(MeterColorDanger);
    const cSafe   = parseRgb(MeterColorSafe);
    if (i >= topBandStart) return applyIntensity(cDanger, 0.8 + (0.2 * (i / totalSegments)));
    return applyIntensity(cSafe, 0.4 + ((i / totalSegments) * 0.6));
  }

  // -------------------------------------------------------
  // Peak value tracking
  // -------------------------------------------------------
  function updatePeakValue(peaks, channel, current, holdMs, smoothing, decayRate) {
    const p = peaks[channel];
    if (!p) return;

    if (current < 0) { p.value = -1; return; }

    const now = Date.now();
    if (p.lastUpdate === undefined) p.lastUpdate = now;

    let actualHoldMs  = holdMs;
    let actualDecay   = (typeof decayRate === 'number') ? decayRate : 2.5;

    if (channel === 'cci' || channel === 'aci') {
      actualHoldMs = 200;
      actualDecay  = 8.0;
    } else {
      actualDecay = 2.0;
    }

    if (current >= p.value) {
      p.value = current;
      p.lastUpdate = now;
    } else if (now - p.lastUpdate > actualHoldMs) {
      p.value = Math.max(current, p.value - actualDecay);
      if (p.value <= current + 0.5) p.value = current;
    }
  }

  // -------------------------------------------------------
  // setPeakSegment
  // -------------------------------------------------------
  function setPeakSegment(meterEl, peak, meterId) {
    const segments = meterEl.querySelectorAll('.segment');
    if (!segments.length) return;

    const prevAll = meterEl.querySelectorAll('.segment.peak-flag');
    prevAll.forEach((prev) => {
      prev.classList.remove('peak-flag');
      prev.style.removeProperty('background-color');
      prev.style.removeProperty('box-shadow');
      prev.style.removeProperty('opacity');
    });

    if (peak < 0) return;

    const idx = Math.max(0, Math.min(segments.length - 1,
      Math.round((peak / 100) * segments.length) - 1));
    const seg = segments[idx];
    if (!seg) return;

    seg.classList.add('peak-flag');

    let peakColor = '';
    if (PeakMode === 'fixed' && (meterId.includes('left') || meterId.includes('right'))) {
      peakColor = PeakColorFixed;
    } else if (meterId.includes('left') || meterId.includes('right')) {
      peakColor = stereoColorForPercent(peak, segments.length);
    } else if (meterId.includes('aci') || meterId.includes('cci')) {
      peakColor = mpColorForIndex(idx, segments.length);
    }

    if (peakColor) seg.style.setProperty('background-color', peakColor, 'important');
  }

  // -------------------------------------------------------
  // updateMeter
  // -------------------------------------------------------
  function updateMeter(meterId, level, root, peaks, peakCfg) {
    const meter = root
      ? root.querySelector(`#${cssEscape(meterId)}`)
      : document.getElementById(meterId);
    if (!meter) return;

    const isInvalid   = (level < 0);
    const safeLevel   = isInvalid ? 0 : Math.max(0, Math.min(100, Number(level) || 0));
    const segments    = meter.querySelectorAll('.segment');
    const activeCount = isInvalid ? 0 : Math.round((safeLevel / 100) * segments.length);

    const cDanger = parseRgb(MeterColorDanger);
    const cSafe   = parseRgb(MeterColorSafe);

    meter.querySelectorAll('.segment.peak-flag').forEach((prev) => {
      prev.classList.remove('peak-flag');
      prev.style.removeProperty('background-color');
      prev.style.removeProperty('box-shadow');
      prev.style.removeProperty('opacity');
    });

    segments.forEach((seg, i) => {
      let finalColor = '#333';
      if (i < activeCount) {
        if (meterId.includes('left') || meterId.includes('right')) {
          if (i >= segments.length - 5) {
            finalColor = applyIntensity(cDanger, 0.8 + (0.2 * (i / segments.length)));
          } else {
            finalColor = applyIntensity(cSafe, 0.4 + ((i / segments.length) * 0.6));
          }
        } else if (meterId.includes('aci') || meterId.includes('cci')) {
          finalColor = mpColorForIndex(i, segments.length);
        }
      }
      seg.style.setProperty('background-color', finalColor, 'important');
    });

    if (!peaks) return;

    const key = meterId.includes('left')  ? 'left'
              : meterId.includes('right') ? 'right'
              : meterId.includes('cci')   ? 'cci'
              : meterId.includes('aci')   ? 'aci'
              : null;

    if (key && peaks[key] !== undefined) {
      updatePeakValue(peaks, key, isInvalid ? -1 : safeLevel,
        peakCfg ? peakCfg.holdMs : 5000,
        peakCfg ? peakCfg.smoothing : 0.85,
        2.5);
      setPeakSegment(meter, peaks[key].value, meterId);
    }
  }

  // -------------------------------------------------------
  // Shared Hub
  // -------------------------------------------------------
  const METER_MAX_DB = 5;
  const METER_MIN_DB = -26;
  const METER_RANGE  = METER_MAX_DB - METER_MIN_DB;

  function amplitudeToMeterPercent(amplitude) {
    if (amplitude < 0.00001) return 0;
    const linear = amplitude * StereoBoost;
    const db = 20 * Math.log10(linear);
    if (db <= METER_MIN_DB) return 0;
    if (db >= METER_MAX_DB) return 100;
    return ((db - METER_MIN_DB) / METER_RANGE) * 100;
  }

  function createHub() {
    const hub = {
      socket: null,
      connected: false,
      connecting: null,
      msgListenerAttached: false,

      instances: new Map(),
      latestSigBase: null,
      latestMultipath: null,
      latestAci: null,
      latestCci: null,

      lastMultipathProcessTime: 0,
      prevFreq: 0,
      sigBuffer: [],

      unit: (window.MetricsMonitor && typeof window.MetricsMonitor.getSignalUnit === 'function')
        ? (window.MetricsMonitor.getSignalUnit() || 'dbf').toLowerCase()
        : (localStorage.getItem('mm_signal_unit') || 'dbf').toLowerCase(),

      sharedLevels: {
        hf: 0, hfValue: 0, hfBase: 0,
        left: 0, right: 0,
        mp: -1,
        aci: -1, cci: -1
      },

      ensureConnected() {
        if (this.connected) return Promise.resolve(this.socket);
        if (this.connecting) return this.connecting;

        this.connecting = (async () => {
          while (!window.socketPromise) {
            await new Promise(r => setTimeout(r, 400));
          }
          const ws = await window.socketPromise;
          if (!ws) return null;
          this.socket = ws;

          if (!this.msgListenerAttached) {
            this.msgListenerAttached = true;
            ws.addEventListener('message', (evt) => {
              try {
                const msg = JSON.parse(evt.data);

                if (msg && msg.sig !== undefined) {
                  this.broadcastSig(msg.sig);
                }

                if (msg && msg.sigRaw !== undefined) {
                  const now = Date.now();
                  let currentFreq = 0;
                  if (msg.freq !== undefined) {
                    currentFreq = Number(msg.freq);
                  } else {
                    const freqEl = document.getElementById('data-frequency');
                    if (freqEl) currentFreq = Number(freqEl.textContent);
                  }

                  if (currentFreq !== 0 && this.prevFreq !== currentFreq) {
                    this.prevFreq = currentFreq;
                    this.broadcastMultipath(NaN);
                    this.broadcastAciCci(-1, -1);
                    return;
                  }
                  this.prevFreq = currentFreq;

                  if (now - this.lastMultipathProcessTime < MULTIPATH_TIMEOUT_DURATION) return;
                  this.lastMultipathProcessTime = now;

                  const sigRawValues = msg.sigRaw.split(',');
                  if (sigRawValues.length >= 2) {
                    const parsedSig = parseInt(sigRawValues[0].slice(2), 10);
                    const rawMultipath = sigRawValues[1];
                    let mpPercent = smoothInterpolationMultipath(rawMultipath);
                    if (mpPercent > 99) mpPercent = 99;
                    if (parsedSig > MULTIPATH_SIGNAL_THRESHOLD_DBF) {
                      this.broadcastMultipath(mpPercent);
                    } else {
                      this.broadcastMultipath(NaN);
                    }
                    
                    // SignalGuard ACI & CCI Calculation
                    let rawCci = parseInt(sigRawValues[1], 10);
                    let rawAci = sigRawValues.length > 2 ? parseInt(sigRawValues[2], 10) : NaN;
                    
                    let cci = (rawCci >= 0 && rawCci <= 100) ? rawCci : -1;
                    let aci = (rawAci >= 0 && rawAci <= 100) ? rawAci : -1;

                    this.broadcastAciCci(aci, cci);
                  }
                }
              } catch {}
            });
          }

          this.connected = true;
          return ws;
        })().finally(() => {});
        return this.connecting;
      },

      broadcastSig(baseValue) {
        const v = Number(baseValue);
        if (!isFinite(v)) return;
        this.sigBuffer.push(v);
        if (this.sigBuffer.length > 8) this.sigBuffer.shift();
        const avg = this.sigBuffer.reduce((a, b) => a + b, 0) / this.sigBuffer.length;
        this.latestSigBase = avg;
        for (const inst of this.instances.values()) {
          try { inst._onSig(avg); } catch {}
        }
      },

      broadcastMultipath(val) {
        this.latestMultipath = (val === null) ? null : val;
        for (const inst of this.instances.values()) {
          try { inst._onMultipath(val); } catch {}
        }
      },

      broadcastAciCci(aci, cci) {
        this.latestAci = aci;
        this.latestCci = cci;
        for (const inst of this.instances.values()) {
          try { inst._onAciCci(aci, cci); } catch {}
        }
      },

      setUnit(unit) {
        if (!unit) return;
        this.unit = String(unit).toLowerCase();
        for (const inst of this.instances.values()) {
          try { inst._onUnit(this.unit); } catch {}
        }
      },

      audio: {
        ctx: null,
        sourceNode: null,
        splitter: null,
        analyserL: null,
        analyserR: null,
        dataL: null,
        dataR: null,
        rafId: null,
        setupIntervalId: null,
        subscribers: new Set(),
        smoothedLevelL: 0,
        smoothedLevelR: 0,
      },

      ensureAudio() {
        const A = this.audio;

        const trySetup = () => {
          if (
            typeof Stream === 'undefined' ||
            !Stream ||
            !Stream.Fallback ||
            !Stream.Fallback.Player ||
            !Stream.Fallback.Player.Amplification
          ) {
            return; 
          }

          const player    = Stream.Fallback.Player;
          const sourceNode = player.Amplification;
          if (!sourceNode || !sourceNode.context) return;

          try {
            const ctx = sourceNode.context;

            if (A.ctx !== ctx) {
              A.ctx          = ctx;
              A.splitter     = null;
              A.analyserL    = null;
              A.analyserR    = null;
              A.dataL        = null;
              A.dataR        = null;
              A.sourceNode   = null;
              A.smoothedLevelL = 0;
              A.smoothedLevelR = 0;
            }

            if (!A.analyserL || !A.dataL) {
              A.analyserL = ctx.createAnalyser();
              A.analyserR = ctx.createAnalyser();

              A.analyserL.fftSize = 4096;
              A.analyserR.fftSize = 4096;

              A.dataL = new Float32Array(A.analyserL.fftSize);
              A.dataR = new Float32Array(A.analyserR.fftSize);
            }

            if (A.sourceNode !== sourceNode) {
              A.sourceNode = sourceNode;

              if (!A.splitter) {
                A.splitter = ctx.createChannelSplitter(2);
                try { A.splitter.connect(A.analyserL, 0); } catch(e){}
                try { A.splitter.connect(A.analyserR, 1); } catch(e){}
              }

              try {
                A.sourceNode.connect(A.splitter);
              } catch(e) {
                if (e.name !== 'InvalidAccessError') console.warn('[SignalMeter] Audio Connect Error:', e);
              }
            }

            if (!A.rafId) {
              startAudioLoop(A, this);
            }

          } catch (e) {
            console.error('[SignalMeter] Audio Setup Error', e);
          }
        };

        if (!A.setupIntervalId) {
          A.setupIntervalId = setInterval(trySetup, 1000);
          trySetup();
        }
      }
    };

    return hub;
  }

  function startAudioLoop(A, hub) {
    if (A.rafId) cancelAnimationFrame(A.rafId);

    const loop = () => {
      if (A.ctx && A.ctx.state === 'suspended') {
        A.rafId = requestAnimationFrame(loop);
        return;
      }

      if (A.analyserL && A.analyserR && A.dataL && A.dataR) {
        if (A.dataL.length !== A.analyserL.fftSize) {
          A.dataL = new Float32Array(A.analyserL.fftSize);
          A.dataR = new Float32Array(A.analyserR.fftSize);
        }

        A.analyserL.getFloatTimeDomainData(A.dataL);
        A.analyserR.getFloatTimeDomainData(A.dataR);

        let maxL = 0;
        let maxR = 0;
        for (let i = 0; i < A.dataL.length; i++) {
          const absL = Math.abs(A.dataL[i]);
          if (absL > maxL) maxL = absL;
        }
        for (let i = 0; i < A.dataR.length; i++) {
          const absR = Math.abs(A.dataR[i]);
          if (absR > maxR) maxR = absR;
        }

        const rawL = amplitudeToMeterPercent(maxL);
        const rawR = amplitudeToMeterPercent(maxR);

        const attack = 0.8;
        const decay  = 0.6;

        A.smoothedLevelL += (rawL > A.smoothedLevelL)
          ? (rawL - A.smoothedLevelL) * attack
          : (rawL - A.smoothedLevelL) * decay;

        A.smoothedLevelR += (rawR > A.smoothedLevelR)
          ? (rawR - A.smoothedLevelR) * attack
          : (rawR - A.smoothedLevelR) * decay;

        const levelL = Math.min(100, Math.max(0, A.smoothedLevelL));
        const levelR = Math.min(100, Math.max(0, A.smoothedLevelR));

        hub.sharedLevels.left  = levelL;
        hub.sharedLevels.right = levelR;

        for (const inst of A.subscribers) {
          try { inst._onAudio(levelL, levelR); } catch {}
        }
      }

      A.rafId = requestAnimationFrame(loop);
    };

    A.rafId = requestAnimationFrame(loop);
  }

  const HUB = window[HUB_KEY] || (window[HUB_KEY] = createHub());

  if (!HUB._unitListenerAttached && window.MetricsMonitor && typeof window.MetricsMonitor.onSignalUnitChange === 'function') {
    HUB._unitListenerAttached = true;
    window.MetricsMonitor.onSignalUnitChange((u) => HUB.setUnit(u));
    try {
      if (window.MetricsMonitor.getSignalUnit) HUB.setUnit(window.MetricsMonitor.getSignalUnit());
    } catch {}
  }

  // -------------------------------------------------------
  // Meter DOM builder
  // -------------------------------------------------------
  function createLevelMeter(id, label, unitText, container, scaleValues) {
    const levelMeter = document.createElement('div');
    levelMeter.classList.add('signal-level-meter');

    const top = document.createElement('div');
    top.classList.add('meter-top');

    const meterBar = document.createElement('div');
    meterBar.classList.add('signal-meter-bar');
    meterBar.setAttribute('id', id);

    for (let i = 0; i < 30; i++) {
      const segment = document.createElement('div');
      segment.classList.add('segment');
      segment.style.backgroundColor = '#333';
      meterBar.appendChild(segment);
    }

    if (id.includes('left') || id.includes('right') || id.includes('cci') || id.includes('aci')) {
      const marker = document.createElement('div');
      marker.className = 'peak-marker';
      meterBar.appendChild(marker);
    }

    const labelElement = document.createElement('div');
    labelElement.classList.add('label');
    labelElement.innerText = label;

    const unitElement = document.createElement('div');
    unitElement.classList.add('unit-label');
    if (id.includes('aci')) unitElement.classList.add('hf-unit-label'); // Keep class for possible styling
    unitElement.innerText = unitText;

    const meterWrapper = document.createElement('div');
    meterWrapper.classList.add('meter-wrapper');
    if (id.includes('left'))  labelElement.classList.add('label-left');
    if (id.includes('right')) labelElement.classList.add('label-right');

    meterWrapper.appendChild(unitElement);
    meterWrapper.appendChild(meterBar);
    meterWrapper.appendChild(labelElement);

    if (scaleValues && scaleValues.length > 0) {
      const scale = document.createElement('div');
      scale.classList.add('signal-meter-scale');
      scaleValues.forEach((v) => {
        const tick = document.createElement('div');
        tick.innerText = v;
        scale.appendChild(tick);
      });
      top.appendChild(scale);
    }

    top.appendChild(meterWrapper);
    levelMeter.appendChild(top);
    container.appendChild(levelMeter);
  }

  // -------------------------------------------------------
  // Instance Factory
  // -------------------------------------------------------
  function createInstance(containerOrEl = 'level-meter-container', opts = {}) {
    const root = (typeof containerOrEl === 'string')
      ? document.getElementById(containerOrEl)
      : containerOrEl;
    if (!root) return null;

    const instanceKey  = String(opts.instanceKey || uid());
    const bindExisting = !!opts.bindExisting;
    const textOnly     = !!opts.textOnly;
    const useLegacyIds = opts.useLegacyIds !== undefined ? !!opts.useLegacyIds : true;
    const enableAudio  = opts.enableAudio  !== undefined ? !!opts.enableAudio  : (!textOnly);

    if (HUB.instances.has(instanceKey)) {
      try { HUB.instances.get(instanceKey).destroy(); } catch {}
      HUB.instances.delete(instanceKey);
    }

    const PEAK_CONFIG = { smoothing: 0.85, holdMs: 5000 };
    const peaks = {
      left:  { value: 0, lastUpdate: Date.now() },
      right: { value: 0, lastUpdate: Date.now() },
      aci:   { value: 0, lastUpdate: Date.now() },
      cci:   { value: 0, lastUpdate: Date.now() }
    };

    const state = {
      hfUnit: (HUB.unit || 'dbf').toLowerCase(),
      highestSignal: -Infinity,
      levels: {
        hf: 0, hfValue: 0, hfBase: 0, // Still kept correctly for text values
        left: 0, right: 0,
        mp: -1, multipath: null,
        aci: -1, cci: -1
      },
      ids: {
        left:  'left-meter',
        right: 'right-meter',
        aci:   'aci-meter', // Unique ID instead of clashing with hf-meter!
        cci:   'cci-meter'  // Unique ID instead of clashing with mp-meter!
      }
    };

    const dom = {
      root,
      elHighest:             null,
      elMain:                null,
      elDec:                 null,
      unitEls:               [],
      elMultipathContainer:  null,
      elMultipathValue:      null,
      meterExists:           false,
    };

    function bindTextElements() {
      dom.elHighest = root.querySelector('[data-mm-signal="highest"]') || root.querySelector('#data-signal-highest');
      dom.elMain    = root.querySelector('[data-mm-signal="main"]')    || root.querySelector('#data-signal');
      dom.elDec     = root.querySelector('[data-mm-signal="decimal"]') || root.querySelector('#data-signal-decimal');
      dom.unitEls   = Array.from(root.querySelectorAll('.signal-units'));

      dom.elMultipathContainer = root.querySelector('[data-mm-signal="multipath-container"]') || root.querySelector('#data-multipath-container');
      dom.elMultipathValue     = root.querySelector('[data-mm-signal="multipath-value"]')     || root.querySelector('#data-multipath-value');
    }

    function buildUiFull() {
      const idPrefix = useLegacyIds ? '' : `${instanceKey}-`;
      state.ids.left  = idPrefix + 'left-meter';
      state.ids.right = idPrefix + 'right-meter';
      state.ids.aci   = idPrefix + 'aci-meter';
      state.ids.cci   = idPrefix + 'cci-meter';

      root.innerHTML = '';

      // Stereo Group
      const stereoGroup = document.createElement('div');
      stereoGroup.classList.add('stereo-group');

      const stereoScale = ['+5', '0', '-5', '-10', '-15', '-20', '-26'];
      createLevelMeter(state.ids.left,  'LEFT',  'dB', stereoGroup, stereoScale);
      createLevelMeter(state.ids.right, 'RIGHT', 'dB', stereoGroup, []);
      root.appendChild(stereoGroup);

      // ACI Meter (Unique ID used here to avoid conflicts)
      const aciScale = ['100', '90', '80', '70', '60', '50', '40', '30', '20', '10', '0'];
      createLevelMeter(state.ids.aci, 'ACI', '%', root, aciScale);

      const aciLevelMeter = root.querySelector(`#${cssEscape(state.ids.aci)}`)?.closest('.signal-level-meter');
      if (aciLevelMeter) {
        aciLevelMeter.style.transform  = 'translateX(-10px)';
        aciLevelMeter.style.marginLeft = '15px';
      }

      // CCI Meter (Unique ID used here to avoid conflicts)
      const cciScale = ['100', '90', '80', '70', '60', '50', '40', '30', '20', '10', '0'];
      createLevelMeter(state.ids.cci, 'CCI', '%', root, cciScale);

      const cciLevelMeter = root.querySelector(`#${cssEscape(state.ids.cci)}`)?.closest('.signal-level-meter');
      if (cciLevelMeter) cciLevelMeter.style.transform = 'translateX(-5px)';

      // Signal Panel
      const signalPanel = document.createElement('div');
      signalPanel.className = 'panel-33 no-bg-phone signal-panel-layout';

      if (useLegacyIds) {
        signalPanel.innerHTML = `
          <div id="data-signal-values-wrapper" style="transition: transform 0.3s ease; width: 100%;">
            <h2 class="signal-heading" style="display: block !important;">SIGNAL</h2>
            <div class="text-small text-gray highest-signal-container">
              <i class="fa-solid fa-arrow-up"></i>
              <span id="data-signal-highest"></span>
              <span class="signal-units"></span>
            </div>
            <div class="text-big">
              <span id="data-signal"></span><!--
           --><span id="data-signal-decimal" class="text-medium-big" style="opacity:0.7;"></span>
              <span class="signal-units text-medium" style="position: relative; top: -7px;">dBf</span>
            </div>
          </div>
          <div id="data-multipath-container"
               style="display: none; position: relative; top: -2px; text-align: center; z-index: 10; transition: transform 0.3s ease; width: 100%;">
            <h2 class="signal-heading"
                style="display: inline-block; font-size: 15px; text-transform: none; letter-spacing: normal; margin: 0; padding: 0; border: none; vertical-align: baseline; transition: color 0.3s;">
              Multipath:
            </h2>
            <span id="data-multipath-value"
                  style="color: #ffffff; font-weight: normal; vertical-align: baseline; margin-left: 3px; font-size: 15px; transition: color 0.3s;">
            </span>
          </div>
        `;
      } else {
        signalPanel.innerHTML = `
          <div data-mm-signal="values-wrapper" style="transition: transform 0.3s ease; width: 100%;">
            <h2 class="signal-heading" style="display: block !important;">SIGNAL</h2>
            <div class="text-small text-gray highest-signal-container">
              <i class="fa-solid fa-arrow-up"></i>
              <span data-mm-signal="highest"></span>
              <span class="signal-units"></span>
            </div>
            <div class="text-big">
              <span data-mm-signal="main"></span><!--
           --><span data-mm-signal="decimal" class="text-medium-big" style="opacity:0.7;"></span>
              <span class="signal-units text-medium" style="position: relative; top: -7px;">dBf</span>
            </div>
          </div>
          <div data-mm-signal="multipath-container"
               style="display: none; position: relative; top: -2px; text-align: center; z-index: 10; transition: transform 0.3s ease; width: 100%;">
            <h2 class="signal-heading"
                style="display: inline-block; font-size: 15px; text-transform: none; letter-spacing: normal; margin: 0; padding: 0; border: none; vertical-align: baseline; transition: color 0.3s;">
              Multipath:
            </h2>
            <span data-mm-signal="multipath-value"
                  style="color: #ffffff; font-weight: normal; vertical-align: baseline; margin-left: 3px; font-size: 15px; transition: color 0.3s;">
            </span>
          </div>
        `;
      }
      root.appendChild(signalPanel);

      dom.meterExists = true;
      bindTextElements();
    }

    if (bindExisting) {
      bindTextElements();
      dom.meterExists = !!root.querySelector('.signal-meter-bar');
    } else if (!textOnly) {
      buildUiFull();
    } else {
      bindTextElements();
    }

    const instance = {
      key: instanceKey,
      root,
      opts: { bindExisting, textOnly, useLegacyIds, enableAudio },
      state,
      _destroyed: false,

      destroy() {
        this._destroyed = true;
        HUB.instances.delete(instanceKey);
        HUB.audio.subscribers.delete(instance);
      },

      _renderLoop() {
        if (this._destroyed) return;
        if (!dom.meterExists || textOnly) {
          requestAnimationFrame(() => this._renderLoop());
          return;
        }

        updateMeter(state.ids.aci, state.levels.aci, root, peaks, PEAK_CONFIG);
        updateMeter(state.ids.cci, state.levels.cci, root, peaks, PEAK_CONFIG);

        const decayOnly = (peakKey) => {
          if (peaks[peakKey] === undefined) return;
          updatePeakValue(
            peaks, peakKey,
            state.levels[peakKey] < 0 ? -1 : state.levels[peakKey],
            PEAK_CONFIG.holdMs, PEAK_CONFIG.smoothing, 2.0
          );
        };

        decayOnly('left');
        decayOnly('right');

        requestAnimationFrame(() => this._renderLoop());
      },

      _onUnit(unit) {
        state.hfUnit = String(unit || 'dbf').toLowerCase();
        state.highestSignal = -Infinity;

        if (dom.elHighest) dom.elHighest.textContent = '---';
        if (dom.unitEls && dom.unitEls.length) {
          dom.unitEls.forEach(span => { span.textContent = state.hfUnit; });
        }
        if (HUB.latestSigBase !== null) instance._onSig(HUB.latestSigBase);
      },

      _onSig(baseValue) {
        const correctedBase = Number(baseValue);
        if (!isFinite(correctedBase)) return;

        state.levels.hfBase  = correctedBase;
        const displayHF      = hfBaseToDisplay(state.hfUnit, correctedBase);
        state.levels.hfValue = displayHF;

        HUB.sharedLevels.hfBase  = correctedBase;
        HUB.sharedLevels.hfValue = displayHF;
        
        // Ensure proper RF signal tracking continues, so text sync works
        const percent         = hfPercentFromBase(correctedBase);
        state.levels.hf       = percent;
        HUB.sharedLevels.hf   = percent;

        if (displayHF > state.highestSignal) {
          state.highestSignal = displayHF;
          if (dom.elHighest) dom.elHighest.textContent = state.highestSignal.toFixed(1);
        }

        if (dom.elMain) {
          const parts = displayHF.toFixed(1).split('.');
          dom.elMain.textContent = parts[0];
          if (dom.elDec && parts[1]) dom.elDec.textContent = '.' + parts[1];
        }
      },

      _onMultipath(val) {
        state.levels.multipath = val;

        const wrapper = dom.root.querySelector('#data-signal-values-wrapper') ||
                        dom.root.querySelector('[data-mm-signal="values-wrapper"]');

        if (dom.elMultipathContainer && dom.elMultipathValue) {
          if (val === null) {
            dom.elMultipathContainer.style.display = 'none';
            if (wrapper) wrapper.style.transform = 'translateY(0px)';
            dom.elMultipathContainer.style.transform = 'translateY(0px)';
          } else {
            dom.elMultipathContainer.style.display = 'block';
            if (wrapper) wrapper.style.transform = 'translateY(-5px)';
            dom.elMultipathContainer.style.transform = 'translateY(-5px)';
            dom.elMultipathValue.textContent = Number.isNaN(val) ? '--%' : val.toFixed(0) + '%';
          }
        }
      },

      _onAciCci(aci, cci) {
        if (dom.meterExists && !textOnly) {
          const safeAci = (aci !== null && !Number.isNaN(aci)) ? aci : -1;
          const safeCci = (cci !== null && !Number.isNaN(cci)) ? cci : -1;
          
          state.levels.aci = safeAci;
          state.levels.cci = safeCci;
          HUB.sharedLevels.aci = safeAci;
          HUB.sharedLevels.cci = safeCci;
          
          updateMeter(state.ids.aci, safeAci, root, peaks, PEAK_CONFIG);
          updateMeter(state.ids.cci, safeCci, root, peaks, PEAK_CONFIG);
        }
      },

      _onAudio(levelL, levelR) {
        state.levels.left  = levelL;
        state.levels.right = levelR;

        updateMeter(state.ids.left,  levelL, root, peaks, PEAK_CONFIG);
        updateMeter(state.ids.right, levelR, root, peaks, PEAK_CONFIG);
      }
    };

    HUB.instances.set(instanceKey, instance);
    instance._onUnit(HUB.unit);

    if (enableAudio && !textOnly) {
      HUB.audio.subscribers.add(instance);
      HUB.ensureAudio();
    }

    if (opts.autoConnect !== false) HUB.ensureConnected();
    if (HUB.latestSigBase   !== null) instance._onSig(HUB.latestSigBase);
    if (HUB.latestMultipath !== null) instance._onMultipath(HUB.latestMultipath);
    if (HUB.latestAci !== null && HUB.latestCci !== null) instance._onAciCci(HUB.latestAci, HUB.latestCci);
    if (HUB.sharedLevels.left || HUB.sharedLevels.right) {
      instance._onAudio(HUB.sharedLevels.left, HUB.sharedLevels.right);
    }

    requestAnimationFrame(() => instance._renderLoop());

    return instance;
  }

  let defaultInstance = null;

  window.MetricsSignalMeter = {
    init(containerOrId = 'level-meter-container') {
      defaultInstance = createInstance(containerOrId, {
        instanceKey:   'panel',
        bindExisting:  false,
        textOnly:      false,
        useLegacyIds:  true,
        enableAudio:   true,
        autoConnect:   true
      });
      return defaultInstance;
    },

    createInstance,

    destroyInstance(instanceKey) {
      const key  = String(instanceKey || '');
      const inst = HUB.instances.get(key);
      if (inst) inst.destroy();
    },

    startDataListener() { HUB.ensureConnected(); },

    setHF(baseValue)    { HUB.broadcastSig(baseValue); },
    setHFUnit(unit)     { HUB.setUnit(unit); },

    levels: HUB.sharedLevels,

    updateMeter(meterId, level) {
      if (defaultInstance) {
        try {
          updateMeter(meterId, level, defaultInstance.root, null, null);
        } catch {}
      }
    }
  };

})();