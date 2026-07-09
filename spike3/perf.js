/* ヨルノハコニワ Spike 3 / V4 描画性能検証 (perf.js) */
(function () {
  'use strict';
  const BUILD_JS = 's3-002';

  // ---- ログ・ビルド照合(V6と同方式) ----
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
    return { pending: css === null };
  }
  (function boot(a) {
    const r = checkBuilds(a > 0);
    if (r.pending && a < 20) setTimeout(() => boot(a + 1), 250);
    else if (a > 0) checkBuilds(false);
  })(0);

  // ---- キャンバス準備(dpr対応) ----
  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(devicePixelRatio || 1, 2);
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  window.addEventListener('resize', resize);

  // ---- タイルアトラス(夜の野原4種をオフスクリーン生成) ----
  const TILE = 32;
  const atlas = document.createElement('canvas');
  atlas.width = TILE * 4; atlas.height = TILE;
  (function buildAtlas() {
    const a = atlas.getContext('2d');
    const base = ['#1d2b45', '#20304d', '#22263f', '#263252'];
    for (let i = 0; i < 4; i++) {
      a.fillStyle = base[i];
      a.fillRect(i * TILE, 0, TILE, TILE);
      a.fillStyle = 'rgba(127,227,255,0.10)';
      for (let d = 0; d < 5; d++) {
        a.fillRect(i * TILE + ((i * 13 + d * 7) % TILE), (d * 11 + i * 5) % TILE, 2, 2); // 草・光の点
      }
      a.strokeStyle = 'rgba(0,0,0,0.25)';
      a.strokeRect(i * TILE + 0.5, 0.5, TILE - 1, TILE - 1);
    }
  })();
  const tileAt = (tx, ty) => ((tx * 7 + ty * 13 + ((tx * ty) % 5)) % 4 + 4) % 4;

  // ---- NPC(おばけ風スプライト10体) ----
  const NPCS = Array.from({ length: 10 }, (_, i) => ({
    bx: 80 + i * 90, by: 60 + (i % 5) * 45, ph: i * 1.3, hue: (i * 36) % 360,
  }));
  function drawNpc(n, t, camX, W, H) {
    const x = ((n.bx - camX * (0.6 + (n.ph % 0.4))) % (W + 120) + W + 120) % (W + 120) - 60;
    const y = n.by % (H - 60) + 20 + Math.sin(t * 0.002 + n.ph) * 8;
    ctx.fillStyle = `hsla(${n.hue},60%,75%,0.95)`;
    ctx.beginPath();
    ctx.arc(x, y, 14, Math.PI, 0);
    ctx.lineTo(x + 14, y + 14);
    for (let k = 2; k >= -2; k--) ctx.lineTo(x + k * 7, y + 14 + (k % 2 ? 5 : 0));
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#141329';
    ctx.beginPath(); ctx.arc(x - 5, y - 2, 2.4, 0, 7); ctx.arc(x + 5, y - 2, 2.4, 0, 7); ctx.fill();
  }

  // ---- パーティクル(ひかりの粒) ----
  let particles = [];
  function setParticleCount(n) {
    while (particles.length < n) {
      particles.push({ x: Math.random(), y: Math.random(), vx: (Math.random() - 0.5) * 0.04, vy: -0.02 - Math.random() * 0.05, life: Math.random() });
    }
    particles.length = n;
  }
  function drawParticles(dt, W, H) {
    ctx.globalCompositeOperation = 'lighter';
    for (const p of particles) {
      p.x += p.vx * dt * 0.06; p.y += p.vy * dt * 0.06; p.life -= dt * 0.0004;
      if (p.life <= 0 || p.y < -0.05) { p.x = Math.random(); p.y = 1.05; p.life = 1; }
      const px = ((p.x % 1) + 1) % 1 * W, py = p.y * H;
      ctx.fillStyle = `rgba(127,227,255,${0.35 * p.life})`;
      ctx.beginPath(); ctx.arc(px, py, 3.2, 0, 7); ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${0.5 * p.life})`;
      ctx.beginPath(); ctx.arc(px, py, 1.2, 0, 7); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---- FPS計測 ----
  let running = false, rafId = 0, startT = 0, lastT = 0;
  let secFrames = 0, secStart = 0, fpsBuckets = [], snapshotAt = 15000;
  const $ = (id) => document.getElementById(id);

  function frame(t) {
    if (!running) return;
    if (!startT) { startT = t; lastT = t; secStart = t; }
    const dt = Math.min(t - lastT, 100);
    lastT = t;
    const W = canvas.width, H = canvas.height;

    // 描画: タイルスクロール
    const camX = (t - startT) * 0.12 * dpr;
    const cols = Math.ceil(W / (TILE * dpr)) + 2, rows = Math.ceil(H / (TILE * dpr)) + 1;
    const offTx = Math.floor(camX / (TILE * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let ty = 0; ty < rows; ty++) {
      for (let cx = 0; cx < cols; cx++) {
        const tx = offTx + cx;
        ctx.drawImage(atlas, tileAt(tx, ty) * TILE, 0, TILE, TILE,
          cx * TILE - (camX / dpr) % TILE, ty * TILE, TILE, TILE);
      }
    }
    for (const n of NPCS) drawNpc(n, t, camX / dpr, W / dpr, H / dpr);
    drawParticles(dt, W / dpr, H / dpr);

    // FPS集計(1秒バケット)
    secFrames++;
    if (t - secStart >= 1000) {
      const fps = secFrames * 1000 / (t - secStart);
      fpsBuckets.push(fps);
      secFrames = 0; secStart = t;
      $('fps-now').textContent = fps.toFixed(0);
      $('fps-min').textContent = Math.min(...fpsBuckets).toFixed(0);
      $('fps-avg').textContent = (fpsBuckets.reduce((a, b) => a + b, 0) / fpsBuckets.length).toFixed(0);
    }
    const el = t - startT;
    $('elapsed').textContent = `${Math.floor(el / 60000)}:${String(Math.floor(el / 1000) % 60).padStart(2, '0')}`;
    if (el >= snapshotAt) {
      const min = fpsBuckets.length ? Math.min(...fpsBuckets) : 0;
      const avg = fpsBuckets.length ? fpsBuckets.reduce((a, b) => a + b, 0) / fpsBuckets.length : 0;
      log(`${Math.round(el / 1000)}秒: 平均${avg.toFixed(1)}fps 最小${min.toFixed(1)}fps 粒${particles.length}`);
      snapshotAt += 15000;
    }
    if (el >= 180000) {
      stop();
      const min = Math.min(...fpsBuckets), avg = fpsBuckets.reduce((a, b) => a + b, 0) / fpsBuckets.length;
      log(`=== 3分完走: 平均${avg.toFixed(1)}fps / 最小${min.toFixed(1)}fps / 粒${particles.length} → ${min >= 55 ? '合格(55以上)' : '基準未達'} ===`, min >= 55 ? 'ok' : 'warn');
      return;
    }
    rafId = requestAnimationFrame(frame);
  }
  function start() {
    if (running) return;
    resize();
    setParticleCount(Number($('pcount').value));
    running = true; startT = 0; fpsBuckets = []; snapshotAt = 15000;
    log(`計測開始: 粒${particles.length} dpr=${dpr} canvas=${canvas.width}x${canvas.height}`, 'ok');
    rafId = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(rafId);
  }
  $('btn-start').addEventListener('click', start);
  $('btn-stop').addEventListener('click', () => { stop(); log('停止しました'); });
  $('pcount').addEventListener('input', (e) => {
    $('pcount-label').textContent = e.target.value;
    if (running) setParticleCount(Number(e.target.value));
  });

  // ---- ログコピー/たたむ ----
  document.getElementById('btn-copy-log').addEventListener('click', async () => {
    const text = [`Spike3 V4ログ (HTML=${window.BUILD_HTML} JS=${BUILD_JS})`, `UA: ${navigator.userAgent}`,
      `dpr=${devicePixelRatio}`, ...logLines].join('\n');
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

  resize();
  log(`UA: ${navigator.userAgent}`);
  log('準備完了。「計測開始」を押してください(低電力モードOFF/ONの両方で計測推奨)', 'ok');
})();
