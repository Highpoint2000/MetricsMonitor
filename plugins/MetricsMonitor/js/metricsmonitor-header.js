///////////////////////////////////////////////////////////////
/// Upper Section: Stereo / ECC / PTY / TA / TP / RDS       ///
///////////////////////////////////////////////////////////////

(() => {
const sampleRate = 48000;    // Do not touch - this value is automatically updated via the config file
const stereoBoost = 1;       // Do not touch - this value is automatically updated via the config file
const eqBoost = 1;           // Do not touch - this value is automatically updated via the config file


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

  let prevRdsState = false;
  let prevStereoState = false;
  let prevTpState   = null;
  let prevTaState   = null;
  let TextSocket = null;

  // Simple logging helpers for this header module
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

    // --- ECC (Extended Country Code) badge ---
    const eccWrapper = document.getElementById('eccWrapper');
    if (eccWrapper) {
      // Clear previous content each update
      eccWrapper.innerHTML = "";

      const hasEcc = message.ecc !== undefined && message.ecc !== null && message.ecc !== "";

      if (!hasEcc) {
        // No ECC → small "No ECC" badge
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
        const eccSpan = document.querySelector('.data-flag');
        if (eccSpan && eccSpan.innerHTML.trim() !== "") {
          eccWrapper.appendChild(eccSpan.cloneNode(true));
        } else {
          // Fallback: simple grey "ECC"
          const noEcc = document.createElement('span');
          noEcc.textContent = 'ECC';
          noEcc.style.color = '#696969';
          noEcc.style.fontSize = '13px';
          eccWrapper.appendChild(noEcc);
        }
      }
    }

    // --- Stereo indicator and stereo pilot "level" ---
    const stereoIcon = document.getElementById('stereoIcon');
    if (stereoIcon) {
      if (message.st === true) {
        // Stereo just turned on → initialize pilot level randomly
        if (prevStereoState === false) {
          levels.stereoPilot = Math.floor(Math.random() * (50 - 10 + 1)) + 10;
        }
        stereoIcon.classList.add('stereo-on');
        stereoIcon.classList.remove('stereo-off');
      } else {
        // Mono → very low pilot level
        stereoIcon.classList.add('stereo-off');
        stereoIcon.classList.remove('stereo-on');
        levels.stereoPilot = 3;
      }
      prevStereoState = message.st === true;
    }
    updateMeter('stereo-pilot-meter', levels.stereoPilot);

    // --- RDS indicator and "level" ---
    const rdsIcon = document.getElementById('rdsIcon');
    const hasRds = (message.rds === true);
    if (hasRds) {
      // RDS just appeared → random level in a useful range
      if (prevRdsState === false) {
        levels.rds = Math.floor(Math.random() * (40 - 10 + 1)) + 10;
      }
    } else {
      // No RDS → very low level
      levels.rds = 3;
    }
    if (rdsIcon) {
      const rdsSrc = hasRds
        ? '/js/plugins/MetricsMonitor/images/rds_on.png'
        : '/js/plugins/MetricsMonitor/images/rds_off.png';
      setIconSrc(rdsIcon, rdsSrc);
    }
    prevRdsState = hasRds;
    updateMeter('rds-meter', levels.rds);

    // --- TP (Traffic Programme) icon ---
    const tpIcon = document.getElementById('tpIcon');
    const tpState = (message.tp === 1);
    if (tpIcon) {
      const tpSrc = tpState
        ? '/js/plugins/MetricsMonitor/images/tp_on.png'
        : '/js/plugins/MetricsMonitor/images/tp_off.png';
      setIconSrc(tpIcon, tpSrc);
    }
    prevTpState = tpState;

    // --- TA (Traffic Announcement) icon ---
    const taIcon = document.getElementById('taIcon');
    const taState = (message.ta === 1);
    if (taIcon) {
      const taSrc = taState
        ? '/js/plugins/MetricsMonitor/images/ta_on.png'
        : '/js/plugins/MetricsMonitor/images/ta_off.png';
      setIconSrc(taIcon, taSrc);
    }
    prevTaState = taState;
  }

  /**
   * Initialize the WebSocket used for text / status messages.
   * Reconnects automatically on close.
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
   * Build and attach the header UI (ECC badge, stereo icon, PTY label,
   * TP/TA/RDS icons) into the given `iconsBar` container.
   */
  function initHeader(iconsBar) {

    // --- Group: ECC badge + Stereo icon + PTY label ---
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
    if (eccSpan && eccSpan.innerHTML.trim() !== "") {
      eccWrapper.appendChild(eccSpan.cloneNode(true));
    } else {
      const noEcc = document.createElement('span');
      noEcc.textContent = 'ECC';
      noEcc.style.color = '#696969';
      noEcc.style.fontSize = '13px';
      eccWrapper.appendChild(noEcc);
    }

    // --- Stereo icon (cloned from original TEF Logger stereo container) ---
    const stereoSource = document.querySelector('.stereo-container');
    if (stereoSource) {
      const stereoClone = stereoSource.cloneNode(true);
      stereoClone.id = 'stereoIcon';
      stereoClone.removeAttribute('style');  // use our own CSS
      stereoClone.classList.add("tooltip");
      stereoClone.setAttribute("data-tooltip", "Stereo / Mono toggle. Click to toggle.");
      leftGroup.appendChild(stereoClone);
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

  // Expose the init function for the main plugin code
  window.MetricsHeader = {
    initHeader
  };
})();
