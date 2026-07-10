/* ヨルノハコニワ P1-a 起動スクリプト(ログ・ビルド照合・教科選択) */
(function () {
  'use strict';
  const NS = (window.Hakoniwa = window.Hakoniwa || {});
  NS.BUILD_JS = 'p1-003';

  // ---- 画面内ログ ----
  const logEl = document.getElementById('log');
  const logLines = [];
  NS.log = function (msg, cls) {
    const t = new Date();
    const line = `[${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}] ${msg}`;
    logLines.push(line);
    const d = document.createElement('div');
    if (cls) d.className = cls;
    d.textContent = line;
    logEl.appendChild(d);
    logEl.scrollTop = logEl.scrollHeight;
  };
  window.addEventListener('error', (e) => NS.log(`JSエラー: ${e.message} (${e.filename}:${e.lineno})`, 'warn'));

  // ---- ビルド照合(HTML/CSS/JS/DATA-COREの4値・リトライ方式) ----
  function readCss() {
    try {
      const c = getComputedStyle(document.getElementById('css-build-probe'), '::after').content.replace(/["']/g, '');
      if (c && c !== 'none' && c !== 'normal') return c;
    } catch (_) {}
    return null;
  }
  function checkBuilds(quiet) {
    const h = window.BUILD_HTML || '不明', css = readCss();
    const core = (window.HakoniwaData && window.HakoniwaData.BUILD) || '読込失敗';
    document.getElementById('build-html').textContent = h;
    document.getElementById('build-css').textContent = css || '読込待ち…';
    document.getElementById('build-js').textContent = NS.BUILD_JS;
    document.getElementById('build-core').textContent = core;
    const same = css !== null && h === css && css === NS.BUILD_JS && NS.BUILD_JS === core;
    document.getElementById('cache-warning').classList.toggle('hidden', same || css === null);
    if (!quiet) NS.log(`ビルド照合 HTML=${h} CSS=${css || '待ち'} JS=${NS.BUILD_JS} CORE=${core} → ${same ? '一致' : 'CSS待ち/不一致'}`, same ? 'ok' : 'warn');
    return { pending: css === null };
  }
  (function bootCheck(a) {
    const r = checkBuilds(a > 0);
    if (r.pending && a < 20) setTimeout(() => bootCheck(a + 1), 250);
    else if (a > 0) checkBuilds(false);
  })(0);

  document.getElementById('btn-copy-log').addEventListener('click', async () => {
    const text = [`P1-aログ (HTML=${window.BUILD_HTML} JS=${NS.BUILD_JS})`, `UA: ${navigator.userAgent}`, ...logLines].join('\n');
    try { await navigator.clipboard.writeText(text); NS.log('ログをコピーしました', 'ok'); }
    catch (_) {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove(); NS.log('ログをコピーしました(fallback)', 'ok');
    }
  });
  document.getElementById('btn-toggle-log').addEventListener('click', (e) => {
    const c = logEl.classList.toggle('collapsed');
    e.target.textContent = c ? 'ひらく' : 'たたむ';
  });

  NS.log(`UA: ${navigator.userAgent}`);
  // P1-b: 教科レジストリ。SUBJECT_ID(HTML側)で切替 — コアは同じCore.bootを使う(分離の実証)
  const SUBJECTS = {
    'shogi': { mod: () => NS.SubjectShogi, file: 'problems_shogi.json' },
    'quiz-dummy': { mod: () => NS.SubjectQuizDummy, file: 'problems_dummy.json' },
  };
  const selId = window.SUBJECT_ID || 'shogi';
  const selected = SUBJECTS[selId];
  window.Hakoniwa.Core.boot(selected.mod(), selected.file)
    .catch((e) => NS.log(`起動失敗: ${e.message}`, 'warn'));
})();
