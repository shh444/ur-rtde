// Modbus register table for the welding robot. Addresses 128~255.
// Grouped by direction (로봇 → 팬던트, 팬던트 → 로봇, etc.).
// Live values are simulated; in production they would come from the
// backend's modbus_client.py polling loop.

(function () {
  // ─── Register definitions ────────────────────────────────────────────
  // group: 'rp' (로봇 → 팬던트), 'pr' (팬던트 → 로봇),
  //        'rw' (로봇 → 용접기), 'wr' (용접기 → 로봇),
  //        'pc' (팬던트 → 로봇 · 용접 조건)
  // status: 'active' | 'reserved' | 'unused'  (현재 사용 안함)
  // kind:   'counter' | 'bool' | 'enum' | 'value' | 'code' | 'bitfield' | 'string'

  const R = [
    // ── 128~160 (로봇 → 팬던트)
    { a:128, name:'하트비트',                en:'heartbeat',           grp:'rp', unit:'',     kind:'counter', range:[0,500], status:'active', desc:'1초 간격 1씩 증가' },
    { a:129, name:'프로그램 동작 여부',       en:'program_run',         grp:'rp', unit:'',     kind:'bool',    range:[0,1],   status:'active', desc:'로봇 프로그램 동작 상태',
      valueMap:{0:'정지', 1:'동작'} },
    { a:130, name:'용접 여부',               en:'welding',             grp:'rp', unit:'',     kind:'bool',    range:[0,1],   status:'active', desc:'현재 용접 중 여부',
      valueMap:{0:'무부하', 1:'용접 중'} },
    { a:131, name:'현재 전류',               en:'cur_current',         grp:'rp', unit:'A',    kind:'value',   range:[0,600], status:'active', desc:'실제 용접 전류' },
    { a:132, name:'현재 전압',               en:'cur_voltage',         grp:'rp', unit:'V',    kind:'value',   range:[0,80],  scale:10, status:'active', desc:'실제 용접 전압 (raw=값×10)' },
    { a:133, name:'지령 전류',               en:'set_current',         grp:'rp', unit:'A',    kind:'value',   range:[0,600], status:'active', desc:'설정 용접 전류' },
    { a:134, name:'지령 전압',               en:'set_voltage',         grp:'rp', unit:'V',    kind:'value',   range:[0,80],  scale:10, status:'active', desc:'설정 용접 전압 (raw=값×10)' },
    { a:135, name:'현재 PATH 셀',            en:'cur_cell',            grp:'rp', unit:'',     kind:'enum',    enums:['VL1','VL2','VR1','VR2','HOR'], valueMap:{1:'VL1',2:'VL2',3:'VR1',4:'VR2',5:'HOR'}, status:'active', desc:'현재 용접 셀' },
    { a:136, name:'현재 PATH',               en:'cur_path',            grp:'rp', unit:'',     kind:'value',   range:[1,5],   status:'active', desc:'현재 멀티 패스 번호' },
    { a:137, name:'용접 종료',               en:'weld_end',            grp:'rp', unit:'',     kind:'bool',    range:[0,1],   status:'active', desc:'용접 종료 상태',
      valueMap:{0:'진행 중', 1:'종료'} },
    { a:138, name:'전체 중 현재 PATH',       en:'cur_path_idx',        grp:'rp', unit:'',     kind:'value',   range:[0,7],   status:'active', desc:'전체 패스 중 현재 인덱스' },
    { a:139, name:'전체 PATH',               en:'total_path',          grp:'rp', unit:'',     kind:'value',   range:[1,7],   status:'active', desc:'총 패스 개수' },
    { a:140, name:'2F 개수',                 en:'count_2f',            grp:'rp', unit:'',     kind:'value',   range:[1,3],   status:'active', desc:'2F 멀티패스 개수' },
    { a:141, name:'로봇 준비',               en:'robot_ready',         grp:'rp', unit:'',     kind:'bool',    range:[0,1],   status:'active', desc:'로봇 준비 상태',
      valueMap:{0:'대기', 1:'준비 중'} },
    { a:142, name:'로봇 에러',               en:'robot_error',         grp:'rp', unit:'code', kind:'code',    range:[0,300], status:'active', desc:'프로젝트 로봇 에러 코드. 0=정상.',
      errorMap:{
        111:{ name:'E111 계산식 에러',           cause:'모션 플래닝 중 에러 발생',
              action:'1) TCP 확인  2) 터치 정상 수행 확인  3) DB 주파수/각장 등 입력 정보 확인' },
        112:{ name:'E112 속도 너무 높음',        cause:'계산된 위빙 속도 값이 너무 높음',
              action:'1) TCP 확인  2) 터치 정상 수행 확인  3) DB 속도 확인' },
        113:{ name:'E113 현재 로봇 속도 너무 높음', cause:'현재 로봇 속도가 비정상적으로 높음',
              action:'1) 셀 정보 확인  2) 용접 정보 확인  3) 제조사 문의' },
        120:{ name:'E120 터치 정보 없음',        cause:'이전 위치 기록 사용 ON, 저장된 터치 정보 없음',
              action:'1) 이전 터치 불러오기 OFF 후 실행' },
        121:{ name:'E121 터치 거리 너무 김',     cause:'터치 중 이동 거리가 120mm 초과',
              action:'1) 셀 정보 확인  2) 로봇 설치 위치/각도 확인' },
        131:{ name:'E131 WCR 신호 부재',         cause:'용접 신호 송출 후 WCR 신호 미수신',
              action:'1) 용접기 확인  2) 접지 확인' },
        141:{ name:'E141 현재 PASS 값 확인 필요', cause:'UI로부터 받은 PASS 값이 음수이거나 30 이상',
              action:'1) UI에서 PASS 값 확인' },
        142:{ name:'E142 로봇 패스 계산 오류',    cause:'로봇 패스 계산에 필요한 정보 없음',
              action:'1) 제조사 확인' },
        143:{ name:'E143 3F 용접 길이 확인',      cause:'3F 용접 길이에 5 이하 값 들어옴',
              action:'1) 셀 정보에서 3F 값 정상 입력' },
        151:{ name:'E151 팬던트 하트비트 실패',   cause:'팬던트 하트비트 5초간 실패',
              action:'1) 팬던트 동작 확인  2) 팬던트/로봇 컨트롤러 랜선 확인' },
        161:{ name:'solve_linear_system 계산식 에러', cause:'터치 중 계산식 에러',
              action:'1) TCP 확인  2) 터치 정상 수행 확인' },
        162:{ name:'intersection_of_two_planes 계산식 에러', cause:'터치 중 계산식 에러',
              action:'1) TCP 확인  2) 터치 정상 수행 확인' },
        163:{ name:'get_intersection 계산식 에러', cause:'터치 중 계산식 에러',
              action:'1) TCP 확인  2) 터치 정상 수행 확인' },
        261:{ name:'E261 보호 정지 발생',        cause:'보호정지 발생',
              action:'1) 로봇 재시작' },
        262:{ name:'E262 비상 정지 발생',        cause:'비상 정지 발생',
              action:'1) 비상 정지 해제 후 로봇 재시작' },
        265:{ name:'E265 로봇 에러 발생',        cause:'로봇 에러 발생', action:'-' },
      } },
    { a:143, name:'현재 시간',               en:'cur_time',            grp:'rp', unit:'',     kind:'value',   range:[0,9999],status:'unused', desc:'현재 시간' },
    { a:144, name:'전체 시간',               en:'total_time',          grp:'rp', unit:'',     kind:'value',   range:[0,9999],status:'unused', desc:'전체 시간' },
    { a:145, name:'셀 번호',                 en:'cell_num',            grp:'rp', unit:'',     kind:'value',   range:[0,255], status:'unused', desc:'' },
    { a:146, name:'셀 요청',                 en:'cell_req',            grp:'rp', unit:'',     kind:'value',   range:[0,255], status:'unused', desc:'' },
    { a:147, name:'Reserved',                en:'rsv_147',             grp:'rp', unit:'',     kind:'value',   range:[0,0],   status:'reserved', desc:'작업 시트 공란' },
    { a:148, name:'Reserved',                en:'rsv_148',             grp:'rp', unit:'',     kind:'value',   range:[0,0],   status:'reserved', desc:'작업 시트 공란' },
    { a:149, name:'(임시) 용접기 제어 기록',  en:'tmp_weld_ctrl_log',   grp:'rp', unit:'',     kind:'value',   range:[0,255], status:'active', desc:'용접기 제어 기록 (임시)' },
    { a:150, name:'Reserved',                en:'rsv_150',             grp:'rp', unit:'',     kind:'value',   range:[0,0],   status:'reserved', desc:'작업 시트 공란' },
    { a:151, name:'셀 선택 FLAG',            en:'cell_flag',           grp:'rp', unit:'',     kind:'enum',    enums:['VL1','VL2','VR1','VR2','HOR'], valueMap:{1:'VL1',2:'VL2',3:'VR1',4:'VR2',5:'HOR'}, status:'active', desc:'셀 선택 플래그' },
    { a:152, name:'기타 정보',               en:'misc_info',           grp:'rp', unit:'',     kind:'value',   range:[0,255], status:'active', desc:'레이어 정보. 2F/3F 컨텍스트에 따라 의미 다름.',
      contextMap:{ '2F':{1:'1 패스',2:'2 패스',3:'3 패스'}, '3F':{1:'기본 고정',2:'사용 안함',3:'사용 안함'} } },
    { a:153, name:'용접 조건 요청',          en:'req_weld_cond',       grp:'rp', unit:'',     kind:'bool',    range:[0,1],   status:'active', desc:'팬던트에 용접 조건 요청. 154와 핸드셰이크.',
      valueMap:{0:'대기', 1:'요청'} },
    { a:154, name:'정보 수신 완료',          en:'cond_rx_ack',         grp:'rp', unit:'',     kind:'bool',    range:[0,1],   status:'active', desc:'팬던트가 조건 전송 완료',
      valueMap:{0:'대기', 1:'완료'} },
    { a:155, name:'터치셀',                  en:'touch_cell',          grp:'rp', unit:'',     kind:'enum',    enums:['VL1','VL2','VR1','VR2','HOR'], valueMap:{1:'VL1',2:'VL2',3:'VR1',4:'VR2',5:'HOR'}, status:'active', desc:'현재 터치 대상 셀' },
    { a:156, name:'터치 번호',               en:'touch_num',           grp:'rp', unit:'',     kind:'value',   range:[1,4],   status:'active', desc:'2F/3F 컨텍스트에 따라 의미 다름',
      contextMap:{ '2F':{1:'왼쪽',2:'오른쪽'}, '3F':{1:'아래',2:'위',3:'칼라',4:'칼라 바깥'} } },
    { a:157, name:'터치 완료',               en:'touch_done',          grp:'rp', unit:'',     kind:'bool',    range:[0,1],   status:'active', desc:'터치 수행 완료',
      valueMap:{0:'진행 중', 1:'완료'} },
    { a:158, name:'전압_END',                en:'voltage_end',         grp:'rp', unit:'V',    kind:'value',   range:[0,80],  status:'active', desc:'종료/중간갭 전압' },
    { a:159, name:'전류_END',                en:'current_end',         grp:'rp', unit:'A',    kind:'value',   range:[0,600], status:'active', desc:'종료/중간갭 전류' },
    { a:160, name:'로봇 버전',               en:'robot_ver',           grp:'rp', unit:'',     kind:'string',  range:[0,0],   status:'active', desc:'메이저.마이너.버그' },

    // ── UR 빌트인 status (백엔드가 status block 읽고 welding dict 에 mirror)
    { a:258, name:'UR 로봇 모드',            en:'ur_robot_mode',       grp:'ur', unit:'',     kind:'enum',    range:[0,7],   status:'active', desc:'CB3 / UR SW 3.x 계열 robot_mode',
      valueMap:{
        0:'Disconnected', 1:'Confirm_safety', 2:'Booting',     3:'Power_off',
        4:'Power_on',     5:'Idle',           6:'Backdrive',   7:'Running',
      } },

    // ── 161~199 (팬던트 → 로봇)
    { a:161, name:'팬던트 하트비트',          en:'pendant_hb',          grp:'pr', unit:'',     kind:'counter', range:[0,500], status:'active', desc:'팬던트 통신 생존' },
    { a:162, name:'작업 모드',               en:'work_mode',           grp:'pr', unit:'',     kind:'enum',    enums:['수동','자동'], status:'active', desc:'1=수동, 2=자동' },
    { a:163, name:'로봇 이동',               en:'robot_move',          grp:'pr', unit:'',     kind:'bool',    range:[0,1],   status:'active', desc:'이동 요청 (수동 모드만)',
      valueMap:{0:'정지', 1:'이동 요청'} },
    { a:164, name:'로봇 자세',               en:'robot_pose',          grp:'pr', unit:'',     kind:'enum',    range:[1,4],   status:'active', desc:'로봇 자세/동작',
      valueMap:{1:'포장 자세',2:'토치 교체 자세',3:'예열 운전',4:'운반 자세'} },
    { a:165, name:'동작 모드',               en:'move_mode',           grp:'pr', unit:'',     kind:'enum',    enums:['치수','직접'], status:'active', desc:'1=치수, 2=직접' },
    { a:166, name:'이동 패스',               en:'move_path',           grp:'pr', unit:'',     kind:'value',   range:[1,7],   status:'active', desc:'이동할 패스 번호' },
    { a:167, name:'이동',                    en:'move_trig',           grp:'pr', unit:'',     kind:'bool',    range:[0,1],   status:'active', desc:'로봇 자세 이동 트리거',
      valueMap:{0:'대기', 1:'트리거'} },
    { a:168, name:'아크 온/오프',            en:'arc_onoff',           grp:'pr', unit:'',     kind:'enum',    enums:['아크오프','아크온'], status:'active', desc:'2=아크온, 1=아크오프' },
    { a:169, name:'스틱아웃',                en:'stickout',            grp:'pr', unit:'',     kind:'enum',    enums:['Plus','Minus'], status:'active', desc:'1=Plus, 2=Minus' },
    { a:170, name:'직접 교시 시작',          en:'teach_start',         grp:'pr', unit:'',     kind:'bool',    range:[0,1],   status:'active', desc:'직접 교시 시작',
      valueMap:{0:'대기', 1:'시작'} },
    { a:171, name:'선택 셀 좌',              en:'sel_cell_l',          grp:'pr', unit:'',     kind:'enum',    range:[1,8],   status:'active', desc:'좌측 셀 (A/B/C/c/D/d/E/e)',
      valueMap:{1:'A',2:'B',3:'C',4:'c',5:'D',6:'d',7:'E',8:'e'} },
    { a:172, name:'선택 셀 우',              en:'sel_cell_r',          grp:'pr', unit:'',     kind:'enum',    range:[1,8],   status:'active', desc:'우측 셀 (A/B/C/c/D/d/E/e)',
      valueMap:{1:'A',2:'B',3:'C',4:'c',5:'D',6:'d',7:'E',8:'e'} },
    { a:173, name:'수직좌',                  en:'vert_l',              grp:'pr', unit:'mm',   kind:'value',   range:[0,1000],status:'active', desc:'좌측 수직 치수' },
    { a:174, name:'수직우',                  en:'vert_r',              grp:'pr', unit:'mm',   kind:'value',   range:[0,1000],status:'active', desc:'우측 수직 치수' },
    { a:175, name:'수평 바닥',               en:'horiz_bottom',        grp:'pr', unit:'mm',   kind:'value',   range:[0,1000],status:'active', desc:'바닥 수평 치수' },
    { a:176, name:'스칼럽 상',               en:'scallop_top',         grp:'pr', unit:'',     kind:'value',   range:[0,255], status:'active', desc:'2F/3F 컨텍스트에 따라 의미 다름',
      contextMap:{ '2F':{label:'왼쪽 스칼럽'}, '3F':{label:'위 스칼럽'} } },
    { a:177, name:'스칼럽 하',               en:'scallop_bot',         grp:'pr', unit:'',     kind:'value',   range:[0,255], status:'active', desc:'2F/3F 컨텍스트에 따라 의미 다름',
      contextMap:{ '2F':{label:'오른쪽 스칼럽'}, '3F':{label:'사용 안함'} } },
    { a:178, name:'셀 선택 FLAG',            en:'cell_sel',            grp:'pr', unit:'',     kind:'enum',    range:[0,5],   status:'active', desc:'선택된 셀 (0-indexed)',
      valueMap:{0:'VL1',1:'VL2',2:'VR1',3:'VR2',4:'HOR',5:'Side_left'} },
    { a:179, name:'EXT_FLAG',                en:'ext_flag',            grp:'pr', unit:'',     kind:'bitfield',range:[0,65535], status:'active', desc:'확장 플래그 (16-bit). 정밀터치 · 이음용접 · 스티프너 등',
      bits:[
        {bit:1,  name:'정밀 터치'},
        {bit:2,  name:'용접 후 자세'},
        {bit:3,  name:'용접 위치 (터치 확인)'},
        {bit:4,  name:'이음용접'},
        {bit:5,  name:'돌림용접'},
        {bit:6,  name:'분할 용접'},
        {bit:7,  name:'모따기'},
        {bit:10, name:'항상 온 (10)'},
        {bit:11, name:'좌우 터치'},
        {bit:13, name:'스티프너'},
        {bit:14, name:'바닥터치'},
        {bit:15, name:'항상 온 (15)'},
      ],
      packed:[
        { name:'슬러지 대기 시간', bits:[8,9],
          valueMap:{0:'대기 없음', 1:'모든 패스 용접 후', 2:'2F 멀티 패스 용접 후'} },
      ] },
    { a:180, name:'터치위치 기억',           en:'touch_memo',          grp:'pr', unit:'',     kind:'bool',    range:[0,1],   status:'active', desc:'과거 터치 정보 사용 여부',
      valueMap:{0:'새 터치', 1:'과거 터치 사용'} },
    { a:181, name:'칼라 가로',               en:'collar_w',            grp:'pr', unit:'',     kind:'value',   range:[0,1000],status:'active', desc:'칼라 가로 치수' },
    { a:182, name:'칼라 세로',               en:'collar_h',            grp:'pr', unit:'',     kind:'value',   range:[0,1000],status:'active', desc:'칼라 세로 치수' },
    { a:183, name:'각장_2f',                 en:'legsz_2f',            grp:'pr', unit:'',     kind:'value',   range:[6,11],  status:'active', desc:'2F 각장 (멀티패스 여부)' },
    { a:184, name:'상하 P gain',             en:'p_gain_uz',           grp:'pr', unit:'',     kind:'value',   range:[0,100], scale:10, status:'active', desc:'상하축 P gain (raw=펜던트값×10)' },
    { a:185, name:'상하 I gain',             en:'i_gain_uz',           grp:'pr', unit:'',     kind:'value',   range:[0,100], scale:10, status:'active', desc:'상하축 I gain (raw=펜던트값×10)' },
    { a:186, name:'좌우 P gain',             en:'p_gain_lr',           grp:'pr', unit:'',     kind:'value',   range:[0,100], scale:10, status:'active', desc:'좌우축 P gain (raw=펜던트값×10)' },
    { a:187, name:'좌우 I gain',             en:'i_gain_lr',           grp:'pr', unit:'',     kind:'value',   range:[0,100], scale:10, status:'active', desc:'좌우축 I gain (raw=펜던트값×10)' },
    { a:188, name:'곡블럭 옵션1',            en:'curve_opt1',          grp:'pr', unit:'',     kind:'bitfield',range:[0,65535], status:'active', desc:'곡블럭 옵션1 (PDF: 각장_3f_left)',
      packed:[
        { name:'Longi 좌',   bits:[0,1], valueMap:{0:'X',1:'L',2:'C',3:'R'} },
        { name:'Longi 우',   bits:[2,3], valueMap:{0:'X',1:'L',2:'C',3:'R'} },
        { name:'용접 방향',  bits:[4,4], valueMap:{0:'좌→우',1:'우→좌'} },
        { name:'고정값',     bits:[15,15], expect:1, valueMap:{1:'OK',0:'⚠ 0'} },
      ] },
    { a:189, name:'곡블럭 옵션2',            en:'curve_opt2',          grp:'pr', unit:'',     kind:'bitfield',range:[0,65535], status:'active', desc:'곡블럭 옵션2 (PDF: 각장_3f_right). 구간별 보정값 packed',
      packed:[
        { name:'시작 → 구간1', bits:[0,7],   domain:[0,100] },
        { name:'구간1 → 종료', bits:[8,14],  domain:[0,100] },
        { name:'고정값',       bits:[15,15], expect:1, valueMap:{1:'OK',0:'⚠ 0'} },
      ] },
    { a:190, name:'중간갭_속도1',            en:'gap_speed1',          grp:'pr', unit:'',     kind:'value',   range:[0,100], scale:10, status:'unused', desc:'4.7V 평블록 미사용 (raw=펜던트값×10)' },
    { a:191, name:'Reserved',                en:'rsv_191',             grp:'pr', unit:'',     kind:'value',   range:[0,0],   status:'reserved', desc:'' },
    { a:192, name:'중간갭_진폭1',            en:'gap_amp1',            grp:'pr', unit:'',     kind:'value',   range:[0,100], scale:10, status:'unused', desc:'4.7V 평블록 미사용 (raw=펜던트값×10)' },
    { a:193, name:'Reserved',                en:'rsv_193',             grp:'pr', unit:'',     kind:'value',   range:[0,0],   status:'reserved', desc:'' },
    { a:194, name:'중간갭_전류1',            en:'gap_curr1',           grp:'pr', unit:'A',    kind:'value',   range:[0,600], scale:10, status:'unused', desc:'4.7V 평블록 미사용 (raw=펜던트값×10)' },
    { a:195, name:'Reserved',                en:'rsv_195',             grp:'pr', unit:'',     kind:'value',   range:[0,0],   status:'reserved', desc:'' },
    { a:196, name:'중간갭_전압1',            en:'gap_volt1',           grp:'pr', unit:'V',    kind:'value',   range:[0,80],  scale:10, status:'unused', desc:'4.7V 평블록 미사용 (raw=펜던트값×10)' },
    { a:197, name:'Reserved',                en:'rsv_197',             grp:'pr', unit:'',     kind:'value',   range:[0,0],   status:'reserved', desc:'' },
    { a:198, name:'바닥각도',                en:'bottom_angle',        grp:'pr', unit:'',     kind:'enum',    range:[0,8],   status:'unused', desc:'곡블럭 바닥각도 선택. 4.7V 평블록 미사용.',
      valueMap:{0:'중앙',1:'왼쪽',2:'오른쪽',3:'0~7.5°',4:'7.5~12.5°',5:'12.5~17.5°',6:'17.5~22.5°',7:'22.5~27.5°',8:'27.5~32.5°'} },
    { a:199, name:'Reserved',                en:'rsv_199',             grp:'pr', unit:'',     kind:'value',   range:[0,0],   status:'reserved', desc:'' },

    // ── 201~210 (로봇 → 용접기)
    { a:201, name:'로봇 사용',               en:'robot_use',           grp:'rw', unit:'',     kind:'bool',    range:[0,1],   status:'active', desc:'용접기와 모드버스 사용 여부',
      valueMap:{0:'미사용', 1:'모드버스 사용'} },
    { a:202, name:'용접기 제어',             en:'welder_ctrl',         grp:'rw', unit:'',     kind:'bitfield',range:[0,255], status:'active', desc:'용접기 제어 비트필드',
      bits:[
        {bit:0, name:'토치 ON/OFF'},
        {bit:1, name:'정인칭'},
        {bit:2, name:'역인칭'},
        {bit:3, name:'가스체크'},
        {bit:4, name:'스틱체크'},
        {bit:6, name:'로봇 오류'},
      ] },
    { a:203, name:'와이어 정보',             en:'wire_info',           grp:'rw', unit:'',     kind:'value',   range:[0,255], status:'active', desc:'와이어 정보 (구 명칭: 용접 속도)' },
    { a:204, name:'전류 설정',               en:'set_current_t',       grp:'rw', unit:'A',    kind:'value',   range:[0,600], status:'active', desc:'목표 전류' },
    { a:205, name:'전압 설정',               en:'set_voltage_t',       grp:'rw', unit:'V',    kind:'value',   range:[0,80],  status:'active', desc:'목표 전압' },
    { a:206, name:'전압 시너지 보정',        en:'synergy_v',           grp:'rw', unit:'',     kind:'value',   range:[-50,50],status:'active', desc:'시너지 보정값' },
    { a:207, name:'Reserved',                en:'rsv_207',             grp:'rw', unit:'',     kind:'value',   range:[0,0],   status:'reserved', desc:'' },
    { a:208, name:'Reserved',                en:'rsv_208',             grp:'rw', unit:'',     kind:'value',   range:[0,0],   status:'reserved', desc:'' },
    { a:209, name:'Reserved',                en:'rsv_209',             grp:'rw', unit:'',     kind:'value',   range:[0,0],   status:'reserved', desc:'' },
    { a:210, name:'Reserved',                en:'rsv_210',             grp:'rw', unit:'',     kind:'value',   range:[0,0],   status:'reserved', desc:'' },

    // ── 211~220 (용접기 → 로봇)
    { a:211, name:'WCR 검출 / STICK',        en:'wcr_stick',           grp:'wr', unit:'',     kind:'bitfield',range:[0,511], status:'active', desc:'용접기 상태 피드백 비트필드',
      bits:[
        {bit:4, name:'STICK 인식',  enum:{0:'미검출', 1:'검출'}},
        {bit:5, name:'WCR 검출',    enum:{0:'미검출', 1:'검출'}},
        {bit:8, name:'Heartbeat',   enum:{0:'0', 1:'1'}},
      ] },
    { a:212, name:'용접 전류 피드백',         en:'fb_current',          grp:'wr', unit:'A',    kind:'value',   range:[0,600], status:'active', desc:'실제 전류 피드백' },
    { a:213, name:'용접 전압 피드백',         en:'fb_voltage',          grp:'wr', unit:'V',    kind:'value',   range:[0,80],  status:'active', desc:'실제 전압 피드백' },
    { a:214, name:'송급장치 상태',            en:'feeder_state',        grp:'wr', unit:'m/min',kind:'value',   range:[0,18],  status:'active', desc:'와이어 송급 속도' },
    { a:215, name:'와이어 정보',              en:'fb_wire_info',        grp:'wr', unit:'',     kind:'value',   range:[0,255], status:'active', desc:'와이어 상태' },
    { a:216, name:'용접기 오류',              en:'welder_error',        grp:'wr', unit:'code', kind:'code',    range:[0,255], status:'active', desc:'용접기 오류 코드' },
    { a:217, name:'출력 전류 설정',           en:'out_set_current',     grp:'wr', unit:'A',    kind:'value',   range:[0,600], status:'active', desc:'전류 설정값 피드백' },
    { a:218, name:'출력 전압 설정',           en:'out_set_voltage',     grp:'wr', unit:'V',    kind:'value',   range:[0,80],  status:'active', desc:'전압 설정값 피드백' },
    { a:219, name:'전압 시너지 보정',         en:'fb_synergy',          grp:'wr', unit:'',     kind:'value',   range:[-50,50],status:'active', desc:'시너지 피드백' },
    { a:220, name:'용접 파라미터1',           en:'weld_param1',         grp:'wr', unit:'',     kind:'value',   range:[0,255], status:'active', desc:'파라미터1' },

    // ── 221~255 (팬던트 → 로봇 · 용접 조건)
    { a:221, name:'용접 파라미터2',           en:'weld_param2',         grp:'pc', unit:'',     kind:'value',   range:[0,255], status:'active', desc:'파라미터2' },
    { a:222, name:'용접 파라미터3',           en:'weld_param3',         grp:'pc', unit:'',     kind:'value',   range:[0,255], status:'active', desc:'파라미터3' },
    { a:223, name:'Reserved',                 en:'rsv_223',             grp:'pc', unit:'',     kind:'value',   range:[0,0],   status:'reserved', desc:'' },
    { a:224, name:'Reserved',                 en:'rsv_224',             grp:'pc', unit:'',     kind:'value',   range:[0,0],   status:'reserved', desc:'' },
    { a:225, name:'주파수',                   en:'weave_freq',          grp:'pc', unit:'Hz',   kind:'value',   range:[0,100], status:'active', desc:'위빙 주파수' },
    { a:226, name:'바닥 멈춤 시간',           en:'dwell_bottom',        grp:'pc', unit:'s',    kind:'value',   range:[0,10],  status:'active', desc:'바닥 dwell time' },
    { a:227, name:'벽 멈춤 시간',             en:'dwell_wall',          grp:'pc', unit:'s',    kind:'value',   range:[0,10],  status:'active', desc:'벽 dwell time' },
    { a:228, name:'작업각',                   en:'work_angle',          grp:'pc', unit:'°',    kind:'value',   range:[0,90],  status:'active', desc:'작업 각도' },
    { a:229, name:'x 오프셋',                 en:'x_offset',            grp:'pc', unit:'mm',   kind:'value',   range:[-5,5],  scale:10, status:'active', desc:'X offset (raw=펜던트값×10)' },
    { a:230, name:'z 오프셋',                 en:'z_offset',            grp:'pc', unit:'mm',   kind:'value',   range:[-5,5],  scale:10, status:'active', desc:'Z offset (raw=펜던트값×10)' },
    { a:231, name:'전압 (지령)',              en:'cond_voltage',        grp:'pc', unit:'V',    kind:'value',   range:[0,80],  scale:10, status:'active', desc:'지령 전압 (raw=펜던트값×10)' },
    { a:232, name:'전류 (지령)',              en:'cond_current',        grp:'pc', unit:'A',    kind:'value',   range:[0,600], scale:10, status:'active', desc:'지령 전류 (raw=펜던트값×10)' },
    { a:233, name:'속도_start',               en:'speed_start',         grp:'pc', unit:'cpm',  kind:'value',   range:[0,100], scale:10, status:'active', desc:'시작 구간 속도 (GAP_begin, raw=펜던트값×10)' },
    { a:234, name:'위빙폭_start',             en:'weave_w_start',       grp:'pc', unit:'mm',   kind:'value',   range:[0,50],  scale:10, status:'active', desc:'시작 구간 위빙폭 (Gap_begin, raw=펜던트값×10)' },
    { a:235, name:'속도_end',                 en:'speed_end',           grp:'pc', unit:'cpm',  kind:'value',   range:[0,100], scale:10, status:'active', desc:'종료 구간 속도 (GAP_end, raw=펜던트값×10)' },
    { a:236, name:'위빙폭_end',               en:'weave_w_end',         grp:'pc', unit:'mm',   kind:'value',   range:[0,50],  scale:10, status:'active', desc:'종료 구간 위빙폭 (GAP_end, raw=펜던트값×10)' },
    { a:237, name:'방향 탐색 높이',           en:'dir_search_h',        grp:'pc', unit:'mm',   kind:'value',   range:[0,50],  status:'active', desc:'방향 탐색 높이' },
    { a:238, name:'터치 높이',                en:'touch_h',             grp:'pc', unit:'mm',   kind:'value',   range:[0,50],  status:'active', desc:'터치 높이' },
    { a:239, name:'아크센싱',                 en:'arc_sensing',         grp:'pc', unit:'A',    kind:'value',   range:[0,600], status:'unused', desc:'아크 센싱 기준값 변경. 4.7V 평블록 미사용.' },
    { a:240, name:'로봇 반환 완료',           en:'robot_ack',           grp:'pc', unit:'',     kind:'bool',    range:[0,1],   status:'active', desc:'로봇 반환 완료. 153/154와 핸드셰이크 (로봇 요청 후 154 수신 시 0으로 클리어)',
      valueMap:{0:'대기', 1:'반환'} },
    { a:241, name:'시작 용접시간',            en:'start_t',             grp:'pc', unit:'s',    kind:'value',   range:[0,20],  scale:10, status:'active', desc:'시작 조건: 용접 시간 (raw=펜던트값×10)' },
    { a:242, name:'시작 가스',                en:'start_gas',           grp:'pc', unit:'s',    kind:'value',   range:[0,20],  scale:10, status:'unused', desc:'시작 조건: 가스. 4.7V 평블록 미사용.' },
    { a:243, name:'시작 후진 거리',           en:'start_back',          grp:'pc', unit:'mm',   kind:'value',   range:[0,10],  scale:10, status:'unused', desc:'시작 조건: 후진 거리. 4.7V 평블록 미사용.' },
    { a:244, name:'시작 전류',                en:'start_current',       grp:'pc', unit:'A',    kind:'value',   range:[0,600], scale:10, status:'active', desc:'시작 조건: 전류 (raw=펜던트값×10)' },
    { a:245, name:'시작 전압',                en:'start_voltage',       grp:'pc', unit:'V',    kind:'value',   range:[0,80],  scale:10, status:'active', desc:'시작 조건: 전압 (raw=펜던트값×10)' },
    { a:246, name:'끝 용접시간',              en:'end_t',               grp:'pc', unit:'s',    kind:'value',   range:[0,20],  scale:10, status:'active', desc:'끝 조건: 용접 시간 (raw=펜던트값×10)' },
    { a:247, name:'끝 가스',                  en:'end_gas',             grp:'pc', unit:'s',    kind:'value',   range:[0,20],  scale:10, status:'active', desc:'끝 조건: 가스 (raw=펜던트값×10)' },
    { a:248, name:'끝 후진 거리',             en:'end_back',            grp:'pc', unit:'mm',   kind:'value',   range:[0,10],  scale:10, status:'active', desc:'끝 조건: 후진 거리 (raw=펜던트값×10)' },
    { a:249, name:'끝 전류',                  en:'end_current',         grp:'pc', unit:'A',    kind:'value',   range:[0,600], scale:10, status:'active', desc:'끝 조건: 전류 (raw=펜던트값×10)' },
    { a:250, name:'끝 전압',                  en:'end_voltage',         grp:'pc', unit:'V',    kind:'value',   range:[0,80],  scale:10, status:'active', desc:'끝 조건: 전압 (raw=펜던트값×10)' },
    { a:251, name:'끝 용접시간2',             en:'end_t2',              grp:'pc', unit:'s',    kind:'value',   range:[0,20],  scale:10, status:'active', desc:'끝 조건2: 용접 시간 (raw=펜던트값×10)' },
    { a:252, name:'끝 가스2',                 en:'end_gas2',            grp:'pc', unit:'s',    kind:'value',   range:[0,20],  scale:10, status:'active', desc:'끝 조건2: 가스 (raw=펜던트값×10)' },
    { a:253, name:'끝 후진 거리2',            en:'end_back2',           grp:'pc', unit:'mm',   kind:'value',   range:[0,10],  scale:10, status:'active', desc:'끝 조건2: 후진 거리 (raw=펜던트값×10)' },
    { a:254, name:'끝 전류2',                 en:'end_current2',        grp:'pc', unit:'A',    kind:'value',   range:[0,600], scale:10, status:'active', desc:'끝 조건2: 전류 (raw=펜던트값×10)' },
    { a:255, name:'끝 전압2',                 en:'end_voltage2',        grp:'pc', unit:'V',    kind:'value',   range:[0,80],  scale:10, status:'active', desc:'끝 조건2: 전압 (raw=펜던트값×10)' },
  ];

  // 주소 → 정의 매핑. applySnapshot 등에서 scale 조회용.
  const byAddr = Object.fromEntries(R.map(r => [r.a, r]));

  // ─── 화면 레이아웃 정의 (UI 슬롯 ↔ 레지스터 주소) ─────────────────────
  // HERO strip 과 StatusBar 가 이 layout 을 읽어서 동적으로 박스를 그림.
  // 어느 주소가 어떤 슬롯에 들어갈지는 사용자가 modbus_registers.json 에서 수정 가능.
  //
  // 슬롯 구조:
  //   hero.primary  : 좌측 큰 박스 (bool 한 개 + 인라인 메타 여러 개)
  //     addr        : 주 표시할 bool 주소
  //     onLabel     : value=1 일 때 표시 (디폴트: '활성')
  //     offLabel    : value=0 일 때 표시 (디폴트: '비활성')
  //     metas       : [{ label, addr, of?: addr }] — 작은 글씨 인라인 표시
  //   hero.big      : 큰 숫자 박스 배열 [{ addr, color, target?: addr }]
  //     target      : "목표 ___" sub 텍스트로 같이 보일 주소 (선택)
  //   hero.small    : 작은 박스 배열 [{ addr, label, code?: bool }]
  //     code=true   : 0이면 "OK", 아니면 "E{val}"
  //   statusBar.items : 하단 띠 항목 배열
  //     [{ type: 'live-tick' | 'literal' | 'addrs' | 'bits' | 'code', ... }]
  const defaultLayout = {
    hero: {
      primary: {
        addr: 130,
        onLabel: '용접 중',
        offLabel: '무부하',
        color: 'accent',
        metas: [
          { label: '셀',   addr: 135 },
          { label: '패스', addr: 136, of: 139 },
          { label: '모드', addr: 162 },
        ],
      },
      big: [
        { addr: 131, color: 'accent', target: 133 },
        { addr: 132, color: 'cyan',   target: 134 },
      ],
      small: [
        { addr: 128, label: 'ROBOT HB' },
        { addr: 161, label: 'PEND HB' },
        { addr: 258, label: 'UR MODE' },
        { addr: 142, label: 'ROBOT ERR', code: true },
      ],
    },
    statusBar: {
      items: [
        { type: 'live-tick' },
        { type: 'literal', text: 'POLL 250ms' },
        { type: 'addrs', label: 'HEARTBEAT', addrs: [128, 161], format: 'a / b' },
        { type: 'bits', label: 'WCR/STICK', addr: 211, width: 8 },
        { type: 'code', label: 'ERR', addr: 142 },
      ],
    },
  };
  let layout = defaultLayout;

  // ─── Decoder: raw 값 → 사람이 읽는 분해 결과 ─────────────────────────
  // 반환값: [{ label, val }, ...] — RegisterDetail 의 "디코드" 패널에서 그려짐.
  // - valueMap : 직접 매핑 (enum, 0/1-indexed 양쪽 지원)
  // - bits     : 단일 비트 ON/OFF (옵션: 비트별 enum {0:'미검출',1:'검출'})
  // - packed   : 다중 비트 sub-field (옵션: domain·valueMap·expect)
  // - contextMap : 2F/3F 컨텍스트에 따라 의미 다름 (현재 컨텍스트 미정 → 두 후보 모두 표시)
  function decodeRegister(r, value) {
    const parts = [];
    if (value == null || typeof value === 'string') return parts;
    if (r.valueMap && r.valueMap[value] !== undefined) {
      parts.push({ label: '의미', val: `${r.valueMap[value]} (${value})` });
    }
    if (r.errorMap) {
      if (value === 0) {
        parts.push({ label: '상태', val: '정상 (OK)' });
      } else if (r.errorMap[value]) {
        const e = r.errorMap[value];
        parts.push({ label: '에러', val: `${e.name} (${value})` });
        if (e.cause) parts.push({ label: '원인', val: e.cause });
        if (e.action) parts.push({ label: '조치', val: e.action });
      } else {
        parts.push({ label: '에러', val: `⚠ 미정의 코드 (${value})` });
      }
    }
    if (r.bits) {
      for (const b of r.bits) {
        const bv = (value >> b.bit) & 1;
        const text = b.enum ? `${b.enum[bv]} (${bv})` : (bv ? 'ON' : 'OFF');
        parts.push({ label: `bit${b.bit} ${b.name}`, val: text });
      }
    }
    if (r.packed) {
      for (const p of r.packed) {
        const [lo, hi] = p.bits;
        const width = hi - lo + 1;
        const mask = (1 << width) - 1;
        const sub = (value >> lo) & mask;
        let text;
        if (p.valueMap && p.valueMap[sub] !== undefined) {
          text = `${p.valueMap[sub]} (${sub})`;
        } else if (p.expect !== undefined && sub !== p.expect) {
          text = `${sub} ⚠ expected ${p.expect}`;
        } else if (p.domain) {
          text = `${sub} (${p.domain[0]}~${p.domain[1]})`;
        } else {
          text = String(sub);
        }
        const bitLabel = (lo === hi) ? `bit${lo}` : `bit${lo}–${hi}`;
        parts.push({ label: `${bitLabel} ${p.name}`, val: text });
      }
    }
    if (r.contextMap) {
      for (const ctx of Object.keys(r.contextMap)) {
        const m = r.contextMap[ctx];
        if (m.label) {
          parts.push({ label: `${ctx} 의미`, val: m.label });
        } else if (m[value] !== undefined) {
          parts.push({ label: `${ctx}`, val: `${m[value]} (${value})` });
        }
      }
    }
    return parts;
  }

  // ─── Group metadata ──────────────────────────────────────────────────
  const groups = {
    rp: { id:'rp', label:'로봇 → 팬던트',  short:'R→P',  range:'128–160', color:'#ff6b35', desc:'로봇 상태 보고' },
    pr: { id:'pr', label:'팬던트 → 로봇',  short:'P→R',  range:'161–199', color:'#22d3ee', desc:'팬던트 지시' },
    rw: { id:'rw', label:'로봇 → 용접기',  short:'R→W',  range:'201–210', color:'#fbbf24', desc:'용접기 설정' },
    wr: { id:'wr', label:'용접기 → 로봇',  short:'W→R',  range:'211–220', color:'#34d399', desc:'용접기 피드백' },
    pc: { id:'pc', label:'용접 조건 (P→R)', short:'COND', range:'221–255', color:'#a78bfa', desc:'용접 조건 파라미터' },
    ur: { id:'ur', label:'UR 빌트인',      short:'UR',   range:'258+',    color:'#60a5fa', desc:'UR controller 표준 status' },
  };

  // ─── Live value simulator ───────────────────────────────────────────
  // Hooks set up a 250ms ticker that animates a handful of "active" registers
  // so the dashboard feels alive without being chaotic.

  const initialState = {};
  R.forEach(r => {
    if (r.status !== 'active') { initialState[r.a] = 0; return; }
    if (r.kind === 'counter') initialState[r.a] = 0;
    else if (r.kind === 'bool') initialState[r.a] = 0;
    else if (r.kind === 'enum') initialState[r.a] = 1;
    else if (r.kind === 'code') initialState[r.a] = 0;
    else if (r.kind === 'string') initialState[r.a] = '4.7.2';
    else initialState[r.a] = (r.range?.[0] + r.range?.[1]) / 2 || 0;
  });

  // Reasonable default snapshot (welding active on cell VL2, path 2/3).
  // 모든 값은 **display 단위** (= 화면에 보이는 값). 실제 백엔드에서 오는 raw 값은
  // applySnapshot 에서 scale 로 나눠서 동일한 display 단위가 되도록 처리됨.
  Object.assign(initialState, {
    128: 1, 130: 1, 131: 218, 132: 24.1, 133: 220, 134: 24,
    135: 'VL2', 136: 2, 138: 2, 139: 3, 140: 2, 142: 0,
    151: 'VL2', 155: 'VL2', 156: 1, 158: 22.5, 159: 195,
    160: '4.7.2',
    161: 1, 162: 2, 168: 2,
    173: 280, 174: 280, 175: 220, 183: 8,
    // 184~187: P/I gain — 펜던트 표시값 (raw는 ×10)
    184: 8.0, 185: 3.0, 186: 7.0, 187: 2.5,
    201: 1, 204: 220, 205: 24, 206: 0,
    211: 5, 212: 218, 213: 24.1, 214: 9.2, 216: 0,
    217: 220, 218: 24, 219: 0,
    225: 1.6, 226: 0.3, 227: 0.4, 228: 45,
    // 229~236 용접 조건 (display 단위)
    229: 0, 230: 0, 231: 24.0, 232: 220,
    233: 3.5, 234: 2.5, 235: 3.5, 236: 2.5,
    237: 8, 238: 5,
    // 241~255 시작/끝 조건 (display 단위)
    241: 0.5, 244: 220, 245: 24.0,
    246: 0.5, 247: 0.8, 248: 0.8, 249: 200, 250: 22.0,
    251: 0.3, 252: 0.5, 253: 0.5, 254: 180, 255: 20.0,
  });

  // ─── API ─────────────────────────────────────────────────────────────
  // Subscribers receive a fresh state object every tick. When the backend
  // WebSocket (/ws/modbus) is reachable we drive `state` from real values;
  // otherwise we fall back to the synthetic ticker so the UI stays alive
  // during offline design work.

  const state = { ...initialState };
  const subs = new Set();
  const connSubs = new Set();
  let tick = 0;
  let started = false;
  let simTimer = null;
  let ws = null;
  let wsReconnectTimer = null;

  // connection: 'sim' | 'live' | 'connecting' | 'disconnected'
  let connection = 'sim';
  let connMeta = { host: null, pollHz: null, lastTs: 0, error: null };

  function blankWeldingState() {
    // 라이브가 아닐 때 호출. heartbeat·string·reserved 는 그대로 두고,
    // 측정값(value/code/bitfield/enum/bool)을 null로 만들어 화면에서 "—" 처리되게.
    R.forEach(r => {
      if (r.status !== 'active') return;
      if (r.kind === 'counter' || r.kind === 'string') return;
      state[r.a] = null;
    });
  }

  function setConnection(next, patch) {
    const prev = connection;
    connection = next;
    if (patch) connMeta = { ...connMeta, ...patch };
    // sim → 다른 상태: 시뮬레이터 즉시 정지 (위 stale 값 유지 방지).
    if (prev === 'sim' && next !== 'sim') stopSim();
    // 'live'·'sim' 외 상태는 측정값 비움. stale을 실값으로 오인 방지.
    if (next === 'connecting' || next === 'disconnected') {
      blankWeldingState();
      notify();
    }
    connSubs.forEach(fn => fn(connection, connMeta));
  }

  function notify() {
    subs.forEach(fn => fn(state, tick));
  }

  // ── Simulator (fallback) ───────────────────────────────────────────
  function simStep() {
    tick++;
    state[128] = (state[128] + 1) % 500;        // robot heartbeat
    state[161] = (state[161] + 1) % 500;        // pendant heartbeat
    const t = tick * 0.25;
    const osc = Math.sin(t * 1.7) * 4 + (Math.random() - 0.5) * 3;
    state[131] = +(220 + osc).toFixed(1);
    state[132] = +(24.2 + Math.sin(t * 1.9) * 0.5 + (Math.random() - 0.5) * 0.3).toFixed(2);
    state[212] = +(state[131] + (Math.random() - 0.5) * 1.5).toFixed(1);
    state[213] = +(state[132] + (Math.random() - 0.5) * 0.15).toFixed(2);
    state[214] = +(9.2 + Math.sin(t * 0.6) * 0.4).toFixed(2);
    state[158] = +(22.5 + Math.sin(t * 0.3) * 0.6).toFixed(2);
    state[159] = +(195 + Math.sin(t * 0.4) * 6).toFixed(1);
    state[219] = +(Math.sin(t * 0.2) * 0.5).toFixed(2);
    state[211] = (tick % 40 === 0) ? (state[211] === 5 ? 13 : 5) : state[211];
    notify();
  }

  function startSim() {
    if (simTimer) return;
    simTimer = setInterval(simStep, 250);
    setConnection('sim');
  }
  function stopSim() {
    if (simTimer) { clearInterval(simTimer); simTimer = null; }
  }

  // ── Live WS driver ─────────────────────────────────────────────────
  function applySnapshot(snap) {
    // snap = { connected, host, poll_hz, tick, ts, welding:{addr->u16}, status:{...} }
    // 레지스터 정의에 scale 이 있으면 raw / scale 로 환산해 표시값으로 변환.
    // (예: 184~187 P/I gain, 229~255 용접 조건은 펜던트 값×10 이므로 ÷10)
    if (!snap) return;
    if (snap.welding) {
      for (const k in snap.welding) {
        const addr = +k;
        const def = byAddr[addr];
        const raw = snap.welding[k];
        if (def && def.scale && typeof raw === 'number') {
          state[addr] = raw / def.scale;
        } else {
          state[addr] = raw;
        }
      }
    }
    if (typeof snap.tick === 'number') tick = snap.tick;
    connMeta = {
      ...connMeta,
      host: snap.host || connMeta.host,
      pollHz: snap.poll_hz || connMeta.pollHz,
      lastTs: snap.ts || Date.now() / 1000,
      error: snap.error || null,
      status: snap.status || null,
    };
    notify();
    // re-emit connection so subscribers see updated meta (host, ts)
    connSubs.forEach(fn => fn(connection, connMeta));
  }

  function connectWS() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    // When served from FastAPI the WS lives at /ws/modbus on the same host.
    // When opened as a file:// the data-modbus.js cannot reach a backend —
    // we stay in sim mode.
    if (location.protocol === 'file:') return;
    const url = `${proto}//${location.host}/ws/modbus`;
    setConnection('connecting', { host: location.host });
    try {
      ws = new WebSocket(url);
    } catch (err) {
      setConnection('sim', { error: String(err) });
      startSim();
      return;
    }
    ws.onopen = () => {
      stopSim();
      // WS는 떴지만 Modbus 슬레이브 라이브 여부는 첫 스냅샷에서 판별.
      setConnection('connecting', { error: null });
    };
    ws.onmessage = (ev) => {
      try {
        const snap = JSON.parse(ev.data);
        if (snap.connected === false) {
          // backend는 살았지만 Modbus 슬레이브 미연결 — 값 표시 안함.
          setConnection('connecting', { error: snap.error || 'modbus offline' });
          // applySnapshot 호출하지 않음 (stale welding 적용 방지)
          return;
        }
        if (connection !== 'live') setConnection('live', { error: null });
        applySnapshot(snap);
      } catch (err) {
        console.warn('[MODBUS] bad message', err);
      }
    };
    ws.onerror = () => {
      // onclose will fire next — handle there
    };
    ws.onclose = () => {
      ws = null;
      setConnection('disconnected');
      startSim(); // keep UI alive while we retry
      scheduleReconnect();
    };
  }

  function scheduleReconnect() {
    if (wsReconnectTimer) return;
    wsReconnectTimer = setTimeout(() => {
      wsReconnectTimer = null;
      connectWS();
    }, 3000);
  }

  function start() {
    if (started) return;
    started = true;
    // 시작 직후 백엔드에 저장된 정의가 있으면 hot-swap 시도. 실패해도 하드코딩 정의로 진행.
    tryLoadBackendDefinitions();
    // Optimistic: try the WS first; sim kicks in if connectWS fails or closes.
    startSim();
    connectWS();
  }

  // ── 백엔드 저장본으로부터 register 정의 hot-reload ──────────────────
  // /api/modbus/registers 가 saved=true 면 R[] 와 byAddr 를 in-place 교체.
  // React 컴포넌트는 다음 notify() 발생 시 새 정의로 자동 re-render.
  async function tryLoadBackendDefinitions() {
    try {
      if (location.protocol === 'file:') return;
      const res = await fetch('/api/modbus/registers');
      if (!res.ok) return;
      const json = await res.json();
      if (!json.saved || !json.text) return;
      const parsed = JSON.parse(json.text);
      if (!Array.isArray(parsed.registers) || parsed.registers.length === 0) return;
      replaceRegisters(parsed.registers, parsed.groups);
      if (parsed.layout && typeof parsed.layout === 'object') {
        layout = parsed.layout;
        window.MODBUS.layout = layout;
      }
      console.info(`[MODBUS] 백엔드 저장본 ${parsed.registers.length}개 레지스터 로드됨`);
    } catch (err) {
      console.warn('[MODBUS] 저장본 로드 실패, 하드코딩 정의 유지:', err);
    }
  }

  function replaceRegisters(newR, newGroups) {
    // R 을 in-place 로 교체. byAddr 도 갱신.
    R.length = 0;
    newR.forEach(r => R.push(r));
    Object.keys(byAddr).forEach(k => delete byAddr[k]);
    R.forEach(r => { byAddr[r.a] = r; });
    if (newGroups && typeof newGroups === 'object') {
      Object.keys(groups).forEach(k => delete groups[k]);
      Object.assign(groups, newGroups);
    }
    // 새 active 레지스터들이 state 에 없으면 기본값 채워줌.
    R.forEach(r => { if (state[r.a] === undefined) state[r.a] = null; });
    // sparkline 히스토리도 채워줌.
    R.forEach(r => { if (!hist[r.a]) hist[r.a] = new Array(histLen).fill(0); });
    notify();
    connSubs.forEach(fn => fn(connection, connMeta));
  }

  // 현재 프론트엔드의 R[] / groups / layout 을 백엔드에 보낼 JSON 으로 직렬화.
  // GP 매핑 페이지의 "현재 정의로 초기화" 버튼이 사용.
  function exportJSON() {
    return JSON.stringify({ registers: R, groups, layout }, null, 2);
  }

  function subscribe(fn) {
    subs.add(fn);
    fn(state, tick);
    return () => subs.delete(fn);
  }

  function subscribeConnection(fn) {
    connSubs.add(fn);
    fn(connection, connMeta);
    return () => connSubs.delete(fn);
  }

  // History buffer (last 240 ticks ≈ 60s) for sparklines
  const histLen = 240;
  const hist = {};
  R.forEach(r => { hist[r.a] = new Array(histLen).fill(state[r.a] || 0); });
  let histHead = 0;
  function pushHist() {
    R.forEach(r => {
      const v = state[r.a];
      hist[r.a][histHead] = typeof v === 'number' ? v : 0;
    });
    histHead = (histHead + 1) % histLen;
  }
  subs.add(() => pushHist());

  function getHist(addr) {
    const arr = hist[addr];
    const out = new Array(histLen);
    for (let i = 0; i < histLen; i++) {
      out[i] = arr[(histHead + i) % histLen];
    }
    return out;
  }

  window.MODBUS = {
    registers: R,
    groups,
    state,
    subscribe,
    subscribeConnection,
    start,
    getHist,
    byAddr,
    decode: decodeRegister,
    exportJSON,
    get layout() { return layout; },
    get connection() { return connection; },
    get meta() { return connMeta; },
  };
})();
