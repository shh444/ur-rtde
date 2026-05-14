// Mock RTDE recording data for the shipyard welding dashboard.
// 40 columns, ~600 samples representing a ~10-minute weld recording.
// Values are synthetic but shaped to look like real welding telemetry:
//  - arc sensing oscillations (~10Hz visible)
//  - seam tracking offsets that drift then correct
//  - a "stitch" of welding-on/off in the middle
//  - a fault event around t=420s

(function () {
  const N = 600;          // samples
  const DT = 1.0;         // seconds per sample (downsampled view)
  const T0 = 0;

  const cols = [
    'weldCurrent','weldVoltage','xOffset','zOffset',
    'BotRight_Plus','TopLeft_Minus','StandardCurrent','allIntegral',
    'xUp','xUi','zUp','zUi',
    'x','y','z',
    'weldingOnOff','touchOnOff',
    'ratioT_19','tri_count','tri_2','reg_22','peak_value',
    'Arc_percent','ARC_T_Plus','reg_26','reg_27','reg_28',
    'BotRight_Plus_VA','TopLeft_Minus_VA',
    // robot pose / joint extras
    'tcp_speed','target_q0','target_q1','target_q2','target_q3','target_q4','target_q5',
    'robot_mode','safety_mode','runtime_state','digital_in_bits',
  ];

  // Categorize so charts can group sensibly
  const categories = {
    weldCurrent: 'arc', weldVoltage: 'arc', StandardCurrent: 'arc',
    Arc_percent: 'arc', ARC_T_Plus: 'arc', peak_value: 'arc',
    xOffset: 'seam', zOffset: 'seam', xUp: 'seam', xUi: 'seam',
    zUp: 'seam', zUi: 'seam', BotRight_Plus: 'seam', TopLeft_Minus: 'seam',
    BotRight_Plus_VA: 'seam', TopLeft_Minus_VA: 'seam',
    allIntegral: 'seam', ratioT_19: 'seam',
    x: 'pose', y: 'pose', z: 'pose',
    tcp_speed: 'pose',
    target_q0: 'pose', target_q1: 'pose', target_q2: 'pose',
    target_q3: 'pose', target_q4: 'pose', target_q5: 'pose',
    weldingOnOff: 'status', touchOnOff: 'status',
    robot_mode: 'status', safety_mode: 'status',
    runtime_state: 'status', digital_in_bits: 'status',
    tri_count: 'meta', tri_2: 'meta', reg_22: 'meta',
    reg_26: 'meta', reg_27: 'meta', reg_28: 'meta',
  };

  // Default friendly Korean names (used by GP mapping example)
  const koLabels = {
    weldCurrent: '용접전류', weldVoltage: '용접전압',
    xOffset: 'X 오프셋', zOffset: 'Z 오프셋',
    StandardCurrent: '기준전류',
    Arc_percent: '아크율', ARC_T_Plus: '아크 T+',
    peak_value: 'Peak 값',
    x: 'TCP X', y: 'TCP Y', z: 'TCP Z',
    tcp_speed: 'TCP 속도',
    weldingOnOff: '용접 ON/OFF', touchOnOff: '터치 센싱',
    allIntegral: '적분합',
    BotRight_Plus: 'BR+', TopLeft_Minus: 'TL−',
    BotRight_Plus_VA: 'BR+ VA', TopLeft_Minus_VA: 'TL− VA',
    xUp: 'X Up', xUi: 'X Ui', zUp: 'Z Up', zUi: 'Z Ui',
    ratioT_19: 'Ratio T19', tri_count: 'Tri 카운트',
    tri_2: 'Tri 2', reg_22: 'Reg 22',
    reg_26: 'Reg 26', reg_27: 'Reg 27', reg_28: 'Reg 28',
    target_q0: 'Joint 0', target_q1: 'Joint 1',
    target_q2: 'Joint 2', target_q3: 'Joint 3',
    target_q4: 'Joint 4', target_q5: 'Joint 5',
    robot_mode: 'Robot Mode', safety_mode: 'Safety Mode',
    runtime_state: 'Runtime', digital_in_bits: 'DI Bits',
  };

  const units = {
    weldCurrent: 'A', weldVoltage: 'V', StandardCurrent: 'A',
    Arc_percent: '%',
    xOffset: 'mm', zOffset: 'mm',
    x: 'mm', y: 'mm', z: 'mm',
    tcp_speed: 'mm/s',
    target_q0: '°', target_q1: '°', target_q2: '°',
    target_q3: '°', target_q4: '°', target_q5: '°',
  };

  // Simple seeded PRNG so the dataset is reproducible across reloads.
  let seed = 1337;
  function rand() {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  }
  function noise(amp = 1) { return (rand() - 0.5) * 2 * amp; }

  // Time vector
  const t = [];
  for (let i = 0; i < N; i++) t.push(T0 + i * DT);

  // Welding ON window: 60s to 540s, with a brief drop around 300-315
  const weldingOn = t.map(s => (s > 60 && s < 540 && !(s > 300 && s < 315)) ? 1 : 0);

  // Touch sensing pulses every ~120s
  const touchOn = t.map(s => (s % 120 < 4) ? 1 : 0);

  // Generators per column
  const samples = {};
  cols.forEach(c => samples[c] = new Array(N));

  for (let i = 0; i < N; i++) {
    const s = t[i];
    const on = weldingOn[i];
    const fault = (s > 420 && s < 460) ? 1 : 0;  // arc instability event

    // arc telemetry
    const oscFast = Math.sin(s * 6.28 * 1.8) * 0.6;
    const oscSlow = Math.sin(s * 0.04) * 4;
    samples.weldCurrent[i] = on
      ? 220 + oscSlow + oscFast * 8 + noise(6) - fault * 22
      : noise(2);
    samples.weldVoltage[i] = on
      ? 24 + Math.sin(s * 6.28 * 1.6) * 0.9 + noise(0.3) + fault * 1.5
      : noise(0.15);
    samples.StandardCurrent[i] = on ? 220 : 0;
    samples.Arc_percent[i] = on ? 92 + noise(3) - fault * 18 : 0;
    samples.ARC_T_Plus[i] = on ? 1 + Math.sin(s * 0.5) * 0.2 + noise(0.05) : 0;
    samples.peak_value[i] = on ? 245 + Math.sin(s * 6.28 * 1.6) * 14 + noise(4) : 0;

    // seam tracking — slow drift in X, fast oscillation in Z (arc sensing weave)
    const driftX = Math.sin(s * 0.012) * 1.4 + (s > 250 ? -0.6 : 0);
    const oscZ = Math.sin(s * 6.28 * 2.2) * 0.5;
    samples.xOffset[i] = on ? driftX + noise(0.12) : 0;
    samples.zOffset[i] = on ? oscZ + noise(0.18) + (fault ? noise(0.5) : 0) : 0;
    samples.xUp[i]  = on ? 1.6 + Math.sin(s * 6.28 * 2.2 + 0.3) * 0.7 + noise(0.05) : 0;
    samples.xUi[i]  = on ? 1.4 + Math.sin(s * 6.28 * 2.2 - 0.4) * 0.65 + noise(0.05) : 0;
    samples.zUp[i]  = on ? 1.2 + Math.sin(s * 6.28 * 2.2 + 1.5) * 0.55 + noise(0.04) : 0;
    samples.zUi[i]  = on ? 1.1 + Math.sin(s * 6.28 * 2.2 + 1.2) * 0.5 + noise(0.04) : 0;
    samples.BotRight_Plus[i] = on ? 0.8 + Math.sin(s * 6.28 * 2.2) * 0.3 + noise(0.03) : 0;
    samples.TopLeft_Minus[i] = on ? 0.78 + Math.sin(s * 6.28 * 2.2 + 3.14) * 0.3 + noise(0.03) : 0;
    samples.BotRight_Plus_VA[i] = samples.BotRight_Plus[i] * 24;
    samples.TopLeft_Minus_VA[i] = samples.TopLeft_Minus[i] * 24;
    samples.allIntegral[i] = on ? (samples.allIntegral[i-1] || 0) + samples.weldCurrent[i] * 0.001 : 0;
    samples.ratioT_19[i] = on ? 0.95 + noise(0.04) - fault * 0.15 : 0;

    // TCP pose — robot tracing seam along Y, offset corrections in X/Z
    samples.x[i] = 412 + driftX * 2 + noise(0.05);
    samples.y[i] = 100 + s * 1.1;  // moving along seam
    samples.z[i] = 280 + oscZ * 1.5 + noise(0.04);
    samples.tcp_speed[i] = on ? 6.0 + noise(0.15) - fault * 1.2 : 0;

    // joints — slow trajectories
    samples.target_q0[i] = -42 + Math.sin(s * 0.02) * 3 + noise(0.05);
    samples.target_q1[i] = -88 + Math.sin(s * 0.018) * 4;
    samples.target_q2[i] = 102 + Math.sin(s * 0.018 + 0.8) * 5;
    samples.target_q3[i] = -110 + Math.sin(s * 0.014) * 6;
    samples.target_q4[i] = 89 + Math.sin(s * 0.015) * 2;
    samples.target_q5[i] = 12 + noise(0.1);

    // status
    samples.weldingOnOff[i] = on;
    samples.touchOnOff[i] = touchOn[i];
    samples.robot_mode[i] = 7;       // RUNNING
    samples.safety_mode[i] = fault ? 3 : 1;
    samples.runtime_state[i] = on ? 2 : 1;
    samples.digital_in_bits[i] = on ? 0b00010110 : 0b00000010;

    // misc metas
    samples.tri_count[i] = Math.floor(s / 2);
    samples.tri_2[i] = (i % 4);
    samples.reg_22[i] = Math.floor(samples.weldCurrent[i]);
    samples.reg_26[i] = Math.round(samples.weldVoltage[i] * 10);
    samples.reg_27[i] = Math.round(samples.Arc_percent[i]);
    samples.reg_28[i] = Math.round(samples.peak_value[i]);
  }

  // Alarms detected post-hoc
  const alarms = [
    { t: 142, severity: 'info',  code: 'TS-001', msg: '터치 센싱 완료 — 시작점 보정 +0.6mm' },
    { t: 268, severity: 'warn',  code: 'AS-014', msg: 'X 오프셋 추세 우측 드리프트 감지' },
    { t: 305, severity: 'info',  code: 'WD-002', msg: '용접 일시정지 (Wire feed pause)' },
    { t: 420, severity: 'error', code: 'AR-101', msg: '아크율 임계값 이탈 (72% < 80%)' },
    { t: 435, severity: 'error', code: 'CR-204', msg: '전류 강하 -10% — 가스/와이어 점검 권장' },
    { t: 458, severity: 'warn',  code: 'AR-102', msg: '아크 안정도 회복 중' },
  ];

  // Default GP register → column mapping (for the YAML editor demo).
  // URScript은 출력 double 레지스터 0~32에 용접 텔레메트리를 적재함.
  // 실 슬롯 배치는 현장에 따라 다르므로 gp_mapping.yaml에서 조정.
  const gpMapping = {
    'output_double_register_0':  { col: 'weldCurrent',      scale: 1.0 },
    'output_double_register_1':  { col: 'weldVoltage',      scale: 1.0 },
    'output_double_register_2':  { col: 'StandardCurrent',  scale: 1.0 },
    'output_double_register_3':  { col: 'Arc_percent',      scale: 1.0 },
    'output_double_register_4':  { col: 'ARC_T_Plus',       scale: 1.0 },
    'output_double_register_5':  { col: 'peak_value',       scale: 1.0 },
    'output_double_register_6':  { col: 'allIntegral',      scale: 1.0 },
    'output_double_register_7':  { col: 'ratioT_19',        scale: 1.0 },
    'output_double_register_8':  { col: 'xOffset',          scale: 1.0 },
    'output_double_register_9':  { col: 'zOffset',          scale: 1.0 },
    'output_double_register_10': { col: 'xUp',              scale: 1.0 },
    'output_double_register_11': { col: 'xUi',              scale: 1.0 },
    'output_double_register_12': { col: 'zUp',              scale: 1.0 },
    'output_double_register_13': { col: 'zUi',              scale: 1.0 },
    'output_double_register_14': { col: 'BotRight_Plus',    scale: 1.0 },
    'output_double_register_15': { col: 'TopLeft_Minus',    scale: 1.0 },
    'output_double_register_16': { col: 'BotRight_Plus_VA', scale: 1.0 },
    'output_double_register_17': { col: 'TopLeft_Minus_VA', scale: 1.0 },
    'output_double_register_18': { col: 'weldingOnOff',     scale: 1.0 },
    'output_double_register_19': { col: 'touchOnOff',       scale: 1.0 },
    // 20~32 은 현장 미할당. gp_mapping.yaml에서 추가하세요.
  };

  // Some "modbus TCP" live values - separate from RTDE, would be live in real system
  const modbusLive = {
    gas_flow_lpm:        { value: 18.4, unit: 'L/min', range: [15, 22], status: 'ok' },
    wire_feed_mpm:       { value: 9.2,  unit: 'm/min', range: [7, 12],  status: 'ok' },
    cooling_water_temp:  { value: 26.1, unit: '°C',    range: [15, 35], status: 'ok' },
    cooling_flow_lpm:    { value: 4.6,  unit: 'L/min', range: [3, 6],   status: 'ok' },
    shielding_pressure:  { value: 0.42, unit: 'MPa',   range: [0.3, 0.5], status: 'ok' },
    torch_temp:          { value: 38.7, unit: '°C',    range: [20, 60], status: 'ok' },
    seam_camera_lux:     { value: 12300,unit: 'lx',    range: [0, 99999], status: 'ok' },
  };

  // Compute per-column ranges for chart auto-scaling
  const ranges = {};
  cols.forEach(c => {
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < N; i++) {
      const v = samples[c][i];
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    if (mn === mx) { mn -= 1; mx += 1; }
    ranges[c] = [mn, mx];
  });

  window.RTDE = {
    N, DT, t, cols, samples, ranges,
    categories, koLabels, units,
    alarms, gpMapping, modbusLive,
  };
})();
