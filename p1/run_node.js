#!/usr/bin/env node
/* Spike 2 テストランナー(Node版)。tests/*.json の94件を実行して集計する。 */
'use strict';
const fs = require('fs');
const path = require('path');
const E = require('./engine.js');

const DIR = __dirname;
const load = (f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
let pass = 0, fail = 0;
const failures = [];

function check(id, name, ok, detail) {
  if (ok) { pass++; console.log(`  OK ${id} ${name}`); }
  else { fail++; failures.push({ id, name, detail }); console.log(`  NG ${id} ${name} — ${detail}`); }
}
const sortedEq = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

// ---- T1: SFEN ----
console.log('=== T1 SFEN読み書き ===');
for (const c of load('t1_sfen.json').cases) {
  if (c.mode === 'roundtrip') {
    try { const out = E.toSfen(E.parseSfen(c.input)); check(c.id, c.name, out === c.input, `出力=${out}`); }
    catch (e) { check(c.id, c.name, false, `例外: ${e.message}`); }
  } else if (c.mode === 'normalize') {
    try { const out = E.toSfen(E.parseSfen(c.input)); check(c.id, c.name, out === c.expectedOutput, `出力=${out} 期待=${c.expectedOutput}`); }
    catch (e) { check(c.id, c.name, false, `例外: ${e.message}`); }
  } else { // reject
    let rejected = false, msg = '';
    try { E.parseSfen(c.input); } catch (e) { rejected = true; msg = e.message; }
    check(c.id, c.name, rejected, rejected ? '' : '拒否されなかった');
  }
}

// ---- T2: USI ----
console.log('=== T2 USI着手表記 ===');
for (const c of load('t2_usi.json').cases) {
  if (c.mode === 'roundtrip') {
    try { const out = E.moveToUsi(E.parseMove(c.input)); check(c.id, c.name, out === c.input, `出力=${out}`); }
    catch (e) { check(c.id, c.name, false, `例外: ${e.message}`); }
  } else {
    let rejected = false;
    try { E.parseMove(c.input); } catch (e) { rejected = true; }
    check(c.id, c.name, rejected, rejected ? '' : '拒否されなかった');
  }
}

// ---- T3: 反則50件 ----
console.log('=== T3 反則判定 ===');
for (const c of load('t3_fouls.json').cases) {
  const pos = E.parseSfen(c.sfen);
  const res = E.validateMove(pos, c.move);
  const ok = (c.expect === 'legal') ? (res.legal === true)
           : (res.legal === false && res.reason === c.reason);
  check(c.id, c.name, ok, `結果=${res.legal ? 'legal' : 'illegal/' + res.reason} 期待=${c.expect}${c.reason ? '/' + c.reason : ''}`);
}

// ---- T4: perft ----
console.log('=== T4 perft ===');
const t4 = load('t4_perft.json');
for (const c of t4.cases) {
  const pos = E.parseSfen('lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1');
  const t0 = Date.now();
  const n = E.perft(pos, c.depth);
  const ms = Date.now() - t0;
  check(c.id, `depth=${c.depth}`, n === c.expected, `結果=${n} 期待=${c.expected}`);
  console.log(`     時間: ${ms}ms`);
}

// ---- T5: 合法手列挙 ----
console.log('=== T5 合法手列挙 ===');
for (const c of load('t5_legalmoves.json').cases) {
  const pos = E.parseSfen(c.sfen);
  const usis = E.generateLegalMoves(pos).map(E.moveToUsi);
  if (c.mode === 'set') {
    check(c.id, c.name, sortedEq(usis, c.expected),
      `結果(${usis.length})=${[...usis].sort().join(',')} 期待(${c.expected.length})=${[...c.expected].sort().join(',')}`);
  } else {
    check(c.id, c.name, usis.length === c.expected, `結果=${usis.length}手 期待=${c.expected}手`);
  }
}

// ---- T6: 1手詰 ----
console.log('=== T6 1手詰判定 ===');
let tsumeMs = [];
for (const c of load('t6_tsume1.json').cases) {
  const pos = E.parseSfen(c.sfen);
  const t0 = Date.now();
  const mates = E.findAllMates(pos);
  tsumeMs.push(Date.now() - t0);
  check(c.id, c.name, sortedEq(mates, c.expectedMates),
    `結果=[${[...mates].sort().join(',')}] 期待=[${[...c.expectedMates].sort().join(',')}]`);
}
console.log(`  findAllMates 時間: 最大${Math.max(...tsumeMs)}ms / 平均${(tsumeMs.reduce((a, b) => a + b, 0) / tsumeMs.length).toFixed(1)}ms`);

// ---- T7: 3手詰 ----
console.log('=== T7 3手詰判定 ===');
let t7Ms = [];
for (const c of load('t7_tsume3.json').cases) {
  const pos = E.parseSfen(c.sfen);
  const t0 = Date.now();
  const got = E.findAllMateMoves(pos, c.n);
  t7Ms.push(Date.now() - t0);
  let ok = sortedEq(got, c.firstMoves) && (got.length > 0) === c.expectMate;
  let detail = `結果=[${[...got].sort().join(',')}] 期待=[${[...c.firstMoves].sort().join(',')}]`;
  for (const w of (c.wrongMoveSamples || [])) {
    if (E.isCorrectMateMove(pos, w, c.n)) { ok = false; detail += ` / 誤答${w}がtrue`; }
  }
  if (c.firstMoves.length && !c.firstMoves.every((m) => E.isCorrectMateMove(pos, m, c.n))) {
    ok = false; detail += ' / 正解初手がfalse';
  }
  check(c.id, c.name, ok, detail);
}
console.log(`  findAllMateMoves(3) 時間: 最大${Math.max(...t7Ms)}ms / 平均${(t7Ms.reduce((a, b) => a + b, 0) / t7Ms.length).toFixed(1)}ms`);

// ---- T8: 将棋SubjectModule判定層 ----
console.log('=== T8 SubjectModule判定層 ===');
{
  const S = require('./subject.js');
  const t8 = load('t8_subject.json');
  for (const c of t8.judgeCases) {
    const r = S.judge({ payload: Object.assign({ sfen: c.sfen }, c.payload) }, c.answer);
    let ok = r.correct === c.expect.correct;
    let detail = `correct=${r.correct} msg=${r.message || 'なし'}`;
    if (c.expect.messageIncludes && !(r.message || '').includes(c.expect.messageIncludes)) ok = false;
    if (c.expect.noMessage && r.message) ok = false;
    check(c.id, c.name, ok, detail);
  }
  for (const c of t8.answerTextCases) {
    const got = S.usiToJapanese(c.sfen, c.usi);
    check(c.id, `表記変換 ${c.usi}`, got === c.expect, `結果=${got} 期待=${c.expect}`);
  }
  // 収録6問の機械検証(規約§2)
  const pv = t8.problemSetValidation;
  const pset = JSON.parse(fs.readFileSync(path.join(__dirname, pv.file), 'utf8'));
  for (const p of pset.problems) {
    const pos = E.parseSfen(p.payload.sfen);
    if (p.payload.judge === 'mate') {
      const mates = E.findAllMateMoves(pos, p.payload.mateN);
      const want = pv.expectedMates[p.id] || [];
      check(`${pv.id}:${p.id}`, '収録検証(詰み手一致)', sortedEq(mates, want),
        `結果=[${mates.sort().join(',')}] 期待=[${want.sort().join(',')}]`);
    } else {
      const bad = [];
      for (const m of p.payload.correctMoves) if (!E.validateMove(pos, m).legal) bad.push(m);
      for (const w of p.payload.wrongMoves || []) if (!E.validateMove(pos, w.move).legal) bad.push(w.move);
      check(`${pv.id}:${p.id}`, '収録検証(手の合法性)', bad.length === 0, bad.length ? `非合法: ${bad.join(',')}` : '');
    }
  }
}

// ---- 集計 ----
console.log('\n=== 集計 ===');
console.log(`PASS ${pass} / FAIL ${fail} / 計 ${pass + fail}`);
if (failures.length) {
  console.log('\n--- 不一致の詳細(README §5の手順で突合すること) ---');
  for (const f of failures) console.log(`${f.id} ${f.name}\n   ${f.detail}`);
  process.exit(1);
}
