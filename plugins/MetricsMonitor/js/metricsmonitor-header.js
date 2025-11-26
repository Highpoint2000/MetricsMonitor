///////////////////////////////////////////////////////////////
/// Upper Section: Stereo / ECC / PTY / TA / TP / RDS       ///
///////////////////////////////////////////////////////////////

(() => {
const sampleRate = 48000;    // Do not touch - this value is automatically updated via the config file
const stereoBoost = 1;    // Do not touch - this value is automatically updated via the config file
const eqBoost = 1;    // Do not touch - this value is automatically updated via the config file


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
  let TextSocket = null;

  // Simple logging helpers for this header module
  function logInfo(...msg) {
    console.log('[MetricsHeader]', ...msg);
  }

  function logError(...msg) {
    console.error('[MetricsHeader]', ...msg);
  }

  /**
   * Handle incoming WebSocket messages for the text / status data.
   *
   * Expects a structure similar to:
   * {
   *   sig:  37.2,   // signal strength
   *   pty:  10,     // PTY code
   *   st:   true,   // stereo flag
   *   ecc:  "NLD",  // ECC country code string or null
   *   rds:  true,   // RDS present
   *   tp:   1,      // TP bit
   *   ta:   0       // TA bit
   * }
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
      const ptyText = PTY_TABLE[message.pty] || `PTY ${message.pty}`;
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
    }

    // --- Stereo icon + Pilot level ---
    if (message.st !== undefined) {
      const stereoIcon = document.getElementById('stereoIcon');

      // If we have a stereo flag “on”
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

    // --- ECC (Extended Country Code) badge ---
    const eccWrapper = document.getElementById('eccWrapper');
    if (eccWrapper) {
      // Clear previous content each update
      eccWrapper.innerHTML = "";
      if (message.ecc === null) {
        // No ECC available → show grey "ECC"
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
          noEcc.style.fontWeight = 'bold';
          noEcc.style.border = "1px solid #696969";
          noEcc.style.borderRadius = "3px";
          noEcc.style.padding = "0 2px";
          noEcc.style.lineHeight = "1.2";
          eccWrapper.appendChild(noEcc);
        }
      }
    }

    // --- RDS indicator and "level" ---
    const rdsIcon = document.getElementById('rdsIcon');
    if (message.rds === true) {
      // RDS just appeared → random level in a useful range
      if (prevRdsState === false) {
        levels.rds = Math.floor(Math.random() * (40 - 10 + 1)) + 10;
      }
    } else {
      // No RDS → very low level
      levels.rds = 3;
    }
    prevRdsState = message.rds === true;

    if (rdsIcon) {
      const newRdsSrc = message.rds === true
        ? '/js/plugins/MetricsMonitor/images/rds_on.png'
        : '/js/plugins/MetricsMonitor/images/rds_off.png';
      if (rdsIcon.dataset.currentSrc !== newRdsSrc) {
        rdsIcon.src = newRdsSrc;
        rdsIcon.dataset.currentSrc = newRdsSrc;
      }
    }

    updateMeter('rds-meter', levels.rds);

    // --- TP (Traffic Programme) icon ---
    const tpIcon = document.getElementById('tpIcon');
    if (tpIcon) {
      const newTpSrc = message.tp === 1
        ? '/js/plugins/MetricsMonitor/images/tp_on.png'
        : '/js/plugins/MetricsMonitor/images/tp_off.png';
      if (tpIcon.dataset.currentSrc !== newTpSrc) {
        tpIcon.src = newTpSrc;
        tpIcon.dataset.currentSrc = newTpSrc;
      }
    }

    // --- TA (Traffic Announcement) icon ---
    const taIcon = document.getElementById('taIcon');
    if (taIcon) {
      const newTaSrc = message.ta === 1
        ? '/js/plugins/MetricsMonitor/images/ta_on.png'
        : '/js/plugins/MetricsMonitor/images/ta_off.png';
      if (taIcon.dataset.currentSrc !== newTaSrc) {
        taIcon.src = newTaSrc;
        taIcon.dataset.currentSrc = newTaSrc;
      }
    }
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

      TextSocket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
        handleTextSocketMessage(message);
      });

      TextSocket.addEventListener("error", (error) => {
        logError("TextSocket error:", error);
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
   * TP / TA / RDS icons) to the given icons bar element.
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

    // --- Stereo icon ---
    const stereoIcon = document.createElement('span');
    stereoIcon.id = 'stereoIcon';
    stereoIcon.className = 'stereo-icon stereo-off';
    stereoIcon.title = 'Stereo';
    leftGroup.appendChild(stereoIcon);

    // --- PTY label ---
    const ptyLabel = document.createElement('span');
    ptyLabel.id = 'ptyLabel';
    ptyLabel.className = 'pty-label';
    ptyLabel.textContent = 'PTY';
    leftGroup.appendChild(ptyLabel);

    // --- Right group: TP / TA / RDS icons ---
    const rightGroup = document.createElement('div');
    rightGroup.style.display = 'flex';
    rightGroup.style.alignItems = 'center';
    rightGroup.style.gap = '6px';
    rightGroup.style.marginLeft = 'auto';
    iconsBar.appendChild(rightGroup);

    const icons = [
      { id: 'tpIcon',  title: 'TP',  on: 'tp_on.png',  off: 'tp_off.png' },
      { id: 'taIcon',  title: 'TA',  on: 'ta_on.png',  off: 'ta_off.png' },
      { id: 'rdsIcon', title: 'RDS', on: 'rds_on.png', off: 'rds_off.png' }
    ];

    icons.forEach(({ id, title, on, off }) => {
      const img = document.createElement('img');
      img.id = id;
      img.className = 'status-icon';
      img.title = title;
      img.alt = id;
      img.src = off;
      rightGroup.appendChild(img);
    });

    // Start WebSocket for text/status data
    setupTextSocket();
  }

  // Expose the init function for the main plugin code
  window.MetricsHeader = {
    initHeader
  };
})();
