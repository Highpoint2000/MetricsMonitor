//////////////////////////////////////////////////////////////
///                                                          ///
///  METRICSMONITOR CLIENT SCRIPT FOR FM-DX-WEBSERVER (V1.0) ///
///                                                          ///
///  by Highpoint               last update: 25.11.2025      ///
///                                                          ///
///  https://github.com/Highpoint2000/metricsmonitor         ///
///                                                          ///
////////////////////////////////////////////////////////////////

(() => {
  const sampleRate = 48000;    // Do not touch - this value is automatically updated via the config file
  const stereoBoost = 1;       // Do not touch - this value is automatically updated via the config file
  const eqBoost = 1;           // Do not touch - this value is automatically updated via the config file
  const MODULE_SEQUENCE = [1,2,0];    // Do not touch - this value is automatically updated via the config file

  // ---------------------------------------------------------
  // Plugin version + update check configuration
  // ---------------------------------------------------------

  const plugin_version  = '1.1';   // MetricsMonitor client version (adjust when you release a new version)
  const updateInfo      = true;    // Enable or disable GitHub version check

  const plugin_name     = 'MetricsMonitor';
  const plugin_path     = 'https://raw.githubusercontent.com/Highpoint2000/MetricsMonitor/';
  // Path of THIS file inside the GitHub repo (adjust if needed)
  const plugin_JSfile   = 'main/plugins/MetricsMonitor/metricsmonitor.js';

  // LocalStorage key → one update notification per day
  const PluginUpdateKey = `${plugin_name}_lastUpdateNotification`;

  ///////////////////////////////////////////////////////////////

  let START_INDEX = 0;

  // safety: if sequence is empty, fall back to [0]
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

  // Public global state
  window.MetricsMonitor = window.MetricsMonitor || {};

  let globalSignalUnit = localStorage.getItem("mm_signal_unit") || "dbf";
  let signalUnitListeners = [];

  // Getter
  window.MetricsMonitor.getSignalUnit = function () {
    return globalSignalUnit;
  };

  // Setter (internal + sub-scripts)
  window.MetricsMonitor.setSignalUnit = function (unit) {
    if (!unit) return;
    unit = unit.toLowerCase();

    console.log("[MetricsMonitor] SET SIGNAL UNIT →", unit);

    globalSignalUnit = unit;
    localStorage.setItem("mm_signal_unit", unit);

    // Notify listeners
    signalUnitListeners.forEach(fn => fn(unit));
  };

  // Listener API
  window.MetricsMonitor.onSignalUnitChange = function (fn) {
    if (typeof fn === "function") {
      signalUnitListeners.push(fn);
    }
  };

  // Dropdown scanner
  function hookSignalUnitDropdown() {
    const input = document.getElementById("signal-selector-input");
    const options = document.querySelectorAll("#signal-selector .option");

    if (!input || options.length === 0) {
      console.warn("[MetricsMonitor] Signal unit dropdown not found – retrying…");
      setTimeout(hookSignalUnitDropdown, 500);
      return;
    }

    console.log("[MetricsMonitor] Signal unit dropdown found");

    // 1) Restore stored value
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
  // Mode switching with fast fade-out / fade-in animation
  // ---------------------------------------------------------

  function switchModeWithFade(nextMode) {
    const meters = document.getElementById("level-meter-container");
    if (!meters) {
      mode = nextMode;
      buildMeters();
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
    panel.appendChild(meters);

    // Build the initial mode from ACTIVE_SEQUENCE/START_INDEX (no fade)
    buildMeters();

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
  // Version check helper functions (GitHub)
  // ---------------------------------------------------------

  // Only show one update notification per day
  function shouldShowNotification() {
    try {
      const lastNotificationDate = localStorage.getItem(PluginUpdateKey);
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

      if (lastNotificationDate === today) {
        return false;
      }
      localStorage.setItem(PluginUpdateKey, today);
      return true;
    } catch (e) {
      console.warn(`[${plugin_name}] localStorage not available for update check`, e);
      return true; // fall back: allow notification
    }
  }

  // Compare versions like "1.0", "2.6b", "3.5.1a", …
  function compareVersions(local, remote) {
    const parseVersion = (version) =>
      String(version)
        .split(/(\d+|[a-z]+)/i)
        .filter(Boolean)
        .map((part) => (isNaN(part) ? part : parseInt(part, 10)));

    const localParts  = parseVersion(local);
    const remoteParts = parseVersion(remote);

    for (let i = 0; i < Math.max(localParts.length, remoteParts.length); i++) {
      const localPart  = localParts[i]  ?? 0;
      const remotePart = remoteParts[i] ?? 0;

      if (typeof localPart === 'number' && typeof remotePart === 'number') {
        if (localPart > remotePart) return 1;
        if (localPart < remotePart) return -1;
      } else if (typeof localPart === 'string' && typeof remotePart === 'string') {
        if (localPart > remotePart) return 1;
        if (localPart < remotePart) return -1;
      } else {
        // Numeric parts are "less than" string parts (e.g., 3.5 < 3.5a)
        return typeof localPart === 'number' ? -1 : 1;
      }
    }

    return 0; // equal
  }

  // Fetch remote script from GitHub and compare plugin_version
  function checkplugin_version() {
    if (!updateInfo) return;

    const remoteUrl = `${plugin_path}${plugin_JSfile}`;
    console.log(`[${plugin_name}] Checking for updates from:`, remoteUrl);

    fetch(remoteUrl)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.text();
      })
      .then(script => {
        // Look for a line: const plugin_version = '...';
        const match = script.match(/const\s+plugin_version\s*=\s*'([\d.]+[a-z]*)?';/);
        if (!match) {
          console.error(`${plugin_name}: Plugin version could not be found in remote script.`);
          return;
        }

        const externalVersion = match[1];
        const comparison      = compareVersions(plugin_version, externalVersion);

        if (comparison === 1) {
          console.log(`${plugin_name}: Local version (${plugin_version}) is newer than GitHub version (${externalVersion}).`);
        } else if (comparison === 0) {
          console.log(`${plugin_name}: Local version matches GitHub version (${plugin_version}).`);
        } else if (comparison === -1) {
          // Remote is newer
          if (shouldShowNotification()) {
            console.log(`${plugin_name}: Plugin update available: ${plugin_version} -> ${externalVersion}`);

            if (typeof sendToast === 'function') {
              // Same toast style as LiveMap
              sendToast(
                'warning important',
                plugin_name,
                `Update available:<br>${plugin_version} → ${externalVersion}`,
                false,
                false
              );
            } else {
              // Fallback if toast function is missing
              console.warn(
                `${plugin_name}: sendToast() not available – update: ${plugin_version} → ${externalVersion}`
              );
            }
          }
        }
      })
      .catch(error => {
        console.error(`${plugin_name}: Error fetching the plugin script for version check:`, error);
      });
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

    // Start version check (independent of module loading)
    if (updateInfo) {
      try {
        checkplugin_version();
      } catch (e) {
        console.error("[MetricsMonitor] Version check failed:", e);
      }
    }

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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

})();
