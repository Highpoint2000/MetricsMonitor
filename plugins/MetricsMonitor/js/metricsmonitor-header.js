///////////////////////////////////////////////////////////////
//                                                           //
//  metricsmonitor-header.js						 (V1.4)  //
//                                                           //
//  by Highpoint               last update: 20.12.2025       //
//                                                           //
//  Thanks for support by                                    //
//  Jeroen Platenkamp, Bkram, Wötkylä, AmateurAudioDude      //
//                                                           //
//  https://github.com/Highpoint2000/metricsmonitor          //
//                                                           //
///////////////////////////////////////////////////////////////

(() => {
const MODULE_SEQUENCE = [1,2,0,3,4];    // Do not touch - this value is automatically updated via the config file
const CANVAS_SEQUENCE = [4,2];    // Do not touch - this value is automatically updated via the config file
const sampleRate = 48000;    // Do not touch - this value is automatically updated via the config file
const MPXboost = 0;    // Do not touch - this value is automatically updated via the config file
const MPXmode = "off";    // Do not touch - this value is automatically updated via the config file
const MPXStereoDecoder = "off";    // Do not touch - this value is automatically updated via the config file
const MPXInputCard = "";    // Do not touch - this value is automatically updated via the config file
const fftLibrary = "fft-js";    // Do not touch - this value is automatically updated via the config file
const fftSize = 1024;    // Do not touch - this value is automatically updated via the config file
const SpectrumAverageLevel = 15;    // Do not touch - this value is automatically updated via the config file
const minSendIntervalMs = 30;    // Do not touch - this value is automatically updated via the config file
const pilotCalibration = 0;    // Do not touch - this value is automatically updated via the config file
const mpxCalibration = 0;    // Do not touch - this value is automatically updated via the config file
const rdsCalibration = 0;    // Do not touch - this value is automatically updated via the config file
const CurveYOffset = -40;    // Do not touch - this value is automatically updated via the config file
const CurveYDynamics = 1.9;    // Do not touch - this value is automatically updated via the config file
const stereoBoost = 1;    // Do not touch - this value is automatically updated via the config file
const eqBoost = 1;    // Do not touch - this value is automatically updated via the config file
const LockVolumeSlider = true;    // Do not touch - this value is automatically updated via the config file
const EnableSpectrumOnLoad = false;    // Do not touch - this value is automatically updated via the config file

// Configuration constants - updated automatically via config file
  ///////////////////////////////////////////////////////////////

  // PTY Code -> Human Readable Label Mapping
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

  // State Tracking
  let prevStereoState = false;
  let currentIsForced = false;
  let b2Active = false;
  let isClickLocked = false;
  let prevRdsState = false;

  // Logging Helpers
  function logInfo(...msg) {
    console.log('[MetricsHeader]', ...msg);
  }

  function logError(...msg) {
    console.error('[MetricsHeader]', ...msg);
  }

  // Update icon source only on change
  function setIconSrc(img, src) {
    if (!img) return;
    if (img.dataset.currentSrc === src) return;
    img.src = src;
    img.dataset.currentSrc = src;
  }

  // Handle Mode Updates from main script
  function setMonoLockFromMode(cmdRaw) {
    const cmd = String(cmdRaw).trim().toUpperCase();

    if (cmd === "B2") {
      logInfo('B2 received: Click disabled, B2 Mode active.');
      b2Active = true;
      isClickLocked = true;
    } else if (cmd === "B0" || cmd === "B1") {
      logInfo(`${cmd} received: Click enabled, B2 Mode inactive.`);
      b2Active = false;
      isClickLocked = false;
    }
  }

  /**
   * Process incoming WebSocket messages
   */
  function handleTextSocketMessage(message) {
      
    const meters = window.MetricsMeters;
    if (!meters) return;
    const { levels, updateMeter } = meters;

    // --- HF Level (Signal Strength) ---
    if (message.sig !== undefined) {
      levels.hf = Math.round((message.sig - 7) * 10) / 10;
      updateMeter('hf-meter', levels.hf);
    }

    // --- PTY Label ---
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
          // Inactive PTY
          ptyLabel.style.color = "#696969";
          ptyLabel.style.borderColor = "#696969";
          ptyLabel.style.fontWeight = "bold";
        } else {
          // Active PTY
          ptyLabel.style.color = "#fff";
          ptyLabel.style.borderColor = "#fff";
          ptyLabel.style.fontWeight = "normal";
        }
      }
    }

    // --- Stereo / Mono Indicator ---
    if (message.st !== undefined) {
      const isStereo = (message.st === true || message.st === 1);
      const isForced = (message.stForced === true || message.stForced === 1);

      currentIsForced = isForced;
      prevStereoState = isStereo;

      if (window.MetricsMeters && typeof window.MetricsMeters.setStereoStatus === 'function') {
          window.MetricsMeters.setStereoStatus(isStereo);
      }

      const stereoIcon = document.getElementById('stereoIcon');
      let iconName = '';

      // 1. Priority: B2 Mode Logic
      if (b2Active) {
        if (MPXStereoDecoder === "off") {
            iconName = 'mpx_on.png';
        } else if (MPXStereoDecoder === "on") {
            if (isStereo && !isForced) {
                iconName = 'stereo_off.png';
            } 
            else if (!isStereo && isForced) {
                iconName = 'stereo_on.png';
            }
        }
      }

      // 2. Standard Logic
      if (!iconName) {
        if (!isStereo && !isForced) {
            iconName = 'mono_off.png';
        } 
        else if (isStereo && !isForced) {
            iconName = 'stereo_on.png';
        } 
        else if (!isStereo && isForced) {
            iconName = 'mono_off.png';
        } 
        else if (isStereo && isForced) {
            iconName = 'mono_on.png';
        }
      }

      if (!iconName) iconName = 'mono_off.png';

      // Update Cursor style
      if (stereoIcon) {
          if (MPXStereoDecoder === "on" || MPXmode === "off") {
               stereoIcon.style.cursor = 'pointer';
          } else {
               stereoIcon.style.cursor = isClickLocked ? 'default' : 'pointer';
          }
      }

      setIconSrc(stereoIcon, `js/plugins/MetricsMonitor/images/${iconName}`);
    }

    // --- ECC Badge ---
    const eccWrapper = document.getElementById('eccWrapper');
    if (eccWrapper) {
      eccWrapper.innerHTML = "";

      const eccSpan = document.querySelector('.data-flag');
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

      const hasEcc = eccSpanHasContent && !eccSpanIsPlaceholderUN && message.ecc !== undefined && message.ecc !== null && message.ecc !== "";

      if (!hasEcc) {
        // Fallback Badge
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
        // Reuse Existing Badge
        if (eccSpan && eccSpan.innerHTML.trim() !== "") {
          eccWrapper.appendChild(eccSpan.cloneNode(true));
        } else {
          logInfo("No usable .data-flag found or it's empty → showing fallback 'ECC'.");
          const noEcc = document.createElement('span');
          noEcc.textContent = 'ECC';
          noEcc.style.color = '#696969';
          noEcc.style.fontSize = '13px';
          eccWrapper.appendChild(noEcc);
        }
      }
    }

// --- RDS Indicator ---
if (message.rds !== undefined) {
  const rdsOn = (message.rds === true || message.rds === 1);

  if (window.MetricsMeters && typeof window.MetricsMeters.setRdsStatus === 'function') {
    window.MetricsMeters.setRdsStatus(rdsOn);
  }

  const rdsIcon = document.getElementById('rdsIcon');
  setIconSrc(rdsIcon, rdsOn
    ? 'js/plugins/MetricsMonitor/images/rds_on.png'
    : 'js/plugins/MetricsMonitor/images/rds_off.png'
  );
  
    const panel = document.getElementById('signalPanel');
    if (panel) {
      panel.style.setProperty(
        'background-color',
        rdsOn
          ? 'var(--color-2-transparent)'
          : 'var(--color-1-transparent)',
        'important'
      );
    }
}

    // --- TP Indicator ---
    if (message.tp !== undefined) {
      const tpIcon = document.getElementById('tpIcon');
      const tpOn = (message.tp === 1 || message.tp === true);
      if (tpIcon) {
        setIconSrc(tpIcon, tpOn ? 'js/plugins/MetricsMonitor/images/tp_on.png' : 'js/plugins/MetricsMonitor/images/tp_off.png');
      }
    }

    // --- TA Indicator ---
    if (message.ta !== undefined) {
      const taIcon = document.getElementById('taIcon');
      const taOn = (message.ta === 1 || message.ta === true);
      if (taIcon) {
        setIconSrc(taIcon, taOn ? 'js/plugins/MetricsMonitor/images/ta_on.png' : 'js/plugins/MetricsMonitor/images/ta_off.png');
      }
    }
  }

  /**
   * WebSocket Setup
   */
  async function setupTextSocket() {
    if (TextSocket && TextSocket.readyState !== WebSocket.CLOSED) return;

    try {
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
        setTimeout(setupTextSocket, 5000);
      });
    } catch (error) {
      logError("Failed to setup TextSocket:", error);
      setTimeout(setupTextSocket, 5000);
    }
  }

  /**
   * Header UI Construction
   */
  function initHeader(iconsBar) {

    // --- Left Group (ECC, Stereo, PTY) ---
    const leftGroup = document.createElement('div');
    leftGroup.style.display = 'flex';
    leftGroup.style.alignItems = 'center';
    leftGroup.style.gap = '10px';
    iconsBar.appendChild(leftGroup);

    // --- ECC Wrapper ---
    const eccWrapper = document.createElement('span');
    eccWrapper.id = 'eccWrapper';
    eccWrapper.style.display = 'inline-flex';
    eccWrapper.style.alignItems = 'center';
    eccWrapper.style.whiteSpace = 'nowrap';
    leftGroup.appendChild(eccWrapper);

    const eccSpan = document.querySelector('.data-flag');
    
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

    // --- Stereo Icon ---
    const stereoImg = document.createElement('img');
    stereoImg.className = 'status-icon';
    stereoImg.id = 'stereoIcon';
    stereoImg.alt = 'Stereo';
    
    stereoImg.style.cursor = 'pointer';
    stereoImg.style.pointerEvents = 'auto'; 

// Stereo Click Handler
stereoImg.addEventListener('click', () => {
    // Check lock state
    if (isClickLocked && MPXStereoDecoder !== "on" && MPXmode !== "off") {
        logInfo("Stereo icon click ignored: Button is locked via B2.");
        return;
    }

    if (TextSocket && TextSocket.readyState === WebSocket.OPEN) {

        if (MPXStereoDecoder === "on") {
            // Local toggle logic for MPXStereoDecoder
            if (b2Active) {
                // Stereo -> Mono
                TextSocket.send("B1");
                b2Active = false; 
                isClickLocked = false;
                logInfo('Stereo icon clicked (MPXStereoDecoder=on, State: Stereo -> Switching to Mono). Sent: B1');
            } else {
                // Mono -> Stereo
                TextSocket.send("B2");
                b2Active = true;
                isClickLocked = true;
                logInfo('Stereo icon clicked (MPXStereoDecoder=on, State: Mono -> Switching to Stereo). Sent: B2');
            }

        } else {
            // Standard behavior
            const cmd = currentIsForced ? "B0" : "B1";
            TextSocket.send(cmd);
            logInfo(`Stereo icon clicked. Sending command: ${cmd}`);
        }

    } else {
        logError("Cannot send command, WebSocket is not open.");
    }
});


    // Initial state
    setIconSrc(stereoImg, 'js/plugins/MetricsMonitor/images/stereo_off.png');
    leftGroup.appendChild(stereoImg);

    // --- PTY Label ---
    const ptyLabel = document.createElement('span');
    ptyLabel.id = 'ptyLabel';
    ptyLabel.textContent = 'PTY';
    ptyLabel.style.color = '#696969';
    ptyLabel.style.fontSize = '13px';
    ptyLabel.style.width = '100px';
    leftGroup.appendChild(ptyLabel);

    // --- Status Icons (TP, TA, RDS) ---
    const iconMap = [
      { id: 'tpIcon',  off: 'js/plugins/MetricsMonitor/images/tp_off.png' },
      { id: 'taIcon',  off: 'js/plugins/MetricsMonitor/images/ta_off.png' },
      { id: 'rdsIcon', off: 'js/plugins/MetricsMonitor/images/rds_off.png' }
    ];
    iconMap.forEach(({ id, off }) => {
      const img = document.createElement('img');
      img.className = 'status-icon';
      img.id = id;
      img.alt = id;
      setIconSrc(img, off);
      iconsBar.appendChild(img);
    });

    setupTextSocket();
  }

  // Public API
  window.MetricsHeader = {
    initHeader,
    setMonoLockFromMode
  };
})();