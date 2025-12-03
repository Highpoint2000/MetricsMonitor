/////////////////////////////////////////////////////////////////
///                                                           ///
///  METRICSMONITOR CLIENT SCRIPT FOR FM-DX-WEBSERVER (V1.1a) ///
///                                                           ///
///  by Highpoint               last update: 03.12.2025       ///
///                                                           ///
///  https://github.com/Highpoint2000/metricsmonitor          ///
///                                                           ///
/////////////////////////////////////////////////////////////////

(() => {
const sampleRate = 48000;    // Do not touch - this value is automatically updated via the config file
const stereoBoost = 1;    // Do not touch - this value is automatically updated via the config file
const eqBoost = 1;    // Do not touch - this value is automatically updated via the config file
const fftSize = 512;    // Do not touch - this value is automatically updated via the config file
const SpectrumAverageLevel = 30;    // Do not touch - this value is automatically updated via the config file
const minSendIntervalMs = 15;    // Do not touch - this value is automatically updated via the config file
const MPXmode = "off";    // Do not touch - this value is automatically updated via the config file
const MODULE_SEQUENCE = [0,1,2];    // Do not touch - this value is automatically updated via the config file

  // ---------------------------------------------------------
  // Plugin version + update check configuration
  // ---------------------------------------------------------

  const plugin_version = '1.1a'; // MetricsMonitor client version (adjust when you release a new version)
  const updateInfo     = true;   // Enable or disable GitHub version check

  const plugin_name = 'MetricsMonitor';
  const plugin_path = 'https://raw.githubusercontent.com/Highpoint2000/MetricsMonitor/';
  // Path of THIS file inside the GitHub repo (adjust if needed)
  const plugin_JSfile = 'main/plugins/MetricsMonitor/metricsmonitor.js';

  // Mappings for generic /setup update checker
  const CHECK_FOR_UPDATES     = updateInfo;              // reuse existing flag
  const pluginSetupOnlyNotify = true;                    // only show DOM-signals in /setup
  const pluginName            = plugin_name;
  const pluginHomepageUrl     = 'https://github.com/Highpoint2000/MetricsMonitor/releases';
  const pluginUpdateUrl       = plugin_path + plugin_JSfile;

  ///////////////////////////////////////////////////////////////

  let START_INDEX = 0;

  // Safety: if sequence is empty, fall back to [0]
  const ACTIVE_SEQUENCE =
    Array.isArray(MODULE_SEQUENCE) && MODULE_SEQUENCE.length > 0
      ? MODULE_SEQUENCE
      : [0];

  if (START_INDEX < 0 || START_INDEX >= ACTIVE_SEQUENCE.length) {
    START_INDEX = 0;
  }

  let mode = ACTIVE_SEQUENCE[START_INDEX]; // current mode (0/1/2)
  let modeIndex = START_INDEX;             // index in ACTIVE_SEQUENCE

  // Flag for ongoing animation (prevents spamming clicks)
  let isSwitching = false;

  // ---------------------------------------------------------
  // GLOBAL SIGNAL UNIT HANDLING (dBf / dBuV / dBm)
  // ---------------------------------------------------------

  // Public global state namespace
  window.MetricsMonitor = window.MetricsMonitor || {};

  let globalSignalUnit = localStorage.getItem("mm_signal_unit") || "dbf";
  let signalUnitListeners = [];

  // Getter
  window.MetricsMonitor.getSignalUnit = function () {
    return globalSignalUnit;
  };

  // Setter (used internally + by sub-scripts)
  window.MetricsMonitor.setSignalUnit = function (unit) {
    if (!unit) return;
    unit = unit.toLowerCase();

    console.log("[MetricsMonitor] SET SIGNAL UNIT →", unit);

    globalSignalUnit = unit;
    localStorage.setItem("mm_signal_unit", unit);

    // Notify listeners
    signalUnitListeners.forEach(fn => fn(unit));
  };

  // Listener API for other scripts
  window.MetricsMonitor.onSignalUnitChange = function (fn) {
    if (typeof fn === "function") {
      signalUnitListeners.push(fn);
    }
  };

  // Attach to global "Signal units" dropdown in the UI
  function hookSignalUnitDropdown() {
    const input = document.getElementById("signal-selector-input");
    const options = document.querySelectorAll("#signal-selector .option");

    if (!input || options.length === 0) {
      console.warn("[MetricsMonitor] Signal unit dropdown not found – retrying…");
      setTimeout(hookSignalUnitDropdown, 500);
      return;
    }

    console.log("[MetricsMonitor] Signal unit dropdown found");

    // 1) Restore stored value (internal value, not the pretty label)
    input.value = globalSignalUnit;

    // Trigger listeners so sub-scripts can rebuild scales immediately
    window.MetricsMonitor.setSignalUnit(globalSignalUnit);

    // 2) On click change
    options.forEach(opt => {
      opt.addEventListener("click", () => {
        const val = opt.dataset.value?.toLowerCase();
        console.log("[MetricsMonitor] Dropdown changed →", val);

        input.value = val;
        window.MetricsMonitor.setSignalUnit(val);
      });
    });
  }

  // Start dropdown hook 500 ms after panel creation
  setTimeout(hookSignalUnitDropdown, 500);


  // ---------------------------------------------------------
  // 1) Auto-detect plugin BASE URL
  // ---------------------------------------------------------

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

      console.log("[MetricsMonitor] BASE_URL =", BASE_URL);
    } catch (e) {
      console.error("[MetricsMonitor] Base URL detection failed:", e);
      BASE_URL = "";
    }
  })();

  function url(file) {
    return BASE_URL + file.replace(/^\.\//, "");
  }


  // ---------------------------------------------------------
  // 2) Dynamic loading of CSS + JS
  // ---------------------------------------------------------

  function loadCss(file) {
    const href = url(file);
    console.log("[MetricsMonitor] loading CSS:", href);

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }

  function loadScript(file) {
    return new Promise((resolve, reject) => {
      const src = url(file);
      console.log("[MetricsMonitor] loading JS:", src);

      const el = document.createElement("script");
      el.src = src;
      el.async = false;

      el.onload = () => {
        console.log("[MetricsMonitor] loaded:", src);
        resolve();
      };
      el.onerror = (err) => {
        console.error("[MetricsMonitor] SCRIPT ERROR", src, err);
        reject(err);
      };

      document.head.appendChild(el);
    });
  }


  // ---------------------------------------------------------
  // Build module area depending on current mode
  // ---------------------------------------------------------

  function buildMeters() {
    const meters = document.getElementById("level-meter-container");
    if (!meters) return;

    meters.innerHTML = "";

    console.log("[MetricsMonitor] MODE =", mode);

    // LEGEND:
    //   0 = Equalizer
    //   1 = Level meters
    //   2 = Analyzer
    if (mode === 0) {
      // Equalizer uses init("level-meter-container")
      window.MetricsEqualizer?.init("level-meter-container");
    } else if (mode === 1) {
      // Meters uses initMeters(meters)
      window.MetricsMeters?.initMeters(meters);
    } else if (mode === 2) {
      window.MetricsAnalyzer?.init("level-meter-container");
    }
  }


// ---------------------------------------------------------
// TEXT SOCKET via window.socketPromise  (NO new WebSocket)
// ---------------------------------------------------------

let TextSocket = null;
let textSocketReady = false;

// Wait for global socketPromise from Webserver
async function ensureTextSocket() {
  try {
    if (!window.socketPromise) {
      console.error("[MetricsMonitor] socketPromise not available.");
      return null;
    }

    // Wait until connected
    TextSocket = await window.socketPromise;

    if (!TextSocket) {
      console.error("[MetricsMonitor] socketPromise returned null.");
      return null;
    }

    if (!textSocketReady) {
      console.log("[MetricsMonitor] TextSocket available via socketPromise.");

      // Optional: log / error listeners for debugging
      TextSocket.addEventListener("open", () => {
        console.log("[MetricsMonitor] TextSocket OPEN");
      });

      TextSocket.addEventListener("close", () => {
        console.warn("[MetricsMonitor] TextSocket CLOSED");
      });

      TextSocket.addEventListener("error", (ev) => {
        console.error("[MetricsMonitor] TextSocket ERROR:", ev);
      });

      textSocketReady = true;
    }

    return TextSocket;

  } catch (err) {
    console.error("[MetricsMonitor] ensureTextSocket() failed:", err);
    return null;
  }
}


// ---------------------------------------------------------
// SEND L0 / L1 COMMAND (via existing socket)
// ---------------------------------------------------------

async function sendTextWebSocketCommand(cmd) {
  const ws = await ensureTextSocket();
  if (!ws) {
    console.error(`[MetricsMonitor] Cannot send "${cmd}" – no TextSocket.`);
    return;
  }

  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(cmd);
      console.log(`[MetricsMonitor] TextSocket → "${cmd}"`);

      if (window.MetricsHeader &&
          typeof window.MetricsHeader.setMonoLockFromMode === "function") {
        window.MetricsHeader.setMonoLockFromMode(cmd);
      }

    } catch (err) {
      console.error("[MetricsMonitor] Failed sending command:", err);
    }
  } else {
    console.warn(`[MetricsMonitor] TextSocket not open (state=${ws.readyState}) – retrying...`);

    setTimeout(() => sendTextWebSocketCommand(cmd), 300);
  }
}



  /**
   * Synchronize L0/L1 state over /text depending on:
   *  - sampleRate (only if != 48000)
   *  - MPXmode:
   *      "off"  → send L0 once at startup, no further switching
   *      "on"   → send L1 once at startup, no further switching
   *      "auto" → behave like before, follow current "mode" (Equalizer vs others)
   *
   * @param {boolean} isInitial - true for the very first call at startup
   */
   
// Track if L0/L1 was already sent once for MPXmode off/on
let textModeInitialized = false;

// Track last L0/L1 command in auto mode
let lastSentTextMode = null;
   
  function syncTextWebSocketMode(isInitial) {
    if (sampleRate === 48000) {
      console.log(
        "[MetricsMonitor] sampleRate is 48000 Hz – skipping Text WebSocket mode command (no L0/L1 sent)."
      );
      return;
    }

    let cmd = null;

    // -----------------------------------------------
    // MPXmode = "off"
    // → Only one-time L0 at startup, no switching
    // -----------------------------------------------
    if (MPXmode === "off") {
      if (!textModeInitialized && isInitial) {
        cmd = "L0";
        console.log("[MetricsMonitor] MPXmode=off – sending one-time L0 at startup.");
      } else {
        console.log("[MetricsMonitor] MPXmode=off – no further L0/L1 switching.");
        return;
      }
    }
    // -----------------------------------------------
    // MPXmode = "on"
    // → Only one-time L1 at startup, no switching
    // -----------------------------------------------
    else if (MPXmode === "on") {
      if (!textModeInitialized && isInitial) {
        cmd = "L1";
        console.log("[MetricsMonitor] MPXmode=on – sending one-time L1 at startup.");
      } else {
        console.log("[MetricsMonitor] MPXmode=on – no further L0/L1 switching.");
        return;
      }
    }
    // -----------------------------------------------
    // MPXmode = "auto"
    // → Keep old behavior: follow visual mode
    //     mode === 0 → L0 (Equalizer)
    //     mode !== 0 → L1 (Meters / Analyzer)
    // -----------------------------------------------
    else {
      cmd = (mode === 0 ? "L0" : "L1");

      // Avoid sending duplicate commands if nothing changed
      if (textModeInitialized && cmd === lastSentTextMode) {
        console.log(
          `[MetricsMonitor] MPXmode=auto – L0/L1 unchanged (${cmd}), no command sent.`
        );
        return;
      }
    }

    if (!cmd) {
      return;
    }

    console.log(
      `[MetricsMonitor] Preparing to send Text WebSocket mode command "${cmd}" ` +
      `(mode=${mode}, MPXmode=${MPXmode}, initial=${!!isInitial}).`
    );

    sendTextWebSocketCommand(cmd);
    textModeInitialized = true;
    lastSentTextMode = cmd;
  }


  // ---------------------------------------------------------
  // Mode switching with fast fade-out / fade-in animation
  // ---------------------------------------------------------

  function switchModeWithFade(nextMode) {
    const meters = document.getElementById("level-meter-container");
    if (!meters) {
      // No container yet – just switch mode and build
      mode = nextMode;
      buildMeters();
      // In this path we treat it as non-initial switching
      syncTextWebSocketMode(false);
      return;
    }

    if (isSwitching) {
      // Prevent multiple triggers during animation
      return;
    }

    const FADE_MS = 150; // duration for each phase (out / in)
    isSwitching = true;

    // Ensure we have a consistent transition
    meters.style.transition = `opacity ${FADE_MS}ms ease-in-out`;

    // Ensure we start from "visible"
    if (!meters.style.opacity) {
      meters.style.opacity = "1";
    }

    // Force reflow so transition applies cleanly
    void meters.offsetWidth;

    // 1) Fade out
    meters.style.opacity = "0";

    // After fade-out: change content and fade in again
    setTimeout(() => {
      mode = nextMode;
      buildMeters();

      // Only allow auto-mode to toggle L0/L1 after startup
      syncTextWebSocketMode(false);

      // Reflow after rebuilding content
      void meters.offsetWidth;

      // 2) Fade in
      meters.style.opacity = "1";

      // After fade-in, allow new clicks again
      setTimeout(() => {
        isSwitching = false;
      }, FADE_MS);
    }, FADE_MS);
  }


  // ---------------------------------------------------------
  // Mode toggle – only active when more than one module
  // ---------------------------------------------------------

  function attachToggle() {
    const container = document.getElementById("level-meter-container");
    if (!container) {
      console.warn("[MetricsMonitor] Cannot attach toggle — no meter container.");
      return;
    }

    if (ACTIVE_SEQUENCE.length <= 1) {
      container.style.cursor = "default";
      console.log("[MetricsMonitor] Toggle disabled (only one mode in MODULE_SEQUENCE).");
      return;
    }

    container.style.cursor = "pointer";

    container.addEventListener("click", () => {
      // Advance index in ACTIVE_SEQUENCE
      modeIndex = (modeIndex + 1) % ACTIVE_SEQUENCE.length;
      const nextMode = ACTIVE_SEQUENCE[modeIndex];
      switchModeWithFade(nextMode);
    });
  }


  // ---------------------------------------------------------
  // Volume slider: force 100% & disable user interaction
  // + try to set Amplification.gain to 1.0 if available
  // ---------------------------------------------------------

  function lockVolumeControls(retry = 0) {
    const MAX_RETRIES = 10;
    const RETRY_DELAY_MS = 500;

    const slider = document.getElementById("volumeSlider");

    if (slider) {
      // Hard-set slider to 100% and disable
      slider.value = "1";
      slider.disabled = true;
    } else if (retry < MAX_RETRIES) {
      // Slider not in DOM yet → retry later
      setTimeout(() => lockVolumeControls(retry + 1), RETRY_DELAY_MS);
    }

    // Try to set player gain to 1.0
    if (
      window.Stream &&
      Stream.Fallback &&
      Stream.Fallback.Player &&
      Stream.Fallback.Player.Amplification &&
      Stream.Fallback.Player.Amplification.gain
    ) {
      try {
        Stream.Fallback.Player.Amplification.gain.value = 1.0;
      } catch (e) {
        console.warn("[MetricsMonitor] Could not set Amplification.gain to 1.0:", e);
      }
    } else if (retry < MAX_RETRIES) {
      // Player not ready yet → also retry later
      setTimeout(() => lockVolumeControls(retry + 1), RETRY_DELAY_MS);
    }
  }


  // ---------------------------------------------------------
  // Panel creation
  // ---------------------------------------------------------

  function insertPanel() {
    const panels = document.querySelectorAll(".flex-container .panel-33.no-bg-phone");
    if (panels.length < 3) {
      console.error("[MetricsMonitor] Panel not found");
      return;
    }

    const panel = panels[2];
    panel.id = "signalPanel";
    panel.innerHTML = "";

    panel.style.cssText = `
      min-height: 235px;
      height: 235px;
      padding: 10px;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      gap: 6px;
      margin-top: -88px;
      overflow: hidden;
      align-items: stretch;
    `;

    // --- ICON BAR ---
    const icons = document.createElement("div");
    icons.id = "signal-icons";
    icons.style.position = "absolute";
    panel.appendChild(icons);

    // --- Mobile: shift header 10 px to the left ---
    if (window.innerWidth < 768) {
      icons.style.marginLeft = "14px";
    } else {
      icons.style.marginLeft = "-8px";
    }

    if (window.MetricsHeader?.initHeader) {
      MetricsHeader.initHeader(icons);
    }

    // --- METER CONTAINER ---
    const meters = document.createElement("div");
    meters.id = "level-meter-container";

    // Initial state: visible, transition is set in switchModeWithFade
    meters.style.opacity = "1";
    meters.style.marginTop = "25px";
    meters.style.width = "102%";
    meters.style.cursor = "pointer";

    // Tooltip class (uses your existing data-tooltip system)
    meters.classList.add("tooltip");

    // Tooltip text
    meters.setAttribute("data-tooltip", "Click to switch display mode");

    // Append container
    panel.appendChild(meters);

    // Build the initial mode from ACTIVE_SEQUENCE/START_INDEX (no fade)
    buildMeters();

    // Initial sync: send L0/L1 ONCE depending on MPXmode
    syncTextWebSocketMode(true);

    // Enable click-toggle depending on ACTIVE_SEQUENCE length
    attachToggle();
  }


  // ---------------------------------------------------------
  // Cleanup (hide old PTY/title elements)
  // ---------------------------------------------------------

  function cleanup() {
    const flags = document.getElementById("flags-container-desktop");
    if (flags) flags.style.visibility = "hidden";

    function remove() {
      document.querySelector(".data-pty.text-color-default")?.remove();
      document.querySelector("h3.color-4.flex-center")?.remove();
    }

    remove();

    new MutationObserver(remove)
      .observe(document.body, { childList: true, subtree: true });
  }

  // ---------------------------------------------------------
  // Inject small CSS snippet to visually "disable" the slider
  // ---------------------------------------------------------
  const style = document.createElement("style");
  style.innerHTML = `
    #volumeSlider {
      opacity: 0.4 !important;
      pointer-events: none !important;
    }
  `;
  document.head.appendChild(style);


  // ---------------------------------------------------------
  // Function for update notification in /setup
  // ---------------------------------------------------------
  function checkUpdate(setupOnly, pluginName, urlUpdateLink, urlFetchLink) {
    const rawPath = window.location.pathname || "/";
    // Normalize: remove trailing slashes
    const path = rawPath.replace(/\/+$/, "") || "/";
    const isSetupPath =
      path === "/setup" ||
      path.endsWith("/setup.php");

    console.log(
      `[${pluginName}] checkUpdate called: path="${rawPath}", normalized="${path}", setupOnly=${setupOnly}, isSetupPath=${isSetupPath}`
    );

    // If setupOnly is true, we still perform the FETCH (for console info),
    // but DOM manipulation only on /setup.
    // → no early return here!

    // Detect current plugin version from different possible globals
    let pluginVersionCheck =
      typeof pluginVersion   !== "undefined" ? pluginVersion   :
      typeof plugin_version  !== "undefined" ? plugin_version  :
      typeof PLUGIN_VERSION  !== "undefined" ? PLUGIN_VERSION  :
      "Unknown";

    console.log(`[${pluginName}] Local plugin version detected: ${pluginVersionCheck}`);

    // Inner async function to fetch and detect remote version
    async function fetchFirstLine() {
      const urlCheckForUpdate = urlFetchLink;

      try {
        console.log(`[${pluginName}] Fetching remote file for update check: ${urlCheckForUpdate}`);
        const response = await fetch(urlCheckForUpdate, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`[${pluginName}] update check HTTP error! status: ${response.status}`);
        }

        const text = await response.text();
        const lines = text.split("\n");

        let version;

        // Try to find a line with const pluginVersion / plugin_version / PLUGIN_VERSION
        if (lines.length > 2) {
          const versionLine = lines.find(line =>
            line.includes("const pluginVersion =") ||
            line.includes("const plugin_version =") ||
            line.includes("const PLUGIN_VERSION =")
          );

          if (versionLine) {
            const match = versionLine.match(
              /const\s+(?:pluginVersion|plugin_version|PLUGIN_VERSION)\s*=\s*['"]([^'"]+)['"]/
            );
            if (match) {
              version = match[1];
            }
          }
        }

        // Fallback: try first line if it starts with a digit
        if (!version) {
          const firstLine = lines[0].trim();
          version = /^\d/.test(firstLine) ? firstLine : "Unknown";
        }

        console.log(`[${pluginName}] Remote plugin version detected: ${version}`);
        return version;
      } catch (error) {
        console.error(`[${pluginName}] error fetching file:`, error);
        return null;
      }
    }

    // Check for updates
    fetchFirstLine().then(newVersion => {
      if (!newVersion) return;

      if (newVersion !== pluginVersionCheck && newVersion !== "Unknown") {
        let updateConsoleText =
          `There is a new version of this plugin available (${pluginVersionCheck} → ${newVersion})`;
        console.log(`[${pluginName}] ${updateConsoleText}`);

        // DOM update only on /setup, if desired
        if (!setupOnly || isSetupPath) {
          setupNotify(pluginVersionCheck, newVersion, pluginName, urlUpdateLink, isSetupPath);
        }
      } else {
        console.log(
          `[${pluginName}] No update available (local=${pluginVersionCheck}, remote=${newVersion})`
        );
      }
    });

    // Helper that writes message into /setup and draws red dot on plugin icon
    function setupNotify(pluginVersionCheck, newVersion, pluginName, urlUpdateLink, isSetupPath) {
      if (!isSetupPath) {
        console.log(`[${pluginName}] Update available, but not on /setup – DOM update skipped.`);
        return;
      }

      const pluginSettings = document.getElementById("plugin-settings");
      if (pluginSettings) {
        const currentText = pluginSettings.textContent.trim();
        const newText =
          `<a href="${urlUpdateLink}" target="_blank">` +
          `[${pluginName}] Update available: ${pluginVersionCheck} --> ${newVersion}</a><br>`;

        if (currentText === "No plugin settings are available.") {
          pluginSettings.innerHTML = newText;
        } else {
          pluginSettings.innerHTML += " " + newText;
        }
      } else {
        console.warn(`[${pluginName}] #plugin-settings not found on /setup`);
      }

      // Try different selectors to find plugin icon in sidebar
      const updateIcon =
        document.querySelector(".wrapper-outer #navigation .sidenav-content .fa-puzzle-piece") ||
        document.querySelector(".wrapper-outer .sidenav-content") ||
        document.querySelector(".sidenav-content");

      if (updateIcon) {
        const redDot = document.createElement("span");
        redDot.style.display = "block";
        redDot.style.width = "12px";
        redDot.style.height = "12px";
        redDot.style.borderRadius = "50%";
        redDot.style.backgroundColor = "#FE0830"; // or 'var(--color-main-bright)'
        redDot.style.marginLeft = "82px";
        redDot.style.marginTop = "-12px";

        updateIcon.appendChild(redDot);
        console.log(`[${pluginName}] Red update dot attached to plugin icon.`);
      } else {
        console.warn(`[${pluginName}] Could not find updateIcon element for red dot`);
      }
    }
  }


  // ---------------------------------------------------------
  // Loader bootstrap
  // ---------------------------------------------------------

  function start() {

    // --- Base CSS ---
    loadCss("css/metricsmonitor.css");

    // --- Header ---
    loadCss("css/metricsmonitor_header.css");

    // --- Meters ---
    loadCss("css/metricsmonitor_meters.css");

    // --- Equalizer ---
    loadCss("css/metricsmonitor-equalizer.css");

    // --- Analyzer ---
    loadCss("css/metricsmonitor-analyzer.css");

    // Load all JS modules
    Promise.all([
      loadScript("js/metricsmonitor-header.js"),
      loadScript("js/metricsmonitor-meters.js"),
      loadScript("js/metricsmonitor-equalizer.js"),
      loadScript("js/metricsmonitor-analyzer.js")
    ])
      .then(() => {
        insertPanel();
        cleanup();

        // Lock volume slider & gain after sub-scripts are loaded
        lockVolumeControls();
      })
      .catch(err => {
        console.error("[MetricsMonitor] FATAL LOAD ERROR:", err);
      });
  }

  // ---------------------------------------------------------
  // Trigger update check (console on all pages, DOM on /setup)
  // ---------------------------------------------------------
  if (CHECK_FOR_UPDATES) {
    checkUpdate(
      pluginSetupOnlyNotify,  // only show DOM stuff in /setup
      pluginName,
      pluginHomepageUrl,      // link that user can click for update
      pluginUpdateUrl         // raw file used to detect remote version
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

})();
