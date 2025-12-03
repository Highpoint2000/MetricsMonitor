///////////////////////////////////////////////////////////////
//                                                           //
//  METRICSMONITOR SERVER SCRIPT FOR FM-DX-WEBSERVER (V1.1a) //
//                                                           //
//  by Highpoint               last update: 03.12.2025       //
//                                                           //
//  https://github.com/Highpoint2000/metricsmonitor          //
//                                                           //
///////////////////////////////////////////////////////////////


//-------------------------------------------------------------
//  METRICSMONITOR MPX SERVER – Fast, Smooth & Low-Latency
//-------------------------------------------------------------

const { spawn, execSync } = require("child_process");
const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");
const { logInfo, logError, logWarn } = require("./../../server/console");
const mainConfig = require("./../../config.json");


//-------------------------------------------------------------
//  Ensure required Node modules (installed via npm)
//-------------------------------------------------------------
const RequiredModules = [
  "fft-js",
  "bit-twiddle",
  // add further modules here if needed …
];

function ensureRequiredModules() {
  RequiredModules.forEach((moduleName) => {
    const modulePath = path.join(__dirname, "./../../node_modules", moduleName);
    if (!fs.existsSync(modulePath)) {
      logInfo(`[MPX] Module "${moduleName}" is missing. Installing via npm...`);
      try {
        execSync(`npm install ${moduleName}`, { stdio: "inherit" });
        logInfo(`[MPX] Module "${moduleName}" installed successfully.`);
      } catch (error) {
        logError(`[MPX] Error installing module "${moduleName}":`, error);
        process.exit(1);
      }
    }
  });
}


//-------------------------------------------------------------
//  Patch 3LAS server to use a configurable sample rate
//-------------------------------------------------------------
function patch3LAS() {
  try {
    const filePath = path.resolve(
      __dirname,
      "../../server/stream/3las.server.js"
    );
    let content = fs.readFileSync(filePath, "utf8");

    // Old block to be replaced (very broad pattern – adjust if needed)
    const oldBlockRegex = /const audioChannels[\s\S]*?48000\);/;

    const newBlock = `
const audioChannels = serverConfig.audio.audioChannels || 2;

// Default fallback
let sampleRate = Number(serverConfig.audio.sampleRate) || 48000;

// On Windows we still force 48000 Hz (3LAS limitation / compatibility)
if (process.platform === "win32") {
  sampleRate = 48000;
  logInfo("[Audio Stream] 3LAS on Windows detected → forcing sampleRate = 48000");
} else {
  logInfo("[Audio Stream] 3LAS using sampleRate from serverConfig.audio.sampleRate →", sampleRate);
}

const Server = new StreamServer(null, audioChannels, sampleRate);
    `.trim();

    if (oldBlockRegex.test(content)) {
      content = content.replace(oldBlockRegex, newBlock);
      fs.writeFileSync(filePath, content, "utf8");
      logInfo("[MPX] 3LAS sampleRate block successfully patched. Please restart the webserver.");
    } else {
      logInfo("[MPX] 3LAS old sampleRate block not found – no changes applied.");
    }
  } catch (err) {
    logError("[MPX] Failed to patch 3las.server.js:", err);
  }
}


//-------------------------------------------------------------
//  Patch helpers.js → exempt localhost from antispamProtection
//-------------------------------------------------------------
const LOCALHOST_PATCH_MARKER = "// MM_LOCALHOST_SPAM_BYPASS:";

function patchHelpersForLocalhostBypass() {
  try {
    const helpersPath = path.join(__dirname, "./../../server/helpers.js");

    if (!fs.existsSync(helpersPath)) {
      logWarn("[MPX] helpers.js not found, cannot patch antispamProtection().");
      return;
    }

    let content = fs.readFileSync(helpersPath, "utf8");

    // already patched?
    if (content.includes(LOCALHOST_PATCH_MARKER)) {
      logInfo("[MPX] helpers.js already contains localhost bypass – nothing to do.");
      return;
    }

    const fnSignature =
      "function antispamProtection(message, clientIp, ws, userCommands, lastWarn, userCommandHistory, lengthCommands, endpointName) {";
    const fnIndex = content.indexOf(fnSignature);

    if (fnIndex === -1) {
      logWarn("[MPX] antispamProtection() not found in helpers.js – skipping localhost patch.");
      return;
    }

    // we want to insert AFTER this line:
    const commandLine = "const command = message.toString();";
    const cmdIndex = content.indexOf(commandLine, fnIndex);

    if (cmdIndex === -1) {
      logWarn("[MPX] 'const command = message.toString();' not found in antispamProtection() – skipping localhost patch.");
      return;
    }

    const insertPos = cmdIndex + commandLine.length;

    const insertion = `
  ${LOCALHOST_PATCH_MARKER} allow internal server apps on localhost
  const isLocalhost =
    clientIp === "127.0.0.1" ||
    clientIp === "::1" ||
    clientIp === "::ffff:127.0.0.1" ||
    (clientIp && clientIp.replace(/^::ffff:/, '') === "127.0.0.1");

  if (isLocalhost) {
    // no spam/bot checks for local server applications
    return command;
  }`;

    content = content.slice(0, insertPos) + insertion + content.slice(insertPos);
    fs.writeFileSync(helpersPath, content, "utf8");

    logInfo("[MPX] helpers.js patched: localhost exempt in antispamProtection(). Please restart the webserver!");
  } catch (err) {
    logWarn(`[MPX] Failed to patch helpers.js for localhost exemption: ${err.message}`);
  }
}


//-------------------------------------------------------------
//  Plugin configuration (metricsmonitor.json)
//  – all plugin settings are stored here (not in config.json)
//-------------------------------------------------------------
const configFilePath = path.join(
  __dirname,
  "./../../plugins_configs/metricsmonitor.json"
);

// Module codes (LEGEND):
//   0 = Equalizer
//   1 = Level meters
//   2 = Analyzer

// Default plugin configuration
const defaultConfig = {
  // must be first property in the JSON file
  sampleRate: 48000,
  fftSize: 512,
  SpectrumAverageLevel: 15,
  minSendIntervalMs: 30,
  MPXmode: "off",           // "off" | "on" | "auto"
  stereoBoost: 1.0,
  eqBoost: 1.0,
  MODULE_SEQUENCE: "1, 2, 0",
};

// Normalize / complete configuration object and enforce key order
function normalizePluginConfig(json) {
  const result = {
    sampleRate:
      typeof json.sampleRate !== "undefined"
        ? json.sampleRate
        : defaultConfig.sampleRate,
    fftSize:
      typeof json.fftSize !== "undefined"
        ? json.fftSize
        : defaultConfig.fftSize,
    SpectrumAverageLevel:
      typeof json.SpectrumAverageLevel !== "undefined"
        ? json.SpectrumAverageLevel
        : defaultConfig.SpectrumAverageLevel,
    minSendIntervalMs:
      typeof json.minSendIntervalMs !== "undefined"
        ? json.minSendIntervalMs
        : defaultConfig.minSendIntervalMs,
    MPXmode:
      typeof json.MPXmode !== "undefined"
        ? json.MPXmode
        : defaultConfig.MPXmode,
    stereoBoost:
      typeof json.stereoBoost !== "undefined"
        ? json.stereoBoost
        : defaultConfig.stereoBoost,
    eqBoost:
      typeof json.eqBoost !== "undefined"
        ? json.eqBoost
        : defaultConfig.eqBoost,
    MODULE_SEQUENCE:
      typeof json.MODULE_SEQUENCE !== "undefined"
        ? json.MODULE_SEQUENCE
        : defaultConfig.MODULE_SEQUENCE,
  };

  // Keep any additional fields from older configs
  for (const key of Object.keys(json)) {
    if (!(key in result)) {
      result[key] = json[key];
    }
  }

  return result;
}

// ---------------------------------------------------------
// Check if MODULE_SEQUENCE contains modules 1 or 2
// (1 = Level meters, 2 = Analyzer → require MPX stack)
// ---------------------------------------------------------
function hasAnalyzerOrMeters(config) {
  const raw = config && typeof config.MODULE_SEQUENCE !== "undefined"
    ? config.MODULE_SEQUENCE
    : defaultConfig.MODULE_SEQUENCE;

  let arr;

  if (Array.isArray(raw)) {
    arr = raw;
  } else {
    arr = String(raw)
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => !Number.isNaN(n));
  }

  // 1 = Level meters, 2 = Analyzer → MPX stack required
  return arr.includes(1) || arr.includes(2);
}

// Load / create / repair metricsmonitor.json
function loadConfig(filePath) {
  const dir = path.dirname(filePath);

  // Ensure directory exists
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // If file already exists, try to parse and normalize it
  if (fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, "utf8").trim();

      if (raw.length === 0) {
        throw new Error("Empty JSON file");
      }

      let json = JSON.parse(raw);

      if (!json || Object.keys(json).length === 0) {
        throw new Error("Empty JSON object");
      }

      // Normalize structure and always rewrite in sorted form (sampleRate first)
      json = normalizePluginConfig(json);
      fs.writeFileSync(filePath, JSON.stringify(json, null, 2), "utf8");

      return json;
    } catch (err) {
      logWarn(
        "[MPX] metricsmonitor.json invalid → rewriting with defaults:",
        err.message
      );
      fs.writeFileSync(
        filePath,
        JSON.stringify(defaultConfig, null, 2),
        "utf8"
      );
      return defaultConfig;
    }
  }

  // File does not exist → create it
  logWarn("[MPX] metricsmonitor.json not found → creating new file with defaults.");
  fs.writeFileSync(filePath, JSON.stringify(defaultConfig, null, 2), "utf8");
  return defaultConfig;
}

// Helpers to safely read values from plugin config
function getPluginSampleRate(cfg) {
  if (!cfg) return defaultConfig.sampleRate;
  const sr = typeof cfg.sampleRate === "string" ? Number(cfg.sampleRate) : cfg.sampleRate;
  return typeof sr === "number" && !Number.isNaN(sr) && sr > 0
    ? sr
    : defaultConfig.sampleRate;
}

function getStereoBoost(cfg) {
  if (!cfg) return defaultConfig.stereoBoost;
  const val =
    typeof cfg.stereoBoost === "string"
      ? Number(cfg.stereoBoost)
      : cfg.stereoBoost;
  return typeof val === "number" && !Number.isNaN(val)
    ? val
    : defaultConfig.stereoBoost;
}

function getEqBoost(cfg) {
  if (!cfg) return defaultConfig.eqBoost;
  const val =
    typeof cfg.eqBoost === "string" ? Number(cfg.eqBoost) : cfg.eqBoost;
  return typeof val === "number" && !Number.isNaN(val)
    ? val
    : defaultConfig.eqBoost;
}

function getFftSize(cfg) {
  if (!cfg) return defaultConfig.fftSize;
  const val =
    typeof cfg.fftSize === "string" ? Number(cfg.fftSize) : cfg.fftSize;
  return typeof val === "number" && !Number.isNaN(val) && val > 0
    ? val
    : defaultConfig.fftSize;
}

function getMinSendIntervalMs(cfg) {
  if (!cfg) return defaultConfig.minSendIntervalMs;
  const val =
    typeof cfg.minSendIntervalMs === "string"
      ? Number(cfg.minSendIntervalMs)
      : cfg.minSendIntervalMs;
  return typeof val === "number" && !Number.isNaN(val) && val > 0
    ? val
    : defaultConfig.minSendIntervalMs;
}

function getSpectrumAverageLevel(cfg) {
  if (!cfg) return defaultConfig.SpectrumAverageLevel;
  const val =
    typeof cfg.SpectrumAverageLevel === "string"
      ? Number(cfg.SpectrumAverageLevel)
      : cfg.SpectrumAverageLevel;
  return typeof val === "number" && !Number.isNaN(val) && val > 0
    ? val
    : defaultConfig.SpectrumAverageLevel;
}

function getMpxMode(cfg) {
  if (!cfg || typeof cfg.MPXmode === "undefined") {
    return defaultConfig.MPXmode;
  }
  const val = String(cfg.MPXmode).toLowerCase();
  if (val === "on" || val === "off" || val === "auto") {
    return val;
  }
  return defaultConfig.MPXmode;
}

// Load plugin configuration
const configPlugin = loadConfig(configFilePath);

// Extract plugin values
let MODULE_SEQUENCE = configPlugin.MODULE_SEQUENCE;
const ANALYZER_SAMPLE_RATE = getPluginSampleRate(configPlugin);
const CONFIG_SAMPLE_RATE = ANALYZER_SAMPLE_RATE; // used for 3LAS vs MPXCapture decision
const STEREO_BOOST = getStereoBoost(configPlugin);
const EQ_BOOST = getEqBoost(configPlugin);
const FFT_SIZE = getFftSize(configPlugin);
const MIN_SEND_INTERVAL_MS = getMinSendIntervalMs(configPlugin);
const SPECTRUM_AVERAGE_LEVELS = getSpectrumAverageLevel(configPlugin);
const MPX_MODE = getMpxMode(configPlugin); // "off" | "on" | "auto"

// Only enable MPX if sequence contains 1 (Level meters) or 2 (Analyzer)
const ENABLE_MPX = hasAnalyzerOrMeters(configPlugin);


//-------------------------------------------------------------
//  Normalize MODULE_SEQUENCE into a JS array representation
//-------------------------------------------------------------
function normalizeSequence(seq) {
  if (Array.isArray(seq)) {
    return JSON.stringify(seq);
  }

  if (typeof seq === "string") {
    const items = seq
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map(Number);

    return JSON.stringify(items);
  }

  return "[0, 1, 2]";
}

const MODULE_SEQUENCE_JS = normalizeSequence(MODULE_SEQUENCE);

// Client script file paths
const MetricsMonitorClientFile = path.join(__dirname, "metricsmonitor.js");
const MetricsMonitorClientAnalyzerFile = path.join(
  __dirname,
  "js/metricsmonitor-analyzer.js"
);
const MetricsMonitorClientMetersFile = path.join(
  __dirname,
  "js/metricsmonitor-meters.js"
);
const MetricsMonitorClientEqualizerFile = path.join(
  __dirname,
  "js/metricsmonitor-equalizer.js"
);
const MetricsMonitorClientHeaderFile = path.join(
  __dirname,
  "js/metricsmonitor-header.js"
);

//-------------------------------------------------------------
//  Write MODULE_SEQUENCE and header constants into client JS
//-------------------------------------------------------------
function updateSettings() {

  //-----------------------------------------------------------
  // Build the constant block that will be injected after the IIFE
  //-----------------------------------------------------------
  function buildHeaderBlock() {
    return (
      `const sampleRate = ${ANALYZER_SAMPLE_RATE};    // Do not touch - this value is automatically updated via the config file\n` +
      `const stereoBoost = ${STEREO_BOOST};    // Do not touch - this value is automatically updated via the config file\n` +
      `const eqBoost = ${EQ_BOOST};    // Do not touch - this value is automatically updated via the config file\n` +
      `const fftSize = ${FFT_SIZE};    // Do not touch - this value is automatically updated via the config file\n` +
      `const SpectrumAverageLevel = ${SPECTRUM_AVERAGE_LEVELS};    // Do not touch - this value is automatically updated via the config file\n` +
      `const minSendIntervalMs = ${MIN_SEND_INTERVAL_MS};    // Do not touch - this value is automatically updated via the config file\n` +
      `const MPXmode = "${MPX_MODE}";    // Do not touch - this value is automatically updated via the config file\n`
    );
  }

  //-----------------------------------------------------------
  // Remove old const declarations for header values and
  // standalone "Do not touch" comment lines.
  // MODULE_SEQUENCE and its comment are not touched here.
  //-----------------------------------------------------------
  function removeOldConstants(code) {
    // 1) remove old const lines (including any inline comments)
    let out = code
      .replace(/^\s*const\s+sampleRate\s*=.*;[^\n]*\n?/gm, "")
      .replace(/^\s*const\s+stereoBoost\s*=.*;[^\n]*\n?/gm, "")
      .replace(/^\s*const\s+eqBoost\s*=.*;[^\n]*\n?/gm, "")
      .replace(/^\s*const\s+fftSize\s*=.*;[^\n]*\n?/gm, "")
      .replace(/^\s*const\s+SpectrumAverageLevel\s*=.*;[^\n]*\n?/gm, "")
      .replace(/^\s*const\s+minSendIntervalMs\s*=.*;[^\n]*\n?/gm, "")
      .replace(/^\s*const\s+MPXmode\s*=.*;[^\n]*\n?/gm, "");

    // 2) remove pure "Do not touch..." comment lines,
    //    but keep inline comments behind other statements
    out = out.replace(
      /^\s*\/\/\s*Do not touch - this value is automatically updated via the config file\s*$/gm,
      ""
    );

    return out;
  }

  //-----------------------------------------------------------
  // Insert the header block directly after "(() => {"
  // without introducing extra blank lines.
  //-----------------------------------------------------------
  function insertAfterIIFE(code) {
    const cleaned = removeOldConstants(code);

    // Capture only the IIFE header line
    const iifePattern = /(\(\s*\)\s*=>\s*\{)[ \t]*\n?/;

    if (!iifePattern.test(cleaned)) {
      logWarn("[MPX] Could not find IIFE in script – no header injected.");
      return cleaned;
    }

    // Result:
    // (() => {
    // const sampleRate = ...
    // ...
    return cleaned.replace(
      iifePattern,
      (_, prefix) => `${prefix}\n${buildHeaderBlock()}`
    );
  }

  //-----------------------------------------------------------
  // Helper to update any client-side script file (synchronous)
  //-----------------------------------------------------------
  function updateClientFile(filePath, label, modifyFn) {
    try {
      const data = fs.readFileSync(filePath, "utf8");
      const updated = modifyFn(data);
      fs.writeFileSync(filePath, updated, "utf8");
      // Uncomment for debugging:
      // logInfo(`[MPX] Updated ${label} (sampleRate=${ANALYZER_SAMPLE_RATE}, stereoBoost=${STEREO_BOOST}, eqBoost=${EQ_BOOST}, fftSize=${FFT_SIZE}, SpectrumAverageLevel=${SPECTRUM_AVERAGE_LEVELS}, minSendIntervalMs=${MIN_SEND_INTERVAL_MS}, MPXmode=${MPX_MODE})`);
    } catch (err) {
      logError(`[MPX] Error updating ${label}:`, err);
    }
  }

  //-----------------------------------------------------------
  // 1) metricsmonitor.js: update MODULE_SEQUENCE AND insert header
  //-----------------------------------------------------------
  updateClientFile(
    MetricsMonitorClientFile,
    "metricsmonitor.js",
    (code) => {
      let updated = code;

      // Match the entire MODULE_SEQUENCE line (including any old comment)
      const moduleSeqRegex = /^\s*const\s+MODULE_SEQUENCE\s*=.*;[^\n]*$/m;

      if (moduleSeqRegex.test(updated)) {
        // Replace the whole line with the new value and our standard comment
        updated = updated.replace(
          moduleSeqRegex,
          `const MODULE_SEQUENCE = ${MODULE_SEQUENCE_JS};    // Do not touch - this value is automatically updated via the config file`
        );
      } else {
        // No existing definition → add a new one at the top
        updated =
          `const MODULE_SEQUENCE = ${MODULE_SEQUENCE_JS};    // Do not touch - this value is automatically updated via the config file\n` +
          updated;
      }

      // Insert header block after the IIFE
      return insertAfterIIFE(updated);
    }
  );

  //-----------------------------------------------------------
  // 2) Insert header constants into analyzer script
  //-----------------------------------------------------------
  updateClientFile(
    MetricsMonitorClientAnalyzerFile,
    "metricsmonitor-analyzer.js",
    insertAfterIIFE
  );

  //-----------------------------------------------------------
  // 3) Insert header constants into equalizer script
  //-----------------------------------------------------------
  updateClientFile(
    MetricsMonitorClientEqualizerFile,
    "metricsmonitor-equalizer.js",
    insertAfterIIFE
  );

  //-----------------------------------------------------------
  // 4) Insert header constants into header script
  //-----------------------------------------------------------
  updateClientFile(
    MetricsMonitorClientHeaderFile,
    "metricsmonitor-header.js",
    insertAfterIIFE
  );

  //-----------------------------------------------------------
  // 5) Insert header constants into meters script
  //-----------------------------------------------------------
  updateClientFile(
    MetricsMonitorClientMetersFile,
    "metricsmonitor-meters.js",
    insertAfterIIFE
  );
}

//-------------------------------------------------------------
//  Copy client files to web/js/plugins/MetricsMonitor (Linux/macOS)
//  (runs only AFTER updateSettings has synchronously patched files)
//-------------------------------------------------------------
function copyClientFiles() {
  if (process.platform === "win32") {
    logInfo("[MPX] Windows detected – skipping client file copy.");
    return;
  }

  const srcDir = __dirname;
  const destDir = path.join(
    __dirname,
    "../../web/js/plugins/MetricsMonitor"
  );

  logInfo("[MPX] Updating client files in:", destDir);

  try {
    fs.mkdirSync(destDir, { recursive: true });
    fs.chmodSync(destDir, 0o775);
  } catch (e) {
    logError("[MPX] Failed to create destination directory:", e);
    return;
  }

  const folders = ["css", "js", "images"];

  folders.forEach((folder) => {
    const folderSrc = path.join(srcDir, folder);
    const folderDest = path.join(destDir, folder);

    if (!fs.existsSync(folderSrc)) return;

    fs.mkdirSync(folderDest, { recursive: true });
    try {
      fs.chmodSync(folderDest, 0o775);
    } catch {}

    const items = fs.readdirSync(folderSrc);
    items.forEach((item) => {
      const s = path.join(folderSrc, item);
      const d = path.join(folderDest, item);

      try {
        fs.copyFileSync(s, d);
        fs.chmodSync(d, 0o664);
        logInfo(`[MPX] Copied client file: ${d}`);
      } catch (err) {
        logError("[MPX] Error copying client file:", err);
      }
    });
  });

  const singleFiles = ["metricsmonitor.js"];
  singleFiles.forEach((file) => {
    const s = path.join(srcDir, file);
    const d = path.join(destDir, file);

    if (!fs.existsSync(s)) return;

    try {
      fs.copyFileSync(s, d);
      fs.chmodSync(d, 0o664);
      logInfo(`[MPX] Copied client root file: ${file}`);
    } catch (err) {
      logError("[MPX] Failed to copy client root file", file, err);
    }
  });
}


//-------------------------------------------------------------
//  Always patch plugin scripts (Equalizer needs this too)
//  → updateSettings is synchronous, then copy
//-------------------------------------------------------------
updateSettings();
copyClientFiles();


//-------------------------------------------------------------
//  Enable / disable MPX stack depending on MODULE_SEQUENCE
//-------------------------------------------------------------
if (!ENABLE_MPX) {
  // Only log a message – MPX processing is fully disabled
  logInfo(
    `[MPX] MODULE_SEQUENCE = ${MODULE_SEQUENCE} → ` +
    "MPX capture & server-side MPX processing are disabled."
  );
} else {

  //-----------------------------------------------------------
  //  Load modules & patch server-side scripts ONLY when MPX is enabled
  //-----------------------------------------------------------
  ensureRequiredModules();
  const FFT = require("fft-js").fft;

  patch3LAS();
  patchHelpersForLocalhostBypass();


  //-----------------------------------------------------------
  //  MPX server settings
  //-----------------------------------------------------------
  let SAMPLE_RATE = 192000; // default for MPXCapture.exe (Windows/macOS)

  // FFT configuration (configured via metricsmonitor.json)
  const HOP_SIZE = FFT_SIZE / 2;
  const MAX_LATENCY_BLOCKS = 2; // we keep at most this many FFT blocks

  // Webserver port (from main config)
  let SERVER_PORT = 8080;

  try {
    if (mainConfig?.webserver?.webserverPort) {
      SERVER_PORT = parseInt(mainConfig.webserver.webserverPort, 10);
      if (isNaN(SERVER_PORT)) SERVER_PORT = 8080;
    }
  } catch (e) {
    SERVER_PORT = 8080;
  }

  logInfo(`[MPX] Using webserver port from config.json → ${SERVER_PORT}`);
  logInfo(`[MPX] sampleRate from metricsmonitor.json → ${CONFIG_SAMPLE_RATE} Hz`);
  logInfo(`[MPX] FFT_SIZE from metricsmonitor.json → ${FFT_SIZE} points`);
  logInfo(`[MPX] SpectrumAverageLevel from metricsmonitor.json → ${SPECTRUM_AVERAGE_LEVELS}`);
  logInfo(`[MPX] minSendIntervalMs from metricsmonitor.json → ${MIN_SEND_INTERVAL_MS} ms`);
  logInfo(`[MPX] MPXmode from metricsmonitor.json → ${MPX_MODE}`);

  // MPX capture executable resolution (for Windows/macOS only)
  const osPlatform = process.platform;
  const osArch = process.arch;

  let runtimeFolder = null;
  let binaryName = null;

  if (osPlatform === "win32") {
    const archEnv = process.env.PROCESSOR_ARCHITECTURE || "";
    const archWow = process.env.PROCESSOR_ARCHITEW6432 || "";
    const is64BitOS =
      archEnv.toUpperCase() === "AMD64" ||
      archWow.toUpperCase() === "AMD64";

    runtimeFolder = is64BitOS ? "win-x64" : "win-x86";
    binaryName = "MPXCapture.exe";
  } else if (osPlatform === "linux") {
    if (osArch === "arm" || osArch === "armhf") {
      runtimeFolder = "linux-arm";
    } else if (osArch === "arm64") {
      runtimeFolder = "linux-arm64";
    } else {
      runtimeFolder = "linux-x64";
    }
    binaryName = "MPXCapture"; // used only if we really start MPXCapture on Linux
  } else if (osPlatform === "darwin") {
    runtimeFolder = osArch === "arm64" ? "osx-arm64" : "osx-x64";
    binaryName = "MPXCapture";
  } else {
    logError(
      `[MPX] Unsupported platform ${osPlatform}/${osArch} – MPXCapture will not be started.`
    );
  }

  let MPX_EXE_PATH = null;

  if (!runtimeFolder || !binaryName) {
    logWarn("[MPX] No runtimeFolder/binaryName detected – MPXCapture disabled.");
  } else if (osPlatform === "win32" && CONFIG_SAMPLE_RATE === 48000) {
    // On Windows with 48 kHz we use 3LAS, not MPXCapture
    logWarn("[MPX] CONFIG_SAMPLE_RATE = 48000 on Windows → using 3LAS, MPXCapture disabled.");
  } else {
    MPX_EXE_PATH = path.join(__dirname, "bin", runtimeFolder, binaryName);
    MPX_EXE_PATH = MPX_EXE_PATH.replace(/^['\"]+|['\"]+$/g, "");
    logInfo(
      `[MPX] Using MPXCapture binary for ${osPlatform}/${osArch} → ${runtimeFolder}/${binaryName}`
    );
  }

  // Frequency of updates to the browser (~33 FPS, configurable via config)
  // MIN_SEND_INTERVAL_MS is taken from metricsmonitor.json

  // Horizontal bin reduction to reduce payload size
  const BIN_STEP = 2;

  // WebSocket backpressure limit – if exceeded, we drop / reset
  const MAX_WS_BACKLOG_BYTES = 256 * 1024; // 256 kB

  logInfo("[MPX] MPX server started (Fast & Smooth v2, backpressure enabled).");


  //-----------------------------------------------------------
  //  WebSocket connection to /data_plugins (MPX output channel)
  //-----------------------------------------------------------
  let dataPluginsWs = null;
  let reconnectTimer = null;

  let backpressureHits = 0;
  const MAX_BACKPRESSURE_HITS = 200; // ~200 * 30ms ≈ 6 seconds continuous backpressure

  function connectDataPluginsWs() {
    const url = `ws://127.0.0.1:${SERVER_PORT}/data_plugins`;

    if (
      dataPluginsWs &&
      (dataPluginsWs.readyState === WebSocket.OPEN ||
        dataPluginsWs.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    logInfo("[MPX] Connecting to /data_plugins:", url);

    dataPluginsWs = new WebSocket(url);
    backpressureHits = 0;

    dataPluginsWs.on("open", () => {
      logInfo("[MPX] Connected to /data_plugins WebSocket.");
      backpressureHits = 0;
    });

    dataPluginsWs.on("close", () => {
      logInfo("[MPX] /data_plugins WebSocket closed – retrying in 5 seconds.");
      dataPluginsWs = null;

      if (!reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          connectDataPluginsWs();
        }, 5000);
      }
    });

    dataPluginsWs.on("error", (err) => {
      logError("[MPX] /data_plugins WebSocket error:", err);
    });

    dataPluginsWs.on("message", () => {
      // MPX server sends only outbound data – incoming messages are ignored
    });
  }

  // Start the /data_plugins WebSocket connection (no L0/L1 commands are sent here)
  connectDataPluginsWs();


  //-----------------------------------------------------------
  //  Audio buffer + FFT structures
  //-----------------------------------------------------------
  let use3LasPcmFormat = false; // true = 3LAS S16_LE, false = MPXCapture Float32
  let sampleBuffer = [];

  // FFT working buffer and Hann window
  const fftBlock = new Float32Array(FFT_SIZE);
  const windowHann = new Float32Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i++) {
    windowHann[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)));
  }

  // Latest MPX frame to be sent to the browser
  let latestMpxFrame = null;


  //-----------------------------------------------------------
  //  Convert PCM chunks to mono, apply FFT and build MPX spectrum
  //-----------------------------------------------------------
  function handlePcmChunk(chunk) {
    if (!chunk || chunk.length === 0) return;

    // 1) Interpret PCM depending on the source
    if (use3LasPcmFormat) {
      // 3LAS delivers S16_LE stereo
      const intData = new Int16Array(
        chunk.buffer,
        chunk.byteOffset,
        chunk.byteLength / 2
      );

      // Stereo → Mono: (L+R)/2, normalize to Float
      for (let i = 0; i < intData.length; i += 2) {
        const L_raw = intData[i];
        const R_raw = intData[i + 1] ?? L_raw;

        const L = L_raw / 32768;
        const R = R_raw / 32768;

        sampleBuffer.push((L + R) * 0.5);
      }
    } else {
      // MPXCapture.exe delivers Float32 stereo
      const floatData = new Float32Array(
        chunk.buffer,
        chunk.byteOffset,
        chunk.byteLength / 4
      );

      for (let i = 0; i < floatData.length; i += 2) {
        const L = floatData[i];
        const R = floatData[i + 1] ?? L;
        sampleBuffer.push((L + R) * 0.5);
      }
    }

    // 2) Hard-limit buffer length – we do NOT want a long tail
    const maxSamples = MAX_LATENCY_BLOCKS * FFT_SIZE;
    if (sampleBuffer.length > maxSamples) {
      const overflow = sampleBuffer.length - maxSamples;
      sampleBuffer.splice(0, overflow); // drop oldest samples
    }

    // 3) As soon as we have one full FFT block, process it
    if (sampleBuffer.length >= FFT_SIZE) {
      // Use the newest samples from the buffer
      const start = sampleBuffer.length - FFT_SIZE;
      for (let i = 0; i < FFT_SIZE; i++) {
        fftBlock[i] = sampleBuffer[start + i] * windowHann[i];
      }

      // Keep a bit of overlap for smoother animation
      const keepFrom = Math.max(0, sampleBuffer.length - HOP_SIZE);
      if (keepFrom > 0) {
        sampleBuffer.splice(0, keepFrom);
      } else {
        sampleBuffer.length = 0;
      }

      // 4) FFT calculation
      const phasors = FFT(fftBlock);
      const halfLen = phasors.length / 2;

      // 5) Magnitude calculation (+20 dB boost, except DC bin)
      const mags = new Float32Array(halfLen);
      for (let i = 0; i < halfLen; i++) {
        const re = phasors[i][0];
        const im = phasors[i][1];
        let mag = Math.sqrt(re * re + im * im);
        mag /= FFT_SIZE / 2;

        // +20 dB boost for all bins except DC (i > 0)
        if (i > 0) {
          mag *= 10;
        }

        mags[i] = mag;
      }

      // 6) Build MPX array (0–100 kHz, reduced by BIN_STEP)
      const mpx = [];
      for (let i = 0; i < halfLen; i += BIN_STEP) {
        const f = (i * SAMPLE_RATE) / FFT_SIZE;
        if (f > 100000) break;

        let sum = 0;
        let count = 0;
        for (let k = 0; k < BIN_STEP && i + k < halfLen; k++) {
          sum += mags[i + k];
          count++;
        }
        const avgMag = sum / (count || 1);

        mpx.push({ f, m: avgMag });
      }

      if (mpx.length > 0) {
        latestMpxFrame = mpx;
      }
    }
  }


  //-----------------------------------------------------------
  //  Start capture – choose between 3LAS PCM tap and MPXCapture
  //-----------------------------------------------------------
  //
  // USE_3LAS is true when
  //  - any Linux system
  //  - or Windows with sampleRate == 48000 in metricsmonitor.json
  //-----------------------------------------------------------
  let rec = null;

  const USE_3LAS =
    osPlatform === "linux" ||
    (osPlatform === "win32" && CONFIG_SAMPLE_RATE === 48000);

  if (USE_3LAS) {
    // Attach to 3LAS audio stream
    try {
      const audioStream = require("./../../server/stream/3las.server");

      if (!audioStream || !audioStream.waitUntilReady) {
        logWarn("[MPX] 3LAS server not available – MPX spectrum capture disabled.");
      } else {
        audioStream.waitUntilReady
          .then(() => {
            const s = audioStream.Server;
            if (!s || !s.StdIn) {
              logError("[MPX] 3LAS Server has no StdIn stream – MPX spectrum capture disabled.");
              return;
            }

            // Use sampleRate from 3LAS if present, otherwise fall back to plugin config
            if (typeof s.SampleRate === "number" && s.SampleRate > 0) {
              SAMPLE_RATE = s.SampleRate;
            } else {
              SAMPLE_RATE = CONFIG_SAMPLE_RATE || 48000;
              logWarn(
                `[MPX] 3LAS sampleRate unknown – assuming ${SAMPLE_RATE} Hz for MPX spectrum.`
              );
            }

            use3LasPcmFormat = true;

            logInfo(
              `[MPX] Subscribing to 3LAS StdIn PCM stream (${osPlatform}) @ ${SAMPLE_RATE} Hz`
            );

            s.StdIn.on("data", (buffer) => {
              handlePcmChunk(buffer);
            });
          })
          .catch((err) => {
            logError("[MPX] Error while waiting for 3LAS audio stream:", err);
          });
      }
    } catch (e) {
      logError(
        "[MPX] Failed to require 3las.server – MPX spectrum capture disabled:",
        e
      );
    }
  } else if (!MPX_EXE_PATH) {
    logWarn(
      "[MPX] MPXCapture path not resolved or platform unsupported – not starting MPXCapture."
    );
  } else if (!fs.existsSync(MPX_EXE_PATH)) {
    logError("[MPX] MPXCapture binary not found at path:", MPX_EXE_PATH);
  } else {
    // Windows / macOS: start C# MPXCapture @ SAMPLE_RATE (default 192 kHz)
    use3LasPcmFormat = false;
    logInfo(
      `[MPX] Starting MPXCapture (${osPlatform}/${osArch}) with SAMPLE_RATE = ${SAMPLE_RATE} Hz`
    );

    rec = spawn(MPX_EXE_PATH, [String(SAMPLE_RATE)]);

    rec.stderr.on("data", (d) => {
      const text = d.toString().trim();
      if (text.length > 0) {
        logInfo("[MPX-EXE]", text);
      }
    });

    rec.stdout.on("data", handlePcmChunk);

    rec.on("close", (code, signal) => {
      logInfo(
        "[MPX] MPXCapture exited with code:",
        code,
        "signal:",
        signal || "none"
      );
    });
  }


  //-----------------------------------------------------------
  //  Send loop – always send only the latest MPX frame
  //  with WebSocket backpressure protection
  //-----------------------------------------------------------
  setInterval(() => {
    if (!dataPluginsWs || dataPluginsWs.readyState !== WebSocket.OPEN) return;
    if (!latestMpxFrame || !latestMpxFrame.length) return;

    const wsBuffered = dataPluginsWs.bufferedAmount || 0;

    // Backpressure handling: if the buffer is too large, start dropping frames
    if (wsBuffered > MAX_WS_BACKLOG_BYTES) {
      backpressureHits++;

      if (backpressureHits % 20 === 0) {
        logInfo(
          "[MPX] Backpressure: skipping MPX frame; bufferedAmount =",
          wsBuffered,
          "hits =",
          backpressureHits
        );
      }

      if (backpressureHits >= MAX_BACKPRESSURE_HITS) {
        logError(
          "[MPX] Backpressure persists (",
          backpressureHits,
          "hits). Terminating MPX WebSocket to avoid memory leak. bufferedAmount =",
          wsBuffered
        );
        try {
          dataPluginsWs.terminate();
        } catch (e) {
          logError("[MPX] Error while terminating /data_plugins WebSocket:", e);
        }
        dataPluginsWs = null;
        latestMpxFrame = null;
        backpressureHits = 0;
      }

      return;
    }

    // No backpressure → reset hit counter
    backpressureHits = 0;

    const payload = JSON.stringify({
      type: "MPX",
      value: latestMpxFrame,
    });

    dataPluginsWs.send(payload, (err) => {
      if (err) {
        logError("[MPX] Failed to send MPX frame:", err);
      }
    });
  }, MIN_SEND_INTERVAL_MS);

} // end of ENABLE_MPX branch
