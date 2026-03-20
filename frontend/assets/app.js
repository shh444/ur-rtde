import { DigitalTwinView } from "/assets/digital_twin.js";

const echartsRef = window.echarts;
const $ = (selector) => document.querySelector(selector);

const els = {
  stateBadge: $("#stateBadge"),
  fixedRobotHost: $("#fixedRobotHost"),
  frequencyInput: $("#frequencyInput"),
  historySecondsInput: $("#historySecondsInput"),
  historySampleHzInput: $("#historySampleHzInput"),
  robotModelSelect: $("#robotModelSelect"),
  fieldsInput: $("#fieldsInput"),
  clearFieldsBtn: $("#clearFieldsBtn"),
  presetButtons: $("#presetButtons"),
  fieldChipsOutputs: $("#fieldChipsOutputs"),
  fieldChipsGpInputs: $("#fieldChipsGpInputs"),
  fieldChipsGpOutputs: $("#fieldChipsGpOutputs"),
  configForm: $("#configForm"),
  startBtn: $("#startBtn"),
  stopBtn: $("#stopBtn"),
  restartBtn: $("#restartBtn"),
  writeForm: $("#writeForm"),
  writeFieldSelect: $("#writeFieldSelect"),
  writeValueInput: $("#writeValueInput"),
  recordStartBtn: $("#recordStartBtn"),
  recordStopBtn: $("#recordStopBtn"),
  exportSnapshotBtn: $("#exportSnapshotBtn"),
  downloadRecordingLink: $("#downloadRecordingLink"),
  downloadSnapshotLink: $("#downloadSnapshotLink"),
  recordingSummary: $("#recordingSummary"),
  eventsList: $("#eventsList"),
  statHost: $("#statHost"),
  statHz: $("#statHz"),
  statActualHz: $("#statActualHz"),
  statConsumerHz: $("#statConsumerHz"),
  statSkipped: $("#statSkipped"),
  statFrame: $("#statFrame"),
  statAge: $("#statAge"),
  statController: $("#statController"),
  valueSearchInput: $("#valueSearchInput"),
  liveTableBody: $("#liveTableBody"),
  copyJsonBtn: $("#copyJsonBtn"),
  errorBanner: $("#errorBanner"),
  diBits: $("#diBits"),
  doBits: $("#doBits"),
  snapshotView: $("#snapshotView"),
  twinCanvas: $("#twinCanvas"),
  twinModelLabel: $("#twinModelLabel"),
  twinStatusLabel: $("#twinStatusLabel"),
  twinWarning: $("#twinWarning"),
  twinDelta: $("#twinDelta"),
  twinToolStatus: $("#twinToolStatus"),
  twinActualPose: $("#twinActualPose"),
  twinFkPose: $("#twinFkPose"),
  twinJointDeg: $("#twinJointDeg"),
  twinDebugText: $("#twinDebugText"),
  copyTwinDebugBtn: $("#copyTwinDebugBtn"),
  currentMonitorBanner: $("#currentMonitorBanner"),
  currentMonitorSummary: $("#currentMonitorSummary"),
  currentMonitorCards: $("#currentMonitorCards"),
  currentJointSelect: $("#currentJointSelect"),
  twinTrailToggle: $("#twinTrailToggle"),
  twinFreezeToggle: $("#twinFreezeToggle"),
  twinIsoBtn: $("#twinIsoBtn"),
  twinFrontBtn: $("#twinFrontBtn"),
  twinSideBtn: $("#twinSideBtn"),
  twinTopBtn: $("#twinTopBtn"),
  twinResetBtn: $("#twinResetBtn"),
};

const charts = {};
let appState = { full: null, live: null };
let catalog = null;
let streamWs = null;
let liveWs = null;
let configDirty = false;
let twin = null;

function numericOrNull(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function splitFields(text) {
  return Array.from(new Set(
    (text || "")
      .split(/[\s,]+/g)
      .map((item) => item.trim())
      .filter(Boolean),
  ));
}

function currentViewState() {
  return {
    ...(appState.full || {}),
    status: appState.live?.status || appState.full?.status,
    latest: appState.live?.latest || appState.full?.latest,
    recording: appState.live?.recording || appState.full?.recording,
    export: appState.live?.export || appState.full?.export,
    digital_twin: appState.live?.digital_twin || appState.full?.digital_twin,
    current_monitor:
      appState.live?.current_monitor ||
      appState.full?.current_monitor ||
      appState.live?.latest?.derived?.current_monitor ||
      appState.full?.latest?.derived?.current_monitor,
  };
}

function initCharts() {
  charts.jointDeg = echartsRef.init(document.getElementById("chartJointDeg"));
  charts.jointVelDeg = echartsRef.init(document.getElementById("chartJointVelDeg"));
  charts.jointCurrent = echartsRef.init(document.getElementById("chartJointCurrent"));
  charts.currentWindow = echartsRef.init(document.getElementById("chartCurrentWindow"));
  charts.tcpPos = echartsRef.init(document.getElementById("chartTcpPos"));
  charts.tcpRpy = echartsRef.init(document.getElementById("chartTcpRpy"));
  charts.aux = echartsRef.init(document.getElementById("chartAux"));
}

function initTwin() {
  twin = new DigitalTwinView(els.twinCanvas);
}

function baseLineOption(series, yAxisName = "") {
  return {
    backgroundColor: "transparent",
    animation: false,
    grid: { left: 54, right: 32, top: 34, bottom: 48 },
    tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
    legend: {
      top: 0,
      textStyle: { color: "#c7d2fe" },
      itemWidth: 12,
      itemHeight: 8,
    },
    toolbox: {
      right: 0,
      feature: {
        restore: {},
        dataZoom: { yAxisIndex: "none" },
        saveAsImage: { backgroundColor: "#0b1220" },
      },
      iconStyle: { borderColor: "#94a3b8" },
    },
    xAxis: {
      type: "value",
      name: "t [s]",
      nameLocation: "middle",
      nameGap: 30,
      axisLabel: { color: "#9fb0cf" },
      axisLine: { lineStyle: { color: "rgba(148,163,184,0.35)" } },
      splitLine: { lineStyle: { color: "rgba(148,163,184,0.10)" } },
    },
    yAxis: {
      type: "value",
      name: yAxisName,
      axisLabel: { color: "#9fb0cf" },
      axisLine: { lineStyle: { color: "rgba(148,163,184,0.35)" } },
      splitLine: { lineStyle: { color: "rgba(148,163,184,0.10)" } },
    },
    dataZoom: [
      { type: "inside" },
      { type: "slider", height: 18, bottom: 6, borderColor: "rgba(148,163,184,0.18)", backgroundColor: "rgba(255,255,255,0.02)" },
    ],
    series: (series || []).map((item) => ({
      type: "line",
      name: item.name,
      data: item.data,
      symbol: "none",
      smooth: false,
      lineStyle: { width: 2 },
      emphasis: { focus: "series" },
      yAxisIndex: item.yAxisIndex || 0,
    })),
  };
}

function auxOption(speedSeries, gpSeries) {
  const series = [];
  (speedSeries || []).forEach((item) => series.push({ ...item, yAxisIndex: 0 }));
  (gpSeries || []).forEach((item) => series.push({ ...item, yAxisIndex: 1 }));
  return {
    backgroundColor: "transparent",
    animation: false,
    grid: { left: 54, right: 54, top: 34, bottom: 48 },
    tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
    legend: { top: 0, textStyle: { color: "#c7d2fe" } },
    toolbox: {
      right: 0,
      feature: {
        restore: {},
        dataZoom: { yAxisIndex: "none" },
        saveAsImage: { backgroundColor: "#0b1220" },
      },
      iconStyle: { borderColor: "#94a3b8" },
    },
    xAxis: {
      type: "value",
      name: "t [s]",
      nameLocation: "middle",
      nameGap: 30,
      axisLabel: { color: "#9fb0cf" },
      axisLine: { lineStyle: { color: "rgba(148,163,184,0.35)" } },
      splitLine: { lineStyle: { color: "rgba(148,163,184,0.10)" } },
    },
    yAxis: [
      {
        type: "value",
        name: "speed",
        axisLabel: { color: "#9fb0cf" },
        axisLine: { lineStyle: { color: "rgba(148,163,184,0.35)" } },
        splitLine: { lineStyle: { color: "rgba(148,163,184,0.10)" } },
      },
      {
        type: "value",
        name: "GP",
        axisLabel: { color: "#9fb0cf" },
        axisLine: { lineStyle: { color: "rgba(148,163,184,0.35)" } },
        splitLine: { show: false },
      },
    ],
    dataZoom: [
      { type: "inside" },
      { type: "slider", height: 18, bottom: 6, borderColor: "rgba(148,163,184,0.18)", backgroundColor: "rgba(255,255,255,0.02)" },
    ],
    series: series.map((item) => ({
      type: "line",
      name: item.name,
      data: item.data,
      symbol: "none",
      smooth: false,
      lineStyle: { width: 2 },
      yAxisIndex: item.yAxisIndex,
    })),
  };
}

function selectedCurrentJointIndex() {
  const value = Number(els.currentJointSelect?.value ?? 0);
  return Number.isFinite(value) ? Math.max(0, Math.min(5, value)) : 0;
}

function currentWindowOption(history, jointIndex) {
  const idx = Math.max(0, Math.min(5, jointIndex || 0));
  const actualSeries = history?.joint_current?.[idx]?.data || [];
  const targetSeries = history?.target_current?.[idx]?.data || [];
  const windowSeries = history?.current_window?.[idx]?.data || [];

  const upperSeries = [];
  const lowerSeries = [];
  const length = Math.min(targetSeries.length, windowSeries.length);
  for (let i = 0; i < length; i += 1) {
    const t = targetSeries[i]?.[0];
    const target = targetSeries[i]?.[1];
    const window = windowSeries[i]?.[1];
    if (Number.isFinite(t) && Number.isFinite(target) && Number.isFinite(window)) {
      upperSeries.push([t, target + window]);
      lowerSeries.push([t, target - window]);
    }
  }

  return {
    backgroundColor: "transparent",
    animation: false,
    grid: { left: 54, right: 32, top: 34, bottom: 48 },
    tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
    legend: { top: 0, textStyle: { color: "#c7d2fe" } },
    toolbox: {
      right: 0,
      feature: {
        restore: {},
        dataZoom: { yAxisIndex: "none" },
        saveAsImage: { backgroundColor: "#0b1220" },
      },
      iconStyle: { borderColor: "#94a3b8" },
    },
    xAxis: {
      type: "value",
      name: "t [s]",
      nameLocation: "middle",
      nameGap: 30,
      axisLabel: { color: "#9fb0cf" },
      axisLine: { lineStyle: { color: "rgba(148,163,184,0.35)" } },
      splitLine: { lineStyle: { color: "rgba(148,163,184,0.10)" } },
    },
    yAxis: {
      type: "value",
      name: "A",
      axisLabel: { color: "#9fb0cf" },
      axisLine: { lineStyle: { color: "rgba(148,163,184,0.35)" } },
      splitLine: { lineStyle: { color: "rgba(148,163,184,0.10)" } },
    },
    dataZoom: [
      { type: "inside" },
      { type: "slider", height: 18, bottom: 6, borderColor: "rgba(148,163,184,0.18)", backgroundColor: "rgba(255,255,255,0.02)" },
    ],
    series: [
      { type: "line", name: "actual_current", data: actualSeries, symbol: "none", smooth: false, lineStyle: { width: 2 } },
      { type: "line", name: "target_current", data: targetSeries, symbol: "none", smooth: false, lineStyle: { width: 2, type: "solid" } },
      { type: "line", name: "upper window", data: upperSeries, symbol: "none", smooth: false, lineStyle: { width: 1.5, type: "dashed" } },
      { type: "line", name: "lower window", data: lowerSeries, symbol: "none", smooth: false, lineStyle: { width: 1.5, type: "dashed" } },
    ],
  };
}

function formatMonitorNumber(value, digits = 3) {
  return Number.isFinite(value) ? value.toFixed(digits) : "-";
}

function renderCurrentMonitor(currentMonitor) {
  if (!els.currentMonitorCards) return;
  els.currentMonitorCards.innerHTML = "";
  const summary = currentMonitor?.summary || {};
  const safetyStatus = currentMonitor?.safety_status != null ? ` | safety_status ${currentMonitor.safety_status}` : "";
  els.currentMonitorSummary.textContent = `OK ${summary.ok_count ?? 0} | Warn ${summary.warn_count ?? 0} | Exceed ${summary.exceed_count ?? 0} | max ratio ${formatMonitorNumber(summary.max_window_ratio, 2)} | max delta ${formatMonitorNumber(summary.max_delta_a, 3)} A${safetyStatus}`;
  els.currentMonitorBanner.textContent = currentMonitor?.message || currentMonitor?.monitoring_note || "Add actual_current, target_current, and actual_current_window to see current window monitoring.";
  (currentMonitor?.joints || []).forEach((joint) => {
    const card = document.createElement("article");
    card.className = `current-card ${joint.status || "unknown"}`;
    const head = document.createElement("div");
    head.className = "current-card-head";
    const title = document.createElement("strong");
    title.textContent = joint.joint || "J?";
    const badge = document.createElement("span");
    badge.className = `status-badge ${joint.status || "unknown"}`;
    badge.textContent = joint.status || "unknown";
    head.append(title, badge);

    const lines = [
      ["actual_current", `${formatMonitorNumber(joint.actual_current)} A`],
      ["target_current", `${formatMonitorNumber(joint.target_current)} A`],
      ["actual_current_window", `±${formatMonitorNumber(joint.actual_current_window)} A`],
      ["allowed", `[${formatMonitorNumber(joint.lower_limit)}, ${formatMonitorNumber(joint.upper_limit)}] A`],
      ["delta", `${formatMonitorNumber(joint.delta)} A`],
      ["window_ratio", Number.isFinite(joint.window_ratio) ? `${(joint.window_ratio * 100).toFixed(1)} %` : "-"],
      ["joint_control_output", `${formatMonitorNumber(joint.joint_control_output)} A`],
      ["joint_temperature", `${formatMonitorNumber(joint.joint_temperature, 1)} C`],
    ];

    const body = document.createElement("div");
    body.className = "current-card-body";
    lines.forEach(([name, value]) => {
      const row = document.createElement("div");
      row.className = "current-row";
      const left = document.createElement("span");
      left.textContent = name;
      const right = document.createElement("strong");
      right.textContent = value;
      row.append(left, right);
      body.appendChild(row);
    });

    card.append(head, body);
    els.currentMonitorCards.appendChild(card);
  });
}

function setFormFieldsFromState(state, force = false) {
  if (!state || (!force && configDirty)) return;
  const status = state.status || {};
  const config = state.config || {};
  if (els.fixedRobotHost) els.fixedRobotHost.textContent = status.host || config.host || "-";
  els.frequencyInput.value = status.frequency_hz ?? config.frequency_hz ?? "";
  els.historySecondsInput.value = config.history_seconds ?? "";
  els.historySampleHzInput.value = config.history_sample_hz ?? "";
  els.robotModelSelect.value = status.robot_model || config.robot_model || catalog?.default_robot_model || "ur5e";
  els.fieldsInput.value = (status.fields || config.fields || []).join("\n");
}

function updateBadge(status) {
  els.stateBadge.textContent = status.running ? "running" : (status.error ? "error" : "stopped");
  els.stateBadge.className = `badge ${status.running ? "running" : (status.error ? "error" : "stopped")}`;
}

function updateStats(status) {
  if (els.statHost) els.statHost.textContent = status.host || "-";
  if (els.statHz) {
    const requestedHz = Number(status.frequency_hz ?? 0);
    const activeHz = Number(status.active_frequency_hz ?? requestedHz ?? 0);
    if (requestedHz && activeHz && Math.abs(requestedHz - activeHz) > 1e-6) {
      els.statHz.textContent = `${requestedHz} -> ${activeHz} Hz`;
    } else if (requestedHz) {
      els.statHz.textContent = `${requestedHz} Hz`;
    } else {
      els.statHz.textContent = "-";
    }
  }
  if (els.statActualHz) els.statActualHz.textContent = status.reader_rate_hz ? `${status.reader_rate_hz} Hz` : (status.approx_rate_hz ? `${status.approx_rate_hz} Hz` : "-");
  if (els.statConsumerHz) els.statConsumerHz.textContent = status.consumer_rate_hz ? `${status.consumer_rate_hz} Hz` : "-";
  if (els.statSkipped) els.statSkipped.textContent = status.consumer_skipped_frames ?? "-";
  if (els.statFrame) els.statFrame.textContent = status.frame_index ?? "-";
  if (els.statAge) els.statAge.textContent = status.age_ms != null ? `${status.age_ms} ms` : "-";
  if (els.statController) els.statController.textContent = Array.isArray(status.controller_version) ? status.controller_version.join(".") : "-";
}

function renderRows(rows) {
  const query = (els.valueSearchInput.value || "").trim().toLowerCase();
  els.liveTableBody.innerHTML = "";
  (rows || []).filter((row) => {
    if (!query) return true;
    return [row.token, row.normalized, row.formatted, row.unit, row.help].join(" ").toLowerCase().includes(query);
  }).forEach((row) => {
    const tr = document.createElement("tr");
    const tdField = document.createElement("td");
    const pill = document.createElement("div");
    pill.className = "token-pill";
    const tokenSpan = document.createElement("span");
    tokenSpan.textContent = row.token;
    pill.appendChild(tokenSpan);
    if (row.writable) {
      const badge = document.createElement("span");
      badge.className = "small-badge";
      badge.textContent = "write";
      pill.appendChild(badge);
    }
    tdField.appendChild(pill);
    const help = document.createElement("div");
    help.className = "hint";
    help.textContent = row.help || "";
    tdField.appendChild(help);

    const tdNorm = document.createElement("td");
    tdNorm.textContent = row.normalized;
    const tdValue = document.createElement("td");
    tdValue.textContent = row.formatted || "";
    const tdUnit = document.createElement("td");
    tdUnit.textContent = row.unit || "";
    const tdType = document.createElement("td");
    tdType.textContent = row.access || (row.writable ? "read/write" : "read");
    const tdDirection = document.createElement("td");
    tdDirection.textContent = row.direction || "output";

    tr.append(tdField, tdNorm, tdValue, tdUnit, tdType, tdDirection);
    els.liveTableBody.appendChild(tr);
  });
}

function renderBits(container, bits) {
  container.innerHTML = "";
  (bits || Array.from({ length: 16 }, () => false)).forEach((on, index) => {
    const card = document.createElement("div");
    card.className = `bit ${on ? "on" : ""}`;
    const left = document.createElement("span");
    left.textContent = index;
    const right = document.createElement("strong");
    right.textContent = on ? "ON" : "OFF";
    card.append(left, right);
    container.appendChild(card);
  });
}

function renderEvents(events) {
  els.eventsList.innerHTML = "";
  (events || []).slice().reverse().forEach((event) => {
    const div = document.createElement("div");
    div.className = "event";
    div.dataset.level = event.level || "info";
    const time = document.createElement("time");
    time.textContent = `${event.time} - ${event.level}`;
    const message = document.createElement("div");
    message.textContent = event.message;
    div.append(time, message);
    els.eventsList.appendChild(div);
  });
}

function updateRecording(recording, exportInfo) {
  if (recording?.download_url) {
    els.downloadRecordingLink.href = recording.download_url;
    els.downloadRecordingLink.classList.remove("disabled");
  } else {
    els.downloadRecordingLink.href = "#";
    els.downloadRecordingLink.classList.add("disabled");
  }
  els.recordingSummary.textContent = recording?.active
    ? `recording... ${recording.rows || 0} rows`
    : recording?.filename
      ? `last file: ${recording.filename} (${recording.rows || 0} rows)`
      : "no recording file yet";

  if (exportInfo?.download_url) {
    els.downloadSnapshotLink.href = exportInfo.download_url;
    els.downloadSnapshotLink.textContent = `Download latest snapshot (${exportInfo.filename})`;
    els.downloadSnapshotLink.classList.remove("hidden");
  } else {
    els.downloadSnapshotLink.classList.add("hidden");
  }
}

function updateWriteOptions(status) {
  const currentValue = els.writeFieldSelect.value;
  els.writeFieldSelect.innerHTML = "";
  const fields = status.write_fields || [];
  if (!fields.length) {
    const opt = document.createElement("option");
    opt.textContent = "No writable GP field";
    opt.value = "";
    els.writeFieldSelect.appendChild(opt);
    return;
  }
  fields.forEach((field) => {
    const opt = document.createElement("option");
    opt.textContent = field;
    opt.value = field;
    els.writeFieldSelect.appendChild(opt);
  });
  if (fields.includes(currentValue)) {
    els.writeFieldSelect.value = currentValue;
  }
}

function updateErrorBanner(status) {
  if (status.error) {
    els.errorBanner.textContent = status.error;
    els.errorBanner.classList.remove("hidden");
  } else {
    els.errorBanner.classList.add("hidden");
  }
}

function updateSnapshotView(latest) {
  const payload = latest ? {
    frame_index: latest.frame_index,
    robot_timestamp_s: latest.robot_timestamp_s,
    age_ms: latest.age_ms,
    values: latest.values,
    derived: latest.derived,
  } : {};
  els.snapshotView.textContent = JSON.stringify(payload, null, 2);
}

function updateCharts(history) {
  charts.jointDeg.setOption(baseLineOption(history.joint_deg || [], "deg"), true);
  charts.jointVelDeg.setOption(baseLineOption(history.joint_vel_deg || [], "deg/s"), true);
  charts.jointCurrent.setOption(baseLineOption(history.joint_current || [], "A"), true);
  charts.currentWindow.setOption(currentWindowOption(history || {}, selectedCurrentJointIndex()), true);
  charts.tcpPos.setOption(baseLineOption(history.tcp_xyz_mm || [], "mm"), true);
  charts.tcpRpy.setOption(baseLineOption(history.tcp_rpy_deg || [], "deg"), true);
  charts.aux.setOption(auxOption(history.speed || [], history.gp_numeric || []), true);
}

function renderTwin(state) {
  if (!twin) return;
  const summary = twin.update(state);
  els.twinModelLabel.textContent = summary?.modelLabel || state?.status?.robot_model || "UR";
  els.twinStatusLabel.textContent = summary?.statusLabel || "waiting";
  els.twinStatusLabel.className = `badge ${String(summary?.statusLabel || "").includes("live") ? "running" : "neutral"}`;
  els.twinWarning.textContent = state?.digital_twin?.warning || summary?.warning || "Green = model TCP, cyan = actual TCP overlay.";
  els.twinDelta.textContent = summary?.deltaMm != null
    ? `${summary.deltaMm.toFixed(1)} mm / ${summary.deltaRotDeg?.toFixed(2) || "0.00"} deg`
    : "-";
  els.twinToolStatus.textContent = summary?.infoText || "-";
  els.twinActualPose.textContent = summary?.formatPoseText(summary.actualPose) || "-";
  els.twinFkPose.textContent = summary?.formatPoseText(summary.fkPose) || "-";
  els.twinJointDeg.textContent = summary?.formatJointText() || "-";
  if (els.twinDebugText) {
    const meshInfo = (summary?.meshInfo || []).join("\n");
    const debugText = summary?.debugText || "-";
    els.twinDebugText.textContent = [meshInfo, debugText].filter(Boolean).join("\n\n");
  }
}

function renderCatalog() {
  els.presetButtons.innerHTML = "";
  Object.entries(catalog.presets || {}).forEach(([name, fields]) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip";
    btn.textContent = name;
    btn.title = (fields || []).join(", ");
    btn.addEventListener("click", () => {
      els.fieldsInput.value = fields.join("\n");
      configDirty = true;
    });
    els.presetButtons.appendChild(btn);
  });

  const renderChipSection = (element, fields) => {
    if (!element) return;
    element.innerHTML = "";
    (fields || []).forEach((field) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip";
      btn.textContent = field;
      btn.title = catalog.field_help?.[field] || field;
      btn.addEventListener("click", () => appendFieldToken(field));
      element.appendChild(btn);
    });
  };

  renderChipSection(els.fieldChipsOutputs, catalog.field_sections?.robot_outputs || []);
  renderChipSection(els.fieldChipsGpInputs, catalog.field_sections?.gp_inputs || []);
  renderChipSection(els.fieldChipsGpOutputs, catalog.field_sections?.gp_outputs || []);

  els.robotModelSelect.innerHTML = "";
  (catalog.robot_models || []).forEach((item) => {
    const opt = document.createElement("option");
    opt.value = item.key;
    opt.textContent = item.label;
    els.robotModelSelect.appendChild(opt);
  });
  els.robotModelSelect.value = catalog.default_robot_model || "ur5e";
}

function appendFieldToken(token) {
  const tokens = splitFields(els.fieldsInput.value);
  if (!tokens.includes(token)) tokens.push(token);
  els.fieldsInput.value = tokens.join("\n");
  configDirty = true;
}

function buildConfigPayload(restartIfRunning) {
  return {
    frequency_hz: numericOrNull(els.frequencyInput.value),
    history_seconds: numericOrNull(els.historySecondsInput.value),
    history_sample_hz: numericOrNull(els.historySampleHzInput.value),
    robot_model: els.robotModelSelect.value,
    fields: splitFields(els.fieldsInput.value),
    restart_if_running: restartIfRunning,
  };
}

async function applyConfig({ restartIfRunning = true, forceForm = true } = {}) {
  const state = await api("/api/config", {
    method: "POST",
    body: JSON.stringify(buildConfigPayload(restartIfRunning)),
  });
  configDirty = false;
  renderFullState(state, { forceForm });
  return state;
}

async function ensureConfigAppliedForAction(action) {
  const running = Boolean(currentViewState()?.status?.running);
  if (!configDirty) return null;
  if (action === "restart") {
    await applyConfig({ restartIfRunning: false, forceForm: true });
    return null;
  }
  return applyConfig({ restartIfRunning: running, forceForm: true });
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    const contentType = response.headers.get("content-type") || "";
    let detail = `${response.status}`;
    if (contentType.includes("application/json")) {
      const payload = await response.json();
      detail = payload.detail || JSON.stringify(payload);
    } else {
      detail = await response.text();
    }
    throw new Error(detail);
  }
  const contentType = response.headers.get("content-type") || "";
  return contentType.includes("application/json") ? response.json() : response.text();
}

async function loadCatalog() {
  catalog = await api("/api/catalog");
  renderCatalog();
}

async function refreshState(forceForm = false) {
  const state = await api("/api/state");
  renderFullState(state, { forceForm });
}

function renderCommon(state, { forceForm = false } = {}) {
  const status = state.status || {};
  updateBadge(status);
  updateStats(status);
  setFormFieldsFromState(state, forceForm);
  updateWriteOptions(status);
  updateErrorBanner(status);
  updateRecording(state.recording, state.export);
  renderTwin(state);
  renderCurrentMonitor(state.current_monitor || state.latest?.derived?.current_monitor);
}

function renderFullState(state, { forceForm = false } = {}) {
  appState.full = state;
  const viewState = currentViewState();
  renderCommon(viewState, { forceForm });
  renderRows(viewState.latest?.rows || state.latest?.rows || []);
  updateSnapshotView(viewState.latest || state.latest);
  renderBits(els.diBits, viewState.latest?.derived?.di_bits || state.latest?.derived?.di_bits || []);
  renderBits(els.doBits, viewState.latest?.derived?.do_bits || state.latest?.derived?.do_bits || []);
  renderEvents(state.events || []);
  updateCharts(state.history || {});
}

function renderLiveState(state) {
  appState.live = state;
  const viewState = currentViewState();
  renderCommon(viewState, { forceForm: false });
  renderRows(viewState.latest?.rows || []);
  updateSnapshotView(viewState.latest);
  renderBits(els.diBits, viewState.latest?.derived?.di_bits || []);
  renderBits(els.doBits, viewState.latest?.derived?.do_bits || []);
}

function connectStateWebSocket() {
  if (streamWs) streamWs.close();
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  streamWs = new WebSocket(`${protocol}://${window.location.host}/ws/stream`);
  streamWs.onmessage = (event) => {
    try {
      renderFullState(JSON.parse(event.data), { forceForm: false });
    } catch (error) {
      console.error(error);
    }
  };
  streamWs.onclose = () => window.setTimeout(connectStateWebSocket, 1500);
}

function connectLiveWebSocket() {
  if (liveWs) liveWs.close();
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  liveWs = new WebSocket(`${protocol}://${window.location.host}/ws/live`);
  liveWs.onmessage = (event) => {
    try {
      renderLiveState(JSON.parse(event.data));
    } catch (error) {
      console.error(error);
    }
  };
  liveWs.onclose = () => window.setTimeout(connectLiveWebSocket, 1500);
}

function bindEvents() {
  if (els.currentJointSelect) {
    els.currentJointSelect.innerHTML = Array.from({ length: 6 }, (_, index) => `<option value="${index}">J${index + 1}</option>`).join("");
    els.currentJointSelect.value = "0";
    els.currentJointSelect.addEventListener("change", () => {
      if (appState.full?.history) updateCharts(appState.full.history);
    });
  }
  [els.frequencyInput, els.historySecondsInput, els.historySampleHzInput, els.fieldsInput, els.robotModelSelect].forEach((node) => {
    node.addEventListener("input", () => {
      configDirty = true;
      if (node === els.robotModelSelect && twin) {
        twin.setModel(els.robotModelSelect.value);
      }
    });
  });

  els.clearFieldsBtn.addEventListener("click", () => {
    els.fieldsInput.value = "";
    configDirty = true;
  });

  els.configForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await applyConfig({ restartIfRunning: true, forceForm: true });
    } catch (error) {
      alert(`Config failed: ${error.message}`);
    }
  });

  els.startBtn.addEventListener("click", async () => {
    try {
      let state = await ensureConfigAppliedForAction("start");
      if (!currentViewState()?.status?.running) {
        state = await api("/api/start", { method: "POST" });
      }
      if (state) renderFullState(state, { forceForm: false });
    } catch (error) {
      alert(`Start failed: ${error.message}`);
    }
  });
  els.stopBtn.addEventListener("click", async () => {
    try { renderFullState(await api("/api/stop", { method: "POST" }), { forceForm: false }); } catch (error) { alert(`Stop failed: ${error.message}`); }
  });
  els.restartBtn.addEventListener("click", async () => {
    try {
      await ensureConfigAppliedForAction("restart");
      renderFullState(await api("/api/restart", { method: "POST" }), { forceForm: false });
    } catch (error) {
      alert(`Restart failed: ${error.message}`);
    }
  });

  els.writeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const field = els.writeFieldSelect.value;
      if (!field) return;
      const raw = els.writeValueInput.value;
      let value = raw;
      const lowered = raw.trim().toLowerCase();
      if (["true", "false", "on", "off", "yes", "no"].includes(lowered)) {
        value = ["true", "on", "yes"].includes(lowered);
      } else if (raw.trim() !== "" && !Number.isNaN(Number(raw))) {
        value = Number(raw);
      }
      renderFullState(await api("/api/write", { method: "POST", body: JSON.stringify({ field, value }) }), { forceForm: false });
      els.writeValueInput.select();
    } catch (error) {
      alert(`Write failed: ${error.message}`);
    }
  });

  els.recordStartBtn.addEventListener("click", async () => {
    try { renderFullState(await api("/api/recording/start", { method: "POST", body: JSON.stringify({ label: "ui" }) }), { forceForm: false }); } catch (error) { alert(`Recording failed: ${error.message}`); }
  });
  els.recordStopBtn.addEventListener("click", async () => {
    try { renderFullState(await api("/api/recording/stop", { method: "POST" }), { forceForm: false }); } catch (error) { alert(`Stop recording failed: ${error.message}`); }
  });
  els.exportSnapshotBtn.addEventListener("click", async () => {
    try {
      const result = await api("/api/export/snapshot", { method: "POST", body: JSON.stringify({ label: "ui" }) });
      if (result?.url) {
        els.downloadSnapshotLink.href = result.url;
        els.downloadSnapshotLink.textContent = `Download latest snapshot (${result.filename})`;
        els.downloadSnapshotLink.classList.remove("hidden");
      }
      await refreshState(false);
    } catch (error) {
      alert(`Snapshot export failed: ${error.message}`);
    }
  });

  els.valueSearchInput.addEventListener("input", () => renderRows(currentViewState()?.latest?.rows || []));
  els.copyJsonBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(currentViewState()?.latest || {}, null, 2));
    } catch (error) {
      console.error(error);
    }
  });

  if (els.copyTwinDebugBtn) {
    els.copyTwinDebugBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(els.twinDebugText?.textContent || "");
      } catch (error) {
        console.error(error);
      }
    });
  }

  els.twinTrailToggle.addEventListener("change", () => twin?.setTrailVisible(els.twinTrailToggle.checked));
  els.twinFreezeToggle.addEventListener("change", () => twin?.setFrozen(els.twinFreezeToggle.checked));
  els.twinIsoBtn.addEventListener("click", () => twin?.setView("iso"));
  els.twinFrontBtn.addEventListener("click", () => twin?.setView("front"));
  els.twinSideBtn.addEventListener("click", () => twin?.setView("side"));
  els.twinTopBtn.addEventListener("click", () => twin?.setView("top"));
  els.twinResetBtn.addEventListener("click", () => twin?.setView("reset"));

  window.addEventListener("resize", () => {
    Object.values(charts).forEach((chart) => chart.resize());
    twin?.resize();
  });
}

async function bootstrap() {
  initCharts();
  initTwin();
  bindEvents();
  try {
    await loadCatalog();
    await refreshState(true);
  } catch (error) {
    alert(`Initial load failed: ${error.message}`);
  }
  connectStateWebSocket();
  connectLiveWebSocket();
}

window.addEventListener("DOMContentLoaded", bootstrap);
