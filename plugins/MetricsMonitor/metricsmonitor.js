/////////////////////////////////////////////////////////////////
//                                                             //
//  METRICSMONITOR CLIENT SCRIPT FOR FM-DX-WEBSERVER (V2.8b)   //
//                                                             //
//  by Highpoint               last update: 22.10.2026         //
//                                                             //
//  Thanks for support by                                      //
//  Jeroen Platenkamp, Bkram, Wötkylä, AmateurAudioDude        //
//  GOR and Bojcha                                             //
//                                                             //
//  https://github.com/Highpoint2000/metricsmonitor            //
//                                                             //
/////////////////////////////////////////////////////////////////

// Shared WebSocket hub, single connection used by all MetricsMonitor modules.
// Defined here so it exists before any module script executes.
window.MetricsMpxHub = (function() {
  var u = window.location;
  var port = u.port || (u.protocol === "https:" ? "443" : "80");
  var proto = u.protocol === "https:" ? "wss:" : "ws:";
  var WS_URL = proto + "//" + u.hostname + ":" + port + "/data_plugins";

  var ws = null;
  var reconnectTimer = null;
  var closing = false;
  var listeners = [];

  function connect() {
    if (closing) return;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    try {
      ws = new WebSocket(WS_URL);
      ws.onmessage = function(evt) {
        var msg;
        try { msg = JSON.parse(evt.data); } catch(e) { return; }
        if (!msg || typeof msg !== "object") return;
        for (var i = 0; i < listeners.length; i++) { try { listeners[i](msg); } catch(e) {} }
      };
      ws.onclose = function() { ws = null; if (!closing) reconnectTimer = setTimeout(connect, 2500); };
      ws.onerror = function() {};
    } catch(e) { reconnectTimer = setTimeout(connect, 2500); }
  }

  connect();

  return {
    subscribe: function(fn) {
      if (typeof fn !== "function") return function() {};
      listeners.push(fn);
      connect();
      return function() { var i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
    },
    send: function(data) {
      if (ws && ws.readyState === WebSocket.OPEN) try { ws.send(JSON.stringify(data)); } catch(e) {}
    },
    close: function() {
      closing = true;
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      if (ws) { try { ws.close(); } catch(e) {} ws = null; }
    },
    reopen: function() { closing = false; connect(); }
  };
}());

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

  const plugin_version = "2.8b";
  const updateInfo = true;

  const plugin_name = "MetricsMonitor";
  const plugin_path = "https://raw.githubusercontent.com/Highpoint2000/MetricsMonitor/";
  const plugin_JSfile = "main/plugins/MetricsMonitor/metricsmonitor.js";

  const CHECK_FOR_UPDATES = updateInfo;
  const pluginSetupOnlyNotify = true;
  const pluginName = plugin_name;
  const pluginHomepageUrl = "https://github.com/Highpoint2000/MetricsMonitor/releases";
  const pluginUpdateUrl = plugin_path + plugin_JSfile;

  const CONFIG = {
    MODULE_SEQUENCE: Array.isArray(MODULE_SEQUENCE) ? MODULE_SEQUENCE : [0],
    CANVAS_SEQUENCE: Array.isArray(CANVAS_SEQUENCE) ? CANVAS_SEQUENCE : [0],

    sampleRate,
    MeterInputCalibration,
    MPXmode,
    MPXStereoDecoder,
    MPXInputCard,
    MeterPilotCalibration,
    MeterMPXCalibration,
    MeterRDSCalibration,
    SpectrumYOffset,
    SpectrumYDynamics,
    StereoBoost,
    AudioMeterBoost,
    LockVolumeSlider,
    EnableAnalyzerAdminMode
  };

  let isTuneAuthenticated = false;
  function checkAdminMode() {
      if (!CONFIG.EnableAnalyzerAdminMode) { isTuneAuthenticated = true; return; }
      const bodyText = document.body.textContent || document.body.innerText;
      const isAdminLoggedIn =
          bodyText.includes("You are logged in as an administrator.") ||
          bodyText.includes("You are logged in as an adminstrator.");
      const canControlReceiver =
          bodyText.includes("You are logged in and can control the receiver.");
      isTuneAuthenticated = !!(isAdminLoggedIn || canControlReceiver);
  }
  checkAdminMode();

  function filterSequence(seq) {
      if (isTuneAuthenticated) return seq;
      return seq.filter(id => Number(id) !== 2 && Number(id) !== 5);
  }

  const FINAL_MODULE_SEQUENCE = filterSequence(CONFIG.MODULE_SEQUENCE);
  const FINAL_CANVAS_SEQUENCE = filterSequence(CONFIG.CANVAS_SEQUENCE);

  CONFIG.MODULE_SEQUENCE = FINAL_MODULE_SEQUENCE;
  CONFIG.CANVAS_SEQUENCE = FINAL_CANVAS_SEQUENCE;

  const NEED_CANVAS_2 = FINAL_CANVAS_SEQUENCE.some(v => Number(v) === 2);
  const NEED_CANVAS_4 = FINAL_CANVAS_SEQUENCE.some(v => Number(v) === 4);
  const NEED_CANVAS_5 = FINAL_CANVAS_SEQUENCE.some(v => Number(v) === 5);
  const HAS_SUPPORTED_CANVAS = NEED_CANVAS_2 || NEED_CANVAS_4 || NEED_CANVAS_5;

  const NEED_MODULE_0 = FINAL_MODULE_SEQUENCE.some(v => Number(v) === 0);
  const NEED_MODULE_1 = FINAL_MODULE_SEQUENCE.some(v => Number(v) === 1);
  const NEED_MODULE_2 = FINAL_MODULE_SEQUENCE.some(v => Number(v) === 2);
  const NEED_MODULE_3 = FINAL_MODULE_SEQUENCE.some(v => Number(v) === 3);
  const NEED_MODULE_4 = FINAL_MODULE_SEQUENCE.some(v => Number(v) === 4);
  const NEED_MODULE_5 = FINAL_MODULE_SEQUENCE.some(v => Number(v) === 5);

  const NEED_AudioMeter       = NEED_MODULE_0;
  const NEED_METERS          = NEED_MODULE_1 || NEED_CANVAS_2 || NEED_CANVAS_4 || NEED_CANVAS_5;
  const NEED_ANALYZER        = NEED_MODULE_2 || NEED_CANVAS_2;
  const NEED_SIGNAL_METER    = NEED_MODULE_3 || NEED_MODULE_4 || NEED_CANVAS_4;
  const NEED_SIGNAL_ANALYZER = NEED_MODULE_4 || NEED_CANVAS_4;
  const NEED_SCOPE           = NEED_MODULE_5 || NEED_CANVAS_5;

  window.MetricsMonitor = window.MetricsMonitor || {};
  window.MetricsMonitor.Config = CONFIG;

  window.MetricsMonitor._logBuffer = window.MetricsMonitor._logBuffer || [];
  const LOG_MAX_ENTRIES = 500;
  const LOG_PREFIX = "[MetricsMonitor]";

  function mmLog(level, message, obj) {
    const ts = new Date().toISOString();
    const entry = { ts, level, message, obj };
    window.MetricsMonitor._logBuffer.push(entry);
    if (window.MetricsMonitor._logBuffer.length > LOG_MAX_ENTRIES) window.MetricsMonitor._logBuffer.shift();

    const formatted = `${LOG_PREFIX} ${ts} - ${message}`;
    if (obj !== undefined) {
      if (level === "error") console.error(formatted, obj);
      else if (level === "warn") console.warn(formatted, obj);
      else console.log(formatted, obj);
    } else {
      if (level === "error") console.error(formatted);
      else if (level === "warn") console.warn(formatted);
      else console.log(formatted);
    }
  }

  window.MetricsMonitor.mmLog = mmLog;
  window.MetricsMonitor.getLogs = () => window.MetricsMonitor._logBuffer.slice();
  window.MetricsMonitor.clearLogs = () => { window.MetricsMonitor._logBuffer = []; mmLog("log", "Log buffer cleared"); };

  mmLog("log", `Logger initialized. Admin Mode: ${CONFIG.EnableAnalyzerAdminMode ? "Enabled" : "Disabled"}. Access: ${isTuneAuthenticated ? "Granted" : "Restricted"}`);

  let START_INDEX = 0;
  const ACTIVE_SEQUENCE = FINAL_MODULE_SEQUENCE.length > 0 ? FINAL_MODULE_SEQUENCE : [0];
  if (START_INDEX < 0 || START_INDEX >= ACTIVE_SEQUENCE.length) START_INDEX = 0;

  let mode = ACTIVE_SEQUENCE[START_INDEX];
  let modeIndex = START_INDEX;
  let isSwitching = false;

  let activeCanvasMode = null;
  let isCanvasVisible = false;

  function pickInitialCanvasMode() {
    if (FINAL_CANVAS_SEQUENCE.length === 0) return null;
    return Number(FINAL_CANVAS_SEQUENCE[0]);
  }

  let globalSignalUnit = localStorage.getItem("mm_signal_unit") || "dbf";
  let signalUnitListeners = [];

  window.MetricsMonitor.getSignalUnit = () => globalSignalUnit;
  window.MetricsMonitor.setSignalUnit = function (unit) {
    if (!unit) return;
    unit = unit.toLowerCase();
    mmLog("log", "SET SIGNAL UNIT → " + unit);
    globalSignalUnit = unit;
    localStorage.setItem("mm_signal_unit", unit);
    signalUnitListeners.forEach((fn) => fn(unit));
  };
  window.MetricsMonitor.onSignalUnitChange = function (fn) { if (typeof fn === "function") signalUnitListeners.push(fn); };

  function hookSignalUnitDropdown() {
    const input = document.getElementById("signal-selector-input");
    const options = document.querySelectorAll("#signal-selector .option");
    if (!input || options.length === 0) { setTimeout(hookSignalUnitDropdown, 500); return; }
    input.value = globalSignalUnit;
    window.MetricsMonitor.setSignalUnit(globalSignalUnit);
    options.forEach((opt) => {
      opt.addEventListener("click", () => {
        const val = opt.dataset.value?.toLowerCase();
        input.value = val;
        window.MetricsMonitor.setSignalUnit(val);
      });
    });
  }
  setTimeout(hookSignalUnitDropdown, 500);

  let BASE_URL = "";
  (function detectBase() {
    try {
      let s = document.currentScript;
      if (!s) {
        const list = document.getElementsByTagName("script");
        s = list[list.length - 1];
      }
      if (s && s.src) {
        const src = s.src.split("?")[0].split("#")[0];
        BASE_URL = src.substring(0, src.lastIndexOf("/") + 1);
      }
    } catch (e) { mmLog("error", "Base URL detection failed", e); }
  })();

  function url(file) { return BASE_URL + file.replace(/^\.\//, ""); }
  function loadCss(file) { const link = document.createElement("link"); link.rel = "stylesheet"; link.href = url(file); document.head.appendChild(link); }
  function loadScript(file) {
    return new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = url(file);
      el.async = false;
      el.onload = () => resolve();
      el.onerror = (err) => reject(err);
      document.head.appendChild(el);
    });
  }

  function buildMeters() {
    const meters = document.getElementById("level-meter-container");
    if (!meters) return;
    meters.innerHTML = "";
    mmLog("log", "MODE = " + mode);

    if (mode === 0) window.MetricsAudioMeter?.init("level-meter-container");
    else if (mode === 1) {
      if (window.MetricsMeters && typeof window.MetricsMeters.resetValues === "function") window.MetricsMeters.resetValues();
      window.MetricsMeters?.initMeters(meters);
    } else if (mode === 2) window.MetricsAnalyzer?.init("level-meter-container");
    else if (mode === 3) window.MetricsSignalMeter?.init("level-meter-container");
    else if (mode === 4) {
      window.MetricsSignalAnalyzer?.init("level-meter-container");
      if (window.MetricsSignalMeter && typeof window.MetricsSignalMeter.startDataListener === "function") window.MetricsSignalMeter.startDataListener();
    } else if (mode === 5) {
      window.MetricsScope?.init("level-meter-container");
    }
  }

function trackOutgoingTextCmd(cmd, source = "unknown") {
  const c = String(cmd || "").trim();
  if (c === "B0") lastAudioMonoState = false;
  else if (c === "B1") lastAudioMonoState = true;
  if (c === "B0" || c === "B1" || c === "B2") lastSentTextMode = c;
}

function patchTextSocketSend(ws) {
  if (!ws || ws._mmSendPatched) return;
  const origSend = ws.send.bind(ws);
  ws.send = (data) => {
    try {
      if (typeof data === "string") {
        const s = data.trim();
        if (s === "B0" || s === "B1" || s === "B2") trackOutgoingTextCmd(s, "ws.send");
      }
    } catch (e) {}
    return origSend(data);
  };
  ws._mmSendPatched = true;
  mmLog("log", "TextSocket.send patched for outgoing command tracking");
}

  let TextSocket = null;
  let textSocketReady = false;
  let liveStereoState = true;
  let liveStereoStateKnown = false;

  async function ensureTextSocket() {
    try {
      if (!window.socketPromise) return null;
      TextSocket = await window.socketPromise;
      if (!TextSocket) return null;

      if (!textSocketReady) {
        mmLog("log", "TextSocket available via socketPromise.");
        TextSocket.addEventListener("message", (evt) => {
          try {
            const msg = JSON.parse(evt.data);
            if (msg.st !== undefined) {
              liveStereoStateKnown = true;
              const newState = msg.st === true || msg.st === 1;
              if (liveStereoState !== newState) liveStereoState = newState;
            }
          } catch (e) {}
        });
        textSocketReady = true;
        patchTextSocketSend(TextSocket);
      }
      return TextSocket;
    } catch (err) {
      mmLog("error", "ensureTextSocket() failed", err);
      return null;
    }
  }

  async function sendTextWebSocketCommand(cmd) {
    const ws = await ensureTextSocket();
    if (!ws) { mmLog("error", `Cannot send "${cmd}" – no TextSocket.`); return; }
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(cmd);
        mmLog("log", `TextSocket → "${cmd}"`);
        if (window.MetricsHeader && typeof window.MetricsHeader.setMonoLockFromMode === "function") window.MetricsHeader.setMonoLockFromMode(cmd);
      } catch (err) { mmLog("error", "Failed sending command", { cmd, err }); }
    } else {
      setTimeout(() => sendTextWebSocketCommand(cmd), 300);
    }
  }

  let textModeInitialized = false;
  let lastSentTextMode = null;
  let lastAudioMonoState = null;

function getCurrentAudioStateIsMono() {
  if (window.MetricsHeader && typeof window.MetricsHeader.getStereoStatus === "function") return !window.MetricsHeader.getStereoStatus();
  if (textSocketReady && liveStereoStateKnown) return !liveStereoState;
  return false;
}

function syncTextWebSocketMode(isInitial) {
  if (syncTextWebSocketMode._restoreTimer) { clearTimeout(syncTextWebSocketMode._restoreTimer); syncTextWebSocketMode._restoreTimer = null; }

  let cmd = null;
  const moduleIsMPX = (mode === 1 || mode === 2 || mode === 5);
  const canvasIsMPX = ((activeCanvasMode === 2 || activeCanvasMode === 5) && isCanvasVisible);
  const needMPX = moduleIsMPX || canvasIsMPX;
  const restoreNormalCmd = () => (lastAudioMonoState === true ? "B1" : "B0");

  if (window.MetricsMeters && typeof window.MetricsMeters.setActive === "function") {
    window.MetricsMeters.setActive(moduleIsMPX);
  }

  mmLog("log", `syncTextWebSocketMode(init=${!!isInitial}, MPXmode=${CONFIG.MPXmode}, mode=${mode}, canvas=${activeCanvasMode}, needMPX=${needMPX}, lastSent=${lastSentTextMode}, lastMono=${lastAudioMonoState})`);

  if (CONFIG.MPXmode === "off") {
    if (!textModeInitialized && isInitial) cmd = "B0";
    else if (lastSentTextMode !== "B0") cmd = "B0";
    else return;
  } else if (CONFIG.MPXmode === "on") {
    if (lastSentTextMode !== "B2") cmd = "B2";
    else return;
  } else {
    if (needMPX) {
      if (lastSentTextMode !== "B2") cmd = "B2";
      else return;
    } else {
      if (!textModeInitialized && isInitial) { lastAudioMonoState = false; cmd = "B0"; }
      else if (lastSentTextMode === "B2") { cmd = restoreNormalCmd(); }
      else return;
    }
  }

  if (!cmd) return;

  if (cmd === "B2") {
    if (lastSentTextMode !== "B2") {
      if (lastSentTextMode === "B1") lastAudioMonoState = true;
      else if (lastSentTextMode === "B0") lastAudioMonoState = false;
      else lastAudioMonoState = !!getCurrentAudioStateIsMono();
    }
    sendTextWebSocketCommand("B2");
    textModeInitialized = true;
    return;
  }

  if (cmd === "B0" || cmd === "B1") {
    const delay = (lastSentTextMode === "B2") ? 80 : 0;
    syncTextWebSocketMode._restoreTimer = setTimeout(() => {
      sendTextWebSocketCommand(cmd);
      textModeInitialized = true;
      syncTextWebSocketMode._restoreTimer = null;
    }, delay);
  }
}

  function cleanupCurrentMode() {
    const mainContainerId = "level-meter-container";

    if (window.MetricsAnalyzer && window.MetricsAnalyzer.destroy) window.MetricsAnalyzer.destroy(mainContainerId);
    if (window.MetricsScope && window.MetricsScope.destroy) window.MetricsScope.destroy(mainContainerId);
    if (window.MetricsSignalAnalyzer && window.MetricsSignalAnalyzer.destroy) window.MetricsSignalAnalyzer.destroy(mainContainerId);

    if (isCanvasVisible) {
      if (window.MetricsMeters?.createWebSocket) {
        window.MetricsMeters.createWebSocket();
      }
      return;
    }

    if (mode === 1 && window.MetricsAnalyzer?.cleanup) window.MetricsAnalyzer.cleanup();
    if (mode === 2 && window.MetricsMeters?.cleanup) window.MetricsMeters.cleanup();
    if (mode !== 1 && mode !== 2) {
      if (window.MetricsAnalyzer?.cleanup) window.MetricsAnalyzer.cleanup();
      if (window.MetricsMeters?.cleanup) window.MetricsMeters.cleanup();
    }
    if (mode !== 5 && window.MetricsScope?.cleanup) window.MetricsScope.cleanup();
  }

  function switchModeWithFade(nextMode) {
    const meters = document.getElementById("level-meter-container");
    if (!meters) {
      cleanupCurrentMode();
      mode = nextMode;
      buildMeters();
      syncTextWebSocketMode(false);
      return;
    }
    if (isSwitching) return;

    const FADE_MS = 150;
    isSwitching = true;

    meters.style.transition = `opacity ${FADE_MS}ms ease-in-out`;
    if (!meters.style.opacity) meters.style.opacity = "1";
    void meters.offsetWidth;
    meters.style.opacity = "0";

    setTimeout(() => {
      cleanupCurrentMode();
      mode = nextMode;
      buildMeters();
      syncTextWebSocketMode(false);

      void meters.offsetWidth;
      meters.style.opacity = "1";
      setTimeout(() => { isSwitching = false; }, FADE_MS);
    }, FADE_MS);
  }

  function attachToggle() {
    const container = document.getElementById("level-meter-container");
    if (!container) return;
    if (ACTIVE_SEQUENCE.length <= 1) { container.style.cursor = "default"; return; }
    container.style.cursor = "pointer";
    container.addEventListener("click", () => {
      modeIndex = (modeIndex + 1) % ACTIVE_SEQUENCE.length;
      switchModeWithFade(ACTIVE_SEQUENCE[modeIndex]);
    });
  }

  function attachHotkeys() {
    document.addEventListener("keydown", (e) => {
      const tag = e.target && e.target.tagName ? e.target.tagName.toLowerCase() : "";
      if (tag === "input" || tag === "textarea" || e.target.isContentEditable) return;
      const n = parseInt(e.key, 10);
      if (!Number.isInteger(n) || n < 1 || n > 9) return;
      const idx = n - 1;
      if (idx >= ACTIVE_SEQUENCE.length) return;
      modeIndex = idx;
      switchModeWithFade(ACTIVE_SEQUENCE[modeIndex]);
    });
  }

  function lockVolumeControls(retry = 0) {
    if (!CONFIG.LockVolumeSlider) return;
    const MAX_RETRIES = 10;
    const slider = document.getElementById("volumeSlider");
    if (slider) { slider.value = "1"; slider.disabled = true; }
    else if (retry < MAX_RETRIES) setTimeout(() => lockVolumeControls(retry + 1), 500);

    if (window.Stream?.Fallback?.Player?.Amplification?.gain) {
      try { Stream.Fallback.Player.Amplification.gain.value = 1.0; } catch (e) {}
    } else if (retry < MAX_RETRIES) setTimeout(() => lockVolumeControls(retry + 1), 500);
  }

  let tooltipShownOnce = false;
  let tooltipTimeout;

  function insertPanel() {
    const panels = document.querySelectorAll(".flex-container .panel-33.no-bg-phone");
    if (panels.length < 3) return;

    const panel = panels[2];
    panel.id = "signalPanel";
    panel.innerHTML = "";
    panel.style.cssText =
      "position: relative; min-height: 235px; height: 235px; padding: 10px; display: flex; flex-direction: column; justify-content: flex-start; gap: 6px; margin-top: -90px; overflow: hidden; align-items: stretch;";

    const icons = document.createElement("div");
    icons.id = "signal-icons";
    icons.style.position = "absolute";
    panel.appendChild(icons);
    if (window.innerWidth < 800) icons.style.marginLeft = "14px";
    else icons.style.marginLeft = "-8px";

    if (window.MetricsHeader?.initHeader) MetricsHeader.initHeader(icons);

    const meters = document.createElement("div");
    meters.id = "level-meter-container";
    meters.style.opacity = "1";
    meters.style.marginTop = "25px";
    meters.style.width = "102%";
    panel.appendChild(meters);

    const allowModuleToggle = ACTIVE_SEQUENCE.length > 1;
    meters.style.cursor = allowModuleToggle ? "pointer" : "default";

    if (allowModuleToggle) {
      const customTooltip = document.createElement("div");
      const activeKeys = ACTIVE_SEQUENCE.map((val, index) => index + 1).join(",");
      customTooltip.textContent = "Click here or press a number " + activeKeys + " to change the display mode.";
      customTooltip.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        padding: 6px 15px;
        border-radius: 15px;
        background-color: var(--color-2);
        border: 2px solid color-mix(in srgb, var(--color-3) 100%, white 5%);
        color: #FFFFFF;
        font-family: Arial, sans-serif;
        font-size: 13px;
        z-index: 1000;
        pointer-events: none;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.3s, visibility 0.3s;
        white-space: normal;
        max-width: 240px;
        text-align: center;
      `;
      panel.appendChild(customTooltip);
      meters.addEventListener("mouseenter", () => {
        if (!tooltipShownOnce) {
          clearTimeout(tooltipTimeout);
          customTooltip.style.opacity = "1";
          customTooltip.style.visibility = "visible";
          tooltipTimeout = setTimeout(() => {
            customTooltip.style.opacity = "0";
            customTooltip.style.visibility = "hidden";
          }, 3000);
          tooltipShownOnce = true;
        }
      });
    }

    buildMeters();

    ensureTextSocket().then(() => {
      if (activeCanvasMode == null) activeCanvasMode = pickInitialCanvasMode();
      syncTextWebSocketMode(true);
      autoEnableSpectrumWhenReady();
    });

    attachToggle();
    attachHotkeys();
  }

  function cleanup() {
    const flags = document.getElementById("flags-container-desktop");
    if (flags) flags.style.visibility = "hidden";

    function remove() {
      document.querySelector(".data-pty.text-color-default")?.remove();
      document.querySelector("h3.color-4.flex-center")?.remove();
    }
    remove();
    new MutationObserver(remove).observe(document.body, { childList: true, subtree: true });
  }

  if (CONFIG.LockVolumeSlider) {
    const style = document.createElement("style");
    style.innerHTML = `#volumeSlider { opacity: 0.4 !important; pointer-events: none !important; }`;
    document.head.appendChild(style);
  }

  function checkUpdate(setupOnly, pluginName, urlUpdateLink, urlFetchLink) {
    const isSetupPath = (window.location.pathname || "/").indexOf("/setup") >= 0;
    const ver = typeof plugin_version !== "undefined" ? plugin_version : "Unknown";

    fetch(urlFetchLink, { cache: "no-store" })
      .then((r) => r.text())
      .then((txt) => {
        let remoteVer = "Unknown";
        const match = txt.match(/const\s+plugin_version\s*=\s*['"]([^'"]+)['"]/);
        if (match) remoteVer = match[1];

        if (remoteVer !== "Unknown" && remoteVer !== ver) {
          mmLog("log", `Update available: ${ver} -> ${remoteVer}`);
          if (!setupOnly || isSetupPath) {
            const settings = document.getElementById("plugin-settings");
            if (settings) settings.innerHTML += `<br><a href="${urlUpdateLink}" target="_blank">[${pluginName}] Update: ${ver} -> ${remoteVer}</a>`;
            const updateIcon =
              document.querySelector(".wrapper-outer #navigation .sidenav-content .fa-puzzle-piece") ||
              document.querySelector(".wrapper-outer .sidenav-content") ||
              document.querySelector(".sidenav-content");
            if (updateIcon) {
              const redDot = document.createElement("span");
              redDot.style.cssText = `
                display: block;
                width: 12px;
                height: 12px;
                border-radius: 50%;
                background-color: #FE0830;
                margin-left: 82px;
                margin-top: -12px;
              `;
              updateIcon.appendChild(redDot);
            }
          }
        }
      })
      .catch((e) => { mmLog("error", `Update check for ${pluginName} failed`, e); });
  }

  function installMpxSignalToggleHandlerOnce() {
    window.MetricsMonitor = window.MetricsMonitor || {};
    if (window.MetricsMonitor._mmMpxSignalDelegated) return;
    window.MetricsMonitor._mmMpxSignalDelegated = true;

    document.addEventListener("click", (ev) => {
      try {
        if (ev && ev.__mmMpxHandled) return;
        const t = ev.target;
        const btn = t && t.closest ? t.closest("#mpx-signal-toggle-button") : null;
        if (!btn) return;
        ev.__mmMpxHandled = true;
        toggleMpxSignalCanvas();
      } catch (_) {}
    }, true);
  }

  function createMpxSignalButton() {
    installMpxSignalToggleHandlerOnce();
    if (!HAS_SUPPORTED_CANVAS) return;
    const buttonId = "mpx-signal-toggle-button";
    if (document.getElementById(buttonId)) return;

    (function waitForFunction() {
      const maxWaitTime = 30000;
      let functionFound = false;

      const observer = new MutationObserver(() => {
        if (typeof addIconToPluginPanel === "function") {
          observer.disconnect();
          try { addIconToPluginPanel(buttonId, "MPX/Signal", "solid", "wave-square", "MPX/Signal"); functionFound = true; }
          catch (e) { mmLog("warn", "addIconToPluginPanel failed, using legacy button", e); }
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => { observer.disconnect(); if (!functionFound) legacyButtonCreate(); }, maxWaitTime);
    })();

    $("<style>").prop("type", "text/css").html(`
      #${buttonId}:hover { color: var(--color-5); filter: brightness(120%); }
      #${buttonId}.active { background-color: var(--color-2) !important; }
    `).appendTo("head");
  }

  function legacyButtonCreate() {
    const buttonId = "mpx-signal-toggle-button";
    if (document.getElementById(buttonId)) return;
    if (document.querySelector(".dashboard-panel-plugin-list")) return;

    const BUTTON_NAME = "MPX/SIGNAL";
    const aButtonText = $("<strong>", { class: "aspectrum-text", html: BUTTON_NAME });
    const aButton = $("<button>", { id: buttonId, class: "hide-phone bg-color-2" });
    aButton.css({ "border-radius": "0px", "width": "100px", "height": "22px", "position": "relative", "margin-top": "16px", "margin-left": "5px", "right": "0px" });
    aButton.append(aButtonText);

    let buttonWrapper = $("#button-wrapper");
    if (buttonWrapper.length) {
      buttonWrapper.append(aButton);
    } else {
      const wrapperElement = $(".tuner-info");
      if (wrapperElement.length) {
        buttonWrapper = $("<div>", { id: "button-wrapper", class: "button-wrapper" });
        wrapperElement.append(buttonWrapper);
        wrapperElement.append(document.createElement("br"));
        buttonWrapper.append(aButton);
      }
    }
  }

  function getRdsLoggerState() {
    const loggingCanvas = document.getElementById("logging-canvas");
    const btn = document.getElementById("Log-on-off");
    const loaded = !!(loggingCanvas || btn);
    let on = false;
    try {
      if (btn && btn.classList.contains("active")) on = true;
      else if (loggingCanvas && getComputedStyle(loggingCanvas).display !== "none") on = true;
    } catch (_) {}
    return { loaded, on };
  }

  function mmHideEl(el) {
    if (!el) return;
    if (el.dataset.mmHiddenByMm === "1") return;
    if (el.dataset.mmOrigDisplay === undefined) el.dataset.mmOrigDisplay = (el.style && typeof el.style.display === "string") ? el.style.display : "";
    el.dataset.mmHiddenByMm = "1";
    el.style.display = "none";
  }

  function mmRestoreEl(el) {
    if (!el) return;
    if (el.dataset.mmHiddenByMm !== "1") return;
    const orig = (el.dataset.mmOrigDisplay !== undefined) ? el.dataset.mmOrigDisplay : "";
    el.style.display = orig;
    delete el.dataset.mmHiddenByMm;
    delete el.dataset.mmOrigDisplay;
  }

  function setStandardCanvasVisibility(show) {
    const logger = getRdsLoggerState();
    const ids = ["signal-canvas", "sdr-graph", "Antenna", "containerRotator", "sdr-graph-button-container"];
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const loggerManaged = (id === "signal-canvas" || id === "Antenna" || id === "containerRotator");
      if (show) {
        if (logger.on && loggerManaged) return;
        mmRestoreEl(el);
      } else {
        mmHideEl(el);
      }
    });
  }

  function applyCustomContainerStyles() {
    const canvasContainer = document.querySelector(".canvas-container.hide-phone");
    if (!canvasContainer) return;
    canvasContainer.style.padding = "0";
    canvasContainer.style.margin = "0";
    canvasContainer.style.lineHeight = "0";
    canvasContainer.style.overflow = "visible";
    const parent = canvasContainer.parentElement;
    if (parent) {
      const cs = getComputedStyle(parent);
      const padL = parseFloat(cs.paddingLeft) || 0;
      const padR = parseFloat(cs.paddingRight) || 0;
      canvasContainer.style.marginLeft = `-${padL}px`;
      canvasContainer.style.marginRight = `-${padR}px`;
      canvasContainer.style.width = `calc(98.4% + ${padL + padR}px)`;
    }
  }

  function resetContainerStyles() {
    const canvasContainer = document.querySelector(".canvas-container.hide-phone");
    if (!canvasContainer) return;
    canvasContainer.style.padding = "";
    canvasContainer.style.margin = "";
    canvasContainer.style.lineHeight = "";
    canvasContainer.style.overflow = "";
    canvasContainer.style.marginLeft = "";
    canvasContainer.style.marginRight = "";
    canvasContainer.style.width = "";
  }

  function toggleMpxSignalCanvas() {
    const logger = getRdsLoggerState();
    if (logger.on) {
      mmLog("warn", "MPX/Signal toggle blocked: RDS Logger is active");
      if (typeof sendToast === "function") {
        try { sendToast("warning", "MetricsMonitor", "Disable RDS Logger first (Log button) to use MPX/Signal.", false, false); } catch (_) {}
      }
      return;
    }

    if (activeCanvasMode == null) activeCanvasMode = pickInitialCanvasMode();

    isCanvasVisible = !isCanvasVisible;

    const button = document.getElementById("mpx-signal-toggle-button");

    if (isCanvasVisible) {
      if (button) { button.classList.add("active"); button.classList.remove("inactive"); }
      setStandardCanvasVisibility(false);
      applyCustomContainerStyles();

      // Erst erstellen, dann Referenz holen
      if (activeCanvasMode === 2) replaceMainCanvasWithMpxComboIfRequired();
      else if (activeCanvasMode === 4) replaceMainCanvasIfRequired();
      else if (activeCanvasMode === 5) replaceMainCanvasWithScopeIfRequired(true);

      // Referenzen NACH dem Erstellen neu lesen
      const mmContainerCombo   = document.getElementById("mm-mpx-combo-flex");
      const mmContainerSignal  = document.getElementById("mm-signal-analyzer-flex");
      const mmContainerScope   = document.getElementById("mm-scope-flex");

      if (activeCanvasMode === 2 && mmContainerCombo)  { mmContainerCombo.style.display = "flex";  if(window.mmTriggerResize) window.mmTriggerResize(); }
      if (activeCanvasMode === 4 && mmContainerSignal) { mmContainerSignal.style.display = "flex"; if(window.mmTriggerResizeSignal) window.mmTriggerResizeSignal(); }
      if (activeCanvasMode === 5 && mmContainerScope)  { mmContainerScope.style.display = "flex";  if(window.mmTriggerResizeScope) window.mmTriggerResizeScope(); }

      syncTextWebSocketMode(false);
    } else {
      if (button) { button.classList.remove("active"); button.removeAttribute("disabled"); button.setAttribute("aria-pressed","false"); }

      const mmContainerCombo   = document.getElementById("mm-mpx-combo-flex");
      const mmContainerSignal  = document.getElementById("mm-signal-analyzer-flex");
      const mmContainerScope   = document.getElementById("mm-scope-flex");

      if (mmContainerCombo) {
          mmContainerCombo.style.display = "none";
          if (window.MetricsAnalyzer && window.MetricsAnalyzer.destroy) window.MetricsAnalyzer.destroy("mm-combo-analyzer-container");
      }
      if (mmContainerSignal) {
          mmContainerSignal.style.display = "none";
          if (window.MetricsSignalAnalyzer && window.MetricsSignalAnalyzer.destroy) window.MetricsSignalAnalyzer.destroy("main-signal-analyzer-container");
          else if (window.MetricsSignalAnalyzer && window.MetricsSignalAnalyzer.cleanup) window.MetricsSignalAnalyzer.cleanup();
      }
      if (mmContainerScope) {
          mmContainerScope.style.display = "none";
          if (window.MetricsScope && window.MetricsScope.destroy) window.MetricsScope.destroy("main-scope-container");
          else if (window.MetricsScope && window.MetricsScope.cleanup) window.MetricsScope.cleanup();
      }

      resetContainerStyles();
      setStandardCanvasVisibility(true);
      syncTextWebSocketMode(false);
    }
  }

  function initCanvasVisibility() { isCanvasVisible = false; setStandardCanvasVisibility(true); }

  function start() {
    mmLog("log", "Starting...");

    activeCanvasMode = pickInitialCanvasMode();

    if (HAS_SUPPORTED_CANVAS) {
        initCanvasVisibility();
        createMpxSignalButton();
    }

    [
      "css/metricsmonitor.css",
      "css/metricsmonitor_header.css",
      NEED_METERS ? "css/metricsmonitor_meters.css" : null,
      NEED_AudioMeter ? "css/metricsmonitor-audiometer.css" : null,
      NEED_ANALYZER ? "css/metricsmonitor-analyzer.css" : null,
      NEED_SIGNAL_METER ? "css/metricsmonitor-signalmeter.css" : null,
      NEED_SIGNAL_ANALYZER ? "css/metricsmonitor-signal-analyzer.css" : null,
      NEED_SCOPE ? "css/metricsmonitor-scope.css" : null
    ].filter(Boolean).forEach(loadCss);

    const scriptsToLoad = [
      "js/metricsmonitor-header.js",
      NEED_METERS ? "js/metricsmonitor-meters.js" : null,
      NEED_AudioMeter ? "js/metricsmonitor-audiometer.js" : null,
      NEED_ANALYZER ? "js/metricsmonitor-analyzer.js" : null,
      NEED_SIGNAL_METER ? "js/metricsmonitor-signalmeter.js" : null,
      NEED_SIGNAL_ANALYZER ? "js/metricsmonitor-signal-analyzer.js" : null,
      NEED_SCOPE ? "js/metricsmonitor-scope.js" : null
    ].filter(Boolean);

    Promise.all(scriptsToLoad.map(loadScript))
      .then(() => {
        setupCanvasToggle();
        insertPanel();
        cleanup();
        lockVolumeControls();
      })
      .catch((err) => { mmLog("error", "Load error", err); });
  }

  if (CHECK_FOR_UPDATES) checkUpdate(pluginSetupOnlyNotify, pluginName, pluginHomepageUrl, pluginUpdateUrl);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();

  let isCanvasSwitching = false;

  function switchCanvasWithFade(targetMode) {
    if (!isCanvasVisible) { activeCanvasMode = targetMode; return; }

    const oldEl = (activeCanvasMode === 2) ? document.getElementById("mm-mpx-combo-flex") :
                  (activeCanvasMode === 4) ? document.getElementById("mm-signal-analyzer-flex") :
                  document.getElementById("mm-scope-flex");
    const newEl = (targetMode === 2) ? document.getElementById("mm-mpx-combo-flex") :
                  (targetMode === 4) ? document.getElementById("mm-signal-analyzer-flex") :
                  document.getElementById("mm-scope-flex");

    if (isCanvasSwitching) return;
    isCanvasSwitching = true;
    const FADE_MS = 150;

    if (oldEl) { oldEl.style.transition = `opacity ${FADE_MS}ms`; oldEl.style.opacity = '0'; }

    setTimeout(() => {
      if (activeCanvasMode === 2) { if (window.MetricsAnalyzer && window.MetricsAnalyzer.destroy) window.MetricsAnalyzer.destroy("mm-combo-analyzer-container"); }
      else if (activeCanvasMode === 4) { if (window.MetricsSignalAnalyzer && window.MetricsSignalAnalyzer.destroy) window.MetricsSignalAnalyzer.destroy("main-signal-analyzer-container"); }
      else if (activeCanvasMode === 5) { if (window.MetricsScope && window.MetricsScope.destroy) window.MetricsScope.destroy("main-scope-container"); }

      if (oldEl) { oldEl.style.display = 'none'; oldEl.style.opacity = '1'; }

      activeCanvasMode = targetMode;

      if (targetMode === 2) replaceMainCanvasWithMpxComboIfRequired();
      else if (targetMode === 4) replaceMainCanvasIfRequired();
      else if (targetMode === 5) replaceMainCanvasWithScopeIfRequired(true);

      const createdEl = (targetMode === 2) ? document.getElementById("mm-mpx-combo-flex") :
                        (targetMode === 4) ? document.getElementById("mm-signal-analyzer-flex") :
                        document.getElementById("mm-scope-flex");
      if (createdEl) {
          createdEl.style.opacity = '0';
          createdEl.style.display = 'flex';
          requestAnimationFrame(() => {
             createdEl.style.transition = `opacity ${FADE_MS}ms`;
             createdEl.style.opacity = '1';
          });
      }

      syncTextWebSocketMode(false);
      if (targetMode === 2 && window.mmTriggerResize) window.mmTriggerResize();
      if (targetMode === 4 && window.mmTriggerResizeSignal) window.mmTriggerResizeSignal();
      if (targetMode === 5 && window.mmTriggerResizeScope) window.mmTriggerResizeScope();

      setTimeout(() => { isCanvasSwitching = false; }, FADE_MS);
    }, FADE_MS);
  }

  function setupCanvasToggle() {
    const supported = [2, 4, 5];
    const active = FINAL_CANVAS_SEQUENCE.filter((m) => supported.some(s => Number(s) === Number(m))).map(Number);
    if (active.length < 2) return;
    const container = document.querySelector(".canvas-container.hide-phone");
    if (!container) return;
    container.addEventListener("click", (e) => {
        if (!isCanvasVisible || isCanvasSwitching) return;
        if (e.target.closest("#mm-mpx-combo-flex") || e.target.closest("#mm-signal-analyzer-flex") || e.target.closest("#mm-scope-flex")) {
             let currentIndex = active.indexOf(activeCanvasMode);
             if (currentIndex < 0) currentIndex = 0;
             currentIndex = (currentIndex + 1) % active.length;
             switchCanvasWithFade(active[currentIndex]);
        }
    });
  }
 
const CC_COLOR_SIGNAL = 'rgba(58, 123, 213, 0.9)';
const CC_COLOR_ACI    = 'rgba(0, 255, 0, 0.65)';
const CC_COLOR_CCI    = 'rgba(255, 255,0, 0.65)';
const CC_BG           = 'transparent';

// 100% graph height = 30 dBµV = 40.875 dBf = -78.875 dBm
const CC_SIGNAL_PEAK_DBF = 40.875; 

function drawChannelCondition(canvas, signalDbf, aciPct, aciRaw, cciPct, cciRaw, mpPct) {
  const ctx = canvas.getContext('2d');
  const W   = canvas.width;
  const H   = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const maxH = H * 0.85;

  const sigDbf    = Math.max(0, Number(signalDbf) || 0);
  const sigHeight = Math.min(maxH, (sigDbf / CC_SIGNAL_PEAK_DBF) * maxH);

  const aciH = (aciPct >= 0) ? Math.min(maxH, maxH * (aciPct / 100)) : 0;
  const cciH = (cciPct >= 0) ? Math.min(maxH, maxH * (cciPct / 100)) : 0;

  function drawShape(x0, x1, peakY, color, mirror, flatWidth) {
    const base = H;
    ctx.beginPath();
    
    if (!mirror) {
      ctx.moveTo(x0, base);
      ctx.lineTo(x0, peakY);
      ctx.lineTo(x0 + flatWidth, peakY);
      const cp1x = x0 + flatWidth + (x1 - (x0 + flatWidth)) * 0.4;
      const cp1y = peakY;
      const cp2x = x0 + flatWidth + (x1 - (x0 + flatWidth)) * 0.4;
      const cp2y = base;
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x1, base);
    } else {
      ctx.moveTo(x1, base);
      ctx.lineTo(x1, peakY);
      ctx.lineTo(x1 - flatWidth, peakY);
      const cp1x = x1 - flatWidth - ((x1 - flatWidth) - x0) * 0.4;
      const cp1y = peakY;
      const cp2x = x1 - flatWidth - ((x1 - flatWidth) - x0) * 0.4;
      const cp2y = base;
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x0, base);
    }
    
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  const sigX0 = 0;
  const sigX1 = W * 0.50; // 100% mark for the Signal Peak and Multipath
  const sigFlatW = W * 0.15;
  
  const aciX0 = 0;
  const aciX1 = W * 0.70;
  const aciFlatW = W * 0.35;
  
  const cciX0 = W * 0.60;
  const cciX1 = W;
  const cciFlatW = W * 0.10;

  // 1. ACI in the background
  if (aciPct >= 0 && aciH > 1) {
    drawShape(aciX0, aciX1, H - aciH, CC_COLOR_ACI, false, aciFlatW);
  }

  // 2. Blue Signal
  drawShape(sigX0, sigX1, H - sigHeight, CC_COLOR_SIGNAL, false, sigFlatW);

  // 3. Red Multipath Overlay (clipped to the calculated % width of the blue signal)
  if (mpPct > 0) {
    ctx.save();
    const mpWidth = sigX1 * (Math.min(100, mpPct) / 100);
    ctx.beginPath();
    ctx.rect(0, 0, mpWidth, H);
    ctx.clip(); // Limit the drawing area to mpWidth
    
    // Draw red color using the same shape as the blue signal
    drawShape(sigX0, sigX1, H - sigHeight, 'rgba(255, 0, 0, 0.75)', false, sigFlatW);
    ctx.restore();

    // Fix label (MP) aligned to the left
    ctx.fillStyle = 'rgba(255, 60, 60, 1)';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'left';
    const textX = 2; // Fixed distance from the left edge
    
    // Only show text if the bar has a visible width
    if (mpWidth > 0) {
        ctx.fillText('MP ' + Math.round(mpPct) + '%', textX, Math.max(10, H - Math.max(sigHeight, 15) - 5));
    }
  }

  // 4. CCI
  if (cciPct >= 0 && cciH > 1) {
    drawShape(cciX0, cciX1, H - cciH, CC_COLOR_CCI, true, cciFlatW);
  }

  // Bottom line
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, H - 1);
  ctx.lineTo(W, H - 1);
  ctx.stroke();
}


function replaceMainCanvasIfRequired() {
  if (!Array.isArray(CONFIG.CANVAS_SEQUENCE) || !CONFIG.CANVAS_SEQUENCE.some(v => Number(v) === 4)) return;

  const canvasContainer = document.querySelector(".canvas-container.hide-phone");
  if (!canvasContainer) return;

  if (document.getElementById("mm-signal-analyzer-flex")) {
      if (isCanvasVisible && activeCanvasMode === 4) document.getElementById("mm-signal-analyzer-flex").style.display = 'flex';
      return;
  }

  const INTERNAL_HEIGHT = 160;
  const CC_CANVAS_W = 170;
  const SIGNAL_BOX_W = 125;
  const COL_GAP = 15;
  const LEFT_COL_W = CC_CANVAS_W + COL_GAP; 

  const CUSTOM_CSS = `
    #mm-signal-analyzer-flex{
      display: none;
      align-items:stretch;
      width:100%;
      height:${INTERNAL_HEIGHT}px !important;
      min-height:${INTERNAL_HEIGHT}px !important;
      background: linear-gradient(180deg, #071c33 0%, #041425 100%);
      border:1px solid rgba(255,255,255,0.45);
      border-radius:0px;
      overflow:hidden;
      box-sizing:border-box;
      transform-origin: top center;
      position: relative;
      z-index: 5;
      transform: translate(10px, -10px);
      margin-bottom: -20px;
    }
    
    /* LEFT COLUMN: ACI/CCI Canvas */
    #mm-signal-left-col { 
      width: ${LEFT_COL_W}px;
      min-width: ${LEFT_COL_W}px;
      display:flex; 
      flex-direction: row;
      align-items:center; 
      padding:12px; 
      box-sizing:border-box; 
      border-right: 1px solid rgba(255,255,255,0.15) !important;
    }
    
    /* Channel Condition Canvas overlay styles */
    #mm-cc-wrapper {
      display: flex;
      flex-direction: column;
      width: ${CC_CANVAS_W}px;
      min-width: ${CC_CANVAS_W}px;
      height: 100%;
      margin-left: -5px;
      background: transparent;
      border: 0px solid rgba(255,255,255,0.45);
      border-radius: 0px;
      overflow: hidden;
    }
    #mm-cc-canvas {
      flex: 1;
      width: 100%;
      height: 100%;
      display: block;
    }
    #mm-cc-labels {
      display: flex;
      flex-direction: row;
      width: 105%;
      margin-left: 2px;
      padding: 4px 0;
    }
    .cc-label-col {
      flex: 1;
      text-align: center;
      line-height: 1.2;
    }
    .cc-label-title {
      color: #ccc;
      font-size: 11px;
      display: block;
    }
    .cc-label-value {
      color: #fff;
      font-size: 13px;
      display: block;
    }

    /* CENTER COLUMN: Signal Graph */
    #main-signal-analyzer-container { 
      position:relative; 
      flex:1; 
      height:110%; 
      padding:0px 6px 12px 12px; 
      overflow:hidden; 
      justify-content:center; 
      box-sizing:border-box; 
      border:none !important; 
      outline:none !important; 
      box-shadow: inset 1px 0 0 rgba(255,255,255,0.10) !important; 
    }
    #main-signal-analyzer-container [data-mm-signal-analyzer-wrap], 
    #main-signal-analyzer-container [data-mm-signal-analyzer-canvas], 
    #main-signal-analyzer-container canvas { 
      height:100%; 
      display:block; 
      border:none !important; 
      outline:none !important; 
      box-shadow:none !important; 
    }

    /* RIGHT COLUMN: Signal Box (matches Signal Meter Module) */
    #mm-signal-right-col {
      width: ${SIGNAL_BOX_W}px;
      min-width: ${SIGNAL_BOX_W}px;
      flex: 0 0 ${SIGNAL_BOX_W}px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      border-left: 1px solid rgba(255,255,255,0.1);
      padding: 8px 6px;
      background: linear-gradient(180deg, #071c33 0%, #041425 100%);
    }
    
    .cv-signal-heading {
      display: block;
      text-align: center;
      width: 100%;
      color: #3A8BCC;
      font-size: 24px;
      margin-top: 0px;
      margin-bottom: 4px;
      font-weight: bold;
      text-transform: uppercase;
    }
    
    .cv-highest-container {
      color: #aaa;
      font-size: 10px;
      margin-top: 24px;
      display: flex;
      justify-content: center;
      align-items: center;
      width: 100%;
    }

    .cv-signal-big {
      text-align: center;
      line-height: 1.1;
      margin-top: -4px;
      width: 100%;
      display: block;
    }
    
    #cv-signal-main {
      font-size: 38px !important;
      font-weight: 300; 
      color: #fff;
    }
    
    #cv-signal-decimal {
      font-size: 26px !important;
      font-weight: 300;
      opacity: 0.7;
      color: #fff;
    }
    
    .cv-signal-unit {
      display: block;
      margin-top: -2px;
      font-size: 14px !important;
      line-height: 1.2;
      color: #888;
      text-align: center;
      width: 100%;
    }
    
    .cv-multipath-container {
       margin-top: 16px;
       font-size: 13px;
       color: #3A8BCC;
       text-align: center;
       display: block; /* always block to prevent jumping layout */
       font-weight: bold;
    }
    .cv-multipath-container span {
       color: #fff;
       font-weight: normal;
    }
  `;
  let style = document.getElementById("metrics-signal-analyzer-css");
  if (!style) { style = document.createElement("style"); style.id = "metrics-signal-analyzer-css"; document.head.appendChild(style); }
  style.textContent = CUSTOM_CSS;

  const flex = document.createElement("div");
  flex.id = "mm-signal-analyzer-flex";
  flex.style.display = (isCanvasVisible && activeCanvasMode === 4) ? "flex" : "none";
  canvasContainer.appendChild(flex);

  // --- LEFT COLUMN (ACI/CCI Canvas) ---
  const leftCol = document.createElement("div");
  leftCol.id = "mm-signal-left-col";
  flex.appendChild(leftCol);

  const ccWrapper = document.createElement('div');
  ccWrapper.id = "mm-cc-wrapper";

  const ccCanvas = document.createElement('canvas');
  ccCanvas.id = "mm-cc-canvas";

  const ccLabels = document.createElement('div');
  ccLabels.id = "mm-cc-labels";

  const labelEls = {};
  ['signal', 'aci', 'cci'].forEach((key) => {
    const col = document.createElement('div');
    col.className = 'cc-label-col';

    const title = document.createElement('span');
    title.className = 'cc-label-title';
    title.textContent = key.toUpperCase();

    const value = document.createElement('span');
    value.className = 'cc-label-value';
    value.textContent = '---';
    labelEls[key] = value;

    col.appendChild(title);
    col.appendChild(value);
    ccLabels.appendChild(col);
  });

  ccWrapper.appendChild(ccCanvas);
  ccWrapper.appendChild(ccLabels);
  leftCol.appendChild(ccWrapper);

  // --- CENTER COLUMN (Chart Canvas) ---
  const analyzerHost = document.createElement("div");
  analyzerHost.id = "main-signal-analyzer-container";
  flex.appendChild(analyzerHost);

  // --- RIGHT COLUMN (Signal Panel) ---
  const rightCol = document.createElement("div");
  rightCol.id = "mm-signal-right-col";
  flex.appendChild(rightCol);

  rightCol.innerHTML = `
      <div style="width:100%; transition: transform 0.3s ease; padding-top: 5px;" id="cv-signal-values-wrapper" data-mm-signal="values-wrapper">
        <h2 class="cv-signal-heading">SIGNAL</h2>
        <div class="cv-highest-container">
          <i class="fa-solid fa-arrow-up" style="font-size:10px; margin-right: 4px;"></i>
          <span id="cv-signal-highest" data-mm-signal="highest">---</span>&nbsp;
          <span class="cv-signal-unit-small signal-units">dBf</span>
        </div>
        <div class="cv-signal-big">
          <span id="cv-signal-main" data-mm-signal="main">--</span><!--
       --><span id="cv-signal-decimal" data-mm-signal="decimal">.-</span>
        </div>
        <div class="cv-signal-unit signal-units">dBf</div>
      </div>
      <div id="cv-multipath" class="cv-multipath-container" data-mm-signal="multipath-container">
        Multipath: <span id="cv-multipath-val" data-mm-signal="multipath-value">--%</span>
      </div>
  `;

  // Setup rendering for Channel Condition Canvas
  let ccRafId = null;
  
  // Variables for slow graphic decay & attack
  let smoothedSignal = 0;
  let smoothedAci = 0;
  let smoothedCci = 0;
  let smoothedMp = 0;
  const ATTACK_FACTOR = 0.25; // Slower rise
  const DECAY_FACTOR = 0.08;  // Slower fall
  
  function renderChannelCondition() {
      if (!flex.isConnected) { ccRafId = null; return; }

      const dpr = window.devicePixelRatio || 1;
      const dispW = ccCanvas.clientWidth || ccCanvas.width / dpr;
      const dispH = ccCanvas.clientHeight || ccCanvas.height / dpr;

      if (Math.round(dispW * dpr) !== ccCanvas.width || Math.round(dispH * dpr) !== ccCanvas.height) {
          ccCanvas.width = Math.round(dispW * dpr);
          ccCanvas.height = Math.round(dispH * dpr);
          const ctx = ccCanvas.getContext('2d');
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      let aci = -1;
      let cci = -1;
      let mpTarget = 0;
      let signalDisplay = "---";
      let baseDbf = 0;

      // 1. Process Signal Data natively
      if (window.MetricsSignalMeter && window.MetricsSignalMeter.levels) {
           const hfValue = window.MetricsSignalMeter.levels.hfValue;
           baseDbf = (typeof window.MetricsSignalMeter.levels.hfBase === 'number' && !isNaN(window.MetricsSignalMeter.levels.hfBase)) 
                      ? window.MetricsSignalMeter.levels.hfBase : 0;
           
           const currentUnit = (window.MetricsMonitor && typeof window.MetricsMonitor.getSignalUnit === 'function') ? window.MetricsMonitor.getSignalUnit() : "dbf";
           let displayUnit = currentUnit.toLowerCase() === 'dbuv' ? 'dBµV' : 
                             currentUnit.toLowerCase() === 'dbm' ? 'dBm' : 'dBf';

           signalDisplay = (typeof hfValue === 'number' && !isNaN(hfValue)) ? hfValue.toFixed(1) + " " + displayUnit : "---";
      }

      // 2. Pull ACI, CCI, and Multipath directly from the HUB to ensure they are always captured even if the Signal Meter Module is off
      if (window.__MM_SIGNALMETER_HUB__) {
          if (typeof window.__MM_SIGNALMETER_HUB__.latestAci === 'number' && !isNaN(window.__MM_SIGNALMETER_HUB__.latestAci)) {
              aci = window.__MM_SIGNALMETER_HUB__.latestAci;
          }
          if (typeof window.__MM_SIGNALMETER_HUB__.latestCci === 'number' && !isNaN(window.__MM_SIGNALMETER_HUB__.latestCci)) {
              cci = window.__MM_SIGNALMETER_HUB__.latestCci;
          }
          if (typeof window.__MM_SIGNALMETER_HUB__.latestMultipath === 'number' && !isNaN(window.__MM_SIGNALMETER_HUB__.latestMultipath)) {
              mpTarget = window.__MM_SIGNALMETER_HUB__.latestMultipath;
          }
      }

      // Fallbacks just in case the HUB didn't have them
      if (aci === -1 && window.MetricsSignalMeter && window.MetricsSignalMeter.levels && typeof window.MetricsSignalMeter.levels.aci === 'number') {
          aci = window.MetricsSignalMeter.levels.aci;
      }
      if (cci === -1 && window.MetricsSignalMeter && window.MetricsSignalMeter.levels && typeof window.MetricsSignalMeter.levels.cci === 'number') {
          cci = window.MetricsSignalMeter.levels.cci;
      }
      if (mpTarget === 0 && window.MetricsSignalMeter && window.MetricsSignalMeter.levels) {
          let mpRaw = window.MetricsSignalMeter.levels.multipath !== undefined ? window.MetricsSignalMeter.levels.multipath : window.MetricsSignalMeter.levels.mp;
          if (typeof mpRaw === 'number' && !isNaN(mpRaw)) mpTarget = mpRaw;
      }

      // Ensure valid boundaries
      aci = (aci >= 0 && !isNaN(aci)) ? aci : -1;
      cci = (cci >= 0 && !isNaN(cci)) ? cci : -1;

      // Calculate smoothed graphics values (sluggish attack and decay)
      if (baseDbf > smoothedSignal) smoothedSignal += (baseDbf - smoothedSignal) * ATTACK_FACTOR;
      else smoothedSignal += (baseDbf - smoothedSignal) * DECAY_FACTOR;

      let targetAci = aci >= 0 ? aci : 0;
      if (targetAci > smoothedAci) smoothedAci += (targetAci - smoothedAci) * ATTACK_FACTOR;
      else smoothedAci += (targetAci - smoothedAci) * DECAY_FACTOR;

      let targetCci = cci >= 0 ? cci : 0;
      if (targetCci > smoothedCci) smoothedCci += (targetCci - smoothedCci) * ATTACK_FACTOR;
      else smoothedCci += (targetCci - smoothedCci) * DECAY_FACTOR;
      
      if (mpTarget > smoothedMp) smoothedMp += (mpTarget - smoothedMp) * ATTACK_FACTOR;
      else smoothedMp += (mpTarget - smoothedMp) * DECAY_FACTOR;

      // Draw graph with smoothed variables
      drawChannelCondition(ccCanvas, smoothedSignal, smoothedAci, aci, smoothedCci, cci, smoothedMp);

      // Update text labels
      if (labelEls.signal) labelEls.signal.textContent = signalDisplay;
      if (labelEls.aci) labelEls.aci.textContent = (aci >= 0) ? `${aci}%` : "---";
      if (labelEls.cci) labelEls.cci.textContent = (cci >= 0) ? `${cci}%` : "---";

      ccRafId = requestAnimationFrame(renderChannelCondition);
  }
  ccRafId = requestAnimationFrame(renderChannelCondition);

  const applyCanvasSizingAndRemoveInnerBorder = () => {
    const container = document.getElementById("main-signal-analyzer-container");
    const canvas = container ? container.querySelector('canvas[data-mm-signal-analyzer-canvas], canvas') : null;
    if (!canvas || !container) return;
    const dpr = window.devicePixelRatio || 1;
    const w = container.clientWidth;
    const h = container.clientHeight;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    try {
      if (typeof Chart !== "undefined" && typeof Chart.getChart === "function") {
        const ch = Chart.getChart(canvas);
        if (ch?.options?.scales) {
          ["x", "y"].forEach((ax) => {
            const s = ch.options.scales[ax];
            if (!s) return;
            s.border = Object.assign({}, s.border || {}, { display: false });
            if (s.grid) s.grid.drawBorder = false;
            if (s.grid) { s.grid.borderColor = "rgba(0,0,0,0)"; s.grid.borderWidth = 0; }
          });
          ch.update("none");
        }
      }
    } catch (e) {}
  };

  const tryInit = (attempt = 0) => {
    const analyzer = window.MetricsSignalAnalyzer;
    if (!analyzer || typeof analyzer.init !== "function" || !window.MetricsSignalMeter) {
      if (attempt < 25) return setTimeout(() => tryInit(attempt + 1), 200);
      return;
    }
    
    // Independently hook a text-only meter instance to the right panel so it continues to read data even when Module 3 is disabled
    if (typeof window.MetricsSignalMeter.createInstance === "function") {
        if (!window.mmSignalMeterCanvas4Inst) {
            window.mmSignalMeterCanvas4Inst = window.MetricsSignalMeter.createInstance("mm-signal-right-col", {
                instanceKey: "canvas4-signal-meter",
                textOnly: true,
                bindExisting: false
            });
        }
    }

    let canvasSigAnalyzerInstance = null;
    if (typeof analyzer.createInstance === "function") {
      canvasSigAnalyzerInstance = analyzer.createInstance({
        containerId: "main-signal-analyzer-container",
        instanceKey: "canvas4",
        embedded: true,
        useLegacyCss: false,
        hideValueAndUnit: true
      });
    } else {
      analyzer.init("main-signal-analyzer-container");
    }
    if (typeof window.MetricsSignalMeter.startDataListener === "function") window.MetricsSignalMeter.startDataListener();
    setTimeout(() => {
      applyCanvasSizingAndRemoveInnerBorder();
      (canvasSigAnalyzerInstance?.redraw || analyzer.redraw)?.(true);
    }, 0);
    window.addEventListener("resize", () => {
      (canvasSigAnalyzerInstance?.resize || analyzer.resize)?.();
      setTimeout(() => {
        applyCanvasSizingAndRemoveInnerBorder();
        (canvasSigAnalyzerInstance?.redraw || analyzer.redraw)?.(true);
      }, 0);
    });
  };
  tryInit();
}
  
function replaceMainCanvasWithScopeIfRequired(forceReinit = false) {
    if (!Array.isArray(CONFIG.CANVAS_SEQUENCE) || !CONFIG.CANVAS_SEQUENCE.some(v => Number(v) === 5)) return;

    const canvasContainer = document.querySelector(".canvas-container.hide-phone");
    if (!canvasContainer) return;

    let flex = document.getElementById("mm-scope-flex");
    if (flex && !forceReinit) {
        if (isCanvasVisible && activeCanvasMode === 5) {
            flex.style.display = 'flex';
            if(window.mmTriggerResizeScope) window.mmTriggerResizeScope();
        }
        return;
    }

    const INTERNAL_HEIGHT = 160;
    const METERS_COL_W = 180;
    const DBR_COL_W = 120;

    const CUSTOM_CSS = `
      #mm-scope-flex{
        display: none;
        align-items: stretch;
        width: 100%;
        height: ${INTERNAL_HEIGHT}px !important;
        min-height:${INTERNAL_HEIGHT}px !important;
        background: linear-gradient(180deg, #071c33 0%, #041425 100%);
        border: 1px solid rgba(255,255,255,0.45);
        border-radius: 0px;
        overflow: hidden;
        box-sizing:border-box;
        transform-origin: top center;
        position: relative;
        z-index: 5;
        transform: translate(10px, -10px);
        margin-bottom: -20px;
      }
      #mm-scope-meters-col {
        width: ${METERS_COL_W}px;
        min-width: ${METERS_COL_W}px;
        flex: 0 0 ${METERS_COL_W}px;
        top: 0px;
        display: flex;
        flex-direction: row;
        justify-content: space-evenly;
        align-items: stretch;
        padding: 10px 2px 2px 2px;
        box-sizing: border-box;
        border-right: 1px solid rgba(255,255,255,0.1);
        position: relative;
        z-index: 5;
        height: 100%;
      }
      #mm-scope-meters-inner {
        display: flex;
        width: 100%;
        height: 100%;
        justify-content: space-around;
      }
      #mm-scope-flex .level-meter { margin: -5px 1px; height: 100%; display: flex; flex-direction: column; justify-content: flex-start; position: relative; flex: 1; overflow: visible !important; }
      #mm-scope-flex .meter-top { display: flex !important; flex-direction: row !important; width: 100%; height: 100%; position: relative; }
      #mm-scope-flex .meter-scale { display: flex !important; flex-direction: column; justify-content: space-between; width: 30px !important; min-width: 30px !important; text-align: right !important; margin-top: 0px !important; margin-right: -7px !important; padding-bottom: 5px; font-size: 12px !important; line-height: 1 !important; color: rgba(255,255,255,0.7); z-index: 2; transform: scale(0.75); transform-origin: top; }
      #mm-scope-flex .meter-wrapper { flex: 1; width: 0; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; position: relative; }
      #mm-scope-flex .level-meter canvas { display: block !important; visibility: visible !important; width: 100% !important; max-width: 30px !important; height: auto !important; flex: 1 1 auto !important; margin-bottom: 20px !important; }
      #mm-scope-flex .label { display: block !important; opacity: 1 !important; visibility: visible !important; pointer-events: none !important; margin-top: 6px !important; line-height: 1.0 !important; font-size: 10px !important; text-align: center !important; width: 100%; }
      #mm-scope-flex .meter-bar .segment { border-bottom: 1px solid transparent !important; background-clip: padding-box !important; margin-bottom: 0 !important; box-sizing: border-box; }
      #mm-scope-meters-inner .stereo-group,
      #mm-scope-meters-inner #mm-scope-left-meter-wrapper,
      #mm-scope-meters-inner #mm-scope-right-meter-wrapper,
      #mm-scope-meters-inner #mm-scope-hf-meter-wrapper,
      #mm-scope-meters-inner #eqHintWrapper,
      #mm-scope-meters-inner #eqHintText { display: none !important; }
      #mm-scope-flex #volumeSlider,
      #mm-scope-flex [id*="volume"],
      #mm-scope-flex [class*="volume"] { display: none !important; }
      #main-scope-container{
        position: relative;
        flex: 1;
        height: 100%;
        padding: 0 !important;
        margin: 0 !important;
        overflow: hidden;
        box-sizing: border-box;
        border: none !important;
        outline: none !important;
        box-shadow: none !important;
      }
      /* ── right dBr panel ── */
      #mm-scope-dbr-col {
        width: ${DBR_COL_W}px;
        min-width: ${DBR_COL_W}px;
        flex: 0 0 ${DBR_COL_W}px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        border-left: 1px solid rgba(255,255,255,0.1);
        padding: 8px 6px;
        background: linear-gradient(180deg, #071c33 0%, #041425 100%);
      }
      #mm-scope-dbr-col .mm-dbr-heading {
        display: block;
        text-align: center;
        width: 100%;
        margin-bottom: 4px;
      }
      #mm-scope-dbr-col .mm-dbr-big {
        text-align: center;
        line-height: 1.1;
        margin-top: 4px;
        width: 100%;
        display: block;
        font-size: 28px !important;
      }
      #mm-scope-dbr-col .mm-dbr-unit {
        display: block;
        margin-top: 5px;
        font-size: 16px;
        line-height: 1.2;
        color: #888;
        text-align: center;
        width: 100%;
      }
      #mm-scope-dbr-value {
        transition: color 0.3s;
      }
    `;

    let style = document.getElementById("metrics-scope-css-inline");
    if (!style) {
        style = document.createElement("style");
        style.id = "metrics-scope-css-inline";
        document.head.appendChild(style);
    }
    style.textContent = CUSTOM_CSS;

    if (flex) flex.remove();
    flex = document.createElement("div");
    flex.id = "mm-scope-flex";
    flex.style.display = (isCanvasVisible && activeCanvasMode === 5) ? "flex" : "none";
    canvasContainer.appendChild(flex);

    // ── left: meters column ──
    const metersCol = document.createElement("div");
    metersCol.id = "mm-scope-meters-col";
    flex.appendChild(metersCol);

    const metersInner = document.createElement("div");
    metersInner.id = "mm-scope-meters-inner";
    metersCol.appendChild(metersInner);

    // ── centre: scope canvas ──
    const scopeHost = document.createElement("div");
    scopeHost.id = "main-scope-container";
    flex.appendChild(scopeHost);

    // ── right: dBr panel ──
    const dbrCol = document.createElement("div");
    dbrCol.style.paddingTop = "30px";
    dbrCol.id = "mm-scope-dbr-col";
    flex.appendChild(dbrCol);

    const dbrHeading = document.createElement("h2");
    dbrHeading.className = "signal-heading mm-dbr-heading";
    dbrHeading.textContent = "POWER";
    dbrHeading.style.fontSize = "25px";
    dbrHeading.style.marginBottom = "10px";
    dbrHeading.style.marginTop = "-6px";
    dbrCol.appendChild(dbrHeading);

    const dbrBig = document.createElement("div");
    dbrBig.className = "text-big mm-dbr-big";
    dbrBig.style.setProperty("font-size", "36px", "important");
    dbrCol.appendChild(dbrBig);

    const dbrValue = document.createElement("span");
    dbrValue.id = "mm-scope-dbr-value";
    dbrValue.textContent = "--.-";
    dbrBig.appendChild(dbrValue);

    const dbrUnit = document.createElement("div");
    dbrUnit.className = "mm-dbr-unit";
    dbrUnit.textContent = "dBr";
    dbrUnit.style.setProperty("font-size", "18px", "important");
    dbrCol.appendChild(dbrUnit);

    function getDbrColor(v) {
		if (v == null || !Number.isFinite(v)) return "";
		if (v < 3)   return "";
		if (v < 6.9) return MeterColorWarning;
		return MeterColorDanger;
	}

    let dbrRafId = null;
    function dbrRenderLoop() {
      if (!flex.isConnected) { dbrRafId = null; return; }
      const val = window.MetricsSharedMpxPowerDbr;
      const text = (val == null || !Number.isFinite(val))
        ? "--.-"
        : `${val >= 0 ? "+" : ""}${val.toFixed(1)}`;
      dbrValue.textContent = text;
      dbrValue.style.color = getDbrColor(val);
      dbrRafId = requestAnimationFrame(dbrRenderLoop);
    }
    dbrRafId = requestAnimationFrame(dbrRenderLoop);

    // ── meters init ──
    if (window.MetricsMeters && window.MetricsMeters.initMeters) {
        setTimeout(() => {
            window.MetricsMeters.initMeters(metersInner);
            if (window.MetricsMeters.startAnimation) window.MetricsMeters.startAnimation();

            const SCOPE_PREFIX = "mm-scope-";
            const idsToPrefix = ["left-meter", "right-meter", "hf-meter", "stereo-pilot-meter", "rds-meter", "mpx-meter"];

            idsToPrefix.forEach((id) => {
                const el = metersInner.querySelector(`#${id}`);
                if (el) {
                    const wrapper = el.closest(".level-meter");
                    if (wrapper) wrapper.id = SCOPE_PREFIX + id + "-wrapper";
                    el.id = SCOPE_PREFIX + id;
                    if (el.width === 0) el.width = 40;
                    if (el.height === 0) el.height = 200;
                }
            });
        }, 250);
    }

    // ── scope init ──
    const ensureScope = (attempt = 0) => {
        const scope = window.MetricsScope;
        if (!scope || typeof scope.init !== "function") {
            if (attempt < 25) return setTimeout(() => ensureScope(attempt + 1), 200);
            return;
        }
        scopeHost.innerHTML = "";
        const scopeInstance = scope.init("main-scope-container", {
            instanceKey: "canvas5",
            embedded: true,
            useLegacyCss: false
        });
        const resizeFn = () => {
            (scopeInstance?.resize || scope.resize)?.("main-scope-container");
        };
        window.mmTriggerResizeScope = resizeFn;
        setTimeout(resizeFn, 0);
        window.addEventListener("resize", () => setTimeout(resizeFn, 0));
    };
    ensureScope();
}

  function replaceMainCanvasWithMpxComboIfRequired() {
    if (!Array.isArray(CONFIG.CANVAS_SEQUENCE) || !CONFIG.CANVAS_SEQUENCE.some(v => Number(v) === 2)) return;

    const canvasContainer = document.querySelector(".canvas-container.hide-phone");
    if (!canvasContainer) return;

    const comboId = "mm-mpx-combo-flex";
    let flex = document.getElementById(comboId);

    if (!flex) {
        mmLog("log", "[MM-DEBUG] Creating MPX Combo Layout (Static Scale)...");
        const INTERNAL_HEIGHT = 160;
        const METERS_COL_W = 180;

const CUSTOM_CSS = `
  #mm-mpx-combo-flex {
    display: none;
    align-items: stretch;
    width: 100%;
    height: ${INTERNAL_HEIGHT}px ! important;
    min-height: ${INTERNAL_HEIGHT}px !important;
    background:  linear-gradient(180deg, #071c33 0%, #041425 100%);
    border: 1px solid rgba(255,255,255,0.45);
    box-sizing: border-box;
    transform-origin: top center;
    position: relative;
    z-index: 5;
    overflow: hidden;
    transform: translate(10px, -10px);
    margin-bottom: -20px;
  }
  #mm-combo-meters-col { width: ${METERS_COL_W}px; min-width: ${METERS_COL_W}px; flex: 0 0 ${METERS_COL_W}px; top: 0px; display: flex; flex-direction: row; justify-content: space-evenly; align-items: stretch; padding: 10px 2px 2px 2px; box-sizing: border-box; border-right: 1px solid rgba(255,255,255,0.1); position: relative; z-index: 5; height: 100%; }
  #mm-combo-analyzer-col { flex: 1 1 auto; min-width: 0; height:  100%; position: relative; overflow: hidden; padding: 0; margin:  0; z-index: 10; display: flex; flex-direction: column; }
  #mm-combo-analyzer-container { width: 100% !important; height: 100% !important; flex: 1; border: none ! important; margin: 0 !important; padding: 0 !important; box-shadow: none !important; overflow: hidden !important; position: relative; }
  #mm-combo-analyzer-container canvas { width: 100% !important; height: 100% !important; border: none !important; outline: none !important; display: block !important; }
  #mm-combo-meters-col .level-meter { margin:  -5px 1px; height: 100%; display: flex; flex-direction: column; justify-content: flex-start; position: relative; flex:  1; overflow: visible ! important; }
  #mm-combo-meters-col .meter-top { display: flex ! important; flex-direction: row !important; width: 100%; height: 100%; position: relative; }
  #mm-combo-meters-col .meter-scale { display: flex !important; flex-direction: column; justify-space-between; width: 30px !important; min-width: 30px !important; text-align: right !important; margin-top: 0px !important; margin-right: -7px !important; padding-bottom: 5px; font-size: 12px !important; line-height: 1 !important; color: rgba(255,255,255,0.7); z-index: 2; transform: scale(0.75); transform-origin: top; }
  #mm-combo-meters-col .meter-wrapper { flex: 1; width: 0; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; position: relative; }
  #mm-combo-meters-col .level-meter canvas { display: block ! important; visibility: visible !important; width: 100% !important; max-width: 30px ! important; height: auto !important; flex: 1 1 auto !important; margin-bottom: 0px !important; }
  #mm-combo-meters-col .label { display: block !important; opacity: 1 !important; visibility: visible !important; pointer-events: none !important; margin-top: 6px !important; line-height: 1.0 !important; font-size: 10px !important; }
  #mm-combo-meters-col .meter-bar .segment { border-bottom: 1px solid transparent !important; background-clip: padding-box !important; margin-bottom: 0 !important; box-sizing: border-box; }
  #mm-combo-meters-inner .stereo-group, 
  #mm-combo-meters-inner #mm-combo-left-meter-wrapper, 
  #mm-combo-meters-inner #mm-combo-right-meter-wrapper, 
  #mm-combo-meters-inner #mm-combo-hf-meter-wrapper, 
  #mm-combo-meters-inner #eqHintWrapper, 
  #mm-combo-meters-inner #eqHintText { display: none !important; }
  #mm-mpx-combo-flex #volumeSlider, 
  #mm-mpx-combo-flex [id*="volume"], 
  #mm-mpx-combo-flex [class*="volume"] { display: none ! important; }
`;
        let style = document.getElementById("metrics-mpx-combo-css");
        if (!style) { style = document.createElement("style"); style.id = "metrics-mpx-combo-css"; document.head.appendChild(style); }
        style.textContent = CUSTOM_CSS;

        flex = document.createElement("div");
        flex.id = comboId;
        flex.style.display = "none";
        canvasContainer.appendChild(flex);

        const leftCol = document.createElement("div");
        leftCol.id = "mm-combo-meters-col";
        flex.appendChild(leftCol);

        const metersContainer = document.createElement("div");
        metersContainer.id = "mm-combo-meters-inner";
        metersContainer.style.display = "flex";
        metersContainer.style.width = "100%";
        metersContainer.style.height = "100%";
        metersContainer.style.justifyContent = "space-around";
        leftCol.appendChild(metersContainer);

        const rightCol = document.createElement("div");
        rightCol.id = "mm-combo-analyzer-col";
        flex.appendChild(rightCol);

        const analyzerContainer = document.createElement("div");
        analyzerContainer.id = "mm-combo-analyzer-container";
        rightCol.appendChild(analyzerContainer);

if (window.MetricsMeters && window.MetricsMeters.initMeters) {
  setTimeout(() => {
    window.MetricsMeters.initMeters(metersContainer);
    if (window.MetricsMeters.startAnimation) window.MetricsMeters.startAnimation();
    
    const COMBO_PREFIX = "mm-combo-";
    const idsToPrefix = ["left-meter", "right-meter", "hf-meter", "stereo-pilot-meter", "rds-meter", "mpx-meter"];
    
    idsToPrefix.forEach((id) => {
      const el = metersContainer.querySelector(`#${id}`);
      if (el) {
         const wrapper = el.closest(".level-meter");
         if (wrapper) wrapper.id = COMBO_PREFIX + id + "-wrapper";
         el.id = COMBO_PREFIX + id;
         if (el.width === 0) el.width = 40;
         if (el.height === 0) el.height = 200;
      }
    });
  }, 250);
}
    }

    if (isCanvasVisible && activeCanvasMode === 2) {
      flex.style.display = 'flex';
      if (window.MetricsAnalyzer && typeof window.MetricsAnalyzer.init === "function") {
          void flex.offsetWidth;
          window.MetricsAnalyzer.init("mm-combo-analyzer-container", { instanceKey: "combo-main", embedded: true, useLegacyCss: false });
          setTimeout(() => { if (window.MetricsAnalyzer.resize) window.MetricsAnalyzer.resize("mm-combo-analyzer-container"); }, 50);
      }
    }
  }

  function autoEnableSpectrumWhenReady() {
    if (!EnableSpectrumOnLoad) return;
    mmLog('log', 'AutoEnableSpectrum: Start searching for button...');
    let attempts = 0;
    const MAX_ATTEMPTS = 60;

    const interval = setInterval(() => {
      attempts++;
      const btn = document.getElementById("spectrum-graph-button");
      const shouldLog = (attempts === 1 || attempts % 5 === 0);

      if (!btn) {
        if (shouldLog) mmLog('log', `AutoEnableSpectrum: Button not found yet (Attempt ${attempts}/${MAX_ATTEMPTS})`);
      } else {
        const isActive = btn.classList.contains("active") || btn.classList.contains("bg-color-4");
        if (isActive) {
           mmLog('log', `AutoEnableSpectrum: SUCCESS! Button is active. (Attempt ${attempts})`);
           clearInterval(interval);
           return;
        } else {
           mmLog('log', `AutoEnableSpectrum: Button found (inactive). Sending CLICK... (Attempt ${attempts})`);
           btn.click();
        }
      }

      if (attempts >= MAX_ATTEMPTS) { mmLog('warn', 'AutoEnableSpectrum: Timeout! Button was not found or active.'); clearInterval(interval); }
    }, 500);
  }

})();