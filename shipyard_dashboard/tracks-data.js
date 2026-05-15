// 3-track analysis data:
//   - RTDE (already in window.RTDE) — 1Hz×600 samples
//   - Modbus polling — 4Hz, sparser channels
//   - Robot logs — irregular, ~120 events

(function () {
  const D = window.RTDE;
  if (!D) { console.warn('tracks-data: RTDE missing'); return; }

  const T_MAX = D.t[D.t.length - 1];      // 599
  const N_RTDE = D.N;

  // ─── MODBUS polling stream (4Hz) ───────────────────────────────────
  const MB_HZ = 4;
  const MB_DT = 1 / MB_HZ;
  const N_MB = Math.floor(T_MAX * MB_HZ);

  const mb_t = new Array(N_MB);
  for (let i = 0; i < N_MB; i++) mb_t[i] = i * MB_DT;

  let seed = 4711;
  const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  const noise = (a = 1) => (rand() - 0.5) * 2 * a;

  // Find welding state at a given time from RTDE (welding window 60-540 with brief drop 300-315)
  const weldingAt = (s) => (s > 60 && s < 540 && !(s > 300 && s < 315)) ? 1 : 0;
  const faultAt = (s) => (s > 420 && s < 460) ? 1 : 0;

  const mbCols = [
    'mb_set_current', 'mb_set_voltage',
    'mb_fb_current', 'mb_fb_voltage',
    'mb_wire_feed', 'mb_gas_flow',
    'mb_cooling_temp', 'mb_torch_temp',
    'mb_welding_on', 'mb_touch_on',
    'mb_robot_ready', 'mb_program_run',
    'mb_error_code', 'mb_cell_idx', 'mb_path_idx',
  ];

  const mbKoLabels = {
    mb_set_current: '지령 전류', mb_set_voltage: '지령 전압',
    mb_fb_current: '피드백 전류', mb_fb_voltage: '피드백 전압',
    mb_wire_feed: '와이어 송급', mb_gas_flow: '가스 유량',
    mb_cooling_temp: '냉각수 온도', mb_torch_temp: '토치 온도',
    mb_welding_on: '용접 ON', mb_touch_on: '터치 ON',
    mb_robot_ready: '로봇 준비', mb_program_run: '프로그램 동작',
    mb_error_code: '에러 코드',
    mb_cell_idx: '현재 셀', mb_path_idx: '현재 패스',
  };

  const mbUnits = {
    mb_set_current: 'A', mb_set_voltage: 'V',
    mb_fb_current: 'A', mb_fb_voltage: 'V',
    mb_wire_feed: 'm/min', mb_gas_flow: 'L/min',
    mb_cooling_temp: '°C', mb_torch_temp: '°C',
  };

  // Categorize so the sidebar can group
  const mbCategories = {
    mb_set_current: 'cmd', mb_set_voltage: 'cmd',
    mb_fb_current: 'fb',   mb_fb_voltage: 'fb',
    mb_wire_feed: 'fb',    mb_gas_flow: 'aux',
    mb_cooling_temp: 'aux',mb_torch_temp: 'aux',
    mb_welding_on: 'status', mb_touch_on: 'status',
    mb_robot_ready: 'status', mb_program_run: 'status',
    mb_error_code: 'status',
    mb_cell_idx: 'status', mb_path_idx: 'status',
  };

  const mbSamples = {};
  mbCols.forEach(c => mbSamples[c] = new Array(N_MB));

  for (let i = 0; i < N_MB; i++) {
    const s = mb_t[i];
    const on = weldingAt(s);
    const fault = faultAt(s);

    // Setpoints are "step-like" — change a few times during the recording
    mbSamples.mb_set_current[i] = on ? 220 : 0;
    mbSamples.mb_set_voltage[i] = on ? 24.0 : 0;

    // Feedback values from welding power source (quantized via 4Hz)
    mbSamples.mb_fb_current[i] = on
      ? 220 + Math.sin(s * 0.4) * 6 + noise(3) - fault * 22
      : noise(1);
    mbSamples.mb_fb_voltage[i] = on
      ? 24 + Math.sin(s * 0.5) * 0.5 + noise(0.2) + fault * 1.3
      : noise(0.1);
    mbSamples.mb_wire_feed[i] = on
      ? 9.2 + Math.sin(s * 0.3) * 0.4 + noise(0.1) - fault * 0.8
      : 0;
    mbSamples.mb_gas_flow[i] = on
      ? 18.4 + Math.sin(s * 0.1) * 0.8 + noise(0.3)
      : (s > 50 && s < 552) ? 17.2 + noise(0.2) : 0;
    mbSamples.mb_cooling_temp[i] = 24 + s * 0.005 + Math.sin(s * 0.02) * 1.4 + noise(0.2);
    mbSamples.mb_torch_temp[i] = on ? 38 + s * 0.01 + Math.sin(s * 0.04) * 3 : 30 - (s > 540 ? 0 : 0);

    // Status (discrete)
    mbSamples.mb_welding_on[i] = on;
    mbSamples.mb_touch_on[i] = (s > 50 && s < 60) || (s > 250 && s < 256) ? 1 : 0;
    mbSamples.mb_robot_ready[i] = (s > 5) ? 1 : 0;
    mbSamples.mb_program_run[i] = (s > 5) ? 1 : 0;
    mbSamples.mb_error_code[i] = (s > 420 && s < 460) ? 14
      : (s > 450 && s < 458) ? 27 : 0;
    mbSamples.mb_cell_idx[i] = 2;       // VL2 throughout
    mbSamples.mb_path_idx[i] = (s < 220) ? 1 : (s < 420) ? 2 : 3;
  }

  // Per-column ranges
  const mbRanges = {};
  mbCols.forEach(c => {
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < N_MB; i++) {
      const v = mbSamples[c][i];
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    if (mn === mx) { mn -= 1; mx += 1; }
    mbRanges[c] = [mn, mx];
  });

  // ─── Robot logs (irregular) ─────────────────────────────────────────
  // levels: debug / info / warn / error / sys
  const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'sys'];
  const LOG_SOURCES = ['core', 'rtde', 'modbus', 'program', 'safety', 'gripper', 'sensor'];

  // Curated log script that tells a coherent story
  const scripted = [
    { t:   0.4, level:'sys',   source:'core',    msg:'Robot controller boot (UR10/CB3.15.7)' },
    { t:   2.1, level:'info',  source:'rtde',    msg:'RTDE connected on port 30004 @ 125Hz' },
    { t:   2.3, level:'info',  source:'modbus',  msg:'Modbus TCP connected (192.168.1.40)' },
    { t:   3.0, level:'info',  source:'program', msg:'Loaded program: BH-12_VL2_fillet_2F.urp' },
    { t:   5.2, level:'info',  source:'program', msg:'Program started, waiting for touch sense' },
    { t:  55.1, level:'info',  source:'sensor',  msg:'Touch sense started @ cell VL2' },
    { t:  58.4, level:'info',  source:'sensor',  msg:'Touch sense complete · seam offset = (+0.6, +0.1, +0.0) mm' },
    { t:  60.0, level:'info',  source:'program', msg:'Arc ON · path 1/3 · wire feed 9.2 m/min' },
    { t:  64.5, level:'debug', source:'rtde',    msg:'GP register 24 mapped → weldCurrent' },
    { t: 122.3, level:'info',  source:'program', msg:'Mid-stitch position correction +0.4mm' },
    { t: 142.8, level:'info',  source:'sensor',  msg:'Touch sensing complete — 시작점 보정 +0.6mm' },
    { t: 211.6, level:'debug', source:'rtde',    msg:'Joint torque limits within nominal' },
    { t: 220.5, level:'info',  source:'program', msg:'Path 1/3 complete, advance to path 2/3' },
    { t: 245.2, level:'debug', source:'modbus',  msg:'Heartbeat OK · uptime 240s' },
    { t: 268.1, level:'warn',  source:'sensor',  msg:'X offset trending right (+1.2mm over 30s)' },
    { t: 295.9, level:'info',  source:'program', msg:'Auto-correction applied (-0.8mm)' },
    { t: 300.3, level:'warn',  source:'program', msg:'Welding paused — wire feed pause requested' },
    { t: 305.2, level:'info',  source:'program', msg:'Welding pause · wire feed pause' },
    { t: 314.6, level:'info',  source:'program', msg:'Welding resumed' },
    { t: 360.1, level:'debug', source:'rtde',    msg:'TCP speed steady @ 6.0 mm/s' },
    { t: 405.5, level:'debug', source:'modbus',  msg:'Heartbeat OK · uptime 400s' },
    { t: 420.4, level:'error', source:'sensor',  msg:'Arc stability fell below threshold (72% < 80%)' },
    { t: 421.8, level:'warn',  source:'program', msg:'Wire stick suspected · slowing wire feed' },
    { t: 435.2, level:'error', source:'program', msg:'Current drop -10% — check gas / wire path' },
    { t: 442.1, level:'info',  source:'safety',  msg:'Operator notified · awaiting acknowledgment' },
    { t: 451.0, level:'warn',  source:'sensor',  msg:'Z oscillation amplitude exceeded nominal' },
    { t: 458.6, level:'warn',  source:'sensor',  msg:'Arc stability recovering' },
    { t: 461.4, level:'info',  source:'program', msg:'Auto-recovery succeeded · resuming nominal' },
    { t: 480.0, level:'info',  source:'program', msg:'Path 2/3 complete, advance to path 3/3' },
    { t: 540.1, level:'info',  source:'program', msg:'Arc OFF · program complete' },
    { t: 541.0, level:'info',  source:'program', msg:'Post-flow gas 2.0s' },
    { t: 543.5, level:'info',  source:'program', msg:'Welding cycle complete · 9 min 38 s' },
    { t: 545.0, level:'sys',   source:'core',    msg:'Save recording prompt issued' },
    { t: 599.0, level:'sys',   source:'core',    msg:'Recording finalized · 74,750 samples · 4.2 MB' },
  ];

  // Pad with noise-level logs (debug heartbeats etc.) so the lane looks alive
  const padding = [];
  for (let s = 10; s < 600; s += 20 + rand() * 30) {
    if (rand() < 0.6) {
      padding.push({
        t: s + rand() * 5,
        level: rand() < 0.3 ? 'info' : 'debug',
        source: LOG_SOURCES[Math.floor(rand() * LOG_SOURCES.length)],
        msg: [
          'Joint position sampled',
          'RTDE buffer flushed',
          'Modbus poll cycle 250ms OK',
          'GP register snapshot saved',
          'Idle frame skip',
          'Safety bits nominal',
        ][Math.floor(rand() * 6)],
      });
    }
  }
  const logs = [...scripted, ...padding].sort((a, b) => a.t - b.t).map((e, i) => ({ id: i, ...e }));

  // Provide a "segments" view for warn/error spans — group consecutive
  // warn/error logs within 12s into a single segment for the lane.
  const segments = [];
  for (let i = 0; i < logs.length; i++) {
    const e = logs[i];
    if (e.level !== 'warn' && e.level !== 'error') continue;
    const last = segments[segments.length - 1];
    if (last && (e.t - last.end) < 14 && (last.level === e.level || e.level === 'error')) {
      last.end = e.t;
      last.level = e.level === 'error' ? 'error' : last.level;
      last.count++;
    } else {
      segments.push({ start: e.t, end: e.t + 1.5, level: e.level, count: 1 });
    }
  }

  window.TRACKS = {
    rtde: {
      t: D.t, cols: D.cols, samples: D.samples, ranges: D.ranges,
      koLabels: D.koLabels, units: D.units, categories: D.categories,
      hz: 125,  // displayed for the user (actual array is downsampled)
    },
    modbus: {
      t: mb_t, cols: mbCols, samples: mbSamples, ranges: mbRanges,
      koLabels: mbKoLabels, units: mbUnits, categories: mbCategories,
      hz: 4,
    },
    logs,
    segments,
    duration: T_MAX,
    meta: {
      name: 'rtde_20260515_094219_Test1',
      cell: 'VL2',
      block: 'BH-12',
      path: '2/3',
      operator: '김재성',
      durationSec: T_MAX,
      samples: 74750,
      size: '4.2 MB',
      alarms: logs.filter(l => l.level === 'error').length
            + logs.filter(l => l.level === 'warn').length,
    },
  };
})();
