///////////////////////////////////////////////////////////////
/// Upper Section: Stereo / ECC / PTY / TA / TP / RDS       ///
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

  // PTY code → human-readable label mapping
  const PTY_TABLE = [
    "PTY", "News", "Current Affairs", "Info",
    "Sport", "Education", "Drama", "Culture", "Science", "Varied",
    "Pop Music", "Rock Music", "Easy Listening", "Light Classical",
    "Serious Classical", "Other Music", "Weather", "Finance",
    "Children's Programmes", "Social Affairs", "Religion", "Phone-in",
    "Travel", "Leisure", "Jazz Music", "Country Music", "National Music",
    "Oldies Music", "Folk Music", "Documentary"
  ];

  let TextSocket = null;

  // Last real stereo state from the signal
  let prevStereoState = false;
  // When true, L1 is active → force mono display
  let forcedMonoByL1 = false;

  // Previous RDS state (for ramping meter on change)
  let prevRdsState = false;

  // Simple logging helpers
  function logInfo(...msg) {
    console.log('[MetricsHeader]', ...msg);
  }

  function logError(...msg) {
    console.error('[MetricsHeader]', ...msg);
  }

  // Helper: only change icon src when it actually changed
  function setIconSrc(img, src) {
    if (!img) return;
    if (img.dataset.currentSrc === src) return;
    img.src = src;
    img.dataset.currentSrc = src;
  }

  // ---------------------------------------------------------
  // Stereo/Mono circle symbol helpers
  // ---------------------------------------------------------

  function getStereoIcon() {
    return document.getElementById('stereoIcon');
  }

  function getStereoCircles() {
    const icon = getStereoIcon();
    if (!icon) return { c1: null, c2: null };

    const c1 = icon.querySelector('.circle1');
    const c2 = icon.querySelector('.circle2');
    return { c1, c2 };
  }

  // Reset only style properties that this script may touch
  function resetIconStyle(icon) {
    if (!icon) return;
    icon.style.opacity       = '';
    icon.style.filter        = '';
    icon.style.pointerEvents = '';
    icon.style.cursor        = '';
    icon.style.marginLeft    = '';
	icon.style.marginRight   = '';
  }

  // Mono form: only circle1 visible, circle2 hidden
  function applyMonoCircles(dimForced) {
    const { c1, c2 } = getStereoCircles();
    if (c1) {
      c1.style.opacity = '1';
      c1.style.display = '';
      c1.style.filter  = '';
      c1.style.marginLeft = '0px';
      // fixed per request
    }
    if (c2) {
      c2.style.opacity = '0';
      c2.style.display = 'none';
      c2.style.filter  = '';
	  c2.style.marginLeft = '0px';
    }
  }

  // Real stereo: both circles visible; icon style from CSS
  function showStereoSymbol() {
    const icon = getStereoIcon();
    const { c1, c2 } = getStereoCircles();
    if (!icon) return;

    resetIconStyle(icon);
    icon.classList.remove('stereo-mono');

    if (c1) {
      c1.style.opacity = '';
      c1.style.filter  = '';
      c1.style.display = '';
    }
    if (c2) {
      c2.style.opacity = '';
      c2.style.filter  = '';
      c2.style.display = '';
    }
  }

  // Mono:
  //  • L0 (dimForced=false)
  //  • L1 (dimForced=true)
  function showMonoSymbol(dimForced) {
    const icon = getStereoIcon();
    if (!icon) return;

    icon.classList.add('stereo-mono');

    if (dimForced) {
      // Forced mono (L1)
      icon.style.opacity       = '1';
      icon.style.pointerEvents = 'none';
      icon.style.cursor        = 'default';
	  if (prevStereoState) {
		icon.style.marginLeft    = '4px';
		icon.style.marginRight    = '0px';
	  } else {
		icon.style.marginLeft    = '4px';
		icon.style.marginRight    = '0px';
	  }
    } else {
      // Real mono (L0)
      resetIconStyle(icon);
    }

    applyMonoCircles(dimForced);
  }

  function applyForcedMonoDisplay() {
    showMonoSymbol(true);
    // logInfo("Stereo header indicator forced to MONO (L1 active).");
  }

  function applyRealStereoDisplayFromPrev() {
    const icon = getStereoIcon();
    resetIconStyle(icon);

    if (prevStereoState) {
      showStereoSymbol();
      logInfo("Stereo header indicator restored to STEREO (L0, real signal).");
    } else {
      showMonoSymbol(false);
      logInfo("Stereo header indicator restored to MONO (L0, real signal).");
    }
  }

  // Called from metricsmonitor.js after sending L0 / L1
  function setMonoLockFromMode(cmdRaw) {
    const cmd = String(cmdRaw).trim().toUpperCase();

    if (cmd === "L1") {
      forcedMonoByL1 = true;
      logInfo('L1 from client – forcing stereo indicator to MONO.');
      applyForcedMonoDisplay();
    } else if (cmd === "L0") {
      const wasLocked = forcedMonoByL1;
      forcedMonoByL1 = false;
      logInfo('L0 from client – restoring stereo indicator to real mono/stereo state.');
      if (wasLocked) {
        applyRealStereoDisplayFromPrev();
      }
    }
  }

  /**
   * Handle incoming JSON messages from the WebSocket
   * and update meters / icons / labels in the header.
   */
  function handleTextSocketMessage(message) {
    const meters = window.MetricsMeters;
    if (!meters) return;
    const { levels, updateMeter } = meters;

    // --- HF level (signal strength) ---
    if (message.sig !== undefined) {
      levels.hf = Math.round((message.sig - 7) * 10) / 10;
      updateMeter('hf-meter', levels.hf);
    }

    // --- PTY label (Programme Type) ---
    if (message.pty !== undefined) {
      let ptyIndex = Number(message.pty);
      if (Number.isNaN(ptyIndex) || ptyIndex < 0 || ptyIndex >= PTY_TABLE.length) {
        ptyIndex = 0;
      }
      const ptyText = PTY_TABLE[ptyIndex];

      const ptyLabel = document.getElementById('ptyLabel');
      if (ptyLabel) {
        ptyLabel.textContent = ptyText;
        if (ptyText === "PTY") {
          // No valid PTY → greyed "PTY"
          ptyLabel.style.color = "#696969";
          ptyLabel.style.borderColor = "#696969";
          ptyLabel.style.fontWeight = "bold";
        } else {
          // Valid PTY → normal white text
          ptyLabel.style.color = "#fff";
          ptyLabel.style.borderColor = "#fff";
          ptyLabel.style.fontWeight = "normal";
        }
      }

      // Background color of the signal panel depending on PTY presence
      const panel = document.getElementById('signalPanel');
      if (panel) {
        if (ptyText !== "PTY") {
          panel.style.setProperty('background-color', 'var(--color-2-transparent)', 'important');
        } else {
          panel.style.setProperty('background-color', 'var(--color-1-transparent)', 'important');
        }
      }
    }

    // --- Stereo / Mono indicator (message.st) ---
    if (message.st !== undefined) {
      const isStereo = (message.st === true || message.st === 1);

      // remember real state for later restore on L0
      prevStereoState = isStereo;

      if (forcedMonoByL1) {
        // L1 active → immer Mono-Symbol, egal was st sendet
        applyForcedMonoDisplay();
      } else {
        // Real display in L0
        if (isStereo) {
          showStereoSymbol();
        } else {
          showMonoSymbol(false);
        }
      }
    }

    // --- ECC (Extended Country Code) badge ---
    const eccWrapper = document.getElementById('eccWrapper');
    if (eccWrapper) {
      // Clear previous content each update
      eccWrapper.innerHTML = "";

      // Log incoming ECC value for debugging
      // logInfo("ECC update received:", message.ecc);

      // Decide if there is a usable ECC flag.
      // If .data-flag is missing or empty → no ECC.
      // Additionally, if .data-flag contains an <i> with class 'flag-sm-UN' → treat as no ECC.
      const eccSpan = document.querySelector('.data-flag');
      const eccSpanHasContent = eccSpan && eccSpan.innerHTML && eccSpan.innerHTML.trim() !== "";

      let eccSpanIsPlaceholderUN = false;
      if (eccSpanHasContent) {
        const iElem = eccSpan.querySelector('i');
        if (iElem && iElem.className) {
          // check whether the flag element indicates UN placeholder (class contains 'flag-sm-UN')
          const classes = iElem.className.split(/\s+/);
          if (classes.includes('flag-sm-UN') || classes.some(c => c === 'flag-sm-UN')) {
            eccSpanIsPlaceholderUN = true;
          }
        }
      }

      const hasEcc = eccSpanHasContent && !eccSpanIsPlaceholderUN && message.ecc !== undefined && message.ecc !== null && message.ecc !== "";

      // logInfo("Computed hasEcc:", hasEcc, "eccSpanIsPlaceholderUN:", eccSpanIsPlaceholderUN);

      if (!hasEcc) {
        // No ECC → small "No ECC" badge
        // logInfo("No ECC value found or placeholder UN → showing grey 'ECC' placeholder.");
        const noEcc = document.createElement('span');
        noEcc.textContent = 'ECC';
        noEcc.style.color = '#696969';
        noEcc.style.fontSize = '13px';
        noEcc.style.fontWeight = 'bold';
        noEcc.style.border = "1px solid #696969";
        noEcc.style.borderRadius = "3px";
        noEcc.style.padding = "0 2px";
        noEcc.style.lineHeight = "1.2";
        eccWrapper.appendChild(noEcc);
      } else {
        // ECC present → try to reuse existing ECC flag (if available)
        logInfo(".data-flag element query result:", eccSpan);
        if (eccSpan) {
          const inner = eccSpan.innerHTML ? eccSpan.innerHTML.trim() : "";
          logInfo(".data-flag innerHTML length:", inner.length, "preview:", inner.substring(0,120));
        }
        if (eccSpan && eccSpan.innerHTML.trim() !== "") {
          logInfo("Cloning .data-flag to eccWrapper.");
          eccWrapper.appendChild(eccSpan.cloneNode(true));
        } else {
          // Fallback: simple grey "ECC"
          logInfo("No usable .data-flag found or it's empty → showing fallback 'ECC'.");
          const noEcc = document.createElement('span');
          noEcc.textContent = 'ECC';
          noEcc.style.color = '#696969';
          noEcc.style.fontSize = '13px';
          eccWrapper.appendChild(noEcc);
        }
      }
    }

    // --- RDS ---
    // Accept either boolean true or numeric 1 for "on"
    if (message.rds !== undefined) {
      const rdsIcon = document.getElementById('rdsIcon');
      const rdsOn = (message.rds === true || message.rds === 1);
      if (rdsOn) {
        if (prevRdsState === false) {
          // bump meter on change to "on"
          levels.rds = Math.floor(Math.random() * (40 - 10 + 1)) + 10;
        }
        setIconSrc(rdsIcon, '/js/plugins/MetricsMonitor/images/rds_on.png');
      } else {
        levels.rds = 3;
        setIconSrc(rdsIcon, '/js/plugins/MetricsMonitor/images/rds_off.png');
      }
      prevRdsState = rdsOn;
      updateMeter('rds-meter', levels.rds);
    }

    // --- TP ---
    if (message.tp !== undefined) {
      const tpIcon = document.getElementById('tpIcon');
      const tpOn = (message.tp === 1 || message.tp === true);
      if (tpIcon) {
        setIconSrc(tpIcon, tpOn ? '/js/plugins/MetricsMonitor/images/tp_on.png' : '/js/plugins/MetricsMonitor/images/tp_off.png');
      }
    }

    // --- TA ---
    if (message.ta !== undefined) {
      const taIcon = document.getElementById('taIcon');
      const taOn = (message.ta === 1 || message.ta === true);
      if (taIcon) {
        setIconSrc(taIcon, taOn ? '/js/plugins/MetricsMonitor/images/ta_on.png' : '/js/plugins/MetricsMonitor/images/ta_off.png');
      }
    }
  }

  /**
   * Initialize the WebSocket used for text / status messages.
   * Reconnects automatically on close.
   * → uses window.socketPromise
   */
  async function setupTextSocket() {
    if (TextSocket && TextSocket.readyState !== WebSocket.CLOSED) return;

    try {
      // window.socketPromise is provided by the main webserver code
      TextSocket = await window.socketPromise;

      TextSocket.addEventListener("open", () => {
        logInfo("WebSocket connected.");
      });

      TextSocket.addEventListener("message", (evt) => {
        try {
          const data = JSON.parse(evt.data);
          handleTextSocketMessage(data);
        } catch (err) {
          logError("Error parsing TextSocket message:", err);
        }
      });

      TextSocket.addEventListener("error", (err) => {
        logError("TextSocket error:", err);
      });

      TextSocket.addEventListener("close", () => {
        logInfo("TextSocket closed.");
        // Try to reconnect after a short delay
        setTimeout(setupTextSocket, 5000);
      });
    } catch (error) {
      logError("Failed to setup TextSocket:", error);
      // Retry on failure as well
      setTimeout(setupTextSocket, 5000);
    }
  }

  /**
   * Build and attach the header UI (ECC badge, stereo/mono, PTY label,
   * TP/TA/RDS icons) into the given `iconsBar` container.
   */
  function initHeader(iconsBar) {

    // --- Group: ECC badge + Stereo symbol + PTY label ---
    const leftGroup = document.createElement('div');
    leftGroup.style.display = 'flex';
    leftGroup.style.alignItems = 'center';
    leftGroup.style.gap = '10px';
    iconsBar.appendChild(leftGroup);

    // --- ECC wrapper ---
    const eccWrapper = document.createElement('span');
    eccWrapper.id = 'eccWrapper';
    eccWrapper.style.display = 'inline-flex';
    eccWrapper.style.alignItems = 'center';
    eccWrapper.style.whiteSpace = 'nowrap';
    leftGroup.appendChild(eccWrapper);

    // Try to clone an existing ECC flag from TEF Logger UI, otherwise show "ECC"
    const eccSpan = document.querySelector('.data-flag');
    logInfo("initHeader: .data-flag query result:", eccSpan);

    // Decide whether eccSpan is usable or a UN placeholder:
    const eccSpanHasContent = eccSpan && eccSpan.innerHTML && eccSpan.innerHTML.trim() !== "";
    let eccSpanIsPlaceholderUN = false;
    if (eccSpanHasContent) {
      const iElem = eccSpan.querySelector('i');
      if (iElem && iElem.className) {
        const classes = iElem.className.split(/\s+/);
        if (classes.includes('flag-sm-UN') || classes.some(c => c === 'flag-sm-UN')) {
          eccSpanIsPlaceholderUN = true;
        }
      }
    }

    if (eccSpanHasContent && !eccSpanIsPlaceholderUN) {
      logInfo("initHeader: cloning existing .data-flag into eccWrapper.");
      eccWrapper.appendChild(eccSpan.cloneNode(true));
    } else {
      logInfo("initHeader: no usable .data-flag found or it's placeholder UN → adding placeholder 'ECC'.");
      const noEcc = document.createElement('span');
      noEcc.textContent = 'ECC';
      noEcc.style.color = '#696969';
      noEcc.style.fontSize = '13px';
      eccWrapper.appendChild(noEcc);
    }

    // --- Stereo circle symbol cloned from .stereo-container ---
    const stereoSource = document.querySelector('.stereo-container');
    if (stereoSource) {
      const stereoClone = stereoSource.cloneNode(true);
      stereoClone.id = 'stereoIcon';
      stereoClone.removeAttribute('style');  // use our own layout
      stereoClone.classList.add("tooltip");
      stereoClone.setAttribute("data-tooltip", "Stereo / Mono indicator. Click to toggle.");
      stereoClone.style.marginLeft = '0px';
      stereoClone.style.cursor     = 'default'; // indicator only, no toggle
      leftGroup.appendChild(stereoClone);

      // Initial look: treat as mono until first st value comes in
      showMonoSymbol(false);
    }

    // --- PTY label placeholder ---
    const ptyLabel = document.createElement('span');
    ptyLabel.id = 'ptyLabel';
    ptyLabel.textContent = 'PTY';
    ptyLabel.style.color = '#696969';
    ptyLabel.style.fontSize = '13px';
    ptyLabel.style.width = '100px';
    leftGroup.appendChild(ptyLabel);

    // --- TP / TA / RDS PNG icons ---
    const iconMap = [
      { id: 'tpIcon',  off: '/js/plugins/MetricsMonitor/images/tp_off.png' },
      { id: 'taIcon',  off: '/js/plugins/MetricsMonitor/images/ta_off.png' },
      { id: 'rdsIcon', off: '/js/plugins/MetricsMonitor/images/rds_off.png' }
    ];
    iconMap.forEach(({ id, off }) => {
      const img = document.createElement('img');
      img.className = 'status-icon';
      img.id = id;
      img.alt = id;
      setIconSrc(img, off);
      iconsBar.appendChild(img);
    });

    // Start WebSocket for text/status data
    setupTextSocket();
  }

  // Expose functions for the main plugin code
  window.MetricsHeader = {
    initHeader,
    setMonoLockFromMode
  };
})();