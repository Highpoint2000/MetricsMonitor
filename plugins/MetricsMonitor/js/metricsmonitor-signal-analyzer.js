///////////////////////////////////////////////////////////////
//                                                           //
//  metricsmonitor-signal-analyzer.js               (V2.8b)  //
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
const MeterTiltCalibration = -900;    // Do not touch - this value is automatically updated via the config file

  'use strict';

  const CONFIG = (window.MetricsMonitor && window.MetricsMonitor.Config) ? window.MetricsMonitor.Config : {};
  const HUB_KEY = "__MM_SIGNAL_ANALYZER_HUB__";

  const QUIET_ERROR_SUBSTRINGS = [
    "getDatasetMeta",
    "_setStyle",
    "Cannot read properties of undefined (reading 'getDatasetMeta')",
    "Cannot read properties of undefined",
    "Cannot set properties of null",
    "Cannot read properties of null",
    "Cannot read properties of null (reading 'x')",
    "Cannot read properties of null (reading 'y')",
  ];

  const Y_MIN_DEFAULT = 0;    // dBf
  const Y_MAX_DEFAULT = 100;  // dBf
  const DURATION_DEFAULT = 20000;

  function isQuietErrorMessage(msg) {
    const s = String(msg || "");
    return QUIET_ERROR_SUBSTRINGS.some(k => s.includes(k));
  }

  function isChartAlive(chart) {
    if (!chart) return false;
    if (!chart.canvas || !chart.ctx) return false;

    if (typeof chart.canvas.isConnected === "boolean" && !chart.canvas.isConnected) return false;

    const ds = chart.data?.datasets;
    if (!Array.isArray(ds) || ds.length === 0) return false;

    return true;
  }


  function stopStreamingTimers(chart) {
    if (!chart) return;

    try { chart.stop?.(); } catch {}

    try {
      const rt = chart.options?.scales?.x?.realtime;
      if (rt) rt.pause = true;
    } catch {}

    try {
      const s =
        chart.$streaming ||
        chart.$realtime ||
        chart._streaming ||
        chart.streaming ||
        (chart.options?.plugins && (chart.options.plugins.streaming || chart.options.plugins.realtime));

      const maybeClearInterval = (id) => {
        if (typeof id === "number") {
          try { clearInterval(id); } catch {}
          try { clearTimeout(id); } catch {}
        }
      };

      const maybeCancelRaf = (id) => {
        if (typeof id === "number") {
          try { cancelAnimationFrame(id); } catch {}
        }
      };

      if (s && typeof s === "object") {
        maybeClearInterval(s.refreshTimerID);
        maybeClearInterval(s.refreshTimer);
        maybeClearInterval(s.timerID);
        maybeClearInterval(s.timer);
        maybeClearInterval(s._refreshTimerID);
        maybeClearInterval(s._timerID);

        maybeCancelRaf(s.frameRequestID);
        maybeCancelRaf(s.frameRequest);
        maybeCancelRaf(s._frameRequestID);
      }
    } catch {}
  }

  function safeUpdate(chart, mode) {
    if (!isChartAlive(chart)) return;
    try {
      chart.update(mode || 'none');
    } catch (e) {
      const msg = String(e && (e.message || e) || "");
      if (isQuietErrorMessage(msg)) return;
      console.warn("[MetricsSignalAnalyzer] Chart update error:", e);
    }
  }

  function normalizeUnit(u) {
    const s = String(u || "dbf").toLowerCase();
    if (s === "dbµv" || s === "dbμv") return "dbuv";
    if (s === "dbuv") return "dbuv";
    if (s === "dbm") return "dbm";
    return "dbf";
  }

  function getCurrentUnit() {
    const u = (window.MetricsMonitor && typeof window.MetricsMonitor.getSignalUnit === "function")
      ? window.MetricsMonitor.getSignalUnit()
      : "dbf";
    return normalizeUnit(u);
  }

  // Convert from base dBf to display unit
  function convertValue(dbfValue, targetUnit) {
    const unit = normalizeUnit(targetUnit);
    const v = Number(dbfValue);
    if (!isFinite(v)) return 0;
    if (unit === "dbuv") return v - 10.875;
    if (unit === "dbm") return v - 119.75;
    return v;
  }

  function unitLabel(unit) {
    const u = normalizeUnit(unit);
    if (u === "dbuv") return "dBµV";
    if (u === "dbm") return "dBm";
    return "dBf";
  }

  function ensureHub() {
    if (window[HUB_KEY]) return window[HUB_KEY];

    const hub = {
      socket: null,
      isConnected: false,
      hasSocketListener: false,

      instances: new Map(),

      // Shared data buffer (base dBf)
      data: [],
      lastFreq: null,
      lastLabelTime: 0,

      // Global input routing
      activeKey: null,
      draggingKey: null,
      ctrlPressed: false,

      // Unit handling
      unit: getCurrentUnit(),
      unitSubscribed: false,

      // Global listeners
      globalMouseInstalled: false,
      globalKeyInstalled: false,

      // Global error suppression (specific known streaming races)
      errorSuppressionInstalled: false,

      // Throttle broadcasts
      lastBroadcastTs: 0,
      broadcastQueued: false,
    };

    window[HUB_KEY] = hub;

    ensureErrorSuppression(hub);
    ensureSocket(hub);
    ensureUnitSubscription(hub);
    ensureGlobalListeners(hub);

    return hub;
  }

  // Suppress ONLY the known benign Chart.js streaming race errors, without overriding window.onerror.
  function ensureErrorSuppression(hub) {
    if (hub.errorSuppressionInstalled) return;

    // Capture phase so we can prevent console noise earlier.
    window.addEventListener("error", (ev) => {
      try {
        const msg = String(ev?.message || ev?.error?.message || ev?.error || "");
        if (!isQuietErrorMessage(msg)) return;
        ev.preventDefault?.();
        ev.stopImmediatePropagation?.();
      } catch {}
    }, true);

    window.addEventListener("unhandledrejection", (ev) => {
      try {
        const reason = ev?.reason;
        const msg = String(reason?.message || reason || "");
        if (!isQuietErrorMessage(msg)) return;
        ev.preventDefault?.();
        ev.stopImmediatePropagation?.();
      } catch {}
    }, true);

    hub.errorSuppressionInstalled = true;
  }

  async function ensureSocket(hub) {
    if (hub.isConnected || hub.hasSocketListener) return;

    const attach = async () => {
      if (hub.hasSocketListener) return;

      try {
        hub.socket = window.MetricsSocket;
        if (!hub.socket) {
          setTimeout(attach, 750);
          return;
        }

        hub.socket.addEventListener("message", (evt) => {
          let msg = null;
          try { msg = JSON.parse(evt.data); } catch { return; }
          if (!msg || msg.sig === undefined) return;

          const rawVal = parseFloat(msg.sig);
          if (!isFinite(rawVal)) return;

          const now = Date.now();
          const point = { x: now, y: rawVal };

          const freq = msg.freq;
          if (freq !== undefined && freq !== null && freq !== "") {
            const f = parseFloat(freq);
            if (isFinite(f)) {
              const fmt = f.toFixed(2);
              if (hub.lastFreq !== fmt && (now - hub.lastLabelTime) > 3000) {
                point.freqChange = fmt;
                hub.lastFreq = fmt;
                hub.lastLabelTime = now;
              }
            }
          }

          hub.data.push(point);
          if (hub.data.length > 10000) hub.data.shift();

          broadcast(hub);
        });

        hub.hasSocketListener = true;
        hub.isConnected = true;
      } catch {
        setTimeout(attach, 1000);
      }
    };

    attach();
  }

  function ensureUnitSubscription(hub) {
    if (hub.unitSubscribed) return;
    if (window.MetricsMonitor && typeof window.MetricsMonitor.onSignalUnitChange === "function") {
      try {
        window.MetricsMonitor.onSignalUnitChange((newUnit) => {
          hub.unit = normalizeUnit(newUnit);
          hub.instances.forEach((inst) => {
            try { inst.onUnitChange(hub.unit); } catch {}
          });
          broadcast(hub, true);
        });
        hub.unitSubscribed = true;
      } catch {}
    }
  }

  function ensureGlobalListeners(hub) {
    if (!hub.globalMouseInstalled) {
      window.addEventListener("mousemove", (e) => {
        if (!hub.draggingKey) return;
        const inst = hub.instances.get(hub.draggingKey);
        if (inst) inst.onGlobalMouseMove(e);
      }, { passive: true });

      window.addEventListener("mouseup", (e) => {
        if (!hub.draggingKey) return;
        const inst = hub.instances.get(hub.draggingKey);
        hub.draggingKey = null;
        if (inst) inst.onGlobalMouseUp(e);
      }, { passive: true });

      hub.globalMouseInstalled = true;
    }

    if (!hub.globalKeyInstalled) {
      window.addEventListener("keydown", (e) => {
        if (e.key === "Control") hub.ctrlPressed = true;
        const inst = hub.activeKey ? hub.instances.get(hub.activeKey) : null;
        if (inst) inst.onGlobalKeyDown(e, hub.ctrlPressed);
      });

      window.addEventListener("keyup", (e) => {
        if (e.key === "Control") hub.ctrlPressed = false;
        const inst = hub.activeKey ? hub.instances.get(hub.activeKey) : null;
        if (inst) inst.onGlobalKeyUp(e, hub.ctrlPressed);
      });

      hub.globalKeyInstalled = true;
    }
  }

  function broadcast(hub, force = false) {
    const now = Date.now();
    if (!force && (now - hub.lastBroadcastTs) < 80) { // ~12.5 fps broadcast
      if (hub.broadcastQueued) return;
      hub.broadcastQueued = true;
      setTimeout(() => {
        hub.broadcastQueued = false;
        broadcast(hub, true);
      }, 80);
      return;
    }
    hub.lastBroadcastTs = now;

    hub.instances.forEach((inst) => {
      if (!inst || inst._destroyed) return;
      inst.onData();
    });
  }

  function createMpxBackgroundPlugin() {
    return {
      id: 'mmMpxCanvasBackground',
      beforeDraw(chart) {
        const { ctx, chartArea } = chart || {};
        if (!ctx || !chartArea) return;

        const { left, top, width, height } = chartArea;
        if (!isFinite(left) || !isFinite(top) || !isFinite(width) || !isFinite(height)) return;

        ctx.save();
        const grd = ctx.createLinearGradient(0, top, 0, top + height);
        grd.addColorStop(0, "#001225");
        grd.addColorStop(1, "#002044");
        ctx.fillStyle = grd;
        ctx.fillRect(left, top, width, height);
        ctx.restore();
      }
    };
  }

  function buildChartPlugins(inst) {
    const freqLabelPlugin = {
      id: 'mmSigFreqLabelRenderer',
      afterDatasetsDraw(chart) {
        if (!chart?.data?.datasets?.length) return;

        let meta;
        try { meta = chart.getDatasetMeta(0); } catch { return; }
        if (!meta || !Array.isArray(meta.data) || meta.data.length === 0) return;

        const { ctx, chartArea } = chart;
        const dataset = chart.data.datasets[0];
        if (!ctx || !chartArea || !dataset?.data?.length) return;

        ctx.save();

        meta.data.forEach((element, index) => {
          const dp = dataset.data[index];
          if (!dp || !dp.freqChange) return;

          const mx = element?.x;
          const my = element?.y;
          if (!isFinite(mx) || !isFinite(my)) return;

          if (mx < chartArea.left || mx > chartArea.right) return;

          let yLineStart, yLineEnd;
          if (my < chartArea.top + 20) {
            yLineStart = Math.max(my + 2, chartArea.top);
            yLineEnd = Math.max(my + 10, chartArea.top + 8);
          } else {
            yLineStart = my - 2;
            yLineEnd = my - 10;
          }

          ctx.beginPath();
          ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
          ctx.lineWidth = 1;
          ctx.moveTo(mx, yLineStart);
          ctx.lineTo(mx, yLineEnd);
          ctx.stroke();

          ctx.font = "bold 12px Arial";
          ctx.fillStyle = "#ffffff";
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";

          const yPos = (my < chartArea.top + 30)
            ? Math.max(chartArea.top - 2, my - 5)
            : (my - 12);

          ctx.fillText(dp.freqChange, mx, yPos);
        });

        ctx.restore();
      }
    };

    const unitLabelPlugin = {
      id: 'mmSigUnitLabelRenderer',
      afterDraw(chart) {
        if (inst.hideValueAndUnit) return;
        const { ctx, scales } = chart || {};
        const yAxis = scales?.y;
        if (!ctx || !yAxis) return;

        ctx.save();
        ctx.font = "11px Arial";
        ctx.fillStyle = "#8feaff";
        ctx.textAlign = "right";
        ctx.textBaseline = "top";

        const yPos = yAxis.bottom + 6;
        const xPos = yAxis.right - 4;

        ctx.fillText(unitLabel(inst.unit), xPos, yPos);
        ctx.restore();
      }
    };

    const currentValuePlugin = {
      id: 'mmSigCurrentValueRenderer',
      afterDraw(chart) {
        if (inst.hideValueAndUnit) return;
        const dataset = chart?.data?.datasets?.[0];
        if (!dataset?.data?.length) return;

        const last = dataset.data[dataset.data.length - 1];
        const rawY = last?.y;
        if (!isFinite(rawY)) return;

        const displayY = convertValue(rawY, inst.unit);
        const text = displayY.toFixed(1);

        const { ctx, scales } = chart || {};
        const yAxis = scales?.y;
        if (!ctx || !yAxis) return;

        ctx.save();
        ctx.font = "bold 12px Arial";
        ctx.fillStyle = dataset.borderColor || "#8feaff";
        ctx.textAlign = "right";
        ctx.textBaseline = "bottom";

        const xPos = yAxis.right - 4;
        const yPos = yAxis.top - 6;

        ctx.fillText(text, xPos, yPos);
        ctx.restore();
      }
    };

    return [freqLabelPlugin, unitLabelPlugin, currentValuePlugin];
  }

  class SignalAnalyzerInstance {
    constructor(hub, opts) {
      this.hub = hub;
      this.containerId = String(opts.containerId || "level-meter-container");
      this.instanceKey = String(opts.instanceKey || this.containerId);
      this.embedded = !!opts.embedded;

      // Legacy CSS/IDs are only safe if used once.
      this.useLegacyCss = !!opts.useLegacyCss && !opts.embedded && !hub.__legacyInUse;
      if (this.useLegacyCss) hub.__legacyInUse = true;

      this.hideValueAndUnit = (opts.hideValueAndUnit !== undefined)
        ? !!opts.hideValueAndUnit
        : (!!this.embedded && Array.isArray(CONFIG.CANVAS_SEQUENCE) && CONFIG.CANVAS_SEQUENCE.includes(4));

      this.unit = hub.unit;

      this.chart = null;
      this.wrap = null;
      this.canvas = null;

      // Zoom state (RAW, always dBf)
      this.yMin = Y_MIN_DEFAULT;
      this.yMax = Y_MAX_DEFAULT;
      this.duration = DURATION_DEFAULT;

      // Drag state
      this.isDragging = false;
      this.hasDragged = false;
      this.lastY = 0;

      // Tooltip
      this.tooltipEl = null;
      this.ctrlWasPressed = false;

      this._destroyed = false;

      this._canvasWheelHandler = (e) => this.onWheel(e);
      this._canvasMouseDownHandler = (e) => this.onMouseDown(e);
      this._canvasContextHandler = (e) => this.onContextMenu(e);
      this._canvasClickCapture = (e) => this.onClickCapture(e);

      this.mount();
    }

    mount() {
      const parent = document.getElementById(this.containerId);
      if (!parent) return;

      parent.innerHTML = "";

      const wrap = document.createElement("div");
      wrap.dataset.mmSignalAnalyzerWrap = "1";

      const canvas = document.createElement("canvas");
      canvas.dataset.mmSignalAnalyzerCanvas = "1";

      if (this.useLegacyCss) {
        wrap.id = "signalMetricsMonitorContainer";
        canvas.id = "signalMetricsMonitor";
      } else {
        const suffix = this.instanceKey.replace(/[^a-zA-Z0-9_-]/g, "_");
        wrap.id = `signalMetricsMonitorContainer_${suffix}`;
        canvas.id = `signalMetricsMonitor_${suffix}`;
      }

      if (this.embedded) {
        wrap.style.cssText = "position: relative; width: 100%; height: 100%; overflow: hidden; touch-action: none;";
        canvas.style.cssText = "display: block; width: 100%; height: 100%;";
      } else {
        wrap.style.cssText = "position: relative; width: 100%; height: 100%; overflow: hidden; touch-action: none;";
        canvas.style.cssText =
          "display: block; width: 100%; height: 100%; " +
          "background: linear-gradient(to bottom, #001225 0%, #002044 100%);";
      }

      wrap.appendChild(canvas);
      parent.appendChild(wrap);

      this.wrap = wrap;
      this.canvas = canvas;

      canvas.addEventListener("mouseenter", () => { this.hub.activeKey = this.instanceKey; });
      canvas.addEventListener("mouseleave", () => {
        if (this.hub.activeKey === this.instanceKey) this.hub.activeKey = null;
        this.hideTooltip();
      });

      canvas.addEventListener("wheel", this._canvasWheelHandler, { passive: false });
      canvas.addEventListener("mousedown", this._canvasMouseDownHandler);
      canvas.addEventListener("contextmenu", this._canvasContextHandler);
      canvas.addEventListener("click", this._canvasClickCapture, true);

      this.buildChart();
      this.updateCursor();
    }

    buildChart() {
      if (!this.canvas || this._destroyed) return;

      if (typeof Chart === "undefined") {
        console.error("[MetricsSignalAnalyzer] Chart.js is not loaded.");
        return;
      }

      const ctx = this.canvas.getContext("2d");
      if (!ctx) return;

      if (this.chart) {
        try { stopStreamingTimers(this.chart); } catch {}
        try { this.chart.destroy(); } catch {}
        this.chart = null;
      }

      const plugins = [createMpxBackgroundPlugin(), ...buildChartPlugins(this)];

      this.chart = new Chart(ctx, {
        type: 'line',
        data: {
          datasets: [{
            label: 'Signal',
            data: this.hub.data,
            parsing: { yAxisKey: 'y', xAxisKey: 'x' },

            tension: 0.6,
            pointRadius: 0,
            pointHoverRadius: 0,
            pointHitRadius: 0,

            borderWidth: 1.0,
            borderColor: '#8feaff',
            backgroundColor: 'rgba(143, 234, 255, 0.08)',
            fill: true,
          }]
        },
        plugins,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          backgroundColor: 'transparent',
          layout: { padding: { top: 25, right: 5, bottom: 5, left: 0 } },
          interaction: { intersect: false, mode: 'nearest' },
          scales: {
            x: {
              type: 'realtime',
              realtime: {
                duration: this.duration,
                refresh: 100,
                delay: 1000,

                // IMPORTANT: start paused until data exists; prevents early plugin races.
                pause: !this.hub.data || this.hub.data.length === 0,
              },
              grid: { display: true, color: 'rgba(255,255,255,0.12)', drawTicks: false },
              ticks: { display: true, color: 'rgba(255,255,255,0.65)', maxRotation: 0, autoSkip: true, maxTicksLimit: 15, padding: 5 }
            },
            y: {
              min: this.yMin,
              max: this.yMax,
              grace: 0,
              grid: { color: 'rgba(255,255,255,0.12)', drawTicks: false },
              ticks: {
                color: 'rgba(255,255,255,0.65)',
                font: { size: 10, family: "Arial" },
                autoSkip: false,
                includeBounds: false,
                padding: 8,
                callback: (value) => {
                  const disp = convertValue(value, this.unit);
                  const rounded = Math.round(disp);

                  if (this.unit === 'dbuv') {
                    if (rounded === -20) return null;
                    if (rounded === -10) return null;
                  }
                  if (this.unit === 'dbf') {
                    if (rounded === 0 || rounded === 100) return null;
                  }
                  if (this.unit === 'dbm') {
                    if (rounded === -20) return null;
                  }
                  return rounded;
                }
              },
              afterBuildTicks: (axis) => {
                try {
                  if (!axis) return;

                  const minRaw = axis.min;
                  const maxRaw = axis.max;

                  const minDisp = convertValue(minRaw, this.unit);
                  const maxDisp = convertValue(maxRaw, this.unit);
                  const range = maxDisp - minDisp;

                  let step;
                  if (range <= 10) step = 1;
                  else if (range <= 25) step = 5;
                  else step = 10;

                  let start = Math.ceil(minDisp / step) * step;
                  if (start < minDisp) start += step;

                  const newTicks = [];
                  for (let v = start; v <= maxDisp + 0.0001; v += step) {
                    const raw = (this.unit === "dbuv") ? (v + 10.875) :
                                (this.unit === "dbm")  ? (v + 119.75) :
                                v;
                    newTicks.push({ value: raw });
                  }
                  axis.ticks = newTicks;
                } catch {}
              },
              position: 'right'
            }
          },
          plugins: {
            legend: { display: false },
            tooltip: { enabled: true, mode: 'index', intersect: false }
          }
        }
      });
    }

    onData() {
      if (!this.chart || this._destroyed) return;

      // Resume realtime once we have at least 1 point (no manual update calls here -> less race with streaming)
      try {
        const rt = this.chart.options?.scales?.x?.realtime;
        if (rt && rt.pause && this.hub.data && this.hub.data.length > 0) {
          rt.pause = false;
        }
      } catch {}
    }

    onUnitChange(newUnit) {
      this.unit = normalizeUnit(newUnit);
      if (!this.chart || this._destroyed) return;
      safeUpdate(this.chart, 'none');
      this.updateCursor();
    }

    isVerticallyZoomed() {
      if (!this.chart) return false;
      const y = this.chart.options?.scales?.y;
      if (!y) return false;
      return (Math.abs(y.min - Y_MIN_DEFAULT) > 0.5) || (Math.abs(y.max - Y_MAX_DEFAULT) > 0.5);
    }

    updateCursor() {
      const c = this.canvas;
      if (!c) return;
      if (this.hub.ctrlPressed) c.style.cursor = "help";
      else if (this.isDragging) c.style.cursor = "grabbing";
      else if (this.isVerticallyZoomed()) c.style.cursor = "ns-resize";
      else c.style.cursor = "pointer";
    }

    showTooltip() {
      if (this.tooltipEl || !this.chart || this.isDragging) return;

      const canvas = this.chart.canvas;
      const parent = canvas?.parentElement;
      if (!parent) return;

      const el = document.createElement("div");
      el.innerHTML = `
        <div style="margin-bottom: 8px; font-weight: bold;">Signal Chart Zoom Controls</div>
        <div style="margin-bottom: 4px;">• Scroll wheel  Horizontal zoom (time)</div>
        <div style="margin-bottom: 4px;">• Ctrl + Scroll wheel  Vertical zoom (level)</div>
        <div style="margin-bottom: 4px;">• Left-click + Drag  Pan vertically</div>
        <div style="margin-bottom: 4px;">• Right-click  Reset zoom</div>
        <div style="margin-top: 5px; border-top: 1px solid rgba(143, 234, 255, 0.2); padding-top: 5px;"></div>
        <div style="margin-bottom: 4px;">• Ctrl + ↑ / ↓  Vertical zoom in/out</div>
        <div style="margin-bottom: 4px;">• Ctrl + ← / →  Horizontal zoom in/out</div>
        <div style="margin-bottom: 4px;">• Ctrl + Space  Reset zoom</div>
      `;
      el.style.cssText = `
        position:absolute; background: linear-gradient(to bottom, rgba(0, 40, 70, 0.95), rgba(0, 25, 50, 0.95));
        border:1px solid rgba(143, 234, 255, 0.5); border-radius: 8px; padding: 12px 16px; color: #8feaff;
        font-family: Arial, sans-serif; font-size: 10px; line-height: 1.2; z-index: 10000; pointer-events: none;
        box-shadow: 0 4px 20px rgba(0,0,0,0.5); opacity: 0; transition: opacity 0.2s ease-in-out;
        max-width: 320px; white-space: nowrap;
      `;

      parent.style.position = "relative";
      parent.appendChild(el);

      const tooltipWidth = el.offsetWidth;
      const tooltipHeight = el.offsetHeight;
      const left = (canvas.clientWidth - tooltipWidth) / 2;
      const top = (canvas.clientHeight - tooltipHeight) / 2;

      el.style.left = `${Math.max(5, left)}px`;
      el.style.top = `${Math.max(5, top)}px`;

      requestAnimationFrame(() => { el.style.opacity = "1"; });

      this.tooltipEl = el;
    }

    hideTooltip() {
      const el = this.tooltipEl;
      if (!el) return;
      el.style.opacity = "0";
      setTimeout(() => {
        if (el.parentElement) el.parentElement.removeChild(el);
      }, 200);
      this.tooltipEl = null;
    }

    storeZoomState() {
      if (!this.chart) return;
      const s = this.chart.options?.scales;
      if (!s?.y || !s?.x?.realtime) return;
      this.yMin = s.y.min;
      this.yMax = s.y.max;
      this.duration = s.x.realtime.duration;
    }

    zoomReset() {
      if (!this.chart) return;
      const s = this.chart.options?.scales;
      if (!s?.y || !s?.x?.realtime) return;

      s.y.min = Y_MIN_DEFAULT;
      s.y.max = Y_MAX_DEFAULT;
      s.x.realtime.duration = DURATION_DEFAULT;

      safeUpdate(this.chart, 'none');
      this.storeZoomState();
      this.updateCursor();
    }

    onWheel(e) {
      if (!this.chart) return;
      e.preventDefault();
      this.hideTooltip();

      const s = this.chart.options.scales;
      const zoomFactor = e.deltaY < 0 ? 0.9 : 1.1;

      if (e.ctrlKey) {
        const curRange = s.y.max - s.y.min;
        let newRange = curRange * zoomFactor;

        if (newRange > (Y_MAX_DEFAULT - Y_MIN_DEFAULT)) newRange = (Y_MAX_DEFAULT - Y_MIN_DEFAULT);
        if (newRange < 5) newRange = 5;

        const center = (s.y.max + s.y.min) / 2;
        let newMin = center - newRange / 2;
        let newMax = center + newRange / 2;

        if (newMin < Y_MIN_DEFAULT) { newMin = Y_MIN_DEFAULT; newMax = newMin + newRange; }
        if (newMax > Y_MAX_DEFAULT) { newMax = Y_MAX_DEFAULT; newMin = newMax - newRange; }

        s.y.min = newMin;
        s.y.max = newMax;
      } else {
        const rt = s.x.realtime;
        let newDuration = rt.duration * zoomFactor;
        if (newDuration < 1000) newDuration = 1000;
        if (newDuration > 120000) newDuration = 120000;
        rt.duration = newDuration;
      }

      safeUpdate(this.chart, 'none');
      this.storeZoomState();
      this.updateCursor();
    }

    onMouseDown(e) {
      if (!this.chart) return;

      const y = this.chart.options.scales.y;
      const vertZoomed = (Math.abs(y.min - Y_MIN_DEFAULT) > 0.5) || (Math.abs(y.max - Y_MAX_DEFAULT) > 0.5);

      if (!vertZoomed || e.button !== 0) return;

      this.hideTooltip();
      this.isDragging = true;
      this.hasDragged = false;
      this.lastY = e.clientY;

      this.hub.draggingKey = this.instanceKey;
      this.updateCursor();
    }

    onGlobalMouseMove(e) {
      if (!this.isDragging || !this.chart) return;

      const deltaY = e.clientY - this.lastY;
      if (Math.abs(deltaY) > 2) this.hasDragged = true;
      if (!this.hasDragged) return;

      this.lastY = e.clientY;

      const s = this.chart.options.scales;
      const range = s.y.max - s.y.min;
      const h = this.chart.chartArea.bottom - this.chart.chartArea.top;
      if (h <= 0) return;

      const valueDelta = (deltaY / h) * range;

      let newMin = s.y.min + valueDelta;
      let newMax = s.y.max + valueDelta;

      const zoomRange = newMax - newMin;

      if (newMin < Y_MIN_DEFAULT) { newMin = Y_MIN_DEFAULT; newMax = newMin + zoomRange; }
      if (newMax > Y_MAX_DEFAULT) { newMax = Y_MAX_DEFAULT; newMin = newMax - zoomRange; }

      s.y.min = newMin;
      s.y.max = newMax;

      safeUpdate(this.chart, 'none');
      this.storeZoomState();
    }

    onGlobalMouseUp(e) {
      if (!this.isDragging) return;
      this.isDragging = false;
      this.updateCursor();
      if (this.hasDragged) {
        try { e.stopPropagation(); } catch {}
      }
    }

    onClickCapture(e) {
      if (this.hasDragged) {
        try { e.stopPropagation(); e.preventDefault(); } catch {}
        this.hasDragged = false;
      }
    }

    onContextMenu(e) {
      e.preventDefault();
      this.hideTooltip();
      this.zoomReset();
    }

    onGlobalKeyDown(e) {
      if (!this.chart) return;

      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

      if (e.key === "Control" && !this.ctrlWasPressed) {
        this.ctrlWasPressed = true;
        if (!this.isDragging) this.showTooltip();
        this.updateCursor();
      }

      if (!e.ctrlKey) return;

      const H_ZOOM_FACTOR = 1.2;
      const V_ZOOM_FACTOR = 1.2;

      let handled = false;
      const s = this.chart.options.scales;

      switch (e.key) {
        case 'ArrowLeft': {
          const rt = s.x.realtime;
          let d = rt.duration / H_ZOOM_FACTOR;
          if (d < 1000) d = 1000;
          rt.duration = d;
          handled = true;
          break;
        }
        case 'ArrowRight': {
          const rt = s.x.realtime;
          let d = rt.duration * H_ZOOM_FACTOR;
          if (d > 120000) d = 120000;
          rt.duration = d;
          handled = true;
          break;
        }
        case 'ArrowUp': {
          const curRange = s.y.max - s.y.min;
          let newRange = curRange / V_ZOOM_FACTOR;
          if (newRange < 5) newRange = 5;

          const center = (s.y.max + s.y.min) / 2;
          s.y.min = center - newRange / 2;
          s.y.max = center + newRange / 2;
          handled = true;
          break;
        }
        case 'ArrowDown': {
          const curRange = s.y.max - s.y.min;
          let newRange = curRange * V_ZOOM_FACTOR;
          if (newRange > (Y_MAX_DEFAULT - Y_MIN_DEFAULT)) newRange = (Y_MAX_DEFAULT - Y_MIN_DEFAULT);

          const center = (s.y.max + s.y.min) / 2;
          let newMin = center - newRange / 2;
          let newMax = center + newRange / 2;

          if (newMin < Y_MIN_DEFAULT) { newMin = Y_MIN_DEFAULT; newMax = newMin + newRange; }
          if (newMax > Y_MAX_DEFAULT) { newMax = Y_MAX_DEFAULT; newMin = newMax - newRange; }

          s.y.min = newMin;
          s.y.max = newMax;
          handled = true;
          break;
        }
        case ' ':
          this.zoomReset();
          handled = true;
          break;
      }

      if (handled) {
        try { e.preventDefault(); e.stopPropagation(); } catch {}
        this.hideTooltip();
        safeUpdate(this.chart, 'none');
        this.storeZoomState();
        this.updateCursor();
      }
    }

    onGlobalKeyUp(e) {
      if (e.key === "Control") {
        this.ctrlWasPressed = false;
        this.hideTooltip();
        this.updateCursor();
      }
    }

    resize() {
      if (!this.chart || this._destroyed) return;
      try { this.chart.resize(); } catch {}
    }

    redraw(force) {
      if (!this.chart || this._destroyed) return;
      safeUpdate(this.chart, force ? 'none' : 'quiet');
    }

    destroy() {
      if (this._destroyed) return;
      this._destroyed = true;

      if (this.canvas) {
        this.canvas.removeEventListener("wheel", this._canvasWheelHandler);
        this.canvas.removeEventListener("mousedown", this._canvasMouseDownHandler);
        this.canvas.removeEventListener("contextmenu", this._canvasContextHandler);
        this.canvas.removeEventListener("click", this._canvasClickCapture, true);
      }

      this.hideTooltip();

      // Stop streaming timers BEFORE destroy (critical)
      try { stopStreamingTimers(this.chart); } catch {}

      if (this.chart) {
        try { this.chart.destroy(); } catch {}
        this.chart = null;
      }

      if (this.useLegacyCss) this.hub.__legacyInUse = false;

      try { this.hub.instances.delete(this.instanceKey); } catch {}

      try {
        if (this.wrap && this.wrap.parentElement) this.wrap.parentElement.removeChild(this.wrap);
      } catch {}

      this.wrap = null;
      this.canvas = null;
      this.isDragging = false;
    }
  }

  function createInstance(opts) {
    const hub = ensureHub();
    const o = opts || {};
    const instanceKey = String(o.instanceKey || o.containerId || "level-meter-container");

    const existing = hub.instances.get(instanceKey);
    if (existing) {
      try { existing.destroy(); } catch {}
      hub.instances.delete(instanceKey);
    }

    const inst = new SignalAnalyzerInstance(hub, {
      containerId: o.containerId || "level-meter-container",
      instanceKey,
      embedded: !!o.embedded,
      useLegacyCss: o.useLegacyCss !== undefined ? !!o.useLegacyCss : !o.embedded,
      hideValueAndUnit: o.hideValueAndUnit
    });

    hub.instances.set(instanceKey, inst);
    return inst;
  }

  function init(containerId = "level-meter-container") {
    const useLegacyCss = (containerId === "level-meter-container");
    return createInstance({ containerId, instanceKey: containerId, embedded: false, useLegacyCss });
  }

  function zoomReset(instanceKey) {
    const hub = ensureHub();
    if (instanceKey) {
      const inst = hub.instances.get(String(instanceKey));
      inst?.zoomReset?.();
      return;
    }
    const inst = hub.activeKey ? hub.instances.get(hub.activeKey) : null;
    (inst || hub.instances.values().next().value)?.zoomReset?.();
  }

  function resize(instanceKey) {
    const hub = ensureHub();
    if (instanceKey) return hub.instances.get(String(instanceKey))?.resize?.();
    hub.instances.forEach((inst) => inst.resize());
  }

  function redraw(force, instanceKey) {
    const hub = ensureHub();
    if (instanceKey) return hub.instances.get(String(instanceKey))?.redraw?.(force);
    hub.instances.forEach((inst) => inst.redraw(force));
  }

  window.MetricsSignalAnalyzer = {
    init,
    createInstance,
    zoomReset,
    resize,
    redraw,
  };

})();