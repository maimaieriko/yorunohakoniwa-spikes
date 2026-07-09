/* ============================================================
   ヨルノハコニワ Spike 2 - テストランナー (runner.js)
   構成:
   [A] 判定コア runAllSuites … DOM非依存。Nodeスモークテストと実機UIが
       完全に同一のコードを実行する(判定ロジックの二重実装バグを排除)
   [B] ブラウザ配線 … document が存在する環境でのみ動作
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.SpikeRunner = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const BUILD_JS = 's3-002'; // デプロイ時に必ず更新(index.html / style.css / engine.js と揃える)
  const HIRATE = 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1';
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const sortedEq = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  /* ---------------- [A] 判定コア ---------------- */
  // E: エンジン / tests: {t1..t6のJSONオブジェクト} / cb: UI通知コールバック(省略可)
  async function runAllSuites(E, tests, cb) {
    cb = cb || {};
    const res = { pass: 0, fail: 0, failures: [], suites: {}, perft: [], tsumeMs: [] };

    function begin(suite, label, total) {
      res.suites[suite] = { label, pass: 0, fail: 0, total };
      if (cb.suiteStart) cb.suiteStart(suite, label, total);
    }
    function rec(suite, id, name, ok, detail) {
      const s = res.suites[suite];
      if (ok) { res.pass++; s.pass++; } else { res.fail++; s.fail++; res.failures.push({ suite, id, name, detail }); }
      if (cb.caseResult) cb.caseResult(suite, id, name, ok, detail);
    }
    function done(suite) { if (cb.suiteDone) cb.suiteDone(suite, res.suites[suite]); }

    // ---- T1 SFEN ----
    begin('T1', 'SFEN読み書き', tests.t1.cases.length);
    for (const c of tests.t1.cases) {
      if (c.mode === 'roundtrip' || c.mode === 'normalize') {
        const want = c.mode === 'roundtrip' ? c.input : c.expectedOutput;
        try { const out = E.toSfen(E.parseSfen(c.input)); rec('T1', c.id, c.name, out === want, `出力=${out} 期待=${want}`); }
        catch (e) { rec('T1', c.id, c.name, false, `例外: ${e.message}`); }
      } else {
        let rejected = false;
        try { E.parseSfen(c.input); } catch (e) { rejected = true; }
        rec('T1', c.id, c.name, rejected, rejected ? '' : '不正入力が拒否されなかった');
      }
    }
    done('T1'); await tick();

    // ---- T2 USI ----
    begin('T2', 'USI着手表記', tests.t2.cases.length);
    for (const c of tests.t2.cases) {
      if (c.mode === 'roundtrip') {
        try { const out = E.moveToUsi(E.parseMove(c.input)); rec('T2', c.id, c.name, out === c.input, `出力=${out}`); }
        catch (e) { rec('T2', c.id, c.name, false, `例外: ${e.message}`); }
      } else {
        let rejected = false;
        try { E.parseMove(c.input); } catch (e) { rejected = true; }
        rec('T2', c.id, c.name, rejected, rejected ? '' : '不正表記が拒否されなかった');
      }
    }
    done('T2'); await tick();

    // ---- T3 反則50件 ----
    begin('T3', '反則判定', tests.t3.cases.length);
    let i = 0;
    for (const c of tests.t3.cases) {
      const r = E.validateMove(E.parseSfen(c.sfen), c.move);
      const ok = (c.expect === 'legal') ? r.legal === true : (r.legal === false && r.reason === c.reason);
      rec('T3', c.id, c.name, ok, `結果=${r.legal ? 'legal' : 'illegal/' + r.reason} 期待=${c.expect}${c.reason ? '/' + c.reason : ''}`);
      if (++i % 20 === 0) await tick();
    }
    done('T3'); await tick();

    // ---- T4 perft(4件とも実行。深さ4は数秒かかる旨をUIへ通知) ----
    begin('T4', 'perft', tests.t4.cases.length);
    for (const c of tests.t4.cases) {
      if (cb.perftStart) cb.perftStart(c.depth);
      await tick();
      const t0 = now();
      const n = E.perft(E.parseSfen(HIRATE), c.depth);
      const ms = Math.round(now() - t0);
      res.perft.push({ id: c.id, depth: c.depth, n, ms, ok: n === c.expected });
      rec('T4', c.id, `depth=${c.depth} (${ms}ms)`, n === c.expected, `結果=${n} 期待=${c.expected}`);
      if (cb.perftDone) cb.perftDone(c.depth, n, ms, n === c.expected);
    }
    done('T4'); await tick();

    // ---- T5 合法手列挙 ----
    begin('T5', '合法手列挙', tests.t5.cases.length);
    for (const c of tests.t5.cases) {
      const usis = E.generateLegalMoves(E.parseSfen(c.sfen)).map(E.moveToUsi);
      const ok = c.mode === 'set' ? sortedEq(usis, c.expected) : usis.length === c.expected;
      rec('T5', c.id, c.name, ok, c.mode === 'set'
        ? `結果(${usis.length})=${[...usis].sort().join(',')} 期待(${c.expected.length})`
        : `結果=${usis.length}手 期待=${c.expected}手`);
    }
    done('T5'); await tick();

    // ---- T6 1手詰(時間計測つき) ----
    begin('T6', '1手詰判定', tests.t6.cases.length);
    for (const c of tests.t6.cases) {
      const pos = E.parseSfen(c.sfen);
      const t0 = now();
      const mates = E.findAllMates(pos);
      const ms = now() - t0;
      res.tsumeMs.push(ms);
      rec('T6', c.id, `${c.name} (${ms.toFixed(1)}ms)`, sortedEq(mates, c.expectedMates),
        `結果=[${[...mates].sort().join(',')}] 期待=[${[...c.expectedMates].sort().join(',')}]`);
    }
    done('T6');

    await tick();

    // ---- T7 3手詰(時間計測つき) ----
    begin('T7', '3手詰判定', tests.t7.cases.length);
    res.tsume3Ms = [];
    for (const c of tests.t7.cases) {
      const pos = E.parseSfen(c.sfen);
      const t0 = now();
      const got = E.findAllMateMoves(pos, c.n);
      const ms = now() - t0;
      res.tsume3Ms.push(ms);
      let ok = sortedEq(got, c.firstMoves) && (got.length > 0) === c.expectMate;
      let detail = `結果=[${[...got].sort().join(',')}] 期待=[${[...c.firstMoves].sort().join(',')}]`;
      for (const w of (c.wrongMoveSamples || [])) {
        if (E.isCorrectMateMove(pos, w, c.n)) { ok = false; detail += ` / 誤答${w}がtrue`; }
      }
      if (c.firstMoves.length && !c.firstMoves.every((m) => E.isCorrectMateMove(pos, m, c.n))) {
        ok = false; detail += ' / 正解初手がfalse';
      }
      rec('T7', c.id, `${c.name} (${ms.toFixed(1)}ms)`, ok, detail);
      await tick();
    }
    done('T7');
    res.tsume3Max = Math.max(...res.tsume3Ms);
    res.tsume3Avg = res.tsume3Ms.reduce((a, b) => a + b, 0) / res.tsume3Ms.length;

    res.tsumeMax = Math.max(...res.tsumeMs);
    res.tsumeAvg = res.tsumeMs.reduce((a, b) => a + b, 0) / res.tsumeMs.length;
    return res;
  }

  return { BUILD_JS, runAllSuites };
});

/* ---------------- [B] ブラウザ配線 ---------------- */
if (typeof document !== 'undefined') (function () {
  'use strict';
  const R = (typeof self !== 'undefined' ? self : window).SpikeRunner;
  const E = (typeof self !== 'undefined' ? self : window).ShogiEngine;

  // --- 画面内ログ ---
  const logEl = document.getElementById('log');
  const logLines = [];
  function log(msg, cls) {
    const t = new Date();
    const ts = `${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}`;
    const line = `[${ts}] ${msg}`;
    logLines.push(line);
    const div = document.createElement('div');
    if (cls) div.className = cls;
    div.textContent = line;
    logEl.appendChild(div);
    while (logEl.childNodes.length > 500) logEl.removeChild(logEl.firstChild);
    logEl.scrollTop = logEl.scrollHeight;
  }
  window.addEventListener('error', (e) => log(`JSエラー: ${e.message} (${e.filename}:${e.lineno})`, 'warn'));

  // --- ビルドID照合(HTML / CSS / runner / engine の4値) ---
  // 注意: deferスクリプトの実行時点でCSSの読込が終わっていないことがあり(iOS Safariの初回
  // アクセスで実際に発生)、その瞬間に1回だけ照合すると「読込失敗」と誤検出する。
  // 対策: CSSが読めるまで最大5秒リトライし、確定してから警告の要否を判断する。
  function readCssBuild() {
    try {
      const c = getComputedStyle(document.getElementById('css-build-probe'), '::after').content.replace(/["']/g, '');
      if (c && c !== 'none' && c !== 'normal') return c;
    } catch (_) {}
    return null;
  }
  function checkBuilds(quiet) {
    const htmlB = window.BUILD_HTML || '不明';
    const css = readCssBuild();
    const cssB = css || '読込待ち…';
    const engB = (E && E.BUILD) || '読込失敗';
    document.getElementById('build-html').textContent = htmlB;
    document.getElementById('build-css').textContent = cssB;
    document.getElementById('build-js').textContent = R.BUILD_JS;
    document.getElementById('build-engine').textContent = engB;
    const same = css !== null && htmlB === css && css === R.BUILD_JS && R.BUILD_JS === engB;
    // CSSがまだ読めていない段階では警告を出さない(誤検出防止)。確定後のみ判定
    document.getElementById('cache-warning').classList.toggle('hidden', same || css === null);
    if (!quiet) log(`ビルド照合 HTML=${htmlB} CSS=${cssB} JS=${R.BUILD_JS} ENGINE=${engB} → ${same ? '一致' : css === null ? 'CSS読込待ち' : '不一致!'}`, same ? 'ok' : 'warn');
    return { same, cssPending: css === null };
  }
  function startupBuildCheck(attempt) {
    attempt = attempt || 0;
    const r = checkBuilds(attempt > 0); // 初回とリトライ確定時のみログ
    if (r.cssPending && attempt < 20) { setTimeout(() => startupBuildCheck(attempt + 1), 250); return; }
    if (attempt > 0) checkBuilds(false); // 確定結果をログに残す
    if (r.cssPending) log('CSSビルドIDを5秒以内に読めませんでした。画面にスタイルが適用されている場合は照合側の問題です(ログを報告してください)', 'warn');
  }
  window.addEventListener('load', () => checkBuilds(true)); // 全読込完了時にも表示を更新

  // --- スイートカード ---
  const SUITES = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const cards = {};
  function buildCards() {
    const wrap = document.getElementById('suites');
    for (const s of SUITES) {
      const d = document.createElement('div');
      d.className = 'card';
      d.innerHTML = `<div class="card-name">${s}</div><div class="card-status">待機</div>`;
      wrap.appendChild(d);
      cards[s] = d;
    }
  }
  function setCard(s, text, state) {
    cards[s].querySelector('.card-status').textContent = text;
    cards[s].classList.remove('running', 'pass', 'fail');
    if (state) cards[s].classList.add(state);
  }

  // --- テストデータ読込(キャッシュ回避+フォールバックつき) ---
  // 方針: tests/<file> を優先し、404なら同階層 <file> を試す。
  // 実際にfetchした絶対URLと結果を必ずログに出す(GitHub Pagesでの配置トラブルの切り分け用)。
  async function fetchTestFile(fname) {
    const tried = [];
    for (const rel of [`tests/${fname}`, fname]) {
      const url = new URL(`${rel}?v=${R.BUILD_JS}`, location.href).href;
      tried.push(url);
      log(`取得試行: ${url}`);
      try {
        const r = await fetch(url, { cache: 'no-store' });
        if (r.ok) { log(`取得成功: ${url}`, 'ok'); return await r.json(); }
        log(`HTTP ${r.status}: ${url}`, 'warn'); // 404等 → 次の候補へフォールバック
      } catch (e) {
        log(`ネットワークエラー: ${url} (${e.message})`, 'warn');
      }
    }
    throw new Error(`${fname} を取得できません。試行URL: ${tried.join(' / ')}`);
  }
  async function loadTests() {
    const files = { t1: 't1_sfen.json', t2: 't2_usi.json', t3: 't3_fouls.json', t4: 't4_perft.json', t5: 't5_legalmoves.json', t6: 't6_tsume1.json', t7: 't7_tsume3.json' };
    const tests = {};
    for (const key of Object.keys(files)) tests[key] = await fetchTestFile(files[key]);
    return tests;
  }

  // --- 実行 ---
  let running = false;
  async function runAll() {
    if (running) return;
    running = true;
    const btn = document.getElementById('run-all');
    btn.disabled = true; btn.textContent = '実行中…';
    document.getElementById('summary').textContent = '';
    try {
      checkBuilds(false);
      log('テストデータ読込中…');
      const tests = await loadTests();
      log('全106件を実行します(perft深さ4で数秒かかります)');
      const res = await R.runAllSuites(E, tests, {
        suiteStart: (s, label, total) => setCard(s, `${label} 実行中…`, 'running'),
        caseResult: (s, id, name, ok, detail) => { if (!ok) log(`NG ${id} ${name} — ${detail}`, 'warn'); },
        suiteDone: (s, r) => setCard(s, `${r.pass}/${r.total} ${r.fail ? 'NG' : 'OK'}`, r.fail ? 'fail' : 'pass'),
        perftStart: (d) => log(`perft 深さ${d} 実行中…${d >= 4 ? '(数秒かかります)' : ''}`),
        perftDone: (d, n, ms, ok) => log(`perft(${d}) = ${n} (${ms}ms) ${ok ? 'OK' : 'NG!'}`, ok ? 'ok' : 'warn'),
      });
      const sum = `合計 PASS ${res.pass} / FAIL ${res.fail} (106件)`;
      document.getElementById('summary').textContent = sum + (res.fail ? ' — ログのNG行を確認' : ' — 全通過!');
      document.getElementById('summary').className = res.fail ? 'summary fail' : 'summary pass';
      log(sum, res.fail ? 'warn' : 'ok');
      log(`perft実測: ${res.perft.map((p) => `d${p.depth}=${p.ms}ms`).join(' / ')}`, 'ok');
      log(`findAllMates(1手詰): 最大${res.tsumeMax.toFixed(1)}ms / 平均${res.tsumeAvg.toFixed(1)}ms (目標50ms以下)`, res.tsumeMax <= 50 ? 'ok' : 'warn');
      log(`findAllMateMoves(3手詰): 最大${res.tsume3Max.toFixed(1)}ms / 平均${res.tsume3Avg.toFixed(1)}ms (目標200ms以下)`, res.tsume3Max <= 200 ? 'ok' : 'warn');
    } catch (e) {
      log(`実行エラー: ${e.message}`, 'warn');
      document.getElementById('summary').textContent = '実行エラー(ログ参照)';
    }
    btn.disabled = false; btn.textContent = '全テスト実行(94件)';
    running = false;
  }

  // --- 起動 ---
  document.getElementById('run-all').addEventListener('click', runAll);
  document.getElementById('btn-copy-log').addEventListener('click', async () => {
    const text = [
      `Spike2 実機テストログ (HTML=${window.BUILD_HTML} JS=${R.BUILD_JS} ENGINE=${E && E.BUILD})`,
      `UA: ${navigator.userAgent}`,
      `画面: ${window.innerWidth}x${window.innerHeight} dpr=${devicePixelRatio}`,
      ...logLines,
    ].join('\n');
    try { await navigator.clipboard.writeText(text); log('ログをコピーしました', 'ok'); }
    catch (_) {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove();
      log('ログをコピーしました(fallback)', 'ok');
    }
  });
  document.getElementById('btn-toggle-log').addEventListener('click', (e) => {
    const c = logEl.classList.toggle('collapsed');
    e.target.textContent = c ? 'ひらく' : 'たたむ';
  });

  buildCards();
  startupBuildCheck();
  log(`UA: ${navigator.userAgent}`);
  log('準備完了。「全テスト実行」を押してください', 'ok');
})();
