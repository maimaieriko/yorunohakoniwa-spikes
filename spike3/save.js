/* ヨルノハコニワ Spike 3 / V6 セーブ永続化検証 (save.js) */
(function () {
  'use strict';
  const BUILD_JS = 's3-002';

  // ---- ログ ----
  const logEl = document.getElementById('log');
  const logLines = [];
  function log(msg, cls) {
    const t = new Date();
    const line = `[${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}] ${msg}`;
    logLines.push(line);
    const d = document.createElement('div');
    if (cls) d.className = cls;
    d.textContent = line;
    logEl.appendChild(d);
    logEl.scrollTop = logEl.scrollHeight;
  }
  window.addEventListener('error', (e) => log(`JSエラー: ${e.message}`, 'warn'));
  function kv(id, html) { document.getElementById(id).innerHTML = html; }
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));

  // ---- ビルド照合(リトライ方式・s2-002方式を継承。CSS/HTML/JSの3値) ----
  function readCss() {
    try {
      const c = getComputedStyle(document.getElementById('css-build-probe'), '::after').content.replace(/["']/g, '');
      if (c && c !== 'none' && c !== 'normal') return c;
    } catch (_) {}
    return null;
  }
  function checkBuilds(quiet) {
    const h = window.BUILD_HTML || '不明', css = readCss();
    document.getElementById('build-html').textContent = h;
    document.getElementById('build-css').textContent = css || '読込待ち…';
    document.getElementById('build-js').textContent = BUILD_JS;
    const same = css !== null && h === css && css === BUILD_JS;
    document.getElementById('cache-warning').classList.toggle('hidden', same || css === null);
    if (!quiet) log(`ビルド照合 HTML=${h} CSS=${css || '待ち'} JS=${BUILD_JS} → ${same ? '一致' : 'CSS待ち/不一致'}`, same ? 'ok' : 'warn');
    return { same, pending: css === null };
  }
  (function boot(attempt) {
    const r = checkBuilds(attempt > 0);
    if (r.pending && attempt < 20) return setTimeout(() => boot(attempt + 1), 250);
    if (attempt > 0) checkBuilds(false);
  })(0);

  // ---- CRC32 ----
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(str) {
    const bytes = new TextEncoder().encode(str);
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return ((c ^ 0xFFFFFFFF) >>> 0).toString(16).padStart(8, '0');
  }
  const byteLen = (s) => new TextEncoder().encode(s).length;
  const fmtKB = (b) => (b / 1024).toFixed(1) + 'KB';

  // ---- ① 識別ID(PWA分離確認) ----
  function initIdentity() {
    try {
      let id = localStorage.getItem('spike3-identity');
      if (!id) {
        id = JSON.stringify({ id: Math.random().toString(36).slice(2, 8).toUpperCase(), created: new Date().toISOString() });
        localStorage.setItem('spike3-identity', id);
        log('新しい保存領域IDを発行しました', 'ok');
      }
      const obj = JSON.parse(id);
      const prevWrite = localStorage.getItem('spike3-lastWrite');
      const visits = (Number(localStorage.getItem('spike3-visits')) || 0) + 1;
      localStorage.setItem('spike3-visits', String(visits));
      localStorage.setItem('spike3-lastWrite', new Date().toISOString());
      document.getElementById('identity').textContent = obj.id;
      const gap = prevWrite ? ((Date.now() - new Date(prevWrite).getTime()) / 86400000).toFixed(2) : '-';
      kv('identity-meta',
        `発行日: ${esc(obj.created.slice(0, 10))} / 訪問回数: ${visits}回<br>` +
        `前回書込からの経過: <b>${gap}日</b> (7日規則の長期観察マーカー)`);
      log(`保存領域ID=${obj.id} 訪問${visits}回目 前回から${gap}日`);
    } catch (e) {
      document.getElementById('identity').textContent = '書込不可';
      kv('identity-meta', `<span class="warn">localStorageに書き込めません: ${esc(e.name)}(プライベートブラウズ等)</span>`);
      log(`識別ID書込失敗: ${e.name} ${e.message}`, 'warn');
    }
  }

  // ---- ② 容量テスト ----
  document.getElementById('btn-capacity').addEventListener('click', () => {
    const sizes = [10, 100, 500, 1024, 5120]; // KB
    const rows = [];
    for (const kb of sizes) {
      const key = 'spike3-cap-test';
      const value = 'A'.repeat(kb * 1024);
      try {
        const t0 = performance.now();
        localStorage.setItem(key, value);
        const w = performance.now() - t0;
        const t1 = performance.now();
        const back = localStorage.getItem(key);
        const r = performance.now() - t1;
        const ok = back && back.length === value.length;
        rows.push(`${kb >= 1024 ? (kb / 1024) + 'MB' : kb + 'KB'}: 書込${w.toFixed(1)}ms / 読出${r.toFixed(1)}ms ${ok ? 'OK' : '内容不一致!'}`);
        log(`容量 ${kb}KB 書込${w.toFixed(1)}ms 読出${r.toFixed(1)}ms`, ok ? 'ok' : 'warn');
      } catch (e) {
        rows.push(`${kb >= 1024 ? (kb / 1024) + 'MB' : kb + 'KB'}: <b class="warn">失敗 ${esc(e.name)}</b>`);
        log(`容量 ${kb}KB 失敗: ${e.name}`, 'warn');
      } finally {
        try { localStorage.removeItem('spike3-cap-test'); } catch (_) {}
      }
    }
    kv('capacity-result', rows.join('<br>'));
  });

  // ---- ③ 5000問モックセーブ ----
  let currentExport = null;
  function buildMockSave() {
    const N = 5000;
    // 圧縮表現: 問題成績を4本の数値配列(挑戦数/正解数/ヒント使用/最終挑戦日)で持つ
    const attempts = [], corrects = [], hints = [], lastDay = [];
    let seed = 12345;
    const rnd = (m) => { seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF; return seed % m; };
    for (let i = 0; i < N; i++) {
      const a = rnd(12); attempts.push(a);
      corrects.push(a ? rnd(a + 1) : 0);
      hints.push(rnd(3));
      lastDay.push(a ? rnd(365) : 0);
    }
    const payload = {
      schemaVersion: 1,
      profile: { name: 'テストプレイヤー', kana: true },
      progress: { level: '5k', area: 7, kakera: 41, flags: Array.from({ length: 64 }, (_, i) => i % 3 === 0) },
      rpg: { lv: 23, exp: 15230, hp: 84, gold: 4120, items: { 'potion': 5, 'lamp': 2 }, skins: [1, 3, 7] },
      problems: { count: N, attempts, corrects, hints, lastDay },
      review: Array.from({ length: 120 }, (_, i) => [rnd(N), rnd(30)]),
      stats: { playMinutes: 3120, exploreMs: 61, shogiMs: 39 },
    };
    return payload;
  }
  function wrapSave(payload) {
    const body = JSON.stringify(payload);
    return JSON.stringify({ app: 'yorunohakoniwa', schemaVersion: 1, savedAt: new Date().toISOString(), crc32: crc32(body), body });
  }
  document.getElementById('btn-mock').addEventListener('click', () => {
    const payload = buildMockSave();
    currentExport = wrapSave(payload);
    const bodyBytes = byteLen(JSON.stringify(payload));
    const total = byteLen(currentExport);
    try {
      const t0 = performance.now();
      localStorage.setItem('spike3-mock-save', currentExport);
      const ms = performance.now() - t0;
      kv('mock-result',
        `5000問成績込みペイロード: <b>${fmtKB(bodyBytes)}</b> / 書き出し全体: <b>${fmtKB(total)}</b><br>` +
        `目標500KB以下: <b class="${total <= 512000 ? 'ok' : 'warn'}">${total <= 512000 ? '達成' : '超過'}</b> / localStorage書込 ${ms.toFixed(1)}ms`);
      log(`モックセーブ生成 ${fmtKB(total)} 書込${ms.toFixed(1)}ms`, 'ok');
    } catch (e) {
      kv('mock-result', `<span class="warn">書込失敗: ${esc(e.name)}</span>(サイズ: ${fmtKB(total)})`);
      log(`モック書込失敗 ${e.name}`, 'warn');
    }
  });

  // ---- ④ 書き出し3方式 ----
  function needMock() {
    if (!currentExport) { log('先に③でモックセーブを生成してください', 'warn'); return true; }
    return false;
  }
  document.getElementById('btn-export-copy').addEventListener('click', async () => {
    if (needMock()) return;
    try {
      await navigator.clipboard.writeText(currentExport);
      kv('export-result', `A クリップボード: <b class="ok">成功</b> (${fmtKB(byteLen(currentExport))})`);
      log(`書き出しA(コピー) 成功 ${fmtKB(byteLen(currentExport))}`, 'ok');
    } catch (e) {
      kv('export-result', `A クリップボード: <b class="warn">失敗 ${esc(e.name)}</b>`);
      log(`書き出しA 失敗: ${e.name} ${e.message}`, 'warn');
    }
  });
  document.getElementById('btn-export-share').addEventListener('click', async () => {
    if (needMock()) return;
    try {
      const file = new File([currentExport], 'yorunohakoniwa-save.json', { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'ヨルノハコニワ セーブ' });
        log('書き出しB(共有・ファイル) 完了', 'ok');
      } else if (navigator.share) {
        await navigator.share({ title: 'ヨルノハコニワ セーブ', text: currentExport });
        log('書き出しB(共有・テキスト) 完了', 'ok');
      } else {
        throw new Error('Web Share API非対応');
      }
      kv('export-result', 'B 共有シート: <b class="ok">起動成功</b>(保存先の選択結果をログに記録してください)');
    } catch (e) {
      kv('export-result', `B 共有シート: <b class="warn">${esc(e.name)}: ${esc(e.message)}</b>(キャンセル含む)`);
      log(`書き出しB: ${e.name} ${e.message}`, 'warn');
    }
  });
  document.getElementById('btn-export-download').addEventListener('click', () => {
    if (needMock()) return;
    try {
      const blob = new Blob([currentExport], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'yorunohakoniwa-save.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      kv('export-result', 'C ダウンロード: <b class="ok">起動</b>(iOSでの実際の挙動=プレビュー/ファイル保存をログに記録してください)');
      log('書き出しC(ダウンロード) 起動', 'ok');
    } catch (e) {
      kv('export-result', `C ダウンロード: <b class="warn">失敗 ${esc(e.name)}</b>`);
      log(`書き出しC 失敗: ${e.name}`, 'warn');
    }
  });

  // ---- ⑤ 読み込み検証 ----
  document.getElementById('btn-import').addEventListener('click', () => {
    const text = document.getElementById('import-text').value.trim();
    if (!text) { kv('import-result', '<span class="warn">貼り付けが空です</span>'); return; }
    try {
      const obj = JSON.parse(text);
      if (obj.app !== 'yorunohakoniwa') throw new Error('アプリ識別子が違います');
      if (obj.schemaVersion !== 1) throw new Error(`未知のschemaVersion: ${obj.schemaVersion}`);
      const sum = crc32(obj.body);
      if (sum !== obj.crc32) throw new Error(`チェックサム不一致 (期待${obj.crc32} 実際${sum})`);
      JSON.parse(obj.body); // 中身も解析可能か
      const same = currentExport !== null && text === currentExport;
      kv('import-result',
        `<b class="ok">検証OK</b> チェックサム一致 (${fmtKB(byteLen(text))})<br>` +
        `直前の書き出しとの完全一致: <b class="${same ? 'ok' : ''}">${same ? 'はい(ラウンドトリップ成立)' : 'いいえ/比較対象なし'}</b>`);
      log(`読み込み検証OK ${fmtKB(byteLen(text))} ラウンドトリップ=${same}`, 'ok');
    } catch (e) {
      kv('import-result', `<b class="warn">検証NG: ${esc(e.message)}</b>(破損データは安全に拒否)`);
      log(`読み込み検証NG: ${e.message}`, 'warn');
    }
  });

  // ---- ⑥ ストレージ情報 ----
  document.getElementById('btn-storage-info').addEventListener('click', async () => {
    const rows = [];
    try {
      let total = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        total += byteLen(k) + byteLen(localStorage.getItem(k) || '');
      }
      rows.push(`localStorage使用中: ${fmtKB(total)} (${localStorage.length}キー)`);
    } catch (e) { rows.push(`localStorage参照不可: ${esc(e.name)}`); }
    if (navigator.storage && navigator.storage.estimate) {
      try {
        const est = await navigator.storage.estimate();
        rows.push(`storage.estimate: 使用 ${fmtKB(est.usage || 0)} / 上限 ${((est.quota || 0) / 1048576).toFixed(0)}MB`);
      } catch (e) { rows.push(`estimate失敗: ${esc(e.name)}`); }
    } else rows.push('storage.estimate: 非対応');
    if (navigator.storage && navigator.storage.persisted) {
      try { rows.push(`persisted(): ${await navigator.storage.persisted()}`); }
      catch (e) { rows.push(`persisted失敗: ${esc(e.name)}`); }
    } else rows.push('storage.persisted: 非対応');
    kv('storage-result', rows.join('<br>'));
    rows.forEach((r) => log(r.replace(/<[^>]+>/g, '')));
  });
  document.getElementById('btn-persist').addEventListener('click', async () => {
    if (!(navigator.storage && navigator.storage.persist)) { log('persist(): 非対応', 'warn'); return; }
    try { log(`persist()要求 → ${await navigator.storage.persist()}`, 'ok'); }
    catch (e) { log(`persist()失敗: ${e.name}`, 'warn'); }
  });

  // ---- ログコピー/たたむ ----
  document.getElementById('btn-copy-log').addEventListener('click', async () => {
    const text = [`Spike3 V6ログ (HTML=${window.BUILD_HTML} JS=${BUILD_JS})`, `UA: ${navigator.userAgent}`,
      `standalone(ホーム画面起動)=${window.navigator.standalone === true}`, ...logLines].join('\n');
    try { await navigator.clipboard.writeText(text); log('ログをコピーしました', 'ok'); }
    catch (_) {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove(); log('ログをコピーしました(fallback)', 'ok');
    }
  });
  document.getElementById('btn-toggle-log').addEventListener('click', (e) => {
    const c = logEl.classList.toggle('collapsed');
    e.target.textContent = c ? 'ひらく' : 'たたむ';
  });

  // ---- 起動 ----
  log(`UA: ${navigator.userAgent}`);
  log(`起動モード: ${window.navigator.standalone === true ? 'ホーム画面(PWA)' : 'Safariタブ'}`, 'ok');
  initIdentity();
})();
