#!/usr/bin/env node
/**
 * saju — 한국식 사주 계산기 (명식 · 궁합 · 택일)
 *
 * 만세력 계산은 엔진이 한다. 이 파일은 입출력만 맡는다.
 * LLM 이 이 출력을 받아 해석하는 것을 전제로 만들었다 — 그래서 숫자와 근거를 다 찍는다.
 */

const path = require('path');
const E = require(path.join(__dirname, '..', 'lib', 'engine.cjs'));

const { ko, pillarKo, WX_KO, SS_KO, GAN_WX, ZHI_WX, SHENG, KE, has,
        CHONG, YUKHAP, GAN_HAP, GAN_CHONG, HAI, PA, WONJIN,
        round, josa, chartAt, wuxingPower, dayMasterStrength, score,
        twelveStage, solarTimeShiftMin, parseBirth, dateRange, exactWindow } = E;

const WX = ['木', '火', '土', '金', '水'];
const POS = ['년', '월', '일', '시'];
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const LINE = '─'.repeat(78);

/** 한글은 터미널에서 폭 2를 먹는다. padEnd 로는 표가 어긋나서 직접 잰다. */
const wcw = (s) => [...String(s)].reduce((a, ch) => a + (ch.codePointAt(0) > 0x1100 ? 2 : 1), 0);
const padK = (s, w) => String(s) + ' '.repeat(Math.max(0, w - wcw(s)));

// 주요 도시 경도 — 진태양시 보정용
const CITIES = {
  서울: 126.978, 부산: 129.075, 대구: 128.601, 인천: 126.705, 광주: 126.851,
  대전: 127.385, 울산: 129.311, 세종: 127.289, 수원: 127.029, 제주: 126.531,
  춘천: 127.729, 강릉: 128.896, 전주: 127.148, 청주: 127.489, 포항: 129.365,
};

const HELP = `
saju — 한국식 사주 계산기 (명식 · 궁합 · 택일)

  saju chart  --born 1988-03-15T07:30 [--city 서울]
      한 사람의 사주 명식과 구조를 뽑는다.

  saju match  --a 1988-03-15T07:30 --b 1986-11-02T14:00 [--labels 나,상대]
      두 사람의 궁합을 본다. 태어난 시각을 모르면 날짜만 줘도 된다.

  saju taegil --from 2027-02-01 --to 2027-02-26 [옵션]
      날짜 구간을 전수 계산해 좋은 날·시각 순으로 줄 세운다. (제왕절개 출산일 등)

공통 옵션
  --city <도시>       출생지. 진태양시 보정에 쓴다 (기본 서울)
  --lon <경도>        도시 대신 경도를 직접 지정
  --no-solar-time     진태양시 보정 끄기 (다른 만세력과 대조할 때만)
  --json              JSON 출력

taegil 전용 옵션
  --hours 08:00-18:00 가능 시각대        --dow 월수금      가능 요일
  --step 30           스캔 간격(분)      --top 15          상세 출력 개수
  --weekdays          주말 제외          --exclude 날짜,날짜
  --mother / --father 부모 생년월일시 (궁합 10점이 채점에 포함된다)

생년월일시는 YYYY-MM-DDTHH:MM. 시각을 모르면 YYYY-MM-DD 만 줘도 된다.
`;

// ─────────────────────────────────────────────────────────────
// 인자
// ─────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const o = {
    cmd: argv[2], lon: CITIES.서울, city: '서울', json: false,
    hours: '08:00-18:00', step: 30, top: 15,
    weekdaysOnly: false, dow: null, exclude: [],
  };
  for (let i = 3; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--born': o.born = next(); break;
      case '--a': o.a = next(); break;
      case '--b': o.b = next(); break;
      case '--labels': o.labels = next().split(','); break;
      case '--from': o.from = next(); break;
      case '--to': o.to = next(); break;
      case '--hours': o.hours = next(); break;
      case '--step': o.step = parseInt(next(), 10); break;
      case '--top': o.top = parseInt(next(), 10); break;
      case '--mother': o.mother = next(); break;
      case '--father': o.father = next(); break;
      case '--weekdays': o.weekdaysOnly = true; break;
      case '--dow': o.dow = next(); break;
      case '--exclude': o.exclude = next().split(',').map(s => s.trim()); break;
      case '--json': o.json = true; break;
      case '--no-solar-time': o.lon = 135; o.city = '보정 없음'; break;
      case '--city': {
        const c = next();
        if (!(c in CITIES)) throw new Error(`모르는 도시입니다: ${c}\n  아는 도시: ${Object.keys(CITIES).join(' ')}\n  또는 --lon 으로 경도를 직접 주세요.`);
        o.city = c; o.lon = CITIES[c]; break;
      }
      case '--lon': o.lon = parseFloat(next()); o.city = `경도 ${o.lon}`; break;
      default: throw new Error(`알 수 없는 옵션: ${a}`);
    }
  }
  return o;
}

// ─────────────────────────────────────────────────────────────
// 공통 출력 조각
// ─────────────────────────────────────────────────────────────
function printChartBlock(c, indent = '  ') {
  const p = wuxingPower(c);
  const dm = dayMasterStrength(c, p);
  const label = dm.ratio > 0.60 ? '신강(태과)' : dm.ratio > 0.50 ? '약간 신강'
    : dm.ratio > 0.40 ? '중화' : dm.ratio > 0.32 ? '약간 신약' : '신약(태약)';

  console.log(`${indent}${POS.map((n, i) => `${n}주 ${pillarKo(c.pillars[i])}`).join('   ')}`);
  console.log(`${indent}오행    ${WX.map(k => `${WX_KO[k]} ${p[k].toFixed(1)}`).join(' / ')}`);
  const missing = WX.filter(k => p[k] === 0);
  if (missing.length) console.log(`${indent}        ⚠ 없는 오행: ${missing.map(k => WX_KO[k]).join('·')}`);
  console.log(`${indent}일간    ${ko(c.dayGan)}(${WX_KO[dm.me]}) — ${label} ${(dm.ratio * 100).toFixed(0)}%`);
  console.log(`${indent}일주    ${ko(c.pillars[2])} — 십이운성 ${twelveStage(c.dayGan, c.dayZhi)} · 납음 ${c.naYin}`);
  return { power: p, dm, label };
}

/** 지지 4개 사이의 형·충·파·해·합을 전부 나열한다 */
function relations(zhis, gans, n = 4) {
  const out = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const at = `${POS[i]}${POS[j]}`;
    if (has(CHONG, zhis[i], zhis[j]))  out.push(`⚠ ${at} 충 ${ko(zhis[i])}${ko(zhis[j])}`);
    if (has(HAI, zhis[i], zhis[j]))    out.push(`⚠ ${at} 해 ${ko(zhis[i])}${ko(zhis[j])}`);
    if (has(PA, zhis[i], zhis[j]))     out.push(`· ${at} 파 ${ko(zhis[i])}${ko(zhis[j])}`);
    if (has(WONJIN, zhis[i], zhis[j])) out.push(`⚠ ${at} 원진 ${ko(zhis[i])}${ko(zhis[j])}`);
    if (has(YUKHAP, zhis[i], zhis[j])) out.push(`· ${at} 육합 ${ko(zhis[i])}${ko(zhis[j])}`);
    if (has(GAN_HAP, gans[i], gans[j]) && j - i === 1) out.push(`· ${at} 천간합 ${ko(gans[i])}${ko(gans[j])}`);
    if (has(GAN_CHONG, gans[i], gans[j]) && j - i === 1) out.push(`⚠ ${at} 천간충 ${ko(gans[i])}${ko(gans[j])}`);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// chart — 한 사람 명식
// ─────────────────────────────────────────────────────────────
function cmdChart(o) {
  if (!o.born) throw new Error('--born 이 필요합니다. 예: --born 1988-03-15T07:30');
  const c = parseBirth(o.born, o.lon);

  if (o.json) return console.log(JSON.stringify({ born: o.born, city: o.city, chart: c, power: wuxingPower(c) }, null, 2));

  console.log(`\n사주 명식 — ${o.born}  (${o.city}, 진태양시 ${solarTimeShiftMin(o.lon).toFixed(0)}분 보정)`);
  if (c.timeUnknown) console.log('⚠ 태어난 시각을 몰라 시주는 계산하지 않았습니다. 년·월·일주만 유효합니다.');
  console.log(LINE);
  printChartBlock(c);

  console.log(`\n  십신`);
  POS.forEach((n, i) => {
    const g = i === 2 ? '일간(나)' : SS_KO[c.shiShenGan[i]] || c.shiShenGan[i];
    const z = c.shiShenZhi[i].map(s => SS_KO[s] || s).join('·');
    console.log(`    ${n}주  천간 ${padK(g, 12)} 지지 ${z}`);
  });

  const rel = relations(c.zhis, c.gans, c.timeUnknown ? 3 : 4);
  console.log(`\n  관계`);
  if (rel.length) rel.forEach(r => console.log(`    ${r}`));
  else console.log(`    지지에 충·형·파·해 없음`);

  console.log(`\n  절기  ${c.jieQi.name} ${c.jieQi.at} 이후 출생 (월주 기준)`);
  console.log(`\n${LINE}`);
  console.log(`※ 명리는 검증된 예측 체계가 아니고 유파마다 해석이 갈린다. 참고용으로만 쓸 것.\n`);
}

// ─────────────────────────────────────────────────────────────
// match — 두 사람 궁합
// ─────────────────────────────────────────────────────────────
function cmdMatch(o) {
  if (!o.a || !o.b) throw new Error('--a 와 --b 가 필요합니다. 예: --a 1988-03-15T07:30 --b 1986-11-02');
  const [la, lb] = o.labels && o.labels.length === 2 ? o.labels : ['A', 'B'];
  const A = parseBirth(o.a, o.lon), B = parseBirth(o.b, o.lon);
  const pa = wuxingPower(A), pb = wuxingPower(B);

  const notes = [];
  let pts = 50;   // 50점에서 시작해 가감한다

  // ① 일간 관계 — 궁합의 중심
  const ga = A.dayGan, gb = B.dayGan;
  const wa = GAN_WX[ga], wb = GAN_WX[gb];
  if (has(GAN_HAP, ga, gb)) { pts += 15; notes.push(`일간이 서로 합한다 (${ko(ga)}${ko(gb)}) — 궁합에서 가장 좋게 보는 관계`); }
  else if (wa === wb)       { pts += 5;  notes.push(`일간이 같은 오행(${WX_KO[wa]}) — 비슷한 기질, 편하지만 부딪히면 안 물러선다`); }
  else if (SHENG[wa] === wb){ pts += 10; notes.push(`일간 생 — ${la} → ${lb} (${WX_KO[wa]}→${WX_KO[wb]}) · 주는 쪽이 ${la}`); }
  else if (SHENG[wb] === wa){ pts += 10; notes.push(`일간 생 — ${lb} → ${la} (${WX_KO[wb]}→${WX_KO[wa]}) · 주는 쪽이 ${lb}`); }
  else if (KE[wa] === wb)   { pts -= 8;  notes.push(`⚠ 일간 극 — ${la} → ${lb} (${WX_KO[wa]}→${WX_KO[wb]}) · 긴장이 있는 관계`); }
  else if (KE[wb] === wa)   { pts -= 8;  notes.push(`⚠ 일간 극 — ${lb} → ${la} (${WX_KO[wb]}→${WX_KO[wa]}) · 긴장이 있는 관계`); }
  if (has(GAN_CHONG, ga, gb)) { pts -= 10; notes.push(`⚠ 일간이 서로 충한다 (${ko(ga)}${ko(gb)})`); }

  // ② 일지 관계 — 배우자 자리끼리
  const za = A.dayZhi, zb = B.dayZhi;
  if (has(YUKHAP, za, zb))      { pts += 12; notes.push(`일지 육합 (${ko(za)}${ko(zb)}) — 배우자 자리끼리 맞물린다`); }
  else if (has(CHONG, za, zb))  { pts -= 12; notes.push(`⚠ 일지 충 (${ko(za)}${ko(zb)}) — 궁합에서 가장 무겁게 보는 충돌`); }
  else if (has(WONJIN, za, zb)) { pts -= 6;  notes.push(`⚠ 일지 원진 (${ko(za)}${ko(zb)})`); }
  else if (has(HAI, za, zb))    { pts -= 5;  notes.push(`⚠ 일지 해 (${ko(za)}${ko(zb)})`); }
  else if (za === zb)           { pts += 3;  notes.push(`일지가 같다 (${ko(za)}) — 비슷한 생활 리듬`); }

  // ③ 오행 보완 — 내게 없는 걸 상대가 갖고 있나
  const lackA = WX.filter(k => pa[k] === 0), lackB = WX.filter(k => pb[k] === 0);
  const filledA = lackA.filter(k => pb[k] >= 1), filledB = lackB.filter(k => pa[k] >= 1);
  pts += (filledA.length + filledB.length) * 4;
  if (filledA.length) notes.push(`오행 보완 — ${lb} 가 ${la} 에게 없는 ${filledA.map(k => WX_KO[k]).join('·')} 기운을 채워준다`);
  if (filledB.length) notes.push(`오행 보완 — ${la} 가 ${lb} 에게 없는 ${filledB.map(k => WX_KO[k]).join('·')} 기운을 채워준다`);
  const stillA = lackA.filter(k => pb[k] < 1), stillB = lackB.filter(k => pa[k] < 1);
  if (stillA.length || stillB.length) {
    const all = [...new Set([...stillA, ...stillB])];
    notes.push(`⚠ 둘 다 ${all.map(k => WX_KO[k]).join('·')} 기운이 약하다 — 서로 못 채워주는 부분`);
  }

  // ④ 상대가 나에게 무슨 십신인가
  const ssAB = SS_KO[E.shiShen(ga, gb)], ssBA = SS_KO[E.shiShen(gb, ga)];
  const total = Math.max(0, Math.min(100, pts));

  if (o.json) return console.log(JSON.stringify({ a: { label: la, chart: A }, b: { label: lb, chart: B }, score: total, notes }, null, 2));

  console.log(`\n궁합 — ${la} × ${lb}   (${o.city} 기준)`);
  console.log(LINE);
  console.log(`\n[${la}] ${o.a}`);
  printChartBlock(A, '  ');
  console.log(`\n[${lb}] ${o.b}`);
  printChartBlock(B, '  ');

  console.log(`\n${LINE}`);
  console.log(`\n궁합 점수 ${total}점\n`);
  notes.forEach(n => console.log(`  · ${n}`));
  console.log(`\n  십신으로 보면 — ${la} 기준 ${lb} 는 ${ssAB} · ${lb} 기준 ${la} 는 ${ssBA}`);
  if (A.timeUnknown || B.timeUnknown) console.log(`\n  ⚠ 태어난 시각을 모르는 사람이 있어 일주 중심으로만 봤다.`);
  console.log(`\n${LINE}`);
  console.log(`※ 궁합 점수는 유파마다 기준이 다르다. 절대적 판정이 아니라 구조를 보는 도구로 쓸 것.\n`);
}

// ─────────────────────────────────────────────────────────────
// taegil — 날짜 구간 전수 계산
// ─────────────────────────────────────────────────────────────
function cmdTaegil(o) {
  if (!o.from || !o.to) throw new Error('--from 과 --to 가 필요합니다. 예: --from 2027-02-01 --to 2027-02-26');
  const [h0, h1] = o.hours.split('-');
  const [sh, sm] = h0.split(':').map(Number);
  const [eh, em] = h1.split(':').map(Number);

  const parents = [];
  if (o.mother) parents.push({ label: '엄마', chart: parseBirth(o.mother, o.lon) });
  if (o.father) parents.push({ label: '아빠', chart: parseBirth(o.father, o.lon) });

  const groups = new Map();
  for (const day of dateRange(o.from, o.to)) {
    const y = day.getFullYear(), m = day.getMonth() + 1, d = day.getDate();
    const ymd = `${y}-${E.p2(m)}-${E.p2(d)}`;
    const dow = day.getDay();
    if (o.weekdaysOnly && (dow === 0 || dow === 6)) continue;
    if (o.dow && !o.dow.includes(DOW[dow])) continue;
    if (o.exclude.includes(ymd)) continue;

    for (let t = sh * 60 + sm; t <= eh * 60 + em; t += o.step) {
      const chart = chartAt(y, m, d, Math.floor(t / 60), t % 60, o.lon);
      const key = ymd + '|' + chart.pillars.join('');
      if (!groups.has(key)) groups.set(key, { ymd, dow: DOW[dow], chart, times: [], ...score(chart, parents) });
      groups.get(key).times.push(`${E.p2(Math.floor(t / 60))}:${E.p2(t % 60)}`);
    }
  }

  const results = [...groups.values()]
    .map(r => ({ ...r, window: exactWindow(r, o, sh * 60 + sm, eh * 60 + em) }))
    .sort((a, b) => b.total - a.total);

  if (results.length === 0) throw new Error('조건에 맞는 날짜가 없습니다. --dow / --exclude / 날짜 범위를 확인하세요.');

  if (o.json) {
    return console.log(JSON.stringify({
      range: [o.from, o.to], hours: o.hours, city: o.city,
      parents: parents.map(p => ({ label: p.label, pillars: p.chart.pillars })),
      count: results.length, results: results.slice(0, o.top),
    }, null, 2));
  }

  console.log(`\n택일 — ${o.from} ~ ${o.to}`);
  console.log(`가능 시각 ${o.hours}${o.dow ? ` · 가능 요일 ${o.dow}` : ''} · ${o.step}분 간격`);
  console.log(`${o.city} 기준 진태양시 ${solarTimeShiftMin(o.lon).toFixed(0)}분 보정`);
  parents.forEach(p => {
    const shown = p.chart.pillars.filter(x => x !== '??').map(pillarKo).join(' ');
    console.log(`${p.label} 명식: ${shown}${p.chart.timeUnknown ? '  (시주 모름 — 궁합은 일주로만 봄)' : ''}`);
  });
  console.log(`후보 명식 ${results.length}개 → 상위 ${Math.min(o.top, results.length)}개\n${LINE}`);

  results.slice(0, o.top).forEach((r, i) => {
    console.log(`\n[${i + 1}위] ${r.ymd}(${r.dow}) ${r.window}  —  ${r.total}점`);
    console.log(`  사주   ${r.chart.pillars.map(pillarKo).join('  ')}`);
    console.log(`  오행   ${WX.map(k => `${WX_KO[k]} ${r.power[k].toFixed(1)}`).join(' / ')}`);
    console.log(`  점수   ${Object.entries(r.detail).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
    r.notes.forEach(n => console.log(`  · ${n}`));
  });

  console.log(`\n${LINE}\n날짜별 최고점`);
  const byDate = new Map();
  results.forEach(r => { if (!byDate.has(r.ymd) || byDate.get(r.ymd).total < r.total) byDate.set(r.ymd, r); });
  [...byDate.entries()].sort().forEach(([ymd, r]) => {
    console.log(`  ${ymd}(${r.dow}) ${String(r.total).padStart(5)}점 ${'█'.repeat(Math.round(r.total / 4))}  ${r.window}`);
  });

  console.log(`\n※ 점수는 references/scoring.md 기준의 상대 비교값이다. 절대적 길흉이 아니다.`);
  console.log(`※ 출산 택일이라면 산모·태아의 의학적 안전이 언제나 우선한다.\n`);
}

// ─────────────────────────────────────────────────────────────
try {
  const o = parseArgs(process.argv);
  switch (o.cmd) {
    case 'chart':  cmdChart(o); break;
    case 'match':  cmdMatch(o); break;
    case 'taegil': cmdTaegil(o); break;
    case '-h': case '--help': case 'help': case undefined: console.log(HELP); break;
    default: throw new Error(`모르는 명령입니다: ${o.cmd}\n${HELP}`);
  }
} catch (e) {
  console.error(`\n오류: ${e.message}\n`);
  process.exit(1);
}
