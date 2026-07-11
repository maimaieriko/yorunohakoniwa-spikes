/* HAKONIWA Engine - world.js / encounter.js 相当(ブラウザ専用) */
(function () {
  'use strict';
  const NS = (window.Hakoniwa = window.Hakoniwa || {});

  /* ---------------- World: タイルマップ・移動・接触 ---------------- */
  NS.World = function (canvas, mapData, defeatedIds) {
    defeatedIds = defeatedIds || [];
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const TILE = 40;
    const map = mapData; // {w,h,tiles:[row strings '0'=床 '1'=壁 '2'=光る床], spawn:{x,y}, enemies:[{id,x,y,problemId}]}
    const player = { x: map.spawn.x * TILE + TILE / 2, y: map.spawn.y * TILE + TILE / 2, speed: 150, dir: 0, anim: 0 };
    const enemies = map.enemies.map((e, idx) => ({ ...e, idx, px: e.x * TILE + TILE / 2, py: e.y * TILE + TILE / 2, ph: Math.random() * 6, alive: !defeatedIds.includes(e.id) }));
    let paused = false;

    function resize() {
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
    }
    window.addEventListener('resize', resize);
    resize();

    const tileAt = (tx, ty) => (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) ? '1' : map.tiles[ty][tx];
    const solid = (px, py) => tileAt(Math.floor(px / TILE), Math.floor(py / TILE)) === '1';

    function update(dt, input, onEncounter) {
      if (paused) return;
      const len = Math.hypot(input.dx, input.dy) || 1;
      const vx = (input.dx / len) * player.speed * dt / 1000;
      const vy = (input.dy / len) * player.speed * dt / 1000;
      const R = 12;
      // 軸ごとの衝突(壁ずり移動)
      if (vx && !solid(player.x + vx + Math.sign(vx) * R, player.y - R * 0.6) && !solid(player.x + vx + Math.sign(vx) * R, player.y + R * 0.6)) player.x += vx;
      if (vy && !solid(player.x - R * 0.6, player.y + vy + Math.sign(vy) * R) && !solid(player.x + R * 0.6, player.y + vy + Math.sign(vy) * R)) player.y += vy;
      if (vx || vy) { player.anim += dt; player.dir = Math.atan2(vy, vx); }
      // 敵との接触
      for (const e of enemies) {
        if (!e.alive) continue;
        e.ph += dt * 0.003;
        if (Math.hypot(player.x - e.px, player.y - e.py) < 26) onEncounter(e);
      }
    }

    function render(t) {
      const W = canvas.width / dpr, H = canvas.height / dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const camX = Math.max(0, Math.min(map.w * TILE - W, player.x - W / 2));
      const camY = Math.max(0, Math.min(map.h * TILE - H, player.y - H / 2));
      ctx.fillStyle = '#10142a'; ctx.fillRect(0, 0, W, H);
      const tx0 = Math.floor(camX / TILE), ty0 = Math.floor(camY / TILE);
      for (let ty = ty0; ty <= ty0 + Math.ceil(H / TILE); ty++) {
        for (let tx = tx0; tx <= tx0 + Math.ceil(W / TILE); tx++) {
          const c = tileAt(tx, ty);
          const x = tx * TILE - camX, y = ty * TILE - camY;
          if (c === '1') {
            ctx.fillStyle = '#0b0a18'; ctx.fillRect(x, y, TILE, TILE);
            ctx.fillStyle = 'rgba(127,227,255,0.06)'; ctx.fillRect(x + 3, y + 3, TILE - 6, 4);
          } else {
            ctx.fillStyle = ((tx + ty) % 2) ? '#1d2b45' : '#20304d';
            ctx.fillRect(x, y, TILE, TILE);
            if (c === '2') {
              ctx.fillStyle = `rgba(127,227,255,${0.15 + 0.1 * Math.sin(t * 0.003 + tx + ty)})`;
              ctx.beginPath(); ctx.arc(x + TILE / 2, y + TILE / 2, 6, 0, 7); ctx.fill();
            }
          }
        }
      }
      // 敵(ヨドミ: まるい目のもやもや)
      for (const e of enemies) {
        if (!e.alive) continue;
        const x = e.px - camX, y = e.py - camY + Math.sin(e.ph) * 4;
        ctx.fillStyle = 'rgba(90,70,140,0.9)';
        ctx.beginPath(); ctx.arc(x, y, 16, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(x - 10, y + 8, 8, 0, 7); ctx.arc(x + 10, y + 8, 8, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(x - 5, y - 2, 4.5, 0, 7); ctx.arc(x + 5, y - 2, 4.5, 0, 7); ctx.fill();
        ctx.fillStyle = '#141329';
        ctx.beginPath(); ctx.arc(x - 5 + Math.sin(t * 0.002) * 1.5, y - 2, 2, 0, 7); ctx.arc(x + 5 + Math.sin(t * 0.002) * 1.5, y - 2, 2, 0, 7); ctx.fill();
      }
      // 主人公(ランタンを持つ子)
      const px = player.x - camX, py = player.y - camY;
      ctx.fillStyle = 'rgba(127,227,255,0.12)';
      ctx.beginPath(); ctx.arc(px, py, 34 + Math.sin(t * 0.004) * 3, 0, 7); ctx.fill(); // 灯り
      ctx.fillStyle = '#e8c98a';
      ctx.beginPath(); ctx.arc(px, py - 4, 9, 0, 7); ctx.fill();               // 顔
      ctx.fillStyle = '#3a4a8c'; ctx.fillRect(px - 8, py + 2, 16, 12);          // 服
      ctx.fillStyle = '#141329';
      ctx.beginPath(); ctx.arc(px - 3, py - 5, 1.6, 0, 7); ctx.arc(px + 3, py - 5, 1.6, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffd166';
      ctx.beginPath(); ctx.arc(px + 11, py + 6, 3.5, 0, 7); ctx.fill();         // ランタン
    }

    return {
      update, render,
      pause() { paused = true; }, resume() { paused = false; },
      defeat(id) { const e = enemies.find((x) => x.id === id); if (e) e.alive = false; },
      pushBack() { player.x -= Math.cos(player.dir) * 40; player.y -= Math.sin(player.dir) * 40; },
      remainingEnemies() { return enemies.filter((e) => e.alive).length; },
    };
  };

  /* ---------------- Encounter: 出題フロー(教科非依存) ----------------
     コアは問題のpayloadを解釈しない。表示と正誤はSubjectModuleに委譲。
     流れ: 出題 → 回答 → 正解: SE+解説+報酬 / 不正解: ヒント1→再挑戦→ヒント2→再挑戦→答えと解説 */
  NS.Encounter = function (overlayEl) {
    function el(tag, cls, text) {
      const d = document.createElement(tag);
      if (cls) d.className = cls;
      if (text !== undefined) d.textContent = text;
      return d;
    }
    async function run(subject, problem) {
      return new Promise((resolve) => {
        overlayEl.innerHTML = '';
        overlayEl.classList.remove('hidden');
        const panel = el('div', 'enc-panel');
        overlayEl.appendChild(panel);
        const title = el('div', 'enc-title', 'ヨドミがあらわれた!');
        const qbox = el('div', 'enc-q');
        const msg = el('div', 'enc-msg');
        const widgetBox = el('div', 'enc-widget');
        panel.append(title, qbox, msg, widgetBox);
        qbox.textContent = problem.questionText;

        let wrongs = 0, hintsUsed = 0, locked = false;

        function finish(correct) {
          const btn = el('button', 'enc-btn', 'とじる');
          btn.addEventListener('click', () => { overlayEl.classList.add('hidden'); overlayEl.innerHTML = ''; resolve({ correct, hintsUsed }); });
          panel.appendChild(btn);
        }
        function showExplanation(prefix) {
          msg.textContent = `${prefix} ${problem.explanation || ''}`;
        }
        // 契約v1.1: onInfo=正誤に影響しない情報表示(反則手のギョクのセリフ等・ヒント消費なし)
        //           createWidgetの戻り値ハンドル reset()=再挑戦時に局面を出題時へ戻す
        const callbacks = {
          onAnswer(answer) {
            if (locked) return;
            const r = subject.judge(problem, answer);
            // p1-006: 判定ログ(問題ID / 実着手USI / 判定内訳 / 結果)
            if (window.Hakoniwa.log) window.Hakoniwa.log(`判定 ${problem.id}: 着手=${answer} ${r.detail || ''} → ${r.correct ? '正解' : '不正解'}`, r.correct ? 'ok' : 'warn');
            if (r.correct) {
              locked = true;
              window.Hakoniwa.Audio.seCorrect();
              title.textContent = 'せいかい! ひかりがもどった!';
              showExplanation('✨');
              finish(true);
            } else {
              wrongs++;
              window.Hakoniwa.Audio.seWrong();
              if (wrongs <= 2) {
                hintsUsed = wrongs;
                const hint = wrongs === 1 ? (problem.hint1 || 'もういちど かんがえてみよう') : (problem.hint2 || 'こたえは ちかいよ!');
                msg.textContent = `ギョク「${r.message || hint}」`;
                if (handle && handle.reset) handle.reset();   // 局面を戻して再挑戦
              } else {
                locked = true;
                title.textContent = 'ざんねん…でも だいじょうぶ!';
                showExplanation(`こたえ: ${subject.answerText(problem)}。`);
                finish(false);
              }
            }
          },
          onInfo(text) { if (!locked) msg.textContent = text; },
        };
        const handle = subject.createWidget(widgetBox, problem, callbacks);
      });
    }
    return { run };
  };
})();
