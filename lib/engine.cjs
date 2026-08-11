/**
 * saju — 사주 계산 엔진
 *
 * 만세력 계산은 lunar-javascript(MIT)가 하고, 이 파일은 그 위에서
 * 오행 세력·십신·십이운성·형충파해·채점을 얹는다.
 *
 * ⚠ 이 파일의 숫자를 고치기 전에 references/scoring.md 를 먼저 읽어라.
 *   채점 기준과 코드가 어긋나면 결과를 신뢰할 수 없다.
 */

const path = require('path');
const Lunar = require(path.join(__dirname, '..', 'vendor', 'lunar.cjs'));

// ─────────────────────────────────────────────────────────────
// 한글 변환 테이블
// ─────────────────────────────────────────────────────────────
const GAN_KO = { 甲:'갑', 乙:'을', 丙:'병', 丁:'정', 戊:'무', 己:'기', 庚:'경', 辛:'신', 壬:'임', 癸:'계' };
const ZHI_KO = { 子:'자', 丑:'축', 寅:'인', 卯:'묘', 辰:'진', 巳:'사', 午:'오', 未:'미', 申:'신', 酉:'유', 戌:'술', 亥:'해' };
const WX_KO  = { 木:'목', 火:'화', 土:'토', 金:'금', 水:'수' };
const SS_KO  = {
  比肩:'비견', 劫财:'겁재', 食神:'식신', 伤官:'상관', 偏财:'편재',
  正财:'정재', 七杀:'편관', 正官:'정관', 偏印:'편인', 正印:'정인',
};

const GAN_WX = { 甲:'木', 乙:'木', 丙:'火', 丁:'火', 戊:'土', 己:'土', 庚:'金', 辛:'金', 壬:'水', 癸:'水' };
const ZHI_WX = { 子:'水', 丑:'土', 寅:'木', 卯:'木', 辰:'土', 巳:'火', 午:'火', 未:'土', 申:'金', 酉:'金', 戌:'土', 亥:'水' };

// 오행 상생: 목→화→토→금→수→목 / 상극: 목→토→수→화→금→목
const SHENG = { 木:'火', 火:'土', 土:'金', 金:'水', 水:'木' };
const KE    = { 木:'土', 土:'水', 水:'火', 火:'金', 金:'木' };

const ko = (s) => String(s).split('').map(c => GAN_KO[c] || ZHI_KO[c] || WX_KO[c] || c).join('');
const pillarKo = (p) => `${p}(${ko(p)})`;

// ─────────────────────────────────────────────────────────────
// 지지 관계 테이블
// ─────────────────────────────────────────────────────────────
const pairSet = (pairs) => new Set(pairs.map(([a, b]) => [a, b].sort().join('')));
const has = (set, a, b) => set.has([a, b].sort().join(''));

const CHONG = pairSet([['子','午'],['丑','未'],['寅','申'],['卯','酉'],['辰','戌'],['巳','亥']]);          // 육충
const HAI   = pairSet([['子','未'],['丑','午'],['寅','巳'],['卯','辰'],['申','亥'],['酉','戌']]);          // 육해
const PA    = pairSet([['子','酉'],['丑','辰'],['寅','亥'],['卯','午'],['巳','申'],['未','戌']]);          // 육파
const WONJIN= pairSet([['子','未'],['丑','午'],['寅','酉'],['卯','申'],['辰','亥'],['巳','戌']]);          // 원진
const YUKHAP= pairSet([['子','丑'],['寅','亥'],['卯','戌'],['辰','酉'],['巳','申'],['午','未']]);          // 육합
const GAN_HAP  = pairSet([['甲','己'],['乙','庚'],['丙','辛'],['丁','壬'],['戊','癸']]);                  // 천간합
const GAN_CHONG= pairSet([['甲','庚'],['乙','辛'],['丙','壬'],['丁','癸']]);                              // 천간충

const SAMHYEONG = [['寅','巳','申'], ['丑','戌','未']];   // 삼형
const JAHYEONG  = ['辰','午','酉','亥'];                  // 자형
const MUYE      = pairSet([['子','卯']]);                 // 무례지형
const SAMHAP    = { 水:['申','子','辰'], 木:['亥','卯','未'], 火:['寅','午','戌'], 金:['巳','酉','丑'] };

// 십이운성 — 일간이 일지에서 갖는 힘의 단계. 일주의 뿌리(통근)를 근거 있게 재기 위해 쓴다.

// 절기·납음은 라이브러리가 간체자로 준다. 한국 사용자용이라 한글로 바꾼다.
const JIEQI_KO = {
  立春:'입춘', 雨水:'우수', 惊蛰:'경칩', 春分:'춘분', 清明:'청명', 谷雨:'곡우',
  立夏:'입하', 小满:'소만', 芒种:'망종', 夏至:'하지', 小暑:'소서', 大暑:'대서',
  立秋:'입추', 处暑:'처서', 白露:'백로', 秋分:'추분', 寒露:'한로', 霜降:'상강',
  立冬:'입동', 小雪:'소설', 大雪:'대설', 冬至:'동지', 小寒:'소한', 大寒:'대한',
};
const NAYIN_KO = {
  海中金:'해중금', 炉中火:'노중화', 大林木:'대림목', 路旁土:'노방토', 剑锋金:'검봉금',
  山头火:'산두화', 涧下水:'간하수', 城头土:'성두토', 白蜡金:'백랍금', 杨柳木:'양류목',
  泉中水:'천중수', 屋上土:'옥상토', 霹雳火:'벽력화', 松柏木:'송백목', 长流水:'장류수',
  沙中金:'사중금', 山下火:'산하화', 平地木:'평지목', 壁上土:'벽상토', 金箔金:'금박금',
  覆灯火:'복등화', 天河水:'천하수', 大驿土:'대역토', 钗钏金:'차천금', 桑柘木:'상자목',
  大溪水:'대계수', 沙中土:'사중토', 天上火:'천상화', 石榴木:'석류목', 大海水:'대해수',
};

const ZHI_ORDER = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
const YUNSEONG = ['장생','목욕','관대','건록','제왕','쇠','병','사','묘','절','태','양'];
const JANGSAENG = { 甲:'亥', 丙:'寅', 戊:'寅', 庚:'巳', 壬:'申', 乙:'午', 丁:'酉', 己:'酉', 辛:'子', 癸:'卯' };
// 강약 점수 (10점 만점). 뿌리가 튼튼할수록 높다
const YUNSEONG_SCORE = {
  제왕:10, 건록:9.5, 관대:8, 장생:8, 양:6.5, 목욕:5.5,
  태:5, 쇠:5, 병:3.5, 사:3, 묘:3, 절:2,
};

/** 일간이 특정 지지에서 갖는 십이운성. 양간은 순행, 음간은 역행한다. */
function twelveStage(gan, zhi) {
  const start = ZHI_ORDER.indexOf(JANGSAENG[gan]);
  const at = ZHI_ORDER.indexOf(zhi);
  const forward = YANG_GAN.has(gan);
  const step = forward ? (at - start + 12) % 12 : (start - at + 12) % 12;
  return YUNSEONG[step];
}

// ─────────────────────────────────────────────────────────────
// 사주 산출
// ─────────────────────────────────────────────────────────────
/**
 * 균시차(Equation of Time) — 진태양시와 평균태양시의 차이. 연중 −14 ~ +16분 사이를 오간다.
 * 지구 궤도가 타원이고 자전축이 기울어 있어서 태양의 남중 시각이 계절마다 흔들리는 것이다.
 * 경도 보정만 하고 이걸 빼먹으면 시주 경계가 최대 16분 어긋난다.
 * (표준 근사식, 오차 1분 이내)
 */
function equationOfTimeMin(y, m, d) {
  const N = Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86400000) + 1;
  const B = 2 * Math.PI * (N - 81) / 364;
  return 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
}

/**
 * 진태양시 보정: 한국 표준시(동경 135°) 기준 시계 시각 → 실제 태양시.
 * 경도 차(서울 126.978° → −32분)에 균시차를 더한다.
 * 날짜를 안 주면 경도 보정만 한다(균시차는 날짜에 따라 달라지므로).
 */
function solarTimeShiftMin(lon, y, m, d) {
  const byLongitude = (lon - 135) * 4;
  if (y === undefined) return byLongitude;
  return byLongitude + equationOfTimeMin(y, m, d);
}

/**
 * ⚠ lunar-javascript 는 중국 라이브러리라 절기 시각을 북경시(UTC+8)로 계산한다.
 * 검증: 라이브러리 입춘 2027-02-04 09:46 vs 한국천문연구원 KST 10:46 — 정확히 1시간 차.
 * 그래서 절기로 판정하는 년주·월주는 KST 에서 60분을 빼 북경시로 환산해 넣는다.
 */
const KST_TO_CST_MIN = -60;

// 지장간 [본기, 중기, 여기]
const HIDE_GAN = {
  子:['癸'],        丑:['己','癸','辛'], 寅:['甲','丙','戊'], 卯:['乙'],
  辰:['戊','乙','癸'], 巳:['丙','庚','戊'], 午:['丁','己'],     未:['己','丁','乙'],
  申:['庚','壬','戊'], 酉:['辛'],        戌:['戊','辛','丁'], 亥:['壬','甲'],
};
const YANG_GAN = new Set(['甲','丙','戊','庚','壬']);

/** 일간 기준으로 대상 천간의 십신을 직접 판정한다 (라이브러리 객체 혼용을 피하기 위해) */
function shiShen(dayGan, target) {
  const me = GAN_WX[dayGan], other = GAN_WX[target];
  const sameYin = YANG_GAN.has(dayGan) === YANG_GAN.has(target);
  if (other === me)            return sameYin ? '比肩' : '劫财';
  if (SHENG[me] === other)     return sameYin ? '食神' : '伤官';
  if (KE[me] === other)        return sameYin ? '偏财' : '正财';
  if (KE[other] === me)        return sameYin ? '七杀' : '正官';
  if (SHENG[other] === me)     return sameYin ? '偏印' : '正印';
  throw new Error(`십신 판정 실패: ${dayGan} vs ${target}`);
}

const p2 = (n) => String(n).padStart(2, '0');
const fmtLocal = (t) =>
  `${t.getFullYear()}-${p2(t.getMonth() + 1)}-${p2(t.getDate())} ${p2(t.getHours())}:${p2(t.getMinutes())}`;

function shiftedSolar(y, m, d, hh, mm, shiftMin) {
  const t = new Date(y, m - 1, d, hh, mm, 0);
  t.setMinutes(t.getMinutes() + shiftMin);
  return Lunar.Solar.fromYmdHms(t.getFullYear(), t.getMonth() + 1, t.getDate(), t.getHours(), t.getMinutes(), 0);
}

function chartAt(y, m, d, hh, mm, lon) {
  // 년·월주 — 절기 판정이므로 북경시로 환산 (천문 현상이라 지역 경도와 무관)
  const ecYM = shiftedSolar(y, m, d, hh, mm, KST_TO_CST_MIN).getLunar().getEightChar();
  // 일·시주 — 지역 태양 위치가 기준이므로 진태양시 보정
  const shift = solarTimeShiftMin(lon, y, m, d);
  const lunarDT = shiftedSolar(y, m, d, hh, mm, shift).getLunar();
  const ecDT = lunarDT.getEightChar();

  const pillars = [ecYM.getYear(), ecYM.getMonth(), ecDT.getDay(), ecDT.getTime()];
  const gans = pillars.map(p => p[0]);
  const zhis = pillars.map(p => p[1]);
  const dayGan = gans[2];

  const t = new Date(y, m - 1, d, hh, mm, 0);
  t.setMinutes(t.getMinutes() + shift);

  // 월주 경계는 節(입춘·경칩·청명…)이다. 中氣(우수·춘분·곡우…)는 월주와 무관하므로
  // getPrevJieQi(절기 전체) 가 아니라 getPrevJie(절만) 를 써야 한다.
  // 전에는 중기를 뽑아놓고 "월주 기준"이라고 표시해 오해를 줬다. 명식 자체는 늘 옳았다.
  const jq = shiftedSolar(y, m, d, hh, mm, KST_TO_CST_MIN).getLunar().getPrevJie(true);
  const jqKst = new Date(jq.getSolar().toYmdHms().replace(' ', 'T'));
  jqKst.setMinutes(jqKst.getMinutes() - KST_TO_CST_MIN);   // 보고용으로 다시 KST 로 되돌린다

  return {
    clock: { y, m, d, hh, mm },
    trueSolar: `${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`,
    pillars, gans, zhis,
    dayGan, dayZhi: zhis[2],
    hideGan: zhis.map(z => HIDE_GAN[z]),
    shiShenGan: [shiShen(dayGan, gans[0]), shiShen(dayGan, gans[1]), '일간', shiShen(dayGan, gans[3])],
    shiShenZhi: zhis.map(z => HIDE_GAN[z].map(g => shiShen(dayGan, g))),
    naYin: NAYIN_KO[ecDT.getDayNaYin()] || ecDT.getDayNaYin(),
    jieQi: { name: JIEQI_KO[jq.getName()] || jq.getName(), at: fmtLocal(jqKst) + ' KST' },
  };
}

/**
 * 오행 세력: 천간 1.0 / 지지 본기 1.0 / 지장간 중·여기 0.4
 *
 * ⚠ 태어난 시각을 모르면 시주를 **세지 않는다.** parseBirth 는 시각 미상일 때 정오로
 *   명식을 뽑는데(일주를 확정하려고), 그 시주는 실제 값이 아니라 자리를 채운 값일 뿐이다.
 *   이걸 세면 있지도 않은 두 글자가 오행 세력에 들어가 강약 판정까지 뒤집힌다.
 */
function wuxingPower(chart) {
  const n = chart.timeUnknown ? 3 : 4;
  const p = { 木:0, 火:0, 土:0, 金:0, 水:0 };
  chart.gans.slice(0, n).forEach(g => { p[GAN_WX[g]] += 1.0; });
  chart.zhis.slice(0, n).forEach(z => { p[ZHI_WX[z]] += 1.0; });
  chart.hideGan.slice(0, n).forEach(list => {
    list.slice(1).forEach(g => { p[GAN_WX[g]] += 0.4; });   // [0]은 본기 = 지지 오행과 중복이라 제외
  });
  return p;
}

/** 일간 강약: (비겁 + 인성) 대 (식상 + 재성 + 관성) */
function dayMasterStrength(chart, power) {
  const me = GAN_WX[chart.dayGan];
  const resource = Object.keys(SHENG).find(k => SHENG[k] === me);   // 나를 생하는 오행 = 인성
  const support = power[me] + power[resource];
  const total = Object.values(power).reduce((a, b) => a + b, 0);
  return { me, resource, ratio: support / total, support, total };
}

// ─────────────────────────────────────────────────────────────
// 채점
// ─────────────────────────────────────────────────────────────
function score(chart, parents) {
  const power = wuxingPower(chart);
  const notes = [];
  const detail = {};

  // ① 오행 균형 (40점) — 없는 오행 페널티 + 편중도
  const vals = ['木','火','土','金','水'].map(k => power[k]);
  const total = vals.reduce((a, b) => a + b, 0);
  const mean = total / 5;
  const sd = Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / 5);
  const missing = ['木','火','土','金','水'].filter(k => power[k] === 0);
  let s1 = 28 - Math.min(17, sd / mean * 28) - missing.length * 5.6;
  s1 = Math.max(0, s1);
  detail.오행균형 = round(s1);
  if (missing.length) notes.push(`⚠ 없는 오행: ${missing.map(k => WX_KO[k]).join('·')}`);
  else notes.push('오행 다섯 기운이 모두 있음');

  // ② 일간 강약 중화 (20점) — 비겁+인성이 전체의 45% 근처일 때 만점.
  //    라벨 구간과 만점 지점(BALANCED)은 반드시 같은 값을 쓴다.
  const BALANCED = 0.45;
  const dm = dayMasterStrength(chart, power);
  const s2 = Math.max(0, 14 - Math.abs(dm.ratio - BALANCED) * 42);
  detail.일간중화 = round(s2);
  const strengthLabel = dm.ratio > 0.60 ? '신강(태과)' : dm.ratio > 0.50 ? '약간 신강'
    : dm.ratio > 0.40 ? '중화' : dm.ratio > 0.32 ? '약간 신약' : '신약(태약)';
  notes.push(`일간 ${ko(chart.dayGan)}(${WX_KO[dm.me]}) — ${strengthLabel} (${(dm.ratio*100).toFixed(0)}%)`);

  // ③ 형·충·파·해 (25점 만점에서 감점)
  const z = chart.zhis, g = chart.gans;
  const POS = ['년', '월', '일', '시'];
  const N = chart.timeUnknown ? 3 : 4;   // 시각 미상이면 시주는 관계 판정에서도 뺀다
  let penalty = 0;
  const clashes = [];
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
    const adjacent = j - i === 1;
    const critical = (i === 2 || j === 2) || (i === 3 || j === 3);   // 일주·시주가 걸리면 가중
    const w = (adjacent ? 1.0 : 0.6) * (critical ? 1.4 : 1.0);
    if (has(CHONG, z[i], z[j])) { penalty += 6 * w; clashes.push(`${POS[i]}${POS[j]} 충 ${ko(z[i])}${ko(z[j])}`); }
    if (has(HAI, z[i], z[j]))   { penalty += 2.5 * w; clashes.push(`${POS[i]}${POS[j]} 해 ${ko(z[i])}${ko(z[j])}`); }
    if (has(PA, z[i], z[j]))    { penalty += 1.5 * w; clashes.push(`${POS[i]}${POS[j]} 파 ${ko(z[i])}${ko(z[j])}`); }
    if (has(WONJIN, z[i], z[j])){ penalty += 2 * w; clashes.push(`${POS[i]}${POS[j]} 원진 ${ko(z[i])}${ko(z[j])}`); }
    if (has(MUYE, z[i], z[j]))  { penalty += 3 * w; clashes.push(`${POS[i]}${POS[j]} 형(무례) ${ko(z[i])}${ko(z[j])}`); }
    if (has(GAN_CHONG, g[i], g[j]) && adjacent) { penalty += 2; clashes.push(`${POS[i]}${POS[j]} 천간충 ${ko(g[i])}${ko(g[j])}`); }
  }
  // 삼형 (세 글자 모두 있을 때)
  SAMHYEONG.forEach(tri => {
    if (tri.every(x => z.includes(x))) { penalty += 8; clashes.push(`삼형 ${tri.map(ko).join('')}`); }
  });
  // 자형 (같은 글자 2개 이상)
  JAHYEONG.forEach(x => {
    if (z.filter(v => v === x).length >= 2) { penalty += 3; clashes.push(`자형 ${ko(x)}${ko(x)}`); }
  });
  const s3 = Math.max(0, 20 - penalty * 0.8);
  detail.형충파해 = round(s3);
  if (clashes.length) notes.push(`⚠ ${clashes.join(', ')}`);
  else notes.push('지지에 충·형·파·해 없음');

  // ④ 합 — 상생 흐름 (10점 가점)
  let hap = 0;
  const haps = [];
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
    if (has(YUKHAP, z[i], z[j])) { hap += 2.5; haps.push(`${POS[i]}${POS[j]} 육합 ${ko(z[i])}${ko(z[j])}`); }
    if (has(GAN_HAP, g[i], g[j]) && j - i === 1) { hap += 2; haps.push(`${POS[i]}${POS[j]} 천간합 ${ko(g[i])}${ko(g[j])}`); }
  }
  Object.entries(SAMHAP).forEach(([wx, tri]) => {
    const cnt = tri.filter(x => z.includes(x)).length;
    if (cnt === 3) { hap += 5; haps.push(`삼합 ${tri.map(ko).join('')} → ${WX_KO[wx]}국`); }
    else if (cnt === 2 && tri.slice(0,2).every(x => z.includes(x))) { hap += 1.5; haps.push(`반합 ${WX_KO[wx]}`); }
  });
  const s4 = Math.min(7, hap * 0.7);
  detail.합 = round(s4);
  if (haps.length) notes.push(haps.join(', '));

  // ⑤ 십신 편중 (5점)
  const ssAll = [...chart.shiShenGan.filter(x => x !== '일간'), ...chart.shiShenZhi.flat()];
  const cnt = {};
  ssAll.forEach(s => { cnt[s] = (cnt[s] || 0) + 1; });
  const maxSs = Math.max(...Object.values(cnt));
  const s5 = Math.max(0, 4 - Math.max(0, maxSs - 3) * 1.2);
  detail.십신균형 = round(s5);
  const dominant = Object.entries(cnt).filter(([, c]) => c >= 4).map(([k, c]) => `${SS_KO[k] || k}×${c}`);
  if (dominant.length) notes.push(`⚠ 십신 편중: ${dominant.join(', ')}`);

  // ⑦ 일주 힘 — 십이운성 (10점)
  //    사주하루 등 다른 택일 도구의 "일주 길흉 등급"에 대응한다. 임의의 등급표를 베끼는 대신
  //    일간이 일지에서 갖는 십이운성으로 뿌리(통근)를 재는 방식을 택했다. 근거가 명확해서다.
  const stage = twelveStage(chart.dayGan, chart.dayZhi);
  const s7 = YUNSEONG_SCORE[stage];
  detail.일주 = round(s7);
  notes.push(`일주 ${ko(chart.pillars[2])} — 십이운성 ${stage}`);

  // ⑧ 상생 흐름 (7점) — 인접 기둥 천간끼리의 생.
  //    일간을 생해주는 흐름(인성)을 가장 높게 본다. 일간이 남을 생하면 기운이 새는 것으로 본다.
  let flow = 0;
  const flows = [];
  const [gY, gM, , gT] = g;
  if (SHENG[GAN_WX[gM]] === GAN_WX[chart.dayGan]) { flow += 3; flows.push(`월간 ${ko(gM)}이 일간을 생함`); }
  if (SHENG[GAN_WX[gT]] === GAN_WX[chart.dayGan]) { flow += 3; flows.push(`시간 ${ko(gT)}이 일간을 생함`); }
  if (SHENG[GAN_WX[gY]] === GAN_WX[gM])           { flow += 1.5; flows.push(`년간→월간 상생`); }
  if (SHENG[GAN_WX[chart.dayGan]] === GAN_WX[gM]) { flow += 0.8; flows.push(`일간이 월간을 생함(설기)`); }
  if (SHENG[GAN_WX[chart.dayGan]] === GAN_WX[gT]) { flow += 0.8; flows.push(`일간이 시간을 생함(설기)`); }
  const s8 = Math.min(7, flow);
  detail.상생흐름 = round(s8);
  if (flows.length) notes.push(flows.join(', '));
  else notes.push('⚠ 인접 기둥 사이에 상생 흐름 없음');

  // ⑥ 부모 궁합 (10점, 부모 사주를 준 경우만)
  let s6 = null;
  if (parents && parents.length) {
    let pts = 0;
    parents.forEach(p => {
      const pg = p.chart.dayGan, pz = p.chart.dayZhi;
      const cg = chart.dayGan, cz = chart.dayZhi;
      if (has(GAN_HAP, pg, cg)) { pts += 2.5; notes.push(`${p.label} 일간합 ${ko(pg)}${ko(cg)}`); }
      if (SHENG[GAN_WX[pg]] === GAN_WX[cg]) { pts += 1.5; notes.push(`${josa(p.label)} 아이를 생함(${WX_KO[GAN_WX[pg]]}→${WX_KO[GAN_WX[cg]]})`); }
      // 아이가 부모를 생하는 방향 — 효도로 보는 해석과 아이 기운이 샌다는 해석이 갈려 절반만 준다
      else if (SHENG[GAN_WX[cg]] === GAN_WX[pg]) { pts += 0.8; notes.push(`아이가 ${p.label}를 생함(${WX_KO[GAN_WX[cg]]}→${WX_KO[GAN_WX[pg]]})`); }
      // 일간끼리 극하는 관계 — 방향 무관하게 감점 (다른 택일 도구들이 "일간 상극"으로 깎는 부분)
      if (KE[GAN_WX[pg]] === GAN_WX[cg] || KE[GAN_WX[cg]] === GAN_WX[pg]) {
        pts -= 1; notes.push(`⚠ ${p.label}와 일간 상극(${WX_KO[GAN_WX[pg]]}↔${WX_KO[GAN_WX[cg]]})`);
      }
      if (has(YUKHAP, pz, cz)) { pts += 1.5; notes.push(`${p.label} 일지합 ${ko(pz)}${ko(cz)}`); }
      if (has(CHONG, pz, cz)) { pts -= 3; notes.push(`⚠ ${p.label} 일지충 ${ko(pz)}${ko(cz)}`); }
      if (has(GAN_CHONG, pg, cg)) { pts -= 2; notes.push(`⚠ ${p.label} 일간충 ${ko(pg)}${ko(cg)}`); }
    });
    s6 = Math.max(0, Math.min(10, 5 + pts));
    detail.부모궁합 = round(s6);
  }

  // 28+14+20+7+4+10+7 = 90. 부모 궁합 10점을 더하면 100점 만점
  const base = s1 + s2 + s3 + s4 + s5 + s7 + s8;
  const totalScore = s6 === null ? base / 90 * 100 : (base + s6) / 100 * 100;

  return { total: round(totalScore), detail, notes, power, strength: strengthLabel, missing };
}

const round = (n) => Math.round(n * 10) / 10;

/** 받침 유무에 따라 주격조사를 붙인다 ("엄마가" / "당신이") */
function josa(word) {
  const last = word.charCodeAt(word.length - 1);
  const hasBatchim = last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0;
  return word + (hasBatchim ? '이' : '가');
}

// ─────────────────────────────────────────────────────────────
// 후보 생성
// ─────────────────────────────────────────────────────────────
function* dateRange(from, to) {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const cur = new Date(fy, fm - 1, fd);
  const end = new Date(ty, tm - 1, td);
  while (cur <= end) {
    yield new Date(cur);
    cur.setDate(cur.getDate() + 1);
  }
}
/**
 * 그리드(step분) 스캔으로 잡힌 구간을 1분 단위로 넓혀 실제 시주 경계를 찾는다.
 * 시주는 2시간 단위인데 진태양시 보정 때문에 경계가 시계상 09:32 같은 어중간한 값이 된다.
 * 예약 시각을 잡을 땐 이 정확한 경계가 필요하다.
 */
function exactWindow(r, o, minMin, maxMin) {
  const { y, m, d } = { y: +r.ymd.slice(0,4), m: +r.ymd.slice(5,7), d: +r.ymd.slice(8,10) };
  const same = (t) => {
    if (t < minMin || t > maxMin) return false;
    const c = chartAt(y, m, d, Math.floor(t / 60), t % 60, o.lon);
    return c.pillars.join('') === r.chart.pillars.join('');
  };
  const toMin = (hhmm) => { const [h, mi] = hhmm.split(':').map(Number); return h * 60 + mi; };
  const fmt = (t) => `${String(Math.floor(t / 60)).padStart(2,'0')}:${String(t % 60).padStart(2,'0')}`;

  let start = toMin(r.times[0]);
  let end = toMin(r.times[r.times.length - 1]);
  while (same(start - 1)) start--;
  while (same(end + 1)) end++;
  r.exact = { start, end, startClamped: start === minMin, endClamped: end === maxMin };
  return `${fmt(start)}~${fmt(end)}`;
}

/**
 * 부모 생년월일시 파싱. 시각을 모르면 날짜만 줘도 된다 —
 * 부모 궁합 채점은 일간·일지(일주)만 쓰고, 일주는 날짜로 정해지므로 시각이 없어도 정확하다.
 * 이때 시주는 알 수 없으므로 표시에서 ?? 로 가린다.
 */
function parseBirth(s, lon) {
  const withTime = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$/);
  if (withTime) {
    const c = chartAt(+withTime[1], +withTime[2], +withTime[3], +withTime[4], +withTime[5], lon);
    return { ...c, timeUnknown: false };
  }
  const dateOnly = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    // 정오로 계산 — 일주 경계(자시)에서 멀어 날짜만으로도 일주가 확정된다
    const c = chartAt(+dateOnly[1], +dateOnly[2], +dateOnly[3], 12, 0, lon);
    return { ...c, timeUnknown: true, pillars: [c.pillars[0], c.pillars[1], c.pillars[2], '??'] };
  }
  throw new Error(`생년월일시는 YYYY-MM-DDTHH:MM (시각 모르면 YYYY-MM-DD) 형식이어야 합니다 (받은 값: ${s})`);
}


module.exports = {
  GAN_KO, ZHI_KO, WX_KO, SS_KO, GAN_WX, ZHI_WX, SHENG, KE,
  CHONG, HAI, PA, WONJIN, YUKHAP, GAN_HAP, GAN_CHONG, SAMHYEONG, JAHYEONG, MUYE, SAMHAP,
  HIDE_GAN, YANG_GAN, YUNSEONG_SCORE, JIEQI_KO, NAYIN_KO,
  ko, pillarKo, has, round, josa, p2, fmtLocal,
  solarTimeShiftMin, equationOfTimeMin, shiShen, twelveStage, chartAt,
  wuxingPower, dayMasterStrength, score,
  dateRange, exactWindow, parseBirth,
};
